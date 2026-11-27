// November 26, 2026 (v58). Repairs from the read-only audit of v57 (04240a6),
// requested by the owner. Every expected value is worked out by hand in the
// comments before the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {concrete} from '../verification/engine-independent/fixtures.mjs';
import {checkStoredQuoteBookingTerms} from '../server/src/quoteBookingTerms.js';
import {customerContextFields} from '../server/customerContextFields.js';

const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const mid=q=>q.options[0].calculationRecord.scenarios.mid;
const line=(q,name)=>mid(q).lineItems.find(l=>l.name===name);
const total=q=>mid(q).finalTotalCents;

test('the engine is v60 (file written for v58)',()=>{assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261126-v60');});

// ---------------------------------------------------------------------------
// Fix 1. With no work month, one quote never combines the busy-season
// surcharge with a winter concrete charge that no single month would pay.
//
// The slab: 20 x 10 ft, 4 in thick, with base preparation, no markup, no tax.
//   Concrete labor      200 sq ft x 6.00            = 1,200.00
//   Ready-mix concrete  200 x 4/12 / 27 = 2.469136 yd3, x 1.10 waste = 2.716049 yd3
//                       2.716049 x 180.00            =   488.89
//   Formwork            60 ft x 25.00               = 1,500.00
//   Base preparation    200 sq ft x 1.75            =   350.00
//   Neither charge                                  = 3,538.89
//   Busy season 15% of labor 1,200.00               =   180.00
//   Winter charge 2.716049 yd3 x 20.00              =    54.32
// ---------------------------------------------------------------------------
const WINTER={winterConcreteChargePerUnit:2000,winterConcreteStart:'11-01',winterConcreteEnd:'04-15'};
const seasonal=(workMonth,peakMonths,percent=15,pricing=WINTER)=>{
  const f=concrete();f.currentMonth=11;
  if(peakMonths){f.ownerPricing.peakMonths=peakMonths;f.ownerPricing.peakSurchargePercent=percent;}
  Object.assign(f.ownerPricing.pricing,pricing);
  if(workMonth===undefined)delete f.customerInputs.workMonth;else f.customerInputs.workMonth=workMonth;
  return ready(f);
};
const book=(q,start)=>checkStoredQuoteBookingTerms({quoteRow:{resultJson:JSON.stringify({internalResult:q})},startAtUtc:start,timeZone:'America/Toronto'});
const BUSY_OUT='This quote was priced for busy-season work. The chosen date is outside the busy season, so request a new quote for that date before booking the job.';
const WINTER_OUT='This quote was priced for concrete work in the winter period. The chosen date is outside the winter period, so request a new quote for that date before booking the job.';
const NOT_INCLUDED=/This price does not include the winter concrete charge\. That charge is added if the concrete is poured from November 1 to April 15\./;
const INCLUDED_UNKNOWN=/Includes the winter concrete charge because no work month was given\. The price is lower if the concrete is poured outside November 1 to April 15\./;

test('fix 1: a chosen month is priced as before (July busy, January winter, October neither)',()=>{
  const july=seasonal('july',[6,7,8]),january=seasonal('january',[6,7,8]),october=seasonal('october',[6,7,8]);
  assert.equal(total(july),371889);assert.equal(line(july,'Winter concrete charge'),undefined);assert.equal(line(july,'Peak season adjustment').amountCents,18000);
  assert.equal(total(january),359321);assert.equal(line(january,'Winter concrete charge').amountCents,5432);assert.equal(line(january,'Peak season adjustment'),undefined);
  assert.equal(total(october),353889);
});
test('fix 1: summer busy season and a winter charge, month not given: the busy-season price without the winter charge',()=>{
  for(const workMonth of ['not_sure',undefined]){
    const q=seasonal(workMonth,[6,7,8]);
    // 3,538.89 + 180.00 = 3,718.89, the July price. Before: 3,773.21 (both charges).
    assert.equal(total(q),371889,String(workMonth));
    assert.equal(line(q,'Peak season adjustment').amountCents,18000);
    assert.equal(line(q,'Winter concrete charge'),undefined);
    assert.match(q.options[0].disclaimer,NOT_INCLUDED);
    assert.match(q.options[0].disclaimer,/Priced at the busy-season rate because no work month was given\. The price is lower if the work is scheduled outside June, July, August\./);
    assert.doesNotMatch(q.options[0].disclaimer,/Includes the winter concrete charge/);
    // It books in the busy season at this price, and needs a new quote elsewhere.
    for(const start of ['2027-06-10T14:00:00.000Z','2027-07-10T14:00:00.000Z','2027-08-10T14:00:00.000Z'])assert.deepEqual(book(q,start),{ok:true},start);
    for(const start of ['2027-01-10T14:00:00.000Z','2027-04-10T14:00:00.000Z','2027-05-10T14:00:00.000Z','2027-09-10T14:00:00.000Z','2026-12-10T14:00:00.000Z'])assert.deepEqual(book(q,start),{ok:false,code:'REQUOTE_REQUIRED',message:BUSY_OUT},start);
    const rule=q.options[0].calculationRecord.ruleApplications.find(r=>r.name==='winterConcreteCharge');
    assert.deepEqual(rule.result,{applied:false,monthGiven:false});assert.deepEqual(rule.inputs.assumedBusyMonths,[6,7,8]);
  }
});
test('fix 1: a busy month inside the winter period, month not given: both charges, as that month pays',()=>{
  // Busy March to May; March and April 1-15 are in the winter period.
  // 3,538.89 + 180.00 + 54.32 = 3,773.21, the March price.
  const march=seasonal('march',[3,4,5]);assert.equal(total(march),377321);
  for(const workMonth of ['not_sure',undefined]){
    const q=seasonal(workMonth,[3,4,5]);
    assert.equal(total(q),377321,String(workMonth));
    assert.equal(line(q,'Winter concrete charge').amountCents,5432);assert.equal(line(q,'Peak season adjustment').amountCents,18000);
    assert.match(q.options[0].disclaimer,INCLUDED_UNKNOWN);assert.doesNotMatch(q.options[0].disclaimer,NOT_INCLUDED);
    assert.deepEqual(book(q,'2027-03-10T14:00:00.000Z'),{ok:true});assert.deepEqual(book(q,'2027-04-10T14:00:00.000Z'),{ok:true});
    // May is busy but not winter: the price would be lower, so a new quote.
    assert.deepEqual(book(q,'2027-05-10T14:00:00.000Z'),{ok:false,code:'REQUOTE_REQUIRED',message:WINTER_OUT});
    assert.deepEqual(book(q,'2027-01-10T14:00:00.000Z'),{ok:false,code:'REQUOTE_REQUIRED',message:BUSY_OUT});
  }
});
test('fix 1: no busy season, or a zero or year-round one: the winter charge is still included when the month is not given',()=>{
  // No busy season: 3,538.89 + 54.32 = 3,593.21.
  for(const q of [seasonal('not_sure',null),seasonal(undefined,null),seasonal('not_sure',[6,7,8],0)]){
    assert.equal(total(q),359321);assert.equal(line(q,'Winter concrete charge').amountCents,5432);assert.match(q.options[0].disclaimer,INCLUDED_UNKNOWN);
    assert.deepEqual(book(q,'2027-01-10T14:00:00.000Z'),{ok:true});
    assert.deepEqual(book(q,'2027-07-10T14:00:00.000Z'),{ok:false,code:'REQUOTE_REQUIRED',message:WINTER_OUT});
  }
  // A surcharge in all twelve months is not a season: every winter month pays both. 3,538.89 + 180.00 + 54.32.
  const all=seasonal('not_sure',[1,2,3,4,5,6,7,8,9,10,11,12]);
  assert.equal(total(all),377321);assert.match(all.options[0].disclaimer,INCLUDED_UNKNOWN);
  assert.deepEqual(book(all,'2027-01-10T14:00:00.000Z'),{ok:true});
});
test('fix 1: with no winter charge set, the busy-season rule alone is unchanged',()=>{
  const q=seasonal('not_sure',[6,7,8],15,{});
  assert.equal(total(q),371889);assert.doesNotMatch(q.options[0].disclaimer,/winter/i);
});
test('fix 1: the work-month question tells the customer what "Not sure" does',()=>{
  const raw={serviceType:'CONCRETE_PATIO_SLAB'},pricing={...concrete().ownerPricing.pricing,...WINTER};
  const details=defaults=>customerContextFields(raw,pricing,defaults).find(f=>f.name==='workMonth').details;
  assert.deepEqual(details({peakMonths:[],peakSurchargePercent:0}),['The winter concrete charge follows the month the concrete is poured. If you are not sure, it is included.']);
  assert.deepEqual(details({peakMonths:[6,7,8],peakSurchargePercent:15}),['Busy-season pricing follows the month the work is done. If you are not sure, the busy-season price is shown.','The winter concrete charge follows the month the concrete is poured. If you are not sure, the quote says whether it is included.']);
});

// ---------------------------------------------------------------------------
// Fix 2. A roof area worked out from the footprint and pitch is not called
// "measured".
//
// 1,500 sq ft footprint at 6/12: 1,500 x sqrt(1 + (6/12)^2) = 1,677.05 sq ft
// = 16.7705 squares, shown as 16.77.
//   Labor         16.7705 x 200.00                          = 3,354.10
//   Shingles      16.7705 x 1.10 = 18.44755 squares, 3 bundles a square:
//                 56 bundles = 18.6667 squares x 150.00     = 2,800.00
//   Tear-off      16.7705 x 60.00                           = 1,006.23
//   Underlayment  16.7705 x 10.00 = 167.705                 =   167.71
//   Disposal      16.7705 x 20.00                           =   335.41
//   Total                                                   = 7,663.45
// ---------------------------------------------------------------------------
import {fixture,mowing,siding} from '../verification/engine-independent/fixtures.mjs';
function roof(customer={}){
  const f=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},
    tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:1000},
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},bundlesPerSquare:{asphalt_shingle:3},
    disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0
  },{roofSizeMethod:'footprint',roofSizeInput:1500,pitchRisePer12:6,existingRoofType:'asphalt_shingle',
    replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,
    roofComplexity:'simple',serviceScope:'full',...customer});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  Object.assign(f.ownerPricing.pricing,{pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70});
  return f;
}
test('fix 2: a footprint roof says its area was calculated; a measured roof still says measured; the price is the same',()=>{
  const footprint=ready(roof()),measured=ready(roof({roofSizeMethod:'roof_measured',roofSizeInput:1677.05}));
  assert.equal(total(footprint),766345);assert.equal(total(measured),766345);
  assert.ok(footprint.priceDrivers.includes('Roof area calculated from the footprint and pitch: 16.77 roofing squares'),JSON.stringify(footprint.priceDrivers));
  assert.ok(!footprint.priceDrivers.some(d=>/Measured roof area/.test(d)));
  assert.ok(measured.priceDrivers.includes('Measured roof area: 16.77 roofing squares'),JSON.stringify(measured.priceDrivers));
  assert.ok(!measured.priceDrivers.some(d=>/calculated from the footprint/.test(d)));
});

// ---------------------------------------------------------------------------
// Fix 5. The editor says when a business-wide setting was changed, because
// every service's saved approval covers those settings.
// ---------------------------------------------------------------------------
import {businessSettingsChanged,BUSINESS_SETTINGS_CHANGED_NOTICE} from '../client/src/pricebookEditing.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
test('fix 5: a changed business-wide setting is detected; the price-age reminder and an empty travel-area list are not',()=>{
  const saved={markupPercent:20,markupMode:'markup',taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:10,peakMonths:[6,7,8],markupApplies:{labor:true,material:true}};
  assert.equal(businessSettingsChanged({...saved},saved),false);
  assert.equal(businessSettingsChanged({...saved,markupApplies:{material:true,labor:true}},saved),false); // key order
  assert.equal(businessSettingsChanged({...saved,markupPercent:25},saved),true);
  assert.equal(businessSettingsChanged({...saved,markupApplies:{labor:true,material:false}},saved),true);
  assert.equal(businessSettingsChanged({...saved,peakMonths:[6,7]},saved),true);
  assert.equal(businessSettingsChanged({...saved,travelZones:[{name:'North',codes:['K1A'],charge:50}]},saved),true);
  // Not part of the approval: the reminder for old prices, and travel areas with none set.
  assert.equal(businessSettingsChanged({...saved,stalePriceThresholdDays:90},saved),false);
  assert.equal(businessSettingsChanged({...saved,travelZones:[]},saved),false);
  assert.match(BUSINESS_SETTINGS_CHANGED_NOTICE,/applies to every service.*confirmed again before it gives instant quotes/);
});

// ---------------------------------------------------------------------------
// Fix 6. Siding repair quotes say that asbestos and lead-paint work is not
// included. No question is added and no price changes.
//   40 sq ft minor vinyl repair (medium): 4 hours x 100.00 + 100.00 materials = 500.00
// ---------------------------------------------------------------------------
const SIDING_REPAIR_NOTE='Repair does not include testing for or removing asbestos or lead paint. Older siding can contain them; if found, that work is priced separately.';
test('fix 6: a siding repair quote states the asbestos and lead-paint exclusion; the price is unchanged',()=>{
  const q=ready(fixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{vinyl:{minor:{small:2,medium:4,large:8}}},materialAllowance:{vinyl:{minor:{small:5000,medium:10000,large:15000}}}},{sidingType:'vinyl',damageLevel:'minor',affectedArea:40,stories:1}));
  assert.equal(total(q),50000);
  assert.ok(q.options[0].disclaimer.includes(SIDING_REPAIR_NOTE));
  // Other services do not carry the repair sentence.
  assert.ok(!ready(siding()).options[0].disclaimer.includes('Repair does not include'));
  assert.ok(!ready(concrete()).options[0].disclaimer.includes('Repair does not include'));
});

// ---------------------------------------------------------------------------
// Fix 7. A sod service saved at the earlier 5% waste is offered the 10% value.
// ---------------------------------------------------------------------------
import {pendingStartingFactorUpdates,startingFactorUpdateValues} from '../server/quote-engine-vnext/startingFactorUpdates.js';
import {CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {CLASS2_DEFAULTS_BY_SERVICE} from '../server/priceBookMetadata.js';
test('fix 7: sod waste saved at 5% is offered 10%; any other saved value is left alone',()=>{
  const at=value=>pendingStartingFactorUpdates('LANDSCAPING_SOD',field=>({sodWasteFactor:value})[field]);
  assert.deepEqual(at(0.05).map(u=>[u.path,u.previous,u.current,u.label,u.from,u.to]),[['sodWasteFactor',0.05,0.10,'Sod material waste allowance','5%','10%']]);
  assert.deepEqual(startingFactorUpdateValues(at(0.05),()=>0.05),{sodWasteFactor:0.10});
  for(const kept of [0.10,0.08,0,undefined])assert.deepEqual(at(kept),[],String(kept));
  // Both tables of starting values agree.
  assert.equal(CLASS2_DEFINITIONS.LANDSCAPING_SOD.sodWasteFactor.defaultValue,0.10);
  assert.equal(CLASS2_DEFAULTS_BY_SERVICE.LANDSCAPING_SOD.sodWasteFactor,0.10);
});

// ---------------------------------------------------------------------------
// Fix 8. The owner's labor multipliers have a ceiling of 10, so a slipped
// decimal (12 for 1.2) is refused instead of quoted.
//   Mowing 5,000 sq ft x 0.02 = 100.00; one-time x 1.8; severe x 10 = 1,800.00
//   Cleanup 1,000 sq ft x 0.10 = 100.00; heavy x 10 = 1,000.00; disposal 40.00 = 1,040.00
// ---------------------------------------------------------------------------
import {MAX_OWNER_LABOR_MULTIPLIER} from '../server/quote-engine-vnext/contracts.js';
const cleanup=(heavy,debrisLevel='heavy')=>fixture('LANDSCAPING_CLEANUP',{cleanupBaseRatePerSqft:10,debrisPricing:{light:{laborMultiplier:1,disposalFlat:2000},moderate:{laborMultiplier:1,disposalFlat:3000},heavy:{laborMultiplier:heavy,disposalFlat:4000}},minimumServiceCharge:0},{yardSqft:1000,sqftMethod:'exact',debrisLevel,slope:'flat',haulAway:false});
test('fix 8: a labor multiplier of 10 quotes; one above 10 is refused with a plain message',()=>{
  assert.equal(MAX_OWNER_LABOR_MULTIPLIER,10);
  const mow=(change,inputs={})=>{const f=mowing();change(f.ownerPricing.pricing);Object.assign(f.customerInputs,inputs);return f;};
  assert.equal(total(ready(mow(p=>{p.overgrowthMultipliers.severe=10;},{serviceFrequency:'one_time',grassCondition:'severe'}))),180000);
  for(const [change,path,label] of [
    [p=>{p.frequencyMultipliers.weekly=12;},'frequencyMultipliers.weekly','Mowing service-frequency labor multiplier (weekly)'],
    [p=>{p.frequencyMultipliers.one_time=18;},'frequencyMultipliers.one_time','Mowing service-frequency labor multiplier (one time)'],
    [p=>{p.overgrowthMultipliers.severe=10.01;},'overgrowthMultipliers.severe','Grass-condition labor multiplier (severe)']
  ]){
    const q=generateQuoteVNext(mow(change));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',path);assert.deepEqual(q.invalidOwnerFields,[path]);
    assert.ok(q.ownerDiagnostics.some(d=>d.path===path&&d.message===label+': enter a value above 0 and no more than 10. For example, enter 1.5 for one and a half times the labor.'),JSON.stringify(q.ownerDiagnostics));
  }
  assert.equal(total(ready(cleanup(10))),104000);
  const q=generateQuoteVNext(cleanup(15));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.invalidOwnerFields,['debrisPricing.heavy.laborMultiplier']);
  assert.ok(q.ownerDiagnostics.some(d=>d.message==='Cleanup labor multiplier (heavy debris): enter a value above 0 and no more than 10. For example, enter 1.5 for one and a half times the labor.'));
});

// ---------------------------------------------------------------------------
// Fix 4. The phone agent is told what the engine does outside the travel areas.
// ---------------------------------------------------------------------------
import {readFileSync} from 'node:fs';
test('fix 4: the phone instructions match the engine for a job outside the travel areas',()=>{
  const source=readFileSync(new URL('../server/src/voice/voicePromptCompiler.js',import.meta.url),'utf8');
  assert.ok(!source.includes('still returns the quote without a travel charge'));
  // Merged with the launch branch on November 26, 2026: the sentence is the one
  // the owner approved there on November 12. It says the same thing.
  assert.ok(source.includes('outside the travel areas and the business charges travel there, getQuote sends the request to the business for review instead of a price; otherwise it returns the quote without a travel charge.'));
  // The engine: travel always charged, job outside every priced area -> review, no price.
  const f=mowing();f.ownerPricing.feeRules={...f.ownerPricing.feeRules,travel:'always'};
  f.businessDefaults={...f.businessDefaults,travelFee:5000,travelZones:[{name:'Core',codes:['K1A'],charge:5000}]};f.customerInputs={...f.customerInputs,postalCode:'M5V 2T6'};
  const q=generateQuoteVNext(f);
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(q.reviewReason,'This location is outside the areas this business has set travel charges for; the business will confirm the travel charge and the price.');
  assert.equal(q.options,undefined);
});
