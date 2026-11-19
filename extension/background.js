'use strict';
const API='https://hongqiao-housing-watch.netlify.app/.netlify/functions/hq-api';
const ALARM='hq_failed_sync_retry';
let busy=false;
const capturingTabs=new Set();
const queueKey=item=>String(item.platform||'')+':'+String(item.platformId||'');

async function getState(){
 return chrome.storage.local.get(['queue','session','syncStatus','syncPhase','lastSyncedAt','lastCapture','lastResult','activeTabId']);
}
async function reportBadge(tabId,phase,queueLength){
 const text=phase==='extracting'||phase==='syncing'?'…':phase==='error'?'!':phase==='synced'?'✓':queueLength?String(Math.min(queueLength,99)):'';
 const color=phase==='error'?'#c94a41':phase==='synced'?'#167a63':'#b0741b';
 try{
  const target=tabId?{tabId}:{};
  await chrome.action.setBadgeText({...target,text});
  await chrome.action.setBadgeBackgroundColor({...target,color});
  await chrome.action.setTitle({...target,title:phase==='synced'?'房源已同步到云端':queueLength?'待同步 '+queueLength+' 条房源':'红桥房源采集助手'});
 }catch(_){}
}
async function notifyTab(tabId,payload){
 if(!tabId)return;
 try{await chrome.tabs.sendMessage(tabId,{type:'HQ_SYNC_PROGRESS',...payload});}
 catch(_){
  try{
   await chrome.scripting.executeScript({target:{tabId},files:['status-overlay.js']});
   await chrome.tabs.sendMessage(tabId,{type:'HQ_SYNC_PROGRESS',...payload});
  }catch(__){}
 }
}
async function setStatus(phase,message,tabId,extra={}){
 const current=await getState();
 const target=tabId||current.activeTabId||null;
 const queue=Array.isArray(current.queue)?current.queue:[];
 const payload={phase,message,queued:queue.length,at:new Date().toISOString(),...extra};
 await chrome.storage.local.set({syncPhase:phase,syncStatus:message,statusUpdatedAt:payload.at,...extra});
 await reportBadge(target,phase,queue.length);
 await notifyTab(target,payload);
}
async function scheduleRetry(count){
 if(count>0)await chrome.alarms.create(ALARM,{delayInMinutes:2,periodInMinutes:5});
 else await chrome.alarms.clear(ALARM);
}
async function login(pin){
 if(!/^\d{4}$/.test(String(pin||'')))throw Error('请输入四位数字 PIN');
 const response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'login',pin})});
 const body=await response.json().catch(()=>({ok:false,error:'无法解析服务器响应'}));
 if(!response.ok||!body.ok)throw Error(body.error||'PIN 验证失败');
 await chrome.storage.local.set({session:body.session});
 await setStatus('syncing','PIN 验证成功，正在同步本机待上传记录…');
 const result=await flush();
 return {ok:true,...result};
}
async function capture(record,tabId){
 if(!record||!['贝壳','我爱我家'].includes(record.platform)||!/^\d{8,}$/.test(String(record.platformId||'')))throw Error('仅接收贝壳或我爱我家官网单套详情页');
 const current=await getState(),queue=Array.isArray(current.queue)?current.queue:[];
 const item={...record,queueId:queueKey(record),queuedAt:new Date().toISOString()};
 const index=queue.findIndex(x=>x.queueId===item.queueId);
 if(index>=0)queue[index]=item;else queue.push(item);
 await chrome.storage.local.set({queue,lastCapture:{...record,capturedAt:item.queuedAt},activeTabId:tabId||current.activeTabId||null});
 await scheduleRetry(queue.length);
 const latest=await getState();
 if(!latest.session){
  await setStatus('auth_required','房源已保存在本机，请输入 PIN 连接云端',tabId);
  return {ok:true,queued:queue.length,authed:false};
 }
 await setStatus('queued','房源已安全暂存，正在同步云端…',tabId);
 const result=await flush(tabId);
 return {ok:true,queued:(await getState()).queue?.length||0,authed:true,...result};
}
async function flush(tabId){
 if(busy)return {ok:true,busy:true};
 busy=true;
 try{
  let current=await getState();
  let queue=Array.isArray(current.queue)?current.queue:[];
  if(!queue.length){
   await scheduleRetry(0);
   await setStatus('synced','没有待同步房源；本机队列已清空',tabId);
   return {ok:true,queued:0};
  }
  if(!current.session){
   await setStatus('auth_required','有 '+queue.length+' 条房源已保存在本机，输入 PIN 后自动同步',tabId);
   await scheduleRetry(queue.length);
   return {ok:false,queued:queue.length,authRequired:true};
  }
  const total=queue.length;
  await setStatus('syncing','正在同步 0/'+total+' 条房源…',tabId);
  for(const item of [...queue]){
   let response,body;
   try{
    response=await fetch(API,{
     method:'POST',
     headers:{'content-type':'application/json','authorization':'Bearer '+current.session},
     body:JSON.stringify({action:'capture',record:item})
    });
    body=await response.json().catch(()=>({ok:false,error:'服务器返回无法识别的数据'}));
   }catch(error){
    current=await getState();queue=Array.isArray(current.queue)?current.queue:[];
    await setStatus('offline','网络连接失败；'+queue.length+' 条已留在本机，稍后自动重试',tabId,{lastError:error.message||'网络错误'});
    await scheduleRetry(queue.length);
    return {ok:false,queued:queue.length};
   }
   if(response.status===401){
    await chrome.storage.local.remove('session');
    current=await getState();queue=Array.isArray(current.queue)?current.queue:[];
    await setStatus('auth_required','登录已过期；'+queue.length+' 条仍保存在本机，请重新输入 PIN',tabId);
    await scheduleRetry(queue.length);
    return {ok:false,queued:queue.length,authRequired:true};
   }
   if(!response.ok||!body?.ok){
    current=await getState();queue=Array.isArray(current.queue)?current.queue:[];
    await setStatus('error','同步失败：'+(body?.error||'服务器错误')+'；'+queue.length+' 条仍保存在本机',tabId,{lastError:body?.error||'服务器错误'});
    await scheduleRetry(queue.length);
    return {ok:false,queued:queue.length,error:body?.error||'服务器错误'};
   }
   const latest=await getState(),remaining=(Array.isArray(latest.queue)?latest.queue:[]).filter(x=>!(x.queueId===item.queueId&&x.queuedAt===item.queuedAt));
   await chrome.storage.local.set({
    queue:remaining,
    lastSyncedAt:new Date().toISOString(),
    lastResult:{platformKey:body.platformKey||item.queueId,status:body.status||'saved',houseId:body.houseId||'',community:item.community||'',title:item.title||'',price:item.price||null,area:item.area||null}
   });
   current=await getState();queue=Array.isArray(current.queue)?current.queue:[];
   await setStatus(queue.length?'syncing':'synced',queue.length?'已同步 '+(total-queue.length)+'/'+total+' 条，剩余 '+queue.length+' 条':'同步成功！房源已写入云端',tabId);
  }
  current=await getState();queue=Array.isArray(current.queue)?current.queue:[];
  await scheduleRetry(queue.length);
  return {ok:queue.length===0,queued:queue.length};
 }finally{busy=false;}
}
async function captureActiveTab(){
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 if(!tab?.id)throw Error('没有找到当前浏览器标签页');
 const tabId=tab.id;
 if(capturingTabs.has(tabId))return {ok:true,busy:true};
 capturingTabs.add(tabId);
 try{
  await chrome.storage.local.set({activeTabId:tabId});
  try{await chrome.scripting.executeScript({target:{tabId},files:['status-overlay.js']});}catch(_){}
  await setStatus('extracting','正在读取当前房源页面…',tabId);
  const result=await chrome.scripting.executeScript({target:{tabId},files:['extract.js']});
  const record=result?.[0]?.result;
  if(!record||record.error)throw Error(record?.error||'未能读取房源信息');
  await setStatus('queued','已识别房源，正在本机留存…',tabId,{lastCapture:record});
  return await capture(record,tabId);
 }catch(error){
  await setStatus('error','采集失败：'+(error.message||String(error)),tabId,{lastError:error.message||String(error)});
  throw error;
 }finally{capturingTabs.delete(tabId);}
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 (async()=>{
  if(message?.type==='CAPTURE_ACTIVE')return captureActiveTab();
  if(message?.type==='CAPTURE')return capture(message.record,message.tabId||sender.tab?.id);
  if(message?.type==='AUTH')return login(String(message.pin||''));
  if(message?.type==='STATUS'){
   const current=await getState();
   return {ok:true,queued:(current.queue||[]).length,authed:!!current.session,status:current.syncStatus||'',phase:current.syncPhase||'idle',lastSyncedAt:current.lastSyncedAt||'',lastCapture:current.lastCapture||null,lastResult:current.lastResult||null,lastError:current.lastError||''};
  }
  if(message?.type==='WAKE_SYNC')return flush(message.tabId||sender.tab?.id);
  throw Error('未知操作');
 })().then(reply).catch(error=>reply({ok:false,error:error.message||String(error)}));
 return true;
});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)flush()});
chrome.runtime.onStartup.addListener(()=>flush());
chrome.runtime.onInstalled.addListener(()=>flush());
chrome.storage.onChanged.addListener(async(changes,area)=>{
 if(area!=='local'||!changes.queue)return;
 const queue=changes.queue.newValue||[];
 await reportBadge(null,queue.length?'queued':'synced',queue.length);
});
