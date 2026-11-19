import assert from 'node:assert/strict';
import handler from '../netlify/functions/hq-api.mjs';
process.env.HQ_GOOGLE_URL='https://script.google.com/macros/s/TESTDEPLOY/exec';
process.env.HQ_GOOGLE_TOKEN='unit-test-secret-NOT-PRODUCTION';
process.env.HQ_PIN='1111';
process.env.HQ_SESSION_SECRET='unit-test-session-secret-with-plenty-of-entropy-123';
let version=8, staging=[];
let state={houses:[],scopes:[{id:'S6',name:'水木天成碧杉园',env:'B'}],quarantine:[],listingCandidates:[],linkLedger:[],marketScans:[{id:'A'}],saleLeads:[{id:'B'}],pageConfig:{colorPrimary:'#167a63'},visitSessions:[{id:'VISIT-OLD',entries:[]}]};
const oldFetch=globalThis.fetch;
globalThis.fetch=async (url,opts)=>{
 const u=new URL(url);assert.equal(u.hostname,'script.google.com');assert.equal(u.searchParams.get('token'),process.env.HQ_GOOGLE_TOKEN);
 const q=Object.fromEntries(u.searchParams);let r;
 if(q.action==='load')r={ok:true,state:structuredClone(state),version,updatedAt:'2026-11-19T09:00:00Z'};
 else if(q.action==='ping')r={ok:true,version};
 else if(q.action==='begin')r=Number(q.expectedVersion)===version?{ok:true,uploadId:q.uploadId}:{ok:false,conflict:true,error:'版本已变化'};
 else if(q.action==='chunk'){staging[Number(q.index)]=q.data;r={ok:true}}
 else if(q.action==='commit'){
  state=JSON.parse(staging.join(''));version+=1;staging=[];r={ok:true,version,updatedAt:'2026-11-19T09:00:01Z'};
 }else if(q.action==='config')r={ok:true,config:state.pageConfig,hash:'hash'};
 else r={ok:false,error:'bad action'};
 return new Response('hq_service_cb('+JSON.stringify(r)+');',{status:200,headers:{'content-type':'text/javascript'}});
};
const root='https://hongqiao-housing-watch.netlify.app/.netlify/functions/hq-api';
async function call(action,data={},session=''){
 const req=new Request(root,{method:'POST',headers:{'content-type':'application/json','origin':'https://hongqiao-housing-watch.netlify.app',...(session?{authorization:'Bearer '+session}:{})},body:JSON.stringify({action,...data})});
 const res=await handler(req);return {status:res.status,body:await res.json()};
}
const bad=await call('login',{pin:'1234'});assert.equal(bad.status,401);
const login=await call('login',{pin:'1111'});assert.equal(login.status,200);const session=login.body.session;
assert.ok(session);const noAuth=await call('load');assert.equal(noAuth.status,401);
const old=await call('load',{},session);assert.equal(old.body.version,8);
const item={platform:'贝壳',platformId:'101126703003',url:'https://m.ke.com/tj/ershoufang/101126703003.html?shareSource=beike_app',community:'水木天成碧杉园',title:'碧杉园南向一居',area:71.31,price:56,rooms:'1居',floorBand:'高楼层/7层',totalFloors:7,orientation:'南'};
const first=await call('capture',{record:item},session);assert.equal(first.body.status,'created');assert.equal(state.houses.length,1);assert.equal(state.houses[0].price,56);assert.equal(state.marketScans.length,1);assert.equal(state.saleLeads.length,1);assert.equal(state.visitSessions.length,1);
const repeat=await call('capture',{record:item},session);assert.equal(repeat.body.status,'unchanged');assert.equal(state.houses.length,1);
state.houses[0].defects=['duplex'];state.houses[0].note='现场测试重要备注';
const changed=await call('capture',{record:{...item,price:54}},session);assert.equal(changed.body.status,'updated');assert.equal(state.houses.length,1);assert.equal(state.houses[0].price,54);assert.ok(state.houses[0].defects.includes('duplex'));assert.equal(state.houses[0].note,'现场测试重要备注');assert.equal(state.houses[0].events.filter(x=>x.kind==='price').length,1);
const unknown=await call('capture',{record:{...item,platform:'我爱我家',url:'https://m.5i5j.com/tj/ershoufang/819644244.html',platformId:'819644244',community:''}},session);
assert.equal(unknown.body.status,'pending_community');assert.equal(state.houses.length,1);assert.equal(state.listingCandidates.length,1);
const thirdParty=await call('capture',{record:{...item,url:'https://anjuke.com/tj/ershoufang/101126703003.html'}},session);assert.equal(thirdParty.status,502);assert.equal(state.houses.length,1);
const opts=await handler(new Request(root,{method:'OPTIONS',headers:{origin:'chrome-extension://abcdefgh'}}));assert.equal(opts.status,204);
console.log('PASS gateway: login, auth, first save, dedup, price history, manual notes, unknown community, host whitelist, OPTIONS; snapshot v'+version);
globalThis.fetch=oldFetch;
