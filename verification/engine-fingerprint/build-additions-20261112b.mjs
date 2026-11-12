// One-time build of corpus-additions-20261112b.json (engine v30): one input for
// each v29 fix that no frozen input reached (R01, R04, R05, R06, R07, R10), and
// the v30 roof pitch answers that belong to another pitch method. Each result is
// worked by hand in test/qeReviewV30_20261112.spec.mjs. Run once; the output
// file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261112b.mjs
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {explanationCases} from '../../test/customerExplanationFixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import {fixture,flooring} from '../engine-independent/fixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const catalog=type=>structuredClone(explanationCases().find(r=>r.id==='catalog-'+type).input);
// R01: carpet with price options.
function carpetBook(tiers,pricing={}){
  const f=flooring('carpet',200);delete f.ownerPricing.pricing.perStepPrice;Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true});
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...pricing});
  f.ownerPricing.tiers=tiers;return f;
}
add('v30:r01-yard-option-inherits-foot-carpet-prices',carpetBook([{name:'Yard tier',overrides:{carpetPriceUnit:'square_yard'}}]));
add('v30:r01-foot-option-inexact-beside-yard-option',carpetBook([{name:'Foot tier',overrides:{carpetPriceUnit:'square_foot'}},{name:'Yard tier',overrides:{}}],{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2800},materialPerSqft:{carpet:4500}}));
// R04, R05 and the v30 pitch answers: 2,000 sq ft asphalt shingle roof, October 16 rules.
function slopeRoof(customer={},pricing={}){
  const product='asphalt_shingle';
  const p=Object.fromEntries(Object.entries({laborPerSquare:20000,materialCostPerSquare:15000,tearOffPerSquare:6000,underlaymentPerSquare:2000,underlaymentPriceBasis:'installed_area_sell_price'}).map(([k,v])=>[k,{[product]:v}]));
  const f=fixture('ROOFING_REPLACEMENT',{...p,disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,unknownPitchBand:'up_to_six',
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,...pricing},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:product,replacementRoofType:product,pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  for(const [k,v] of Object.entries(pricing))if(v===undefined)delete f.ownerPricing.pricing[k];
  for(const [k,v] of Object.entries(customer))if(v===undefined)delete f.customerInputs[k];
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  const facts={};
  for(const field of ['existingRoofType','replacementRoofType']){const id=randomUUID();f.ownerPricing.knownOfferings[field]={...f.ownerPricing.knownOfferings[field],[product]:id};facts[field]={status:'identified',field,value:product,offeringId:id};}
  f.customerInputs.confirmedFacts={...f.customerInputs.confirmedFacts,...facts};
  return f;
}
const low={pitchBand:'under_four',pitchRisePer12:3};
add('v30:r04-nbc-self-adhered-saved',slopeRoof(low,{roofBuildingCode:'nbc',lowSlopeAssembly:'self_adhered_underlayment',selfAdheredUnderlaymentPerSquare:4500}));
add('v30:r04-nbc-double-underlayment-saved',slopeRoof(low,{roofBuildingCode:'nbc',lowSlopeAssembly:'double_underlayment'}));
const notSure={pitchMethod:'not_sure',pitchBand:undefined},byArea={pitchMethod:'area_by_pitch',pitchBand:undefined};
add('v30:r05-area-by-pitch-rise-1',slopeRoof({...byArea,pitchAreaUpTo6Sqft:2000,pitchRisePer12:1}));
add('v30:r05-not-sure-rise-1',slopeRoof({...notSure,pitchRisePer12:1}));
add('v30:pitch-not-sure-band-10-to-12',slopeRoof({...notSure,pitchBand:'ten_to_twelve'}));
add('v30:pitch-not-sure-rise-8',slopeRoof({...notSure,pitchRisePer12:8}));
add('v30:pitch-not-sure-rise-3-double-underlayment',slopeRoof({...notSure,pitchRisePer12:3}));
add('v30:pitch-not-sure-band-and-rise-disagree',slopeRoof({...notSure,pitchBand:'ten_to_twelve',pitchRisePer12:8}));
add('v30:pitch-footprint-not-sure-rise-8',slopeRoof({roofSizeMethod:'footprint',roofSizeInput:1800,...notSure,pitchRisePer12:8}));
add('v30:pitch-whole-roof-area-outside-band',slopeRoof({pitchArea10To12Sqft:2000}));
add('v30:pitch-whole-roof-area-inside-band',slopeRoof({pitchAreaUpTo6Sqft:2000}));
add('v30:pitch-area-by-pitch-band-without-area',slopeRoof({...byArea,pitchAreaUpTo6Sqft:2000,pitchBand:'ten_to_twelve'}));
add('v30:pitch-area-by-pitch-rise-without-area',slopeRoof({...byArea,pitchAreaUpTo6Sqft:2000,pitchRisePer12:8}));
add('v30:pitch-area-by-pitch-rise-with-area',slopeRoof({...byArea,pitchAreaUpTo6Sqft:1000,pitchArea7To9Sqft:1000,pitchRisePer12:8}));
// R06: a USD business painting a home in Canada, built 1978-1990, blank lead policy.
const painting=catalog('INTERIOR_PAINTING');delete painting.ownerPricing.pricing.leadSafePainting;
Object.assign(painting.customerInputs,{postalCode:'V5K 0A1',buildingAge:'1978_to_1989'});painting.businessDefaults.currency='USD';
add('v30:r06-usd-business-canadian-postal-code-1978-to-1990',painting);
// R07: flooring removal in a building in the 1978-1990 answer, removal check on.
const removal=catalog('FLOORING_REPLACEMENT');removal.ownerPricing.pricing.olderMaterialRemoval='review_before_1990';removal.customerInputs.buildingAge='1978_to_1989';
add('v30:r07-flooring-removal-1978-to-1990',removal);
// R10: itemized overlay preparation in a busy month.
const overlay=structuredClone(measuredScopeCases().find(r=>r.id==='overlay-itemized').input);
Object.assign(overlay.businessDefaults,{peakMonths:[1],peakSurchargePercent:10});overlay.ownerPricing.peakMonths=[1];overlay.ownerPricing.peakSurchargePercent=10;overlay.currentMonth=1;
add('v30:r10-overlay-preparation-busy-month',overlay);
writeFileSync(new URL('./corpus-additions-20261112b.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
