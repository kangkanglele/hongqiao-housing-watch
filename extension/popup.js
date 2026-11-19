'use strict';
const $=selector=>document.querySelector(selector);
const labels={
 extracting:['正在读取房源','正在识别当前打开的贝壳／我爱我家详情页','◌'],
 queued:['已保存在本机','房源已进入本地队列，正在准备上传','✓'],
 syncing:['正在同步云端','云端正在核验并保存这条房源','↥'],
 synced:['同步完成','云端已确认保存；本地队列已清空','✓'],
 auth_required:['等待 PIN 授权','记录已安全保存在本机，连接后自动上传','🔐'],
 offline:['网络暂不可用','数据没有丢失，网络恢复后会自动重试','↻'],
 error:['本次操作未完成','记录仍保留在本机队列，可查看错误并重试','!'],
 idle:['准备就绪','打开贝壳或我爱我家单套详情页，点击扩展图标即可采集','⌂']
};
function render(state){
 const phase=state.phase||'idle',meta=labels[phase]||labels.idle;
 $('#statusCard').dataset.phase=phase;
 $('#statusTitle').textContent=meta[0];
 $('#statusMessage').textContent=state.status||meta[1];
 $('#statusIcon').innerHTML=phase==='extracting'||phase==='syncing'?'<span class="spinner"></span>':meta[2];
 $('#connection').textContent=state.authed?'云端已连接':'未连接';
 $('#connection').style.background=state.authed?'#e7f4ee':'#fff4df';
 $('#connection').style.color=state.authed?'#24735c':'#986d21';
 const record=state.lastCapture;
 if(record){
  $('#listing').hidden=false;
  $('#listingTitle').textContent=record.title||record.community||'已识别房源';
  $('#listingMeta').textContent=[record.platform,record.community,record.area?record.area+'㎡':'',record.price?record.price+'万':''].filter(Boolean).join(' · ');
  $('#listingLink').href=/^https:\/\//.test(record.url||'')?record.url:'#';
 }else $('#listing').hidden=true;
 $('#auth').hidden=!!state.authed;
 $('#queueCount').textContent=(state.queued||0)+' 条待同步';
 $('#lastSynced').textContent=state.lastSyncedAt?'上次成功：'+new Date(state.lastSyncedAt).toLocaleString('zh-CN'):'尚未同步';
 $('#retry').disabled=!state.queued;
 $('#retry').style.opacity=state.queued?1:.5;
}
async function refresh(){
 try{const state=await chrome.runtime.sendMessage({type:'STATUS'});render(state||{});}
 catch(error){$('#statusMessage').textContent=error.message||String(error);}
}
async function init(){
 await refresh();
 try{const result=await chrome.runtime.sendMessage({type:'CAPTURE_ACTIVE'});if(!result?.ok&&result?.error)$('#statusMessage').textContent=result.error;}
 catch(error){$('#statusMessage').textContent=error.message||String(error);}
 await refresh();
}
$('#login').addEventListener('click',async()=>{
 const pin=$('#pin').value.trim();
 if(!/^\d{4}$/.test(pin)){$('#authMessage').textContent='请输入四位数字 PIN';return;}
 $('#login').disabled=true;$('#authMessage').textContent='正在验证 PIN 并同步…';
 try{
  const result=await chrome.runtime.sendMessage({type:'AUTH',pin});
  if(!result?.ok)throw Error(result.error||'连接失败');
  $('#pin').value='';$('#authMessage').textContent='';
  await refresh();
 }catch(error){$('#authMessage').textContent=error.message||String(error);}
 finally{$('#login').disabled=false;}
});
$('#retry').addEventListener('click',async()=>{
 $('#statusMessage').textContent='正在重试本机待同步队列…';
 await chrome.runtime.sendMessage({type:'WAKE_SYNC'});
 await refresh();
});
chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local')refresh()});
init();
