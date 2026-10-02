import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {mowing} from '../verification/engine-independent/fixtures.mjs';
import {validateInterviewValue} from '../server/src/priceBookAI.js';
import {resolveJurisdiction} from '../server/taxJurisdiction.js';

const store=fs.mkdtempSync(path.join(os.tmpdir(),'quote-server-correctness-'));
process.env.PRICEBOOK_PATH=store;
process.env.JWT_SECRET='[SYNTHETIC] server-correctness-signing-key';
const bridge=await import('../server/src/quoteDoneBridge.js');
const {savePricebook,loadPricebook}=await import('../server/priceBookService.js');
test.after(()=>fs.rmSync(store,{recursive:true,force:true}));
const exposed=()=>measuredScopeCases().find(row=>row.id==='exposed-itemized').input;
const ready=input=>{const q=generateQuoteVNext(input);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;};
const finishLine=q=>q.lineItems.find(line=>line.calculation?.ratePath==='scopeRates.exposed_aggregate_labor');

// Independent expectations written before the fix: 200 sqft; base labor 120000c;
// finishing labor 30000c; other lines total 273889c. Access changes both labor
// components only. Material 48889c + formwork 150000c + prep 35000c + finish material 40000c.
for(const type of ['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY'])for(const method of ['exact','measured_outline'])for(const [access,labor,total] of [['easy',30000,423889],['moderate',33000,438889],['difficult',37500,461389]])
test('F01 '+type+' '+method+' '+access+' multiplies configured finishing labor exactly once',()=>{
 const f=exposed();f.serviceType=type;f.ownerPricing.serviceType=type;f.ownerPricing.origin.serviceType=type;
 f.customerInputs.accessDifficulty=access;
 if(method!=='exact'){
  delete f.customerInputs.length;delete f.customerInputs.width;
  Object.assign(f.customerInputs,{dimensionMethod:method,outlinePoints:[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:0,y:10},{x:0,y:0}]});
 }
 const before=structuredClone(f),q=ready(f),line=finishLine(q);
 assert.equal(line.amountCents,labor);assert.equal(q.midEstimate,total/100);
 assert.equal(line.calculation.multipliers.find(m=>m.path==='accessMultiplier.'+access)?.value,f.ownerPricing.pricing.accessMultiplier[access]);
 assert.equal(q.lineItems.find(l=>l.name==='Ready-mix concrete').amountCents,48889);
 assert.equal(q.lineItems.find(l=>l.name==='Formwork').amountCents,150000);
 assert.equal(q.lineItems.find(l=>l.calculation?.ratePath==='scopeRates.exposed_aggregate_material').amountCents,40000);
 assert.deepEqual(f,before);
 assert.equal(sanitizeForCustomerVNext(q).lineItems,undefined);
});
for(const type of ['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY'])for(const access of ['easy','moderate','difficult'])test('F01 control '+type+' '+access+' area/perimeter alone still requires geometry review',()=>{
 const f=exposed();f.serviceType=type;f.ownerPricing.serviceType=type;f.ownerPricing.origin.serviceType=type;
 delete f.customerInputs.length;delete f.customerInputs.width;
 Object.assign(f.customerInputs,{dimensionMethod:'measured_area_perimeter',areaSqft:200,perimeterLF:60,accessDifficulty:access});
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,/geometry/);assert.equal(q.midEstimate,undefined);
});
test('F01 configured labor keeps one final cent rounding and the owner access override',()=>{
 const f=exposed();Object.assign(f.customerInputs,{length:10.1,width:2.5,accessDifficulty:'difficult'});
 f.ownerPricing.pricing.scopeRates.exposed_aggregate_labor=150.5;
 // 25.25 *150.5 *1.25 =4750.15625 cents ->4750 cents, without a rounded intermediate.
 assert.equal(finishLine(ready(f)).amountCents,4750);
 f.ownerPricing.pricing.accessMultiplier.difficult=1.2;
 // 25.25 *150.5 *1.2 =4560.15 ->4560 cents.
 assert.equal(finishLine(ready(f)).amountCents,4560);
});
test('F01 tiers and markup/tax/minimum consume the corrected labor amount',()=>{
 const f=exposed();f.customerInputs.accessDifficulty='difficult';
 f.ownerPricing.tiers=[{name:'Base',overrides:{}},{name:'Plus',overrides:{scopeRates:{exposed_aggregate_labor:225}}}];
 assert.deepEqual(ready(f).options.map(o=>o.midEstimate),[4613.89,4801.39]);
 f.ownerPricing.tiers=[];Object.assign(f.businessDefaults,{markupPercent:10,taxMode:'TAX_ALL',taxPercent:15});
 // round(461389 *10%)=46139; subtotal=507528; round(507528 *15%)=76129.
 assert.equal(ready(f).midEstimate,5836.57);
 f.businessDefaults.taxMode='TAX_MATERIALS';f.ownerPricing.taxabilityByCategory.material=true;
 // Material 238889 + allocated markup 23889 =262778; tax=39417.
 // The corrected labor changes the selling total, not the material tax base.
 assert.equal(ready(f).midEstimate,5469.45);
 f.businessDefaults.minimumJobPrice=600000;
 assert.equal(ready(f).midEstimate,6394.17);
 f.businessDefaults.taxMode='TAX_ALL';
 assert.equal(ready(f).midEstimate,6900);
});
test('F01 installed finish pricing remains unchanged pending its separate rate-basis decision',()=>{
 const f=measuredScopeCases().find(row=>row.id==='exposed-installed').input;f.customerInputs.accessDifficulty='difficult';
 assert.equal(ready(f).midEstimate,4538.89);
});

function savedMowing({fee='travel',mode='owner_selected',selection,omit=false}={}){
 const f=mowing(),ownerId='synthetic-'+crypto.randomUUID();delete f.ownerPricing.origin;
 f.ownerPricing.feeRules[fee]=mode;f.businessDefaults[{travel:'travelFee',disposal:'disposalFee',permit:'permitFee',overhead:'overheadFixed'}[fee]]=5000;
 if(!omit)f.ownerPricing.ownerFeeSelections=selection;
 savePricebook(ownerId,{ownerId,services:[f.ownerPricing],defaults:f.businessDefaults});
 let book=loadPricebook(ownerId);
 bridge.approveApplicationService(ownerId,f.ownerPricing.id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true});
 book=loadPricebook(ownerId);
 return {f,ownerId,book,raw:book.services[0]};
}
for(const fee of ['travel','disposal','permit','overhead'])for(const draftChoice of [true,false])test('F02 '+fee+' preview uses draft '+draftChoice+' rather than the saved opposite choice',()=>{
 const {f,ownerId,book,raw}=savedMowing({fee,selection:{[fee]:!draftChoice}}),draft=bridge.readApplicationBook(ownerId);
 draft.services[0].ownerFeeSelections[fee]=draftChoice;
 const q=bridge.previewApplicationQuote(ownerId,{revision:draft.revision,serviceId:raw.id,service:draft.services[0],defaults:draft.defaults,customerInputs:f.customerInputs});
 assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,draftChoice?150:100);assert.equal(q.customerEligible,false);
 assert.deepEqual(loadPricebook(ownerId),book);
 bridge.saveApplicationBook(ownerId,draft);let next=loadPricebook(ownerId);
 bridge.approveApplicationService(ownerId,raw.id,{revision:bridge.bookRevision(next),confirmConfiguration:true,confirmLegacySettings:true});next=loadPricebook(ownerId);
 const customer=bridge.calculateApplicationQuote(next,next.services[0],{customerInputs:f.customerInputs,contact:{email:'synthetic@example.invalid'}},{ownerId}).customerResult;
 assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY');assert.equal(customer.midEstimate,q.midEstimate);
});
for(const fee of ['travel','disposal','permit','overhead'])test('F03 '+fee+' requires a saved owner decision and accepts explicit false',()=>{
 const missing=savedMowing({fee,omit:true}),status=bridge.applicationStatus(missing.raw,missing.book);
 assert.equal(status.status,'NEEDS PRICING');assert.ok(status.invalidOwnerFields.includes('feeSelections.owner.'+fee));
 const refused=bridge.calculateApplicationQuote(missing.book,missing.raw,{customerInputs:missing.f.customerInputs,contact:{email:'synthetic@example.invalid'}},{ownerId:missing.ownerId});
 assert.equal(refused.customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(refused.customerResult.midEstimate,undefined);
 for(const choice of [true,false]){const saved=savedMowing({fee,selection:{[fee]:choice}});assert.equal(bridge.applicationStatus(saved.raw,saved.book).status,'QUOTING LIVE');}
});
for(const selection of [{travel:'true'},null,[],{unexpected:true}])test('F03 malformed owner selection '+JSON.stringify(selection)+' cannot claim live readiness',()=>{
 const saved=savedMowing({selection});assert.equal(bridge.applicationStatus(saved.raw,saved.book).status,'NEEDS PRICING');
});
test('F03 stale choices are diagnosed, while customer choices remain per request',()=>{
 const stale=savedMowing({mode:'not_applicable',selection:{travel:false}});
 const status=bridge.applicationStatus(stale.raw,stale.book);assert.equal(status.status,'NEEDS PRICING');assert.ok(status.invalidOwnerFields.includes('feeSelections.owner.travel'));
 const customer=savedMowing({mode:'customer_selected',omit:true});assert.equal(bridge.applicationStatus(customer.raw,customer.book).status,'QUOTING LIVE');
 for(const choice of [true,false]){const q=bridge.calculateApplicationQuote(customer.book,customer.raw,{customerInputs:customer.f.customerInputs,customerFeeSelections:{travel:choice},contact:{email:'synthetic@example.invalid'}},{ownerId:customer.ownerId}).customerResult;assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,choice?150:100);}
});

const cubes=[['ROOFING_REPAIR','repairHours','asphalt_shingle','patch'],['ROOFING_REPAIR','repairMaterialAllowance','asphalt_shingle','patch'],['FLAT_ROOF_REPAIR','patchRepairHours','epdm','seam_patch'],['FLAT_ROOF_REPAIR','patchMaterialAllowance','epdm','seam_patch'],['SIDING_REPAIR','repairHours','vinyl','crack'],['SIDING_REPAIR','materialAllowance','vinyl','crack']];
for(const [type,field,material,repair] of cubes)test('F14 '+type+'.'+field+' accepts the complete current cube and rejects malformed depths',()=>{
 const sizes={small:1,medium:2,large:3},valid={[material]:{[repair]:sizes}};
 assert.deepEqual(validateInterviewValue(type,field,valid),valid);
 for(const invalid of [{[repair]:sizes},{[repair]:1},{[material]:{[repair]:{small:1,medium:2}}},{[material]:{[repair]:{...sizes,extra:4}}},{[material]:{[repair]:{small:{nested:1},medium:2,large:3}}},{[material]:{}},[],null])assert.throws(()=>validateInterviewValue(type,field,invalid),e=>e.statusCode===422,JSON.stringify(invalid));
});
test('F14 current typed/one-level trees reject extra nesting; current debris maps require complete typed rows',()=>{
 const basis={asphalt_shingle:'installed_area_sell_price'};assert.deepEqual(validateInterviewValue('ROOFING_REPLACEMENT','underlaymentPriceBasis',basis),basis);
 for(const v of [{asphalt_shingle:{nested:'cost'}},{asphalt_shingle:true}])assert.throws(()=>validateInterviewValue('ROOFING_REPLACEMENT','underlaymentPriceBasis',v),{statusCode:422});
 assert.deepEqual(validateInterviewValue('ROOFING_REPLACEMENT','laborPerSquare',{asphalt_shingle:123.45}),{asphalt_shingle:123.45});
 assert.throws(()=>validateInterviewValue('ROOFING_REPLACEMENT','laborPerSquare',{asphalt_shingle:{nested:1}}),{statusCode:422});
 const debris={light:{laborMultiplier:1,disposalFlat:0},moderate:{laborMultiplier:1.5,disposalFlat:20},heavy:{laborMultiplier:2,disposalFlat:40}};assert.deepEqual(validateInterviewValue('LANDSCAPING_CLEANUP','debrisPricing',debris),debris);
 for(const v of [{light:1},{light:{laborMultiplier:1,disposalFlat:0}},{light:{laborMultiplier:1}},{light:{laborMultiplier:1,disposalFlat:{nested:2}}}])assert.throws(()=>validateInterviewValue('LANDSCAPING_CLEANUP','debrisPricing',v),{statusCode:422});
 assert.equal(validateInterviewValue('LANDSCAPING_MOWING','mowingBaseRatePerSqft',.005),.005);
});
test('F27 Alaska cannot imply a confirmed zero-tax jurisdiction; existing other prefills remain unchanged',()=>{
 const ak=resolveJurisdiction('US','AK');assert.equal(ak.needsOwnerConfirmation,true);assert.equal(ak.taxMode,null);assert.equal(ak.taxPercent,null);
 for(const region of ['OR','MT','NH','DE'])assert.deepEqual(resolveJurisdiction('US',region),{taxMode:'TAX_NONE',taxPercent:0,locked:false,needsOwnerConfirmation:false,note:null});
 assert.equal(resolveJurisdiction('CA','NS').taxPercent,14);assert.equal(resolveJurisdiction('CA','NS').needsOwnerConfirmation,false);
});
