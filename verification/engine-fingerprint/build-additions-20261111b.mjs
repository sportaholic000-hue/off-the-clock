// One-time build of corpus-additions-20261111b.json: inputs for the v27 review
// (engine v28). They reach a leak-source answer sent with no leak (ignored), a
// footprint roof whose rise is Not sure (the business measures it), and yard
// cleanup counts in one or both priced units. Run once; the output file is
// never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261111b.mjs
import {writeFileSync} from 'node:fs';
import {explanationCases} from '../../test/customerExplanationFixtures.mjs';
import {fixture} from '../engine-independent/fixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const catalog=id=>structuredClone(explanationCases().find(r=>r.id==='catalog-'+id).input);
for(const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR'])for(const source of [true,false]){
  const f=catalog(type);f.customerInputs.leakPresent=false;f.customerInputs.leakSourceIdentified=source;
  add('v28:'+type.toLowerCase()+'-no-leak-source-'+source,f);
}
function roof(customer={}){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  return f;
}
add('v28:roof-footprint-under-four-rise-not-sure',roof({roofSizeMethod:'footprint',roofSizeInput:1500,pitchBand:'under_four',pitchRisePer12:'unknown'}));
add('v28:roof-footprint-rise-blank',roof({roofSizeMethod:'footprint',roofSizeInput:1500}));
const levels={light:{laborMultiplier:1,disposalFlat:15000},moderate:{laborMultiplier:1.5,disposalFlat:10000},heavy:{laborMultiplier:2,disposalFlat:15000}};
const cleanup=(pricing,counts)=>{const f=catalog('LANDSCAPING_CLEANUP');const p=f.ownerPricing.pricing;delete p.disposalPerBag;delete p.disposalPerLoad;Object.assign(p,{cleanupBaseRatePerSqft:10,debrisPricing:structuredClone(levels),...pricing});delete f.customerInputs.wasteBags;delete f.customerInputs.wasteLoads;Object.assign(f.customerInputs,{yardSqft:1000,debrisLevel:'light',slope:'flat',haulAway:false,...counts});return f;};
add('v28:cleanup-flat-only-both-counts',cleanup({},{wasteBags:10,wasteLoads:2}));
add('v28:cleanup-per-bag-only-both-counts',cleanup({disposalPerBag:300},{wasteBags:10,wasteLoads:2}));
add('v28:cleanup-per-load-only-both-counts',cleanup({disposalPerLoad:8000},{wasteBags:10,wasteLoads:2}));
add('v28:cleanup-per-bag-only-zero-bags-two-loads',cleanup({disposalPerBag:300},{wasteBags:0,wasteLoads:2}));
add('v28:cleanup-both-priced-zero-bags-two-loads',cleanup({disposalPerBag:300,disposalPerLoad:8000},{wasteBags:0,wasteLoads:2}));
add('v28:cleanup-both-priced-both-counts',cleanup({disposalPerBag:300,disposalPerLoad:8000},{wasteBags:10,wasteLoads:2}));
writeFileSync(new URL('./corpus-additions-20261111b.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
