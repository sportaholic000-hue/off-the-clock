// One-time build of corpus-additions-20261112.json (engine v29). Two kinds of
// input:
// 1. Priced inputs for the eight services whose earlier frozen inputs were
//    nearly all held for owner settings added after they were frozen (roofing
//    replacement, driveway, siding replacement, patio, interior and exterior
//    painting, flooring replacement, sod). Each prices, and each total is
//    worked by hand in test/qeReviewV29_20261112.spec.mjs.
// 2. Inputs that reach v29 behaviour: installed scope prices scaled on their
//    labor share at hard access or three storeys, isolation joints under
//    materials-only tax, and a leveling area larger than the floor.
// Run once; the output file is never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261112.mjs
import {writeFileSync} from 'node:fs';
import {explanationCases} from '../../test/customerExplanationFixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import {fixture,flooring} from '../engine-independent/fixtures.mjs';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const catalog=type=>structuredClone(explanationCases().find(r=>r.id==='catalog-'+type).input);
const edit=(f,customer={},pricing={},defaults={})=>{Object.assign(f.customerInputs,customer);Object.assign(f.ownerPricing.pricing,pricing);Object.assign(f.businessDefaults,defaults);return f;};
function roof16(){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,storyMultiplier:{1:1,2:1.1,3:1.2}},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'seven_to_nine',stories:2,existingLayers:2,roofComplexity:'moderate',serviceScope:'full'});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  return f;
}
// 1. Priced inputs, two per service.
add('v29:priced-roofing-earlier-rules',catalog('ROOFING_REPLACEMENT'));
add('v29:priced-roofing-oct16-steep-two-story-two-layers',roof16());
add('v29:priced-driveway',catalog('CONCRETE_DRIVEWAY'));
add('v29:priced-driveway-moderate-smooth-5in',edit(catalog('CONCRETE_DRIVEWAY'),{accessDifficulty:'moderate',finishType:'smooth',thickness:5}));
add('v29:priced-siding',catalog('SIDING_REPLACEMENT'));
add('v29:priced-siding-three-story-fiber-cement',edit(catalog('SIDING_REPLACEMENT'),{stories:3,sidingType:'fiber_cement'},{laborPerSqft:{vinyl:400,fiber_cement:550},materialPerSqft:{vinyl:700,fiber_cement:900}}));
add('v29:priced-patio',catalog('CONCRETE_PATIO_SLAB'));
add('v29:priced-patio-difficult-stamped',edit(catalog('CONCRETE_PATIO_SLAB'),{accessDifficulty:'difficult',finishType:'stamped'},{stampedMaterialPerSqft:300}));
add('v29:priced-interior-painting',catalog('INTERIOR_PAINTING'));
add('v29:priced-interior-painting-high-walls-ceilings',edit(catalog('INTERIOR_PAINTING'),{wallHeight:'high',ceilingsIncluded:true,ceilingAreaSqft:200,ceilingCoats:2}));
add('v29:priced-exterior-itemized-three-story-built-1985',edit(offeringFixture('EXTERIOR_PAINTING','itemized'),{stories:3,buildingAge:'1978_to_1989'},{leadSafePainting:'review_before_1978'}));
add('v29:priced-exterior-installed-three-story',edit(offeringFixture('EXTERIOR_PAINTING','installed'),{stories:3}));
add('v29:priced-flooring-replacement',catalog('FLOORING_REPLACEMENT'));
add('v29:priced-flooring-replacement-diagonal-one-room',edit(catalog('FLOORING_REPLACEMENT'),{layoutPattern:'diagonal_or_pattern',roomCount:1}));
add('v29:priced-sod',catalog('LANDSCAPING_SOD'));
add('v29:priced-sod-moderate-slope-difficult-access',edit(catalog('LANDSCAPING_SOD'),{slope:'moderate',accessDifficulty:'difficult'}));
// 2. v29 behaviour.
const scope=(id,customer,paths)=>{const f=edit(structuredClone(measuredScopeCases().find(x=>x.id===id).input),customer);const p=f.ownerPricing.pricing;
  p.installedLaborPercent={...(p.installedLaborPercent||{}),...Object.fromEntries(paths.map(path=>[path,60]))};p.installedMaterialsPercent={...(p.installedMaterialsPercent||{}),...Object.fromEntries(paths.map(path=>[path,40]))};return f;};
add('v29:flat-roof-installed-insulation-difficult-access',edit(scope('commercial-installed',{accessDifficulty:'difficult'},['scopeRates.insulation_installed','scopeRates.coverboard_installed']),{},{accessMultiplier:{easy:1,moderate:1.25,difficult:1.5}}));
add('v29:siding-installed-trim-three-story',edit(scope('siding-trim-installed',{stories:3},['scopeRates.siding_trim_installed']),{},{storyMultiplier:{1:1,2:1.1,3:1.2}}));
add('v29:patio-installed-exposed-aggregate-difficult-access',edit(scope('exposed-installed',{accessDifficulty:'difficult'},['scopeRates.exposed_aggregate_installed']),{},{accessMultiplier:{easy:1,moderate:1.25,difficult:1.5}}));
add('v29:flat-roof-installed-insulation-difficult-no-labor-share',edit(structuredClone(measuredScopeCases().find(x=>x.id==='commercial-installed').input),{accessDifficulty:'difficult'},{accessMultiplier:{easy:1,moderate:1.25,difficult:1.5}}));
const joints=share=>{const f=edit(catalog('CONCRETE_PATIO_SLAB'),{adjoinsExistingConcrete:true,adjoiningEdgeLF:20},{isolationJointPricing:'per_linear_foot',isolationJointPerLF:500},{taxMode:'TAX_MATERIALS',taxPercent:10});
  if(share!==undefined){f.ownerPricing.pricing.installedMaterialsPercent={isolationJointPerLF:share};f.ownerPricing.pricing.installedLaborPercent={isolationJointPerLF:100-share};}return f;};
add('v29:patio-isolation-joints-materials-tax-share-40',joints(40));
add('v29:patio-isolation-joints-materials-tax-no-share',joints());
for(const sqft of [200,250])add('v29:flooring-install-leveling-'+sqft+'-of-200-sqft',edit(flooring('tile',200),{floorLevelingNeeded:true,floorLevelingSqft:sqft},{floorLevelingPerSqft:200,floorLevelingMaxDepthInches:0.5}));
writeFileSync(new URL('./corpus-additions-20261112.json',import.meta.url),JSON.stringify(rows));
console.log(rows.length+' inputs');
