// Lane B launch fixes (November 19, 2026): pitched roofing (ROOFING_REPLACEMENT)
// and flat roofing (FLAT_ROOF_REPLACEMENT), fixes B1-B10. Each fix has a defect
// case, a boundary case and an unchanged-neighbour case. Expected values are
// worked by hand in the comments before each assertion.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {customerContractForVNext,withClass2Defaults,CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {riseBand,ROOF_SLOPE_FIELD_COPY,roofCementedShingleFactor} from '../server/quote-engine-vnext/roofSlopeRules.js';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import {FLAT_REPAIR_COPY} from '../server/quote-engine-vnext/flatRoofRepairPricing.js';
import {OWNER_FIELD_COPY,CLASS2_HELP,class2FieldCopy} from '../server/priceBookCopy.js';
import {moneyKindForField,wholeCentsForPricingField} from '../server/priceBookMoney.js';
import {fixedPriceField} from '../server/pricePrecision.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {compileVoiceSystemInstruction,VOICE_GUIDE_SERVICE_TYPES} from '../server/src/voice/voicePromptCompiler.js';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {corpusInputs} from '../verification/engine-fingerprint/fingerprint.mjs';

// A steep-roof request on the October 16 roofing rules: 2000 sq ft measured
// (20 squares), asphalt shingle, 1 story, simple shape, itemized accessories.
// Prices (cents): labor 20000/sq, field material 15000/sq (10% waste), tear-off
// 6000/sq, underlayment 2000/sq installed area, disposal 3000/sq per layer,
// starter 100/LF, drip edge 200/LF, ridge cap 300/LF (10% accessory waste).
function roof(opts={}){
  const {rise=6,area=2000,itemized=true,layers=1,stories=1,scope='full',pricing={},inputs={}}=opts;
  const band=rise<4?'under_four':riseBand(rise);
  const p={laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},
    underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,minimumJob:0,
    accessoryPricingMode:itemized?'itemized':'per_square_allin',...(itemized?{materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents'}:{}),iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:400,
    valleyPerLF:600,stepFlashingPerLF:800,pipeJackEach:4500,ridgeVentPerLF:900,roofBuildingCode:'irc',lowSlopeAssembly:'double_underlayment',roofProductThreeTab:{asphalt_shingle:true},
    nbcLowSlopeShingleFactor:1.5,nbcLowSlopeShingleMaterialPerSquare:10000,nbcLowSlopeCementPerSquare:1200,nbcLowSlopeLaborPerSquare:3000,selfAdheredUnderlaymentPerSquare:4500,
    roofProductClass:{asphalt_shingle:'asphalt_shingle'},roofProductMinSlope:{asphalt_shingle:2},starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},pitchInstallationAdderOverTwelve:0.5,pitchRemovalAdderOverTwelve:0.6,
    complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,eaveProtectionRequired:'no',...pricing};
  const c={roofSizeMethod:'roof_measured',roofSizeInput:area,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:band,pitchRisePer12:rise,
    stories,existingLayers:layers,roofComplexity:'simple',serviceScope:scope,iceWaterBarrierLengthLF:0,valleyLengthLF:0,stepFlashingLengthLF:0,pipeJackCount:0,ridgeVentLengthLF:0,
    ...(itemized?{starterLengthLF:180,dripEdgeLengthLF:180,ridgeCapLengthLF:0}:{}),...inputs};
  const f=fixture('ROOFING_REPLACEMENT',p,c);
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  const d=roofFlashingVentDefinitionVNext('asphalt_shingle');
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[d],{ownerId:f.ownerPricing.origin?.ownerId,reenteredIds:[d.id],confirmIds:[d.id],now:'2026-10-29T12:00:00.000Z'});
  return f;
}
// A flat-roof request: 1000 sq ft EPDM, 1 existing layer, easy access. Labor
// 500/sq ft, membrane 700/sq ft (10% waste), tear-off 200/sq ft.
const FLAT_ON_SITE={flatRoofEdgeMetalPerLF:'priced_on_site',flatRoofWallFlashingPerLF:'priced_on_site',flatRoofPenetrationEach:'priced_on_site',flatRoofCurbEach:'priced_on_site',flatRoofDrainEach:'priced_on_site'};
function flat(pricing={},inputs={}){
  return fixture('FLAT_ROOF_REPLACEMENT',{laborPerSqft:{epdm:500},membraneCostPerSqft:{epdm:700},tearOffPerSqft:{epdm:200},insulationPerSqft:250,minimumJob:0,flatRoofItemBasis:{...FLAT_ON_SITE},...pricing},
    {roofSqft:1000,sqftMethod:'exact',membraneType:'epdm',replacementMembraneType:'epdm',existingLayers:1,accessDifficulty:'easy',serviceScope:'full',buildingType:'residential',...inputs});
}
// Commercial flat roof with itemized insulation (800 sq ft) and cover board (600 sq ft).
function insulated(mode='itemized',pricing={}){
  const rates=mode==='itemized'?{insulation_labor:50,insulation_material:150,coverboard_labor:25,coverboard_material:75}:{insulation_installed:200,coverboard_installed:100};
  return flat({scopeDetails:{insulation:{description:'[SYNTHETIC] Explicitly defined insulation',mode,...(mode==='installed'?{category:'material'}:{}),insulationSystem:'[SYNTHETIC] Defined insulation thickness',coverboardSystem:'[SYNTHETIC] Defined coverboard thickness',baseRoofLaborExcludesInstallation:true}},scopeRates:rates,...pricing},
    {buildingType:'commercial',insulationNeeded:true,coverboardNeeded:true,insulationAreaSqft:800,coverboardAreaSqft:600,insulationScopeConfirmed:true});
}
const quote=f=>generateQuoteVNext(f);
const lines=q=>q.options?.[0]?.calculationRecord?.scenarios?.mid?.lineItems||q.options?.[0]?.calculationRecord?.lineItems||[];
const line=(q,name)=>lines(q).find(l=>l.name===name);
const amount=(q,name)=>line(q,name)?.amountCents;
const ready=q=>assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify({reason:q.reviewReason,missing:q.missingOwnerFields,invalid:q.invalidOwnerFields,customer:q.invalidCustomerFields,messages:q.validationMessages}));
const corpus=id=>structuredClone(corpusInputs().find(r=>r.id===id).input);

// ---------------------------------------------------------------- B1
test('B1 defect: a full itemized replacement refuses 0 starter and 0 drip edge at customer input',()=>{
  // Every roof has eaves: 0 LF of starter or drip edge on a full replacement is
  // a customer measurement to re-ask, not a review job and not a priced quote.
  for(const field of ['starterLengthLF','dripEdgeLengthLF']){
    const q=quote(roof({inputs:{[field]:0}}));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(q.invalidCustomerFields,[field]);
    assert.deepEqual(q.missingOwnerFields,[]);
    assert.match(q.validationMessages.join(' '),new RegExp((field==='starterLengthLF'?'Starter':'Drip edge')+' along the eaves and rakes cannot be 0 on a full roof replacement: every roof has eaves\\. Enter the measured length\\.'));
  }
  const both=quote(roof({inputs:{starterLengthLF:0,dripEdgeLengthLF:0}}));
  assert.deepEqual(both.invalidCustomerFields.sort(),['dripEdgeLengthLF','starterLengthLF']);
});
test('B1 boundary: 1 LF of starter and drip edge prices',()=>{
  // Starter 1 LF * 1.10 waste = 1.1 LF * 100 = 110; drip edge 1.1 LF * 200 = 220.
  const q=quote(roof({inputs:{starterLengthLF:1,dripEdgeLengthLF:1}}));ready(q);
  assert.equal(amount(q,'Starter strip'),110);assert.equal(amount(q,'Drip edge'),220);
});
test('B1 neighbours: partial scope may be 0, ridge cap may be 0, all-in accessories are not asked',()=>{
  // Partial: 1000 sq ft = 10 squares; labor 10 * 20000 = 200000; no starter or drip edge line.
  const partial=quote(roof({scope:'partial',inputs:{starterLengthLF:0,dripEdgeLengthLF:0,partialAreaSqft:1000}}));ready(partial);
  assert.equal(line(partial,'Starter strip'),undefined);assert.equal(line(partial,'Drip edge'),undefined);
  // Full with ridge cap 0 (single-slope roof): starter 180 * 1.1 = 198 LF * 100 = 19800, no cap line.
  const shed=quote(roof({inputs:{ridgeCapLengthLF:0}}));ready(shed);
  assert.equal(amount(shed,'Starter strip'),19800);assert.equal(line(shed,'Hip-and-ridge cap'),undefined);
  // All-in per-square accessories: no accessory lengths, quote unchanged: labor 400000.
  const allIn=quote(roof({itemized:false}));ready(allIn);assert.equal(amount(allIn,'Roofing labor'),400000);
});

// ---------------------------------------------------------------- B2
test('B2 defect: material-only decking needs its installation labor price',()=>{
  // Steep roof, 6 sheets at 4500, decking basis material only, no labor price: owner price missing.
  const steep=quote(roof({pricing:{deckingPerSheet:4500,deckingPriceBasis:'material_only'},inputs:{deckingSheets:6}}));
  assert.equal(steep.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(steep.missingOwnerFields,['deckingLaborPerSheet']);
  // Flat roof, 5 sheets at 6000, material only, no labor price.
  const flatMaterial=flat({flatRoofDeckPerSheet:6000,flatRoofDeckPriceBasis:'material_only'},{deckSheets:5});
  const q=quote(flatMaterial);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.missingOwnerFields,['flatRoofDeckLaborPerSheet']);
  // Flat roof with a blank basis is an owner missing setting, not read as material only.
  const blank=quote(flat({flatRoofDeckPerSheet:6000},{deckSheets:5}));
  assert.equal(blank.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(blank.missingOwnerFields,['flatRoofDeckPriceBasis']);
});
test('B2 priced: the labor line takes the same labor adjustment as installed decking',()=>{
  // Steep, 2 stories (storyMultiplier 1.10): decking 6 * 4500 = 27000; labor 6 * 2500 * 1.10 = 16500.
  const steep=quote(roof({stories:2,pricing:{deckingPerSheet:4500,deckingPriceBasis:'material_only',deckingLaborPerSheet:2500},inputs:{deckingSheets:6}}));ready(steep);
  assert.equal(amount(steep,'Decking replacement'),27000);assert.equal(amount(steep,'Decking installation labor'),16500);
  assert.equal(line(steep,'Decking installation labor').category,'labor');
  // Flat, moderate access 1.15: deck 5 * 6000 = 30000; labor 5 * 3000 * 1.15 = 17250.
  const flatQ=quote(flat({flatRoofDeckPerSheet:6000,flatRoofDeckPriceBasis:'material_only',flatRoofDeckLaborPerSheet:3000},{deckSheets:5,accessDifficulty:'moderate'}));ready(flatQ);
  assert.equal(amount(flatQ,'Deck replacement'),30000);assert.equal(amount(flatQ,'Decking installation labor'),17250);
});
test('B2 boundary: 0 sheets asks no labor price and adds no line',()=>{
  // Steep and flat with 0 sheets: ready, no decking lines; steep labor 400000 unchanged.
  const steep=quote(roof({pricing:{deckingPerSheet:4500,deckingPriceBasis:'material_only'},inputs:{deckingSheets:0}}));ready(steep);
  assert.equal(line(steep,'Decking installation labor'),undefined);assert.equal(amount(steep,'Roofing labor'),400000);
  const flatQ=quote(flat({flatRoofDeckPerSheet:6000,flatRoofDeckPriceBasis:'material_only'},{deckSheets:0}));ready(flatQ);
  assert.equal(line(flatQ,'Decking installation labor'),undefined);
});
test('B2 neighbours: installed decking prices stay as they were, with no labor line',()=>{
  // Steep installed, 60% labor share, 2 stories: 6 * 4500 = 27000 * (1 + 0.60 * 0.10) = 28620.
  const steep=roof({stories:2,pricing:{deckingPerSheet:4500,deckingPriceBasis:'installed'},inputs:{deckingSheets:6}});
  Object.assign(steep.ownerPricing.pricing,{installedLaborPercent:{...steep.ownerPricing.pricing.installedLaborPercent,deckingPerSheet:60},installedMaterialsPercent:{...steep.ownerPricing.pricing.installedMaterialsPercent,deckingPerSheet:40}});
  const s=quote(steep);ready(s);assert.equal(amount(s,'Decking replacement'),28620);assert.equal(line(s,'Decking installation labor'),undefined);
  // Flat installed, 50% labor share, moderate access: 5 * 6000 = 30000 * (1 + 0.50 * 0.15) = 32250.
  const f=flat({flatRoofDeckPerSheet:6000,flatRoofDeckPriceBasis:'installed',installedLaborPercent:{flatRoofDeckPerSheet:50}},{deckSheets:5,accessDifficulty:'moderate'});
  const q=quote(f);ready(q);assert.equal(amount(q,'Deck replacement'),32250);assert.equal(line(q,'Decking installation labor'),undefined);
});
test('B2 wiring: the new prices are whole-cent labor prices with owner wording',()=>{
  for(const [type,field] of [['ROOFING_REPLACEMENT','deckingLaborPerSheet'],['FLAT_ROOF_REPLACEMENT','flatRoofDeckLaborPerSheet']]){
    assert.equal(moneyKindForField(type,field),'fixed_amount');assert.equal(wholeCentsForPricingField(type,field),true);assert.equal(fixedPriceField(field),true);
    const meta=bridge.applicationMetadata().services.find(s=>s.serviceType===type);
    assert.equal(meta.pricingFields.find(f=>f.field===field).label,'Decking installation labor per sheet');
  }
  assert.equal(OWNER_FIELD_COPY.deckingLaborPerSheet.label,'Decking installation labor per sheet');
  assert.match(OWNER_FIELD_COPY.deckingPriceBasis.help,/Material only also needs your decking installation labor per sheet\./);
  assert.match(FLAT_REPAIR_COPY.flatRoofDeckPriceBasis.help,/^Choose material only or installed\./);
  assert.doesNotMatch(FLAT_REPAIR_COPY.flatRoofDeckPriceBasis.help,/Blank means material only/);
});

// ---------------------------------------------------------------- B3
test('B3 defect: valley help names the valley work only and the line is Valley flashing',()=>{
  assert.equal(OWNER_FIELD_COPY.valleyPerLF.help,'Valley metal and valley labor only. The membrane lining in the valley is priced under Ice and water barrier, which includes valleys.');
  // 30 LF of valley * 600 = 18000 under the new name; the math is unchanged.
  const q=quote(roof({inputs:{valleyLengthLF:30}}));ready(q);
  assert.equal(amount(q,'Valley flashing'),18000);assert.equal(line(q,'Valley preparation'),undefined);
});
test('B3 boundary and neighbour: 0 LF adds no valley line; step flashing keeps its name',()=>{
  const none=quote(roof({inputs:{valleyLengthLF:0}}));ready(none);assert.equal(line(none,'Valley flashing'),undefined);
  // 10 LF step flashing * 800 = 8000.
  const step=quote(roof({inputs:{stepFlashingLengthLF:10}}));ready(step);assert.equal(amount(step,'Step flashing'),8000);
});

// ---------------------------------------------------------------- B4
test('B4 defect: 0 existing layers is accepted and nothing is removed or disposed of',()=>{
  // Steep, rise 8 (over 6/12 up to 9/12), bare deck: labor 20 * 20000 = 400000;
  // steep-pitch installation 400000 * 0.20 = 80000; no tear-off, steep-pitch
  // removal or disposal. The tear-off price is not asked.
  const f=roof({rise:8,layers:0});delete f.ownerPricing.pricing.tearOffPerSquare;
  const q=quote(f);ready(q);
  assert.equal(amount(q,'Roofing labor'),400000);assert.equal(amount(q,'Steep-pitch installation'),80000);
  for(const name of ['Tear-off','Steep-pitch removal','Steep-pitch additional-layer removal','Additional-layer tear-off','Roofing disposal'])assert.equal(line(q,name),undefined,name);
  assert.ok(q.options[0].priceDrivers?.includes?.('No existing roof layers to remove')||JSON.stringify(q).includes('No existing roof layers to remove'));
  // 2 stories on a bare deck: story adjustment on installation labor only, 400000 * 0.10 = 40000.
  const two=quote(roof({rise:8,layers:0,stories:2}));ready(two);assert.equal(amount(two,'Story labor adjustment'),40000);
  // Flat, bare deck: labor 1000 * 500 = 500000; membrane 1000 * 1.10 * 700 = 770000; no tear-off or disposal.
  const g=flat({},{existingLayers:0});delete g.ownerPricing.pricing.tearOffPerSqft;
  const fq=quote(g);ready(fq);assert.equal(amount(fq,'Flat roof labor'),500000);assert.equal(amount(fq,'Membrane'),770000);
  assert.equal(line(fq,'Tear-off'),undefined);assert.equal(line(fq,'Flat-roof disposal'),undefined);
});
test('B4 boundary: below 0 is refused; 1 layer still removes and disposes',()=>{
  const neg=quote(roof({layers:-1}));assert.equal(neg.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(neg.invalidCustomerFields.includes('existingLayers'));
  const negFlat=quote(flat({},{existingLayers:-1}));assert.ok(negFlat.invalidCustomerFields.includes('existingLayers'));
  // Rise 8, 1 layer: tear-off 20 * 6000 = 120000; steep-pitch removal 120000 * 0.26 = 31200; disposal 20 * 3000 = 60000.
  const one=quote(roof({rise:8,layers:1}));ready(one);
  assert.equal(amount(one,'Tear-off'),120000);assert.equal(amount(one,'Steep-pitch removal'),31200);assert.equal(amount(one,'Roofing disposal'),60000);
});
test('B4 neighbour: earlier roofing rules at 0 layers price installation only',()=>{
  // Earlier rules (v36 frozen input, 10 squares, no decking): labor 10 * 5000 = 50000 and
  // field material 11 * 10000 = 110000 at 0 and 1 layer; tear-off 10 * 2000 = 20000 only at 1 layer.
  const legacy=layers=>{const f=corpus('v36:roof-installed-decking-stories-1');Object.assign(f.customerInputs,{existingLayers:layers,deckingSheets:0});return quote(f);};
  const z=legacy(0),o=legacy(1);ready(z);ready(o);
  for(const q of [z,o]){assert.equal(amount(q,'Roofing labor'),50000);assert.equal(amount(q,'Field materials'),110000);}
  assert.equal(amount(o,'Tear-off'),20000);assert.equal(line(z,'Tear-off'),undefined);
});

// ---------------------------------------------------------------- B5
test('B5 defect: on the whole-roof method a selected-band area that differs from the roof area is refused',()=>{
  // Rise 8 whole roof of 2000 sq ft, with 1800 sq ft entered at over 6/12 up to 9/12.
  const q=quote(roof({rise:8,inputs:{pitchArea7To9Sqft:1800}}));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.invalidCustomerFields,['pitchArea7To9Sqft']);
  assert.match(q.validationMessages.join(' '),/Roof area at the selected pitch must equal the roof area being quoted when one pitch is given for the whole roof\./);
});
test('B5 boundary: an equal selected-band area prices as the whole roof',()=>{
  // 2000 at the selected band equals the 2000 sq ft roof: labor 400000, steep-pitch installation 80000.
  const q=quote(roof({rise:8,inputs:{pitchArea7To9Sqft:2000}}));ready(q);
  assert.equal(amount(q,'Roofing labor'),400000);assert.equal(amount(q,'Steep-pitch installation'),80000);
  // Partial 1000 sq ft with 1000 at the selected band: labor 10 * 20000 = 200000.
  const part=quote(roof({rise:8,scope:'partial',inputs:{partialAreaSqft:1000,pitchArea7To9Sqft:1000}}));ready(part);assert.equal(amount(part,'Roofing labor'),200000);
});
test('B5 neighbour: whole roof without a band area, and the area-by-pitch method, are unchanged',()=>{
  const q=quote(roof({rise:8}));ready(q);assert.equal(amount(q,'Roofing labor'),400000);
  // Area by pitch: 1200 at 4/12 up to 6/12 and 800 over 6/12 up to 9/12. Labor 20 * 20000 = 400000;
  // steep-pitch installation on 8 squares: 8 * 20000 * 0.20 = 32000.
  const byPitch=roof({rise:8,inputs:{pitchMethod:'area_by_pitch',pitchAreaUpTo6Sqft:1200,pitchArea7To9Sqft:800}});delete byPitch.customerInputs.pitchBand;delete byPitch.customerInputs.pitchRisePer12;
  const b=quote(byPitch);ready(b);assert.equal(amount(b,'Steep-pitch installation'),32000);
});

// ---------------------------------------------------------------- B6 and B7
// Cemented low-slope (NBC 9.26.8) 3-tab roof at rise 3 from the v35 frozen
// input, with 40 LF of hip and ridge cap. 20 squares, 10% waste: normal field
// material 22 squares; shingle-only price 10000/sq; ridge cap 300/LF.
function cemented(edit=()=>{}){
  const f=corpus('v35:item3-cemented-three-tab-rise-3');
  Object.assign(f.customerInputs,{starterLengthLF:180,dripEdgeLengthLF:180,ridgeCapLengthLF:40});
  Object.assign(f.ownerPricing.pricing,{starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300});
  edit(f.ownerPricing.pricing);return f;
}
const exposures=(n,t)=>p=>{p.nbcLowSlopeNormalExposureByProduct={asphalt_shingle:n};p.nbcLowSlopeTripleExposureByProduct={asphalt_shingle:t};};
test('B6 defect: triple-coverage exposure not shorter than normal is refused; saved factor 1.00 is an owner diagnostic',()=>{
  for(const [n,t] of [[5,5],[5,5.5]]){
    const q=quote(cemented(exposures(n,t)));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.ok(q.invalidOwnerFields.includes('nbcLowSlopeTripleExposureByProduct.asphalt_shingle'));
    assert.match(JSON.stringify(q.ownerDiagnostics),/The triple-coverage exposure must be shorter than the normal exposure for this shingle\./);
  }
  const one=quote(cemented(p=>{p.nbcLowSlopeShingleFactorByProduct.asphalt_shingle=1;}));
  assert.equal(one.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(one.invalidOwnerFields.includes('nbcLowSlopeShingleFactorByProduct.asphalt_shingle'));
  assert.match(JSON.stringify(one.ownerDiagnostics),/saved for this shingle is 1\.00 or less/);
  // No saved factor and no exposures: both exposures are asked as owner prices.
  const none=quote(cemented(p=>{delete p.nbcLowSlopeShingleFactorByProduct;}));
  assert.deepEqual(none.missingOwnerFields.sort(),['nbcLowSlopeNormalExposureByProduct.asphalt_shingle','nbcLowSlopeTripleExposureByProduct.asphalt_shingle']);
  const half=quote(cemented(p=>{p.nbcLowSlopeNormalExposureByProduct={asphalt_shingle:5};}));
  assert.deepEqual(half.missingOwnerFields,['nbcLowSlopeTripleExposureByProduct.asphalt_shingle']);
});
test('B6 priced: factor = normal / triple exposure; B7 cap takes the factor',()=>{
  // 5.625 / 4.375 = 9/7. Extra shingles: 20 * 9/7 * 1.10 = 28.2857 - 22 = 6.2857 squares * 10000 = 62857.
  // B7 ridge cap: 40 * 9/7 = 51.4286 LF * 1.10 = 56.5714 LF * 300 = 16971.
  assert.deepEqual(roofCementedShingleFactor({nbcLowSlopeNormalExposureByProduct:{a:5.625},nbcLowSlopeTripleExposureByProduct:{a:4.375}},'a').value,9/7);
  const q=quote(cemented(exposures(5.625,4.375)));ready(q);
  assert.equal(amount(q,'Low-slope extra shingles'),62857);assert.equal(amount(q,'Hip-and-ridge cap'),16971);
  assert.equal(line(q,'Hip-and-ridge cap').calculation.unit,'waste-adjusted linear feet at triple coverage');
  // Exposures replace a saved factor: the saved 1.5 is not used once both are entered.
  const both=quote(cemented(p=>{exposures(5.625,4.375)(p);p.nbcLowSlopeShingleFactorByProduct={asphalt_shingle:1};}));ready(both);
  assert.equal(amount(both,'Low-slope extra shingles'),62857);
});
test('B6 boundary: triple at one third of normal is the largest accepted factor',()=>{
  // 6 / 2 = 3: extra shingles 20 * 3 * 1.10 = 66 - 22 = 44 squares * 10000 = 440000;
  // ridge cap 40 * 3 * 1.10 = 132 LF * 300 = 39600.
  const q=quote(cemented(exposures(6,2)));ready(q);
  assert.equal(amount(q,'Low-slope extra shingles'),440000);assert.equal(amount(q,'Hip-and-ridge cap'),39600);
  // 6 / 1.99 is over 3 times the shingle quantity (the earlier factor's limit): refused.
  const over=quote(cemented(exposures(6,1.99)));assert.equal(over.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.match(JSON.stringify(over.ownerDiagnostics),/at least one third of the normal exposure/);
});
test('B6 neighbour: a saved factor keeps being read until exposures are entered (per product and service-wide)',()=>{
  // Saved 1.5: extra shingles 20 * 1.5 * 1.10 = 33 - 22 = 11 squares * 10000 = 110000.
  // B7: ridge cap 40 * 1.5 * 1.10 = 66 LF * 300 = 19800 (was 44 LF * 300 = 13200 before B7).
  const q=quote(cemented());ready(q);
  assert.equal(amount(q,'Low-slope extra shingles'),110000);assert.equal(amount(q,'Hip-and-ridge cap'),19800);
  // Service-wide factor only (earlier still): 1.5 as well.
  const legacy=quote(cemented(p=>{delete p.nbcLowSlopeShingleFactorByProduct;p.nbcLowSlopeShingleFactor=1.5;}));ready(legacy);
  assert.equal(amount(legacy,'Low-slope extra shingles'),110000);
});
test('B7 neighbour: off the cemented method the cap, starter and drip edge are at measured length',()=>{
  // Double underlayment at rise 6: ridge cap 40 * 1.10 = 44 LF * 300 = 13200; starter 198 LF * 100 = 19800.
  const q=quote(roof({inputs:{ridgeCapLengthLF:40}}));ready(q);
  assert.equal(amount(q,'Hip-and-ridge cap'),13200);assert.equal(amount(q,'Starter strip'),19800);
  assert.equal(line(q,'Hip-and-ridge cap').calculation.unit,'waste-adjusted linear feet');
  // Cemented: starter and drip edge do not take the factor: 198 LF * 100 = 19800 and 198 LF * 200 = 39600.
  const c=quote(cemented());assert.equal(amount(c,'Starter strip'),19800);assert.equal(amount(c,'Drip edge'),39600);
});
test('B6 and B7 owner wording',()=>{
  assert.equal(ROOF_SLOPE_FIELD_COPY.nbcLowSlopeNormalExposureByProduct.label,'Normal shingle exposure (inches)');
  assert.equal(ROOF_SLOPE_FIELD_COPY.nbcLowSlopeTripleExposureByProduct.label,'Triple-coverage shingle exposure (inches)');
  assert.match(ROOF_SLOPE_FIELD_COPY.nbcLowSlopeTripleExposureByProduct.help,/to the field shingles and, when hip-and-ridge cap is priced separately, to the hip and ridge cap \(NBC 9\.26\.8\.5\); not to starter, drip edge, flashing or vents\./);
  assert.match(ROOF_SLOPE_FIELD_COPY.nbcLowSlopeShingleFactor.help,/to the hip and ridge cap; not to starter/);
  const roofMeta=bridge.applicationMetadata().services.find(s=>s.serviceType==='ROOFING_REPLACEMENT');
  assert.ok(roofMeta.pricingFields.some(f=>f.field==='nbcLowSlopeTripleExposureByProduct'));
});

// ---------------------------------------------------------------- B8
test('B8 defect: steep-pitch removal no longer adds disposal lines',()=>{
  // Rise 8, 2 layers: first-layer tear-off 120000; steep-pitch removal 120000 * 0.26 = 31200;
  // additional layer 20 * 6000 * 0.70 = 84000, steep-pitch additional 84000 * 0.26 = 21840;
  // disposal at the regular rate only: 20 * 2 * 3000 = 120000.
  const q=quote(roof({rise:8,layers:2}));ready(q);
  assert.equal(amount(q,'Steep-pitch removal'),31200);assert.equal(amount(q,'Steep-pitch additional-layer removal'),21840);
  assert.equal(amount(q,'Roofing disposal'),120000);
  assert.deepEqual(lines(q).filter(l=>/^Steep-pitch .*disposal/.test(l.name)),[]);
  assert.match(CLASS2_HELP['ROOFING_REPLACEMENT.pitchRemovalAdder'],/Disposal is not increased: it is charged at your regular disposal price per square and layer\./);
  assert.match(OWNER_FIELD_COPY.pitchRemovalAdderOverTwelve.help,/Disposal is not increased\./);
});
test('B8 boundary and neighbour: over 12/12 removal has no disposal line; 4/12 up to 6/12 has no steep lines',()=>{
  // Rise 13, 1 layer: steep-pitch removal 120000 * 0.60 = 72000; disposal 60000.
  const steep=quote(roof({rise:13}));ready(steep);
  assert.equal(amount(steep,'Steep-pitch removal'),72000);assert.equal(amount(steep,'Roofing disposal'),60000);
  assert.deepEqual(lines(steep).filter(l=>/^Steep-pitch .*disposal/.test(l.name)),[]);
  const walk=quote(roof({rise:6}));ready(walk);assert.deepEqual(lines(walk).filter(l=>/^Steep-pitch/.test(l.name)),[]);
  assert.equal(amount(walk,'Roofing disposal'),60000);
});

// ---------------------------------------------------------------- B9
test('B9 defect: band labels match the band bounds in the contract, owner fallback and voice',()=>{
  const f=roof({rise:8});
  const fields=customerContractForVNext('ROOFING_REPLACEMENT',f.ownerPricing.pricing,{startingValueAdoptions:f.ownerPricing.startingValueAdoptions}).fields;
  assert.deepEqual(fields.pitchBand.optionLabels,{under_four:'Under 4/12 — low slope, nearly flat',up_to_six:'4/12 up to 6/12 — walkable roof',seven_to_nine:'Over 6/12 up to 9/12 — steep roof',ten_to_twelve:'Over 9/12 up to 12/12 — very steep roof',over_twelve:'Over 12/12 — special steep work'});
  assert.equal(fields.pitchAreaUpTo6Sqft.label,'Roof surface area at 4/12 up to 6/12 — walkable');
  assert.equal(fields.pitchArea7To9Sqft.label,'Roof surface area over 6/12 up to 9/12 — steep');
  assert.equal(fields.pitchArea10To12Sqft.label,'Roof surface area over 9/12 up to 12/12 — very steep');
  const guide=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  const prompt=compileVoiceSystemInstruction({guideText:guide,business:{businessName:'Synthetic business',agentName:'Synthetic receptionist'},services:VOICE_GUIDE_SERVICE_TYPES.map(serviceType=>({serviceType,serviceLabel:serviceType.replaceAll('_',' '),active:true,status:'QUOTING LIVE',offerings:[]}))}).replace(/\s+/g,' ');
  assert.match(prompt,/4\/12 up to 6\/12, a walkable roof; over 6\/12 up to 9\/12, a steep roof; over 9\/12 up to 12\/12, a very steep roof/);
  assert.doesNotMatch(prompt,/7\/12 through 9\/12/);
});
test('B9 boundary: band bounds are unchanged (6 walkable, just over 6 steep, 9 steep, just over 9 very steep, 12 very steep)',()=>{
  assert.deepEqual([6,6.01,9,9.01,12,12.01].map(riseBand),['up_to_six','seven_to_nine','seven_to_nine','ten_to_twelve','ten_to_twelve','over_twelve']);
  // Rise 6.5 sits in the steep band and gets the 0.20 installation addition: 400000 * 0.20 = 80000.
  const q=quote(roof({rise:6.5}));ready(q);assert.equal(amount(q,'Steep-pitch installation'),80000);
});
test('B9 neighbour: under 4/12 and over 12/12 labels are unchanged',()=>{
  const f=roof();const labels=customerContractForVNext('ROOFING_REPLACEMENT',f.ownerPricing.pricing,{startingValueAdoptions:f.ownerPricing.startingValueAdoptions}).fields.pitchBand.optionLabels;
  assert.equal(labels.under_four,'Under 4/12 — low slope, nearly flat');assert.equal(labels.over_twelve,'Over 12/12 — special steep work');
});

// ---------------------------------------------------------------- B10
test('B10 defect: itemized insulation and cover board material take the 7% waste starting value',()=>{
  assert.equal(CLASS2_DEFINITIONS.FLAT_ROOF_REPLACEMENT.insulationWasteFactor.defaultValue,0.07);
  assert.equal(CLASS2_DEFINITIONS.FLAT_ROOF_REPLACEMENT.insulationWasteFactor.label,'Insulation and cover board waste');
  assert.equal(withClass2Defaults('FLAT_ROOF_REPLACEMENT',{}).insulationWasteFactor,0.07);
  // Insulation material 800 * 1.07 = 856 sq ft * 150 = 128400; cover board 600 * 1.07 = 642 * 75 = 48150.
  const q=quote(insulated());ready(q);
  assert.equal(amount(q,'Insulation material'),128400);assert.equal(amount(q,'Coverboard material'),48150);
  const meta=bridge.applicationMetadata().services.find(s=>s.serviceType==='FLAT_ROOF_REPLACEMENT');
  assert.equal(meta.class2Defaults.insulationWasteFactor,0.07);
  assert.match(class2FieldCopy('FLAT_ROOF_REPLACEMENT','insulationWasteFactor',0.07).help,/^Enter 7 for 7%.*Applies to itemized insulation and cover board material only/);
});
test('B10 boundary: 0 adds no waste; above 0.50 is refused; missing value is an owner setting',()=>{
  // Factor 0: 800 * 150 = 120000 and 600 * 75 = 45000 (the amounts before B10).
  const zero=quote(insulated('itemized',{insulationWasteFactor:0}));ready(zero);
  assert.equal(amount(zero,'Insulation material'),120000);assert.equal(amount(zero,'Coverboard material'),45000);
  const high=quote(insulated('itemized',{insulationWasteFactor:0.51}));assert.equal(high.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(high.invalidOwnerFields.includes('insulationWasteFactor'));
  const missing=insulated();delete missing.ownerPricing.pricing.insulationWasteFactor;
  const m=quote(missing);assert.equal(m.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok([...m.missingOwnerFields,...m.invalidOwnerFields].includes('insulationWasteFactor'));
});
test('B10 neighbours: labor, installed prices and the membrane are not adjusted',()=>{
  // Itemized labor: 800 * 50 = 40000 and 600 * 25 = 15000; membrane 1000 * 1.10 * 700 = 770000.
  const q=quote(insulated());ready(q);
  assert.equal(amount(q,'Insulation labor'),40000);assert.equal(amount(q,'Coverboard labor'),15000);assert.equal(amount(q,'Membrane'),770000);
  // Installed: 800 * 200 = 160000 and 600 * 100 = 60000.
  const inst=quote(insulated('installed'));ready(inst);
  const installedLines=lines(inst).filter(l=>/insulation|coverboard/i.test(l.name)).map(l=>l.amountCents).sort((a,b)=>a-b);
  assert.deepEqual(installedLines,[60000,160000]);
});
