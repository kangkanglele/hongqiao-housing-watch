const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let data={},listeners={},openedOptions=0,alarms=new Map(),apiCalls=[],remoteOnline=true,badge='';
const testPin=String(1000+Math.floor(Math.random()*9000));
const event=()=>({addListener(fn){this.fn=fn}});
const chrome={
 storage:{local:{async get(keys){return Object.fromEntries(keys.map(k=>[k,data[k]]))},async set(o){const old={...data};Object.assign(data,o);if(listeners.changed){let changes={};for(const k of Object.keys(o))changes[k]={oldValue:old[k],newValue:data[k]};listeners.changed(changes,'local')}} ,async remove(k){delete data[k]}} , onChanged:{addListener(fn){listeners.changed=fn}}},
 alarms:{create:async (name,params)=>alarms.set(name,params),clear:async name=>alarms.delete(name),onAlarm:event()},
 action:{onClicked:event(),setBadgeText:async x=>{badge=x.text},setBadgeBackgroundColor:async()=>{},setTitle:async()=>{}},
 scripting:{executeScript:async()=>[{result:{platform:'贝壳',platformId:'101126703003',url:'https://m.ke.com/tj/ershoufang/101126703003.html',community:'水木天成碧杉园',area:71.31,price:56,title:'南向一居'}}]},
 runtime:{onMessage:event(),onStartup:event(),onInstalled:event(),openOptionsPage:async()=>openedOptions++}
};
const fetch=async (url,o)=>{apiCalls.push(JSON.parse(o.body));if(!remoteOnline)throw Error('离线');if(apiCalls.at(-1).action==='login')return {ok:true,status:200,json:async()=>({ok:true,session:'testsession'})};if(apiCalls.at(-1).action==='capture')return {ok:true,status:200,json:async()=>({ok:true,platformKey:'ke:101126703003',status:'created',version:9})};throw Error('unexpected')};
const context={chrome,fetch,Date,Set,Array,Promise,console,Error,JSON,Math,String,Number};
vm.runInNewContext(fs.readFileSync(require('path').resolve(__dirname,'../extension/background.js'),'utf8'),context);
const sleep=ms=>new Promise(res=>setTimeout(res,ms));
async function send(type,rest={}){return new Promise((res,rej)=>{chrome.runtime.onMessage.fn({type,...rest},{},v=>res(v))})}
(async()=>{
 await chrome.action.onClicked.fn({id:44});await sleep(20);
 assert.equal((data.queue||[]).length,1);assert.equal(openedOptions,1);assert.equal(apiCalls.length,0);
 const auth=await send('AUTH',{pin:testPin});assert.equal(auth.ok,true);await sleep(20);
 assert.equal((data.queue||[]).length,0);assert.ok(data.lastSyncedAt);assert.ok(!alarms.size);
 remoteOnline=false;await chrome.action.onClicked.fn({id:44});await sleep(20);
 assert.equal((data.queue||[]).length,1);assert.ok(alarms.has('hq_failed_sync_retry'));
 remoteOnline=true;await send('WAKE_SYNC');await sleep(20);
 assert.equal((data.queue||[]).length,0);assert.equal(alarms.size,0);
 console.log('PASS extension: click-only capture, first PIN setup, direct cloud save, offline queue, auto retry, zero H5 tabs; badge='+badge);
})().catch(e=>{console.error(e);process.exit(1)});
