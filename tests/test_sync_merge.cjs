const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const context={URL,Date,JSON,Set,Map,Object,Array,String,Number};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../site/sync-merge.js'),'utf8'),context);
const merge=context.HQSyncMerge.mergeStates;
const source='https://m.ke.com/tj/ershoufang/101126703003.html';
const local={
 version:4,
 houses:[
  {id:'LOCAL-1',title:'本地新增',sources:[{channel:'贝壳',url:'https://m.ke.com/tj/ershoufang/11111111111.html'}],events:[{id:'L-E1',title:'本地事件'}]},
  {id:'SHARED-1',title:'本地标题',note:'本地备注',sources:[{channel:'贝壳',url:source}],events:[{id:'E-LOCAL',title:'本地新增事件'}]}
 ],
 scopes:[{id:'S-LOCAL',name:'本地小区'}],
 marketScans:[{id:'SCAN-LOCAL',community:'本地扫描'}],
 visitSessions:[{id:'VISIT-1',date:'2026-11-19',entries:[{id:'ENTRY-LOCAL',houseId:'LOCAL-1'}]}],
 pageConfig:{colorPrimary:'#123456'}
};
const remote={
 version:4,
 houses:[
  {id:'REMOTE-1',title:'云端新增',sources:[{channel:'我爱我家',url:'https://m.5i5j.com/tj/ershoufang/22222222222.html'}]},
  {id:'SHARED-1',title:'云端标题',note:'云端备注',price:70,sources:[{channel:'贝壳',url:source}],events:[{id:'E-REMOTE',title:'云端新增事件'}]}
 ],
 scopes:[{id:'S-REMOTE',name:'云端小区'}],
 marketScans:[{id:'SCAN-REMOTE',community:'云端扫描'}],
 visitSessions:[{id:'VISIT-1',date:'2026-11-19',entries:[{id:'ENTRY-REMOTE',houseId:'REMOTE-1'}]}],
 pageConfig:{colorBackground:'#ffffff'}
};
const result=merge(local,remote,{localVersion:7,remoteVersion:8});
const state=result.state;
assert.equal(state.houses.length,3,'local-only, remote-only, and shared houses should all survive');
assert.ok(state.houses.some(x=>x.id==='LOCAL-1'));
assert.ok(state.houses.some(x=>x.id==='REMOTE-1'));
const shared=state.houses.find(x=>x.id==='SHARED-1');
assert.equal(shared.title,'本地标题','local value wins a true same-field conflict');
assert.equal(shared.price,70,'remote-only fields must be preserved');
assert.deepEqual(shared.events.map(x=>x.id).sort(),['E-LOCAL','E-REMOTE']);
assert.equal(state.scopes.length,2);
assert.equal(state.marketScans.length,2);
assert.deepEqual(state.visitSessions[0].entries.map(x=>x.id).sort(),['ENTRY-LOCAL','ENTRY-REMOTE']);
assert.equal(state.pageConfig.colorPrimary,'#123456');
assert.equal(state.pageConfig.colorBackground,'#ffffff');
assert.equal(result.conflictCount>0,true);
assert.ok(state.syncConflicts[0].details.some(x=>x.path.includes('SHARED-1')&&x.remote==='云端标题'));
console.log('PASS sync merge: union of both devices, nested event merge, local edit retained, remote field retained, conflict audit archived');
