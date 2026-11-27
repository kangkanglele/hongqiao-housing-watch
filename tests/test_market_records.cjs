'use strict';
/* Market record V2 regression: no unverified neighborhood snapshot UI.
 * Source marketScans are intentionally preserved unchanged in database state.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const c=fs.readFileSync(path.join(__dirname,'../site/index.html'),'utf8');
const a=c.indexOf('function renderListingChanges(){');
const b=c.indexOf('function renderChanges(){',a);
const end=c.indexOf('function renderBenchmark(){',b);
assert.ok(a>0&&b>a&&end>b,'market view functions must exist');
const state={
 marketScans:[{id:'MKT-20261119-01',community:'民畅园',listedAvg:12943.74,url:'https://tj.5i5j.com/ershoufang/392459/o1p3/'}],
 houses:[{id:'TJ-HQ-0001',community:'水木天成翠杨园',events:[
 {id:'E1',date:'2026-11-19T09:00:00Z',title:'首次采集',desc:'记录房源'},
 {id:'E2',date:'2026-11-20T09:00:00Z',title:'挂牌报价调整',desc:'55万 → 53万'}
 ]}]
};
const snapshot=JSON.stringify(state.marketScans);
const rendered=vm.runInNewContext(c.slice(a,end)+'\nrenderChanges();',{
 state,marketView:'records',window:{HQMarketMonitor:{renderTabs:()=>'<div>market tabs</div>',renderDashboard:()=>''}},esc:x=>String(x??'')
});
assert.ok(rendered.includes('单套房源变动流水'));
assert.ok(rendered.includes('55万 → 53万'));
assert.ok(rendered.indexOf('挂牌报价调整')<rendered.indexOf('首次采集'),'newer events first');
assert.ok(rendered.includes('data-open="TJ-HQ-0001"'),'retain listing detail shortcut');
assert.ok(!rendered.includes('小区挂牌扫描'));
assert.ok(!rendered.includes('挂牌均价'));
assert.ok(!rendered.includes('今日索引'));
assert.equal(JSON.stringify(state.marketScans),snapshot,'historical scans must not be deleted or mutated');
const empty=vm.runInNewContext(c.slice(a,end)+'\nrenderChanges();',{
 state:{marketScans:state.marketScans,houses:[]},marketView:'records',window:{HQMarketMonitor:{renderTabs:()=>'<div>market tabs</div>',renderDashboard:()=>''}},esc:x=>String(x??'')
});
assert.ok(empty.includes('暂无单套房源变动记录'));
assert.ok(!empty.includes('小区挂牌扫描'));
assert.ok(c.includes('marketScans:[]'),'retain legacy snapshot state model');
console.log('PASS market records: hide neighborhood scan UI, preserve snapshots, show traceable house events only');
