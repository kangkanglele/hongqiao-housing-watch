'use strict';
importScripts('media-upload.js');
const API='https://hongqiao-housing-watch.netlify.app/.netlify/functions/hq-api';
const ALARM='hq_failed_sync_retry';
let busy=false,mediaBusy=false;
const capturingTabs=new Set();
const queueKey=item=>String(item.platform||'')+':'+String(item.platformId||'');

async function getState(){
 return chrome.storage.local.get(['queue','mediaQueue','mediaDone','imageCount','session','syncStatus','syncPhase','lastSyncedAt','lastCapture','lastResult','activeTabId']);
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

const imageQueueKey=(item)=>String(item.listingKey||'')+'|'+String(item.imageUrl||'');
async function enqueueListingMedia(record,houseId){
 if(!houseId||!/^TJ-HQ-\d+$/.test(houseId))return;
 const state=await getState(),count=Number(state.imageCount)===8?8:1;
 const urls=Array.isArray(record.images)?record.images.slice(0,count):[];
 const pending=Array.isArray(state.mediaQueue)?state.mediaQueue:[],
       done=new Set(Array.isArray(state.mediaDone)?state.mediaDone:[]);
 const listingKey=(record.platform==='我爱我家'?'5i5j:':'ke:')+record.platformId;
 for(let i=0;i<urls.length;i++){
  const item={imageUrl:urls[i],index:i,houseId,listingKey,platformId:record.platformId};
  item.queueId=imageQueueKey(item);item.attempts=0;
  if(!done.has(item.queueId)&&!pending.some(x=>x.queueId===item.queueId))pending.push(item);
 }
 await chrome.storage.local.set({mediaQueue:pending});
 await scheduleRetry(pending.length+(state.queue||[]).length);
}
async function flushMediaQueue(tabId,manual=false){
 if(mediaBusy)return {ok:true,busy:true};
 mediaBusy=true;
 try{
  const state=await getState(),session=state.session;
  let queue=Array.isArray(state.mediaQueue)?state.mediaQueue:[];
  if(!queue.length)return {ok:true,queued:0};
  if(!session)return {ok:false,queued:queue.length,authRequired:true};
  let complete=0;
  for(const next of [...queue]){
   if(next.attempts>=3&&!manual)continue;
   const live=await getState();
   const current=(live.mediaQueue||[]).find(x=>x.queueId===next.queueId);
   if(!current)continue;
   try{
    await setStatus('syncing','正在将官网图片归档到私人 Google Drive：'+(complete+1)+'/'+queue.length,tabId);
    let uploaded=current.uploadedFile;
    if(!uploaded){
     uploaded=await self.HQMediaExtension.upload(current,session,pct=>{
       if(pct===100)notifyTab(tabId,{phase:'syncing',message:'图片已传至 Drive，正在登记房源…'});
     });
     const state2=await getState(),items=state2.mediaQueue||[];
     const at=items.findIndex(x=>x.queueId===current.queueId);
     if(at>=0){items[at].uploadedFile=uploaded;await chrome.storage.local.set({mediaQueue:items});}
    }
    await self.HQMediaExtension.attach(current,session,uploaded);
    const state3=await getState(),remaining=(state3.mediaQueue||[]).filter(x=>x.queueId!==current.queueId);
    const done=Array.isArray(state3.mediaDone)?state3.mediaDone:[];
    if(!done.includes(current.queueId))done.push(current.queueId);
    await chrome.storage.local.set({mediaQueue:remaining,mediaDone:done.slice(-1000)});
    complete++;
    await setStatus('synced','已归档 '+complete+' 张图片到 Drive，房源文本与图片分别同步成功',tabId);
   }catch(error){
    const state2=await getState(),items=state2.mediaQueue||[];
    const at=items.findIndex(x=>x.queueId===current.queueId);
    if(at>=0){items[at].attempts=(items[at].attempts||0)+1;items[at].lastError=error.message||String(error);}
    await chrome.storage.local.set({mediaQueue:items});
    if(/PIN 会话/.test(String(error.message||'')))await chrome.storage.local.remove('session');
    await setStatus('error','房源文本已保存，图片留在待传队列：'+error.message,tabId);
    break;
   }
  }
  const end=await getState(),remaining=(end.mediaQueue||[]).length;
  const retryable=(end.mediaQueue||[]).filter(x=>(x.attempts||0)<3).length;
  await scheduleRetry(retryable+(end.queue||[]).length);
  return {ok:remaining===0,queued:remaining,retryable,completed:complete};
 }finally{mediaBusy=false;}
}

async function capture(record,tabId){
 if(!record||!['贝壳','链家','我爱我家'].includes(record.platform)||!/^\d{8,}$/.test(String(record.platformId||'')))throw Error('仅接收贝壳、链家或我爱我家官网单套详情页');
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
   const m=await flushMediaQueue(tabId);
   await scheduleRetry(m.retryable||0);
   if(!m.queued)await setStatus('synced','本机待同步房源与图片均已处理',tabId);
   return {ok:!m.queued,queued:0,mediaQueued:m.queued||0};
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
   await enqueueListingMedia(item,body.houseId);
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
  const media=queue.length?{queued:(await getState()).mediaQueue?.length||0}:await flushMediaQueue(tabId);
  await scheduleRetry(queue.length+(media.retryable||0));
  return {ok:queue.length===0&&!(media.queued||0),queued:queue.length,mediaQueued:media.queued||0};
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
   return {ok:true,queued:(current.queue||[]).length,mediaQueued:(current.mediaQueue||[]).length,authed:!!current.session,status:current.syncStatus||'',phase:current.syncPhase||'idle',lastSyncedAt:current.lastSyncedAt||'',lastCapture:current.lastCapture||null,lastResult:current.lastResult||null,lastError:current.lastError||''};
  }
  if(message?.type==='WAKE_SYNC')return flush(message.tabId||sender.tab?.id);
  if(message?.type==='SET_IMAGE_COUNT'){
   const imageCount=Number(message.value)===8?8:1;
   await chrome.storage.local.set({imageCount});return {ok:true,imageCount};
  }
  if(message?.type==='RETRY_IMAGES')return flushMediaQueue(message.tabId||sender.tab?.id,true);
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
