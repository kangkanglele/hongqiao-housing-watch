import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import handler from '../netlify/functions/hq-api.mjs';
process.env.HQ_GOOGLE_URL='https://script.google.com/macros/s/TESTDEPLOY/exec';
process.env.HQ_GOOGLE_TOKEN='unit-test-secret-NOT-PRODUCTION';
const testPin=String(randomInt(1000,10000));
const wrongPin=String((Number(testPin)+1)%9000+1000);
process.env.HQ_PIN=testPin;
process.env.HQ_SESSION_SECRET='unit-test-session-secret-with-plenty-of-entropy-123';
let version=8, staging=[];
let state={houses:[],scopes:[{id:'S6',name:'水木天成碧杉园',env:'B'}],quarantine:[],listingCandidates:[],linkLedger:[],marketScans:[{id:'A'}],saleLeads:[{id:'B'}],pageConfig:{colorPrimary:'#167a63'},visitSessions:[{id:'VISIT-OLD',entries:[]}]};
const oldFetch=globalThis.fetch;
let snapshotPostCalls=0;
globalThis.fetch=async (url,opts)=>{
 const u=new URL(url);assert.equal(u.hostname,'script.google.com');
 if(opts?.method==='POST'){
  const body=JSON.parse(opts.body);assert.equal(body.action,'snapshotCommit');assert.equal(body.token,process.env.HQ_GOOGLE_TOKEN);
  snapshotPostCalls++;
  let result;
  if(Number(body.expectedVersion)!==version)result={ok:false,conflict:true,version,error:'版本已变化'};
  else{state=structuredClone(body.state);version++;result={ok:true,version,updatedAt:'2026-11-19T09:00:01Z',houses:state.houses.length,scopes:state.scopes.length,normalizedUpdated:true,snapshotId:body.uploadId};}
  return new Response(JSON.stringify(result),{status:200,headers:{'content-type':'application/json'}});
 }
 assert.equal(u.searchParams.get('token'),process.env.HQ_GOOGLE_TOKEN);
 const q=Object.fromEntries(u.searchParams);let r;
 if(q.action==='load')r={ok:true,state:structuredClone(state),version,updatedAt:'2026-11-19T09:00:00Z'};
 else if(q.action==='ping')r={ok:true,version};
 else if(q.action==='begin')r=Number(q.expectedVersion)===version?{ok:true,uploadId:q.uploadId}:{ok:false,conflict:true,error:'版本已变化'};
 else if(q.action==='chunk'){staging[Number(q.index)]=q.data;r={ok:true}}
 else if(q.action==='commit'){state=JSON.parse(staging.join(''));version+=1;staging=[];r={ok:true,version,updatedAt:'2026-11-19T09:00:01Z'};}
 else if(q.action==='config')r={ok:true,config:state.pageConfig,hash:'hash'};
 else r={ok:false,error:'bad action'};
 return new Response('hq_service_cb('+JSON.stringify(r)+');',{status:200,headers:{'content-type':'text/javascript'}});
};
const root='https://hongqiao-housing-watch.netlify.app/.netlify/functions/hq-api';
async function call(action,data={},session=''){
 const req=new Request(root,{method:'POST',headers:{'content-type':'application/json','origin':'https://hongqiao-housing-watch.netlify.app',...(session?{authorization:'Bearer '+session}:{})},body:JSON.stringify({action,...data})});
 const res=await handler(req);return {status:res.status,body:await res.json()};
}
const bad=await call('login',{pin:wrongPin});assert.equal(bad.status,401);
const login=await call('login',{pin:testPin});assert.equal(login.status,200);const session=login.body.session;
assert.ok(session);const noAuth=await call('load');assert.equal(noAuth.status,200,'public read-only load should not require PIN');assert.equal(noAuth.body.version,8);
const publicPing=await call('ping');assert.equal(publicPing.status,200);
const previewHealth=await handler(new Request(root,{method:'POST',headers:{origin:'https://deploy-preview-8--hongqiao-housing-watch.netlify.app','content-type':'application/json'},body:JSON.stringify({action:'health'})}));
assert.equal(previewHealth.status,200,'approved Netlify PR preview alias may call health');
assert.equal((await previewHealth.json()).configured,true);
const hashedPreview=await handler(new Request(root,{method:'POST',headers:{origin:'https://6affb154e51ace2e467538f7--hongqiao-housing-watch.netlify.app','content-type':'application/json'},body:JSON.stringify({action:'health'})}));
assert.equal(hashedPreview.status,200,'Netlify deploy permalink origin must be allowed');
const untrustedPreview=await handler(new Request(root,{method:'POST',headers:{origin:'https://deploy-preview-8--another-site.netlify.app','content-type':'application/json'},body:JSON.stringify({action:'health'})}));
assert.equal(untrustedPreview.status,403,'other Netlify sites must remain blocked');

const noAuthWrite=await call('begin',{uploadId:'upload0001',expectedVersion:8});assert.equal(noAuthWrite.status,401,'mutations must still require a PIN session');
const old=await call('load',{},session);assert.equal(old.body.version,8);
const item={platform:'贝壳',platformId:'101126703003',url:'https://m.ke.com/tj/ershoufang/101126703003.html?shareSource=beike_app',community:'水木天成碧杉园',title:'碧杉园南向一居',area:71.31,price:56,rooms:'1居',floorBand:'高楼层/7层',totalFloors:7,orientation:'南'};
const first=await call('capture',{record:item},session);assert.equal(first.body.status,'created');assert.equal(state.houses.length,1);assert.equal(state.houses[0].price,56);assert.equal(state.marketScans.length,1);assert.equal(state.saleLeads.length,1);assert.equal(state.visitSessions.length,1);assert.equal(snapshotPostCalls,1,'one capture must use one Apps Script POST');
const repeat=await call('capture',{record:item},session);assert.equal(repeat.body.status,'unchanged');assert.equal(state.houses.length,1);assert.equal(snapshotPostCalls,1,'unchanged capture must not write a snapshot');
state.houses[0].defects=['duplex'];state.houses[0].note='现场测试重要备注';
const changed=await call('capture',{record:{...item,price:54}},session);assert.equal(changed.body.status,'updated');assert.equal(state.houses.length,1);assert.equal(state.houses[0].price,54);assert.ok(state.houses[0].defects.includes('duplex'));assert.equal(state.houses[0].note,'现场测试重要备注');assert.equal(state.houses[0].events.filter(x=>x.kind==='price').length,1);assert.equal(snapshotPostCalls,2,'price update must use one snapshot POST');
const unknown=await call('capture',{record:{...item,platform:'我爱我家',url:'https://m.5i5j.com/tj/ershoufang/819644244.html',platformId:'819644244',community:''}},session);
assert.equal(unknown.body.status,'pending_community');assert.equal(state.houses.length,1);assert.equal(state.listingCandidates.length,1);assert.equal(snapshotPostCalls,3,'pending candidate must use one snapshot POST');
const thirdParty=await call('capture',{record:{...item,url:'https://anjuke.com/tj/ershoufang/101126703003.html'}},session);assert.equal(thirdParty.status,502);assert.equal(state.houses.length,1);
const opts=await handler(new Request(root,{method:'OPTIONS',headers:{origin:'chrome-extension://abcdefgh'}}));assert.equal(opts.status,204);
assert.equal(snapshotPostCalls,3,'each successful mutation must be one Apps Script POST');
// V2: a new capture defaults to 未看; an explicit edit moves it into the timeless pending list.
assert.equal(state.houses[0].visitStatus,'未看');
const visitPending=await call('capture',{record:{...item,price:54,visitStatus:'看房',visitStatusExplicit:true}},session);
assert.equal(visitPending.body.status,'updated');
assert.equal(state.houses[0].visitStatus,'看房');
const beforeNoOp=snapshotPostCalls;
const recapture=await call('capture',{record:{...item,price:54,visitStatus:'未看',visitStatusExplicit:false}},session);
assert.equal(recapture.body.status,'unchanged','recapture without touching visit selector must preserve earlier intent');
assert.equal(state.houses[0].visitStatus,'看房');
assert.equal(snapshotPostCalls,beforeNoOp);
const visitSeen=await call('capture',{record:{...item,price:54,visitStatus:'看过',visitStatusExplicit:true}},session);
assert.equal(visitSeen.body.status,'updated');
assert.equal(state.houses[0].visitStatus,'看过');
assert.ok(Number.isFinite(Date.parse(state.houses[0].visitSeenAt)),'marking seen should keep a timestamp');
assert.ok(Number.isFinite(Date.parse(state.houses[0].visitSeenAt)),'marking seen should keep a timestamp');

// Drive media: an uploaded image/video is attached to the matching cloud house.
// A retry with the same Drive file ID must not create duplicate media or snapshots.
const beforeMediaAttach=snapshotPostCalls;
const imageMedia={driveFileId:'drive-image-test-123456',mimeType:'image/jpeg',name:'livingroom.jpg',size:12345,source:'网站照片',sourceUrl:'https://image1.ljcdn.com/real-estate/room.jpg',previewData:'data:image/jpeg;base64,AA=='};
const imageAttach=await call('mediaAttach',{houseId:state.houses[0].id,media:imageMedia},session);
assert.equal(imageAttach.status,200);
assert.equal(imageAttach.body.status,'added');
assert.equal(state.houses[0].media.length,1);
assert.equal(state.houses[0].media[0].driveFileId,imageMedia.driveFileId);
assert.equal(snapshotPostCalls,beforeMediaAttach+1,'first media association must save one atomic snapshot');
const duplicateImage=await call('mediaAttach',{houseId:state.houses[0].id,media:imageMedia},session);
assert.equal(duplicateImage.status,200);
assert.equal(duplicateImage.body.status,'unchanged');
assert.equal(state.houses[0].media.length,1,'retry must not duplicate the image');
assert.equal(snapshotPostCalls,beforeMediaAttach+1,'duplicate media association must not create another snapshot');
const videoAttach=await call('mediaAttach',{houseId:state.houses[0].id,media:{driveFileId:'drive-video-test-123456',mimeType:'video/mp4',name:'onsite.mp4',size:987654,source:'现场上传'}},session);
assert.equal(videoAttach.status,200);
assert.equal(videoAttach.body.status,'added');
assert.equal(state.houses[0].media.length,2);
assert.equal(state.houses[0].media[1].mimeType,'video/mp4');
assert.equal(snapshotPostCalls,beforeMediaAttach+2,'video association must also save one atomic snapshot');


// H5 now uses the exact same one-request Apps Script POST as the extension.
const snapshotInvalid=await call('snapshotCommit',{expectedVersion:version,state:{houses:'invalid',scopes:[]} },session);
assert.equal(snapshotInvalid.status,400,'H5 snapshots must include valid houses and scopes');
const snapshotAuth=await call('snapshotCommit',{expectedVersion:version,state},'');
assert.equal(snapshotAuth.status,401,'H5 snapshot commits must require a PIN session');
const staleSnapshot=await call('snapshotCommit',{expectedVersion:version-1,state},session);
assert.equal(staleSnapshot.status,409,'H5 stale-version commits must be rejected, not overwrite cloud state');
const beforeH5Writes=snapshotPostCalls;
const nextState=structuredClone(state);nextState.scopes[0].env='A';
const h5Snapshot=await call('snapshotCommit',{expectedVersion:version,state:nextState},session);
assert.equal(h5Snapshot.status,200);
assert.equal(h5Snapshot.body.ok,true);
assert.equal(snapshotPostCalls,beforeH5Writes+1,'one H5 save must become one Apps Script POST');
assert.equal(state.scopes[0].env,'A');
console.log('PASS H5 gateway atomic snapshot: PIN write gate, strict version check, one POST, remote readback');
console.log('PASS gateway 0.5: login, auth, one-request snapshot commit, dedup, price history, manual notes, unknown community, host whitelist, OPTIONS; snapshot v'+version);
globalThis.fetch=oldFetch;
