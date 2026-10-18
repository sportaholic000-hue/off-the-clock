import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcilePricebook,pricebookPayload} from '../client/src/pricebookConflict.js';
import {convertApplicationBook} from '../server/src/quoteDoneBridge.js';
import {setup,read,save,approve,deleteRemote,editLocal,editable,protectedFields,group} from '../verification/qe-restored-service-receipts-20261018/fixture.mjs';
import {render,state,changeDraft,button,waitFor,acceptChoice} from '../verification/qe-restored-service-receipts-20261018/rendered.mjs';

// Independently written before execution: $3.00=300c original; local $4.25=425c;
// remote $3.75=375c; material $5.00=500c (independent edit $6.00=600c);
// option labor $4.50=450c, minimum $0=0c. No quote formula is changed.
const cents=book=>convertApplicationBook(book,'toCents').services[0].pricing;
function select(base,local,remote,choice='local'){
  const pending=reconcilePricebook(base,local,remote);assert.equal(pending.unresolved.length,1);
  const merged=reconcilePricebook(base,local,remote,{[pending.conflicts[0].key]:choice});assert.equal(merged.unresolved.length,0);return merged.draft;
}
function assertFresh(original,restored){
  assert.notEqual(restored.id,original.id);assert.match(restored.id,/^[0-9a-f-]{36}$/);
  assert.equal(restored.origin.serviceId,restored.id);assert.equal(restored.origin.ownerId,'synthetic-a');assert.notEqual(restored.origin.operationId,original.origin.operationId);
  assert.equal(original.startingValueAdoptions[group].mode,'adopted');assert.equal(restored.startingValueAdoptions[group].mode,'new');
  assert.notDeepEqual(restored.startingValueAdoptions,original.startingValueAdoptions);
  assert.equal(restored.startingValueAdoptions[group].adoptedAt,undefined);assert.equal(restored.startingValueAdoptions[group].ownerId,undefined);
  assert.equal(restored.quoteDoneApproval,undefined);assert.deepEqual(restored.confirmedFields,{});
  assert.equal(restored.approvedValues,undefined);assert.equal(restored.zeroPricePolicy,undefined);
  assert.ok(Object.values(restored.startingValueState||{}).every(row=>row.confirmed!==true),'no inherited starting-value confirmations');
}
async function assertUnapproved(f,book){
  const response=await f.request('/api/pricebook/validate','synthetic-a',{method:'POST',body:book});assert.equal(response.status,200);
  assert.equal(response.body.statuses[0].approvalCurrent,false);assert.notEqual(response.body.statuses[0].status,'QUOTING LIVE');
}

test('real save API restores edited adopted flooring as fresh unapproved work with exact editable configuration',async t=>{
  const f=await setup(t),base=f.original,local=editLocal(base);
  assert.ok(base.services[0].quoteDoneApproval);assert.equal(cents(base).laborPerSqft.vinyl_plank,300);
  const remote=await deleteRemote(f,base),stale=await save(f,local);assert.equal(stale.status,409);assert.equal(stale.body.details.code,'REVISION_CONFLICT');
  const draft=select(base,local,remote),payload=pricebookPayload(draft);
  for(const field of ['id','__clientTempId',...protectedFields])assert.equal(Object.hasOwn(payload.services[0],field),false,field+' is not sent on restoration');
  assert.deepEqual(editable(payload.services[0]),editable(local.services[0]));
  const response=await save(f,payload);assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.statuses[0].approvalCurrent,false);
  const restored=await read(f);assertFresh(base.services[0],restored.services[0]);assert.deepEqual(editable(restored.services[0]),editable(local.services[0]));
  assert.equal(cents(restored).laborPerSqft.vinyl_plank,425);assert.equal(cents(restored).materialPerSqft.vinyl_plank,500);assert.equal(cents(restored).minimumJob,0);
  assert.equal(restored.services[0].pricing.layoutLaborMultiplier.diagonal_or_pattern,1.2);assert.equal(restored.services[0].pricing.wasteFactorByType.vinyl_plank,.08);
  assert.equal(restored.services[0].pricing.vinylPlankUnderlaymentRule,'never_included');
  assert.equal(convertApplicationBook(restored,'toCents').services[0].tiers[0].overrides.laborPerSqft.vinyl_plank,450);assert.equal(restored.defaults.currency,'CAD');await assertUnapproved(f,restored);
});

test('surviving service keeps authoritative remote adoption and approval receipts, plus independent local price edit',async t=>{
  const f=await setup(t,{adopted:false}),base=f.original,local=editLocal(base);
  local.services[0].startingValueAdoptions[group]={mode:'legacy',introducedAt:'[SYNTHETIC] stale local receipt'};
  const remote=await approve(f,base,{adoptStartingValueGroup:group});
  const merged=reconcilePricebook(base,local,remote);assert.deepEqual(merged.conflicts,[]);
  for(const field of protectedFields)assert.deepEqual(merged.draft.services[0][field],remote.services[0][field],field+' is authoritative remote metadata');
  const response=await save(f,pricebookPayload(merged.draft));assert.equal(response.status,200,JSON.stringify(response.body));
  const saved=await read(f);assert.equal(saved.services[0].id,base.services[0].id);assert.equal(cents(saved).laborPerSqft.vinyl_plank,425);
  assert.deepEqual(saved.services[0].startingValueAdoptions,remote.services[0].startingValueAdoptions);assert.deepEqual(saved.services[0].quoteDoneApproval,remote.services[0].quoteDoneApproval);
  await assertUnapproved(f,saved); // retained remote receipt does not approve the changed price
});

test('receipt-only remote adoption does not conflict with a local deletion',async t=>{
  const f=await setup(t,{adopted:false}),base=f.original,local=structuredClone(base);local.services=[];
  const remote=await approve(f,base,{adoptStartingValueGroup:group});const merged=reconcilePricebook(base,local,remote);
  assert.deepEqual(merged.conflicts,[]);assert.deepEqual(merged.draft.services,[]);assert.equal((await save(f,pricebookPayload(merged.draft))).status,200);assert.deepEqual((await read(f)).services,[]);
});

test('remote absence removes a local adoption receipt and unsaved additions strip it',async t=>{
  const f=await setup(t),base=f.original,local=editLocal(base),remote=structuredClone(base);delete remote.services[0].startingValueAdoptions;
  const merged=reconcilePricebook(base,local,remote);assert.deepEqual(merged.conflicts,[]);assert.equal(Object.hasOwn(merged.draft.services[0],'startingValueAdoptions'),false);assert.equal(cents(merged.draft).laborPerSqft.vinyl_plank,425);
  const addition=structuredClone(local.services[0]);delete addition.id;addition.__clientTempId='[SYNTHETIC] added work';const empty={...base,services:[]};
  const added=reconcilePricebook(empty,{...empty,services:[addition]},empty).draft;assert.deepEqual(editable(added.services[0]),editable(addition));
  for(const field of protectedFields)assert.equal(Object.hasOwn(pricebookPayload(added).services[0],field),false,field);
});

for(const [choice,expected] of [['local',425],['remote',375]])test('ordinary '+choice+' conflict choice preserves exact prices and independent configuration through HTTP save',async t=>{
  const f=await setup(t),base=f.original,local=editLocal(base);local.services[0].service='[SYNTHETIC] Local title retained';
  const remoteDraft=structuredClone(base);remoteDraft.services[0].pricing.laborPerSqft.vinyl_plank=3.75;remoteDraft.services[0].pricing.materialPerSqft.vinyl_plank=6;
  assert.equal((await save(f,remoteDraft)).status,200);const remote=await read(f),draft=select(base,local,remote,choice);
  assert.equal((await save(f,pricebookPayload(draft))).status,200);const saved=await read(f);
  assert.equal(cents(saved).laborPerSqft.vinyl_plank,expected);assert.equal(cents(saved).materialPerSqft.vinyl_plank,600);assert.equal(saved.services[0].service,'[SYNTHETIC] Local title retained');
  assert.equal(saved.services[0].id,base.services[0].id);assert.deepEqual(saved.services[0].startingValueAdoptions,remote.services[0].startingValueAdoptions);
});

test('real API still rejects forged new and existing adoption receipts without changing saved revision',async t=>{
  const f=await setup(t),base=f.original,newService=editable(base.services[0]);newService.startingValueAdoptions=structuredClone(base.services[0].startingValueAdoptions);
  const creation=await save(f,{...base,services:[newService]});assert.equal(creation.status,400);assert.equal(creation.body.error,'Creation and approval receipts are generated by the server.');assert.deepEqual(await read(f),base);
  const existing=structuredClone(base);existing.services[0].startingValueAdoptions[group].ownerId='synthetic-b';
  const update=await save(f,existing);assert.equal(update.status,409);assert.equal(update.body.error,'Use the explicit owner confirmation operation to change protected startingValueAdoptions.');assert.deepEqual(await read(f),base);
});

test('rendered flooring restoration crosses real HTTP conflict, validation and save paths',async t=>{
  const f=await setup(t),base=f.original,ui=await render(t,f);await changeDraft(ui.window,draft=>{draft.services[0].pricing.laborPerSqft.vinyl_plank=4.25;});
  const local=JSON.parse(JSON.stringify(state(ui.window).book));await deleteRemote(f,base);button(ui.document,'Save & validate').click();
  await waitFor(()=>ui.document.querySelector('dialog input[type="radio"]'),'deleted service conflict');assert.match(ui.document.querySelector('dialog').textContent,/was deleted remotely/);
  assert.equal(ui.document.querySelector('fieldset[aria-label="Price book editor"]').disabled,true);
  await acceptChoice(ui.document);button(ui.document,'Save & validate').click();
  await waitFor(()=>ui.calls.some(call=>call.path==='/api/pricebook/save'&&call.status===200),'successful restored save');
  const restored=await read(f);assertFresh(base.services[0],restored.services[0]);assert.equal(cents(restored).laborPerSqft.vinyl_plank,425);assert.deepEqual(editable(restored.services[0]),editable(local.services[0]));await assertUnapproved(f,restored);
  const saves=ui.calls.filter(call=>call.path==='/api/pricebook/save');assert.deepEqual(saves.map(call=>call.status),[409,200]);
  for(const field of ['id','__clientTempId',...protectedFields])assert.equal(Object.hasOwn(saves[1].body.services[0],field),false,field);
  assert.ok(ui.calls.some(call=>call.path==='/api/pricebook/validate'&&call.status===200));assert.ok(!ui.document.querySelector('.notice-error'));
});

test('rendered ordinary remote choice retains remote price and independent local title',async t=>{
  const f=await setup(t),base=f.original,ui=await render(t,f);await changeDraft(ui.window,draft=>{draft.services[0].pricing.laborPerSqft.vinyl_plank=4.25;draft.services[0].service='[SYNTHETIC] Rendered local title';});
  const remote=structuredClone(base);remote.services[0].pricing.laborPerSqft.vinyl_plank=3.75;assert.equal((await save(f,remote)).status,200);
  button(ui.document,'Save & validate').click();await acceptChoice(ui.document,'remote');button(ui.document,'Save & validate').click();await waitFor(()=>ui.calls.some(call=>call.path==='/api/pricebook/save'&&call.status===200),'ordinary conflict save');
  const saved=await read(f);assert.equal(cents(saved).laborPerSqft.vinyl_plank,375);assert.equal(saved.services[0].service,'[SYNTHETIC] Rendered local title');assert.equal(saved.services[0].id,base.services[0].id);assert.deepEqual(saved.services[0].startingValueAdoptions,base.services[0].startingValueAdoptions);
});
