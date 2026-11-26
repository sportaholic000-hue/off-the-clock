// Backlog (verdicts audit): itemized starter strip, drip edge and ridge cap
// were priced to the exact foot after 10% waste, though they are bought in
// bundles or pieces. Expected, written before the change (180 ft starter at
// $1.00/ft, 180 ft drip edge at $2.00/ft, 50 ft ridge cap at $3.00/ft, 10%
// waste):
// - blank lengths: unchanged (198 ft: 19800 and 39600 cents; ridge 55 ft:
//   16500 cents);
// - starter bundles of 105 ft: 198 / 105 -> 2 bundles, 210 ft, 21000 cents;
//   drip edge pieces of 10 ft: 20 pieces, 200 ft, 40000 cents; ridge cap
//   bundles of 33 ft: 55 / 33 -> 2 bundles, 66 ft, 19800 cents;
// - only an accessory with a length rounds;
// - 0 or more than 1000 is refused with the field's label.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';
import {roofFixture} from '../../verification/qe-agent2-price-metadata-20261018/fixtures.mjs';

function job(lengths={}){const f=roofFixture();Object.assign(f.customerInputs,{starterLengthLF:180,dripEdgeLengthLF:180,ridgeCapLengthLF:50});Object.assign(f.ownerPricing.pricing,{starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300,...lengths});return f;}
function lines(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  return Object.fromEntries(['starterPerLF','dripEdgePerLF','ridgeCapPerLF'].map(path=>{const l=q.lineItems.find(row=>row.calculation?.ratePath===path);return [path,[l.calculation.quantity,l.amountCents]];}));}
test('blank lengths keep the exact length after waste',()=>{
  assert.deepEqual(lines(job()),{starterPerLF:[198,19800],dripEdgePerLF:[198,39600],ridgeCapPerLF:[55,16500]});
});
test('bundle and piece lengths round each accessory up to whole packages',()=>{
  assert.deepEqual(lines(job({starterBundleLF:105,dripEdgePieceLF:10,ridgeCapBundleLF:33})),{starterPerLF:[210,21000],dripEdgePerLF:[200,40000],ridgeCapPerLF:[66,19800]});
  assert.deepEqual(lines(job({dripEdgePieceLF:10})),{starterPerLF:[198,19800],dripEdgePerLF:[200,40000],ridgeCapPerLF:[55,16500]});
});
test('a length outside more than 0 to 1000 is refused with its label',()=>{
  for(const bad of [0,1001]){
    const f=job({dripEdgePieceLF:bad}),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
    assert.equal(s.status,'NEEDS PRICING');
    assert.ok(s.validationErrors.includes('Drip edge piece length (linear feet): enter a number of feet from more than 0 to 1,000.'),JSON.stringify(s.validationErrors));
  }
});
test('the owner editor lists the three lengths as optional, non-money fields',async()=>{
  const {applicationMetadata}=await import('../../server/src/quoteDoneBridge.js');
  const fields=applicationMetadata().services.find(row=>row.serviceType==='ROOFING_REPLACEMENT').fields;
  for(const [name,label] of [['starterBundleLF','Starter strip bundle length (linear feet)'],['dripEdgePieceLF','Drip edge piece length (linear feet)'],['ridgeCapBundleLF','Ridge cap bundle length (linear feet)']]){
    const field=fields.find(row=>row.field===name);assert.ok(field,name);assert.equal(field.label,label);assert.equal(field.money,false);assert.equal(field.requiredAtBase,false);
  }
});
