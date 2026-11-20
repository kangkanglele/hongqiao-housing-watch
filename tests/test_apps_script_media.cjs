'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs.example'),'utf8');
const crypto=require('node:crypto');
const props=new Map(),cache=new Map(),folders=new Map(),driveRequests=[];
let folderId=0,uuid=0,putCount=0;
function makeFolder(name){
 const id='test-folder-'+(++folderId),children=[];
 const folder={
  getId:()=>id,getName:()=>name,
  getFoldersByName:n=>{const hits=children.filter(x=>x.getName()===n);let i=0;return {hasNext:()=>i<hits.length,next:()=>hits[i++]}},
  createFolder:n=>{const f=makeFolder(n);children.push(f);return f}
 };
 folders.set(id,folder);return folder;
}
const rootFolder=makeFolder('root');
const context={
 console,Logger:{log:()=>{}},
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,String(v))})},
 LockService:{getScriptLock:()=>({waitLock:()=>{},releaseLock:()=>{}})},
 CacheService:{getScriptCache:()=>({get:k=>cache.get(k)||null,put:(k,v)=>cache.set(k,String(v))})},
 DriveApp:{createFolder:n=>{const f=makeFolder(n);rootFolder.createFolder(n);return f},getFolderById:id=>folders.get(id)||rootFolder},
 ScriptApp:{getOAuthToken:()=>'test-oauth-token'},
 Utilities:{getUuid:()=>('12345678-1234-4abc-8def-'+String(++uuid).padStart(12,'0')),base64Decode:s=>Buffer.from(s,'base64'),computeDigest:(_algo,s)=>Array.from(crypto.createHash('sha256').update(String(s),'utf8').digest()),DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'}},
 UrlFetchApp:{fetch:(url,options)=>{
  driveRequests.push({url,method:options.method,headers:options.headers,payload:options.payload});
  if(options.method==='post')return {getResponseCode:()=>200,getAllHeaders:()=>({Location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=test-resumable'}),getContentText:()=>''};
  const range=String(options.headers['Content-Range']||'');
  const m=range.match(/^bytes (\d+)-(\d+)\/(\d+)$/);assert.ok(m,'Drive chunk must use Content-Range');
  const start=Number(m[1]),end=Number(m[2]),total=Number(m[3]);
  putCount++;
  if(end+1<total)return {getResponseCode:()=>308,getAllHeaders:()=>({Range:'bytes=0-'+end}),getContentText:()=>''};
  return {getResponseCode:()=>200,getAllHeaders:()=>({}),getContentText:()=>JSON.stringify({id:'drive-file-'+putCount,name:'test-video.mp4',mimeType:'video/mp4',size:total})};
 }}
};
vm.createContext(context);
vm.runInContext(code,context,{filename:'Code.gs.example'});
const start=context.mediaStart_,part=context.mediaPart_,finish=context.mediaFinish_;
(async()=>{
 const large=start({mimeType:'video/mp4',size:130*1024*1024,name:'over-120mb.mp4',listingKey:'ke:12345678'});
 assert.ok(large.uploadId,'130 MiB file must be accepted at mediaStart');
 assert.equal(large.chunkSize,2*1024*1024);
 assert.equal(props.get('MEDIA_ROOT_FOLDER_ID')!==undefined,true,'Drive root folder ID should be persisted');
 const size=512*1024+1;
 const session=start({mimeType:'video/mp4',size,name:'test-video.mp4',listingKey:'ke:12345678'});
 const firstBase64=Buffer.alloc(512*1024,1).toString('base64');
 const first=await part({uploadId:session.uploadId,offset:0,base64:firstBase64});
 assert.equal(first.next,512*1024,'first 512 KiB chunk should be acknowledged');
 const requestCountAfterFirst=driveRequests.filter(x=>x.method==='put').length;
 const retry=await part({uploadId:session.uploadId,offset:0,base64:firstBase64});
 assert.equal(retry.duplicate,true,'same last chunk retry must be idempotent');
 assert.equal(retry.next,512*1024,'duplicate retry must return the acknowledged offset');
 assert.equal(driveRequests.filter(x=>x.method==='put').length,requestCountAfterFirst,'duplicate retry must not upload the same bytes twice');
 assert.throws(()=>part({uploadId:session.uploadId,offset:0,base64:Buffer.alloc(512*1024,2).toString('base64')}),/上传块顺序不正确/,'different payload at an old offset must be rejected');
 const last=await part({uploadId:session.uploadId,offset:512*1024,base64:Buffer.from([9]).toString('base64')});
 assert.equal(last.finished,true,'final chunk should finish the Drive upload');
 const result=finish({uploadId:session.uploadId});
 assert.equal(result.file.driveFileId,'drive-file-2');
 assert.equal(result.file.size,size);
 assert.equal(driveRequests.filter(x=>x.method==='put').length,2);
 assert.equal(driveRequests[2].headers['Content-Range'],'bytes 0-524287/524289');
 assert.equal(driveRequests[3].headers['Content-Range'],'bytes 524288-524288/524289');
 assert.ok(!code.includes('MEDIA_LIMIT_BYTES_')&&!code.includes('120MB'),'Apps Script must not contain an app-level file size cap');
 console.log('PASS Apps Script Drive media: >120 MiB metadata, private resumable session, 2 MiB chunk support, finalization and idempotent retry');
})().catch(e=>{console.error(e);process.exitCode=1});
