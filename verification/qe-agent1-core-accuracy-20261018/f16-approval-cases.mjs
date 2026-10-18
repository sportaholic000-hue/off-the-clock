import '../../test/pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as bridge from '../../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook,pricebookDirectory,pricebookSaveUnconfirmed} from '../../server/priceBookService.js';
import {db} from '../../server/src/db.js';

const historical=JSON.parse(readFileSync(new URL('./f16-legacy-approvals.json',import.meta.url)));
const group='roofing_replacement_20261016';
const minimumMessage='Correct the roof replacement minimum, including price options, to an exact dollar-and-cent amount before confirming it. The stored value has not been rounded.';
function snapshot(owner){
  const book=loadPricebook(owner);
  return {book,revision:bridge.bookRevision(book),bytes:readFileSync(join(pricebookDirectory(),owner+'.json'),'utf8'),
    unconfirmed:pricebookSaveUnconfirmed(owner),
    creation:db.prepare('SELECT * FROM priceBookCreationRecords WHERE ownerId = ?').get(owner)};
}
function inputFor(book,operation){
  return {revision:bridge.bookRevision(book),...(operation==='adoption'?{adoptStartingValueGroup:group}:{
    confirmConfiguration:true,confirmLegacySettings:true,
    fields:[...new Set([...bridge.applicationStatus(book.services[0],book).confirmationFields,'zeroPricePolicy'])],
    zeroClassification:{freeCompleteService:false,freeTiers:[],includedPrices:{}}
  })};
}
function restore(item){savePricebook(item.book.ownerId,structuredClone(item.book));return snapshot(item.book.ownerId);}
function price(service,location){return location==='base'?service.pricing:service.tiers[0].overrides;}

export function approvalPrecisionCases(field){
  const cases=historical.cases.filter(item=>item.field===field);
  assert.equal(cases.length,4,'Both base/tier and manual/AI pre-fix receipts must exist');
  for(const item of cases)for(const operation of ['approval','adoption'])test(`F16 ${field} ${item.location} ${item.source} rejects ${operation} without a durable write`,()=>{
    const before=restore(item),owner=before.book.ownerId,service=before.book.services[0];
    assert.equal(price(service,item.location)[field],100.5);
    assert.equal(service.quoteDoneApproval.engineVersion,bridge.ENGINE_VERSION);
    assert.equal(bridge.applicationStatus(service,before.book).approvalCurrent,true,'Authentic pre-fix receipt remains current before the attempted operation');
    assert.throws(()=>bridge.approveApplicationService(owner,service.id,inputFor(before.book,operation)),error=>{
      assert.equal(error.statusCode,400);assert.match(error.message,/A fixed charge or minimum must be an exact whole-cent amount; it cannot be rounded during save\.$/);
      assert.equal(error.path,item.location==='base'?`services[0].pricing.${field}`:`services[0].tiers[0].effectivePricing.${field}`);
      return true;
    });
    assert.deepEqual(snapshot(owner),before,'Entire durable book, receipt, revision, marker and creation record remain unchanged');
  });
  for(const item of cases.filter(row=>row.source==='MANUAL'))test(`F16 ${field} ${item.location} unapproved legacy prices cannot gain a receipt`,()=>{
    const book=structuredClone(item.book);delete book.services[0].quoteDoneApproval;
    savePricebook(book.ownerId,book);const before=snapshot(book.ownerId);
    assert.throws(()=>bridge.approveApplicationService(book.ownerId,book.services[0].id,inputFor(before.book,'approval')),error=>error.statusCode===400&&/A fixed charge or minimum must be an exact whole-cent amount; it cannot be rounded during save\.$/.test(error.message));
    assert.deepEqual(snapshot(book.ownerId),before);
    assert.equal(loadPricebook(book.ownerId).services[0].quoteDoneApproval,undefined);
  });
  for(const item of cases)test(`F16 ${field} ${item.location} ${item.source} accepts whole cents, measured fractions and legitimate adoption`,()=>{
    const book=structuredClone(item.book),service=book.services[0];
    price(service,item.location)[field]=100;
    savePricebook(book.ownerId,book);let current=loadPricebook(book.ownerId);
    for(const operation of ['approval','adoption']){
      const result=bridge.approveApplicationService(book.ownerId,service.id,inputFor(current,operation));
      assert.equal(result.success,true);current=loadPricebook(book.ownerId);
      assert.equal(price(current.services[0],item.location)[field],100,'$1.00 each remains 100 cents');
      assert.equal(price(current.services[0],item.location).dripEdgePerLF,100.5,'$1.005/LF remains 100.5 cents/LF');
      assert.equal(bridge.applicationStatus(current.services[0],current).approvalCurrent,true);
      assert.equal(current.services[0].quoteDoneApproval.operation,operation==='adoption'?'owner_adopted_starting_value_group':'owner_confirmed_quotedone_registration');
    }
    assert.equal(current.services[0].startingValueAdoptions[group].mode,'adopted');
    const states=Object.values(current.services[0].startingValueState).filter(row=>row.group===group);
    assert.ok(states.length>0);assert.ok(states.every(row=>row.confirmed===true&&!row.pendingAdoption));
  });
}

export function roofMinimumCases(){
  for(const location of ['root','base','tier'])for(const operation of ['approval','adoption'])test(`F16 preserves exact roofing-minimum diagnostic for ${location} ${operation}`,()=>{
    const item=historical.cases.find(row=>row.field==='deckingPerSheet'&&row.location==='tier'&&row.source==='MANUAL');
    const book=structuredClone(item.book),service=book.services[0];service.tiers[0].overrides.deckingPerSheet=100;
    if(location==='root'){delete service.pricing.minimumJob;service.minimumJob=100.5;}
    else price(service,location).minimumJob=100.5;
    savePricebook(book.ownerId,book);const before=snapshot(book.ownerId);
    assert.throws(()=>bridge.approveApplicationService(book.ownerId,service.id,inputFor(before.book,operation)),error=>{
      assert.equal(error.statusCode,422);assert.equal(error.message,minimumMessage);return true;
    });
    assert.deepEqual(snapshot(book.ownerId),before);
  });
}
