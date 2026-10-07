import test from 'node:test';
import assert from 'node:assert/strict';
import {db,seed,knowledgeApp,getBusinessProfile} from './namedReviewContact20261006.fixture.mjs';
test.after(()=>db.close());
const save='/api/onboarding/knowledge-base',draft=save+'/draft';
const contact={name:'Synthetic Morgan',role:'manager'};
const input={about:'[SYNTHETIC] Test business',hours:'Weekdays',reviewContact:contact};
test('named review contact authenticated save ignores body tenant IDs and returns only public contact facts',async t=>{
  const a=seed(),b=seed(),h=await knowledgeApp(t),before=getBusinessProfile(b.id);
  const saved=await h.request(save,{...input,ownerId:b.id,tenantOwnerId:b.id,draft:true},a.token);
  assert.equal(saved.status,200);assert.deepEqual(saved.body.profile.knowledgeBase.reviewContact,contact);
  assert.equal(saved.body.profile.knowledgeBase.draft,false);assert.deepEqual(getBusinessProfile(b.id),before);
  assert.deepEqual((await h.request('/synthetic/state',undefined,a.token)).body.profile.knowledgeBase.reviewContact,contact);
});
test('named review contact owner-only route rejects staff, absent and invalid sessions',async t=>{
  const a=seed(),staff=seed('staff',a.id),h=await knowledgeApp(t),before=getBusinessProfile(a.id);
  for(const endpoint of [save,draft])for(const [token,status] of [[undefined,401],['SYNTHETIC-invalid-token',401],[staff.token,403]])assert.equal((await h.request(endpoint,input,token)).status,status);
  assert.deepEqual(getBusinessProfile(a.id),before);
});
test('named review contact cannot bypass billing read-only status',async t=>{
  const a=seed(),h=await knowledgeApp(t),before=getBusinessProfile(a.id);
  db.prepare("UPDATE users SET planStatus='pending_payment' WHERE id=? AND role='owner'").run(a.id);
  for(const endpoint of [save,draft]){
    const response=await h.request(endpoint,input,a.token);
    assert.equal(response.status,403);assert.equal(response.body.code,'ACCOUNT_READ_ONLY');
  }
  assert.deepEqual(getBusinessProfile(a.id),before);
});
test('named review contact API rejects invalid and foreign bindings without partial changes',async t=>{
  const a=seed(),b=seed(),h=await knowledgeApp(t);await h.request(save,input,a.token);const before=getBusinessProfile(a.id);
  for(const reviewContact of [{...contact,ownerId:b.id},{name:'',role:'owner'},{...contact,role:'admin'}]){
    const r=await h.request(save,{...input,about:'[SYNTHETIC] Must not save',reviewContact},a.token);
    assert.equal(r.status,400);assert.equal(r.body.code,'INVALID_REQUEST');assert.deepEqual(getBusinessProfile(a.id),before);
  }
});
test('named review contact repeated saves are stable; unsaved AI drafts never reach production knowledge',async t=>{
  const a=seed(),h=await knowledgeApp(t);
  for(let i=0;i<3;i++)assert.equal((await h.request(save,input,a.token)).status,200);
  const before=getBusinessProfile(a.id).knowledgeBase;
  assert.equal((await h.request(draft,{},a.token)).status,200);
  assert.deepEqual(getBusinessProfile(a.id).knowledgeBase,before);
  assert.equal((await h.request(save,{about:'[SYNTHETIC] Legacy edit',hours:'Weekdays'},a.token)).status,200);
  assert.deepEqual(getBusinessProfile(a.id).knowledgeBase.reviewContact,contact);
});
