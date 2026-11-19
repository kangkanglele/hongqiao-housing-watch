'use strict';
const $=s=>document.querySelector(s);
async function refresh(){try{const s=await chrome.runtime.sendMessage({type:'STATUS'});$('#authState').textContent=s.authed?'已连接，可直接点击插件图标采集房源':'首次使用需要输入 PIN；系统会在认证后自动发送之前未上传的数据';$('#pinArea').hidden=!!s.authed;$('#count').textContent=(s.queued||0)+' 条待同步';$('#status').textContent=s.status||'尚无数据';$('#last').textContent=s.lastSyncedAt?'上次云端成功：'+new Date(s.lastSyncedAt).toLocaleString('zh-CN'):''}catch(e){$('#message').textContent=e.message}}
$('#login').addEventListener('click',async()=>{const pin=$('#pin').value.trim();if(!/^\d{4}$/.test(pin)){$('#message').textContent='请输入四位数字';return}$('#message').textContent='正在连接…';try{const r=await chrome.runtime.sendMessage({type:'AUTH',pin});if(!r?.ok)throw Error(r.error||'连接失败');$('#message').textContent='连接成功；待同步记录自动上传';$('#pin').value='';await refresh()}catch(e){$('#message').textContent=e.message}});
$('#retry').addEventListener('click',async()=>{await chrome.runtime.sendMessage({type:'WAKE_SYNC'});await refresh()});
chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local')refresh()});refresh();
