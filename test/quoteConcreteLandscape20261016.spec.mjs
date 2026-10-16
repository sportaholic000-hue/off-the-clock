import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {concreteFixture,sodFixture,plantingFixture,customPlantFixture,legacyCases} from './quoteConcreteLandscape20261016Fixture.mjs';
import {CONCRETE_FIELDS,SOD_FIELDS,concreteLandscapeNotices} from '../server/quote-engine-vnext/concreteLandscapePricing.js';

// EXPECTED VALUES WRITTEN BEFORE EXECUTION. Rates in these synthetic fixtures
// are integer cents, never defaults. Each assertion below is hand-calculated.
const line=(q,name)=>q.lineItems.find(l=>l.name===name);
const cents=q=>q.lineItems.reduce((s,l)=>s+l.amountCents,0);
function ready(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;}
test('concrete ordered patio 1.5 yd /27000; short 3.5 yd /14000, or flat /15000',()=>{
  // ceil((100*4/324*1.10)/.5)*.5=1.5; 1.5*18000=27000.
  // (5-1.5)*4000=14000; alternative flat=15000. 600 sqft buys8.5yd.
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{shortLoadThresholdCubicYards:5,shortLoadPerYard:4000});
  let q=ready(f);assert.equal(line(q,'Ready-mix concrete').calculation.quantity,1.5);assert.equal(line(q,'Ready-mix concrete').amountCents,27000);assert.equal(line(q,'Supplier short-load charge').amountCents,14000);
  delete f.ownerPricing.pricing.shortLoadPerYard;f.ownerPricing.pricing.shortLoadFlatFee=15000;
  assert.equal(line(ready(f),'Supplier short-load charge').amountCents,15000);
  Object.assign(f.customerInputs,{length:20,width:30});q=ready(f);assert.equal(line(q,'Ready-mix concrete').calculation.quantity,8.5);assert.equal(line(q,'Supplier short-load charge'),undefined);
});
for(const [length,width,quantity,amount] of [[20,30,70,10500],[12,18,30,4500],[20,20,40,6000]])test(`control joints ${length}x${width}: ${quantity} LF / ${amount} cents`,()=>{
  // ceil(L/10)-1 cuts across W plus ceil(W/10)-1 cuts along L.
  const f=concreteFixture(length,width);Object.assign(f.ownerPricing.pricing,{controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:150});
  const q=ready(f);assert.equal(line(q,'Saw-cut control joints').calculation.quantity,quantity);assert.equal(line(q,'Saw-cut control joints').amountCents,amount);
  f.ownerPricing.pricing.controlJointPricing='included';assert.equal(line(ready(f),'Saw-cut control joints'),undefined);
});
test('nonrectangle 600 sqft joints square allowance97.98LF /14697 cents; owner spacing warning',()=>{
  // sqrt600=24.494897;4*sqrt600=97.979589=>97.98 LF;*150=14697.
  const f=concreteFixture();Object.assign(f.customerInputs,{dimensionMethod:'measured_area_perimeter',areaSqft:600,perimeterLF:100});delete f.customerInputs.length;delete f.customerInputs.width;
  Object.assign(f.ownerPricing.pricing,{controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:150});
  const q=ready(f);assert.equal(line(q,'Saw-cut control joints').calculation.quantity,97.98);assert.equal(line(q,'Saw-cut control joints').amountCents,14697);assert.match(q.disclaimer,/97\.98 linear feet/);assert.match(q.disclaimer,/control-joint length.*confirmed on site/);
  f.ownerPricing.pricing.controlJointSpacingFt=15;assert.match(concreteLandscapeNotices(f.serviceType,f.ownerPricing.pricing).join(' '),/15 feet.*10 feet.*4-inch/);
});
test('4–6 inch labor band accepts5, reviews8 naming the band; blank accepts8',()=>{
  // No cents change is expected from declaring a band; only eligibility changes.
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{slabLaborMinThicknessInches:4,slabLaborMaxThicknessInches:6});f.customerInputs.thickness=5;ready(f);
  f.customerInputs.thickness=8;const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,/4–6 inches/);
  delete f.ownerPricing.pricing.slabLaborMinThicknessInches;delete f.ownerPricing.pricing.slabLaborMaxThicknessInches;ready(f);
});
test('No chute: pump150000; buggy1.5*3000=4500; no offered method reviews',()=>{
  const f=concreteFixture();f.customerInputs.chuteAccess='no';f.ownerPricing.pricing.placementFlat={pump:150000};
  assert.equal(line(ready(f),'Pump placement per pour').amountCents,150000);
  delete f.ownerPricing.pricing.placementFlat;f.ownerPricing.pricing.placementPerCubicYard={power_buggy:3000};assert.equal(line(ready(f),'Power buggy placement by volume').amountCents,4500);
  delete f.ownerPricing.pricing.placementPerCubicYard;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('Not sure: owner pump150000 with site allowance, or no line and extra-cost note',()=>{
  const f=concreteFixture();f.customerInputs.chuteAccess='unknown';Object.assign(f.ownerPricing.pricing,{placementFlat:{pump:150000},uncertainPlacementMethod:'pump'});
  let q=ready(f);assert.equal(line(q,'Pump placement per pour').amountCents,150000);assert.match(q.disclaimer,/placement is an allowance.*confirmed on site/);
  delete f.ownerPricing.pricing.uncertainPlacementMethod;q=ready(f);assert.equal(line(q,'Pump placement per pour'),undefined);assert.match(q.disclaimer,/other than the truck chute would be extra.*confirmed on site/);
});
test('600sqft base4in plus20%: 8.888yd /40000; labor72000 or90000 at1.25 access',()=>{
  // 600*4/324*1.2*4500=40000,600*120=72000;*1.25=90000.
  const f=concreteFixture(20,30);f.customerInputs.baseNeeded=true;Object.assign(f.ownerPricing.pricing,{baseDepthInches:4,baseCompactionAllowance:0.2,baseGravelPerCubicYard:4500,baseExcavationGradingPerSqft:120});
  let q=ready(f);assert.equal(line(q,'Base gravel').amountCents,40000);assert.equal(line(q,'Base excavation and grading').amountCents,72000);assert.equal(line(q,'Base preparation'),undefined);assert.match(q.disclaimer,/4 inches of compacted base/);
  f.customerInputs.accessDifficulty='difficult';q=ready(f);assert.equal(line(q,'Base excavation and grading').amountCents,90000);assert.equal(line(q,'Base gravel').amountCents,40000);
});
for(const [existing,quantity,amount] of [[3,1000/324,9259],[4,0,0],['unknown',2000/324,18519]])test(`sod existing${existing}: topsoil ${amount} cents`,()=>{
  // Deficit1in:1000/324*3000=9259.259=>9259; no deficit0;
  // unknown typical2in:2000/324*3000=18518.518=>18519.
  const f=sodFixture();Object.assign(f.ownerPricing.pricing,{topsoilPerCubicYard:3000,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2});f.customerInputs.usableTopsoilDepthInches=existing;
  const q=ready(f),soil=line(q,'Imported topsoil');if(amount){assert.equal(soil.amountCents,amount);assert.ok(Math.abs(soil.calculation.quantity-quantity)<1e-12);}else assert.equal(soil,undefined);
  assert.equal(line(q,'Ground preparation'),undefined);if(existing==='unknown')assert.match(q.disclaimer,/topsoil is an allowance.*confirmed on site/);
});
test('sod removal+grading190000 on flat;218500 with1.15 slope; no duplicate disposal',()=>{
  //1000*(100+90)=190000; each line*1.15 gives115000+103500.
  const f=sodFixture();Object.assign(f.ownerPricing.pricing,{sodRemovalPerSqft:100,sodGradingPerSqft:90});
  for(const [slope,expected] of [['flat',190000],['moderate',218500]]){f.customerInputs.slope=slope;const q=ready(f);assert.equal(line(q,'Old-lawn removal with disposal').amountCents+line(q,'Sod grading').amountCents,expected);assert.equal(line(q,'Ground preparation'),undefined);assert.equal(line(q,'Disposal'),undefined);}
});
test('custom names:4 #5 shrubs30000 and1 two-inch B&B tree43000',()=>{
  //4*(4500+3000)=30000;1*(25000+18000)=43000.
  const f=customPlantFixture();let q=ready(f);assert.equal(cents(q),30000);assert.match(q.disclaimer,/#5 shrub, container/);
  f.customerInputs.plantsBySize={tree_2:1};q=ready(f);assert.equal(cents(q),43000);assert.match(q.disclaimer,/2 in\. caliper tree, balled and burlapped/);
});
test('all42 concrete/sod/planting baseline quotes retain their exact8b53169 cents and quantities',()=>{
  // Expected lines captured before production edits from exact baseline commit.
  const baseline=JSON.parse(readFileSync(new URL('./quoteConcreteLandscapeLegacy20261016.json',import.meta.url)));assert.equal(baseline.rows.length,42);
  for(const [i,f] of legacyCases().entries()){const q=ready(f);assert.equal(cents(q),baseline.rows[i].cents);assert.deepEqual(JSON.parse(JSON.stringify(q.lineItems.map(l=>({name:l.name,cents:l.amountCents,quantity:l.calculation.quantity})))),baseline.rows[i].lines);}
});
test('blank optional values preserve187000-cent patio and355000-cent sod; invalid negative price reviews',()=>{
  //Patio60000labor+27000mix+100000form=187000; sod105000+100000+150000=355000.
  const f=concreteFixture();for(const field of CONCRETE_FIELDS)f.ownerPricing.pricing[field]='';assert.equal(cents(ready(f)),187000);
  const s=sodFixture();for(const field of SOD_FIELDS)s.ownerPricing.pricing[field]=null;assert.equal(cents(ready(s)),355000);
  f.ownerPricing.pricing.shortLoadPerYard=-1;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
