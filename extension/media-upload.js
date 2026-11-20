/* Chrome MV3 media uploader. No scraping, no crawler and no credentials in source. */
'use strict';
self.HQMediaExtension=(()=>{
 const API='https://hongqiao-housing-watch.netlify.app/.netlify/functions/hq-api';
 const CHUNK=512*1024;
 const validUrl=value=>{
  let url;try{url=new URL(value)}catch(_){throw Error('图片地址无效')}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=='https:'||!/(^|\.)(ljcdn\.com|ke\.com|lianjia\.com|5i5j\.com)$/.test(host))throw Error('图片不属于允许的官方网站 CDN');
  return url.toString();
 };
 async function post(session,action,data={}){
  const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+session},
   body:JSON.stringify({action,...data})});
  let json;try{json=await r.json()}catch(_){throw Error('服务器响应无法解析')}
  if(r.status===401)throw Error('PIN 会话已失效，请重新连接');
  if(!r.ok||!json?.ok)throw Error(json?.error||'云端媒体同步失败');
  return json;
 }
 async function base64(blob){
  const a=new Uint8Array(await blob.arrayBuffer());let raw='';
  for(let i=0;i<a.length;i+=16384)raw+=String.fromCharCode(...a.subarray(i,i+16384));
  return btoa(raw);
 }
 async function preview(blob){
  try{
   if(typeof createImageBitmap!=='function'||typeof OffscreenCanvas!=='function')return '';
   const bitmap=await createImageBitmap(blob);
   const scale=Math.min(1,120/Math.max(bitmap.width,bitmap.height));
   const c=new OffscreenCanvas(Math.max(1,Math.round(bitmap.width*scale)),Math.max(1,Math.round(bitmap.height*scale)));
   c.getContext('2d').drawImage(bitmap,0,0,c.width,c.height);
   bitmap.close();
   const thumb=await c.convertToBlob({type:'image/jpeg',quality:.24});
   const data='data:image/jpeg;base64,'+await base64(thumb);
   return data.length<=7000?data:'';
  }catch(_){return ''}
 }
 async function upload(item,session,onProgress){
  const url=validUrl(item.imageUrl);
  const resp=await fetch(url,{credentials:'include',redirect:'follow'});
  if(!resp.ok)throw Error('官网图片暂时不能下载 HTTP '+resp.status);
  const mime=(resp.headers.get('content-type')||'').split(';')[0].toLowerCase().replace('image/jpg','image/jpeg');
  if(!['image/jpeg','image/png','image/webp'].includes(mime))throw Error('网站当前图片格式不支持 '+mime);
  const blob=await resp.blob();
  if(!Number.isSafeInteger(blob.size)||blob.size<=0)throw Error('官网图片文件大小无效');
  const name='listing-'+String(item.platformId||'').replace(/[^0-9]/g,'')+'-'+String(item.index+1)+'.'+(mime==='image/png'?'png':mime==='image/webp'?'webp':'jpg');
  const previewData=await preview(blob);
  const start=await post(session,'mediaStart',{name,mimeType:mime,size:blob.size,listingKey:item.listingKey});
  let offset=0;
  while(offset<blob.size){
   const length=Math.min(CHUNK,blob.size-offset);
   const data=await base64(blob.slice(offset,offset+length));
   let part,attempt=0;
   while(true){
    try{part=await post(session,'mediaPart',{uploadId:start.uploadId,offset,base64:data});break;}
    catch(error){if(++attempt>=3)throw error;await new Promise(resolve=>setTimeout(resolve,attempt*750));}
   }
   if(!Number.isSafeInteger(part.next)||part.next<=offset)throw Error('图片上传未被 Drive 确认');
   offset=part.next;
   onProgress?.(Math.round(offset/blob.size*100));
  }
  const finish=await post(session,'mediaFinish',{uploadId:start.uploadId});
  if(!finish.file?.driveFileId)throw Error('Drive 尚未返回图片文件编号');
  return {...finish.file,source:'网站照片',sourceUrl:item.imageUrl,previewData};
 }
 async function attach(item,session,file){
  return post(session,'mediaAttach',{houseId:item.houseId,media:file});
 }
 return {upload,attach,validUrl,post};
})();
