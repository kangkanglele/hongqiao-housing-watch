/**
 * 红桥房源观察站 0.5 — 服务端数据中转
 * 机密只放 Netlify Functions 环境变量；严禁放在 HTML/Chrome 扩展。
 * 此接口对现有 Google Apps Script V3.4 向后兼容，不需要再次发布 Apps Script。
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const AUTH_TTL_MS = 7 * 86400000;
const norm = s => String(s ?? '').trim();
const b64 = x => Buffer.from(x).toString('base64url');
const unb64 = x => Buffer.from(x,'base64url').toString();
const env = k => (globalThis.Netlify?.env?.get?.(k) ?? process.env[k] ?? '');
const response = (body,status=200,origin='') => new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','access-control-allow-origin':origin||'https://hongqiao-housing-watch.netlify.app','vary':'Origin','access-control-allow-headers':'Content-Type, Authorization','access-control-allow-methods':'POST, OPTIONS','x-content-type-options':'nosniff'}});
const validOrigin = o => !o || o === 'https://hongqiao-housing-watch.netlify.app' || o.startsWith('chrome-extension://') || (env('HQ_ALLOW_LOCAL')==='true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o));
function equal(a,b){const x=Buffer.from(String(a)),y=Buffer.from(String(b));return x.length===y.length&&timingSafeEqual(x,y)}
function signature(payload){return createHmac('sha256',env('HQ_SESSION_SECRET')).update(payload).digest('base64url')}
function makeSession(){const payload=b64(JSON.stringify({purpose:'hq-sync',exp:Date.now()+AUTH_TTL_MS}));return payload+'.'+signature(payload)}
function validSession(raw){if(!env('HQ_SESSION_SECRET')||!raw)return false;const [payload,mac,...extra]=String(raw).split('.');if(!payload||!mac||extra.length||!equal(mac,signature(payload)))return false;try{const x=JSON.parse(unb64(payload));return x.purpose==='hq-sync'&&Number(x.exp)>Date.now()&&Number(x.exp)<Date.now()+AUTH_TTL_MS+60000}catch{return false}}
const headerSession = req => (req.headers.get('authorization')||'').replace(/^Bearer\s+/i,'');
function safeHost(url){const u=new URL(url);const h=u.hostname.toLowerCase();return {u,h}}
function identity(record){const {u,h}=safeHost(record.url);if(u.protocol!=='https:')throw Error('只接受 https 官方房源网址');const channel=h==='ke.com'||h.endsWith('.ke.com')?'贝壳':h==='5i5j.com'||h.endsWith('.5i5j.com')?'我爱我家':null;if(!channel)throw Error('仅支持贝壳与我爱我家官方域名');const m=u.pathname.match(/^\/(?:tj\/)?ershoufang\/(\d{8,})(?:\.html)?\/?$/i);if(!m)throw Error('需要官方单套详情页，不能是小区/列表网址');u.search='';u.hash='';return {channel,id:m[1],key:(channel==='贝壳'?'ke:':'5i5j:')+m[1],canonical:u.toString()}}
const num=x => Number.isFinite(Number(x))&&Number(x)>0&&Number(x)<100000?Number(x):null;
const str=(s,n=200)=>norm(s).slice(0,n);
const today=()=>new Date().toISOString().slice(0,10);
async function google(action,params={}){
 const scriptUrl=env('HQ_GOOGLE_URL'),token=env('HQ_GOOGLE_TOKEN');if(!scriptUrl||!token)throw Error('云端服务端凭证尚未配置');
 const u=new URL(scriptUrl);if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(u.pathname))throw Error('云端部署地址配置不正确');
 const cb='hq_service_cb';for(const [k,v] of Object.entries({...params,action,token,callback:cb})){if(v!==undefined&&v!==null)u.searchParams.set(k,String(v))}
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),23000);let r,txt;
 try{r=await fetch(u,{redirect:'follow',signal:ctrl.signal,headers:{'accept':'application/javascript'}});txt=await r.text();}finally{clearTimeout(timer)}
 if(!r.ok)throw Error('Google 云端请求失败（HTTP '+r.status+'）');
 const start=cb+'(';if(!txt.startsWith(start)||!txt.trimEnd().endsWith(');'))throw Error('Google 返回格式异常，请检查 Apps Script 当前部署');
 let value;try{value=JSON.parse(txt.slice(start.length,txt.lastIndexOf(');')))}catch{throw Error('Google 返回数据不可解析')}
 if(!value?.ok){const e=Error(str(value?.error||'Google 操作失败',300));if(value?.conflict)e.conflict=true;throw e}
 return value;
}
async function googlePost(action,params={}) {
 const scriptUrl=env('HQ_GOOGLE_URL'),token=env('HQ_GOOGLE_TOKEN');if(!scriptUrl||!token)throw Error('云端服务端凭证尚未配置');
 const u=new URL(scriptUrl);if(u.protocol!=='https:'||u.hostname!=='script.google.com'||!/^\/macros\/s\/[^/]+\/exec$/.test(u.pathname))throw Error('云端部署地址配置不正确');
 const body=JSON.stringify({...params,action,token});
 if(new TextEncoder().encode(body).length>5*1024*1024)throw Error('云端快照超过单次上传限制，请先缩减照片体积');
 const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),23000);let r,txt;
 try{r=await fetch(u,{method:'POST',redirect:'follow',signal:ctrl.signal,headers:{'content-type':'application/json','accept':'application/json'},body});txt=await r.text();}finally{clearTimeout(timer)}
 if(!r.ok)throw Error('Google 云端写入失败（HTTP '+r.status+'）');
 let value;try{value=JSON.parse(txt)}catch{throw Error('Google POST 返回格式异常；请确认 Apps Script 已部署 0.5 版单次写入接口')}
 if(!value?.ok){const e=Error(str(value?.error||'Google 写入失败',300));if(value?.conflict)e.conflict=true;throw e}
 return value;
}
const VALID_NAMES=['水木天成翠杨园','水木天成依湖园','水木天成逸树园','水木天成望汀园','水木天成阁林园','水木天成碧杉园','水木天成闻涛园','水木天成临湾园','民畅园','河怡花园','燕宇新城','龙禧园','西河名邸','金筑家园','子牙南里','礼貌楼','礼貌东里'];
function mergeRecord(state,input){
 const id=identity(input);if(input.platform&&input.platform!==id.channel)throw Error('渠道与房源链接域名不一致');if(input.platformId&&String(input.platformId)!==id.id)throw Error('房源编号与链接不一致');const community=str(input.community,60);const validCommunity=(state.scopes||[]).some(s=>s.name===community)&&VALID_NAMES.includes(community);
 const price=num(input.price),area=num(input.area),floor=num(input.floor),total=num(input.totalFloors);
 const url=str(input.url,1000), now=today(), stamp=new Date().toISOString();
 const all=(state.houses||[]);state.houses=all;state.listingCandidates=state.listingCandidates||[];state.linkLedger=state.linkLedger||[];
 const found=all.find(h=>(h.sources||[]).some(s=>{try{return identity({url:s.url||s.originalUrl}).key===id.key}catch{return false}}));
 const src={channel:id.channel,platformId:id.id,url:id.canonical,rawUrl:url,originalUrl:url,urlType:'官方单套详情',relation:'Chrome用户主动打开的页面（DOM提取）',checked:now};
 let out;
 if(found){
   if(found.deletedAt||found.archived)return {status:'already_hidden',houseId:found.id};
   found.sources=found.sources||[];if(!found.sources.some(s=>{try{return identity({url:s.url}).key===id.key}catch{return false}}))found.sources.push(src);
   const oldPrice=num(found.price);if(price&&oldPrice!==price){found.events=found.events||[];found.events.unshift({id:'CAP-'+Date.now().toString(36),date:stamp,kind:'price',title:'插件观测到报价变化',desc:`${oldPrice??'未知'}万 → ${price}万；来自用户当时浏览的官网页面`,prevPrice:oldPrice,newPrice:price,sourceUrl:url});found.price=price;}
   for(const [k,v] of [['area',area],['floor',floor],['total',total],['rooms',str(input.rooms,50)],['floorBand',str(input.floorBand,60)],['orient',str(input.orientation,30)],['decoration',str(input.decoration,50)]])if((found[k]===null||found[k]===undefined||found[k]===''||found[k]==='待核实')&&v)found[k]=v;
   if((!found.elevator||found.elevator==='未知')&&['有','无'].includes(input.elevator))found.elevator=input.elevator;
   found.lastSeen=now;out={status:oldPrice===price?'unchanged':'updated',houseId:found.id};
 }else if(validCommunity){
   const nums=all.map(h=>Number(/TJ-HQ-(\d+)/.exec(h.id||'')?.[1]||0));const next='TJ-HQ-'+String(Math.max(0,...nums)+1).padStart(4,'0');
   const h={id:next,origin:'Chrome人工采集',community,title:str(input.title,180)||community+' · 待补',area,price,rooms:str(input.rooms,50)||'待核实',floor,total,floorBand:str(input.floorBand,60),elevator:['有','无'].includes(input.elevator)?input.elevator:'未知',env:(state.scopes||[]).find(s=>s.name===community)?.env||'待评',noise:'未知',legal:'待核实',decoration:str(input.decoration,50)||'待核实',orient:str(input.orientation,30)||'待核实',defects:[],drawbacks:[],suitability:'待判断',stage:'观察中',top:!!(floor&&total&&floor===total),duplex:false,firstSeen:now,lastSeen:now,note:'Chrome 插件采集：用户主动打开官网页面；字段待现场核验。',sources:[src],events:[{id:'CAP-'+Date.now().toString(36),date:stamp,kind:'manual',title:'首次采集',desc:'Chrome 插件一键同步官方房源详情页'}]};
   if(h.top)h.defects.push('top');if(h.defects.length){h.suitability='不合适';h.stage='硬伤排除';h.excludedReason='顶层';}
   all.push(h);out={status:'created',houseId:next};
 }else{
   const candidate=state.listingCandidates.find(c=>c.listingKey===id.key||c.platformListingId===id.id&&c.platform===id.channel);
   if(candidate){candidate.lastSeen=now;candidate.title=str(input.title,180)||candidate.title;candidate.area=area||candidate.area;candidate.price=price||candidate.price;out={status:'pending_updated',candidateId:candidate.candidateId}}
   else{const c={candidateId:'PENDING-'+(id.channel==='贝壳'?'KE-':'5I5J-')+id.id,platform:id.channel,platformListingId:id.id,listingKey:id.key,originalUrl:url,canonicalUrl:id.canonical,community:community||'待匹配小区',title:str(input.title,180)||id.channel+' · '+id.id,area,price,rooms:str(input.rooms,50),floorBand:str(input.floorBand,60),orient:str(input.orientation,30),elevator:str(input.elevator,10)||'未知',firstSeen:now,lastSeen:now,recordStatus:'官方详情已采集·小区待确认',sourceCheck:'用户当前浏览器页面 DOM',providedBy:'Chrome 插件',urlVerifiedStructure:true,detailsVerifiedByPlatform:false};state.listingCandidates.push(c);out={status:'pending_community',candidateId:c.candidateId};}
 }
 const old=state.linkLedger.find(x=>x.key===id.key);if(old){old.lastSeen=now;old.originalUrl=url;old.status=out.status==='already_hidden'?'archived':'active'}else state.linkLedger.push({key:id.key,houseId:out.houseId||out.candidateId,channel:id.channel,platformId:id.id,originalUrl:url,canonicalUrl:id.canonical,status:out.status==='pending_community'?'pending_verification':'active',firstSeen:now,lastSeen:now,note:'Chrome 插件直接同步'});
 if(out.status==='created'||out.status==='pending_community')state.listingCandidates=state.listingCandidates.filter(c=>!(c.listingKey===id.key&&out.status==='created'));
 return out;
}
async function commitWholeState(state,version){
 const uploadId='hq'+Date.now().toString(36)+Math.random().toString(36).slice(2,12);
 return googlePost('snapshotCommit',{uploadId,expectedVersion:version,state});
}
async function ingest(record){
 // 幂等：同一平台+编号只保留一条；新版价格不同才生成事件。
 const identityInfo=identity(record);
 for(let attempt=0;attempt<3;attempt++){
  const latest=await google('load');if(!latest.state?.houses||!Array.isArray(latest.state.scopes))throw Error('云端数据未初始化；拒绝写入，防止覆盖');
  const st=latest.state;const result=mergeRecord(st,record);
  if(['unchanged','already_hidden'].includes(result.status))return {...result,version:latest.version,platformKey:identityInfo.key};
  try{const end=await commitWholeState(st,Number(latest.version||0));return {...result,version:end.version,platformKey:identityInfo.key}}
  catch(e){if(!e.conflict&&!/版本已变化|版本冲突/.test(e.message))throw e;if(attempt===2)throw Error('云端有并发写入冲突，已留在本地重试队列');await new Promise(r=>setTimeout(r,350*(attempt+1)))}
 }
}
export default async function handler(request){
 const origin=request.headers.get('origin')||'';if(!validOrigin(origin))return response({ok:false,error:'未允许的调用来源'},403,'https://hongqiao-housing-watch.netlify.app');
 if(request.method==='OPTIONS'){const h=response({},200,origin).headers;return new Response(null,{status:204,headers:h})}
 if(request.method!=='POST')return response({ok:false,error:'仅接受 POST'},405,origin);
 let data;try{data=await request.json()}catch{return response({ok:false,error:'请求格式错误'},400,origin)}
 const action=norm(data?.action);
 if(action==='login'){
  if(!env('HQ_PIN')||!env('HQ_SESSION_SECRET'))return response({ok:false,error:'云端安全配置尚未设置'},503,origin);
  // PIN is a simple everyday access barrier; no brute-force lockout is applied.
  if(!/^\d{4}$/.test(String(data.pin||''))||!equal(data.pin,env('HQ_PIN')))return response({ok:false,error:'PIN 不正确'},401,origin);
  return response({ok:true,session:makeSession(),expiresIn:AUTH_TTL_MS},200,origin);
 }
 if(action==='health')return response({ok:true,configured:!!(env('HQ_GOOGLE_URL')&&env('HQ_GOOGLE_TOKEN')&&env('HQ_PIN')&&env('HQ_SESSION_SECRET'))},200,origin);
 // Public read-only mode: anyone may view the housing data; all mutations remain PIN-session protected.
 if(action==='load'||action==='ping'){
  try{const result=await google(action);return response(result,200,origin)}
  catch(e){const status=e.conflict?409:/令牌|尚未配置/.test(e.message)?503:502;return response({ok:false,error:e.message,conflict:!!e.conflict},status,origin)}
 }
 if(!validSession(headerSession(request)))return response({ok:false,error:'登录已过期，请输入四位 PIN'},401,origin);
 try{
  if(action==='capture'){
   if(!data.record||typeof data.record!=='object')return response({ok:false,error:'缺少房源数据'},400,origin);
   const result=await ingest(data.record);return response({ok:true,...result},200,origin);
  }
  // H5 edits use the same atomic Apps Script snapshotCommit API as the Chrome extension.
  // This replaces hundreds of 380-character GET chunks with one authenticated POST.
  if(action==='snapshotCommit'){
   const expectedVersion=Number(data.expectedVersion),state=data.state;
   if(!Number.isInteger(expectedVersion)||expectedVersion<0||!state||typeof state!=='object'||Array.isArray(state)||!Array.isArray(state.houses)||!Array.isArray(state.scopes)){
    return response({ok:false,error:'快照或版本格式不正确'},400,origin);
   }
   const uploadId='hq'+Date.now().toString(36)+Math.random().toString(36).slice(2,12);
   const result=await googlePost('snapshotCommit',{uploadId,expectedVersion,state});
   return response({ok:true,version:Number(result.version),updatedAt:result.updatedAt||'',snapshotId:result.snapshotId||uploadId},200,origin);
  }
  if(!['ping','load','config','configSave','begin','chunk','commit'].includes(action))return response({ok:false,error:'操作不被允许'},400,origin);
  const params={...data};delete params.action;delete params.token;delete params.callback;delete params.session;const res=await google(action,params);
  return response(res,200,origin);
 }catch(e){const status=e.conflict?409:/令牌|尚未配置/.test(e.message)?503:502;return response({ok:false,error:e.message,conflict:!!e.conflict},status,origin)}
}
