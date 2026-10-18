import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {paint,flooring,roof,accessoryRoof,confirmAccessories,installedFloor} from '../verification/qe-agent1-core-accuracy-20261018/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext,vNextServiceStatus,validateOwnerPricing,validatePricingStructuresDetailed,validateClass2FactorsDetailed,customerContractForVNext,CLASS2_DEFINITIONS,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {EXPECTED_QUOTE_ENGINE_VERSION} from '../server/src/runtimeConfig.js';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {FLOORING_ADDONS} from '../server/quote-engine-vnext/flooringPricing.js';
import {includedFixture,confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {fenceLayout} from '../server/quote-engine-vnext/fencePricing.js';
import {concreteLandscapeNotices} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
import {roofDependentDefinitionsVNext,synchronizeDependentLinesVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;};
const line=(q,path)=>q.lineItems.find(l=>l.calculation.ratePath===path);
const total=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const review=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(q));assert.equal(q.midEstimate,undefined);return q;};
const publicOnly=q=>assert.doesNotMatch(JSON.stringify(q),/"(?:lineItems|pricing|rateCents|installedLaborPercent|installedMaterialsPercent|priceMetadata)"/);
test('Agent1 v11 literals agree and remain distinct from v10',()=>{assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261018-v11');assert.equal(EXPECTED_QUOTE_ENGINE_VERSION,ENGINE_VERSION);});
test('Agent1 F1 exact 1.4 delta rounds 5000.5 up to 5001',()=>{
 const f=roof({roofSizeInput:100,pitchBand:'up_to_six',stories:2},{laborPerSquare:{asphalt_shingle:12501.25},storyMultiplier:{1:1,2:1.4,3:1.2}});
 const q=ready(f);assert.equal(q.lineItems.find(l=>l.name==='Story labor adjustment').amountCents,5001);
});
for(const [root,key,selection] of [['storyMultiplier','1',{stories:1}],['storyMultiplier','3',{stories:3}],['complexityLaborMultiplier','simple',{roofComplexity:'simple'}],['complexityLaborMultiplier','complex',{roofComplexity:'complex'}]])test('Agent1 F2 selected below-one policy and independent readiness '+root+'.'+key,()=>{
 const f=roof({roofSizeInput:100,pitchBand:'up_to_six'});f.ownerPricing.pricing[root][key]=.5;
 assert.deepEqual(validateClass2FactorsDetailed(f.serviceType,f.ownerPricing.pricing),[]);
 Object.assign(f.customerInputs,selection);const q=review(f);assert.ok(q.ownerDecisionRequired.some(d=>d.kind==='roof_factor_below_one_policy'&&d.path===root+'.'+key));
 const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));assert.ok(status.laborAdjustmentCoverage.some(d=>JSON.stringify(d.selection)===JSON.stringify(selection)));
 Object.assign(f.customerInputs,{stories:key==='1'?2:1,roofComplexity:key==='simple'?'moderate':'simple'});ready(f);
});
test('Agent1 F2 every story below one cannot activate',()=>{const f=roof();f.ownerPricing.pricing.storyMultiplier={1:.5,2:.5,3:.5};assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');});
for(const condition of ['fair','poor'])test('Agent1 F3 explicit trim preparation '+condition+' joins 14000-cent labor basis',()=>{
 const f=paint();f.customerInputs.trimSurfaceCondition=condition;const q=ready(f);assert.equal(q.lineItems.find(l=>l.name==='Peak season adjustment').amountCents,1400);assert.equal(total(q),16610); // 14000 labor+1000 wall material+100 trim material+110 prep material (10% prep waste)+1400 peak.
});
for(const addon of FLOORING_ADDONS){
 test('Agent1 F4/F5 missing '+addon.rate+' is safely excluded',()=>{
  const f=flooring();f.customerInputs[addon.input]=2;if(addon.rate==='floorLevelingPerSqft')f.customerInputs.floorLevelingNeeded=true;if(addon.rate==='furnitureMovingPrice')f.ownerPricing.pricing.furnitureMovingPriceUnit='per_room';
  const q=ready(f),pub=sanitizeForCustomerVNext(q);assert.equal(total(q),178000);assert.deepEqual(pub.options[0].skippedAddons,[addon.label]);publicOnly(pub);
 });
 test('Agent1 F4 included-zero '+addon.rate+' preserves scope and validation',()=>{
  const f=flooring();const p=f.ownerPricing.pricing;p[addon.rate]=0;f.customerInputs[addon.input]=2;
  if(addon.rate==='floorLevelingPerSqft')f.customerInputs.floorLevelingNeeded=true;if(addon.rate==='furnitureMovingPrice')p.furnitureMovingPriceUnit='per_room';
  // Installed addons are included in an explicitly classified installed overlay
  // of the same category/basis, never silently allocated into base labor.
  let covering='laborPerSqft.tile';let expected=178000;
  if(addon.installed){
   p.scopeDetails={floor_overlay:{description:'[SYNTHETIC] Included extra in overlay',mode:'installed',category:addon.category,existingFloorType:'vinyl',newFlooringType:'tile',basePriceExcludesPreparation:true}};p.scopeRates={floor_overlay_installed:100};covering='scopeRates.floor_overlay_installed';expected=198000;
   Object.assign(f.customerInputs,confirmedFixtureInputs({existingFloorType:'vinyl'}),{overlayScopeConfirmed:true});
  }
  f.ownerPricing=includedFixture(f.ownerPricing,{[addon.rate]:covering});const q=ready(f);assert.equal(total(q),expected);assert.equal(line(q,addon.rate).noChargeReason,'included_in_another_price');assert.deepEqual(q.options[0].skippedAddons,[]);assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');
  delete f.ownerPricing.zeroPricePolicy;assert.ok(review(f).missingOwnerFields.includes(addon.rate));
 });
}
test('Agent1 F5 complete option survives another option missing extra',()=>{const f=flooring();f.customerInputs.transitionCount=2;f.ownerPricing.tiers=[{name:'Excluded',overrides:{}},{name:'Complete',overrides:{transitionPriceEach:1000}}];const q=ready(f),pub=sanitizeForCustomerVNext(q);assert.deepEqual(pub.options.map(o=>[o.tierName,o.midEstimate,o.skippedAddons]),[['Excluded',1780,['Transitions']],['Complete',1800,[]]]);publicOnly(pub);});
for(const sections of [[100],[50,50],[100,20,20]])test('Agent1 F10 impossible closed '+sections,()=>{const f=offeringFixture('FENCING_INSTALL','itemized');delete f.customerInputs.linearFeet;delete f.customerInputs.gates;delete f.customerInputs.cornerCount;f.customerInputs.fenceRuns=[{closed:true,sections:sections.map(lengthLF=>({lengthLF}))}];assert.ok(review(f).invalidCustomerFields.includes('fenceRuns'));});
test('Agent1 F10 open sections, closed triangle, and gate width geometry',()=>{
 const p=offeringFixture('FENCING_INSTALL','itemized').ownerPricing.pricing;
 for(const sections of [[100],[50,50]])assert.equal(fenceLayout({fenceRuns:[{closed:false,sections:sections.map(lengthLF=>({lengthLF}))}]},p).linearFeet,100);
 assert.equal(fenceLayout({fenceRuns:[{closed:true,sections:[{lengthLF:30},{lengthLF:40},{lengthLF:50}]}]},p).cornerCount,3);
 // Gate joins two sections along one straight side: 10+4+10=24 < 15+15.
 assert.equal(fenceLayout({fenceRuns:[{closed:true,sections:[{lengthLF:10,gateAfter:'walk'},{lengthLF:10},{lengthLF:15},{lengthLF:15}]}]},p).gates.walk,1);
 assert.throws(()=>fenceLayout({fenceRuns:[{closed:true,sections:[{lengthLF:10,gateAfter:'walk'},{lengthLF:10},{lengthLF:10},{lengthLF:10}]}]},p),/shorter/);
});
for(const [unit,input,wrong,rate,expected] of [['square_feet','iceWaterBarrierSqft','iceWaterBarrierLengthLF','iceWaterBarrierPerSqft',49100],['linear_feet','iceWaterBarrierLengthLF','iceWaterBarrierSqft','iceWaterBarrierPerLF',69100]])test('Agent1 F11 configured '+unit+' only',()=>{
 const f=confirmAccessories(accessoryRoof({iceWaterBarrierUnit:unit,[rate]:unit==='square_feet'?100:300}));f.customerInputs[input]=100;assert.equal(total(ready(f)),expected);
 const fields=customerContractForVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing).fields;assert.notEqual(fields[input].evidenceOnly,true);assert.equal(fields[wrong].evidenceOnly,true);
 delete f.customerInputs[input];f.customerInputs[wrong]=100;assert.ok(review(f).invalidCustomerFields.includes(wrong));
});
test('Agent1 F12 asphalt accessory questions survive unconfirmed metal',()=>{
 const f=accessoryRoof({materialCostPerSquare:{asphalt_shingle:10000,metal:20000},laborPerSquare:{asphalt_shingle:20000,metal:30000},underlaymentPerSquare:{asphalt_shingle:100,metal:100},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price',metal:'installed_area_sell_price'},valleyPerLF:100});confirmAccessories(f,['roofing_flashing_vents.asphalt_shingle']);f.customerInputs.valleyLengthLF=10;
 assert.equal(total(ready(f)),40100);const fields=customerContractForVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing).fields;assert.deepEqual(fields.valleyLengthLF.visibleWhen,[[['replacementRoofType','eq','asphalt_shingle']]]);
 f.customerInputs=confirmedFixtureInputs({...f.customerInputs,replacementRoofType:'metal'});review(f);
});
test('Agent1 F13 base migration cannot confirm unchanged premium override',()=>{
 const f=accessoryRoof({materialCostPerSquare:{asphalt_shingle:30000},wasteFactorByComplexity:{simple:0,moderate:0,complex:0}});f.ownerPricing.tiers=[{name:'Base',overrides:{}},{name:'Premium',overrides:{materialCostPerSquare:{asphalt_shingle:40000}}}];
 assert.deepEqual(ready(f).options.map(o=>o.midEstimate),[581,681]);
 f.ownerPricing.pricing.materialCostPerSquare.asphalt_shingle=10000;f.ownerPricing.pricing.valleyPerLF=1000;confirmAccessories(f,['roofing_flashing_vents.asphalt_shingle']);f.customerInputs.valleyLengthLF=20;
 let q=ready(f);assert.deepEqual(q.options.map(o=>[o.tierName,o.midEstimate]),[['Base',581]]);assert.equal(f.ownerPricing.tiers[1].overrides.materialCostPerSquare.asphalt_shingle,40000);
 const definitions=roofDependentDefinitionsVNext(f.ownerPricing),id=definitions.find(d=>d.tierName==='Premium').id;
 assert.equal(f.ownerPricing.dependentLineState[id].tierName,'Premium');
 assert.throws(()=>synchronizeDependentLinesVNext(f.ownerPricing,definitions,{confirmIds:[id],ownerId:f.ownerPricing.origin.ownerId}),/Re-enter/);
 confirmAccessories(f,[id]);q=ready(f);assert.deepEqual(q.options.map(o=>o.midEstimate),[581,881]); // Explicitly approved unchanged premium, no inferred discount.
 f.ownerPricing.tiers[1].overrides.materialCostPerSquare.asphalt_shingle=40001;assert.deepEqual(ready(f).options.map(o=>o.tierName),['Base']);
});
for(const rate of ['transitionPriceEach','floorLevelingPerSqft'])test('Agent1 F15 '+rate+' allocation and seasonal missing-share exception',()=>{
 const f=installedFloor(rate);f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=10;f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;
 assert.deepEqual(validatePricingStructuresDetailed(f.serviceType,f.ownerPricing.pricing),[]);
 let q=ready(f);assert.equal(q.lineItems.find(l=>l.name==='Peak season adjustment').amountCents,6600);assert.equal(q.lineItems.find(l=>l.name==='Peak season adjustment on installed prices').amountCents,300);
 // Base labor66000+material112000+extra10000+season6900+extra materials tax400 =195300; base categories are explicitly untaxed.
 assert.equal(total(q),195300);
 delete f.ownerPricing.pricing.installedLaborPercent;q=ready(f);assert.equal(total(q),195000);
 delete f.ownerPricing.pricing.installedMaterialsPercent;review(f);
 const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(status.status,'QUOTING LIVE');const coverage=status.scopeCoverage.find(row=>row.key==='floor_extra_'+rate);assert.equal(coverage.configurationComplete,false);assert.ok(coverage.variants[0].missingFields.includes('installedMaterialsPercent.'+rate));
 f.businessDefaults.taxMode='TAX_NONE';f.businessDefaults.taxPercent=0;ready(f);
 f.ownerPricing.pricing.installedLaborPercent={[rate]:70};f.ownerPricing.pricing.installedMaterialsPercent={[rate]:40};review(f);
});
for(const [needed,rooms] of [[false,3],[true,0]])test('Agent1 F17 contradictory furniture '+needed+'/'+rooms,()=>{const f=flooring();Object.assign(f.ownerPricing.pricing,{furnitureMovingPrice:1000,furnitureMovingPriceUnit:'per_room'});Object.assign(f.customerInputs,{furnitureMovingNeeded:needed,furnitureMovingRoomCount:rooms});assert.ok(review(f).invalidCustomerFields.includes('furnitureMovingRoomCount'));});
test('Agent1 F17 consistent furniture per-room and flat',()=>{const f=flooring();Object.assign(f.ownerPricing.pricing,{furnitureMovingPrice:1000,furnitureMovingPriceUnit:'per_room'});Object.assign(f.customerInputs,{furnitureMovingNeeded:true,furnitureMovingRoomCount:3});assert.equal(total(ready(f)),181000);Object.assign(f.customerInputs,{furnitureMovingNeeded:false,furnitureMovingRoomCount:0});assert.equal(total(ready(f)),178000);f.ownerPricing.pricing.furnitureMovingPriceUnit='flat';f.customerInputs.furnitureMovingNeeded=true;delete f.customerInputs.furnitureMovingRoomCount;assert.equal(total(ready(f)),179000);});
for(const changes of [{carpetMeasurementMethod:'area_only',sqft:1000},{carpetMeasurementMethod:'rooms',sqft:1000}])test('Agent1 F20 conflicting carpet scope '+JSON.stringify(changes),()=>{const f=flooring('carpet',100);Object.assign(f.customerInputs,{carpetRooms:[{lengthFt:10,widthFt:10}],...changes});const q=review(f);assert.equal(q.submittedCustomerInputs.sqft,1000);assert.deepEqual(q.submittedCustomerInputs.carpetRooms,[{lengthFt:10,widthFt:10}]);});
test('Agent1 F22 notices attribute the internal spacing limit accurately',()=>{const notes=concreteLandscapeNotices('CONCRETE_PATIO_SLAB',{controlJointPricing:'excluded',controlJointSpacingFt:15});assert.match(notes.join(' '),/configured spacing limit of 10 feet/);assert.doesNotMatch(notes.join(' '),/NRMCA/);});
test('Agent1 F23 surface installed extras split tax and seasonal labor with no second markup',()=>{
 const f=paint();f.customerInputs.trimIncluded=false;delete f.customerInputs.trimLengthLF;delete f.customerInputs.trimSurfaceCondition;delete f.customerInputs.trimCoats;Object.assign(f.customerInputs,{surfaceOptionalItems:['doorSides'],paintDoorSides:1});
 const p=f.ownerPricing.pricing;p.surfaceExtraRates={doorSides:10000};p.installedLaborPercent={'surfaceExtraRates.doorSides':30};p.installedMaterialsPercent={'surfaceExtraRates.doorSides':40};f.businessDefaults.markupPercent=20;f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;
 const q=ready(f);assert.equal(line(q,'surfaceExtraRates.doorSides').amountCents,10000);assert.equal(q.lineItems.find(l=>l.name==='Peak season adjustment on installed prices').amountCents,300);
 // 10000 labor+1000 material+10000 installed+1000 regular peak+300 installed peak+2200 markup+400 tax=24900.
 assert.equal(total(q),24900);
 delete p.installedLaborPercent;assert.equal(total(ready(f)),24600);delete p.installedMaterialsPercent;review(f);
 const coverage=vNextServiceStatus(f.ownerPricing,f.businessDefaults).scopeCoverage.find(row=>row.key==='surface_extra_doorSides');assert.equal(coverage.configurationComplete,false);assert.ok(coverage.variants[0].missingFields.includes('installedMaterialsPercent.surfaceExtraRates.doorSides'));
 f.businessDefaults.taxMode='TAX_NONE';f.businessDefaults.taxPercent=0;ready(f);
});
test('Agent1 F24 actual multiplier meanings without bound changes',()=>{const d=CLASS2_DEFINITIONS.ROOFING_REPLACEMENT;assert.equal(d.complexityLaborMultiplier.unit,'multiplier');assert.equal(d.complexityLaborMultiplier.min,.1);assert.equal(d.additionalLayerRemovalFactor.unit,'multiplier of first-layer removal per additional layer');assert.equal(d.additionalLayerRemovalFactor.min,0);});
test('Agent1 F24 owner application metadata preserves the actual multiplier meanings',()=>{const fields=applicationMetadata().services.find(s=>s.serviceType==='ROOFING_REPLACEMENT').class2Fields;for(const name of ['complexityLaborMultiplier','additionalLayerRemovalFactor']){const field=fields.find(f=>f.name===name);assert.equal(field.unit,CLASS2_DEFINITIONS.ROOFING_REPLACEMENT[name].unit);assert.doesNotMatch(field.help,/decimal addition/);}});
