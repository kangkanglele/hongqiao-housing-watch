/* Google Drive media client — draft, no live deployment.
 * Image/video binaries are chunked, never embedded in Google Sheets snapshots.
 */
(function(root){
'use strict';
const API='/.netlify/functions/hq-api',CHUNK=512*1024,MAX=120*1024*1024;
const types=new Set(['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']);
function validate(file){
 if(!file||!types.has(file.type))throw Error('请使用 JPG、PNG、WebP、MP4、MOV 或 WebM');
 if(!file.size||file.size>MAX)throw Error('单个文件不能超过120MB');
}
async function post(token,action,payload={}){
 if(!token)throw Error('请先输入 PIN 解锁云端');
 const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},
  body:JSON.stringify({action,...payload})});
 let answer;try{answer=await r.json();}catch(_){throw Error('媒体接口没有返回合法 JSON');}
 if(!r.ok||!answer?.ok)throw Error(answer?.error||('媒体请求失败 HTTP '+r.status));
 return answer;
}
async function encodePart(blob){
 const bytes=new Uint8Array(await blob.arrayBuffer());let raw='';
 for(let i=0;i<bytes.length;i+=16384)raw+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(raw);
}
async function upload(token,file,listingKey,onProgress){
 validate(file);
 const session=await post(token,'mediaStart',{name:file.name,mimeType:file.type,size:file.size,listingKey});
 let offset=0;
 while(offset<file.size){
   const length=Math.min(CHUNK,file.size-offset);
   const base64=await encodePart(file.slice(offset,offset+length));
   let part,attempt=0;
   while(true){
     try{part=await post(token,'mediaPart',{uploadId:session.uploadId,offset,base64});break;}
     catch(error){if(++attempt>=3)throw error;await new Promise(ok=>setTimeout(ok,attempt*750));}
   }
   if(!Number.isSafeInteger(part.next)||part.next<=offset)throw Error('云端未确认当前分块');
   offset=part.next;
   onProgress?.(Math.min(100,Math.round(offset/file.size*100)));
 }
 const finished=await post(token,'mediaFinish',{uploadId:session.uploadId});
 if(!finished.file?.driveFileId)throw Error('上传完成但未拿到 Drive 文件 ID');
 return finished.file;
}
async function preview(file){
 if(!file.type.startsWith('image/'))return '';
 return new Promise(resolve=>{
   const url=URL.createObjectURL(file),img=new Image();
   img.onload=()=>{
     try{
       const size=120,scale=Math.min(1,size/Math.max(img.naturalWidth,img.naturalHeight));
       const canvas=document.createElement('canvas');
       canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
       canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
       canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
       let data='';
       for(const quality of [.28,.2,.12]){
         data=canvas.toDataURL('image/jpeg',quality);
         if(data.length<=7000)break;
       }
       resolve(data.length<=7000?data:'');
     }catch(_){resolve('');}
     URL.revokeObjectURL(url);
   };
   img.onerror=()=>{URL.revokeObjectURL(url);resolve('')};
   img.src=url;
 });
}
// Files survive a reload in IndexedDB while awaiting upload. Do not persist video
// base64 in localStorage, Chrome extension settings, or a JSON snapshot.
const DB='hq-private-media-queue',STORE='media';
function database(){return new Promise((resolve,reject)=>{
 const req=indexedDB.open(DB,1);
 req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'})};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});}
async function transact(mode,fn){const db=await database();try{
 return await new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,mode),request=fn(tx.objectStore(STORE));
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 tx.onerror=()=>reject(tx.error);
 });
}finally{db.close()}}
const enqueue=record=>transact('readwrite',store=>store.put(record));
const remove=id=>transact('readwrite',store=>store.delete(id));
const pending=()=>transact('readonly',store=>store.getAll());
root.HQMedia={post,upload,preview,validate,enqueue,remove,pending,MAX,CHUNK};
})(window);
