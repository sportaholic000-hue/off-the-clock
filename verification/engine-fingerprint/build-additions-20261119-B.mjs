// One-time build of corpus-additions-20261119-B.json (Lane B, November 19,
// 2026): inputs that reach launch fixes B1-B10 for pitched and flat roofing,
// which the frozen inputs do not reach. Each result is worked by hand in
// test/qeLaunchB_20261119.spec.mjs. Run once; the output file is never edited.
// Not registered in fingerprint.mjs: the coordinator registers it.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261119-B.mjs
import {writeFileSync} from 'node:fs';
import {fixture} from '../engine-independent/fixtures.mjs';
import {corpusInputs} from './fingerprint.mjs';
import {riseBand} from '../../server/quote-engine-vnext/roofSlopeRules.js';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../../server/quote-engine-vnext/priceGroundwork.js';
const rows=[];const add=(id,input)=>rows.push({id:'laneB:'+id,input:structuredClone(input)});
const corpus=id=>structuredClone(corpusInputs().find(r=>r.id===id).input);
// A 2,000 sq ft steep roof on the October 16 roofing rules, itemized accessories.
function roof(opts={}){
  const {rise=6,layers=1,stories=1,scope='full',pricing={},inputs={}}=opts;
  const p={laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},
    underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,minimumJob:0,
    accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:400,
    valleyPerLF:600,stepFlashingPerLF:800,pipeJackEach:4500,ridgeVentPerLF:900,roofBuildingCode:'irc',lowSlopeAssembly:'double_underlayment',roofProductThreeTab:{asphalt_shingle:true},
    nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000,selfAdheredUnderlaymentPerSquare:4500,
    roofProductClass:{asphalt_shingle:'asphalt_shingle'},roofProductMinSlope:{asphalt_shingle:2},starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},pitchInstallationAdderOverTwelve:0.5,pitchRemovalAdderOverTwelve:0.6,
    complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,eaveProtectionRequired:'no',...pricing};
  const c={roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:riseBand(rise),pitchRisePer12:rise,
    stories,existingLayers:layers,roofComplexity:'simple',serviceScope:scope,iceWaterBarrierLengthLF:0,valleyLengthLF:0,stepFlashingLengthLF:0,pipeJackCount:0,ridgeVentLengthLF:0,
    starterLengthLF:180,dripEdgeLengthLF:180,ridgeCapLengthLF:0,...inputs};
  const f=fixture('ROOFING_REPLACEMENT',p,c);
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  const d=roofFlashingVentDefinitionVNext('asphalt_shingle');
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[d],{ownerId:f.ownerPricing.origin?.ownerId,reenteredIds:[d.id],confirmIds:[d.id],now:'2026-10-29T12:00:00.000Z'});
  return f;
}
// A 1,000 sq ft EPDM flat roof; the insulation and cover board waste filled as the price book does.
const FLAT_ON_SITE={flatRoofEdgeMetalPerLF:'priced_on_site',flatRoofWallFlashingPerLF:'priced_on_site',flatRoofPenetrationEach:'priced_on_site',flatRoofCurbEach:'priced_on_site',flatRoofDrainEach:'priced_on_site'};
const flat=(pricing={},inputs={})=>fixture('FLAT_ROOF_REPLACEMENT',{laborPerSqft:{epdm:500},membraneCostPerSqft:{epdm:700},tearOffPerSqft:{epdm:200},insulationPerSqft:250,minimumJob:0,flatRoofItemBasis:{...FLAT_ON_SITE},...pricing},
  {roofSqft:1000,sqftMethod:'exact',membraneType:'epdm',replacementMembraneType:'epdm',existingLayers:1,accessDifficulty:'easy',serviceScope:'full',buildingType:'residential',...inputs});
function insulated(mode,pricing={}){
  const rates=mode==='itemized'?{insulation_labor:50,insulation_material:150,coverboard_labor:25,coverboard_material:75}:{insulation_installed:200,coverboard_installed:100};
  return flat({scopeDetails:{insulation:{description:'[SYNTHETIC] Explicitly defined insulation',mode,...(mode==='installed'?{category:'material'}:{}),insulationSystem:'[SYNTHETIC] Defined insulation thickness',coverboardSystem:'[SYNTHETIC] Defined coverboard thickness',baseRoofLaborExcludesInstallation:true}},scopeRates:rates,...pricing},
    {buildingType:'commercial',insulationNeeded:true,coverboardNeeded:true,insulationAreaSqft:800,coverboardAreaSqft:600,insulationScopeConfirmed:true});
}
// B1: starter and drip edge on a full itemized replacement.
add('b1-full-starter-0',roof({inputs:{starterLengthLF:0}}));
add('b1-full-drip-edge-0',roof({inputs:{dripEdgeLengthLF:0}}));
add('b1-full-starter-drip-1',roof({inputs:{starterLengthLF:1,dripEdgeLengthLF:1}}));
add('b1-partial-starter-drip-0',roof({scope:'partial',inputs:{starterLengthLF:0,dripEdgeLengthLF:0,partialAreaSqft:1000}}));
// B2: decking installation labor.
add('b2-steep-material-only-no-labor',roof({pricing:{deckingPerSheet:4500,deckingPriceBasis:'material_only'},inputs:{deckingSheets:6}}));
add('b2-steep-material-only-labor-2-stories',roof({stories:2,pricing:{deckingPerSheet:4500,deckingPriceBasis:'material_only',deckingLaborPerSheet:2500},inputs:{deckingSheets:6}}));
{const f=roof({stories:2,pricing:{deckingPerSheet:4500,deckingPriceBasis:'installed'},inputs:{deckingSheets:6}});Object.assign(f.ownerPricing.pricing,{installedLaborPercent:{...f.ownerPricing.pricing.installedLaborPercent,deckingPerSheet:60},installedMaterialsPercent:{...f.ownerPricing.pricing.installedMaterialsPercent,deckingPerSheet:40}});add('b2-steep-installed-2-stories',f);}
add('b2-flat-blank-basis',flat({flatRoofDeckPerSheet:6000},{deckSheets:5}));
add('b2-flat-material-only-no-labor',flat({flatRoofDeckPerSheet:6000,flatRoofDeckPriceBasis:'material_only'},{deckSheets:5}));
add('b2-flat-material-only-labor-moderate',flat({flatRoofDeckPerSheet:6000,flatRoofDeckPriceBasis:'material_only',flatRoofDeckLaborPerSheet:3000},{deckSheets:5,accessDifficulty:'moderate'}));
add('b2-flat-installed-moderate',flat({flatRoofDeckPerSheet:6000,flatRoofDeckPriceBasis:'installed',installedLaborPercent:{flatRoofDeckPerSheet:50}},{deckSheets:5,accessDifficulty:'moderate'}));
// B3: valley line.
add('b3-valley-30',roof({inputs:{valleyLengthLF:30}}));
// B4: no existing layer.
{const f=roof({rise:8,layers:0});delete f.ownerPricing.pricing.tearOffPerSquare;add('b4-steep-0-layers-rise-8-no-tear-off-price',f);}
add('b4-steep-0-layers-rise-8-2-stories',roof({rise:8,layers:0,stories:2}));
{const f=flat({},{existingLayers:0});delete f.ownerPricing.pricing.tearOffPerSqft;add('b4-flat-0-layers-no-tear-off-price',f);}
{const f=corpus('v36:roof-installed-decking-stories-1');Object.assign(f.customerInputs,{existingLayers:0,deckingSheets:0});add('b4-earlier-rules-0-layers',f);}
// B5: area at the selected pitch on the whole-roof method.
add('b5-band-area-differs',roof({rise:8,inputs:{pitchArea7To9Sqft:1800}}));
add('b5-band-area-equal',roof({rise:8,inputs:{pitchArea7To9Sqft:2000}}));
add('b5-partial-band-area-equal',roof({rise:8,scope:'partial',inputs:{partialAreaSqft:1000,pitchArea7To9Sqft:1000}}));
// B6 and B7: cemented low-slope factor from exposures, and the hip and ridge cap.
function cemented(edit=()=>{}){const f=corpus('v35:item3-cemented-three-tab-rise-3');Object.assign(f.customerInputs,{starterLengthLF:180,dripEdgeLengthLF:180,ridgeCapLengthLF:40});Object.assign(f.ownerPricing.pricing,{starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300});edit(f.ownerPricing.pricing);return f;}
const exposures=(n,t)=>p=>{p.nbcLowSlopeNormalExposureByProduct={asphalt_shingle:n};p.nbcLowSlopeTripleExposureByProduct={asphalt_shingle:t};};
add('b6-saved-factor-1.5-ridge-cap-40',cemented());
add('b6-saved-factor-1.0',cemented(p=>{p.nbcLowSlopeShingleFactorByProduct.asphalt_shingle=1;}));
add('b6-exposures-5.625-4.375',cemented(exposures(5.625,4.375)));
add('b6-exposures-equal',cemented(exposures(5,5)));
add('b6-exposures-6-2',cemented(exposures(6,2)));
add('b6-normal-exposure-only',cemented(p=>{p.nbcLowSlopeNormalExposureByProduct={asphalt_shingle:5};}));
add('b6-no-factor-no-exposures',cemented(p=>{delete p.nbcLowSlopeShingleFactorByProduct;}));
add('b7-double-underlayment-ridge-cap-40',roof({inputs:{ridgeCapLengthLF:40}}));
// B8: steep-pitch removal without disposal lines.
add('b8-rise-8-2-layers',roof({rise:8,layers:2}));
add('b8-rise-13-1-layer',roof({rise:13}));
// B9: a rise just over 6/12 is in the steep band.
add('b9-rise-6.5',roof({rise:6.5}));
// B10: insulation and cover board waste.
add('b10-itemized-insulation-default-0.07',insulated('itemized',{insulationWasteFactor:0.07}));
add('b10-itemized-insulation-0',insulated('itemized',{insulationWasteFactor:0}));
add('b10-installed-insulation-default-0.07',insulated('installed',{insulationWasteFactor:0.07}));
writeFileSync(new URL('./corpus-additions-20261119-B.json',import.meta.url),JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
