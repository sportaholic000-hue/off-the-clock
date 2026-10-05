import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import Database from 'better-sqlite3';
import {custom,flatRoof} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';

// Independent expected amounts are fixed before execution. Synthetic owners
// use an isolated directory; actual application persistence and real processes
// exercise the same locks and revision checks as owner saves and approval.
process.env.PRICEBOOK_PATH=fs.mkdtempSync(path.join(os.tmpdir(),'otc-final-repairs-'));
const store=await import('../server/priceBookService.js');
const bridge=await import('../server/src/quoteDoneBridge.js');
function owner(){
  const f=custom(),id='synthetic-final-'+randomUUID(),service=structuredClone(f.ownerPricing);
  delete service.origin;
  store.savePricebook(id,{services:[service],defaults:{currency:'CAD',...f.businessDefaults}});
  return {id,f};
}
function approve(id,revision){
  const book=store.loadPricebook(id);
  return bridge.approveApplicationService(id,book.services[0].id,{revision:revision||bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true});
}

for(const operation of ['save','approve'])test('N05: '+operation+' reports the durable book outcome when an auxiliary COMMIT would fail',()=>{
  const {id,f}=owner(),before=bridge.readApplicationBook(id),original=Database.prototype.exec;
  Database.prototype.exec=function(sql,...args){
    if(/^\s*COMMIT\b/i.test(sql))throw Object.assign(new Error('[SYNTHETIC] auxiliary commit EIO'),{code:'SQLITE_IOERR'});
    return original.call(this,sql,...args);
  };
  let result;
  try{result=operation==='approve'?approve(id,before.revision):bridge.saveApplicationBook(id,{...before,defaults:{...before.defaults,travelFee:9}});}
  finally{Database.prototype.exec=original;}
  assert.equal(result.success,true);
  const saved=store.loadPricebook(id);
  assert.equal(store.pricebookSaveUnconfirmed(id),false);
  if(operation==='save')assert.equal(saved.defaults.travelFee,900,'persisted money remains cents');
  else{
    assert.ok(saved.services[0].quoteDoneApproval);
    assert.equal(bridge.applicationStatus(saved.services[0],saved).status,'QUOTING LIVE');
    const q=bridge.calculateApplicationQuote(saved,saved.services[0],{serviceId:saved.services[0].id,customerInputs:f.customerInputs},{ownerId:id});
    assert.equal(q.customerResult.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(q.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,12500);
  }
});

for(const operation of ['save','approve'])test('N05: '+operation+' keeps its confirmed result after an error closing the released lock',()=>{
  const {id}=owner(),before=bridge.readApplicationBook(id),original=Database.prototype.close;let injected=false;
  Database.prototype.close=function(...args){
    const result=original.apply(this,args);
    if(!injected){injected=true;throw Object.assign(new Error('[SYNTHETIC] close reported EIO after releasing the lock'),{code:'SQLITE_IOERR'});}
    return result;
  };
  let result;
  try{result=operation==='approve'?approve(id,before.revision):bridge.saveApplicationBook(id,{...before,defaults:{...before.defaults,travelFee:9}});}
  finally{Database.prototype.close=original;}
  assert.equal(injected,true);assert.equal(result.success,true);assert.equal(store.pricebookSaveUnconfirmed(id),false);
  const current=bridge.readApplicationBook(id);
  assert.equal(bridge.saveApplicationBook(id,{...current,defaults:{...current.defaults,travelFee:10}}).success,true,'the released owner lock permits the next confirmed save');
  assert.equal(bridge.readApplicationBook(id).defaults.travelFee,10);
});

test('Save-lock controls: nested synchronous writes work and an async callback is rejected before it starts',()=>{
  const {id}=owner();let ran=false;
  assert.throws(()=>store.withPricebookLock(id,async()=>{ran=true;}),/synchronously/);assert.equal(ran,false);
  assert.equal(store.withPricebookLock(id,()=>store.withPricebookLock(id,()=>true)),true);
  const before=bridge.readApplicationBook(id);
  assert.equal(store.withPricebookLock(id,()=>bridge.saveApplicationBook(id,{...before,defaults:{...before.defaults,travelFee:9}})).success,true);
  assert.equal(bridge.readApplicationBook(id).defaults.travelFee,9);
});

function hold(ownerId){
  const ready=path.join(process.env.PRICEBOOK_PATH,ownerId+'-ready'),release=path.join(process.env.PRICEBOOK_PATH,ownerId+'-release');
  const url=new URL('../server/priceBookService.js',import.meta.url).href;
  const script=`import fs from 'node:fs';const store=await import(${JSON.stringify(url)});store.withPricebookLock(${JSON.stringify(ownerId)},()=>{fs.writeFileSync(${JSON.stringify(ready)},'held');const start=Date.now();while(!fs.existsSync(${JSON.stringify(release)})){if(Date.now()-start>15000)throw Error('synthetic holder timeout');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);}});`;
  const child=spawn(process.execPath,['--input-type=module','-e',script],{env:process.env,stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',c=>stderr+=c);
  const ended=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>resolve({code,signal,stderr}));});
  return {ready,release,child,ended};
}
test('N06: a real living holder blocks its own owner and does not block another owner',async()=>{
  const a=owner(),b=owner(),held=hold(a.id),start=Date.now();
  try{
    while(!fs.existsSync(held.ready)){
      assert.equal(held.child.exitCode,null,'holder exited before acquiring its lock');
      assert.ok(Date.now()-start<5000,'holder must acquire the lock promptly');
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    const same=bridge.readApplicationBook(a.id);
    assert.throws(()=>bridge.saveApplicationBook(a.id,{...same,defaults:{...same.defaults,travelFee:9}}),{code:'PRICEBOOK_BUSY',statusCode:409});
    assert.equal(bridge.readApplicationBook(a.id).defaults.travelFee,0);
    const other=bridge.readApplicationBook(b.id),quick=performance.now();
    const accepted=bridge.saveApplicationBook(b.id,{...other,defaults:{...other.defaults,travelFee:9}});
    assert.equal(accepted.success,true);
    assert.ok(performance.now()-quick<1500,'the unrelated owner must not wait for the first holder');
    assert.equal(bridge.readApplicationBook(b.id).defaults.travelFee,9);
  }finally{fs.writeFileSync(held.release,'resume');const exit=await held.ended;assert.equal(exit.code,0,exit.stderr);}
});

function catalog(size,scoped=false){
  const f=scoped?structuredClone(measuredScopeCases().find(x=>x.id==='commercial-installed').input):flatRoof(),p=f.ownerPricing.pricing;
  for(const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'])p[field]={};
  f.ownerPricing.knownOfferings={membraneType:{},replacementMembraneType:{}};
  for(let i=0;i<size;i++){
    const key='membrane_'+i;
    p.laborPerSqft[key]=500;p.membraneCostPerSqft[key]=700;p.tearOffPerSqft[key]=200;
    f.ownerPricing.knownOfferings.membraneType[key]=randomUUID();f.ownerPricing.knownOfferings.replacementMembraneType[key]=randomUUID();
  }
  return f;
}
function request(f,replacement,existing){
  const q=structuredClone(f);Object.assign(q.customerInputs,{replacementMembraneType:replacement,membraneType:existing});
  q.customerInputs.confirmedFacts=Object.fromEntries([['replacementMembraneType',replacement],['membraneType',existing]].map(([field,value])=>[field,{status:'identified',field,value,offeringId:q.ownerPricing.knownOfferings[field][value]}]));
  return q;
}
for(const scoped of [false,true])test('N03: interior live pairs keep partial 40 x 40 '+(scoped?'commercial':'ordinary')+' coverage bounded',()=>{
  const f=catalog(40,scoped);delete f.ownerPricing.pricing.membraneCostPerSqft.membrane_0;delete f.ownerPricing.knownOfferings.membraneType.membrane_0;
  const before=JSON.stringify(f),start=performance.now(),ownerStatus=vNextServiceStatus(f.ownerPricing,f.businessDefaults),ms=performance.now()-start;
  assert.equal(ownerStatus.status,'QUOTING LIVE');
  assert.ok(ms<2000,`partial owner readiness took ${Math.round(ms)} ms`);
  assert.ok(ownerStatus.productCoverage.length<=80,'a live interior reference avoids evaluating the full grid');
  assert.ok(ownerStatus.productCoverage.some(p=>p.selection.replacementMembraneType==='membrane_0'&&!p.configurationComplete));
  assert.ok(ownerStatus.productCoverage.some(p=>p.selection.membraneType==='membrane_0'&&!p.configurationComplete));
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:true}).status,ownerStatus.status);
  const quote=generateQuoteVNext(request(f,'membrane_1','membrane_1'));
  assert.equal(quote.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(quote.options[0].calculationRecord.scenarios.mid.finalTotalCents,scoped?1690000:1470000);
  assert.equal(JSON.stringify(f),before,'readiness does not mutate rates, classifications or registrations');
  console.log('partial 40 x 40 '+(scoped?'commercial':'ordinary')+' owner readiness ms:',Math.round(ms));
});
test('N03 control: no live interior pair still returns exact incomplete coverage and the customer check agrees',()=>{
  // Keep structurally valid maps but leave each material price unconfigured.
  // A malformed empty map is a global blocker and now exits before pair search.
  const f=catalog(12);f.ownerPricing.pricing.membraneCostPerSqft=Object.fromEntries(Object.keys(f.ownerPricing.pricing.membraneCostPerSqft).map(key=>[key,0]));
  const full=vNextServiceStatus(f.ownerPricing,f.businessDefaults),quick=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:true});
  assert.equal(full.status,'NEEDS PRICING');assert.equal(quick.status,full.status);
  assert.equal(full.productCoverage.length,144);assert.ok(full.productCoverage.every(p=>!p.configurationComplete));
  assert.deepEqual(quick.validationErrors,full.validationErrors);
});
test('N07: large coverage identifies the exact failing partner and leaves another ready pairing quotable',()=>{
  const f=catalog(11),p=f.ownerPricing.pricing;
  p.laborPerSqft.membrane_1=300000000;p.tearOffPerSqft.membrane_0=30000000;
  f.businessDefaults.markupPercent=500;f.businessDefaults.markupApplies.material=false;
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults),bad=status.productCoverage.find(p=>p.selection.replacementMembraneType==='membrane_1');
  assert.equal(status.status,'QUOTING LIVE');assert.equal(bad.configurationComplete,false);
  assert.equal(bad.selection.membraneType,'membrane_0','coverage must retain the reference partner, not claim a generic product failure');
  assert.match(bad.coverageMessage,/two products shown/);
  assert.ok(status.productCoverage.every(p=>Object.keys(p.selection).length===2));
  const good=request(f,'membrane_1','membrane_1');Object.assign(good.customerInputs,{roofSqft:2000000,existingLayers:10,accessDifficulty:'difficult'});
  const q=generateQuoteVNext(good);
  // 2m*300m*1.3*6 labor +2m*10*200*1.3*6 removal +2m*700*1.1 material.
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,4680032740000000);
  const unsafe=request(good,'membrane_1','membrane_0');assert.equal(generateQuoteVNext(unsafe).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
