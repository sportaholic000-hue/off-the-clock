import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {concreteFixture,sodFixture,customPlantFixture} from './quoteConcreteLandscape20261016Fixture.mjs';

// Expected values/statuses written before this file was run.
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;};
const amount=(q,name)=>q.lineItems.find(l=>l.name===name)?.amountCents;
test('exact threshold uses ordered5yd, no short load; both fee modes reject',()=>{
  //300*4/324*1.10=4.074;1yd increment=>5yd; threshold5 is not under5.
  const f=concreteFixture(10,30);Object.assign(f.ownerPricing.pricing,{readyMixOrderIncrementCubicYards:1,shortLoadThresholdCubicYards:5,shortLoadPerYard:4000});
  assert.equal(amount(ready(f),'Supplier short-load charge'),undefined);f.ownerPricing.pricing.shortLoadFlatFee=15000;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('placement flat plus volume uses150000+4500; Yes ignores both; multiple methods require a choice',()=>{
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{placementFlat:{pump:150000},placementPerCubicYard:{pump:3000,conveyor:2000}});f.customerInputs.chuteAccess='no';
  let q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(q.missingCustomerFields.includes('placementMethod'));
  f.customerInputs.placementMethod='pump';q=ready(f);assert.equal(amount(q,'Pump placement per pour'),150000);assert.equal(amount(q,'Pump placement by volume'),4500);
  f.customerInputs.chuteAccess='yes';delete f.customerInputs.placementMethod;q=ready(f);assert.equal(amount(q,'Pump placement per pour'),undefined);assert.equal(amount(q,'Pump placement by volume'),undefined);
});
test('unconfigured depths review only selected preparation and never silently charge legacy prep',()=>{
  //Material rate alone cannot invent base depth or usable/typical soil depth.
  const f=concreteFixture();f.ownerPricing.pricing.baseGravelPerCubicYard=4500;ready(f);f.customerInputs.baseNeeded=true;
  let q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(q.missingOwnerFields.includes('baseDepthInches'));
  const s=sodFixture();Object.assign(s.ownerPricing.pricing,{topsoilPerCubicYard:3000,topsoilTargetDepthInches:4});s.customerInputs.usableTopsoilDepthInches='unknown';q=generateQuoteVNext(s);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(q.missingOwnerFields.includes('topsoilTypicalImportDepthInches'));
});
test('topsoil above target and zero typical import need no topsoil material; allowance still disclosed',()=>{
  //max(0,4-5)=0; explicit typical0 =>0. No topsoil line in either case.
  const f=sodFixture();Object.assign(f.ownerPricing.pricing,{topsoilPerCubicYard:3000,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:0});
  for(const depth of [5,'unknown']){f.customerInputs.usableTopsoilDepthInches=depth;const q=ready(f);assert.equal(amount(q,'Imported topsoil'),undefined);if(depth==='unknown')assert.match(q.disclaimer,/topsoil is an allowance/);}
});
test('outline area600 uses97.98LF too; rectangle10x10 at10ft has no saw-cut line',()=>{
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:150});assert.equal(amount(ready(f),'Saw-cut control joints'),undefined);
  delete f.customerInputs.length;delete f.customerInputs.width;Object.assign(f.customerInputs,{dimensionMethod:'measured_outline',outlinePoints:[{x:0,y:0},{x:20,y:0},{x:20,y:30},{x:0,y:30},{x:0,y:0}]});
  assert.equal(amount(ready(f),'Saw-cut control joints'),14697);
});
test('tree height/bare-root is supported at43000c; ambiguous size definitions and unknown keys review',()=>{
  const f=customPlantFixture();f.customerInputs.plantsBySize={tree_2:1};const tree=f.ownerPricing.pricing.plantSizes.tree_2;delete tree.caliperInches;Object.assign(tree,{heightFt:8,stockType:'bare_root',name:'8 ft tree, bare root'});
  assert.equal(ready(f).midEstimate,430);tree.caliperInches=2;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');delete tree.caliperInches;
  f.customerInputs.plantsBySize={unoffered:1};assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('tier-specific4–6 and8–12 thickness ranges select the supported option',()=>{
  //At8in only Deep option is valid; base concrete still uses saved600c/sqft.
  const f=concreteFixture();f.customerInputs.thickness=8;f.ownerPricing.tiers=[{name:'Standard',overrides:{slabLaborMinThicknessInches:4,slabLaborMaxThicknessInches:6}},{name:'Deep',overrides:{slabLaborMinThicknessInches:8,slabLaborMaxThicknessInches:12}}];
  const q=ready(f);assert.deepEqual(q.options.map(o=>o.tierName),['Deep']);
});
test('empty range strings retain live readiness without inferring a zero thickness',()=>{
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{slabLaborMinThicknessInches:'',slabLaborMaxThicknessInches:''});const s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(s.status,'QUOTING LIVE',JSON.stringify(s));
});
test('new optional notices preserve invalid service-type diagnostics without throwing',()=>{
  // Expected before execution: invalid numeric type stays NEEDS PRICING.
  const f=concreteFixture();f.ownerPricing.serviceType=42;
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
});
test('concrete labor access reaches saw cuts but placement retains its stated per-pour amount',()=>{
  //70LF*150c*1.25=13125c; pump is a flat150000c additional-work charge.
  const f=concreteFixture(20,30);Object.assign(f.customerInputs,{accessDifficulty:'difficult',chuteAccess:'no'});Object.assign(f.ownerPricing.pricing,{controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:150,placementFlat:{pump:150000}});
  const q=ready(f);assert.equal(amount(q,'Saw-cut control joints'),13125);assert.equal(amount(q,'Pump placement per pour'),150000);
});
