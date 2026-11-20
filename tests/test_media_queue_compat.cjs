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
  file:blob,previewData:'data:image/jpeg;base64,AAA',uploadId:'drive-session-1234567890',offset:524288,chunkSize:2*1024*1024,at:'2026-11-20T03:00:00Z'};
 const normal=setup();
 const first=await normal.api.enqueue(record);
 assert.equal(first.persisted,true);
 assert.equal(first.store,'indexedDB');
 assert.equal(normal.putRecords.length,1);
 assert.equal(normal.putRecords[0].name,'sample.jpg');
 assert.equal(normal.putRecords[0].size,blob.size);
 assert.equal(normal.putRecords[0].mimeType,'image/jpeg');
 assert.equal(normal.putRecords[0].uploadId,'drive-session-1234567890');
 assert.equal(normal.putRecords[0].offset,524288);
 assert.equal(normal.putRecords[0].chunkSize,2*1024*1024);
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
 assert.ok(h5.includes('const MEDIA_CONCURRENCY=2;'),'mobile upload queue must cap concurrency at two files');
 assert.ok(h5.includes('function pumpMediaQueue()'),'uploads must continue independently of the detail drawer');
 assert.ok(h5.includes('data-media-task-action="retryAll"'),'failed files must have a retry-all action');
 assert.ok(h5.includes('总体进度'),'the global upload dock must show overall progress');
 assert.ok(h5.includes('id="topbarUploadSlot" hidden'),'header must reserve a right-side slot for upload progress');
 assert.ok(h5.includes("const slot=document.getElementById('topbarUploadSlot')"),'upload dock must mount into the header slot');
 assert.ok(h5.includes('if(dock.parentElement!==parent)parent.appendChild(dock)'),'upload dock must be moved into the header, not remain fixed over page content');
 assert.ok(h5.includes('#hqUploadDock{position:relative;z-index:52;'),'upload progress must sit inline in the header');
 assert.ok(h5.includes('position:absolute;top:calc(100% + 8px);right:0;'),'expanded upload details must float below the header slot');
 assert.ok(h5.includes('let mediaRunning=0,mediaDockCollapsed=true;'),'the top upload dock must start in compact progress-only mode');
 assert.ok(h5.includes('bh-search-toggle'),'search control must be widened without removing its existing search action');
 assert.ok(h5.includes('topbarUploadSlot') && h5.includes('slot.hidden=!tasks.length'),'empty header progress slot must stay hidden');
 assert.ok(h5.includes('hq-media-locked'),'read-only preview must explain why upload controls are unavailable');
 assert.ok(h5.includes('data-ui="goSettings"'),'locked upload prompt must navigate to PIN unlock');
 assert.ok(h5.includes('/buyhouse-v08.css?v=20261120-header-upload-fab-v2'),'header layout CSS must be cache-busted in preview');
 assert.ok(h5.includes('height:100%;max-width:540px;'),'expanded upload details must anchor below the full header height');
 const css=fs.readFileSync(path.join(__dirname,'../site/buyhouse-v08.css'),'utf8');
 assert.ok(css.includes('#navDrawer[data-open="true"]'),'drawer open state must explicitly anchor the panel to the left');
 assert.ok(css.includes('inset:0 auto 0 0!important'),'drawer must be anchored to left rather than right');
 assert.ok(css.includes('background:var(--bh-bg)!important'),'top bar should no longer have a separate white background');
 assert.ok(css.includes('width:112px!important'),'search control should be widened');
 assert.ok(css.includes('top:calc(76px + env(safe-area-inset-top))!important'),'new listing action should float at upper right');
 assert.ok(h5.includes('await uploadPendingMedia(task.item,progress=>'),'queue worker must upload the original File independently of the drawer');
 assert.ok(h5.includes('重新选择同一文件'),'media UI must tell user when original File needs reselecting');
 assert.ok(h5.includes('刷新或关闭网页后，可重新选择原文件从已确认分块继续'),'the UI must accurately explain resume after page reload');
 console.log('PASS mobile media outbox: metadata-only resumable checkpoints, no Blob/File IndexedDB writes, fallbacks, multi-upload dock and retry actions');
})().catch(error=>{console.error(error);process.exitCode=1});
