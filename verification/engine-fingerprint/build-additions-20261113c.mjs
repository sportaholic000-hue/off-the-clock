// One-time build of corpus-additions-20261113c.json (engine v33): inputs for the
// three fixes on top of d0ad85f1. Each result is worked by hand in
// test/qeReviewV33_20261113.spec.mjs. Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261113c.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {fixture,flooring} from '../engine-independent/fixtures.mjs';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../../server/quote-engine-vnext/priceGroundwork.js';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
// Fix 1: the business country saved at onboarding against the currency of the prices.
function taxJob(defaults,code){
  const f=flooring('tile',200);
  Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,taxOutsideZones:'review',...defaults});
  f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,labor:true,material:true};f.customerInputs.postalCode=code;return f;
}
add('v33:fix1-us-business-cad-book-new-york-job',taxJob({currency:'CAD',businessCountry:'US',taxZones:[{name:'Manhattan',codes:'100',percent:8.875}]},'10001'));
add('v33:fix1-ca-business-usd-book-no-zones-toronto-job',taxJob({currency:'USD',businessCountry:'CA'},'M5V 2T6'));
// Fix 2: planting, one small plant on a clean bed, 1.1 cubic yards of brown mulch at $50 / $30.
const corpus=JSON.parse(gunzipSync(readFileSync(new URL('./corpus-inputs.json.gz',import.meta.url))));
const planting=corpus.find(r=>r.id==='explanation:catalog-LANDSCAPING_PLANTING').input;
function plant(increment,yards=1.1){
  const f=structuredClone(planting);
  Object.assign(f.customerInputs,{plantsBySize:{small:1,medium:0,large:0},bedCondition:'clean',mulchNeeded:true,mulchYards:yards,mulchType:'brown'});delete f.customerInputs.bedSqft;
  Object.assign(f.ownerPricing.pricing,{mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:3000});
  if(increment!==undefined)f.ownerPricing.pricing.mulchOrderIncrementCubicYards={brown:increment};
  return f;
}
add('v33:fix2-planting-half-yard-increment-off-increment',plant(0.5));
add('v33:fix2-planting-half-yard-increment-on-increment',plant(0.5,1.5));
add('v33:fix2-planting-blank-increment',plant(undefined));
// Fix 3: 2,000 sq ft asphalt roof at 3/12, ice and water barrier itemized and measured.
const CEMENTED={nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000};
function roof(eave,measured,method='nbc_low_slope_application'){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},
    underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,minimumJob:0,
    accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:400,
    valleyPerLF:600,stepFlashingPerLF:800,pipeJackEach:4500,ridgeVentPerLF:900,roofBuildingCode:'nbc',lowSlopeAssembly:method,eaveProtectionRequired:eave,...CEMENTED},
   {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'under_four',pitchRisePer12:3,
    stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',iceWaterBarrierLengthLF:measured,valleyLengthLF:0,stepFlashingLengthLF:0,pipeJackCount:0,ridgeVentLengthLF:0,
    starterLengthLF:0,dripEdgeLengthLF:0,ridgeCapLengthLF:0});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  Object.assign(f.ownerPricing.pricing,{pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70});
  const dependent=roofFlashingVentDefinitionVNext('asphalt_shingle');
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[dependent],{ownerId:f.ownerPricing.origin.ownerId,reenteredIds:[dependent.id],confirmIds:[dependent.id],now:'2026-10-29T12:00:00.000Z'});
  return f;
}
add('v33:fix3-nbc-cemented-eave-yes-none-measured',roof('yes',0));
add('v33:fix3-nbc-cemented-eave-yes-measured',roof('yes',40));
add('v33:fix3-nbc-cemented-eave-no-none-measured',roof('no',0));
writeFileSync(new URL('./corpus-additions-20261113c.json',import.meta.url),JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
