import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {calculatedFencePosts} from '../server/quote-engine-vnext/configuredOfferings.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {fencePostQuantities,resolvedFencePricing} from '../server/quote-engine-vnext/fencePricing.js';

const run=(lengths,gates=[],closed=false)=>({closed,sections:lengths.map((lengthLF,i)=>({lengthLF,...(gates[i]?{gateAfter:gates[i]}:{})}))});
const layoutInput=runs=>({fenceRunCount:runs.length,fenceRuns:runs});
const pricing=()=>{const p=offeringFixture('FENCING_INSTALL','itemized').ownerPricing.pricing;p.postSpacingLF=8;p.offeringDetails.gates.walk.postsAndFootingsIncluded=false;return p;};

// Counts are independently specified here before execution, per the Oct 16 ruling.
for(const [name,runs,expected,terminal,line] of [
  ['two separate 9 ft runs',[run([9]),run([9])],6,4,2],
  ['7 ft, gate, 9 ft',[run([7,9],['walk'])],5,4,1],
  ['8 ft, gate, 8 ft',[run([8,8],['walk'])],4,4,0],
  ['two 40 ft sides meeting at a corner',[run([40,40])],11,3,8],
  ['closed 8 by 8 ft square',[run([8,8,8,8],[],true)],4,4,0],
])test('Oct16 fence sections: '+name,()=>{
  assert.equal(calculatedFencePosts({...layoutInput(runs)},pricing()),expected);
  const q=fencePostQuantities(layoutInput(runs),pricing());assert.equal(q.terminal,terminal);assert.equal(q.line,line);
});
test('Oct16 fence total-only fallback: 18 ft, 2 runs, 8 ft spacing = 6 posts',()=>{
  assert.equal(calculatedFencePosts({linearFeet:18,cornerCount:0,gates:{},fenceRunCount:2},pricing()),6);
});
test('Oct16 fence included gate: 7 + gate + 9 = 3 priced posts',()=>{
  const p=pricing();p.offeringDetails.gates.walk.postsAndFootingsIncluded=true;
  assert.equal(calculatedFencePosts(layoutInput([run([7,9],['walk'])]),p),3);
});
test('Oct16 legacy exact height: 6 ft keeps $4,500; unpriced 8 ft goes to review',()=>{
  const f=offeringFixture('FENCING_INSTALL','installed');
  assert.equal(generateQuoteVNext(f).midEstimate,4500);
  f.customerInputs.fenceHeight=8;
  const result=generateQuoteVNext(f);assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.reviewReason,'No price is set for a fence at 8 ft.');
});
test('Oct16 row spacing: 80 ft straight is 11 posts at 6 ft and 21 at 8 ft; installed cents 320000/480000',()=>{
  const f=fenceFixture('installed');f.customerInputs.linearFeet=80;
  for(const [height,posts,cents] of [[6,11,320000],[8,21,480000]]){
    f.customerInputs.fenceHeight=height;
    assert.equal(fencePostQuantities(f.customerInputs,resolvedFencePricing(f.ownerPricing.pricing,f.customerInputs)).total,posts);
    const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.midEstimate,cents/100);
  }
});
test('Oct16 row gate prices: 8 ft and 7 ft use the $400 gate; 9 ft is unpriced',()=>{
  const f=fenceFixture('installed');f.customerInputs.linearFeet=80;f.customerInputs.gates={walk:1};
  for(const height of [8,7]){
    f.customerInputs.fenceHeight=height;const q=generateQuoteVNext(f);
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
    assert.equal(q.lineItems.find(line=>line.name==='Installed gate: walk').amountCents,40000);
    assert.equal(q.midEstimate,5200); // 80 * $60 + $400.
  }
  f.customerInputs.fenceHeight=9;const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(q.reviewReason,'No price is set for a fence at 9 ft.');
});
test('Oct16 terminal/line prices: 2 terminals + 7 lines = posts 36500, footing labor 6200, footing material 3800 cents',()=>{
  const f=fenceFixture(),row=f.ownerPricing.pricing.fenceOfferings.wood.heightRows.six;
  row.postSpacingLF=10;Object.assign(row.offeringRates,{terminalPostMaterialEach:6000,terminalFootingLaborEach:1000,terminalFootingMaterialEach:500,linePostMaterialEach:3500,lineFootingLaborEach:600,lineFootingMaterialEach:400});
  Object.assign(f.customerInputs,{linearFeet:80,gates:{}});
  assert.deepEqual({...fencePostQuantities(f.customerInputs,resolvedFencePricing(f.ownerPricing.pricing,f.customerInputs)),inputs:null},{total:9,terminal:2,line:7,method:'total_length_allowance',inputs:null});
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
  const sum=pattern=>q.lineItems.filter(line=>pattern.test(line.name)).reduce((n,l)=>n+l.amountCents,0);
  assert.equal(sum(/^(Terminal|Line) post materials$/),36500);
  assert.equal(sum(/post-hole and footing labor$/),6200);assert.equal(sum(/^(Terminal|Line) footing materials$/),3800);
  assert.equal(q.midEstimate,3025); // Infill labor $800 + infill materials $1,760 + posts/footings $465.
});
test('Oct16 one service, four fence types, three tiers each: aluminum returns only $4000/$4100/$4200',()=>{
  const f=fourTypes(),q=generateQuoteVNext(f);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
  assert.deepEqual(q.options.map(o=>[o.tierName,o.midEstimate]),[['Good',4000],['Better',4100],['Best',4200]]);
  assert.equal(q.failedTierDiagnostics?.length||0,0);
});

export {run,layoutInput};
