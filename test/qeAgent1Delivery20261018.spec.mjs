import './pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {paint,flooring,accessoryRoof,confirmAccessories,installedFloor} from '../verification/qe-agent1-core-accuracy-20261018/fixtures.mjs';
import {publish,bridge,date,fixture,quoteEmailFixture,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook} from '../server/priceBookService.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
import {FLOORING_ADDONS} from '../server/quote-engine-vnext/flooringPricing.js';
import {includedFixture} from './quoteEngineVNextFixtures.mjs';
import {carpet} from './quoteFlooring20261016Fixture.mjs';
import {fenceFixture} from './fenceLaneB20261016Fixture.mjs';
const cleanup=[],base=fixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);after(()=>{for(const fn of cleanup.reverse())fn();});
const privateFree=result=>assert.doesNotMatch(JSON.stringify(result),/"(?:lineItems|pricing|rateCents|priceMetadata|installedLaborPercent|installedMaterialsPercent)"/);
function saveConfigured(f){
 const clean=structuredClone(f),zero=clean.ownerPricing.zeroPricePolicy,ids=Object.entries(clean.ownerPricing.dependentLineState||{}).filter(([,r])=>r.confirmed).map(([id])=>id);
 delete clean.ownerPricing.zeroPricePolicy;delete clean.ownerPricing.dependentLineState;delete clean.ownerPricing.startingValueState;delete clean.ownerPricing.startingValueAdoptions;
 publish('synthetic-a',clean,{roofRuleMode:'new'});
 if(ids.length){const view=bridge.readApplicationBook('synthetic-a');view.services[0].dependentLineActions={reenteredIds:ids,confirmIds:ids};bridge.saveApplicationBook('synthetic-a',view,date);}
 if(zero||ids.length)bridge.approveApplicationService('synthetic-a',clean.ownerPricing.id,{revision:bridge.readApplicationBook('synthetic-a').revision,confirmConfiguration:true,confirmLegacySettings:true,...(zero?{zeroClassification:{freeCompleteService:zero.freeCompleteService,freeTiers:zero.freeTiers,includedPrices:zero.includedPrices}}:{})},date);
 const service=loadPricebook('synthetic-a').services[0];
 db.prepare("INSERT OR IGNORE INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run('synthetic-a',service.id,date.quoteInstant);
 return service;
}
async function channels(t,f,{expected,review=false}={}){
 const service=saveConfigured(f),h=quoteEmailFixture(t,{base});
 const body={requestId:randomUUID(),serviceId:service.id,serviceRequest:service.service,customerInputs:structuredClone(f.customerInputs),customerFeeSelections:{},additionalWork:[],contact:{email:'caller@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
 const prepared=bridge.prepareApplicationIntake('synthetic-a',body,date);
 if(review)assert.notEqual(prepared.status,'ready',JSON.stringify(prepared));else assert.equal(prepared.status,'ready',JSON.stringify(prepared));
 const response=submitQuote('synthetic-a',{...body,...(review?{reviewRequested:true}:{intakeConfirmation:prepared.confirmation})},{clock:()=>new Date(date.quoteInstant)});
 assert.equal(response.status,201,JSON.stringify(response));privateFree(response.response);
 if(review){assert.equal(response.response.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(response.response.midEstimate,undefined);}else{assert.equal(response.response.resultType,'INSTANT_ESTIMATE_READY');assert.equal(response.response.midEstimate,expected/100);}
 const match=await h.tool('matchService',{query:service.service});assert.equal(match.status,'matched',JSON.stringify(match));
 const customerInputs=structuredClone(f.customerInputs);delete customerInputs.confirmedFacts;
 const args={serviceHandle:match.serviceHandle,customerInputs,customerConfirmed:true,additionalWork:[],productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(k=>[k,true]))};
 let result=await h.tool('getQuote',args);
 if(result.questionContract?.fields.some(field=>field.confirmationToken)){args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));result=await h.tool('getQuote',args);}
 if(review){assert.notEqual(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,undefined);}else{assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,expected/100);}
 privateFree(result);assert.equal(h.sends(),0);
 const rows=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').all('synthetic-a',body.requestId);assert.equal(rows.length,1);assert.deepEqual(JSON.parse(rows[0].originalSubmissionJson).customerInputs,f.customerInputs);
 return {result,response,prepared,service,body};
}
test('Agent1 F3 saved widget and actual voice tool include trim prep in seasonal labor',async t=>{await channels(t,paint(),{expected:16610});});
for(const addon of FLOORING_ADDONS)test('Agent1 F4/F5 saved widget and voice safely disclose excluded '+addon.rate,async t=>{const f=flooring();f.customerInputs[addon.input]=2;if(addon.rate==='floorLevelingPerSqft')f.customerInputs.floorLevelingNeeded=true;if(addon.rate==='furnitureMovingPrice')f.ownerPricing.pricing.furnitureMovingPriceUnit='per_room';await channels(t,f,{expected:178000});});
test('Agent1 F4 saved included zero survives approval, widget, and voice',async t=>{const f=flooring();f.ownerPricing.pricing.baseboardReinstallPerLF=0;f.ownerPricing=includedFixture(f.ownerPricing,{baseboardReinstallPerLF:'laborPerSqft.tile'});f.customerInputs.baseboardReinstallLF=40;const out=await channels(t,f,{expected:178000});assert.deepEqual(out.response.response.options[0].skippedAddons,[]);});
for(const unit of ['square_feet','linear_feet'])test('Agent1 F11 saved '+unit+' widget and voice correct/wrong unit',async t=>{const f=confirmAccessories(accessoryRoof({iceWaterBarrierUnit:unit,[unit==='square_feet'?'iceWaterBarrierPerSqft':'iceWaterBarrierPerLF']:unit==='square_feet'?100:300}));const correct=unit==='square_feet'?'iceWaterBarrierSqft':'iceWaterBarrierLengthLF',wrong=unit==='square_feet'?'iceWaterBarrierLengthLF':'iceWaterBarrierSqft';f.customerInputs[correct]=100;await channels(t,f,{expected:unit==='square_feet'?49100:69100});delete f.customerInputs[correct];f.customerInputs[wrong]=100;const out=await channels(t,f,{review:true});assert.ok(out.prepared.followUps.some(text=>text.includes(unit==='square_feet'?'square feet':'linear feet')),JSON.stringify(out.prepared));assert.ok(out.result.followUps?.some(text=>text.includes(unit==='square_feet'?'square feet':'linear feet')),JSON.stringify(out.result));});
for(const rate of ['transitionPriceEach','floorLevelingPerSqft'])test('Agent1 F15 saved '+rate+' shares retained in widget and voice',async t=>{const f=installedFloor(rate);f.ownerPricing.peakMonths=[1,10];f.ownerPricing.peakSurchargePercent=10;f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;await channels(t,f,{expected:195300});});
for(const [needed,rooms] of [[false,3],[true,0]])test('Agent1 F17 saved furniture contradiction '+needed+'/'+rooms,async t=>{const f=flooring();Object.assign(f.ownerPricing.pricing,{furnitureMovingPrice:1000,furnitureMovingPriceUnit:'per_room'});Object.assign(f.customerInputs,{furnitureMovingNeeded:needed,furnitureMovingRoomCount:rooms});await channels(t,f,{review:true});});
test('Agent1 F20 contradictory carpet area retains original widget scope and cannot quote through voice',async t=>{const f=carpet([{lengthFt:10,widthFt:10}]);Object.assign(f.customerInputs,{carpetMeasurementMethod:'area_only',sqft:1000});await channels(t,f,{review:true});});
test('Agent1 F10 impossible closed fence is refused by saved widget and voice',async t=>{const f=fenceFixture();for(const key of ['linearFeet','gates','cornerCount'])delete f.customerInputs[key];f.customerInputs.fenceRuns=[{closed:true,sections:[{lengthLF:100}]}];await channels(t,f,{review:true});});
test('Agent1 F2 below-one selection goes to review through saved widget and voice while service stays live',async t=>{const f=accessoryRoof();f.ownerPricing.pricing.storyMultiplier[1]=.5;await channels(t,f,{review:true});});
test('Agent1 F23 saved surface installed share reaches tax and seasonal paths',async t=>{const f=paint();Object.assign(f.customerInputs,{trimIncluded:false,surfaceOptionalItems:['doorSides'],paintDoorSides:1});for(const k of ['trimLengthLF','trimCoats','trimSurfaceCondition'])delete f.customerInputs[k];Object.assign(f.ownerPricing.pricing,{surfaceExtraRates:{doorSides:10000},installedLaborPercent:{'surfaceExtraRates.doorSides':30},installedMaterialsPercent:{'surfaceExtraRates.doorSides':40}});Object.assign(f.businessDefaults,{markupPercent:20,taxMode:'TAX_MATERIALS',taxPercent:10});await channels(t,f,{expected:24900});});

test('Agent1 F12 saved asphalt availability ignores unconfirmed metal',async t=>{const f=accessoryRoof({materialCostPerSquare:{asphalt_shingle:10000,metal:20000},laborPerSquare:{asphalt_shingle:20000,metal:30000},underlaymentPerSquare:{asphalt_shingle:100,metal:100},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price',metal:'installed_area_sell_price'},valleyPerLF:100});confirmAccessories(f,['roofing_flashing_vents.asphalt_shingle']);f.customerInputs.valleyLengthLF=10;await channels(t,f,{expected:40100});});
test('Agent1 F13 saved base-only confirmation isolates premium until explicit tier re-entry',async t=>{const f=accessoryRoof({materialCostPerSquare:{asphalt_shingle:10000},wasteFactorByComplexity:{simple:0,moderate:0,complex:0},valleyPerLF:1000});f.ownerPricing.tiers=[{name:'Base',overrides:{}},{name:'Premium',overrides:{materialCostPerSquare:{asphalt_shingle:40000}}}];confirmAccessories(f,['roofing_flashing_vents.asphalt_shingle']);f.customerInputs.valleyLengthLF=20;const a=await channels(t,f,{expected:58100});assert.deepEqual(a.response.response.options.map(o=>o.tierName),['Base']);assert.deepEqual(a.result.options.map(o=>o.tierName),['Base']);confirmAccessories(f);const b=await channels(t,f,{expected:58100});assert.deepEqual(b.response.response.options.map(o=>o.midEstimate),[581,881]);assert.deepEqual(b.result.options.map(o=>o.midEstimate),[581,881]);assert.equal(loadPricebook('synthetic-a').services[0].pricing.materialCostPerSquare.asphalt_shingle,10000);assert.equal(loadPricebook('synthetic-a').services[0].tiers[1].overrides.materialCostPerSquare.asphalt_shingle,40000);});
