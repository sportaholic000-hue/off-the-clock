// v28: the agreed v27 review. Values worked by hand before running:
//
// Leak source with no leak is ignored, not refused: catalog roof repair $580
// (repair labor $500 + materials $80) and flat-roof repair $360 ($300 + $60),
// with or without a source answer.
//
// Footprint roof, rise Not sure: the business measures it (no price exists
// without the rise). Blank still asks. Measured Under 4/12 Not sure keeps the
// low-slope inspection; measured Under 4/12 rise 3 prices $9,900.
//
// Yard cleanup, 1,000 sq ft at $0.10 = $100 labor, light debris $150 minimum:
//   flat only, 10 bags + 2 loads: counts unread, $250
//   per bag $3 only, 10 bags + 2 loads: 10 x $3 = $30 < $150, $250
//   per load $80 only, 10 bags + 2 loads: 2 x $80 = $160, $260
//   per bag only, 0 bags + 2 loads: the 0 is a real answer, $250, nothing on site
//   both priced, 0 bags + 2 loads: the 0 is unanswered, 2 loads, $260
//   both priced, 0 and 0: $250, nothing on site
//   both priced, 10 bags + 2 loads: refused
//
// Help: each of the 42 quantity assumptions that is not a percent is priced at
// two values and the lines that move are compared with its help.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {MEASUREMENT_CONTRACTS,FOOTPRINT_RISE_UNKNOWN_MESSAGE} from '../server/quote-engine-vnext/contracts.js';
import {LOW_SLOPE_UNKNOWN_MESSAGE} from '../server/quote-engine-vnext/roofSlopeRules.js';
import {EXTERIOR_PREP_HOURS_UNUSED,inactiveQuantityAssumption} from '../server/quote-engine-vnext/surfacePricing.js';
import {CLASS2_HELP} from '../server/priceBookCopy.js';
import {DEPENDENT_ANSWERS,withoutDeselectedDependents} from '../server/scopeConfiguration.js';
import {CLEANUP_DISPOSAL_SITE_LABEL} from '../server/quote-engine-vnext/landscapePricing.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {explanationCases} from './customerExplanationFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {fixture} from '../verification/engine-independent/fixtures.mjs';

const CASES=explanationCases();
const catalog=id=>structuredClone(CASES.find(r=>r.id===id).input);
const with_=(id,inputs={},pricing={})=>()=>{const f=typeof id==='function'?id():catalog(id);Object.assign(f.customerInputs,structuredClone(inputs));Object.assign(f.ownerPricing.pricing,structuredClone(pricing));return f;};
const ready=q=>{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason+' '+JSON.stringify(q.validationMessages||''));return q;};
const mid=f=>ready(generateQuoteVNext(f)).options[0].midEstimate;

// ---- 1. Leak source with no leak ----
test('1: a leak-source answer with no leak is ignored; the price is the same and the form still clears it',()=>{
  for(const [type,total] of [['ROOFING_REPAIR',580],['FLAT_ROOF_REPAIR',360]]){
    const f=catalog('catalog-'+type);f.customerInputs.leakPresent=false;delete f.customerInputs.leakSourceIdentified;
    assert.equal(mid(structuredClone(f)),total,type+' no leak');
    for(const source of [true,false]){
      const g=structuredClone(f);g.customerInputs.leakSourceIdentified=source;
      const q=generateQuoteVNext(g);assert.equal(q.options[0].midEstimate,total,type+' no leak, source '+source);
      assert.deepEqual(q.invalidCustomerFields||[],[]);
    }
    // With a leak the source still decides: Yes prices, No sends to inspection, blank asks.
    const leak=structuredClone(f);leak.customerInputs.leakPresent=true;
    assert.deepEqual(generateQuoteVNext(structuredClone(leak)).missingCustomerFields,['leakSourceIdentified']);
    leak.customerInputs.leakSourceIdentified=true;assert.equal(mid(structuredClone(leak)),total);
    leak.customerInputs.leakSourceIdentified=false;assert.equal(generateQuoteVNext(leak).resultType,'ESTIMATE_REQUIRES_REVIEW');
  }
  const pair=DEPENDENT_ANSWERS.find(d=>d.parent==='leakPresent');
  assert.deepEqual({off:pair.off,dependents:pair.dependents,serverIgnores:pair.serverIgnores},{off:[false],dependents:['leakSourceIdentified'],serverIgnores:true});
  assert.equal(DEPENDENT_ANSWERS.filter(d=>d.serverIgnores).length,1,'only the leak pair is ignored rather than refused');
  assert.deepEqual(withoutDeselectedDependents([{name:'leakPresent'}],{leakPresent:false,leakSourceIdentified:true,affectedArea:100}),{leakPresent:false,affectedArea:100});
});

// ---- 2. Footprint roof, rise Not sure ----
function roof(customer={}){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  return f;
}
test('2: a footprint roof whose rise is Not sure goes to the business to measure; blank still asks',()=>{
  const footprint={roofSizeMethod:'footprint',roofSizeInput:1500};
  assert.deepEqual(generateQuoteVNext(roof(footprint)).missingCustomerFields,['pitchRisePer12']);
  for(const band of ['up_to_six','under_four']){
    const q=generateQuoteVNext(roof({...footprint,pitchBand:band,pitchRisePer12:'unknown'}));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.deepEqual(q.missingCustomerFields||[],[],band+': Not sure is not asked again');
    assert.equal(q.reviewReason,FOOTPRINT_RISE_UNKNOWN_MESSAGE,band);
  }
  assert.equal(FOOTPRINT_RISE_UNKNOWN_MESSAGE,'The roof cannot be sized from the house footprint without its pitch, so the business will measure it before quoting.');
  // Measured roofs are unchanged.
  assert.equal(mid(roof()),9500);
  assert.deepEqual(generateQuoteVNext(roof({pitchBand:'under_four'})).missingCustomerFields,['pitchRisePer12']);
  assert.equal(generateQuoteVNext(roof({pitchBand:'under_four',pitchRisePer12:'unknown'})).reviewReason,LOW_SLOPE_UNKNOWN_MESSAGE);
  assert.equal(mid(roof({pitchBand:'under_four',pitchRisePer12:3})),9900);
  assert.equal(mid(roof({pitchRisePer12:'unknown'})),9500,'Not sure on a walkable measured roof is not read');
  assert.equal(Object.hasOwn(MEASUREMENT_CONTRACTS.ROOFING_REPLACEMENT,'unknownMissing'),false);
});

// ---- 3. Yard cleanup counts ----
const levels={light:{laborMultiplier:1,disposalFlat:15000},moderate:{laborMultiplier:1.5,disposalFlat:10000},heavy:{laborMultiplier:2,disposalFlat:15000}};
function cleanup(pricing,counts){
  const f=catalog('catalog-LANDSCAPING_CLEANUP');const p=f.ownerPricing.pricing;delete p.disposalPerBag;delete p.disposalPerLoad;
  Object.assign(p,{cleanupBaseRatePerSqft:10,debrisPricing:structuredClone(levels),...pricing});
  delete f.customerInputs.wasteBags;delete f.customerInputs.wasteLoads;
  Object.assign(f.customerInputs,{yardSqft:1000,debrisLevel:'light',slope:'flat',haulAway:false,...counts});return generateQuoteVNext(f);
}
test('3: two cleanup counts conflict only when the owner priced both units; a count in an unpriced unit is never read',()=>{
  const priced=(q,total,site=[])=>{ready(q);assert.equal(q.options[0].midEstimate,total);assert.deepEqual(q.options[0].skippedAddons,site);};
  priced(cleanup({},{wasteBags:10,wasteLoads:2}),250);
  priced(cleanup({disposalPerBag:300},{wasteBags:10,wasteLoads:2}),250);
  priced(cleanup({disposalPerLoad:8000},{wasteBags:10,wasteLoads:2}),260);
  priced(cleanup({disposalPerBag:300},{wasteBags:0,wasteLoads:2}),250);
  priced(cleanup({disposalPerBag:300,disposalPerLoad:8000},{wasteBags:0,wasteLoads:2}),260);
  priced(cleanup({disposalPerBag:300,disposalPerLoad:8000},{wasteBags:0,wasteLoads:0}),250);
  priced(cleanup({disposalPerBag:300},{wasteLoads:2}),250,[CLEANUP_DISPOSAL_SITE_LABEL]);
  const both=cleanup({disposalPerBag:300,disposalPerLoad:8000},{wasteBags:10,wasteLoads:2});
  assert.equal(both.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(both.invalidCustomerFields,['wasteLoads']);
});

// ---- 4. Quantity assumption help: what each one moves ----
const scope=(id,inputs={},edit=()=>{})=>()=>{const f=structuredClone(measuredScopeCases().find(x=>x.id===id).input);Object.assign(f.customerInputs,inputs);edit(f);return f;};
const painting=(type,mode,inputs={})=>()=>{const f=offeringFixture(type,mode);
  if(type==='INTERIOR_PAINTING'){Object.assign(f.customerInputs,{ceilingCoats:2,ceilingSurfaceCondition:'good',trimCoats:2,trimSurfaceCondition:'good'});if(mode==='itemized'){const r=f.ownerPricing.pricing.offeringRates;Object.assign(r,{prepLaborPerSqft_good:r.prepLaborPerSqft,prepMaterialPerSqft_good:r.prepMaterialPerSqft});}}
  Object.assign(f.customerInputs,inputs);return f;};
const roof16=()=>{const f=roof({pitchBand:'seven_to_nine',stories:2,existingLayers:2,roofComplexity:'moderate'});Object.assign(f.ownerPricing.pricing,{pitchMultiplier:{low:1,medium:1,steep:1.25,very_steep:1.4},storyMultiplier:{1:1,2:1.1,3:1.2}});return f;};
const roofEarly=with_('catalog-ROOFING_REPLACEMENT',{pitch:'steep',stories:2,roofComplexity:'moderate',existingLayers:2});
const measuredInterior=with_('catalog-INTERIOR_PAINTING',{wallHeight:'high',ceilingsIncluded:true,ceilingAreaSqft:200,ceilingCoats:2,ceilingSurfaceCondition:'good',coats:2,trimCoats:2,trimSurfaceCondition:'fair'},{paintingRates:{trimLaborPerLFPerCoat:100,trimMaterialPerLFPerCoat:30,trimPrepLaborPerLF_fair:20,trimPrepMaterialPerLF_fair:5,primerLaborPerSqftPerCoat:30,primerMaterialPerSqftPerCoat:10,ceilingPrimerLaborPerSqftPerCoat:30,ceilingPrimerMaterialPerSqftPerCoat:10,trimPrimerLaborPerLFPerCoat:40,trimPrimerMaterialPerLFPerCoat:10},paintingSettings:{wallAdditionalCoatRatio:0.8,ceilingAdditionalCoatRatio:0.8,trimAdditionalCoatRatio:0.33,primerCoats:1,ceilingPrimerCoats:1,trimPrimerCoats:1}});
const flooringJob=(type,inputs={},pricing={},adopt=true)=>()=>{const f=catalog('catalog-'+type);Object.assign(f.customerInputs,inputs);Object.assign(f.ownerPricing.pricing,structuredClone(pricing));if(f.customerInputs.newFlooringType==='tile'&&f.ownerPricing.pricing.herringboneLaborMultiplierByType?.tile===undefined)f.ownerPricing.pricing.herringboneLaborMultiplierByType={...(f.ownerPricing.pricing.herringboneLaborMultiplierByType||{}),tile:1.6};if(adopt)f.ownerPricing.startingValueAdoptions={...(f.ownerPricing.startingValueAdoptions||{}),flooring_patterns_20261017:{mode:'adopted'}};return f;};
const concreteJob=type=>with_('catalog-'+type,{finishType:'smooth',accessDifficulty:'difficult',baseNeeded:true},{controlJointPricing:'excluded',sawCutPerLF:150,controlJointSpacingFt:10,formingLaborPricing:'per_linear_foot',formingLaborPerLF:300,baseGravelPerCubicYard:4000,baseExcavationGradingPerSqft:50,baseDepthInches:4,baseCompactionAllowance:0.2});
const sod=with_('catalog-LANDSCAPING_SOD',{sodSqft:1000,groundPrepNeeded:true,usableTopsoilDepthInches:1,slope:'steep',accessDifficulty:'difficult'},{sodRemovalPerSqft:40,sodGradingPerSqft:30,topsoilPerCubicYard:4500,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:3});
const sodCombined=with_('catalog-LANDSCAPING_SOD',{sodSqft:1000,groundPrepNeeded:true,slope:'steep',accessDifficulty:'difficult'});
const setPath=(o,path,v)=>{const k=path.split('.');let t=o;for(const x of k.slice(0,-1)){if(t[x]===undefined||typeof t[x]!=='object')t[x]={};t=t[x];}t[k.at(-1)]=v;};
function movedLines(make,path,a,b){
  const run=v=>{const f=make();setPath(f.ownerPricing.pricing,path,v);const q=ready(generateQuoteVNext(f));return new Map(q.options[0].lineItems.map(l=>[l.name,l.amountCents]));};
  const A=run(a),B=run(b);assert.deepEqual([...A.keys()].sort(),[...B.keys()].sort(),path+' changes no line set');
  return [...A.keys()].filter(k=>A.get(k)!==B.get(k)).sort();
}
// [setting, scenario, path, a, b, lines that move]. Every other line of the
// scenario must stay; the scenario's lines are listed in the help where it
// names what is not adjusted.
const MEASURED=[
  ['ROOFING_REPLACEMENT.pitchMultiplier',roofEarly,'pitchMultiplier.steep',1.25,1.5,['Roofing labor','Tear-off']],
  ['ROOFING_REPLACEMENT.pitchMultiplier',roof16,'pitchMultiplier.steep',1.25,1.5,[]],
  ['ROOFING_REPLACEMENT.storyMultiplier',roofEarly,'storyMultiplier.2',1.1,1.3,['Roofing labor','Tear-off']],
  ['ROOFING_REPLACEMENT.storyMultiplier',roof16,'storyMultiplier.2',1.1,1.3,['Additional-layer story adjustment','Story labor adjustment','Story tear-off adjustment']],
  ['ROOFING_REPLACEMENT.pitchInstallationAdder',roofEarly,'pitchInstallationAdder.seven_to_nine',0.2,0.5,[]],
  ['ROOFING_REPLACEMENT.pitchInstallationAdder',roof16,'pitchInstallationAdder.seven_to_nine',0.2,0.5,['Steep-pitch installation']],
  ['ROOFING_REPLACEMENT.pitchRemovalAdder',roofEarly,'pitchRemovalAdder.seven_to_nine',0.26,0.5,[]],
  ['ROOFING_REPLACEMENT.pitchRemovalAdder',roof16,'pitchRemovalAdder.seven_to_nine',0.26,0.5,['Steep-pitch additional-layer disposal','Steep-pitch additional-layer removal','Steep-pitch disposal','Steep-pitch removal']],
  ['ROOFING_REPLACEMENT.complexityLaborMultiplier',roofEarly,'complexityLaborMultiplier.moderate',1.2,1.5,[]],
  ['ROOFING_REPLACEMENT.complexityLaborMultiplier',roof16,'complexityLaborMultiplier.moderate',1.2,1.5,['Roof-shape labor adjustment']],
  ['ROOFING_REPLACEMENT.additionalLayerRemovalFactor',roofEarly,'additionalLayerRemovalFactor',0.7,0.9,[]],
  ['ROOFING_REPLACEMENT.additionalLayerRemovalFactor',roof16,'additionalLayerRemovalFactor',0.7,0.9,['Additional-layer story adjustment','Additional-layer tear-off','Steep-pitch additional-layer removal']],
  ['ROOFING_REPAIR.pitchMultiplier',with_('catalog-ROOFING_REPAIR',{pitch:'steep',stories:2}),'pitchMultiplier.steep',1.25,1.5,['Repair labor']],
  ['ROOFING_REPAIR.storyMultiplier',with_('catalog-ROOFING_REPAIR',{pitch:'steep',stories:2}),'storyMultiplier.2',1.1,1.3,['Repair labor']],
  ['FLAT_ROOF_REPLACEMENT.accessMultiplier',scope('commercial-itemized',{accessDifficulty:'difficult'}),'accessMultiplier.difficult',1.3,1.6,['Flat roof labor','Tear-off','coverboard labor','insulation labor']],
  ['FLAT_ROOF_REPLACEMENT.accessMultiplier',scope('commercial-installed',{accessDifficulty:'difficult'}),'accessMultiplier.difficult',1.3,1.6,['Flat roof labor','Tear-off']],
  ['FLAT_ROOF_REPAIR.accessMultiplier',with_('catalog-FLAT_ROOF_REPAIR',{accessDifficulty:'difficult'}),'accessMultiplier.difficult',1.3,1.6,['Flat roof repair labor']],
  ['INTERIOR_PAINTING.wallHeightLaborMultiplier',measuredInterior,'wallHeightLaborMultiplier.high',1.1,1.4,['Ceiling labor — additional coats','Ceiling labor — first coat','Ceiling primer labor','Wall labor — additional coats','Wall labor — first coat','Wall primer labor']],
  ['INTERIOR_PAINTING.wallHeightLaborMultiplier',painting('INTERIOR_PAINTING','itemized',{wallHeight:'high'}),'wallHeightLaborMultiplier.high',1.1,1.4,['Ceiling finish labor','Ceiling primer labor','Saved preparation labor for the defined condition','Wall finish labor','Wall primer labor','good surface preparation labor — ceilings']],
  ['INTERIOR_PAINTING.wallHeightLaborMultiplier',painting('INTERIOR_PAINTING','installed',{wallHeight:'high'}),'wallHeightLaborMultiplier.high',1.1,1.4,['Ceiling painting including the defined coats, preparation and primer','Painting including the defined coats, preparation and primer']],
  ['INTERIOR_PAINTING.paintingSettings',measuredInterior,'paintingSettings.trimAdditionalCoatRatio',0.33,0.6,['Trim labor — additional coats','Trim labor — first coat']],
  ['INTERIOR_PAINTING.paintingSettings',measuredInterior,'paintingSettings.wallAdditionalCoatRatio',0.8,0.5,['Wall labor — additional coats','Wall labor — first coat']],
  ['INTERIOR_PAINTING.paintingSettings',painting('INTERIOR_PAINTING','installed'),'paintingSettings.wallAdditionalCoatRatio',0.8,0.5,[]],
  ['EXTERIOR_PAINTING.storyMultiplier',painting('EXTERIOR_PAINTING','itemized',{stories:2}),'storyMultiplier.2',1.1,1.4,['Saved preparation labor for the defined condition','Wall finish labor','Wall primer labor']],
  ['EXTERIOR_PAINTING.storyMultiplier',painting('EXTERIOR_PAINTING','installed',{stories:2}),'storyMultiplier.2',1.1,1.4,['Painting including the defined coats, preparation and primer']],
  ['EXTERIOR_PAINTING.prepHoursPerSqft',painting('EXTERIOR_PAINTING','itemized',{surfaceCondition:'fair'}),'prepHoursPerSqft.fair',0.008,0.1,[]],
  ['EXTERIOR_PAINTING.prepHoursPerSqft',painting('EXTERIOR_PAINTING','installed',{surfaceCondition:'fair'}),'prepHoursPerSqft.fair',0.008,0.1,[]],
  ['EXTERIOR_PAINTING.paintingSettings',painting('EXTERIOR_PAINTING','itemized'),'paintingSettings.wallAdditionalCoatRatio',0.8,0.5,['Wall finish labor — additional coats','Wall finish labor — first coat']],
  ['EXTERIOR_PAINTING.paintingSettings',painting('EXTERIOR_PAINTING','itemized'),'paintingSettings.trimAdditionalCoatRatio',0.33,0.6,[]],
  ['EXTERIOR_PAINTING.paintingSettings',painting('EXTERIOR_PAINTING','installed'),'paintingSettings.wallAdditionalCoatRatio',0.8,0.5,[]],
  ...['FLOORING_INSTALL','FLOORING_REPLACEMENT'].flatMap(type=>{const type2=type==='FLOORING_INSTALL'?'vinyl_plank':'tile';return [
    [type+'.roomComplexityMultiplier',flooringJob(type,{sqft:200,roomCount:2}),'roomComplexityMultiplier.small',1.2,1.5,['Flooring labor']],
    [type+'.roomSizeThresholds',flooringJob(type,{sqft:400,roomCount:2}),'roomSizeThresholds.smallMaxSqft',150,250,['Flooring labor']],
    [type+'.layoutLaborMultiplier',flooringJob(type,{layoutPattern:'diagonal_or_pattern'}),'layoutLaborMultiplier.diagonal_or_pattern',1.2,1.5,['Flooring labor']],
    [type+'.layoutLaborMultiplier',flooringJob(type,{layoutPattern:'diagonal_or_pattern'},{diagonalLaborMultiplierByType:{[type2]:1.3}}),'layoutLaborMultiplier.diagonal_or_pattern',1.2,1.5,[]],
    [type+'.diagonalWasteAdderByType',flooringJob(type,{layoutPattern:'diagonal_or_pattern'}),'diagonalWasteAdderByType.'+type2,0.04,0.2,['Flooring materials']],
    [type+'.diagonalWasteAdderByType',flooringJob(type,{layoutPattern:'herringbone_or_chevron'},{herringboneWasteAdderByType:{}}),'diagonalWasteAdderByType.'+type2,0.04,0.2,['Flooring materials']],
    [type+'.herringboneWasteAdderByType',flooringJob(type,{layoutPattern:'herringbone_or_chevron'}),'herringboneWasteAdderByType.'+type2,0.04,0.2,['Flooring materials']],
    [type+'.herringboneLaborMultiplierByType',flooringJob(type,{layoutPattern:'herringbone_or_chevron'}),'herringboneLaborMultiplierByType.'+type2,1.6,2,['Flooring labor']],
    [type+'.herringboneLaborMultiplierByType',flooringJob(type,{layoutPattern:'herringbone_or_chevron'},{},false),'herringboneLaborMultiplierByType.'+type2,1.6,2,['Flooring labor']]
  ];}),
  ...['FENCING_INSTALL','FENCING_REPLACEMENT'].flatMap(type=>[
    [type+'.postSpacingLF',with_(type+'-itemized'),'postSpacingLF',8,6,['Footing materials','Post-hole and footing labor','Separately priced post materials']],
    [type+'.postSpacingLF',with_(type+'-installed'),'postSpacingLF',8,6,[]],
    [type+'.terrainLaborMultiplier',with_(type+'-itemized',{terrainSlope:'steep'}),'terrainLaborMultiplier.steep',1.3,1.6,['Fence infill installation labor','Post-hole and footing labor',...(type==='FENCING_REPLACEMENT'?['Fence removal']:[])].sort()],
    [type+'.terrainLaborMultiplier',with_(type+'-installed',{terrainSlope:'steep'}),'terrainLaborMultiplier.steep',1.3,1.6,['Installed fence including standard posts and footings',...(type==='FENCING_REPLACEMENT'?['Fence removal']:[])].sort()]
  ]),
  ['SIDING_REPLACEMENT.storyMultiplier',scope('siding-trim-itemized',{stories:2}),'storyMultiplier.2',1.1,1.4,['Siding labor','Siding trim installation labor']],
  ['SIDING_REPLACEMENT.storyMultiplier',scope('siding-trim-installed',{stories:2}),'storyMultiplier.2',1.1,1.4,['Siding labor']],
  ['SIDING_REPLACEMENT.storyMultiplier',scope('siding-removal-itemized',{stories:2,sidingRemovalStories:2},f=>{f.ownerPricing.pricing.scopeDetails.siding_removal.stories=2;}),'storyMultiplier.2',1.1,1.4,['Siding labor']],
  ['SIDING_REPAIR.storyMultiplier',with_('catalog-SIDING_REPAIR',{stories:2}),'storyMultiplier.2',1.1,1.4,['Siding repair labor']],
  ...['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB'].flatMap(type=>[
    [type+'.finishMultiplier',concreteJob(type),'finishMultiplier.smooth',1.05,1.3,['Concrete labor']],
    [type+'.accessMultiplier',concreteJob(type),'accessMultiplier.difficult',1.25,1.5,['Base excavation and grading','Concrete labor','Forming labor','Saw-cut control joints']]
  ]),
  ['CONCRETE_PATIO_SLAB.accessMultiplier',scope('exposed-itemized',{accessDifficulty:'difficult'}),'accessMultiplier.difficult',1.25,1.5,['Additional exposed-aggregate finishing labor','Concrete labor']],
  ['CONCRETE_PATIO_SLAB.accessMultiplier',scope('demolition-itemized',{accessDifficulty:'difficult'}),'accessMultiplier.difficult',1.25,1.5,['Concrete labor']],
  ['LANDSCAPING_CLEANUP.slopeMultiplier',with_('catalog-LANDSCAPING_CLEANUP',{slope:'steep'}),'slopeMultiplier.steep',1.35,1.7,['Cleanup labor']],
  ['LANDSCAPING_MULCH.accessMultiplier',with_('catalog-LANDSCAPING_MULCH',{accessDifficulty:'difficult',bedCondition:'needs_weeding',edgingNeeded:true,edgeLF:40}),'accessMultiplier.difficult',1.25,1.5,['Bed edging','Bed preparation','Mulch installation labor']],
  ['LANDSCAPING_PLANTING.accessMultiplier',with_('catalog-LANDSCAPING_PLANTING',{accessDifficulty:'difficult',bedCondition:'needs_weeding',mulchNeeded:true,mulchYards:2}),'accessMultiplier.difficult',1.25,1.5,['Bed preparation','Large plant installation labor','Medium plant installation labor','Mulch installation labor','Small plant installation labor']],
  ['LANDSCAPING_SOD.slopeMultiplier',sod,'slopeMultiplier.steep',1.35,1.7,['Old-lawn removal with disposal','Sod grading','Sod installation labor']],
  ['LANDSCAPING_SOD.slopeMultiplier',sodCombined,'slopeMultiplier.steep',1.35,1.7,['Sod installation labor']],
  ['LANDSCAPING_SOD.accessMultiplier',sod,'accessMultiplier.difficult',1.25,1.5,['Old-lawn removal with disposal','Sod grading','Sod installation labor']],
  ['LANDSCAPING_SOD.accessMultiplier',sodCombined,'accessMultiplier.difficult',1.25,1.5,['Sod installation labor']]
];
test('4: each of the 42 quantity assumptions that is not a percent moves exactly the lines its help describes',()=>{
  for(const [setting,make,path,a,b,expected] of MEASURED)assert.deepEqual(movedLines(make,path,a,b),[...expected].sort(),setting+' '+path);
  const measuredSettings=new Set(MEASURED.map(row=>row[0]));
  assert.equal(measuredSettings.size,42);
  assert.deepEqual([...measuredSettings].sort(),Object.keys(CLASS2_HELP).sort());
});

test('4: the four behaviours named in review, worked by hand',()=>{
  // Roof repair adds pitch and story: $400 labor x (1 + 0.25 + 0.10) = $540.
  const repair=ready(generateQuoteVNext(with_('catalog-ROOFING_REPAIR',{pitch:'steep',stories:2})()));
  assert.equal(repair.options[0].lineItems.find(l=>l.name==='Repair labor').amountCents,54000);
  assert.match(CLASS2_HELP['ROOFING_REPAIR.pitchMultiplier'],/added together, not multiplied: a steep 1\.25 and a two-story 1\.10 give 1 \+ 0\.25 \+ 0\.10 = 1\.35/);
  // Interior wall height also scales ceiling labor ($400 x 1.1 = $440).
  assert.match(CLASS2_HELP['INTERIOR_PAINTING.wallHeightLaborMultiplier'],/^Multiplies wall and ceiling labor/);
  // Exterior installed: $3,000 x (0.40 + 0.60 x 1.10) = $3,180.
  assert.equal(mid(painting('EXTERIOR_PAINTING','installed',{stories:2})()),3180);
  assert.match(CLASS2_HELP['EXTERIOR_PAINTING.storyMultiplier'],/\$3,000 with a 60% labor share at 1\.10 gives \$3,180/);
  // Sod slope at 1.15: $800 / $400 / $300 become $920 / $460 / $345; combined preparation stays.
  const slope=v=>{const f=with_('catalog-LANDSCAPING_SOD',{sodSqft:1000,groundPrepNeeded:true,usableTopsoilDepthInches:1,slope:'moderate',accessDifficulty:'easy'},{sodInstallLaborPerSqft:80,sodRemovalPerSqft:40,sodGradingPerSqft:30,topsoilPerCubicYard:4500,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:3,slopeMultiplier:{flat:1,moderate:v,steep:1.35},accessMultiplier:{easy:1,moderate:1.1,difficult:1.25}})();return Object.fromEntries(ready(generateQuoteVNext(f)).options[0].lineItems.map(l=>[l.name,l.amountCents]));};
  const flat=slope(1),steep=slope(1.15);
  assert.deepEqual([flat['Sod installation labor'],flat['Old-lawn removal with disposal'],flat['Sod grading']],[80000,40000,30000]);
  assert.deepEqual([steep['Sod installation labor'],steep['Old-lawn removal with disposal'],steep['Sod grading']],[92000,46000,34500]);
  assert.equal(steep['Imported topsoil'],flat['Imported topsoil']);
});

test('4: the price book serves the measured help for all 42, never the generic sentence; labels are unchanged',()=>{
  const services=bridge.applicationMetadata().services;let served=0;
  for(const s of services)for(const f of s.class2Fields||[]){
    assert.doesNotMatch(f.help||'',/^Owner-editable/,s.serviceType+'.'+f.field);
    const own=CLASS2_HELP[s.serviceType+'.'+f.field];
    if(own){assert.equal(f.help,own,s.serviceType+'.'+f.field);served++;}
  }
  assert.equal(served,42);
  // Settings that are not multipliers say what they decide; prep hours say they are unused.
  assert.equal(CLASS2_HELP['EXTERIOR_PAINTING.prepHoursPerSqft'],EXTERIOR_PREP_HOURS_UNUSED);
  assert.equal(inactiveQuantityAssumption('EXTERIOR_PAINTING',{offeringMode:'itemized'},'prepHoursPerSqft'),EXTERIOR_PREP_HOURS_UNUSED);
  // The old copy is not served for exterior painting (an interior setting retired
  // earlier keeps it as stored help; that panel shows only the label and value).
  assert.doesNotMatch(JSON.stringify(services.find(s=>s.serviceType==='EXTERIOR_PAINTING')),/Labor-hour allowance for fair or poor surface preparation/);
  assert.match(CLASS2_HELP['FENCING_INSTALL.postSpacingLF'],/^Itemized fence pricing counts posts from this spacing/);
  assert.match(CLASS2_HELP['FLOORING_INSTALL.roomSizeThresholds'],/^Decides the room-size band/);
  assert.match(CLASS2_HELP['INTERIOR_PAINTING.paintingSettings'],/fraction of the first coat's/);
  // Earlier and October 16 roofing settings each say which rules they belong to.
  assert.match(CLASS2_HELP['ROOFING_REPLACEMENT.pitchMultiplier'],/^Earlier roofing rules only/);
  assert.match(CLASS2_HELP['ROOFING_REPLACEMENT.storyMultiplier'],/^Earlier roofing rules: .* October 16 rules: /);
  for(const field of ['pitchInstallationAdder','pitchRemovalAdder','complexityLaborMultiplier','additionalLayerRemovalFactor'])assert.match(CLASS2_HELP['ROOFING_REPLACEMENT.'+field],/^October 16 roofing rules only/);
  const label=(type,field)=>services.find(s=>s.serviceType===type).class2Fields.find(f=>f.field===field).label;
  assert.equal(label('LANDSCAPING_MULCH','accessMultiplier'),'Mulch access labor multiplier');
  assert.equal(label('LANDSCAPING_PLANTING','accessMultiplier'),'Planting access labor multiplier');
  assert.equal(label('SIDING_REPLACEMENT','storyMultiplier'),'Siding story labor and removal multiplier');
});

// ---- 5. Wording and documents ----
test('5: sod preparation help uses one phrasing; the engine file list and phone guide are current',async()=>{
  const sod=bridge.applicationMetadata().services.find(s=>s.serviceType==='LANDSCAPING_SOD').fields;
  const help=field=>sod.find(f=>f.field===field).help;
  assert.match(help('sodRemovalPerSqft'),/Any separate preparation price replaces the combined Ground preparation price; grading and topsoil are then included only when separately priced\.$/);
  assert.match(help('sodGradingPerSqft'),/Any separate preparation price replaces the combined Ground preparation price; removal and topsoil are then included only when separately priced\.$/);
  assert.match(help('topsoilPerCubicYard'),/Any separate preparation price replaces the combined Ground preparation price; removal and grading are then included only when separately priced\.$/);
  assert.doesNotMatch(JSON.stringify(sod),/old combined Ground preparation line/);
  const doc=await readFile(new URL('../QUOTE_ENGINE.md',import.meta.url),'utf8');
  const engine=doc.slice(doc.indexOf('## Engine: `server/quote-engine-vnext/`'),doc.indexOf('## Price book: `server/`'));
  assert.match(engine,/`floatConditionNames\.js`/);
  assert.doesNotMatch(doc.slice(doc.indexOf('## Price book: `server/`')),/floatConditionNames/);
  const guide=await readFile(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  assert.match(guide,/pitchRisePer12 for a footprint conversion or a roof below 4\/12\. Below 4\/12, "unknown" sends the roof to the business's low-slope inspection; with a footprint, "unknown" hands the job to the business to measure/);
});
