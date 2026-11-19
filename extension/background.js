'use strict';
const API='https://hongqiao-housing-watch.netlify.app/.netlify/functions/hq-api';
const ALARM='hq_failed_sync_retry';
let busy=false;
const key=o=>o.platform+':'+o.platformId;
async function state(){return chrome.storage.local.get(['queue','session','syncStatus','lastSyncedAt'])}
async function status(message){await chrome.storage.local.set({syncStatus:message})}
async function scheduleRetry(count){if(count>0)await chrome.alarms.create(ALARM,{delayInMinutes:5,periodInMinutes:5});else await chrome.alarms.clear(ALARM)}
async function login(pin){
 const r=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'login',pin})});
 const d=await r.json().catch(()=>({ok:false,error:'无法解析服务器响应'}));if(!r.ok||!d.ok)throw Error(d.error||'连接失败');
 await chrome.storage.local.set({session:d.session});await flush();return {ok:true};
}
async function capture(record){
 if(!record||!['贝壳','我爱我家'].includes(record.platform)||!/^\d{8,}$/.test(String(record.platformId||'')))throw Error('仅接收官方单套详情页');
 const raw=await state(),queue=Array.isArray(raw.queue)?raw.queue:[];
 const item={...record,queueId:key(record),queuedAt:new Date().toISOString()};
 const index=queue.findIndex(x=>x.queueId===item.queueId);if(index>=0)queue[index]=item;else queue.push(item);
 await chrome.storage.local.set({queue});await scheduleRetry(queue.length);
 await status(raw.session?'已保存待传，正在自动同步…':'已保存待传；首次使用需输入四位 PIN');
 flush();return {ok:true,queued:queue.length};
}
async function flush(){
 if(busy)return;busy=true;
 try{
  let {queue=[],session}=await state();if(!Array.isArray(queue)||!queue.length){await scheduleRetry(0);return}
  if(!session){await status('尚未登录云端，已保留待同步记录');return}
  for(let i=0;i<queue.length;i++){
   const item=queue[i];
   let res,body;try{res=await fetch(API,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+session},body:JSON.stringify({action:'capture',record:item})});body=await res.json();}catch(e){await status('网络不可用，待同步 '+queue.length+' 条；后台自动重试');break}
   if(res.status===401){await chrome.storage.local.remove('session');await status('云端登录过期，待同步 '+queue.length+' 条；输入 PIN 后自动续传');break}
   if(!res.ok||!body?.ok){await status('同步失败：'+(body?.error||'服务器错误')+'；待同步 '+queue.length+' 条');break}
   // 再次读取确保不会删除这一刻刚刚采集的同编号新报价。
   const latest=await state(),curr=Array.isArray(latest.queue)?latest.queue:[];
   const remaining=curr.filter(x=>!(x.queueId===item.queueId&&x.queuedAt===item.queuedAt));
   await chrome.storage.local.set({queue:remaining,lastSyncedAt:new Date().toISOString(),syncStatus:remaining.length?'已上传一条，剩余待同步 '+remaining.length:'已同步云端 · '+(body.platformKey||item.queueId)});
   queue=remaining;i=-1; // 取剩余队列第一条，继续自动处理
  }
  const last=await state();await scheduleRetry((last.queue||[]).length);
 }finally{busy=false}
}
chrome.runtime.onMessage.addListener((msg,sender,reply)=>{
 (async()=>{
  if(msg?.type==='CAPTURE')return capture(msg.record);
  if(msg?.type==='AUTH')return login(String(msg.pin||''));
  if(msg?.type==='STATUS'){const s=await state();return {ok:true,queued:(s.queue||[]).length,authed:!!s.session,status:s.syncStatus||'',lastSyncedAt:s.lastSyncedAt||''}}
  if(msg?.type==='WAKE_SYNC'){await flush();return {ok:true}}
  throw Error('未知操作');
 })().then(reply).catch(e=>reply({ok:false,error:e.message||String(e)}));return true;
});
chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)flush()});
chrome.runtime.onStartup.addListener(()=>flush());
chrome.runtime.onInstalled.addListener(()=>flush());

// 点一次插件图标直接执行采集，不展示中间操作按钮。
async function reportBadge(tabId,text,title){
 try{await chrome.action.setBadgeText({tabId,text});await chrome.action.setBadgeBackgroundColor({tabId,color:text==='!'?'#c94a41':text==='✓'?'#167a63':'#b0741b'});await chrome.action.setTitle({tabId,title})}catch(_){}
}
chrome.action.onClicked.addListener(async tab=>{
 if(!tab?.id)return;
 await reportBadge(tab.id,'…','正在读取并保存当前官方房源');
 try{
  const result=await chrome.scripting.executeScript({target:{tabId:tab.id},files:['extract.js']});
  const record=result?.[0]?.result;
  if(!record||record.error)throw Error(record?.error||'无法读取当前房源');
  const outcome=await capture(record);if(!outcome.ok)throw Error(outcome.error||'保存失败');
  const statusInfo=await state();
  await reportBadge(tab.id,statusInfo.session?'↥':'1',statusInfo.session?'已采集，自动上传中':'已暂存，输入 PIN 后自动上传');
  if(!statusInfo.session)await chrome.runtime.openOptionsPage();
 }catch(e){await status('采集失败：'+e.message);await reportBadge(tab.id,'!','未保存：'+e.message)}
});
chrome.storage.onChanged.addListener(async(changes,area)=>{
 if(area!=='local'||!changes.queue)return;
 const queue=changes.queue.newValue||[];
 const badge=queue.length===0?'✓':queue.length>99?'99':String(queue.length);
 try{await chrome.action.setBadgeText({text:badge});await chrome.action.setBadgeBackgroundColor({color:queue.length?'#b0741b':'#167a63'});await chrome.action.setTitle({title:queue.length?'本地待同步 '+queue.length+' 条；浏览器会自动重试':'所有房源均已同步云端'})}catch(_){}
});
