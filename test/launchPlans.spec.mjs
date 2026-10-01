import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import {createLaunchPlanFixture,closeLaunchPlanDatabase} from './helpers/launchPlanFixture.mjs';

after(closeLaunchPlanDatabase);
const signup=plan=>({plan,email:plan.toLowerCase()+'-'+crypto.randomUUID()+'@example.invalid',
 password:'launch-plan-password',firstName:'Owner',businessName:'Synthetic launch business'});

for(const plan of ['Operator','QuoteDone']) for(const status of ['trialing','active']) {
 test(plan+' signup → verified '+status+' → correct onboarding access',async t=>{
  const f=await createLaunchPlanFixture();t.after(f.close);
  const registration=await f.request('/api/auth/register',{body:signup(plan)});
  assert.equal(registration.status,201);const {token,account}=registration.body;
  assert.equal(account.plan,plan);assert.equal(account.planStatus,'pending_payment');
  const stored=()=>f.db.prepare('SELECT plan,planStatus,trialEndsAt FROM users WHERE id=?').get(account.id);
  assert.deepEqual(stored(),{plan,planStatus:'pending_payment',trialEndsAt:null});
  const before=await f.request('/api/onboarding/state',{token});
  assert.equal(before.body.account.plan,plan);assert.equal(before.body.quoteDoneAccess,false);
  // Profile edits cannot change the chosen plan or grant billing entitlement.
  await f.request('/api/onboarding/account',{token,body:{firstName:'Owner',businessName:'Edited business',plan:'Scale',planStatus:'active'}});
  assert.equal(stored().plan,plan);assert.equal(stored().planStatus,'pending_payment');
  const checkout=await f.request('/api/billing/checkout',{token,key:crypto.randomUUID(),body:{plan,billingInterval:'monthly'}});
  assert.equal(checkout.status,201);
  const parameters=f.calls.checkout[0].parameters;
  assert.equal(parameters.line_items[0].price,f.priceIds[plan].monthly);
  assert.equal(parameters.payment_method_collection,'always');
  assert.equal(parameters.subscription_data.trial_period_days,14);
  assert.deepEqual(stored(),{plan,planStatus:'pending_payment',trialEndsAt:null});
  const evidence=await f.completeCheckout(account.id,{status});
  assert.equal(evidence.first.status,200);assert.equal(evidence.second.status,200);
  assert.equal(evidence.afterCheckout.plan,plan);assert.equal(evidence.afterCheckout.planStatus,'pending_payment');
  const result=await f.request('/api/onboarding/state',{token});
  assert.equal(result.status,200);assert.equal(result.body.account.plan,plan);
  assert.equal(result.body.account.planStatus,status);
  assert.equal(result.body.quoteDoneAccess,plan==='QuoteDone');
  assert.equal(status==='trialing',Date.parse(result.body.account.trialEndsAt)>Date.now());
  assert.equal(Boolean(f.db.prepare('SELECT paymentMethodVerifiedAt FROM billingAccounts WHERE ownerId=?').get(account.id).paymentMethodVerifiedAt),true);
  const billing=await f.request('/api/billing/status',{token});
  assert.equal(billing.body.plan,plan);assert.equal(billing.body.planStatus,status);
  assert.equal(billing.body.canCheckout,false);
 });
}
for(const plan of ['Operator','QuoteDone']) test(plan+' cannot unlock a trial without verified payment evidence',async t=>{
 const f=await createLaunchPlanFixture();t.after(f.close);
 const {body:{token,account}}=await f.request('/api/auth/register',{body:signup(plan)});
 // Locked database guard remains effective against direct status edits.
 f.db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(account.id);
 assert.equal(f.db.prepare('SELECT planStatus FROM users WHERE id=?').get(account.id).planStatus,'pending_payment');
 await f.request('/api/billing/checkout',{token,key:crypto.randomUUID(),body:{plan,billingInterval:'monthly'}});
 const evidence=await f.completeCheckout(account.id,{paymentMethod:false});
 assert.equal(evidence.second.status,200);
 const result=await f.request('/api/onboarding/state',{token});
 assert.equal(result.body.account.plan,plan);assert.equal(result.body.account.planStatus,'pending_payment');
 assert.equal(result.body.quoteDoneAccess,false);
 const invalid=await f.sendEvent({...evidence.subscriptionEvent,id:'evt_bad_'+crypto.randomUUID(),
   data:{object:{...evidence.subscriptionEvent.data.object,default_payment_method:'pm_FORGED'}}},{badSignature:true});
 assert.equal(invalid.status,400);
 assert.equal(f.db.prepare('SELECT planStatus FROM users WHERE id=?').get(account.id).planStatus,'pending_payment');
});
test('Scale signup is rejected without creating an account',async t=>{
 const f=await createLaunchPlanFixture();t.after(f.close);const before=f.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
 const result=await f.request('/api/auth/register',{body:signup('Scale')});
 assert.equal(result.status,400);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM users').get().n,before);
});
test('bcrypt 6 accepts existing bcrypt 5 hashes and reset revokes the old session',async t=>{
 const f=await createLaunchPlanFixture();t.after(f.close);const input=signup('QuoteDone');
 const {body:{account}}=await f.request('/api/auth/register',{body:input});
 assert.match(f.db.prepare('SELECT passwordHash FROM users WHERE id=?').get(account.id).passwordHash,/^\$2b\$12\$/);
 // Generated using bcrypt 5.1.1 and cost 12; no existing owner is forced to reset.
 const legacy='$2b$12$julaDaLqmg5.NZuQa57mhOpp5Kv9G7vl8CqB40hr4Dug4AzpQ8g4O';
 assert.equal(await bcrypt.compare('legacy-launch-password',legacy),true);
 f.db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run(legacy,account.id);
 const login=await f.request('/api/auth/login',{body:{email:input.email,password:'legacy-launch-password'}});
 assert.equal(login.status,200);const token=login.body.token;
 assert.equal((await f.request('/api/billing/status',{token})).status,200);
 await f.request('/api/auth/forgot-password',{body:{email:input.email}});
 const message=f.mail.at(-1),resetToken=new URL(message.text.match(/https?:\/\/\S+/)[0]).hash.slice('#token='.length);
 const reset=await f.request('/api/auth/reset-password',{body:{token:resetToken,password:'new-launch-password'}});
 assert.equal(reset.status,200);
 assert.equal((await f.request('/api/billing/status',{token})).status,401);
 assert.equal((await f.request('/api/auth/login',{body:{email:input.email,password:'new-launch-password'}})).status,200);
 assert.equal((await f.request('/api/auth/login',{body:{email:input.email,password:'legacy-launch-password'}})).status,401);
});
