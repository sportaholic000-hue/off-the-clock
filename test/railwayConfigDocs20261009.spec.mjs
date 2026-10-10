import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadBillingConfig} from '../server/src/billingConfig.js';
// Owner-approved expected list, written by hand before execution; never derive it from code/templates.
const expectedPrices=['STRIPE_STARTER_MONTHLY_PRICE_ID','STRIPE_STARTER_ANNUAL_PRICE_ID','STRIPE_OPERATOR_MONTHLY_PRICE_ID','STRIPE_OPERATOR_ANNUAL_PRICE_ID','STRIPE_QUOTEDONE_MONTHLY_PRICE_ID','STRIPE_QUOTEDONE_ANNUAL_PRICE_ID'];
for(const name of expectedPrices){
 test(`Railway three-plan configuration documents ${name}`,()=>{
  for(const path of ['deployment/railway.env.example','.env.example'])assert.match(readFileSync(new URL('../'+path,import.meta.url),'utf8'),new RegExp('^\\s*(?:#\\s*)?'+name+'=', 'm'),path);
  assert.ok(readFileSync(new URL('../docs/RAILWAY_SETUP.md',import.meta.url),'utf8').includes(name));
 });
 test(`Stripe enabled refuses missing ${name}`,()=>{
  const env={NODE_ENV:'production',STRIPE_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_live_SYNTHETIC',STRIPE_WEBHOOK_SECRET:'whsec_SYNTHETIC',STRIPE_INTEGRATION_IDENTIFIER:'synthetic_abcdefgh',STRIPE_CHECKOUT_SUCCESS_URL:'https://synthetic.example.invalid/success',STRIPE_CHECKOUT_CANCEL_URL:'https://synthetic.example.invalid/cancel',STRIPE_PORTAL_RETURN_URL:'https://synthetic.example.invalid/billing',...Object.fromEntries(expectedPrices.map((key,index)=>[key,'price_SYNTHETIC_'+index]))};
  assert.equal(Object.keys(loadBillingConfig(env).priceIds).length,3);delete env[name];assert.throws(()=>loadBillingConfig(env),new RegExp(name+' is required'));
 });
}
