'use strict';
/* Offline draft checks. Never calls Google, Netlify or listing sites. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const run=(p,ctx)=>vm.runInNewContext(read(p),ctx,{filename:p});
function page(host){
 const image={naturalWidth:900,naturalHeight:700,
  getAttribute:k=>k==='src'?'https://image1.ljcdn.com/real-estate/room.jpg':null,
  closest:()=>null};
 const doc={
  title:'水木天成翠杨园 二室一厅',
  body:{innerText:'水木天成翠杨园 挂牌价：58万 建筑面积52㎡ 2室1厅'},
  querySelector:s=>s==='h1'?{innerText:'水木天成翠杨园'}:null,
  querySelectorAll:s=>s.includes('img')&&s.includes('gallery')?[image]:[]
 };
 const ctx={document:doc,location:{href:'https://'+host+'/ershoufang/12345678.html'},URL};
 return run('extension/extract.js',ctx);
}
for(const [host,expected] of [
 ['tj.ke.com','贝壳'],['tj.lianjia.com','链家'],['tj.5i5j.com','我爱我家']]){
 const out=page(host);
 assert.equal(out.platform,expected);
 assert.equal(out.community,'水木天成翠杨园');
 assert.equal(out.price,58);
 assert.deepEqual(Array.from(out.images),['https://image1.ljcdn.com/real-estate/room.jpg']);
}
const html=read('site/index.html');
const inline=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
new vm.Script(inline,{filename:'site inline'});
for(const p of ['site/media-client.js','extension/media-upload.js','extension/background.js','extension/popup.js']){
 new vm.Script(read(p),{filename:p});
}
const generated=[];
const context={
 Blob,Uint8Array,Buffer,Math,Date,Promise,URL,setTimeout,clearTimeout,
 btoa:s=>Buffer.from(s,'binary').toString('base64'),
 window:{},fetch:async(_url,options)=>{
   const data=JSON.parse(options.body);
   generated.push(data);
   let result={ok:true};
   if(data.action==='mediaStart')result={ok:true,uploadId:'test-media-upload',chunkSize:512*1024};
   if(data.action==='mediaPart')result={ok:true,next:data.offset+Buffer.from(data.base64,'base64').length};
   if(data.action==='mediaFinish')result={ok:true,file:{
    driveFileId:'draft-file-id-123456',name:'livingroom.jpg',mimeType:'image/jpeg',size:600000
   }};
   return {ok:true,status:200,json:async()=>result};
 }
};
run('site/media-client.js',context);
(async()=>{
 // The H5 media client must accept metadata for a file larger than the former 120 MiB app cap.
 assert.doesNotThrow(()=>context.window.HQMedia.validate({type:'video/mp4',size:130*1024*1024}));
 const appScript=read('apps-script/Code.gs.example');
 assert.ok(!appScript.includes('MEDIA_LIMIT_BYTES_')&&!appScript.includes('120MB'),'Apps Script must not enforce an app-level media cap');
 const h5Source=read('site/index.html');
 assert.ok(!h5Source.includes('12*1024*1024'),'legacy image thumbnail inputs must not retain a per-file cap');
 const file=new Blob([Buffer.alloc(600000,3)],{type:'image/jpeg'});
 file.name='livingroom.jpg';
 const saved=await context.window.HQMedia.upload('fake-session',file,'house:TJ-HQ-0001');
 assert.equal(saved.driveFileId,'draft-file-id-123456');
 assert.equal(generated.filter(x=>x.action==='mediaPart').length,2);
 assert.ok(generated.every(x=>x.action!=='mediaPart'||x.base64.length<800000));

 // Chrome listing-photo archiver: verify a single source image larger than the old 8 MiB cap is chunked.
 const extensionParts=[];
 const largeImage=new Blob([Buffer.alloc(8*1024*1024+1,7)],{type:'image/jpeg'});
 const extensionContext={
  self:{},URL,Blob,Uint8Array,Buffer,Promise,Math,String,Number,Error,
  btoa:s=>Buffer.from(s,'binary').toString('base64'),
  fetch:async(url,options={})=>{
   if(String(url).startsWith('https://image1.ljcdn.com/')){
    return {ok:true,status:200,headers:{get:()=> 'image/jpeg'},blob:async()=>largeImage};
   }
   const payload=JSON.parse(options.body);extensionParts.push(payload);
   let result={ok:true};
   if(payload.action==='mediaStart')result={ok:true,uploadId:'extension-large-image',chunkSize:512*1024};
   if(payload.action==='mediaPart')result={ok:true,next:payload.offset+Buffer.from(payload.base64,'base64').length};
   if(payload.action==='mediaFinish')result={ok:true,file:{driveFileId:'large-image-drive-id',name:'listing-12345678-1.jpg',mimeType:'image/jpeg',size:largeImage.size}};
   return {ok:true,status:200,json:async()=>result};
  }
 };
 run('extension/media-upload.js',extensionContext);
 const archived=await extensionContext.self.HQMediaExtension.upload(
  {imageUrl:'https://image1.ljcdn.com/real-estate/large.jpg',platformId:'12345678',index:0,listingKey:'ke:12345678'},
  'fake-extension-session'
 );
 assert.equal(archived.driveFileId,'large-image-drive-id');
 assert.equal(archived.size,8*1024*1024+1);
 assert.equal(extensionParts.filter(x=>x.action==='mediaPart').length,17,'large listing image should be uploaded in 512 KiB chunks');
 assert.ok(!read('extension/media-upload.js').includes('8MB'));

 console.log('Media draft offline checks: PASS');
})().catch(e=>{console.error(e);process.exitCode=1});
