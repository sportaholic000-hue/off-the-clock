import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import Stripe from 'stripe';
import {fixture,START,END,usageConfig} from './helpers/usageFixture.mjs';
import {createUsageReporter} from '../server/src/usageReporter.js';
import {loadUsageBillingConfig,verifyUsageBillingCatalog} from '../server/src/usageStripe.js';
import {installBillingRoutes} from '../server/src/billingRoutes.js';

test('annual Checkout waits for the verified monthly meter; SDK provisioning retries safely and survives a restart after provider success',async t=>{
  const f=fixture();t.after(()=>f.database.close());f.owner('A','QuoteDone','annual','trialing');
  const complete=f.subscription('A',{plan:'QuoteDone',interval:'annual',status:'trialing',trial:true});
  let current=structuredClone(complete);current.items.data.pop();
  assert.equal(f.service.captureVerifiedSubscription({ownerId:'A',subscription:current,sourceEventId:'evt_annual_checkout'}).status,'METER_SETUP_PENDING');
  assert.equal(f.service.getCallAllowanceDecision('A').canStartNewCall,false);
  let creates=0;const keys=[];
  const api=await apiFixture(t,req=>{
    if(req.method==='GET')return {body:current};
    assert.equal(req.path,'/v1/subscription_items');creates++;keys.push(req.idempotencyKey);
    assert.equal(req.parameters.get('subscription'),'sub_A');assert.equal(req.parameters.get('price'),'price_usage');
    assert.equal(req.parameters.get('proration_behavior'),'none');assert.equal(req.parameters.has('quantity'),false);
    if(creates===1)return {status:500,body:{error:{type:'api_error',message:'temporary'}}};
    current=complete;return {body:{...complete.items.data[1],object:'subscription_item',subscription:'sub_A'}};
  });
  await worker(f,api.stripe).runOnce();assert.equal(creates,1);
  assert.equal(f.service.getUsageSnapshot('A').available,false);
  f.setTime(f.clock()+30001);await worker(f,api.stripe).runOnce();
  assert.equal(creates,2);assert.equal(keys[0],keys[1]);
  assert.equal(f.service.getUsageSnapshot('A').includedMinutes,60);
  assert.equal(f.service.getCallAllowanceDecision('A').canStartNewCall,true);
  assert.equal(f.database.prepare("SELECT status FROM voiceUsageItemProvisioning WHERE ownerId='A'").get().status,'READY');
  // Simulate a restart after Stripe accepted the item but before a local ACK.
  f.database.prepare("UPDATE voiceUsageItemProvisioning SET status='RETRY' WHERE ownerId='A'").run();
  await worker(f,api.stripe).runOnce();assert.equal(creates,2);
});
test('annual meter provisioning checks the verified tenant binding and stops uncertain retries before Stripe deduplication expires',async t=>{
  const f=fixture();t.after(()=>f.database.close());f.owner('A','Operator','annual');
  const current=f.subscription('A',{interval:'annual'});current.items.data.pop();let creates=0;
  const stripe={subscriptions:{retrieve:async()=>current},subscriptionItems:{create:async()=>{creates++;throw Error('ambiguous');}}};
  await worker(f,stripe).runOnce();assert.equal(creates,1);
  f.setTime(f.clock()+23*3600000);await worker(f,stripe).runOnce();assert.equal(creates,1);
  assert.equal(f.database.prepare("SELECT status FROM voiceUsageItemProvisioning WHERE ownerId='A'").get().status,'REVIEW');
  const bad=structuredClone(current);bad.customer='cus_other';
  await worker(f,{subscriptions:{retrieve:async()=>bad},subscriptionItems:{create:async()=>{creates++;}}}).runOnce();
  assert.equal(creates,1);assert.equal(f.service.getUsageSnapshot('A').available,false);
});


// Recorded API-contract fixture from the official Meter Event response example.
// Values are substituted for this test's customer, period and identifier. This
// is not a recording from an authenticated Stripe account or an invoice proof.
const meterReceipt = parameters => ({object:'billing.meter_event',created:Math.floor(END/1000),
  event_name:parameters.get('event_name'),identifier:parameters.get('identifier'),livemode:false,
  payload:{value:parameters.get('payload[value]'),stripe_customer_id:parameters.get('payload[stripe_customer_id]')},
  timestamp:Number(parameters.get('timestamp'))});
async function apiFixture(t,handler) {
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const part of req)body+=part;
    const request={method:req.method,path:req.url,parameters:new URLSearchParams(body),
      idempotencyKey:req.headers['idempotency-key'],apiVersion:req.headers['stripe-version']};
    requests.push(request);
    try {
      const response=await handler(request,requests.length);
      res.writeHead(response.status||200,{'content-type':'application/json','request-id':'req_usage_fixture'});
      res.end(JSON.stringify(response.body));
    } catch {res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{type:'api_error',message:'fixture failure'}}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const stripe=new Stripe('sk_test_local_usage_fixture',{host:'127.0.0.1',port:server.address().port,protocol:'http',
    apiVersion:'2026-08-26.dahlia',maxNetworkRetries:0,timeout:1000});
  return {stripe,requests};
}
function ready(t,{interval='monthly',plan='Operator',owner='A',extra=5}={}) {
  const f=fixture();t.after(()=>f.database.close());f.owner(owner,plan,interval);f.capture(owner,{plan,interval});
  f.report(owner+'-overage',((plan==='Operator'?300:1200)+extra)*60000,{ownerId:owner});
  f.setTime(END+1000);return f;
}
const worker=(f,stripe,options={})=>createUsageReporter({database:f.database,ownerQuery:f.ownerQuery,service:f.service,
  stripeClient:stripe,usageConfig,providerEnabled:()=>true,clock:f.clock,log:()=>{},...options});
const submission=f=>f.database.prepare('SELECT * FROM voiceUsageSubmissions ORDER BY ownerId').all();

test('real Stripe SDK reports only overage to the bound customer and the original monthly period; retries use the same identity',async t=>{
  const f=ready(t);
  const api=await apiFixture(t,(request,n)=>{
    assert.equal(request.path,'/v1/billing/meter_events');assert.equal(request.method,'POST');
    return n===1?{status:500,body:{error:{type:'api_error',message:'temporary fixture failure'}}}:{body:meterReceipt(request.parameters)};
  });
  const w=worker(f,api.stripe);
  await w.runOnce({refresh:false});assert.equal(submission(f)[0].status,'RETRY');
  f.setTime(END+31001);await w.runOnce({refresh:false});
  assert.equal(submission(f)[0].status,'ACCEPTED');assert.equal(submission(f)[0].attempts,2);
  assert.equal(api.requests.length,2);
  for(const req of api.requests) {
    assert.equal(req.parameters.get('payload[value]'),'5');
    assert.equal(req.parameters.get('payload[stripe_customer_id]'),'cus_A');
    assert.equal(req.parameters.get('timestamp'),String(Math.floor((END-1)/1000)));
    assert.equal(req.parameters.get('event_name'),usageConfig.eventName);
    assert.equal(req.idempotencyKey,req.parameters.get('identifier'));
    assert.equal(req.apiVersion,'2026-08-26.dahlia');
    assert.deepEqual([...req.parameters.keys()].sort(),['event_name','identifier','payload[stripe_customer_id]','payload[value]','timestamp'].sort());
  }
  assert.equal(api.requests[0].idempotencyKey,api.requests[1].idempotencyKey);
  await w.runOnce({refresh:false});assert.equal(api.requests.length,2);
});
test('two tenants and an annual plan produce separate customer submissions with monthly, rather than annual, timestamps',async t=>{
  const f=ready(t,{interval:'annual',plan:'QuoteDone',extra:7});
  f.owner('B');f.capture('B');f.report('B-overage',305*60000,{ownerId:'B'});
  const api=await apiFixture(t,req=>({body:meterReceipt(req.parameters)}));
  await worker(f,api.stripe).runOnce({refresh:false});
  assert.deepEqual(api.requests.map(r=>[r.parameters.get('payload[stripe_customer_id]'),r.parameters.get('payload[value]')]).sort(),
    [['cus_A','7'],['cus_B','5']]);
  assert.ok(api.requests.every(r=>r.parameters.get('timestamp')===String(Math.floor((END-1)/1000))));
});
test('trial overrun, spam and unused included minutes never create Stripe events',async t=>{
  const f=fixture();t.after(()=>f.database.close());f.owner('A','Operator','monthly','trialing');f.capture('A',{status:'trialing',trial:true});
  f.report('trial',61*60000);f.owner('B');f.capture('B');f.report('spam',999*60000,{ownerId:'B',spamFiltered:true});f.report('included',300*60000,{ownerId:'B'});
  f.setTime(END+1000);
  const api=await apiFixture(t,()=>{throw Error('No provider call permitted');});
  await worker(f,api.stripe).runOnce({refresh:false});assert.equal(api.requests.length,0);assert.equal(submission(f).length,0);
});
test('a stalled Stripe request cannot block recording calls; worker shutdown waits for its in-flight delivery',async t=>{
  const f=ready(t);let entered,release;
  const begun=new Promise(resolve=>{entered=resolve;});
  const blocked=new Promise(resolve=>{release=resolve;});
  const stripe={billing:{meterEvents:{create:async parameters=>{entered();await blocked;return {...parameters,livemode:false};}}}};
  const w=worker(f,stripe),run=w.runOnce({refresh:false});await begun;
  assert.equal(w.runOnce({refresh:false}),run);
  assert.equal(f.report('while-stripe-pending',60001).minutesBilled,2);
  let stopped=false;const stop=w.stop().then(()=>{stopped=true;});
  await Promise.resolve();assert.equal(stopped,false);
  release();await stop;assert.equal(submission(f)[0].status,'ACCEPTED');
});
test('a fresh worker recovers an expired delivery lease using the durable identifier',async t=>{
  const f=ready(t);const period=f.service.getUsageHistory('A')[0].period;
  f.service.queueClosedPeriod('A',period.id);
  f.database.prepare("UPDATE voiceUsageSubmissions SET status='SENDING',attempts=1,firstAttemptMs=?,leaseUntilMs=?").run(END,END+500);
  const api=await apiFixture(t,req=>({body:meterReceipt(req.parameters)}));
  await worker(f,api.stripe).runOnce({refresh:false});
  assert.equal(submission(f)[0].status,'ACCEPTED');assert.equal(submission(f)[0].attempts,2);
  assert.equal(api.requests[0].idempotencyKey,submission(f)[0].id);
});
test('expired deduplication and Stripe timestamp windows require review instead of blind resubmission',async t=>{
  for(const mode of ['deduplication','timestamp']) {
    const f=ready(t);const period=f.service.getUsageHistory('A')[0].period;f.service.queueClosedPeriod('A',period.id);
    if(mode==='deduplication') {
      f.database.prepare("UPDATE voiceUsageSubmissions SET status='RETRY',firstAttemptMs=?,nextAttemptMs=?").run(END,END);
      f.setTime(END+23*3600000);
    } else f.setTime(END+36*86400000);
    let calls=0;const stripe={billing:{meterEvents:{create:()=>{calls++;throw Error('must not send');}}}};
    await worker(f,stripe).runOnce({refresh:false});assert.equal(calls,0);assert.equal(submission(f)[0].status,'REVIEW');
    assert.equal(submission(f)[0].lastErrorCode,mode==='deduplication'?'IDEMPOTENCY_WINDOW_EXPIRED':'STRIPE_TIMESTAMP_EXPIRED');
  }
});
test('a mismatched Stripe receipt is held for review',async t=>{
  const f=ready(t);
  const api=await apiFixture(t,req=>({body:{...meterReceipt(req.parameters),payload:{stripe_customer_id:'cus_other',value:'5'}}}));
  await worker(f,api.stripe).runOnce({refresh:false});
  assert.equal(submission(f)[0].status,'REVIEW');assert.equal(submission(f)[0].lastErrorCode,'STRIPE_USAGE_RECEIPT_MISMATCH');
});
test('a late completed call creates only its additional overage in the original window',async t=>{
  const f=ready(t);const api=await apiFixture(t,req=>({body:meterReceipt(req.parameters)}));const w=worker(f,api.stripe);
  await w.runOnce({refresh:false});f.setTime(END+61001);f.report('late-completion',60001,{start:END-1});
  await w.runOnce({refresh:false});
  assert.deepEqual(api.requests.map(r=>r.parameters.get('payload[value]')),['5','2']);
  assert.ok(api.requests.every(r=>r.parameters.get('timestamp')===String(Math.floor((END-1)/1000))));
});
test('verified subscription refresh obtains the next annual plan monthly window without changing entitlement',async t=>{
  const f=ready(t,{interval:'annual'}),next=f.subscription('A',{interval:'annual',start:END,end:Date.UTC(2026,2,31,15)});
  const stripe={subscriptions:{retrieve:async(id,params)=>{assert.equal(id,'sub_A');assert.deepEqual(params,{expand:['items.data.price']});return next;}},
    billing:{meterEvents:{create:async params=>({...params,livemode:false})}}};
  await worker(f,stripe).runOnce();
  assert.equal(f.service.getUsageSnapshot('A').includedMinutes,300);assert.equal(f.service.getUsageSnapshot('A').minutesUsed,0);
  assert.equal(f.database.prepare("SELECT planStatus FROM users WHERE id='A'").get().planStatus,'active');
});
test('provider writes disabled means no Stripe activity and no queued billing mutation',async t=>{
  const f=ready(t);const w=worker(f,{}, {providerEnabled:()=>false});
  assert.deepEqual(await w.runOnce(),{enabled:false});assert.equal(submission(f).length,0);
});

function catalog() {
  const price={id:'price_usage',active:true,livemode:false,type:'recurring',billing_scheme:'per_unit',unit_amount:35,unit_amount_decimal:'35',currency:'usd',
    recurring:{interval:'month',interval_count:1,usage_type:'metered',meter:'mtr_usage'}};
  const meter={id:'mtr_usage',status:'active',livemode:false,event_name:usageConfig.eventName,default_aggregation:{formula:'sum'},
    customer_mapping:{type:'by_id',event_payload_key:'stripe_customer_id'},value_settings:{event_payload_key:'value'}};
  const bases=Object.fromEntries(Object.entries(usageConfig.basePrices).map(([id,s])=>[id,{id,active:true,livemode:false,currency:'usd',billing_scheme:'per_unit',
    unit_amount:(s.plan==='Operator'?11900:27900)*(s.interval==='annual'?10:1),recurring:{interval:s.interval==='annual'?'year':'month',interval_count:1,usage_type:'licensed'}}]));
  return {price,meter,bases,stripe:{prices:{retrieve:async id=>id===price.id?price:bases[id]},billing:{meters:{retrieve:async()=>meter}}}};
}
test('catalog validation checks both locked base plans, annual prices and the monthly 35-cent sum meter',async()=>{
  await verifyUsageBillingCatalog(catalog().stripe,usageConfig);
  for(const mutate of [
    c=>{c.price.unit_amount=36;},c=>{c.price.unit_amount_decimal='35.5';},
    c=>{c.price.recurring.interval='year';},c=>{c.price.recurring.meter='mtr_other';},
    c=>{c.price.livemode=true;},c=>{c.price.transform_quantity={divide_by:10,round:'up'};},
    c=>{c.meter.default_aggregation.formula='count';},c=>{c.meter.event_time_window='hour';},
    c=>{c.meter.customer_mapping.event_payload_key='tenant';},
    c=>{c.bases.price_operator_year.unit_amount=11900;},c=>{c.bases.price_quote.currency='cad';},
    c=>{c.bases.price_quote.recurring.usage_type='metered';}
  ]) {const c=catalog();mutate(c);await assert.rejects(verifyUsageBillingCatalog(c.stripe,usageConfig));}
});
test('production billing refuses missing usage configuration and prevents confusing base and overage prices',()=>{
  const prices={Operator:{monthly:'price_operator',annual:'price_operator_year'},QuoteDone:{monthly:'price_quote',annual:'price_quote_year'}};
  const env={STRIPE_USAGE_ENABLED:'true',STRIPE_OVERAGE_MONTHLY_PRICE_ID:'price_usage',STRIPE_USAGE_METER_ID:'mtr_usage',
    STRIPE_USAGE_EVENT_NAME:usageConfig.eventName,STRIPE_SECRET_KEY:'sk_test_fixture'};
  assert.equal(loadUsageBillingConfig(env,prices,{production:true}).livemode,false);
  for(const name of ['STRIPE_USAGE_ENABLED','STRIPE_OVERAGE_MONTHLY_PRICE_ID','STRIPE_USAGE_METER_ID','STRIPE_USAGE_EVENT_NAME']) {
    const bad={...env};delete bad[name];assert.throws(()=>loadUsageBillingConfig(bad,prices,{production:true}));
  }
  assert.throws(()=>loadUsageBillingConfig({...env,STRIPE_OVERAGE_MONTHLY_PRICE_ID:'price_operator'},prices,{production:true}));
});
test('annual and monthly Checkout persist the metered item and flexible billing; a retry preserves the provider parameters',async t=>{
  for(const interval of ['monthly','annual']) {
    const f=fixture();t.after(()=>f.database.close());f.owner();
    f.database.prepare("UPDATE billingAccounts SET stripeSubscriptionId=NULL WHERE ownerId='A'").run();
    const routes=[];let attempt=0;const calls=[];
    installBillingRoutes({get:(path,...handlers)=>routes.push({path,handlers}),post:(path,...handlers)=>routes.push({path,handlers})},{
      database:f.database,billingStateService:{registerBillingCustomer(){}},requireAuth:()=>((_req,_res,next)=>next()),requireProviderWrites:(_req,_res,next)=>next(),
      asyncHandler:fn=>fn,usageConfig,priceIds:{Operator:{monthly:'price_operator',annual:'price_operator_year'},QuoteDone:{monthly:'price_quote',annual:'price_quote_year'}},
      successUrl:'https://app.fixture.invalid/billing/success',cancelUrl:'https://app.fixture.invalid/billing/cancel',
      portalReturnUrl:'https://app.fixture.invalid/billing',integrationIdentifier:'usage_checkout_abcdefgh',checkoutReceiptEncryptionKey:'11'.repeat(32),
      clock:()=>new Date(f.clock()),stripeClient:{customers:{create:async()=>({id:'cus_A'})},billingPortal:{sessions:{create:async()=>({url:'https://billing.stripe.com/fixture'})}},checkout:{sessions:{create:async(params,options)=>{
        calls.push({params,options});if(++attempt===1)throw Error('ambiguous provider failure');
        return {id:'cs_fixture',mode:'subscription',status:'open',customer:'cus_A',created:Math.floor(f.clock()/1000),
          expires_at:Math.floor(f.clock()/1000)+3600,url:'https://checkout.stripe.com/c/pay/fixture'};
      }}}}
    });
    const req={tenantOwnerId:'A',body:{plan:'QuoteDone',billingInterval:interval},get:name=>name==='Idempotency-Key'?'checkout-fixture-key':undefined};
    const res={statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return body;}};
    const handler=routes.find(r=>r.path==='/api/billing/checkout').handlers.at(-1);
    await assert.rejects(handler(req,res));await handler(req,res);
    assert.equal(res.statusCode,201);assert.deepEqual(calls[0],calls[1]);
    assert.deepEqual(calls[1].params.line_items,[{price:interval==='annual'?'price_quote_year':'price_quote',quantity:1},...(interval==='annual'?[]:[{price:'price_usage'}])]);
    assert.deepEqual(calls[1].params.subscription_data.billing_mode,{type:'flexible'});
    assert.equal(calls[1].params.payment_method_collection,'always');
    assert.equal(calls[1].params.subscription_data.trial_period_days,14);
    assert.equal(f.database.prepare("SELECT stripeUsagePriceId FROM billingCheckoutRequests WHERE ownerId='A'").get().stripeUsagePriceId,'price_usage');
  }
});

