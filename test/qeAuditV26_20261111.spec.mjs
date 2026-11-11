import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';
import {customerQuoteFields} from '../server/customerQuoteFields.js';
import {customerFieldVisible,customerFieldForInputs} from '../server/scopeConfiguration.js';
import {CLEANUP_DISPOSAL_SITE_LABEL} from '../server/quote-engine-vnext/landscapePricing.js';
import {CLEANUP_BAG_WARNING} from '../server/quote-engine-vnext/flooringPricing.js';
import {starterFieldSpecs} from '../server/src/platformIntegrations.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {migrate} from '../server/src/db.js';
import {explanationCases} from './customerExplanationFixtures.mjs';
import {fixture,cases} from '../verification/engine-independent/fixtures.mjs';

// November 11, 2026: the v26 quote engine and price book audit (engine v27).
// Expected values worked out by hand before running:
// - Cleanup, light debris (labor x1), flat slope, no haul-away, labor $0.10 per
//   sq ft, minimum disposal $150, $80 per load, $3 per bag, 2,000 sq ft per load:
//   1,000 sq ft labor $100.00; 5,000 sq ft labor $500.00.
//   5,000 sq ft by area: ceil(5,000 / 2,000) = 3 loads x $80 = $240 -> $740.00.
//   1 load: $80 is under the $150 minimum -> $150 -> $250.00. 3 loads: $240 -> $340.00.
//   60 bags x $3 = $180 -> $280.00. 10 bags x $3 = $30 -> minimum $150 -> $250.00.
//   2 loads x $80 = $160 -> $260.00. No usable count: minimum $150 -> $250.00, with
//   disposal beyond the minimum left for the site visit.
// - Sod, 1,230 sq ft: 1,230 x 1.05 = 1,291.5 sq ft -> 3 pallets of 450 = 1,350 sq ft
//   x $0.65 = $877.50; labor 1,230 x $0.80 = $984.00; combined preparation
//   1,230 x $1.50 = $1,845.00; total $3,706.50. Topsoil instead: 1,230 x 3 / 324 x
//   1.10 = 12.5278 yd x $45 = $563.75; total $2,425.25. Increment 1 yd: 13 yd =
//   $585.00, total $2,446.50. Increment 0.25 yd: 51 x 0.25 = 12.75 yd = $573.75,
//   total $2,435.25.
// - Interior trim, 52 linear feet at $1.50: one coat $78.00, two coats $156.00;
//   with a 0.33 additional-coat ratio, one coat 52 x 1.50 x 2 / 1.33 = $117.29.
// - Flat roof control: 1,000 x $5.00 labor + 1,000 x $7.00 x 1.10 membrane +
//   1,000 x $2.00 tear-off = $14,700.00.
const catalog=id=>structuredClone(explanationCases().find(r=>r.id==='catalog-'+id).input);
const form=f=>customerQuoteFields({...f.ownerPricing,serviceType:f.serviceType},f.ownerPricing.pricing);
const shown=(fields,name,inputs)=>{const field=fields.find(x=>x.name===name);return !!field&&customerFieldVisible(field,inputs);};
const ready=q=>{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const total=q=>ready(q).options[0].calculationRecord.scenarios.mid.finalTotalCents;

// ---- Yard cleanup disposal ----
const levels=sqftPerLoad=>({light:{laborMultiplier:1,disposalFlat:15000,...(sqftPerLoad?{sqftPerLoad}:{})},moderate:{laborMultiplier:1.5,disposalFlat:10000,...(sqftPerLoad?{sqftPerLoad}:{})},heavy:{laborMultiplier:2,disposalFlat:15000,...(sqftPerLoad?{sqftPerLoad}:{})}});
const cleanup=(pricing,inputs={})=>{const f=catalog('LANDSCAPING_CLEANUP');Object.assign(f.ownerPricing.pricing,{cleanupBaseRatePerSqft:10,...pricing});Object.assign(f.customerInputs,{yardSqft:1000,debrisLevel:'light',slope:'flat',haulAway:false,...inputs});return f;};
const PER_LOAD={disposalPerLoad:8000,debrisPricing:levels(2000)},PER_LOAD_NO_SIZE={disposalPerLoad:8000,debrisPricing:levels()},PER_BAG={disposalPerBag:300,debrisPricing:levels()},BOTH={disposalPerBag:300,disposalPerLoad:8000,debrisPricing:levels(2000)},FLAT={debrisPricing:levels()};
const onSite=q=>ready(q).options[0].skippedAddons.includes(CLEANUP_DISPOSAL_SITE_LABEL);

test('cleanup: a count is used only in a priced unit; otherwise area per load, or the minimum with the rest on site',()=>{
  for(const [label,pricing,inputs,cents,site] of [
    ['per load, 10 bags, area estimate',PER_LOAD,{yardSqft:5000,wasteBags:10},74000,false],
    ['per load, 1 load (minimum)',PER_LOAD,{wasteLoads:1},25000,false],
    ['per load, 3 loads',PER_LOAD,{wasteLoads:3},34000,false],
    ['per load without load size, 10 bags',PER_LOAD_NO_SIZE,{wasteBags:10},25000,true],
    ['per bag, 2 loads',PER_BAG,{wasteLoads:2},25000,true],
    ['per bag, Not sure',PER_BAG,{wasteBags:'unknown'},25000,true],
    ['per bag, left blank',PER_BAG,{},25000,true],
    ['per bag, 60 bags',PER_BAG,{wasteBags:60},28000,false],
    ['both, 10 bags and 0 loads',BOTH,{wasteBags:10,wasteLoads:0},25000,false],
    ['both, 0 bags and 2 loads',BOTH,{wasteBags:0,wasteLoads:2},26000,false],
    ['flat only, a bag count supplied',FLAT,{wasteBags:10},25000,false]
  ]){
    const q=generateQuoteVNext(cleanup(pricing,inputs));
    assert.equal(total(q),cents,label);
    assert.equal(onSite(q),site,label+' on-site item');
    if(site)assert.ok(q.options[0].disclaimer.includes('Debris disposal is priced at the business\'s minimum disposal charge. Any disposal beyond it is estimated at the site visit.'),label);
  }
  // Two positive counts are still two answers.
  const both=generateQuoteVNext(cleanup(BOTH,{wasteBags:10,wasteLoads:2}));
  assert.equal(both.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(both.invalidCustomerFields,['wasteLoads']);
});

test('cleanup: the form asks only for the units the owner priced, and the owner is told what an unknown count does',()=>{
  for(const [label,pricing,bags,loads] of [['flat',FLAT,false,false],['per load',PER_LOAD,false,true],['per bag',PER_BAG,true,false],['both',BOTH,true,true]]){
    const f=cleanup(pricing),fields=form(f);
    assert.equal(shown(fields,'wasteBags',f.customerInputs),bags,label+' bags');
    assert.equal(shown(fields,'wasteLoads',f.customerInputs),loads,label+' loads');
  }
  // The owner's status, as the price book shows it.
  const status=p=>{const f=cleanup(p);f.ownerPricing.origin={...(f.ownerPricing.origin||{}),ownerId:f.ownerPricing.origin?.ownerId||'[SYNTHETIC]-owner'};const book={ownerId:f.ownerPricing.origin.ownerId,services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}};return bridge.applicationStatus(f.ownerPricing,book,{quoteInstant:'2026-11-11T12:00:00Z',quoteDateIso:'2026-11-11'}).statusNotices||[];};
  assert.ok(status(PER_BAG).includes(CLEANUP_BAG_WARNING));
  assert.ok(status(PER_LOAD_NO_SIZE).includes(CLEANUP_BAG_WARNING));
  assert.equal(status(PER_LOAD).includes(CLEANUP_BAG_WARNING),false);
  assert.equal(status(FLAT).includes(CLEANUP_BAG_WARNING),false);
  assert.doesNotMatch(CLEANUP_BAG_WARNING,/go to review/);
});

// ---- Leak source ----
test('roof and flat-roof repair: the leak-source question is asked only with a leak, and is required then',()=>{
  for(const [type,cents] of [['ROOFING_REPAIR',58000],['FLAT_ROOF_REPAIR',36000]]){
    const f=catalog(type);
    assert.equal(total(generateQuoteVNext(f)),cents,type+' no leak');
    const leak=structuredClone(f);leak.customerInputs.leakPresent=true;delete leak.customerInputs.leakSourceIdentified;
    const skipped=generateQuoteVNext(leak);
    assert.deepEqual(skipped.missingCustomerFields,['leakSourceIdentified'],type);
    assert.doesNotMatch(skipped.reviewReason,/inspection/,type);
    const fields=form(f),field=fields.find(x=>x.name==='leakSourceIdentified');
    assert.equal(shown(fields,'leakSourceIdentified',f.customerInputs),false,type+' hidden without a leak');
    assert.equal(shown(fields,'leakSourceIdentified',leak.customerInputs),true,type+' shown with a leak');
    assert.equal(customerFieldForInputs(field,leak.customerInputs).label,'Has the exact spot where the water gets in already been found, for example by a roofer?');
    assert.equal(total(generateQuoteVNext({...leak,customerInputs:{...leak.customerInputs,leakSourceIdentified:true}})),cents,type+' found');
    const notFound=generateQuoteVNext({...leak,customerInputs:{...leak.customerInputs,leakSourceIdentified:false}});
    assert.match(notFound.reviewReason,/specifically identified by inspection/,type+' not found');
  }
});

// ---- Low-slope rise ----
function slopeRoof(customer={}){
  const product='asphalt_shingle',p=Object.fromEntries(Object.entries({laborPerSquare:20000,materialCostPerSquare:15000,tearOffPerSquare:6000,underlaymentPerSquare:2000,underlaymentPriceBasis:'installed_area_sell_price'}).map(([k,v])=>[k,{[product]:v}]));
  const f=fixture('ROOFING_REPLACEMENT',{...p,disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:product,replacementRoofType:product,pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  for(const [k,v] of Object.entries(customer))if(v===undefined)delete f.customerInputs[k];
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  const facts={};for(const field of ['existingRoofType','replacementRoofType']){const id=randomUUID();f.ownerPricing.knownOfferings[field]={...f.ownerPricing.knownOfferings[field],[product]:id};facts[field]={status:'identified',field,value:product,offeringId:id};}
  f.customerInputs.confirmedFacts={...f.customerInputs.confirmedFacts,...facts};return f;
}
test('roof replacement: the rise is required under 4/12; Not sure keeps the inspection; with a footprint it is never a value',()=>{
  // Prices for answered roofs are unchanged from v26 ($9,900 at 3/12; $9,500 at 4/12-6/12).
  assert.equal(total(generateQuoteVNext(slopeRoof({pitchBand:'under_four',pitchRisePer12:3}))),990000);
  assert.equal(total(generateQuoteVNext(slopeRoof({pitchRisePer12:undefined}))),950000);
  assert.equal(total(generateQuoteVNext(slopeRoof({pitchRisePer12:'unknown'}))),950000);
  const blank=generateQuoteVNext(slopeRoof({pitchBand:'under_four',pitchRisePer12:undefined}));
  assert.deepEqual(blank.missingCustomerFields,['pitchRisePer12']);
  assert.doesNotMatch(blank.reviewReason,/inspect/);
  const notSure=generateQuoteVNext(slopeRoof({pitchBand:'under_four',pitchRisePer12:'unknown'}));
  assert.deepEqual(notSure.missingCustomerFields,[]);
  assert.match(notSure.reviewReason,/Part or all of this roof is below 4\/12/);
  assert.match(generateQuoteVNext(slopeRoof({pitchBand:'under_four',pitchRisePer12:1})).reviewReason,/2\/12 or steeper/);
  for(const rise of [undefined,'unknown'])assert.deepEqual(generateQuoteVNext(slopeRoof({roofSizeMethod:'footprint',roofSizeInput:1500,pitchRisePer12:rise})).missingCustomerFields,['pitchRisePer12'],String(rise));
  ready(generateQuoteVNext(slopeRoof({roofSizeMethod:'footprint',roofSizeInput:1500,pitchRisePer12:6})));
});

// ---- Sod ----
const sod=(pricing={},inputs={})=>{const f=catalog('LANDSCAPING_SOD');Object.assign(f.customerInputs,{sodSqft:1230,groundPrepNeeded:true,slope:'flat',accessDifficulty:'easy',...inputs});Object.assign(f.ownerPricing.pricing,{sodMaterialPerSqft:65,sodInstallLaborPerSqft:80,groundPrepPerSqft:150,sodPalletSizeSqft:450,...pricing});return f;};
const TOPSOIL={topsoilPerCubicYard:4500,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:3};
const sodNotices=f=>vNextServiceStatus({...f.ownerPricing,serviceType:f.serviceType},f.businessDefaults).statusNotices||[];
test('sod: the owner is told when a separate price replaces the combined preparation price; the numbers are unchanged',()=>{
  assert.equal(total(generateQuoteVNext(sod())),370650);
  assert.deepEqual(sodNotices(sod()),[]);
  const topsoil=sod(TOPSOIL,{usableTopsoilDepthInches:1});
  assert.equal(total(generateQuoteVNext(topsoil)),242525);
  assert.deepEqual(sodNotices(topsoil),['Your combined Ground preparation price is not used while a separate preparation price is set. Quotes leave old-lawn removal and grading out and estimate them at the site visit until each has a separate price.']);
  assert.deepEqual(sodNotices(sod({...TOPSOIL,sodRemovalPerSqft:50,sodGradingPerSqft:30})),['Your combined Ground preparation price is not used while a separate preparation price is set.']);
  assert.deepEqual(sodNotices(sod({groundPrepPerSqft:undefined,sodGradingPerSqft:30})),['Quotes leave old-lawn removal and imported topsoil out and estimate them at the site visit until each has a separate price.']);
  // A tier that changes the separate prices gets its own notice; one that does not repeats nothing.
  const tiered=sod(TOPSOIL);tiered.ownerPricing.tiers=[{name:'Basic',overrides:{}},{name:'Premium',overrides:{sodRemovalPerSqft:50}}];
  assert.deepEqual(sodNotices(tiered).filter(n=>n.startsWith('Basic')),[]);
  assert.ok(sodNotices(tiered).includes('Premium: Your combined Ground preparation price is not used while a separate preparation price is set. Quotes leave grading out and estimate it at the site visit until it has a separate price.'));
  const fields=bridge.applicationMetadata().services.find(s=>s.serviceType==='LANDSCAPING_SOD').fields;
  for(const name of ['topsoilPerCubicYard','sodGradingPerSqft'])assert.match(fields.find(x=>x.field===name).help,/replaces the combined Ground preparation price/,name);
  assert.match(fields.find(x=>x.field==='groundPrepPerSqft').help,/Not used once any separate preparation price/);
});

test('sod: imported topsoil rounds up to the owner\'s order increment; blank keeps the exact amount',()=>{
  for(const [increment,lineCents,cents] of [[undefined,56375,242525],[1,58500,244650],[0.5,58500,244650],[0.25,57375,243525]]){
    const q=generateQuoteVNext(sod({...TOPSOIL,...(increment?{topsoilOrderIncrementCubicYards:increment}:{})},{usableTopsoilDepthInches:1}));
    assert.equal(total(q),cents,String(increment));
    assert.equal(q.options[0].lineItems.find(line=>line.name==='Imported topsoil').amountCents,lineCents,String(increment));
  }
  assert.equal(generateQuoteVNext(sod({...TOPSOIL,topsoilOrderIncrementCubicYards:0},{usableTopsoilDepthInches:1})).resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(bridge.applicationMetadata().services.find(s=>s.serviceType==='LANDSCAPING_SOD').fields.some(x=>x.field==='topsoilOrderIncrementCubicYards'));
});

// ---- Trim ----
test('interior trim prices say per coat, and charge per coat',()=>{
  const fields=bridge.applicationMetadata().services.find(s=>s.serviceType==='INTERIOR_PAINTING').fields;
  assert.equal(fields.find(x=>x.field==='trimLaborPerLF').label,'Trim painting labor price per measured linear foot, per coat');
  assert.equal(fields.find(x=>x.field==='trimMaterialPerLF').label,'Trim paint material price per measured linear foot, per coat');
  const trim=(coats,ratio)=>{const f=catalog('INTERIOR_PAINTING');Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:52,trimCoats:coats,trimSurfaceCondition:'good'});Object.assign(f.ownerPricing.pricing,{trimLaborPerLF:150,trimMaterialPerLF:50});if(ratio)f.ownerPricing.pricing.paintingSettings={...(f.ownerPricing.pricing.paintingSettings||{}),trimAdditionalCoatRatio:ratio};
    return ready(generateQuoteVNext(f)).options[0].lineItems.filter(line=>/^Trim labor/.test(line.name)).reduce((sum,line)=>sum+line.amountCents,0);};
  assert.equal(trim(1),7800);assert.equal(trim(2),15600);assert.equal(trim(1,0.33),11729);
});

// ---- Owner wording ----
test('access labels name their own service; planting has no mixed size; the mowing rate is in dollars everywhere',()=>{
  const meta=bridge.applicationMetadata().services;
  for(const [type,label] of [['LANDSCAPING_SOD','Sod access labor multiplier'],['LANDSCAPING_MULCH','Mulch access labor multiplier'],['LANDSCAPING_PLANTING','Planting access labor multiplier']])
    assert.equal(meta.find(s=>s.serviceType===type).class2Fields.find(x=>x.field==='accessMultiplier').label,label,type);
  assert.doesNotMatch(meta.find(s=>s.serviceType==='LANDSCAPING_PLANTING').fields.find(x=>x.field==='plantingLaborPerPlant').help,/mixed/);
  for(const name of ['plantingLaborPerPlant','plantMaterialAllowance'])assert.deepEqual(starterFieldSpecs('LANDSCAPING_PLANTING').find(x=>x.field===name).shapedKeys.keys,['small','medium','large'],name);
  // With the mowing rate missing, the owner's validation names it in dollars.
  migrate();
  const f=catalog('LANDSCAPING_MOWING');delete f.ownerPricing.pricing.mowingBaseRatePerSqft;
  const owner='[SYNTHETIC]-mow-'+randomUUID(),{origin,id,...service}=f.ownerPricing;
  const result=JSON.stringify(bridge.validateApplicationDraft(owner,{...bridge.readApplicationBook(owner),services:[{...service,serviceType:f.serviceType,source:'MANUAL',active:true}]}));
  assert.doesNotMatch(result,/cents per measured square foot|Enter cents/);
  assert.match(result,/Base mowing labor price per square foot is required\./);
});

test('the independent flat-roof control expects the engine\'s $14,700.00, membrane waste included',()=>{
  const row=cases().find(x=>x.id==='flat-roof-residential-control');
  assert.equal(row.expected?.cents??row.cents,1470000);
  assert.equal(total(generateQuoteVNext(row.input)),1470000);
});
