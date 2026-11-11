// One-time build of corpus-additions-20261111.json: inputs for the v26 quote
// engine and price book audit (engine v27). They reach yard-cleanup disposal in
// priced and unpriced units, blank and zero counts; the leak-source question;
// the low-slope rise; sod topsoil with an order increment; and interior trim
// coats. Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261111.mjs
import {writeFileSync} from 'node:fs';
import {explanationCases} from '../../test/customerExplanationFixtures.mjs';
import {fixture} from '../engine-independent/fixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const catalog=id=>structuredClone(explanationCases().find(r=>r.id==='catalog-'+id).input);
const levels=sqftPerLoad=>({light:{laborMultiplier:1,disposalFlat:15000,...(sqftPerLoad?{sqftPerLoad}:{})},moderate:{laborMultiplier:1.5,disposalFlat:10000,...(sqftPerLoad?{sqftPerLoad}:{})},heavy:{laborMultiplier:2,disposalFlat:15000,...(sqftPerLoad?{sqftPerLoad}:{})}});
const cleanup=(pricing,inputs)=>{const f=catalog('LANDSCAPING_CLEANUP');Object.assign(f.ownerPricing.pricing,{cleanupBaseRatePerSqft:10,...pricing});Object.assign(f.customerInputs,{yardSqft:1000,debrisLevel:'light',slope:'flat',haulAway:false,...inputs});return f;};
add('v27:cleanup-per-load-bags-area',cleanup({disposalPerLoad:8000,debrisPricing:levels(2000)},{yardSqft:5000,wasteBags:10}));
add('v27:cleanup-per-load-one-load-minimum',cleanup({disposalPerLoad:8000,debrisPricing:levels(2000)},{wasteLoads:1}));
add('v27:cleanup-per-load-no-size-bags',cleanup({disposalPerLoad:8000,debrisPricing:levels()},{wasteBags:10}));
add('v27:cleanup-per-bag-loads',cleanup({disposalPerBag:300,debrisPricing:levels()},{wasteLoads:2}));
add('v27:cleanup-per-bag-not-sure',cleanup({disposalPerBag:300,debrisPricing:levels()},{wasteBags:'unknown'}));
add('v27:cleanup-per-bag-blank',cleanup({disposalPerBag:300,debrisPricing:levels()},{}));
add('v27:cleanup-both-bags-zero-loads',cleanup({disposalPerBag:300,disposalPerLoad:8000,debrisPricing:levels(2000)},{wasteBags:10,wasteLoads:0}));
add('v27:cleanup-both-two-counts',cleanup({disposalPerBag:300,disposalPerLoad:8000,debrisPricing:levels(2000)},{wasteBags:10,wasteLoads:2}));
for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR']){
  const f=catalog(type);f.customerInputs.leakPresent=true;delete f.customerInputs.leakSourceIdentified;add('v27:'+type.toLowerCase()+'-leak-source-skipped',f);
  const g=structuredClone(f);g.customerInputs.leakSourceIdentified=true;add('v27:'+type.toLowerCase()+'-leak-source-found',g);
  const h=structuredClone(g);h.customerInputs.leakPresent=false;add('v27:'+type.toLowerCase()+'-source-without-leak',h);
}
const roof=customer=>{const product='asphalt_shingle',p=Object.fromEntries(Object.entries({laborPerSquare:20000,materialCostPerSquare:15000,tearOffPerSquare:6000,underlaymentPerSquare:2000,underlaymentPriceBasis:'installed_area_sell_price'}).map(([k,v])=>[k,{[product]:v}]));
  const f=fixture('ROOFING_REPLACEMENT',{...p,disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:product,replacementRoofType:product,pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  for(const [k,v] of Object.entries(customer))if(v===undefined)delete f.customerInputs[k];
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  let n=0;const facts={};for(const field of ['existingRoofType','replacementRoofType']){const id='3f9a6c21-7d4e-4b85-9a10-6c2e8b4d1f'+String(10+(n++));f.ownerPricing.knownOfferings[field]={...f.ownerPricing.knownOfferings[field],[product]:id};facts[field]={status:'identified',field,value:product,offeringId:id};}
  f.customerInputs.confirmedFacts={...f.customerInputs.confirmedFacts,...facts};return f;};
add('v27:roof-under-four-rise-blank',roof({pitchBand:'under_four',pitchRisePer12:undefined}));
add('v27:roof-under-four-rise-not-sure',roof({pitchBand:'under_four',pitchRisePer12:'unknown'}));
add('v27:roof-footprint-rise-not-sure',roof({roofSizeMethod:'footprint',roofSizeInput:1500,pitchRisePer12:'unknown'}));
const sod=(pricing,inputs)=>{const f=catalog('LANDSCAPING_SOD');Object.assign(f.customerInputs,{sodSqft:1230,groundPrepNeeded:true,slope:'flat',accessDifficulty:'easy',...inputs});Object.assign(f.ownerPricing.pricing,{sodMaterialPerSqft:65,sodInstallLaborPerSqft:80,groundPrepPerSqft:150,sodPalletSizeSqft:450,...pricing});return f;};
add('v27:sod-topsoil-increment-whole-yard',sod({topsoilPerCubicYard:4500,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:3,topsoilOrderIncrementCubicYards:1},{usableTopsoilDepthInches:1}));
add('v27:sod-topsoil-increment-quarter-yard',sod({topsoilPerCubicYard:4500,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:3,topsoilOrderIncrementCubicYards:0.25},{usableTopsoilDepthInches:1}));
const trim=f=>{Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:52,trimCoats:2,trimSurfaceCondition:'good'});Object.assign(f.ownerPricing.pricing,{trimLaborPerLF:150,trimMaterialPerLF:50});return f;};
add('v27:interior-trim-two-coats',trim(catalog('INTERIOR_PAINTING')));
writeFileSync(new URL('./corpus-additions-20261111.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
