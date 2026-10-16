import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {mowingFixture,cleanupFixture} from './landscapeLaneB20261016Fixture.mjs';
import {fenceFixture} from './fenceLaneB20261016Fixture.mjs';

const quote=f=>generateQuoteVNext(f);
const ready=q=>assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
const line=(q,name)=>q.lineItems.find(item=>item.name===name)?.amountCents;
test('Oct16 follow-up blank/null/zero mowing visit charges retain5000/7500 cents without a fabricated owner rate',()=>{
 // Expected BEFORE execution: every blank representation and explicit0 adds nothing.
 for(const value of [undefined,null,'',0]){const f=mowingFixture();f.ownerPricing.pricing.mowingVisitCharge=value;const q=quote(f);ready(q);assert.equal(q.midEstimate,50);assert.equal(q.firstVisit.midEstimate,75);assert.equal(line(q,'Mowing per-visit charge'),undefined);}
});
test('Oct16 follow-up first/recurring minima and fixed service charge are evaluated independently, with all fixed common fees charged once per visit',()=>{
 // Expected BEFORE execution: area5000/7500 + visit4000 + travel500 =9500/12000;
 // service minimum10000 raises only recurring ->10000/12000 cents.
 const f=mowingFixture();Object.assign(f.ownerPricing.pricing,{mowingVisitCharge:4000,minimumServiceCharge:10000});f.ownerPricing.feeRules.travel='always';f.businessDefaults.travelFee=500;
 const q=quote(f);ready(q);assert.equal(q.midEstimate,100);assert.equal(q.firstVisit.midEstimate,120);
 assert.equal(q.lineItems.filter(l=>l.name==='Travel').length,1);assert.equal(q.firstVisit.lineItems.filter(l=>l.name==='Travel').length,1);
});
test('Oct16 follow-up first visits retain each tier own prices and exclusions without changing the first valid option mirror',()=>{
 // Expected BEFORE execution: Good area5000/7500 with bagging excluded;
 // Better20% bagging ->6000/9000; Best adds4000 fixed ->10000/13000 cents.
 const f=mowingFixture();f.customerInputs.bagClippings=true;f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Better',overrides:{baggingSurchargePercent:20}},{name:'Best',overrides:{baggingSurchargePercent:20,mowingVisitCharge:4000}}];
 const q=quote(f);ready(q);assert.deepEqual(q.options.map(o=>[o.midEstimate,o.firstVisit.midEstimate]),[[50,75],[60,90],[100,130]]);
 assert.deepEqual(q.options[0].firstVisit.skippedAddons,['Clipping bagging and disposal']);assert.deepEqual(q.options[1].firstVisit.skippedAddons,[]);assert.equal(q.firstVisit.midEstimate,75);ready(sanitizeForCustomerVNext(q));
});
test('Oct16 follow-up explicitly stated fractional loads price exactly before the flat minimum; count-zero still pays the minimum',()=>{
 // Expected BEFORE execution:1.5loads*12000=18000; 0loads and0.5loads ->10000 minimum.
 for(const [loads,cents]of [[1.5,18000],[0,10000],[0.5,10000]]){const f=cleanupFixture();f.customerInputs.wasteLoads=loads;const q=quote(f);ready(q);assert.equal(line(q,'Debris disposal'),cents);assert.doesNotMatch(q.disclaimer,/load count.*confirmed on site/i);}
});
test('Oct16 follow-up zero supplemental disposal prices preserve a positive flat minimum, without declaring the cleanup itself free',()=>{
 // Expected BEFORE execution: zero bag/load extensions still pay10000 minimum
 // plus10000 cleanup labor =20000 cents, with no free-complete-service receipt.
 for(const inputs of [{wasteBags:12},{wasteLoads:3},{}]){const f=cleanupFixture();f.ownerPricing.pricing.disposalPerBag=0;f.ownerPricing.pricing.disposalPerLoad=0;Object.assign(f.customerInputs,inputs);const q=quote(f);ready(q);assert.equal(line(q,'Debris disposal'),10000);assert.equal(q.midEstimate,200);}
});
test('Oct16 follow-up cleanup exact ceiling honors every debris level; disposal and additional haul-away each replace common disposal only once',()=>{
 // Expected BEFORE execution: area2000.25 / coverage2000 rounds up to2loads;
 // disposal24000 + separate haul5000 + labor2000.25 rounds2000 =31000 cents.
 for(const debrisLevel of ['light','moderate','heavy']){const f=cleanupFixture();Object.assign(f.customerInputs,{yardSqft:2000.25,debrisLevel,haulAway:true});f.ownerPricing.pricing.haulAwayFee=5000;f.ownerPricing.feeRules.disposal='always';f.businessDefaults.disposalFee=9999;
  const q=quote(f);ready(q);assert.equal(line(q,'Debris disposal'),24000);assert.equal(line(q,'Additional haul-away'),5000);assert.equal(line(q,'Disposal'),undefined);assert.equal(q.midEstimate,310);}
});
for(const frequency of ['weekly','biweekly','monthly'])test('Oct16 follow-up recurring '+frequency+': 5000 cents maintained, separate first visit 7500 cents',()=>{
 // Expected BEFORE execution: 10000 * 0.5 * 1 = 5000 recurring; * 1.5 = 7500 first.
 const f=mowingFixture();f.customerInputs.serviceFrequency=frequency;const q=quote(f);ready(q);
 assert.equal(q.midEstimate,50);assert.equal(q.firstVisit.midEstimate,75);
 assert.equal(q.options[0].firstVisit.midEstimate,75);assert.equal(q.firstVisit.calculationRecord.scenarios.mid.finalTotalCents,7500);
 const safe=sanitizeForCustomerVNext(q);ready(safe);assert.equal(safe.firstVisit.midEstimate,75);assert.equal(safe.options[0].firstVisit.midEstimate,75);
 assert.doesNotMatch(JSON.stringify(safe),/rateCents|calculationRecord|mowingBaseRatePerSqft/);
});
test('Oct16 follow-up mowing: one-time overgrown remains 7500 cents; recurring maintained 5000 with no separate first visit',()=>{
 // Expected: one_time 10000*.5*1*1.5=7500; weekly maintained=5000, no firstVisit field.
 const f=mowingFixture();f.customerInputs.serviceFrequency='one_time';let q=quote(f);ready(q);assert.equal(q.midEstimate,75);assert.equal(q.firstVisit,undefined);
 f.customerInputs.serviceFrequency='weekly';f.customerInputs.grassCondition='maintained';q=quote(f);ready(q);assert.equal(q.midEstimate,50);assert.equal(q.firstVisit,undefined);
});
test('Oct16 follow-up bagging follows its own visit: 1000 recurring and 1500 first, totals 6000/9000 cents',()=>{
 // Expected: bagging 20% of 5000=1000 and 20% of 7500=1500; totals 6000/9000.
 const f=mowingFixture();f.customerInputs.bagClippings=true;f.ownerPricing.pricing.baggingSurchargePercent=20;const q=quote(f);ready(q);
 assert.equal(line(q,'Clipping bagging and disposal'),1000);assert.equal(line(q.firstVisit,'Clipping bagging and disposal'),1500);
 assert.equal(q.midEstimate,60);assert.equal(q.firstVisit.midEstimate,90);
});
test('Oct16 follow-up per-visit charge: 4000 plus 5000 recurring, 4000 plus 7500 first; blank preserves cents',()=>{
 // Expected: 9000 recurring, 11500 first; blank optional charge restores 5000/7500.
 const f=mowingFixture();f.ownerPricing.pricing.mowingVisitCharge=4000;let q=quote(f);ready(q);assert.equal(q.midEstimate,90);assert.equal(q.firstVisit.midEstimate,115);
 f.customerInputs.grassCondition='maintained';q=quote(f);ready(q);assert.equal(q.midEstimate,90);assert.equal(q.firstVisit,undefined);
 delete f.ownerPricing.pricing.mowingVisitCharge;q=quote(f);ready(q);assert.equal(q.midEstimate,50);
});
test('Oct16 follow-up frequency and condition do not multiply the per-visit charge or its bagging basis',()=>{
 // Expected: area 10000*.5*1.2=6000 recurring, 9000 first; bagging 1200/1800;
 // fixed visit charge 4000 each; full totals 11200/14800 cents.
 const f=mowingFixture();Object.assign(f.ownerPricing.pricing,{mowingVisitCharge:4000,baggingSurchargePercent:20});
 f.ownerPricing.pricing.frequencyMultipliers.weekly=1.2;f.customerInputs.bagClippings=true;const q=quote(f);ready(q);
 assert.equal(q.midEstimate,112);assert.equal(q.firstVisit.midEstimate,148);assert.equal(line(q,'Mowing per-visit charge'),4000);assert.equal(line(q.firstVisit,'Mowing per-visit charge'),4000);
 assert.equal(line(q,'Clipping bagging and disposal'),1200);assert.equal(line(q.firstVisit,'Clipping bagging and disposal'),1800);
});
test('Oct16 follow-up edging is optional labor: 5000 mowing + 5000 edging earns 2000 seasonal surcharge and no materials-only tax',()=>{
 // Expected: 100 LF*50=5000 edging; labor 10000*20%=2000; total12000, tax0.
 const f=mowingFixture();Object.assign(f.customerInputs,{grassCondition:'maintained',edgingIncluded:true,edgingLengthLF:100});
 Object.assign(f.ownerPricing.pricing,{edgingPerLinearFoot:50});Object.assign(f.ownerPricing,{peakMonths:[1],peakSurchargePercent:20});
 Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:15});const q=quote(f);ready(q);
 assert.equal(q.lineItems.find(l=>l.name==='Lawn edging').category,'labor');assert.equal(q.calculationRecord.options[0].scenarios.mid.seasonal.amountCents,2000);
 assert.equal(q.calculationRecord.options[0].scenarios.mid.tax.taxCents,0);assert.equal(q.midEstimate,120);
 delete f.ownerPricing.pricing.edgingPerLinearFoot;const excluded=quote(f);ready(excluded);assert.deepEqual(excluded.options[0].skippedAddons,['Lawn edging']);assert.match(excluded.disclaimer,/does not include: Lawn edging/);
});
for(const [name,area,inputs,disposal,total,derived]of [
 ['small estimated load',1000,{},12000,13000,true],['large estimated load',10000,{},60000,70000,true],
 ['12 stated bags',10000,{wasteBags:12},10000,20000,false],['3 stated loads',10000,{wasteLoads:3},36000,46000,false],
 ['unknown bag and load counts',10000,{wasteBags:'unknown',wasteLoads:'unknown'},60000,70000,true],
])test('Oct16 follow-up cleanup '+name,()=>{
 // Expected disposal and total cents are literal values in the table BEFORE execution.
 const f=cleanupFixture();Object.assign(f.customerInputs,{yardSqft:area,...inputs});const q=quote(f);ready(q);
 assert.equal(line(q,'Debris disposal'),disposal);assert.equal(q.midEstimate,total/100);
 assert.equal(/load count.*confirmed on site/i.test(q.disclaimer),derived);
});
for(const area of [1000,10000])test('Oct16 follow-up cleanup legacy flat minimum at '+area+' sq ft = 10000 disposal cents',()=>{
 // Expected: with no new prices, disposal stays10000; labor area*1 gives totals11000/20000.
 const f=cleanupFixture();f.customerInputs.yardSqft=area;delete f.ownerPricing.pricing.disposalPerBag;delete f.ownerPricing.pricing.disposalPerLoad;
 for(const row of Object.values(f.ownerPricing.pricing.debrisPricing))delete row.sqftPerLoad;
 const q=quote(f);ready(q);assert.equal(line(q,'Debris disposal'),10000);assert.equal(q.midEstimate,(10000+area)/100);
});
test('Oct16 follow-up cleanup count conflicts and invalid quantities require review; incomplete active load pricing cannot silently use the minimum',()=>{
 // Expected: each malformed/contradictory amount or missing necessary configured price releases no cents.
 for(const inputs of [{wasteBags:12,wasteLoads:3},{wasteBags:-1},{wasteBags:1.5},{wasteLoads:NaN},{wasteLoads:'3'},{wasteLoads:Infinity}]){
  const f=cleanupFixture();Object.assign(f.customerInputs,inputs);const q=quote(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(sanitizeForCustomerVNext(q).midEstimate,undefined);
 }
 const f=cleanupFixture();delete f.ownerPricing.pricing.debrisPricing.heavy.sqftPerLoad;assert.equal(quote(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
 f.customerInputs.wasteLoads=3;const stated=quote(f);ready(stated);assert.equal(line(stated,'Debris disposal'),36000);
});
test('Oct16 follow-up first-visit evidence cannot be changed or removed while a recurring estimate is released',()=>{
 // Expected: the legitimate5000/7500 quote is customer-ready; tampering yields review with no price.
 const f=mowingFixture(),q=quote(f);ready(q);
 for(const edit of [q=>q.firstVisit.midEstimate=1,q=>q.options[0].firstVisit.midEstimate=1,q=>delete q.firstVisit,q=>delete q.options[0].firstVisit]){
  const changed=structuredClone(q);edit(changed);const safe=sanitizeForCustomerVNext(changed);assert.equal(safe.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(safe.midEstimate,undefined);
 }
});
for(const height of [6,8,11,18])test('Oct16 follow-up uncovered fence height copy '+height+' ft needs no numeric article',()=>{
 // Expected: exact copy below, no amount, for every uncovered requested height.
 const f=fenceFixture('installed');f.ownerPricing.pricing.fenceOfferings.wood.heightRows={one:{exactHeight:5,postSpacingLF:8,offeringRates:{installedFencePerLF:4000,gate_walk:25000},installedLaborPercent:{'offeringRates.installedFencePerLF':60,'offeringRates.gate_walk':60},installedMaterialsPercent:{'offeringRates.installedFencePerLF':40,'offeringRates.gate_walk':40}}};
 f.customerInputs.fenceHeight=height;const q=quote(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(q.reviewReason,'No price is set for a fence at '+height+' ft.');
});
