// Backlog (verdicts audit): base gravel had no order increment, unlike mulch,
// topsoil and ready-mix. Expected, written before the change (100 sq ft slab,
// 4 inch base, 20% compaction allowance, $50 per cubic yard):
// - blank: 100 * 4 / 324 * 1.2 = 1.4815 cubic yards, 7407 cents (unchanged);
// - increment 1: 2 cubic yards, 10000 cents;
// - increment 0.5: 1.5 cubic yards, 7500 cents;
// - 0 or more than 1000 is refused with the field's label and range.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';
import {concreteFixture} from '../quoteConcreteLandscape20261016Fixture.mjs';

function job(increment){
  const f=concreteFixture();
  Object.assign(f.ownerPricing.pricing,{baseDepthInches:4,baseCompactionAllowance:0.2,baseGravelPerCubicYard:5000,baseExcavationGradingPerSqft:100});
  if(increment!==undefined)f.ownerPricing.pricing.baseGravelOrderIncrementCubicYards=increment;
  f.customerInputs.baseNeeded=true;return f;
}
const gravel=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q.lineItems.find(row=>row.calculation.ratePath==='baseGravelPerCubicYard');};
test('base gravel rounds up to the order increment; blank prices the exact amount',()=>{
  for(const [increment,qty,cents] of [[undefined,null,7407],[1,2,10000],[0.5,1.5,7500]]){
    const line=gravel(job(increment));
    assert.equal(line.amountCents,cents,String(increment)+' '+JSON.stringify(line));
    if(qty!==null)assert.equal(line.calculation.quantity,qty);
  }
});
test('an increment outside 0.01 to 1000 is refused with its label',()=>{
  for(const bad of [0,1001]){
    const f=job(bad),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
    assert.equal(s.status,'NEEDS PRICING');
    assert.ok(s.validationErrors.some(m=>/^Base gravel order increment \(cubic yards\): enter a value from 0\.01 to 1000\./.test(m)),JSON.stringify(s.validationErrors));
  }
});
test('the owner editor lists the increment as an optional, non-money field',async()=>{
  const {applicationMetadata}=await import('../../server/src/quoteDoneBridge.js');
  for(const type of ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB']){
    const field=applicationMetadata().services.find(row=>row.serviceType===type).fields.find(row=>row.field==='baseGravelOrderIncrementCubicYards');
    assert.ok(field,type);assert.equal(field.label,'Base gravel order increment (cubic yards)');assert.equal(field.money,false);assert.equal(field.requiredAtBase,false);
  }
});
