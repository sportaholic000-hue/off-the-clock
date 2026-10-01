import test from 'node:test';
import assert from 'node:assert/strict';
import {billingState,billingStorageKey,readBillingJobs,billingDestination,definiteBillingRejection,canContinueSetup} from '../src/billingTransport.js';
const state={billingEnabled:true,providerAvailable:true,plan:'QuoteDone',planStatus:'pending_subscription',billingInterval:null,cancelAtPeriodEnd:false,checkoutState:'NONE',canCheckout:true,canManageBilling:false};
test('pending and canceled state remains server data, never implied by a chosen plan',()=>{
 assert.equal(billingState(state).planStatus,'pending_subscription');
 assert.equal(billingState({...state,planStatus:'canceled'}).planStatus,'canceled');
 for(const bad of [{...state,canCheckout:'true'},{...state,providerAvailable:undefined},{...state,billingInterval:'weekly'},{...state,checkoutState:'guess'}])assert.throws(()=>billingState(bad));
});
test('request recovery uses an account-session namespace without retaining the authentication token',async()=>{
 const a=await billingStorageKey('synthetic-session-a'),b=await billingStorageKey('synthetic-session-b');
 assert.notEqual(a,b);assert.equal(a,await billingStorageKey('synthetic-session-a'));assert.ok(!a.includes('synthetic-session'));assert.match(a,/^otc-billing-v1:[a-f0-9]{64}$/);
});
test('saved checkout and portal bodies preserve exact request IDs and exclude client prices or owner IDs',()=>{
 const job={kind:'checkout',key:'8f6aa9e1-7114-414d-a7a0-48e942ceade6',state:'pending',body:{plan:'QuoteDone',billingInterval:'monthly'}};
 const storage=value=>({getItem:()=>JSON.stringify(value)});
 assert.deepEqual(readBillingJobs(storage({version:1,checkout:job}),'key').checkout,job);
 for(const body of [{...job.body,priceId:'price_injected'},{...job.body,ownerId:'other-owner'},{...job.body,billingInterval:'weekly'}])assert.deepEqual(readBillingJobs(storage({version:1,checkout:{...job,body}}),'key'),{});
 assert.deepEqual(readBillingJobs({getItem:()=>'{invalid'},'key'),{});
 const portal={...job,kind:'portal',body:{}};assert.deepEqual(readBillingJobs(storage({version:1,portal}),'key').portal,portal);
});
test('only explicit pre-mutation rejection clears an uncertain billing request',()=>{
 assert.equal(definiteBillingRejection({status:400,code:'INVALID_REQUEST'}),true);
 assert.equal(definiteBillingRejection({status:409,code:'SUBSCRIPTION_ALREADY_EXISTS'}),true);
 for(const error of [{status:502},{status:409,code:'CHECKOUT_IN_PROGRESS'},{status:409,code:'IDEMPOTENCY_KEY_CONFLICT'},new Error('network')])assert.equal(definiteBillingRejection(error),false);
});
test('billing navigation rejects scripts, credentials and insecure destinations',()=>{
 for(const url of ['javascript:alert(1)','http://checkout.example.invalid','https://user:secret@checkout.example.invalid','/relative',null])assert.equal(billingDestination(url),null);
 assert.equal(billingDestination('https://checkout.example.invalid/session'),'https://checkout.example.invalid/session');
});
test('setup continuation requires confirmed active or unexpired trial status',()=>{
 const now=Date.parse('2026-10-01T00:00:00Z');
 for(const plan of ['Operator','QuoteDone']) {
  assert.equal(canContinueSetup({...state,plan,planStatus:'pending_payment'},now),false);
  assert.equal(canContinueSetup({...state,plan,planStatus:'pending_subscription'},now),false);
  assert.equal(canContinueSetup({...state,plan,planStatus:'active'},now),true);
  assert.equal(canContinueSetup({...state,plan,planStatus:'trialing',trialEndsAt:'2026-10-15T00:00:00Z'},now),true);
  assert.equal(canContinueSetup({...state,plan,planStatus:'trialing',trialEndsAt:'2026-10-01T00:00:00Z'},now),false);
 }
});
test('saved Scale Checkout cannot be resumed as a launch offer',()=>{
 const saved={version:1,checkout:{kind:'checkout',key:'8f6aa9e1-7114-414d-a7a0-48e942ceade6',state:'opened',body:{plan:'Scale',billingInterval:'monthly'}}};
 assert.deepEqual(readBillingJobs({getItem:()=>JSON.stringify(saved)},'key'),{});
 assert.equal(billingState({...state,plan:'Scale'}).plan,'Scale');
});
