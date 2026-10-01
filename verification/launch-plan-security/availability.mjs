import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {once} from 'node:events';
import express from 'express';

const [evidenceArg]=process.argv.slice(2);
const evidence=path.resolve(evidenceArg);
assert.equal(fs.existsSync(evidence),false,'Use a fresh evidence directory');
fs.mkdirSync(evidence,{recursive:true});
Object.assign(process.env,{
  NODE_ENV:'test',PORT:'0',DATABASE_PATH:path.join(evidence,'account.sqlite'),
  ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',LOCAL_PREVIEW_ENABLED:'false',
  JWT_SECRET:'SYNTHETIC_OFFLINE_VERIFICATION_ONLY_NOT_A_PRODUCTION_SECRET',
  CREDENTIAL_ENCRYPTION_KEY:'11'.repeat(32),CLIENT_URL:'http://127.0.0.1:5173',
  EMAIL_PROVIDER:'console',EMAIL_DELIVERY_ENABLED:'false',BCRYPT_COST:'12',
  STRIPE_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_SYNTHETIC_OFFLINE_ONLY',
  STRIPE_WEBHOOK_SECRET:'whsec_SYNTHETIC_OFFLINE_ONLY',
  STRIPE_OPERATOR_MONTHLY_PRICE_ID:'price_operator_month',
  STRIPE_OPERATOR_ANNUAL_PRICE_ID:'price_operator_year',
  STRIPE_QUOTEDONE_MONTHLY_PRICE_ID:'price_quote_month',
  STRIPE_QUOTEDONE_ANNUAL_PRICE_ID:'price_quote_year',
  STRIPE_CHECKOUT_SUCCESS_URL:'http://127.0.0.1:5173/settings/billing?checkout=success',
  STRIPE_CHECKOUT_CANCEL_URL:'http://127.0.0.1:5173/settings/billing?checkout=cancel',
  STRIPE_PORTAL_RETURN_URL:'http://127.0.0.1:5173/settings/billing',
  STRIPE_INTEGRATION_IDENTIFIER:'offline_billing_abcdefgh'
});
// Capture the real app listener, binding only loopback in this verifier.
const originalListen=express.application.listen;
let listener,db;
express.application.listen=function(port,...args){
  listener=originalListen.call(this,port,'127.0.0.1',...args);return listener;
};
try {
  await import('../../server/src/server.js');
  express.application.listen=originalListen;
  if(!listener.listening)await once(listener,'listening');
  ({db}=await import('../../server/src/db.js'));
  const origin='http://127.0.0.1:'+listener.address().port;
  async function request(route,{token,body}={}){
    const response=await fetch(origin+route,{method:body?'POST':'GET',
      headers:{...(body?{'Content-Type':'application/json'}:{}),
        ...(token?{Authorization:'Bearer '+token}: {})},
      ...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,body:await response.json()};
  }
  const rows=[];
  for(const plan of ['Operator','QuoteDone']){
    const registration=await request('/api/auth/register',{body:{
      firstName:'Owner',businessName:'Synthetic availability verification',
      email:plan.toLowerCase()+'-'+crypto.randomUUID()+'@example.invalid',
      password:'synthetic-verification-password',plan}});
    assert.equal(registration.status,201);
    const token=registration.body.token;
    assert.ok(token);
    const status=await request('/api/billing/status',{token});
    assert.equal(status.status,200);
    assert.equal(status.body.plan,plan);
    assert.equal(status.body.planStatus,'pending_payment');
    assert.equal(status.body.trialEndsAt,null);
    assert.equal(status.body.providerAvailable,false);
    assert.equal(status.body.canCheckout,false);
    const onboarding=await request('/api/onboarding/state',{token});
    assert.equal(onboarding.status,200);
    assert.equal(onboarding.body.account.plan,plan);
    assert.equal(onboarding.body.quoteDoneAccess,false);
    const checkout=await request('/api/billing/checkout',{token,body:{plan,billingInterval:'monthly'}});
    assert.equal(checkout.status,503);
    rows.push({plan,registrationStatus:registration.status,billing:status.body,
      onboardingPlan:onboarding.body.account.plan,quoteDoneAccess:onboarding.body.quoteDoneAccess,
      checkoutStatus:checkout.status});
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billingCheckoutRequests').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM billingAccounts').get().n,0);
  fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({
    actualServer:true,providerWritesEnabled:false,liveProviderCalls:false,passed:true,rows
  },null,2));
  console.log('PASS: real server preserves both plans and disables checkout when provider operations are off');
} finally {
  express.application.listen=originalListen;
  if(listener)await new Promise(resolve=>listener.close(resolve));
  if(db?.open)db.close();
}
