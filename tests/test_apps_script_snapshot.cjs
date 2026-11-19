const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class MockRange {
  constructor(sheet, row, col, rows, cols) { Object.assign(this,{sheet,row,col,rows,cols}); }
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
  getMaxColumns(){return 30;}
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
const context={
  SpreadsheetApp:{openById(){return spreadsheet;}},
  LockService:{getScriptLock(){return {waitLock(){},releaseLock(){}};}},
  Utilities:{getUuid(){uuid++;return 'uuid-'+uuid;}},
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
console.log('PASS Apps Script snapshots: append-only commits, incomplete snapshot ignored, latest complete version loaded, normalized projections updated');
