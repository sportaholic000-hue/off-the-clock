import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const store=fs.mkdtempSync(path.join(os.tmpdir(),'quote-reaudit-'));
process.env.PRICEBOOK_PATH=store;
process.env.JWT_SECRET='[SYNTHETIC] quote-reaudit-regression';
const bridge=await import('../server/src/quoteDoneBridge.js');
const {savePricebook,loadPricebook}=await import('../server/priceBookService.js');
const {mowing,concrete,custom}=await import('../verification/engine-independent/fixtures.mjs');
const {offeringFixture}=await import('./configuredOfferingsFixtures.mjs');
const {includedFixture}=await import('./quoteEngineVNextFixtures.mjs');
const {measuredScopeCases}=await import('./measuredScopeFixtures.mjs');
const {generateQuoteVNext,approveVNextValues}=await import('../server/quote-engine-vnext/index.js');
const {aiConfirmationFieldsVNext,hasCurrentApprovalVNext}=await import('../server/quote-engine-vnext/contracts.js');
const {validateInterviewValue,validateStarterOutput,starterFields,suggestStarterBook}=await import('../server/src/priceBookAI.js');
const {parseOwnerNumericInput}=await import('../server/priceBookMoney.js');
const {validateStructuredValue,parseInterviewScalar,interviewDefinition}=await import('../client/src/interviewStructuredValue.js');
const {editBusinessDefault,addPriceTier,renameTierOverride}=await import('../client/src/pricebookEditing.js');
const meta=(type,field)=>({...bridge.applicationMetadata().services.find(s=>s.serviceType===type).fields.find(d=>d.field===field),serviceType:type});
const approve=ownerId=>{const b=loadPricebook(ownerId),s=bridge.applicationStatus(b.services[0],b);return bridge.approveApplicationService(ownerId,b.services[0].id,{revision:bridge.bookRevision(b),confirmConfiguration:true,confirmLegacySettings:true,fields:s.confirmationFields});};
function saved(f,source='MANUAL'){
 const ownerId='[SYNTHETIC]-'+crypto.randomUUID(),raw=structuredClone(f.ownerPricing);raw.source=source;delete raw.origin;
 savePricebook(ownerId,{services:[raw],defaults:{currency:'CAD',...f.businessDefaults}});approve(ownerId);return ownerId;
}
for(const source of ['AI_SUGGESTED','AI_INTERVIEW'])for(const field of ['baggingSurchargePercent','tiers'])test('R01 '+source+' deletion of '+field+' recovers only after explicit approval',()=>{
 const f=mowing();if(field==='tiers')f.ownerPricing.tiers=[{name:'Basic',overrides:{}}];else f.ownerPricing.pricing[field]=10;
 const id=saved(f,source),draft=bridge.readApplicationBook(id);
 if(field==='tiers')draft.services[0].tiers=[];else delete draft.services[0].pricing[field];
 bridge.saveApplicationBook(id,draft);let book=loadPricebook(id);
 assert.equal(bridge.applicationStatus(book.services[0],book).status,'NEEDS PRICING');
 assert.throws(()=>bridge.approveApplicationService(id,book.services[0].id,{revision:draft.revision,confirmConfiguration:true}),/changed/);
 approve(id);book=loadPricebook(id);
 assert.equal(bridge.applicationStatus(book.services[0],book).status,'QUOTING LIVE');
 for(const key of ['approvedValues','confirmedFields'])assert.equal(Object.hasOwn(book.services[0][key],field),false);
 assert.equal(bridge.previewApplicationQuote(id,{revision:bridge.bookRevision(book),serviceId:book.services[0].id,customerInputs:f.customerInputs}).midEstimate,100);
});
test('R01 partial approval preserves current receipts, never approves other edits or another owner',()=>{
 const f=mowing(),s=f.ownerPricing;s.source='AI_INTERVIEW';s.origin.source=s.source;
 const operation={ownerId:s.origin.ownerId,operationId:'[SYNTHETIC]',approvedAt:'2026-10-02T00:00:00Z',fields:aiConfirmationFieldsVNext(s,s.pricing)};
 let approved=approveVNextValues(s,operation);const old=approved.approvedValues.frequencyMultipliers;
 approved.pricing.mowingBaseRatePerSqft=3;approved.confirmedFields.deleted=true;approved.approvedValues.deleted={};
 approved=approveVNextValues(approved,{...operation,fields:['minimumServiceCharge']});
 assert.deepEqual(approved.approvedValues.frequencyMultipliers,old);
 assert.equal(hasCurrentApprovalVNext(approved,approved.pricing,'mowingBaseRatePerSqft'),false);
 assert.equal(Object.hasOwn(approved.approvedValues,'deleted'),false);
 assert.throws(()=>approveVNextValues(approved,{...operation,ownerId:'wrong-owner'}),/owner/);
});
function includedFence(){const f=offeringFixture('FENCING_INSTALL','itemized');f.ownerPricing.pricing.offeringRates.postMaterialEach=0;f.ownerPricing=includedFixture(f.ownerPricing,{'offeringRates.postMaterialEach':'offeringRates.fenceMaterialPerLF'});return f;}
test('R02 offering inclusion quotes hand-calculated 388000 cents',()=>{
 const q=generateQuoteVNext(includedFence());assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q.ownerDiagnostics));assert.equal(q.midEstimate,3880);
});
test('R02 stair inclusion uses whole-cent item prices: 225505 cents',()=>{
 const f=measuredScopeCases().find(r=>r.id==='stairs-itemized').input;
 f.ownerPricing.pricing.scopeRates.stairs_material=0;f.ownerPricing.pricing.scopeRates.stairs_underlayment=1001;
 f.ownerPricing=includedFixture(f.ownerPricing,{'scopeRates.stairs_material':'scopeRates.stairs_underlayment'});
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q.ownerDiagnostics));assert.equal(q.midEstimate,2255.05);
});
for(const variant of ['unknown','inactive','zero','wrong-category'])test('R02 inclusion still blocks '+variant,()=>{
 const f=includedFence(),p=f.ownerPricing.pricing,m=f.ownerPricing.zeroPricePolicy.includedPrices;
 if(variant==='unknown'){p.offeringRates.fake=100;m['offeringRates.postMaterialEach']='offeringRates.fake';}
 if(variant==='inactive'){p.offeringRates.installedFencePerLF=100;m['offeringRates.postMaterialEach']='offeringRates.installedFencePerLF';}
 if(variant==='zero')p.offeringRates.fenceMaterialPerLF=0;
 if(variant==='wrong-category')m['offeringRates.postMaterialEach']='offeringRates.fenceLaborPerLF';
 assert.notEqual(generateQuoteVNext(f).resultType,'INSTANT_ESTIMATE_READY');
});
test('R03 tax none clears hidden percentage, persists and quotes 10000 cents',()=>{
 const f=mowing();Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:15});const id=saved(f),draft=bridge.readApplicationBook(id);
 draft.defaults=editBusinessDefault(draft.defaults,'taxMode','TAX_NONE');assert.equal(draft.defaults.taxPercent,0);
 bridge.saveApplicationBook(id,draft);approve(id);const b=loadPricebook(id);
 assert.equal(bridge.applicationStatus(b.services[0],b).status,'QUOTING LIVE');assert.equal(bridge.previewApplicationQuote(id,{revision:bridge.bookRevision(b),serviceId:b.services[0].id,customerInputs:f.customerInputs}).midEstimate,100);
 assert.equal(editBusinessDefault(draft.defaults,'taxMode','TAX_ALL').taxPercent,0);
});
for(const [type,field,value] of [['CONCRETE_PATIO_SLAB','laborPerSqft',1.005],['INTERIOR_PAINTING','laborPerWallSqftPerCoat',1.005],['SIDING_REPLACEMENT','laborPerSqft',{vinyl:1.005}],['FLOORING_INSTALL','materialPerSqft',{tile:1.005}]])test('R04/R08 '+type+'.'+field+' accepts measured fractional-cent precision at each boundary',()=>{
 const def=meta(type,field);assert.equal(def.wholeCents,undefined);
 if(def.type==='number')assert.equal(parseInterviewScalar(String(value),def),value);else assert.equal(validateStructuredValue(value,def.shapedKeys,def.label,def),null);
 assert.deepEqual(validateInterviewValue(type,field,value),value);
 const dollars={defaults:{},services:[{serviceType:type,pricing:{[field]:value}}]};assert.deepEqual(bridge.convertApplicationBook(bridge.convertApplicationBook(dollars,'toCents'),'toDollars'),dollars);
});
test('R04 failed exact-money save leaves prior persisted book unchanged',()=>{
 const id=saved(concrete()),before=loadPricebook(id),draft=bridge.readApplicationBook(id);draft.services[0].pricing.minimumJob=1.005;
 assert.throws(()=>bridge.saveApplicationBook(id,draft),/whole-cent/);assert.deepEqual(loadPricebook(id),before);
});
for(const [type,field,p] of [['LANDSCAPING_MOWING','mowingBaseRatePerSqft',{}],['CUSTOM','price',{unit:'per_sqft'}],['CUSTOM','low',{unit:'per_hour'}],['CUSTOM','high',{unit:'per_LF'}]])test('R04 supported fractional '+type+'.'+field+' remains exact',()=>{
 const definition=interviewDefinition(meta(type,field),p);assert.equal(parseInterviewScalar('0.005',definition),0.005);assert.equal(validateInterviewValue(type,field,0.005,p),0.005);
 const book=bridge.convertApplicationBook({defaults:{},services:[{serviceType:type,pricing:{...p,[field]:0.005}}]},'toCents');assert.equal(book.services[0].pricing[field],0.5);assert.equal(bridge.convertApplicationBook(book,'toDollars').services[0].pricing[field],0.005);
});
for(const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT','SIDING_REPLACEMENT'])test('R05 '+type+' closed domains reject unknown keys but allow offered subset',()=>{
 const def=meta(type,'laborPerSqft'),key=type.startsWith('FLOORING')?'tile':'vinyl';
 assert.equal(validateStructuredValue({[key]:3},def.shapedKeys,def.label,def),null);
 assert.deepEqual(validateInterviewValue(type,'laborPerSqft',{[key]:3}),{[key]:3});
 assert.match(validateStructuredValue({unobtainium:3},def.shapedKeys,def.label,def),/unsupported/);
 assert.throws(()=>validateInterviewValue(type,'laborPerSqft',{unobtainium:3}),/unsupported/);
 assert.throws(()=>validateStarterOutput([{service:'[SYNTHETIC]',serviceType:type,fields:{laborPerSqft:{unobtainium:3}}}],[type]),/unsupported/);
});
test('R05 planting metadata, starter and interview accept small/medium/large and reject mixed',()=>{
 const type='LANDSCAPING_PLANTING',fields={plantingLaborPerPlant:{small:10,medium:20,large:30},plantMaterialAllowance:{small:5,medium:10,large:15}};
 assert.equal(validateStarterOutput([{service:'[SYNTHETIC]',serviceType:type,fields}],[type]).length,1);
 for(const field of Object.keys(fields)){const def=meta(type,field);assert.deepEqual(def.shapedKeys.keys,['small','medium','large']);assert.equal(validateStructuredValue(fields[field],def.shapedKeys,def.label,def),null);assert.throws(()=>validateInterviewValue(type,field,{...fields[field],mixed:20}),/unsupported/);assert.throws(()=>validateInterviewValue(type,field,{small:10}),/needed/);}
});
test('R05 repair cubes retain open middle keys, closed siding types and size leaves',()=>{
 const value={vinyl:{crack:{small:1,medium:2,large:3}}};assert.deepEqual(validateInterviewValue('SIDING_REPAIR','repairHours',value),value);
 assert.deepEqual(validateInterviewValue('SIDING_REPAIR','repairHours',{vinyl:{'Crack repair':{small:1,medium:2,large:3}}}),{vinyl:{crack_repair:{small:1,medium:2,large:3}}});
 for(const bad of [{unobtainium:value.vinyl},{vinyl:{crack:{small:1,medium:2}}},{vinyl:{'3 repair':{small:1,medium:2,large:3}}}])assert.throws(()=>validateInterviewValue('SIDING_REPAIR','repairHours',bad));
});
const debris={light:{laborMultiplier:1,disposalFlat:0},moderate:{laborMultiplier:1.5,disposalFlat:20},heavy:{laborMultiplier:2,disposalFlat:40}};
test('R06 cleanup accepts zero disposal through readback and server',()=>{
 const def=meta('LANDSCAPING_CLEANUP','debrisPricing');assert.equal(validateStructuredValue(debris,def.shapedKeys,def.label,def),null);assert.deepEqual(validateInterviewValue('LANDSCAPING_CLEANUP','debrisPricing',debris),debris);
 const bad=structuredClone(debris);bad.light.laborMultiplier=0;assert.match(validateStructuredValue(bad,def.shapedKeys,def.label,def),/more than zero/);assert.throws(()=>validateInterviewValue('LANDSCAPING_CLEANUP','debrisPricing',bad),/more than zero/);
});
test('R08 mixed cleanup leaves reject fractional fixed disposal in AI and readback',()=>{
 const def=meta('LANDSCAPING_CLEANUP','debrisPricing'),bad=structuredClone(debris);bad.light.disposalFlat=0.005;
 assert.throws(()=>validateInterviewValue('LANDSCAPING_CLEANUP','debrisPricing',bad),/whole-cent/);assert.match(validateStructuredValue(bad,def.shapedKeys,def.label,def),/whole-cent/);
});
test('R07 custom interview re-resolves from saved unit and rejects flat/unknown fractional amounts',()=>{
 const def=meta('CUSTOM','price');assert.equal(parseInterviewScalar('0.005',interviewDefinition(def,{unit:'per_sqft'})),0.005);
 for(const pricing of [{unit:'flat'},{}])assert.throws(()=>parseInterviewScalar('0.005',interviewDefinition(def,pricing)),/whole-cent|Choose/);
 const f=custom();Object.assign(f.ownerPricing.pricing,{unit:'per_sqft',price:0.5});Object.assign(f.customerInputs,{unit:'per_sqft',areaSqft:1000});assert.equal(generateQuoteVNext(f).midEstimate,5);
});
test('R09 occupied override cannot overwrite either value; valid rename is lossless',()=>{
 const values={laborPerWallSqftPerCoat:2,materialPerWallSqftPerCoat:0.75};assert.deepEqual(renameTierOverride(values,'laborPerWallSqftPerCoat','materialPerWallSqftPerCoat'),values);
 assert.deepEqual(renameTierOverride(values,'laborPerWallSqftPerCoat','ceilingLaborPerSqftPerCoat'),{ceilingLaborPerSqftPerCoat:2,materialPerWallSqftPerCoat:0.75});
});
test('R09 delete first tier then add uses an unused name without modifying prices',()=>{
 const remaining=[{name:'Better',overrides:{price:20}},{name:'Best',overrides:{price:30}}],next=addPriceTier(remaining);
 assert.deepEqual(next,[...remaining,{name:'Good',overrides:{}}]);assert.equal(new Set(next.map(t=>t.name)).size,3);assert.deepEqual(addPriceTier(next),next);
});

test('R09 generated names use the engine case-insensitive name comparison',()=>{
 assert.equal(addPriceTier([{name:'good',overrides:{}},{name:'BETTER',overrides:{}}])[2].name,'Best');
});
test('R02 fractional configured offering coverage preserves 388055 cents',()=>{
 const f=includedFence();f.ownerPricing.pricing.offeringRates.fenceMaterialPerLF=2000.5;
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,3880.55);
});
test('R02 configured gate inclusion keeps camel-case contract keys and sell-price classification',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed');f.ownerPricing.pricing.offeringRates.gate_walk=0;
 f.ownerPricing=includedFixture(f.ownerPricing,{'offeringRates.gate_walk':'offeringRates.installedFencePerLF'});
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q.ownerDiagnostics));assert.equal(q.midEstimate,4000);
});
test('R05/R06 starter prompt uses current planting keys and typed cleanup leaves',async()=>{
 const types=['LANDSCAPING_PLANTING','LANDSCAPING_CLEANUP'];let prompt;
 const output=[{service:'[SYNTHETIC] Planting',serviceType:types[0],fields:{plantingLaborPerPlant:{small:10,medium:20,large:30}}},{service:'[SYNTHETIC] Cleanup',serviceType:types[1],fields:{debrisPricing:debris}}];
 const result=await suggestStarterBook({industry:'[SYNTHETIC]',serviceTypes:types,country:'CA',region:'NS'},{env:{GEMINI_TEXT_MODEL:'synthetic-text-model',GEMINI_API_KEY:'[SYNTHETIC]'},fetchImpl:async(url,options)=>{const body=JSON.parse(options.body);prompt=JSON.parse(body.contents[0].parts[0].text);return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(output)}]}}]})};}});
 assert.equal(result.length,2);const planting=prompt.catalog[0].shape.fields.plantingLaborPerPlant,cleanup=prompt.catalog[1].shape.fields.debrisPricing;
 assert.deepEqual(Object.keys(planting),['small','medium','large']);assert.match(cleanup.light.disposalFlat,/whole-cent/);assert.equal(cleanup.light.laborMultiplier,'positive number');
 assert.ok(starterFields(types[1]).some(d=>d.field==='debrisPricing'));
});
test.after(()=>fs.rmSync(store,{recursive:true,force:true}));
