(()=> {
 'use strict';
 if(window.__hqSyncOverlayInstalled)return;
 window.__hqSyncOverlayInstalled=true;
 let host=document.getElementById('__hq_sync_status_host');
 if(!host){host=document.createElement('div');host.id='__hq_sync_status_host';(document.documentElement||document.body).appendChild(host);}
 const shadow=host.shadowRoot||host.attachShadow({mode:'open'});
 shadow.innerHTML=`
 <style>
 :host{all:initial}
 .panel{position:fixed;z-index:2147483647;right:22px;bottom:22px;width:min(330px,calc(100vw - 32px));padding:13px 15px;border-radius:13px;background:#173f36;color:#fff;box-shadow:0 12px 38px #0003;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;gap:10px;align-items:flex-start;opacity:0;transform:translateY(12px);pointer-events:none;transition:opacity .18s,transform .18s}
 .panel.show{opacity:1;transform:translateY(0);pointer-events:auto}
 .dot{width:25px;height:25px;flex:none;border-radius:8px;background:#ffffff20;display:grid;place-items:center;font-weight:800}
 .copy{min-width:0;flex:1}.title{font-weight:700}.message{margin-top:3px;color:#d5e4de;font-size:11px;overflow-wrap:anywhere}
 .close{border:0;background:transparent;color:#c9d9d3;font-size:18px;cursor:pointer;padding:0 2px}
 .spin{width:13px;height:13px;border:2px solid #ffffff55;border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite}
 @keyframes spin{to{transform:rotate(360deg)}}
 </style>
 <div class="panel" id="panel" role="status" aria-live="polite"><div class="dot" id="dot">⌂</div><div class="copy"><div class="title" id="title">红桥房源观察站</div><div class="message" id="message">等待采集</div></div><button class="close" id="close" aria-label="关闭">×</button></div>`;
 const panel=shadow.getElementById('panel'),dot=shadow.getElementById('dot'),title=shadow.getElementById('title'),message=shadow.getElementById('message');
 let hideTimer=null;
 function show(data){
  clearTimeout(hideTimer);
  const phase=data.phase||'idle';
  title.textContent=phase==='synced'?'已同步到云端':phase==='error'?'采集或同步失败':phase==='offline'?'网络暂不可用':phase==='extracting'?'正在读取房源':phase==='syncing'?'正在同步房源':phase==='auth_required'?'等待 PIN 授权':'房源已暂存';
  message.textContent=data.message||'';
  dot.innerHTML=(phase==='extracting'||phase==='syncing')?'<span class="spin"></span>':phase==='synced'?'✓':phase==='error'?'!':'⌂';
  panel.classList.add('show');
  if(phase==='synced')hideTimer=setTimeout(()=>panel.classList.remove('show'),6500);
 }
 shadow.getElementById('close').addEventListener('click',()=>panel.classList.remove('show'));
 chrome.runtime.onMessage.addListener(message=>{if(message?.type==='HQ_SYNC_PROGRESS')show(message);});
})();
