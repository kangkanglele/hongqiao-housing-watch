const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
let data={},listeners={},alarms=new Map(),apiCalls=[],overlayMessages=[],remoteOnline=true,badge='';
const event=()=>({addListener(fn){this.fn=fn}});
const chrome={
 storage:{
  local:{
   async get(keys){return Object.fromEntries(keys.map(key=>[key,data[key]]))},
   async set(values){
    const old={...data};Object.assign(data,values);
    if(listeners.changed){const changes={};for(const key of Object.keys(values))changes[key]={oldValue:old[key],newValue:data[key]};listeners.changed(changes,'local')}
   },
   async remove(key){delete data[key]}
  },
  onChanged:{addListener(fn){listeners.changed=fn}}
 },
 alarms:{create:async(name,options)=>alarms.set(name,options),clear:async name=>alarms.delete(name),onAlarm:event()},
 action:{
  setBadgeText:async value=>{badge=value.text},
  setBadgeBackgroundColor:async()=>{},
  setTitle:async()=>{}
 },
 scripting:{
  executeScript:async options=>{
   if(options.files?.includes('extract.js'))return [{result:{platform:'贝壳',platformId:'101126703003',url:'https://m.ke.com/tj/ershoufang/101126703003.html',community:'水木天成碧杉园',area:71.31,price:56,title:'南向一居'}}];
   return [];
  }
 },
 tabs:{
  query:async()=>[{id:44,url:'https://m.ke.com/tj/ershoufang/101126703003.html'}],
  sendMessage:async(tabId,message)=>{overlayMessages.push({tabId,message});return true}
 },
 runtime:{onMessage:event(),onStartup:event(),onInstalled:event()}
};
const fetch=async(url,options)=>{
 const body=JSON.parse(options.body);apiCalls.push(body);
 if(!remoteOnline)throw Error('离线');
 if(body.action==='login')return {ok:true,status:200,json:async()=>({ok:true,session:'testsession'})};
 if(body.action==='capture')return {ok:true,status:200,json:async()=>({ok:true,platformKey:'ke:101126703003',status:'created',houseId:'TJ-HQ-0001'})};
 throw Error('unexpected action '+body.action);
};
const context={chrome,fetch,Date,Set,Array,Promise,console,Error,JSON,Math,String,Number};
context.self=context;
context.importScripts=(...files)=>{for(const file of files)vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../extension',file),'utf8'),context)};
vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../extension/background.js'),'utf8'),context);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function send(type,rest={}){return new Promise(resolve=>chrome.runtime.onMessage.fn({type,...rest},{},resolve))}
(async()=>{
 const captured=await send('CAPTURE_ACTIVE');
 assert.equal(captured.ok,true);
 assert.equal((data.queue||[]).length,1);
 assert.equal(data.queue[0].visitStatus,'未看');
 assert.equal(data.queue[0].visitStatusExplicit,false);
 assert.equal(data.syncPhase,'auth_required');
 assert.equal(apiCalls.length,0,'without PIN the listing must remain local');
 assert.ok(overlayMessages.some(x=>x.message.type==='HQ_SYNC_PROGRESS'),'page floating status should be updated');

 const auth=await send('AUTH',{pin:'1234'});
 assert.equal(auth.ok,true);
 await sleep(20);
 assert.equal((data.queue||[]).length,0);
 assert.ok(data.lastSyncedAt);
 assert.equal(data.syncPhase,'synced');
 assert.equal(apiCalls.filter(x=>x.action==='capture').length,1);
 assert.ok(!alarms.size);

 remoteOnline=false;
 await send('CAPTURE_ACTIVE',{visitStatus:'看房',visitStatusExplicit:true});
 await sleep(20);
 assert.equal(data.queue[0].visitStatus,'看房');
 assert.equal(data.queue[0].visitStatusExplicit,true);
 assert.equal((data.queue||[]).length,1);
 assert.equal(data.syncPhase,'offline');
 assert.ok(alarms.has('hq_failed_sync_retry'));

 remoteOnline=true;
 await send('WAKE_SYNC');
 await sleep(20);
 assert.equal((data.queue||[]).length,0);
 assert.equal(data.syncPhase,'synced');
 assert.equal(alarms.size,0);
 assert.ok(apiCalls.some(x=>x.action==='capture'&&x.record.visitStatus==='看房'&&x.record.visitStatusExplicit));
 
 const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../extension/manifest.json'),'utf8'));
 assert.equal(manifest.action.default_popup,'popup.html','toolbar click must open a visible popup');
 const popup=fs.readFileSync(path.resolve(__dirname,'../extension/popup.html'),'utf8');
 assert.ok(popup.includes('id="statusCard"')&&popup.includes('id="pin"')&&popup.includes('id="retry"'));
 assert.ok(popup.includes('id="visitStatus"')&&popup.includes('采集并加入房源'),'popup must allow selecting the visit status before capture');
 const overlay=fs.readFileSync(path.resolve(__dirname,'../extension/status-overlay.js'),'utf8');
 assert.ok(overlay.includes('HQ_SYNC_PROGRESS')&&overlay.includes('position:fixed'));
 console.log('PASS extension: popup UI, click-to-capture, PIN login, floating page status, local queue, offline retry and cloud sync');
})().catch(error=>{console.error(error);process.exit(1)});
