'use strict';
/* Regression for WeChat/iOS/private-window "Error preparing Blob/File data to be
 * stored in object store". Never persist File/Blob; accept missing IndexedDB. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../site/media-client.js'),'utf8');

function setup({idbWorks=true,localWorks=true}={}){
 const stored=new Map(),webStorage=new Map(),putRecords=[];
 const localStorage={
  getItem:k=>{if(!localWorks)throw Error('Storage unavailable');return webStorage.get(k)||null},
  setItem:(k,v)=>{if(!localWorks)throw Error('Storage unavailable');webStorage.set(k,String(v))}
 };
 const fakeIDB={
  open:()=>{
   if(!idbWorks)throw new Error('IndexedDB not available');
   const request={result:null};
   const db={
    objectStoreNames:{contains:()=>true},
    transaction:()=>({
     objectStore:()=>({
      put:record=>{
       assert.equal(Object.prototype.hasOwnProperty.call(record,'file'),false,'do not persist binary File');
       assert.equal(Object.prototype.hasOwnProperty.call(record,'blob'),false,'do not persist binary Blob');
       assert.ok(!Object.values(record).some(v=>v instanceof Blob),'no nested Blob stored in IndexedDB');
       putRecords.push(record);
       return nextRequest(()=>{stored.set(record.id,record);return record.id});
      },
      getAll:()=>nextRequest(()=>[...stored.values()]),
      delete:id=>nextRequest(()=>{stored.delete(id);return undefined})
     })
    }),
    close:()=>{}
   };
   function nextRequest(fn){
    const req={};
    queueMicrotask(()=>{req.result=fn();req.onsuccess?.();});
    return req;
   }
   queueMicrotask(()=>{request.result=db;request.onsuccess?.()});
   return request;
  }
 };
 const ctx={window:{},Blob,Uint8Array,DataView,Promise,Map,Set,Number,String,Date,Math,
  indexedDB:fakeIDB,localStorage,queueMicrotask};
 vm.runInNewContext(src,ctx,{filename:'site/media-client.js'});
 return {api:ctx.window.HQMedia,putRecords,webStorage,stored};
}
(async()=>{
 const blob=new Blob([Buffer.from('sample-raw-file')],{type:'image/jpeg'});
 blob.name='sample.jpg';blob.lastModified=1763553600000;
 const record={id:'q1',houseId:'TJ-HQ-0005',listingKey:'house:TJ-HQ-0005',
  file:blob,previewData:'data:image/jpeg;base64,AAA',at:'2026-11-20T03:00:00Z'};
 const normal=setup();
 const first=await normal.api.enqueue(record);
 assert.equal(first.persisted,true);
 assert.equal(first.store,'indexedDB');
 assert.equal(normal.putRecords.length,1);
 assert.equal(normal.putRecords[0].name,'sample.jpg');
 assert.equal(normal.putRecords[0].size,blob.size);
 assert.equal(normal.putRecords[0].mimeType,'image/jpeg');
 const saved=await normal.api.pending();
 assert.equal(saved.length,1);
 assert.equal(saved[0].file,undefined,'page reload requires user to reselect original file');
 await normal.api.enqueue({...record,uploadedFile:{
  driveFileId:'real-drive-file-id',driveUrl:'https://drive.google.com/file/d/real-drive-file-id/view',
  name:blob.name,mimeType:blob.type,size:blob.size}});
 assert.equal((await normal.api.pending())[0].uploadedFile.driveFileId,'real-drive-file-id');
 await normal.api.remove('q1');
 assert.equal((await normal.api.pending()).length,0);

 const privateBrowser=setup({idbWorks:false});
 const fallback=await privateBrowser.api.enqueue(record);
 assert.equal(fallback.persisted,true);
 assert.equal(fallback.store,'localStorage');
 const cached=JSON.parse(privateBrowser.webStorage.get('hq-private-media-queue-metadata-v2'));
 assert.equal(cached[0].file,undefined);
 assert.equal(cached[0].name,'sample.jpg');
 assert.equal((await privateBrowser.api.pending()).length,1);

 const noStorage=setup({idbWorks:false,localWorks:false});
 const volatile=await noStorage.api.enqueue(record);
 assert.equal(volatile.persisted,false);
 assert.equal(volatile.store,'memory');
 assert.equal((await noStorage.api.pending()).length,1);
 await noStorage.api.remove('q1');
 assert.equal((await noStorage.api.pending()).length,0);

 const h5=fs.readFileSync(path.join(__dirname,'../site/index.html'),'utf8');
 assert.ok(h5.includes("await uploadPendingMedia(item)"),'direct upload must continue after enqueue');
 assert.ok(h5.includes("请重新选择"),'media UI must tell user when original File needs reselecting');
 assert.ok(h5.includes("不能自动恢复尚未上传的原文件"),'the UI must not promise persistence of File/Blob');
 console.log('PASS mobile media outbox: no Blob/File IndexedDB writes, direct upload, localStorage and memory fallbacks, explicit reselect');
})().catch(error=>{console.error(error);process.exitCode=1});
