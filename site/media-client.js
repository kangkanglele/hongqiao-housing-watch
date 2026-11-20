/* Google Drive media client — draft, no live deployment.
 * Image/video binaries are chunked, never embedded in Google Sheets snapshots.
 */
(function(root){
'use strict';
const API='/.netlify/functions/hq-api',CHUNK=2*1024*1024;
const types=new Set(['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','video/webm']);
function validate(file){
 if(!file||!types.has(file.type))throw Error('请使用 JPG、PNG、WebP、MP4、MOV 或 WebM');
 if(!Number.isSafeInteger(file.size)||file.size<=0)throw Error('文件大小无效');
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
async function upload(token,file,listingKey,onProgress,options={}){
 validate(file);
 const start=()=>post(token,'mediaStart',{name:file.name,mimeType:file.type,size:file.size,listingKey});
 let uploadId=String(options.uploadId||'');
 let offset=Math.max(0,Number(options.offset)||0);
 let chunkSize=Math.max(262144,Number(options.chunkSize)||CHUNK);
 let restarted=false;
 if(!uploadId||offset>file.size){
   const session=await start();uploadId=session.uploadId;
   chunkSize=Number(session.chunkSize)||chunkSize;offset=0;
   await options.onSession?.({uploadId,offset,chunkSize,restarted:false});
 }else{
   await options.onSession?.({uploadId,offset,chunkSize,resumed:true});
 }
 while(offset<file.size){
   const length=Math.min(chunkSize,file.size-offset);
   const base64=await encodePart(file.slice(offset,offset+length));
   let part,attempt=0,resetSession=false;
   while(true){
     try{part=await post(token,'mediaPart',{uploadId,offset,base64});break;}
     catch(error){
       if(!restarted&&/上传会话已过期|上传会话无效/.test(error.message||'')){
         const session=await start();uploadId=session.uploadId;
         chunkSize=Number(session.chunkSize)||chunkSize;offset=0;restarted=true;
         await options.onSession?.({uploadId,offset,chunkSize,restarted:true});
         resetSession=true;break;
       }
       if(++attempt>=3)throw error;
       await new Promise(ok=>setTimeout(ok,attempt*750));
     }
   }
   if(resetSession)continue;
   if(!Number.isSafeInteger(part.next)||part.next<=offset)throw Error('云端未确认当前分块');
   offset=part.next;
   const progress={percent:Math.min(100,Math.round(offset/file.size*100)),loaded:offset,total:file.size,offset,uploadId};
   onProgress?.(progress);
   await options.onCheckpoint?.({uploadId,offset,chunkSize,total:file.size});
 }
 let finished,finishError;
 for(let attempt=0;attempt<3;attempt++){
   try{finished=await post(token,'mediaFinish',{uploadId});finishError=null;break;}
   catch(error){finishError=error;if(attempt<2)await new Promise(ok=>setTimeout(ok,(attempt+1)*750));}
 }
 if(finishError)throw finishError;
 if(!finished.file?.driveFileId)throw Error('上传完成但未拿到 Drive 文件 ID');
 return finished.file;
}
async function preview(file){
 if(!file.type.startsWith('image/'))return '';
 return new Promise(resolve=>{
   let url,img;
   try{url=URL.createObjectURL(file);img=new Image();}
   catch(_){if(url)URL.revokeObjectURL(url);resolve('');return;}
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
function exifDateToIso(raw){
 const m=String(raw||'').match(/^(\d{4})[:/-](\d{2})[:/-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
 if(!m)return null;
 const [y,mo,d,h,mi,s]=m.slice(1).map(Number);
 if(y<2000||y>2100||mo<1||mo>12||d<1||d>31||h>23||mi>59||s>59)return null;
 const result=new Date(y,mo-1,d,h,mi,s);
 if(result.getFullYear()!==y||result.getMonth()!==mo-1||result.getDate()!==d)return null;
 return result.toISOString();
}
function scanExifShotDate(buffer){
 const bytes=new Uint8Array(buffer),dv=new DataView(buffer);
 if(bytes[0]!==255||bytes[1]!==216)return null;
 for(let p=2;p+12<bytes.length;){
  if(bytes[p]!==255){p++;continue}
  const marker=bytes[p+1];if(marker===218||marker===217)break;
  const len=dv.getUint16(p+2,false);if(len<2||p+2+len>bytes.length)break;
  if(marker===225&&bytes[p+4]===69&&bytes[p+5]===120&&bytes[p+6]===105&&bytes[p+7]===102){
   const base=p+10;
   if(base+8>bytes.length)break;
   const little=bytes[base]===73&&bytes[base+1]===73;
   if(!little&&!(bytes[base]===77&&bytes[base+1]===77))break;
   const read16=o=>o+2<=bytes.length?dv.getUint16(o,little):0;
   const read32=o=>o+4<=bytes.length?dv.getUint32(o,little):0;
   const readAscii=(offset,size)=>{
    if(!size||size>128||offset<0||offset+size>bytes.length)return '';
    return String.fromCharCode(...bytes.slice(offset,offset+size)).replace(/\0.*$/,'').trim();
   };
   const walk=(offset,depth=0)=>{
    if(depth>2||offset+2>bytes.length)return null;
    const count=read16(offset);
    if(count>150)return null;
    let fallback=null,pointer=null;
    for(let i=0;i<count;i++){
     const at=offset+2+i*12;
     if(at+12>bytes.length)break;
     const tag=read16(at),type=read16(at+2),n=read32(at+4);
     const ptr=read32(at+8),dataAt=n<=4?at+8:base+ptr;
     if(tag===0x8769)pointer=base+ptr;
     if(type===2&&(tag===0x9003||tag===0x9004||tag===0x0132)){
      const parsed=exifDateToIso(readAscii(dataAt,n));
      if(parsed&&tag===0x9003)return {shotAt:parsed,shotSource:'EXIF DateTimeOriginal'};
      if(parsed&&!fallback)fallback={shotAt:parsed,shotSource:tag===0x0132?'EXIF DateTime':'EXIF DateTimeDigitized'};
     }
    }
    return pointer?walk(pointer,depth+1)||fallback:fallback;
   };
   return walk(base+read32(base+4));
  }
  p+=2+len;
 }
 return null;
}
function scanMovieCreationTime(buffer){
 const dv=new DataView(buffer),bytes=new Uint8Array(buffer);
 const str=p=>String.fromCharCode(...bytes.slice(p,p+4));
 const limits={min:946684800000,max:Date.now()+86400000};
 function scan(from,to,level){
  if(level>3)return null;
  for(let at=from;at+8<=to;){
   let size=dv.getUint32(at,false),head=8;
   const box=str(at+4);
   if(size===1){if(at+16>to)break;const hi=dv.getUint32(at+8,false),lo=dv.getUint32(at+12,false);size=hi*4294967296+lo;head=16;}
   if(size===0)size=to-at;
   if(!Number.isSafeInteger(size)||size<head||at+size>to)break;
   if(box==='mvhd'){
    const ver=bytes[at+head];
    const epoch=2082844800;
    let secs=0;
    if(ver===0&&at+head+8<=to)secs=dv.getUint32(at+head+4,false);
    else if(ver===1&&at+head+12<=to)secs=dv.getUint32(at+head+4,false)*4294967296+dv.getUint32(at+head+8,false);
    const millis=(secs-epoch)*1000;
    if(millis>=limits.min&&millis<=limits.max)return {shotAt:new Date(millis).toISOString(),shotSource:'视频容器创建时间（需核验是否为拍摄时间）'};
   }
   if(['moov','udta','trak'].includes(box)){const nested=scan(at+head,at+size,level+1);if(nested)return nested;}
   at+=size;
  }
  return null;
 }
 return scan(0,bytes.length,0);
}
async function extractCapturedAt(file){
 if(!file||typeof file.slice!=='function')return null;
 try{
  const first=await file.slice(0,Math.min(file.size,4*1024*1024)).arrayBuffer();
  if(file.type==='image/jpeg')return scanExifShotDate(first);
  if(['video/mp4','video/quicktime'].includes(file.type)){
   const front=scanMovieCreationTime(first);
   if(front)return front;
   if(file.size>4*1024*1024){
    // Typical recording files carry moov at the end. The buffer uses local offsets.
    const tail=await file.slice(Math.max(0,file.size-4*1024*1024)).arrayBuffer();
    return scanMovieCreationTime(tail);
   }
  }
 }catch(_){}
 return null;
}
// iOS/WeChat private browsers can fail to structured-clone File/Blob into IndexedDB.
// Persist only small *metadata*; upload the original File directly while the picker still
// holds it in memory. Pending metadata is not a copy of the original media file.
const DB='hq-private-media-queue',STORE='media',FALLBACK='hq-private-media-queue-metadata-v2';
const memoryPending=new Map();
function safeRecord(item){
 const allow=['id','houseId','listingKey','name','size','mimeType','lastModified','previewData','shotAt','shotSource','at','uploadedFile','uploadId','offset','chunkSize','status'];
 const record={};
 for(const key of allow)if(item&&Object.prototype.hasOwnProperty.call(item,key))record[key]=item[key];
 if(!record.id||!record.houseId)throw Error('待上传记录不完整');
 // Legacy callers may pass a File, Blob, or nested object. Never place those in a store.
 if(record.uploadedFile){
   const file=record.uploadedFile;
   record.uploadedFile={driveFileId:String(file.driveFileId||''),driveUrl:String(file.driveUrl||''),
     name:String(file.name||''),mimeType:String(file.mimeType||''),size:Number(file.size)||0,
     listingKey:String(file.listingKey||'')};
   if(!record.uploadedFile.driveFileId)delete record.uploadedFile;
 }
 if(record.previewData&&String(record.previewData).length>7000)delete record.previewData;
 record.name=String(record.name||item.file?.name||'');
 record.size=Number(record.size||item.file?.size)||0;
 record.mimeType=String(record.mimeType||item.file?.type||'');
 record.lastModified=Number(record.lastModified||item.file?.lastModified)||0;
 record.updatedAt=new Date().toISOString();
 return record;
}
function database(){return new Promise((resolve,reject)=>{
 let req;
 try{req=indexedDB.open(DB,1);}catch(e){reject(e);return}
 req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'})};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('IndexedDB 无法打开'));
});}
async function transact(mode,fn){const db=await database();try{
 return await new Promise((resolve,reject)=>{
 let tx,request;
 try{tx=db.transaction(STORE,mode);request=fn(tx.objectStore(STORE));}
 catch(e){reject(e);return}
 request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||Error('浏览器无法保存待上传记录'));
 tx.onabort=()=>reject(tx.error||Error('IndexedDB 事务中断'));
 tx.onerror=()=>reject(tx.error||Error('IndexedDB 事务失败'));
 });
}finally{db.close()}}
function fallbackRecords(){
 try{const data=JSON.parse(localStorage.getItem(FALLBACK)||'[]');return Array.isArray(data)?data:[];}catch(_){return []}
}
function saveFallback(record){
 memoryPending.set(record.id,record);
 try{
   const records=fallbackRecords().filter(x=>x.id!==record.id);
   records.push(record);
   localStorage.setItem(FALLBACK,JSON.stringify(records));
   return {persisted:true,store:'localStorage'};
 }catch(_){return {persisted:false,store:'memory'};}
}
async function enqueue(item){
 const record=safeRecord(item);
 memoryPending.set(record.id,record);
 try{
   await transact('readwrite',store=>store.put(record));
   try{
     const older=fallbackRecords().filter(x=>x.id!==record.id);
     localStorage.setItem(FALLBACK,JSON.stringify(older));
   }catch(_){}
   return {persisted:true,store:'indexedDB'};
 }catch(_){
   return saveFallback(record);
 }
}
async function remove(id){
 memoryPending.delete(id);
 try{await transact('readwrite',store=>store.delete(id));}catch(_){}
 try{localStorage.setItem(FALLBACK,JSON.stringify(fallbackRecords().filter(x=>x.id!==id)));}catch(_){}
}
async function pending(){
 let fromIDB=[];
 try{fromIDB=await transact('readonly',store=>store.getAll())||[];}catch(_){}
 const merged=new Map();
 for(const record of [...fromIDB,...fallbackRecords(),...memoryPending.values()]){
   if(!record?.id)continue;
   const prev=merged.get(record.id);
   const stamp=Date.parse(record.updatedAt||record.at||'')||0;
   const prevStamp=Date.parse(prev?.updatedAt||prev?.at||'')||0;
   if(!prev||stamp>=prevStamp)merged.set(record.id,record);
 }
 return [...merged.values()];
}
root.HQMedia={post,upload,preview,validate,extractCapturedAt,enqueue,remove,pending,CHUNK};
})(window);
