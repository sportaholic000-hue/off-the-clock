// November 22, 2026 (v45). Repairs from Neon's re-audit of ef7e872, approved by
// the owner. Every expected value is worked out by hand in the comments before
// the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,vNextServiceStatus,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {mowing,concrete,fixture} from '../verification/engine-independent/fixtures.mjs';
import {sampleTaxLocationCode,jobTaxPercent} from '../server/taxJurisdiction.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {db,migrate} from '../server/src/db.js';
import {registerQuoteDateDatabase} from '../server/src/quoteDate.js';
import {saveJurisdictionProfile} from '../server/src/onboardingService.js';
import {loadPricebook} from '../server/priceBookService.js';
import {publish} from './quoteDeliveryBatch20261015Fixture.mjs';

migrate();registerQuoteDateDatabase(db);
const date={timeZone:'UTC',quoteInstant:'2026-10-15T12:00:00.000Z'};
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const mid=q=>q.options[0].calculationRecord.scenarios.mid;

test('the engine is v45',()=>{assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261126-v60');});

// ---------------------------------------------------------------------------
// #1 Job-location tax: the status check samples a job in the business's own province.
// ---------------------------------------------------------------------------
const OWN={NL:'A1C5M2',NS:'B3J3K5',PE:'C1A4P3',NB:'E1C4M3',QC:'H2Y1C6',ON:'K1A0B1',MB:'R3C0V8',SK:'S4P3Y2',AB:'T5J0N3',BC:'V6B1A1',NT:'X1A2L9',NU:'X0A0H0',YT:'Y1A2C6'};
test('#1 the sample job code is in the business\'s own province, for every province and territory',()=>{
  for(const [province,code] of Object.entries(OWN)){
    assert.equal(sampleTaxLocationCode({businessCountry:'CA',businessProvince:province}),code);
    // The code's first letter names that province (NT and NU share X).
    const located=jobTaxPercent(code,{businessCountry:'CA',businessProvince:province,taxByJobLocation:true,taxMode:'TAX_ALL',taxPercent:5,provinceTaxPercent:{QC:14.975,BC:12,MB:12,SK:11}});
    assert.equal(located.province,province==='NT'||province==='NU'?'NT_NU':province);
  }
  // No province saved: Ottawa, as before.
  assert.equal(sampleTaxLocationCode({businessCountry:'CA'}),'K1A0B1');
  assert.equal(sampleTaxLocationCode({businessCountry:'US'}),'10001');
});
const taxDefaults=(province,extra={})=>({...mowing().businessDefaults,taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,businessCountry:'CA',businessProvince:province,currency:'CAD',...extra});
test('#1 job-location tax with no provincial rate: BC, QC, MB and SK need pricing; Ontario and Alberta quote',()=>{
  for(const province of ['BC','QC','MB','SK']){
    const f=mowing(),status=vNextServiceStatus(f.ownerPricing,taxDefaults(province));
    assert.equal(status.status,'NEEDS PRICING',province);
    assert.ok(status.missingOwnerFields.includes('businessDefaults.provinceTaxPercent.'+province),province);
    // A customer in the business's own province: the same answer the status now gives.
    const q=generateQuoteVNext({...f,businessDefaults:taxDefaults(province),customerInputs:{...f.customerInputs,postalCode:OWN[province]}});
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
    // With the rate entered: live, and the customer is taxed at it.
    // 5,000 sq ft x 2 cents = 100.00; 12% = 12.00; 112.00.
    const rated=taxDefaults(province,{provinceTaxPercent:{[province]:12}});
    assert.equal(vNextServiceStatus(f.ownerPricing,rated).status,'QUOTING LIVE',province);
    assert.equal(mid(ready({...f,businessDefaults:rated,customerInputs:{...f.customerInputs,postalCode:OWN[province]}})).finalTotalCents,11200,province);
  }
  for(const province of ['ON','AB'])assert.equal(vNextServiceStatus(mowing().ownerPricing,taxDefaults(province)).status,'QUOTING LIVE',province);
});

// ---------------------------------------------------------------------------
// #8 The status cache key includes the province saved at onboarding.
// ---------------------------------------------------------------------------
function owner(country,region){
  const id='synthetic-v45-'+randomUUID();
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-22T00:00:00Z')").run(id,id+'@example.invalid');
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}','2026-11-22T00:00:00Z')").run(id);
  saveJurisdictionProfile(id,{country,region});
  return id;
}
test('#8 a province change takes effect without a price-book save or restart',()=>{
  const id=owner('CA','ON'),f=mowing();
  f.businessDefaults={...f.businessDefaults,taxMode:'TAX_ALL',taxPercent:13,taxByJobLocation:true};
  publish(id,f);
  const status=()=>bridge.bookStatuses(loadPricebook(id),date)[0].status;
  assert.equal(status(),'QUOTING LIVE');
  saveJurisdictionProfile(id,{country:'CA',region:'BC'});
  // British Columbia with no BC rate saved: the status check samples a BC job.
  assert.equal(status(),'NEEDS PRICING');
  saveJurisdictionProfile(id,{country:'CA',region:'ON'});
  assert.equal(status(),'QUOTING LIVE');
  // A business that saved a BC rate stays live when it moves to BC.
  const rated=owner('CA','ON'),g=mowing();
  g.businessDefaults={...g.businessDefaults,taxMode:'TAX_ALL',taxPercent:13,taxByJobLocation:true,provinceTaxPercent:{BC:12}};
  publish(rated,g);
  const ratedStatus=()=>bridge.bookStatuses(loadPricebook(rated),date)[0].status;
  assert.equal(ratedStatus(),'QUOTING LIVE');
  saveJurisdictionProfile(rated,{country:'CA',region:'BC'});
  assert.equal(ratedStatus(),'QUOTING LIVE');
});

// ---------------------------------------------------------------------------
// #2 A catalog fence (fenceOfferings) lists the labor portions its terrain
// adjustments need, as the single-fence layout does.
// ---------------------------------------------------------------------------
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
const noLaborPortions=f=>{const p=f.ownerPricing.pricing;p.installedLaborPercent={};for(const o of Object.values(p.fenceOfferings||{})){delete o.installedLaborPercent;for(const r of Object.values(o.heightRows||{}))r.installedLaborPercent={};}p.terrainLaborMultiplier={flat:1,moderate:1.15,steep:1.3};return f;};
test('#2 catalog fence: every type, height row and terrain that needs a labor portion is listed',()=>{
  const f=noLaborPortions(fenceFixture('installed')),status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'QUOTING LIVE');
  assert.deepEqual(status.laborAdjustmentCoverage.map(r=>[r.tierName,r.selection.terrainSlope,r.missingOwnerFields]),[
    ['wood · over 4 ft up to 6 ft','moderate',['installedLaborPercent.fenceOfferings.wood.heightRows.six.offeringRates.installedFencePerLF']],
    ['wood · over 4 ft up to 6 ft','steep',['installedLaborPercent.fenceOfferings.wood.heightRows.six.offeringRates.installedFencePerLF']],
    ['wood · over 6 ft up to 8 ft','moderate',['installedLaborPercent.fenceOfferings.wood.heightRows.eight.offeringRates.installedFencePerLF']],
    ['wood · over 6 ft up to 8 ft','steep',['installedLaborPercent.fenceOfferings.wood.heightRows.eight.offeringRates.installedFencePerLF']]]);
  for(const row of status.laborAdjustmentCoverage)assert.deepEqual(row.components,['Installed fence including standard posts and footings']);
  // The quote for a listed condition goes to review, as the list says.
  const held=generateQuoteVNext({...f,customerInputs:{...f.customerInputs,terrainSlope:'moderate'}});
  assert.equal(held.reviewReason,'Set the labor portion of this installed price before applying a labor adjustment.');
  // Flat ground quotes: 100 LF x 40.00 = 4,000.00.
  assert.equal(mid(ready(f)).finalTotalCents,400000);
  // The 6 ft row's labor portion entered at 60%: only the 8 ft row is listed, and moderate ground at 6 ft
  // quotes 4,000.00 + 60% x 4,000.00 x 0.15 = 360.00: 4,360.00.
  f.ownerPricing.pricing.fenceOfferings.wood.heightRows.six.installedLaborPercent={'offeringRates.installedFencePerLF':60};
  assert.deepEqual(vNextServiceStatus(f.ownerPricing,f.businessDefaults).laborAdjustmentCoverage.map(r=>r.tierName),['wood · over 6 ft up to 8 ft','wood · over 6 ft up to 8 ft']);
  assert.equal(mid(ready({...f,customerInputs:{...f.customerInputs,terrainSlope:'moderate'}})).finalTotalCents,436000);
  // Entered once for the fence type: nothing is listed.
  const g=noLaborPortions(fenceFixture('installed'));g.ownerPricing.pricing.fenceOfferings.wood.installedLaborPercent={'offeringRates.installedFencePerLF':60};
  assert.deepEqual(vNextServiceStatus(g.ownerPricing,g.businessDefaults).laborAdjustmentCoverage,[]);
  // Fence-type options are listed with their option names.
  const h=noLaborPortions(fourTypes()),rows=vNextServiceStatus(h.ownerPricing,h.businessDefaults).laborAdjustmentCoverage;
  assert.equal(rows.length,4*3*2*2);
  assert.equal(rows[0].tierName,'wood · Good · over 4 ft up to 6 ft');
});
test('#2 the single-fence layout is listed as before',()=>{
  const f=noLaborPortions(offeringFixture('FENCING_INSTALL','installed'));
  assert.deepEqual(vNextServiceStatus(f.ownerPricing,f.businessDefaults).laborAdjustmentCoverage.map(r=>[r.tierName,r.selection.terrainSlope,r.missingOwnerFields]),[
    [null,'moderate',['installedLaborPercent.offeringRates.installedFencePerLF']],[null,'steep',['installedLaborPercent.offeringRates.installedFencePerLF']]]);
});

// ---------------------------------------------------------------------------
// #3 Isolation joints are an installed selling price; markup on a split line
// is taxed on its taxable share only.
// ---------------------------------------------------------------------------
import {corpusInputs} from '../verification/engine-fingerprint/fingerprint.mjs';
const corpus=Object.fromEntries(corpusInputs().map(r=>[r.id,r.input]));
const linesOf=q=>Object.fromEntries(mid(q).lineItems.map(l=>[l.name,l.amountCents]));
test('#3 isolation joints with add-ons at cost and a 20% markup under materials-only tax',()=>{
  // The patio: labor 1,200.00, ready-mix 488.89, formwork 1,000.00, base preparation 350.00. Joints 20 LF x 10.00 = 200.00,
  // 50% materials, 50% labor. Taxed: ready-mix 488.89 + formwork 1,000.00 + joint materials 100.00 = 1,588.89; 10% = 158.89.
  // Total 1,200.00 + 488.89 + 1,000.00 + 200.00 + 350.00 + 158.89 = 3,397.78. No markup: every line here is a selling price
  // except the add-on joints, which are now one too (before: 40.00 markup, all of it taxed: 3,441.78).
  const f=structuredClone(corpus['v29:patio-isolation-joints-materials-tax-share-40']),p=f.ownerPricing.pricing;
  Object.assign(p,{isolationJointPerLF:1000,installedMaterialsPercent:{isolationJointPerLF:50},installedLaborPercent:{isolationJointPerLF:50}});
  f.businessDefaults={...f.businessDefaults,markupPercent:20,markupMode:'markup',markupApplies:Object.fromEntries(Object.keys(f.businessDefaults.markupApplies).map(k=>[k,k==='addon']))};
  const q=ready(f);
  assert.deepEqual(linesOf(q),{'Concrete labor':120000,'Ready-mix concrete':48889,'Formwork':100000,'Isolation joints':20000,'Base preparation':35000,'Tax':15889});
  assert.equal(mid(q).finalTotalCents,339778);
  assert.equal(mid(q).lineItems.find(l=>l.name==='Isolation joints').calculation.effectivePriceBasis,'sell_price');
});
test('#3 a cost-priced add-on that is not split still has its markup taxed with it',()=>{
  // Unchanged rule check: the same patio with materials marked up at 20% (cost basis): ready-mix 488.89 and formwork
  // 1,000.00 are materials: markup 20% x 1,488.89 = 297.78, all taxable with them. Tax 10% x (1,488.89 + 100.00 + 297.78) = 188.67.
  const f=structuredClone(corpus['v29:patio-isolation-joints-materials-tax-share-40']),p=f.ownerPricing.pricing;
  Object.assign(p,{isolationJointPerLF:1000,installedMaterialsPercent:{isolationJointPerLF:50},installedLaborPercent:{isolationJointPerLF:50}});
  f.businessDefaults={...f.businessDefaults,markupPercent:20,markupMode:'markup',markupApplies:Object.fromEntries(Object.keys(f.businessDefaults.markupApplies).map(k=>[k,k==='material']))};
  const q=ready(f),l=linesOf(q);
  assert.equal(l.Markup,29778);assert.equal(l.Tax,18867);
});

// ---------------------------------------------------------------------------
// #4 Carpet: separate rooms turned to share one roll-width cut.
// ---------------------------------------------------------------------------
import {carpetRollPurchase} from '../server/quote-engine-vnext/flooringPricing.js';
import {exactToNumber,exactCompare,exactDivide} from '../server/quote-engine-vnext/exactMath.js';
const roll=(rooms,connected=[])=>carpetRollPurchase({carpetRooms:rooms,carpetConnectedAreas:connected},{carpetRollWidthFt:12,carpetCrossgrainSeams:'not_allowed'});
const boughtSqft=x=>exactToNumber(x.purchasedQuantity);
test('#4 two 6 x 5 rooms on a 12 ft roll share one 12 x 6.5 cut',()=>{
  // Front to back each room is 5 + 0.5 = 5.5 ft across: 5.5 + 5.5 = 11 ft fits the roll, one cut 6 + 0.5 = 6.5 long: 12 x 6.5 = 78 sq ft.
  // Each turned on its own (6.5 across, 5.5 long) buys 12 x 5.5 = 66, two cuts 132 (the old purchase).
  const x=roll([{lengthFt:6,widthFt:5},{lengthFt:6,widthFt:5}]);
  assert.equal(boughtSqft(x),78);assert.deepEqual(x.sharedCuts.map(c=>[c.rooms,c.cutLengthFt,c.boughtSqft]),[[[1,2],6.5,78]]);
  assert.deepEqual(x.areaChoices.map(a=>a.direction),['front_to_back','front_to_back']);
  // Two 7 x 5 rooms: one cut 7.5 long: 90 (was 132). Two 5 x 5: 66 as before. Two 4 x 4: 54 as before.
  assert.equal(boughtSqft(roll([{lengthFt:7,widthFt:5},{lengthFt:7,widthFt:5}])),90);
  assert.equal(boughtSqft(roll([{lengthFt:5,widthFt:5},{lengthFt:5,widthFt:5}])),66);
  assert.equal(boughtSqft(roll([{lengthFt:4,widthFt:4},{lengthFt:4,widthFt:4}])),54);
  // One room given the other way round: it is turned, the other kept: still 78.
  assert.equal(boughtSqft(roll([{lengthFt:6,widthFt:5},{lengthFt:5,widthFt:6}])),78);
  // One connected area (Not sure): both rooms keep one direction: 78.
  assert.equal(boughtSqft(roll([{lengthFt:6,widthFt:5},{lengthFt:6,widthFt:5}],undefined)),78);
  // A single 6 x 5 room is still turned: 12 x 5.5 = 66.
  assert.equal(boughtSqft(roll([{lengthFt:6,widthFt:5}])),66);
});
test('#4 the carpet quote buys and prices the shared cut',()=>{
  const f=fixture('FLOORING_INSTALL',{laborPerSqft:{carpet:100},materialPerSqft:{carpet:300},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',carpetRollWidthFt:12,carpetCrossgrainSeams:'not_allowed',scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Carpet pad',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_carpet:80}},
    {sqft:60,sqftMethod:'exact',newFlooringType:'carpet',existingFloorType:'none',removalNeeded:false,roomCount:2,layoutPattern:'straight',stairSteps:0,carpetRooms:[{lengthFt:6,widthFt:5},{lengthFt:6,widthFt:5}],carpetConnectedAreas:[],underlaymentScopeConfirmed:true});
  const materials=mid(ready(f)).lineItems.find(l=>l.name==='Flooring materials');
  // 78 sq ft x 3.00 = 234.00 (was 132 x 3.00 = 396.00).
  assert.equal(materials.calculation.quantity,78);assert.equal(materials.amountCents,23400);
});
test('#4 a large job keeps its speed',()=>{
  const rooms=Array.from({length:1000},(_,i)=>({lengthFt:5+(i%7),widthFt:4+(i%5)})),start=Date.now();
  roll(rooms,rooms.map((_,i)=>[i+1]));assert.ok(Date.now()-start<5000);
});

// ---------------------------------------------------------------------------
// #5 Thickened edge on a measured outline: along its edges; only the parts no
// wider than two band widths are thickened through.
// ---------------------------------------------------------------------------

import {outlineEdgeBandSqft} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
const outline=points=>({dimensionMethod:'measured_outline',outlinePoints:points,length:undefined,width:undefined});
const slab=(inputs)=>{const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false},inputs);Object.assign(f.ownerPricing.pricing,{thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12,concreteWasteFactor:0});for(const [k,v] of Object.entries(inputs))if(v===undefined)delete f.customerInputs[k];return f;};
const readyMix=f=>mid(ready(f)).lineItems.find(l=>l.name==='Ready-mix concrete').amountCents;
const SQUARE=[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20},{x:0,y:0}];
// A 2 ft wide, 4 ft long landing off the middle of the front edge.
const SPUR=[{x:0,y:0},{x:9,y:0},{x:9,y:-4},{x:11,y:-4},{x:11,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20},{x:0,y:0}];
// A 4 ft wide, 2 ft deep landing.
const WIDE=[{x:0,y:0},{x:8,y:0},{x:8,y:-2},{x:12,y:-2},{x:12,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20},{x:0,y:0}];
const ELL=[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:10,y:10},{x:10,y:20},{x:0,y:20},{x:0,y:0}];
test('#5 band areas, worked by hand',()=>{
  const band=(points,w=1)=>exactToNumber(outlineEdgeBandSqft(points,w));
  // Square: 80 x 1 - 4 x 1 = 76.
  assert.equal(band(SQUARE),76);
  // L (P 80): 80 - 4 = 76, as the rectangle formula gives for any rectilinear outline wider than 2w everywhere.
  assert.equal(band(ELL),76);
  // Square + 2 x 4 spur: the 2 ft spur is no wider than 2 x 1 ft, so all 8 sq ft of it; the square keeps its 76
  // (the 2 ft of front band where the spur joins stays within 1 ft of the spur's sides): 84.
  assert.equal(band(SPUR),84);
  // Square + 4 x 2 landing: the landing's sides and front band (4 x 1 + 2 x 1 x 1 = 6) and the square's front band
  // except the 2 x 1 ft opposite the landing's middle (76 - 4 + 2 = 74): 80. The landing's middle 2 x 1 ft, next to
  // the open side, is more than 1 ft from every edge.
  assert.equal(band(WIDE),80);
  // Plain narrow rectangles: width <= 2w thickens through. 2 x 10 with w 1: all 20; 1.5 x 10: all 15; 3 x 10: 26 - 4 = 22.
  assert.equal(band([{x:0,y:0},{x:2,y:0},{x:2,y:10},{x:0,y:10},{x:0,y:0}]),20);
  assert.equal(band([{x:0,y:0},{x:1.5,y:0},{x:1.5,y:10},{x:0,y:10},{x:0,y:0}]),15);
  assert.equal(band([{x:0,y:0},{x:3,y:0},{x:3,y:10},{x:0,y:10},{x:0,y:0}]),22);
  // T: a 20 x 10 slab (60 - 4 = 56) with a 2 ft wide, 6 ft long spur (12): 68.
  assert.equal(band([{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:11,y:10},{x:11,y:16},{x:9,y:16},{x:9,y:10},{x:0,y:10},{x:0,y:0}]),68);
  // An 8 in band on the square: 80 x 2/3 - 4 x 4/9 = 160/3 - 16/9 = 464/9.
  assert.equal(exactCompare(outlineEdgeBandSqft(SQUARE,exactDivide(8,12)),exactDivide(464,9)),0);
});
test('#5 the ready-mix on outlines with a narrow spur, and plain narrow outlines',()=>{
  // 4 in slab at 180.00 per cubic yard, no waste: (area x 4 + band x 4) / 324 cubic yards.
  // Square outline = the 20 x 20 rectangle: (1,600 + 304) / 324 = 476/81 yd: 1,057.78.
  assert.equal(readyMix(slab(outline(SQUARE))),105778);
  // Square + 2 x 4 spur, 408 sq ft, band 84: (1,632 + 336) / 324 = 1,968/324 yd x 180.00 = 1,093.33.
  // Before: the whole 408 sq ft thickened: 3,264/324 yd x 180.00 = 1,813.33.
  assert.equal(readyMix(slab(outline(SPUR))),109333);
  // A 2 x 10 walk outline (2 ft = 2 x 1 ft band): thickened through: 20 x 8 / 324 x 180.00 = 88.89.
  assert.equal(readyMix(slab(outline([{x:0,y:0},{x:2,y:0},{x:2,y:10},{x:0,y:10},{x:0,y:0}]))),8889);
  // The 2 x 10 walk measured by length and width: the same.
  assert.equal(readyMix(slab({length:10,width:2})),8889);
});

// ---------------------------------------------------------------------------
// #6 Booking across the winter concrete dates.
// ---------------------------------------------------------------------------
import {checkStoredQuoteBookingTerms} from '../server/src/quoteBookingTerms.js';
const WINTER_IN='This quote was priced for concrete work outside the winter period. The chosen date is in the winter period, so request a new quote for that date before booking the job.';
const WINTER_OUT='This quote was priced for concrete work in the winter period. The chosen date is outside the winter period, so request a new quote for that date before booking the job.';
// A winter charge of 35.00 per ordered cubic yard from November 15 to March 31.
const winterQuote=workMonth=>{const f=concrete();Object.assign(f.ownerPricing.pricing,{winterConcreteChargePerUnit:3500,winterConcreteStart:'11-15',winterConcreteEnd:'03-31',readyMixUnit:'cubic_yard'});
  if(workMonth===undefined)delete f.customerInputs.workMonth;else f.customerInputs.workMonth=workMonth;return ready(f);};
const book=(q,start)=>checkStoredQuoteBookingTerms({quoteRow:{resultJson:JSON.stringify({internalResult:q})},startAtUtc:start,timeZone:'America/Moncton'});
test('#6 a winter-priced quote books only in the winter period, and an off-season quote only outside it',()=>{
  const october=winterQuote('october'),december=winterQuote('december'),charge=q=>mid(q).lineItems.find(l=>l.name==='Winter concrete charge');
  assert.equal(charge(october),undefined);assert.ok(charge(december).amountCents>0);
  // The October quote, booked for December 10: the winter charge would be waived.
  assert.deepEqual(book(october,'2026-12-10T14:00:00.000Z'),{ok:false,code:'REQUOTE_REQUIRED',message:WINTER_IN});
  assert.equal(book(october,'2026-10-20T14:00:00.000Z').ok,true);
  // The December quote, booked for July: a winter charge on a summer pour.
  assert.deepEqual(book(december,'2027-07-10T14:00:00.000Z'),{ok:false,code:'REQUOTE_REQUIRED',message:WINTER_OUT});
  assert.equal(book(december,'2027-01-05T14:00:00.000Z').ok,true);
  // The quote follows the pour month (any day in the winter dates), and so does the booking: a November quote
  // includes the charge (November 15-30), and booking November 5 keeps it, as a new quote for November would.
  const november=winterQuote('november');assert.ok(charge(november).amountCents>0);
  assert.equal(book(november,'2026-11-05T14:00:00.000Z').ok,true);
  assert.equal(book(november,'2027-04-05T14:00:00.000Z').message,WINTER_OUT);
  // April: no day of April is in the period.
  assert.equal(book(winterQuote('april'),'2027-03-10T14:00:00.000Z').message,WINTER_IN);
  // The month is read in the business's time zone: 2026-11-01T02:00Z is still October 31 in Moncton.
  assert.equal(book(october,'2026-11-01T02:00:00.000Z').ok,true);
});
test('#6 a quote with no work month (Not sure) includes the charge and books as winter-priced',()=>{
  for(const workMonth of ['not_sure',undefined]){
    const q=winterQuote(workMonth);
    assert.ok(mid(q).lineItems.find(l=>l.name==='Winter concrete charge').amountCents>0,String(workMonth));
    assert.deepEqual(book(q,'2027-07-10T14:00:00.000Z'),{ok:false,code:'REQUOTE_REQUIRED',message:WINTER_OUT},String(workMonth));
    assert.equal(book(q,'2026-12-10T14:00:00.000Z').ok,true,String(workMonth));
  }
});
test('#6 concrete with no winter charge books on any date',()=>{
  const q=ready(concrete());
  for(const at of ['2026-12-10T14:00:00.000Z','2027-07-10T14:00:00.000Z'])assert.equal(book(q,at).ok,true);
});

// ---------------------------------------------------------------------------
// #7 The overall disclaimer of options that leave out different add-ons keeps
// the shared disclosures and the validity statement.
// ---------------------------------------------------------------------------
import {TILE_ON_CONCRETE_SLAB} from '../verification/engine-independent/fixtures.mjs';
import {sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
const BASE='This preliminary estimate is based on the measured project details provided and covers the described scope only. Final pricing is confirmed after review and, when needed, in-person verification. Additional scope, unforeseen conditions, or changes to project details may affect the final price.';
const ROOMS='Labor assumes the 2 rooms are about the same size (about 250 square feet each). If the room sizes differ, labor is confirmed on site.';
const VALID='This quote is valid for 30 days, until December 22, 2026.';
const twoOptions=()=>{
  const f=fixture('FLOORING_INSTALL',{laborPerSqft:{tile:600},materialPerSqft:{tile:600},minimumJob:0},{sqft:500,sqftMethod:'exact',newFlooringType:'tile',existingFloorType:'none',removalNeeded:false,roomCount:2,layoutPattern:'straight',stairSteps:0,furnitureMovingNeeded:true,...TILE_ON_CONCRETE_SLAB});
  f.ownerPricing.tiers=[{name:'Basic',overrides:{materialPerSqft:{tile:400}}},{name:'Full',overrides:{furnitureMovingPrice:20000,furnitureMovingPriceUnit:'flat'}}];
  f.businessDefaults={...f.businessDefaults,quoteValidityDays:30,quoteTimeZone:'UTC'};f.quoteDate={timeZone:'UTC',quoteInstant:'2026-11-22T12:00:00.000Z'};f.currentMonth=11;
  return f;
};
test('#7 options that differ in what they leave out: the overall text keeps the room note and the validity',()=>{
  const q=ready(twoOptions()),[basic,full]=q.options;
  assert.equal(basic.disclaimer,[BASE,ROOMS,'No tax added.',VALID,'This estimate does not include: Furniture moving.'].join(' '));
  assert.equal(full.disclaimer,[BASE,ROOMS,'No tax added.',VALID].join(' '));
  assert.equal(q.disclaimer,[BASE,ROOMS,'No tax added.',VALID].join(' '));
  // The customer copy carries the same overall text.
  assert.equal(sanitizeForCustomerVNext(q).disclaimer,q.disclaimer);
});
test('#7 options that leave out the same things use the first option\'s text, as before',()=>{
  const f=twoOptions();f.customerInputs.furnitureMovingNeeded=false;
  const q=ready(f);assert.equal(q.disclaimer,q.options[0].disclaimer);assert.equal(q.disclaimer,[BASE,ROOMS,'No tax added.',VALID].join(' '));
});

// ---------------------------------------------------------------------------
// #13 A 5-digit ZIP holding a ZIP+4 tax zone at another rate asks for the ZIP+4 code.
// ---------------------------------------------------------------------------
import {ZIP4_NEEDED_MESSAGE} from '../server/taxJurisdiction.js';
const ZIP4='Sales tax differs within this ZIP code. Enter your full 9-digit ZIP+4 code.';
const usDefaults=(zones,extra={})=>({...mowing().businessDefaults,taxMode:'TAX_ALL',taxPercent:8,taxByJobLocation:true,businessCountry:'US',currency:'USD',taxZones:zones,...extra});
const SPLIT={name:'Split block',codes:['98101-1234'],percent:10.25};
const zipQuote=(zones,code,extra={},service={})=>{const f=mowing();Object.assign(f.ownerPricing,service);return generateQuoteVNext({...f,businessDefaults:usDefaults(zones,extra),customerInputs:{...f.customerInputs,postalCode:code}});};
const asksZip4=q=>{assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.invalidCustomerFields,['postalCode']);assert.deepEqual(q.validationMessages,[ZIP4]);};
test('#13 the approved wording',()=>{assert.equal(ZIP4_NEEDED_MESSAGE,ZIP4);});
test('#13 the ZIP+4 code is asked whatever the 5-digit fallback is',()=>{
  // Mowing 100.00 before tax.
  // Fallback a 3-digit zone at 9%: 98101 asks; 98101-1234 is 10.25% (110.25); 98101-5555 is 9% (109.00); 98102 is 9% (109.00).
  const three=[{name:'Seattle area',codes:['981'],percent:9},SPLIT];
  asksZip4(zipQuote(three,'98101'));
  assert.equal(mid(ready({...mowing(),businessDefaults:usDefaults(three),customerInputs:{...mowing().customerInputs,postalCode:'98101-1234'}})).finalTotalCents,11025);
  assert.equal(mid(zipQuote(three,'98101-5555')).finalTotalCents,10900);
  assert.equal(mid(zipQuote(three,'98102')).finalTotalCents,10900);
  // Fallback a 5-digit zone at 9.5%.
  asksZip4(zipQuote([{name:'Downtown',codes:['98101'],percent:9.5},SPLIT],'98101'));
  // Fallback the business rate (8%) outside the zones.
  asksZip4(zipQuote([SPLIT],'98101',{taxOutsideZones:'business_rate'}));
  assert.equal(mid(zipQuote([SPLIT],'98102',{taxOutsideZones:'business_rate'})).finalTotalCents,10800);
});
test('#13 no question where the ZIP+4 rate is the same, or tax is 0% for the service',()=>{
  // The ZIP+4 zone at the 3-digit zone's 9%: 98101 is 109.00.
  assert.equal(mid(zipQuote([{name:'Seattle area',codes:['981'],percent:9},{...SPLIT,percent:9}],'98101')).finalTotalCents,10900);
  // A 0% service rate: no tax anywhere, 100.00.
  assert.equal(mid(zipQuote([{name:'Seattle area',codes:['981'],percent:9},SPLIT],'98101',{},{taxPercent:0})).finalTotalCents,10000);
  // Changed by Neon audit of v51, V51-2 (November 26, 2026): a 5-digit ZIP outside
  // the zones that holds a ZIP+4 zone, with the review setting, asks for the ZIP+4
  // (the customer may be inside it); a ZIP+4 outside every zone still goes to the
  // business to confirm the tax.
  asksZip4(zipQuote([SPLIT],'98101'));
  const q=zipQuote([SPLIT],'98101-5555');assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(q.ownerDecisionRequired.some(d=>d.path==='businessDefaults.taxOutsideZones'));
});
test('#13 the activation sample is not a 5-digit code that would only ask for the ZIP+4 code',()=>{
  const zones=[{name:'Seattle area',codes:['981'],percent:9},SPLIT];
  assert.equal(sampleTaxLocationCode(usDefaults(zones)),'98101-1234');
  assert.equal(vNextServiceStatus(mowing().ownerPricing,usDefaults(zones)).status,'QUOTING LIVE');
  // A zone list with no ZIP+4 zone samples as before.
  assert.equal(sampleTaxLocationCode(usDefaults([{name:'Seattle area',codes:['981'],percent:9}])),'98101');
});
test('#13 the job-details check asks the customer for the ZIP+4 code in the approved words',()=>{
  const id=owner('US','WA'),f=mowing();
  f.businessDefaults=usDefaults([{name:'Seattle area',codes:['981'],percent:9},SPLIT]);
  publish(id,f);
  const raw=loadPricebook(id).services[0];
  const body=code=>({requestId:randomUUID(),serviceId:raw.id,serviceRequest:raw.service,customerInputs:{...structuredClone(f.customerInputs),postalCode:code},customerFeeSelections:{},additionalWork:[],contact:{email:'caller@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'});
  const asked=bridge.prepareApplicationIntake(id,body('98101'),date);
  assert.equal(asked.status,'needs_details');assert.deepEqual(asked.followUps,[ZIP4]);
  assert.equal(bridge.prepareApplicationIntake(id,body('98101-1234'),date).status,'ready');
});

// ---------------------------------------------------------------------------
// #10 A $0 surface extra, repair unit price or minimum, or low-slope shingle
// price can be marked as included in another price.
// ---------------------------------------------------------------------------
import {siding} from '../verification/engine-independent/fixtures.mjs';
import {includedFixture} from './quoteEngineVNextFixtures.mjs';
import {priceChoices} from '../client/src/pricebookReview.js';
const METADATA=bridge.applicationMetadata().services,metaFor=type=>METADATA.find(s=>s.serviceType===type);
test('#10 a $0 soffit included in the fascia price quotes; unclassified it still goes to review',()=>{
  const f=siding(),p=f.ownerPricing.pricing;
  Object.assign(p,{surfaceExtraRates:{soffit:0,fascia:700},sidingSettings:{soffitUnit:'linear_feet'},installedLaborPercent:{'surfaceExtraRates.fascia':60},installedMaterialsPercent:{'surfaceExtraRates.fascia':40}});
  Object.assign(f.customerInputs,{surfaceOptionalItems:['soffit','fascia'],soffitQuantity:150,fasciaLengthLF:100});
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  f.ownerPricing=includedFixture(f.ownerPricing,{'surfaceExtraRates.soffit':'surfaceExtraRates.fascia'});
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  // Labor 1,000 sq ft x 4.00 = 4,000.00, materials 7,700.00, soffit included (0), fascia 100 LF x 7.00 = 700.00: 12,400.00.
  const q=ready(f),soffit=mid(q).lineItems.find(l=>l.name==='Soffit');
  assert.equal(mid(q).finalTotalCents,1240000);assert.equal(soffit.amountCents,0);assert.equal(soffit.noChargeReason,'included_in_another_price');
});
test('#10 a $0 repair unit price included in the repair minimum quotes',()=>{
  const f=fixture('ROOFING_REPAIR',{repairMinimum:0,largeRepairMaxSqft:1_000_000},{repairType:'shingle_patch',affectedArea:60,roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false});
  Object.assign(f.ownerPricing.pricing,{repairPricingUnit:{asphalt_shingle:{shingle_patch:'square_feet'}},repairUnitPrice:{asphalt_shingle:{shingle_patch:0}},repairAreaMinimum:{asphalt_shingle:{shingle_patch:30000}},repairFirstAreaSqft:{asphalt_shingle:{shingle_patch:25}},installedLaborPercent:{'repairAreaMinimum.asphalt_shingle.shingle_patch':60}});
  f.ownerPricing=includedFixture(f.ownerPricing,{'repairUnitPrice.asphalt_shingle.shingle_patch':'repairAreaMinimum.asphalt_shingle.shingle_patch'});
  {const st=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(st.status,'QUOTING LIVE',JSON.stringify([st.missingOwnerFields,st.ownerDiagnostics]));}
  // Minimum 300.00 for the first 25 sq ft; the other 35 sq ft included: 300.00.
  const q=ready(f),extra=mid(q).lineItems.find(l=>l.name==='shingle patch additional area');
  assert.equal(mid(q).finalTotalCents,30000);assert.equal(extra.noChargeReason,'included_in_another_price');
});
test('#10 a $0 low-slope shingle price included in the shingle material price quotes',()=>{
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:50000},materialCostPerSquare:{asphalt_shingle:30000},tearOffPerSquare:{asphalt_shingle:10000},minimumJob:0,accessoryPricingMode:'per_square_allin',
    roofBuildingCode:'nbc',roofProductThreeTab:{asphalt_shingle:true},lowSlopeAssemblyByProduct:{asphalt_shingle:'nbc_low_slope_application'},nbcLowSlopeShingleFactorByProduct:{asphalt_shingle:1.5},nbcLowSlopeShingleMaterialByProduct:{asphalt_shingle:0},nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000,
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},underlaymentPerSquare:{asphalt_shingle:2000},installedLaborPercent:{'underlaymentPerSquare.asphalt_shingle':0},installedMaterialsPercent:{'underlaymentPerSquare.asphalt_shingle':100}},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'under_four',pitchRisePer12:3,stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  f.ownerPricing=includedFixture(f.ownerPricing,{'nbcLowSlopeShingleMaterialByProduct.asphalt_shingle':'materialCostPerSquare.asphalt_shingle'});
  // Labor 20 x 500.00 = 10,000.00; field materials 22 x 300.00 = 6,600.00; tear-off 2,000.00; underlayment 20 x 20.00 = 400.00;
  // extra shingles included (0); cement 20 x 12.00 = 240.00; low-slope labor 20 x 30.00 = 600.00: 19,840.00.
  const q=ready(f);assert.equal(mid(q).finalTotalCents,1984000);
  assert.equal(mid(q).lineItems.find(l=>l.name==='Low-slope extra shingles').noChargeReason,'included_in_another_price');
});
test('#10 the price-book choice list offers these prices',()=>{
  const paths=(type,pricing)=>priceChoices({serviceType:type,pricing},metaFor(type)).map(r=>r.path);
  assert.deepEqual(paths('SIDING_REPLACEMENT',{laborPerSqft:{vinyl:400},surfaceExtraRates:{soffit:0,fascia:700}}),['laborPerSqft.vinyl','surfaceExtraRates.soffit','surfaceExtraRates.fascia']);
  assert.deepEqual(paths('EXTERIOR_PAINTING',{surfaceExtraRates:{doorSides:0}}),['surfaceExtraRates.doorSides']);
  assert.ok(paths('ROOFING_REPAIR',{repairUnitPrice:{asphalt_shingle:{shingle_patch:0}},repairAreaMinimum:{asphalt_shingle:{shingle_patch:30000}}}).includes('repairUnitPrice.asphalt_shingle.shingle_patch'));
  assert.ok(paths('ROOFING_REPLACEMENT',{nbcLowSlopeShingleMaterialByProduct:{asphalt_shingle:0}}).includes('nbcLowSlopeShingleMaterialByProduct.asphalt_shingle'));
});

// ---------------------------------------------------------------------------
// #11 A $0 flat-roof detail or repair price asks for no labor and materials split.
// ---------------------------------------------------------------------------
import {installedPriceDefinitions} from '../server/installedPriceConfiguration.js';
import {FLAT_ROOF_ITEMS} from '../server/quote-engine-vnext/flatRoofRepairPricing.js';
test('#11 only prices above zero are split between labor and materials',()=>{
  const [zero,priced]=FLAT_ROOF_ITEMS.filter(item=>item.field!=='deckSheets');
  assert.deepEqual(Object.keys(installedPriceDefinitions('FLAT_ROOF_REPLACEMENT',{[zero.rate]:0,[priced.rate]:500})),[priced.rate]);
  assert.deepEqual(Object.keys(installedPriceDefinitions('ROOFING_REPAIR',{repairPricingUnit:{asphalt_shingle:{shingle_patch:'square_feet',ridge_cap:'each'}},repairUnitPrice:{asphalt_shingle:{shingle_patch:0,ridge_cap:900}},repairAreaMinimum:{asphalt_shingle:{shingle_patch:30000}}})).sort(),
    ['repairAreaMinimum.asphalt_shingle.shingle_patch','repairUnitPrice.asphalt_shingle.ridge_cap']);
  // Flooring add-ons already worked this way.
  assert.deepEqual(Object.keys(installedPriceDefinitions('FLOORING_INSTALL',{transitionPriceEach:0,floorLevelingPerSqft:200})),['floorLevelingPerSqft']);
});

// ---------------------------------------------------------------------------
// #15 Fees inside or on top of the minimum is a business choice in conflict recovery.
// ---------------------------------------------------------------------------
import {reconcilePricebook} from '../client/src/pricebookConflict.js';
test('#15 two sessions: fees moved inside the minimum, and the minimum changed: one choice, kept whole',()=>{
  const s={id:randomUUID(),serviceType:'CUSTOM',service:'[SYNTHETIC] Custom',tiers:[],pricing:{price:1}};
  const book=defaults=>({services:[s],defaults,revision:1});
  const base={markupMode:'markup',markupPercent:20,taxMode:'TAX_ALL',taxPercent:5,currency:'CAD',minimumJobPrice:20000,minimumFeeTreatment:'travel_permit_on_top'};
  const A={...base,minimumFeeTreatment:'fees_in_minimum'},B={...base,minimumJobPrice:25000};
  for(const [local,remote] of [[A,B],[B,A]]){
    const first=reconcilePricebook(book(base),book(local),book(remote),{},METADATA);
    assert.equal(first.conflicts.length,1);assert.equal(first.conflicts[0].kind,'defaults');
    for(const pick of ['local','remote'])assert.deepEqual(reconcilePricebook(book(base),book(local),book(remote),{[first.conflicts[0].key]:pick},METADATA).draft.defaults,pick==='local'?local:remote);
  }
  // Numbers only still merge.
  const n=reconcilePricebook(book(base),book({...base,minimumJobPrice:25000}),book({...base,taxPercent:13}),{},METADATA);
  assert.equal(n.conflicts.length,0);assert.deepEqual(n.draft.defaults,{...base,minimumJobPrice:25000,taxPercent:13});
});

// ---------------------------------------------------------------------------
// #16 and #17 Website price import (v44 importer).
// ---------------------------------------------------------------------------
import http from 'node:http';
import {createWebsitePriceImporter} from '../server/src/websitePriceImport.js';
import {extractWebsitePrices} from '../server/src/websitePriceExtraction.js';
const STYLE_WARNING='Some of the website styling could not be checked, so a price the website hides may be included. Remove any price your customers cannot see on the website.';
test('#16 a zero max-width with overflow hidden hides the price, as zero width and height do',()=>{
  for(const css of ['.mw{overflow:hidden;max-width:0}','.mw{overflow:hidden;max-width:0px}','.mw{overflow-x:hidden;max-width:0}','.mw{overflow:hidden;width:0}','.mw{overflow:hidden;height:0}','.mw{overflow:hidden;max-height:0}']){
    const out=extractWebsitePrices('<style>'+css+'</style><p>[SYNTHETIC] Gutter clean $120</p><p class="mw">[SYNTHETIC] Hidden Promo $19</p>');
    assert.deepEqual(out.entries.map(e=>e.excerpt),['[SYNTHETIC] Gutter clean $120'],css);assert.equal(out.visibilityUnverified,false,css);
  }
  // Without overflow hidden the text overflows and shows: kept. A non-zero max-width is ordinary layout: kept.
  for(const css of ['.mw{max-width:0}','.mw{overflow:hidden;max-width:300px}']){
    const out=extractWebsitePrices('<style>'+css+'</style><p class="mw">[SYNTHETIC] Shown $19</p>');
    assert.deepEqual(out.entries.map(e=>e.excerpt),['[SYNTHETIC] Shown $19'],css);
  }
});
async function website(t,routes){
  const seen=[],server=http.createServer((req,res)=>{const route=routes[req.url];if(!route){res.statusCode=404;res.end();return;}res.setHeader('Content-Type',route.type||'text/html; charset=utf-8');res.end(route.body);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();return new Promise(resolve=>server.close(resolve));});
  const port=server.address().port;
  const request=(url,options,callback)=>{seen.push(url.href);return http.request(new URL(url.pathname+url.search,'http://127.0.0.1:'+port),{...options,lookup:undefined,headers:{...options.headers,Host:url.host}},callback);};
  return {seen,importPrices:createWebsitePriceImporter({lookup:async()=>[{address:'8.8.8.8',family:4}],request})};
}
test('#17 links to other sites keep no requests back from the stylesheets',async t=>{
  // A home page with 7 same-host stylesheets and 10 social-media links; the 7th stylesheet hides "Secret $1".
  const social=['facebook.com','instagram.com','x.com','youtube.com','tiktok.com','linkedin.com','pinterest.com','yelp.com','nextdoor.com','google.com'].map(host=>`<a href="https://www.${host}/business">${host}</a>`).join('');
  const routes={'/':{body:'<html><head>'+Array.from({length:7},(_,i)=>`<link rel="stylesheet" href="/css/${i}.css">`).join('')+'</head><body><p>[SYNTHETIC] Window wash $80</p><p class="secret">[SYNTHETIC] Secret $1</p><footer>'+social+'</footer></body></html>'}};
  for(let i=0;i<7;i++)routes[`/css/${i}.css`]={type:'text/css',body:i===6?'.secret{display:none}':'.x'+i+'{margin:0}'};
  const s=await website(t,routes);
  const result=await s.importPrices('http://business.example/');
  assert.deepEqual(result.websiteImport.entries.map(e=>e.excerpt),['[SYNTHETIC] Window wash $80']);
  assert.equal(result.websiteImport.visibilityUnverified,false);assert.ok(!(result.websiteImport.message||'').includes(STYLE_WARNING));
  // The page and its 7 stylesheets; no other site is requested.
  assert.equal(s.seen.length,8);assert.ok(s.seen.every(url=>url.startsWith('http://business.example/')));
});
test('#17 same-host pages still to fetch keep their requests',async t=>{
  // 10 stylesheets and a link to /prices: the price page is still fetched.
  const routes={'/':{body:'<html><head>'+Array.from({length:10},(_,i)=>`<link rel="stylesheet" href="/css/${i}.css">`).join('')+'</head><body><p>[SYNTHETIC] Home visit $50</p><nav><a href="/prices">Prices</a><a href="https://www.facebook.com/b">Facebook</a></nav></body></html>'},
    '/prices':{body:'<html><body><p>[SYNTHETIC] Deep clean $300</p></body></html>'}};
  for(let i=0;i<10;i++)routes[`/css/${i}.css`]={type:'text/css',body:'.x{margin:0}'};
  const s=await website(t,routes);
  const result=await s.importPrices('http://business.example/');
  assert.deepEqual(result.websiteImport.entries.map(e=>e.excerpt),['[SYNTHETIC] Home visit $50','[SYNTHETIC] Deep clean $300']);
  assert.ok(s.seen.includes('http://business.example/prices'));assert.ok(s.seen.length<=12);
});
