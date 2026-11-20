'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'site/index.html'),'utf8');
const start=html.indexOf('function visitStateOf('),mid=html.indexOf('const VISIT_RESULTS',start);
const begin=html.indexOf('function renderVisits(){'),end=html.indexOf('function renderVisitSession(',begin);
assert.ok(start>=0&&mid>start&&begin>=0&&end>begin);
const helper=html.slice(start,mid),view=html.slice(begin,end);
const day='2026-11-18T09:30:00.000Z',marked='2026-11-20T09:00:00.000Z';
const houses=[
 {id:'TJ-HQ-0001',title:'候选房源',community:'民畅园',visitStatus:'看房',price:52,area:55,sources:[],media:[]},
 {id:'TJ-HQ-0002',title:'已看房源',community:'水木天成翠杨园',visitStatus:'看过',visitSeenAt:marked,price:73,area:88,sources:[],
  media:[{source:'网站照片',mimeType:'image/jpeg',shotAt:'2026-10-01T10:00:00Z'},
         {source:'现场上传',mimeType:'image/jpeg',shotAt:day}]},
 {id:'TJ-HQ-0003',title:'无照片房源',community:'子牙南里',visitStatus:'看过',visitSeenAt:'2026-11-19T12:30:00Z',media:[],sources:[]}
];
const ctx={state:{houses},visitView:'pending',esc:s=>String(s??''),visitsForHouse:()=>[],validSources:()=>[],firstImage:()=>'',Date,Map,String,Number,Array};
const sandbox=vm.createContext(ctx);
vm.runInContext(helper+'\n'+view,sandbox);
assert.equal(vm.runInContext('visitStateOf(state.houses[0])',sandbox),'看房');
assert.equal(vm.runInContext('visitHistoryMeta(state.houses[1]).time',sandbox),day);
assert.equal(vm.runInContext('visitHistoryMeta(state.houses[2]).kind',sandbox),'标记看过时间');
const pending=vm.runInContext('renderVisits()',sandbox);
assert.ok(pending.includes('候选房源')&&!pending.includes('已看房源'));
assert.ok(!pending.includes('今日待看')&&!pending.includes('模拟 Chrome 加入')&&!pending.includes('从已有房源选择'));
ctx.visitView='history';
const history=vm.runInContext('renderVisits()',sandbox);
assert.ok(history.includes('已看房源')&&history.includes('无照片房源'));
assert.ok(history.indexOf('2026-11-19')<history.indexOf('2026-11-18'),'sort historical dates descending');
assert.ok(!history.includes('2026-10-01'),'website photos must not determine visit time');
vm.runInContext('visitApplyStatus(state.houses[0],"看过")',sandbox);
assert.equal(houses[0].visitStatus,'看过');
assert.ok(Number.isFinite(Date.parse(houses[0].visitSeenAt)));
assert.equal(houses[0].visitStatusHistory.length,1);

const code=fs.readFileSync(path.join(root,'site/media-client.js'),'utf8');
const mc={window:{},Blob,Uint8Array,DataView,Date,URL,Promise};
vm.runInNewContext(code,mc);
const jpeg=Buffer.alloc(100);
jpeg.writeUInt16BE(0xffd8,0);jpeg.writeUInt16BE(0xffe1,2);jpeg.writeUInt16BE(96,4);
Buffer.from('Exif\0\0').copy(jpeg,6);
jpeg.write('II',12);jpeg.writeUInt16LE(42,14);jpeg.writeUInt32LE(8,16);
jpeg.writeUInt16LE(1,20);jpeg.writeUInt16LE(0x8769,22);jpeg.writeUInt16LE(4,24);jpeg.writeUInt32LE(1,26);jpeg.writeUInt32LE(26,30);
jpeg.writeUInt16LE(1,38);jpeg.writeUInt16LE(0x9003,40);jpeg.writeUInt16LE(2,42);jpeg.writeUInt32LE(20,44);jpeg.writeUInt32LE(44,48);
Buffer.from('2026:11:18 16:30:15\0').copy(jpeg,56);
const pic=new Blob([jpeg],{type:'image/jpeg'});
(async()=>{
 const photoMeta=await mc.window.HQMedia.extractCapturedAt(pic);
 assert.ok(photoMeta&&photoMeta.shotAt&&photoMeta.shotAt.startsWith('2026-11-18'),JSON.stringify(photoMeta));
 const nothing=await mc.window.HQMedia.extractCapturedAt(new Blob([Buffer.from('not exif')],{type:'image/jpeg'}));
 assert.equal(nothing,null);
 console.log('PASS visit V2: timeless pending, photographed history, website image exclusion, visit changes, EXIF');
})().catch(e=>{console.error(e);process.exitCode=1});
