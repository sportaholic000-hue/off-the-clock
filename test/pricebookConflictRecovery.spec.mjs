import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {isRevisionConflict, pricebookPayload, reconcilePricebook, reconciliationErrors, withClientServiceIds, RECEIPT_FIELDS} from '../client/src/pricebookConflict.js';
import {editorServiceKey, mergeSavedApproval} from '../client/src/pricebookEditing.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';

// Hand-written expectations before execution: initial fixed prices $100 and
// $200 store as 10,000 and 20,000 cents. Independent edits to $110 and $220
// store as 11,000 and 22,000 cents. Merging must not sum or alter these prices.
// A restored $150 service stores as 15,000 cents with a NEW server identity.
// For a range, base $100–$300, local low $200 and remote high $150 are
// individually valid edits; their combined $200–$150 range is invalid.
const ids = ['7bb0da01-b02f-4d03-9e35-dfbe1b14d103','644ccada-2460-41f6-a709-b066e085fe33'];
const copy = structuredClone;
const service = (id, price) => ({id,serviceType:'CUSTOM',service:'[SYNTHETIC] '+price,source:'MANUAL',active:false,pricing:{price},tiers:[]});
const book = () => ({revision:'base',defaults:{markupPercent:0,markupMode:'markup',taxMode:'TAX_NONE'},services:[service(ids[0],100),service(ids[1],200)]});
function scenario() {const base=book(), local=copy(base), remote=copy(base);remote.revision='remote';return {base,local,remote};}

test('independent service edits merge by UUID, preserve the remote order, and leave inputs untouched', () => {
  const {base,local,remote}=scenario();local.services[1].pricing.price=220;remote.services[0].pricing.price=110;remote.services.reverse();
  const before=copy([base,local,remote]), result=reconcilePricebook(base,local,remote);
  assert.equal(result.unresolved.length,0);assert.deepEqual(result.draft.services.map(s=>s.pricing.price),[220,110]);assert.equal(result.draft.revision,'remote');assert.deepEqual([base,local,remote],before);
});
test('independent nested rate/default edits merge, including zero, false, null and field removal', () => {
  const {base,local,remote}=scenario();base.defaults.optional=1;local.defaults.optional=1;remote.defaults.optional=1;
  local.defaults.optional=0;local.defaults.customFlag=false;remote.defaults.taxPercent=null;
  local.services[0].pricing.minimumJob=0;remote.services[0].pricing.unit='flat';delete local.services[1].service;
  const {draft,unresolved}=reconcilePricebook(base,local,remote);assert.equal(unresolved.length,0);assert.equal(draft.defaults.optional,0);assert.equal(draft.defaults.customFlag,false);assert.equal(draft.defaults.taxPercent,null);assert.equal(draft.services[0].pricing.minimumJob,0);assert.equal(draft.services[0].pricing.unit,'flat');assert.ok(!Object.hasOwn(draft.services[1],'service'));
});
test('same-field competing prices require an explicit choice and equal concurrent edits do not', () => {
  const {base,local,remote}=scenario();local.services[0].pricing.price=150;remote.services[0].pricing.price=110;
  let result=reconcilePricebook(base,local,remote);assert.equal(result.unresolved.length,1);assert.equal(result.unresolved[0].base,100);
  const key=result.unresolved[0].key;
  result=reconcilePricebook(base,local,remote,{[key]:'local'});assert.equal(result.unresolved.length,0);assert.equal(result.draft.services[0].pricing.price,150);
  assert.equal(reconcilePricebook(base,local,remote,{[key]:'remote'}).draft.services[0].pricing.price,110);
  remote.services[0].pricing.price=150;assert.equal(reconcilePricebook(base,local,remote).unresolved.length,0);
});
test('UUID casing is canonical and duplicate identities fail closed', () => {
  const {base,local,remote}=scenario();remote.services[0].id=ids[0].toUpperCase();local.services[0].pricing.price=150;
  assert.equal(reconcilePricebook(base,local,remote).draft.services[0].pricing.price,150);
  local.services.push({...local.services[0],id:ids[0].toUpperCase()});assert.throws(()=>reconcilePricebook(base,local,remote),/Duplicate/);
});
for (const deletedSide of ['local','remote']) {
  test(deletedSide+' deletion wins against an unchanged service, including receipt-only changes', () => {
    const state=scenario();state[deletedSide].services.shift();state[deletedSide==='local'?'remote':'local'].services[0].quoteDoneApproval={contentDigest:'changed-receipt'};
    const result=reconcilePricebook(state.base,state.local,state.remote);assert.equal(result.unresolved.length,0);assert.equal(result.draft.services.length,1);assert.equal(result.draft.services[0].id,ids[1]);
  });
  test(deletedSide+' deletion conflicts with an actively modified service', () => {
    const state=scenario();state[deletedSide].services.shift();state[deletedSide==='local'?'remote':'local'].services[0].pricing.price=150;
    const result=reconcilePricebook(state.base,state.local,state.remote);assert.equal(result.unresolved.length,1);assert.equal(result.unresolved[0].kind,deletedSide+'_deleted');
    const deletionChoice=deletedSide==='local'?'local':'remote';assert.equal(reconcilePricebook(state.base,state.local,state.remote,{[result.unresolved[0].key]:deletionChoice}).draft.services.length,1);
  });
}
test('restoring a remote deletion removes old identity and every receipt, with a stable temporary identity', () => {
  const {base,local,remote}=scenario();for(const field of RECEIPT_FIELDS)local.services[0][field]={synthetic:true};local.services[0].pricing.price=150;remote.services.shift();
  const first=reconcilePricebook(base,local,remote), choices={[first.unresolved[0].key]:'local'};
  const result=reconcilePricebook(base,local,remote,choices), restored=result.draft.services.find(s=>s.pricing.price===150);
  assert.ok(!restored.id);for(const field of RECEIPT_FIELDS)assert.ok(!Object.hasOwn(restored,field));assert.equal(restored.__clientTempId,reconcilePricebook(base,local,remote,choices).draft.services.find(s=>s.pricing.price===150).__clientTempId);
});
test('all existing services take immutable identity, source and receipts exactly from remote', () => {
  const {base,local,remote}=scenario();for(const field of RECEIPT_FIELDS){remote.services[0][field]={remote:field};local.services[0][field]={local:field};}local.services[0].source='AI_INTERVIEW';local.services[0].serviceType='FLOORING_LAMINATE';local.services[0].pricing.price=150;
  const merged=reconcilePricebook(base,local,remote).draft.services[0];assert.equal(merged.source,'MANUAL');assert.equal(merged.serviceType,'CUSTOM');for(const field of RECEIPT_FIELDS)assert.deepEqual(merged[field],remote.services[0][field]);
  delete remote.services[0].quoteDoneApproval;assert.ok(!Object.hasOwn(reconcilePricebook(base,local,remote).draft.services[0],'quoteDoneApproval'));
});
test('simultaneous additions of the same service type stay distinct and new local receipts are removed', () => {
  const {base,local,remote}=scenario();local.services=withClientServiceIds([...local.services,{serviceType:'CUSTOM',source:'AI_INTERVIEW',pricing:{price:150},origin:{stale:true},confirmedFields:{price:true}}]);
  remote.services.push(service(crypto.randomUUID(),300));const result=reconcilePricebook(base,local,remote);assert.equal(result.unresolved.length,0);assert.equal(result.draft.services.length,4);assert.equal(result.draft.services.at(-1).__clientTempId,local.services.at(-1).__clientTempId);assert.ok(!result.draft.services.at(-1).origin);assert.ok(!result.draft.services.at(-1).confirmedFields);
});
test('temporary keys never enter save, validation or preview payloads and editor identity survives clones/reordering', () => {
  const services=withClientServiceIds([{serviceType:'CUSTOM',source:'MANUAL',pricing:{price:150}}]);const key=editorServiceKey(services[0],0);
  assert.equal(editorServiceKey(copy(services[0]),9),key);assert.equal(withClientServiceIds(services)[0],services[0]);
  for(const payload of [{services,defaults:{}},{service:services[0],customerInputs:{}}])assert.ok(!JSON.stringify(pricebookPayload(payload)).includes('__clientTempId'));
  assert.equal(pricebookPayload({service:{...services[0],pricing:{__clientTempId:'unsupported pricing'}}}).service.pricing.__clientTempId,'unsupported pricing','unknown pricing keys must still fail validation');
  assert.ok(services[0].__clientTempId);
});
test('tiers are atomic values when both sessions change them, with no index-based merge', () => {
  const {base,local,remote}=scenario();base.services[0].tiers=[{name:'Good',overrides:{price:100}}];local.services[0].tiers=[{name:'Better',overrides:{price:150}}];remote.services[0].tiers=[{name:'Good',overrides:{price:110}},{name:'Best',overrides:{price:200}}];
  const result=reconcilePricebook(base,local,remote);assert.equal(result.unresolved.length,1);assert.equal(result.unresolved[0].path.at(-1),'tiers');assert.deepEqual(reconcilePricebook(base,local,remote,{[result.unresolved[0].key]:'local'}).draft.services[0].tiers,local.services[0].tiers);
});
test('concurrent registration of the same catalog name retains the saved UUID without an opaque owner choice', () => {
  const {base,local,remote}=scenario();local.services[0].knownOfferings={fenceType:{wood_privacy:crypto.randomUUID()}};remote.services[0].knownOfferings={fenceType:{wood_privacy:crypto.randomUUID()}};
  const result=reconcilePricebook(base,local,remote);assert.equal(result.unresolved.length,0);assert.equal(result.draft.services[0].knownOfferings.fenceType.wood_privacy,remote.services[0].knownOfferings.fenceType.wood_privacy);
});
test('only the typed revision contract triggers recovery, including post-approval races', () => {
  for(const error of [{status:409},{status:409,code:'REVISION_CONFLICT'},{status:400,details:{code:'REVISION_CONFLICT'}},{status:409,details:{field:'price'}}])assert.equal(isRevisionConflict(error),false);
  assert.equal(isRevisionConflict({status:409,details:{code:'REVISION_CONFLICT'}}),true);
  const state=scenario();assert.throws(()=>mergeSavedApproval(state.local,state.base,state.remote,ids[0],'other'),error=>isRevisionConflict(error)&&error.remoteBook===state.remote);
});
test('draft acceptance allows missing prices and owner decisions but blocks invalid/unsupported/cross-field diagnostics at every level', () => {
  assert.deepEqual(reconciliationErrors({statuses:[{status:'NEEDS PRICING',invalidOwnerFields:['ownerDecision'],ownerDiagnostics:[{type:'missing',message:'Enter price'},{type:'owner_decision',message:'Choose a setting'}],applicationIssues:['Approve saved configuration']}],validationErrors:['Enter price','Approve saved configuration']}),[]);
  const types=['invalid','unsupported','cross_field'];for(const type of types)assert.deepEqual(reconciliationErrors({statuses:[{failedTierDiagnostics:[{ownerDiagnostics:[{type,message:'Bad tier'}]}],scopeCoverage:[{ownerDiagnostics:[{type,message:'Bad scope'}]}]}]}),['Bad tier','Bad scope']);
  assert.throws(()=>reconciliationErrors({}),/could not be validated/);
});

migrate();
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(true),peakMonths:[],peakSurchargePercent:0};
const custom=price=>({serviceType:'CUSTOM',service:'[SYNTHETIC] fixed',source:'MANUAL',active:true,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price,minimumJob:0},tiers:[]});
function savedScenario(services=[custom(100),custom(200)]) {
  const owner='[SYNTHETIC]-recovery-'+crypto.randomUUID();
  bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),defaults,services});
  const base=bridge.readApplicationBook(owner);return {owner,base,local:copy(base),remote:copy(base)};
}
test('real saves and approval/validation/preview calls reject stale revisions with the same typed 409', () => {
  const {owner,base,remote}=savedScenario();remote.services[0].pricing.price=110;bridge.saveApplicationBook(owner,remote);
  for(const action of [()=>bridge.saveApplicationBook(owner,base),()=>bridge.validateApplicationDraft(owner,base),()=>bridge.approveApplicationService(owner,base.services[0].id,{revision:base.revision}),()=>bridge.previewApplicationQuote(owner,{revision:base.revision,service:base.services[0],serviceId:base.services[0].id,defaults:base.defaults,customerInputs:{}})])assert.throws(action,error=>error.statusCode===409&&error.details?.code==='REVISION_CONFLICT');
});
test('a real three-way merge saves both independent prices with server revisions and exact cent storage', () => {
  const {owner,base,local,remote}=savedScenario();local.services[1].pricing.price=220;remote.services[0].pricing.price=110;bridge.saveApplicationBook(owner,remote);
  const latest=bridge.readApplicationBook(owner), merged=reconcilePricebook(base,local,latest).draft;assert.deepEqual(reconciliationErrors(bridge.validateApplicationDraft(owner,pricebookPayload(merged))),[]);
  const saved=bridge.saveApplicationBook(owner,pricebookPayload(merged));assert.notEqual(saved.revision,latest.revision);assert.deepEqual(loadPricebook(owner).services.map(s=>s.pricing.price),[11000,22000]);
  const next=bridge.readApplicationBook(owner), nextLocal=copy(next), nextRemote=copy(next);nextLocal.services[1].pricing.price=200;nextRemote.services[0].pricing.price=100;bridge.saveApplicationBook(owner,nextRemote);
  const again=reconcilePricebook(next,nextLocal,bridge.readApplicationBook(owner));assert.equal(again.unresolved.length,0);assert.deepEqual(again.draft.services.map(s=>s.pricing.price),[100,200]);
});
test('a further remote save during recovery restarts concurrency protection without overwriting it', () => {
  const {owner,base,local,remote}=savedScenario();local.services[1].pricing.price=220;remote.services[0].pricing.price=110;bridge.saveApplicationBook(owner,remote);
  const latest=bridge.readApplicationBook(owner), merged=reconcilePricebook(base,local,latest).draft;bridge.validateApplicationDraft(owner,pricebookPayload(merged));
  const newest=copy(latest);newest.services[0].service='[SYNTHETIC] newer';bridge.saveApplicationBook(owner,newest);
  assert.throws(()=>bridge.saveApplicationBook(owner,pricebookPayload(merged)),error=>error.details?.code==='REVISION_CONFLICT');assert.equal(bridge.readApplicationBook(owner).services[1].pricing.price,200);
});
test('restored deletions save as new server IDs with fresh origin and no resurrected approval', () => {
  const {owner,base,local,remote}=savedScenario();local.services[0].pricing.price=150;remote.services.shift();bridge.saveApplicationBook(owner,remote);const latest=bridge.readApplicationBook(owner), first=reconcilePricebook(base,local,latest), merged=reconcilePricebook(base,local,latest,{[first.unresolved[0].key]:'local'}).draft;
  bridge.saveApplicationBook(owner,pricebookPayload(merged));const restored=bridge.readApplicationBook(owner).services.find(s=>s.pricing.price===150);assert.notEqual(restored.id,base.services[0].id);assert.ok(restored.origin);assert.ok(!restored.quoteDoneApproval);assert.equal(loadPricebook(owner).services.find(s=>s.id===restored.id).pricing.price,15000);
});
test('real validation allows incomplete drafts and flags root/nested disagreement and unsupported values', () => {
  const {owner,base}=savedScenario();const incomplete=copy(base);delete incomplete.services[0].pricing.price;
  const validation=bridge.validateApplicationDraft(owner,incomplete);assert.ok(validation.statuses[0].missingOwnerFields.includes('price'));assert.deepEqual(reconciliationErrors(validation),[]);bridge.saveApplicationBook(owner,incomplete);
  const bad=bridge.readApplicationBook(owner);bad.services[1].price=100;assert.throws(()=>bridge.validateApplicationDraft(owner,bad),/conflicting duplicate/);
  delete bad.services[1].price;bad.services[1].pricing.unknownPricingField=1;assert.ok(reconciliationErrors(bridge.validateApplicationDraft(owner,bad)).length>0);
});
test('backend preserves remote receipts but changed merged prices invalidate current approval', () => {
  const {owner,base}=savedScenario([custom(100)]);const raw=loadPricebook(owner), status=bridge.applicationStatus(raw.services[0],raw);
  bridge.approveApplicationService(owner,base.services[0].id,{revision:base.revision,confirmConfiguration:true,confirmLegacySettings:true,source:'MANUAL',fields:status.confirmationFields});
  const approved=bridge.readApplicationBook(owner);assert.equal(bridge.validateApplicationDraft(owner,approved).statuses[0].approvalCurrent,true);
  const local=copy(approved);local.services[0].pricing.price=150;const merged=reconcilePricebook(approved,local,approved).draft;assert.deepEqual(merged.services[0].quoteDoneApproval,approved.services[0].quoteDoneApproval);
  const validation=bridge.validateApplicationDraft(owner,pricebookPayload(merged));assert.equal(validation.statuses[0].approvalCurrent,false);assert.deepEqual(reconciliationErrors(validation),[]);bridge.saveApplicationBook(owner,pricebookPayload(merged));assert.equal(bridge.validateApplicationDraft(owner,bridge.readApplicationBook(owner)).statuses[0].approvalCurrent,false);
  const stored=loadPricebook(owner), result=bridge.calculateApplicationQuote(stored,stored.services[0],{serviceId:stored.services[0].id,customerInputs:{}},{ownerId:owner});assert.equal(result.customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(!result.customerResult.options);
});
test('individually valid range edits that become incompatible after merging are blocked', () => {
  const range=custom(100);range.pricing={customPricingMode:'range',customChargeClassification:'labor',unit:'flat',low:100,high:300,minimumJob:0};
  const {owner,base,local,remote}=savedScenario([range]);local.services[0].pricing.low=200;remote.services[0].pricing.high=150;
  assert.deepEqual(reconciliationErrors(bridge.validateApplicationDraft(owner,local)),[]);bridge.saveApplicationBook(owner,remote);
  const combined=reconcilePricebook(base,local,bridge.readApplicationBook(owner));assert.equal(combined.unresolved.length,0);
  assert.ok(reconciliationErrors(bridge.validateApplicationDraft(owner,pricebookPayload(combined.draft))).length>0);
});
