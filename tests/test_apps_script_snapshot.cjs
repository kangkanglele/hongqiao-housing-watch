const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

class MockRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this,{sheet,row,col,rows,cols}); }
  getValue() { return this.getValues()[0][0]; }
  setValue(value) { this.setValues([[value]]); }
  getValues() {
    const out=[];
    for(let r=0;r<this.rows;r++){
      const line=[];
      for(let c=0;c<this.cols;c++) line.push(this.sheet.cells[this.row-1+r]?.[this.col-1+c] ?? '');
      out.push(line);
    }
    return out;
  }
  setValues(values) {
    for(let r=0;r<values.length;r++){
      const target=this.sheet.cells[this.row-1+r] ||= [];
      for(let c=0;c<values[r].length;c++) target[this.col-1+c]=values[r][c];
    }
  }
  clearContent() {
    for(let r=0;r<this.rows;r++){
      const target=this.sheet.cells[this.row-1+r] ||= [];
      for(let c=0;c<this.cols;c++) target[this.col-1+c]='';
    }
  }
}
class MockSheet {
  constructor(name){this.name=name;this.cells=[];}
  getLastRow(){
    for(let i=this.cells.length-1;i>=0;i--) if((this.cells[i]||[]).some(v=>v!==''&&v!==null&&v!==undefined)) return i+1;
    return 0;
  }
  getLastColumn(){return Math.max(0,...this.cells.map(row=>row.reduce((m,v,i)=>v!==''&&v!==null&&v!==undefined?i+1:m,0)));}
  getMaxColumns(){return 30;}
  deleteRow(n){this.cells.splice(n-1,1);}
  insertColumnsAfter(){}
  getRange(r,c,nr,nc){return new MockRange(this,r,c,nr,nc);}
  appendRow(row){this.getRange(this.getLastRow()+1,1,1,row.length).setValues([row]);}
}
const sheets=new Map();
const spreadsheet={
  getSheetByName(name){return sheets.get(name)||null;},
  insertSheet(name){const s=new MockSheet(name);sheets.set(name,s);return s;}
};
let uuid=0;
const token='unit-test-secret';
const context={
  SpreadsheetApp:{openById(){return spreadsheet;}},
  LockService:{getScriptLock(){return {waitLock(){},releaseLock(){}};}},
  PropertiesService:{getScriptProperties(){return {getProperty(k){return k==='API_TOKEN'?token:null;},setProperty(){}};}},
  ContentService:{MimeType:{JAVASCRIPT:'application/javascript',JSON:'application/json'},createTextOutput(text){return {text,setMimeType(){return this;}};}},
  Utilities:{
    getUuid(){uuid++;return 'uuid-'+uuid;},
    DigestAlgorithm:{SHA_256:'SHA-256'},Charset:{UTF_8:'utf8'},
    computeDigest(_algorithm,value){return Array.from(crypto.createHash('sha256').update(String(value),'utf8').digest()).map(b=>b>127?b-256:b);}
  },
  console
};
const source=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs.example'),'utf8');
vm.runInNewContext(source,context);

function upload(uploadId,expectedVersion,state){
  const payload=JSON.stringify(state);
  const chunks=Array.from(payload);
  const size=380;
  const total=Math.ceil(chunks.length/size);
  context.beginUpload_({uploadId,expectedVersion});
  for(let i=0;i<total;i++){
    context.writeChunk_({uploadId,index:i,total,data:chunks.slice(i*size,(i+1)*size).join(''),expectedVersion});
  }
  return context.commitUpload_({uploadId});
}

const first={houses:[],scopes:[{id:'S1',name:'测试小区'}],marker:'snapshot-one'};
const one=upload('upload0001',0,first);
assert.equal(one.version,1);
assert.equal(context.loadState_().state.marker,'snapshot-one');

const second={houses:[{id:'TJ-HQ-0001',note:'历史备注保留'}],scopes:[{id:'S1',name:'测试小区'}],marker:'snapshot-two'};
const two=upload('upload0002',1,second);
assert.equal(two.version,2);
assert.equal(context.loadState_().state.marker,'snapshot-two');
const stateSheet=sheets.get('云端状态');
assert.equal(stateSheet.getLastRow(),3,'the first snapshot row must remain after the second commit');

// An incomplete newer snapshot must never replace the last complete version.
stateSheet.appendRow(['SNAP-PARTIAL',3,0,2,new Date().toISOString(),'{"houses":[],']);
assert.equal(context.loadState_().version,2);
assert.equal(context.loadState_().state.marker,'snapshot-two');

const third={houses:second.houses,scopes:second.scopes,marker:'snapshot-three'};
const three=upload('upload0003',2,third);
assert.equal(three.version,3);
assert.equal(context.loadState_().state.marker,'snapshot-three');
assert.ok(stateSheet.getLastRow()>=5,'previous and newly committed snapshots must be retained');
assert.equal(three.normalizedUpdated,true);

const testHouse={id:'TJ-HQ-TEST-0001',community:'水木天成碧杉园',title:'【测试数据】碧杉园两室',origin:'模拟数据',area:71.31,price:56,rooms:'2室1厅',floor:5,total:7,elevator:'有',orient:'南',decoration:'简装',env:'B',noise:'未知',duplex:false,top:false,legal:'待核实',firstSeen:'2026-11-19',lastSeen:'2026-11-19',suitability:'待判断',stage:'测试',note:'仅用于验证云端写入，非真实房源',sources:[{channel:'贝壳',platformId:'TEST000001',url:'https://m.ke.com/tj/ershoufang/12345678901.html',originalUrl:'https://m.ke.com/tj/ershoufang/12345678901.html',urlType:'官方单套详情',relation:'测试输入',checked:'2026-11-19'}],events:[{id:'EVT-TEST-1',date:'2026-11-19',kind:'manual',title:'测试录入',desc:'测试数据，不作为市场样本'}]};
const postState={...third,houses:[...second.houses,testHouse]};
function postSnapshot(uploadId,expectedVersion,state){
  const response=context.doPost({postData:{contents:JSON.stringify({action:'snapshotCommit',token,uploadId,expectedVersion,state})}});
  return JSON.parse(response.text);
}
const direct=postSnapshot('direct-post-test-0001',3,postState);
assert.equal(direct.ok,true);assert.equal(direct.version,4);assert.equal(direct.houses,2);assert.equal(direct.normalizedUpdated,true);
assert.equal(context.loadState_().state.houses.length,2);
assert.equal(sheets.get('房源').getLastRow(),3,'existing house + sample house must both remain');
assert.equal(sheets.get('模拟样本').getLastRow(),2,'the test house belongs only in the simulation projection');
const duplicate=postSnapshot('direct-post-test-0001',3,postState);
assert.equal(duplicate.ok,true);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.version,4);
assert.equal(sheets.get('房源').getLastRow(),3,'retry must not duplicate the sample house');
const stale=postSnapshot('direct-post-test-0002',3,postState);
assert.equal(stale.ok,false);assert.equal(stale.conflict,true);assert.equal(context.loadState_().version,4);
const badToken=postSnapshot('direct-post-test-0003',4,{...postState});
assert.equal(badToken.ok,false);assert.match(badToken.error,/令牌/);

console.log('PASS Apps Script snapshots: append-only commits, incomplete snapshot ignored, latest complete version loaded, normalized projections updated');
console.log('PASS Apps Script POST 0.5: one-request test house, read-back, simulation projection, idempotent retry, version conflict, token validation');
