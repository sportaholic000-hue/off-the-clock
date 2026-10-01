import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import express from 'express';
import Stripe from 'stripe';

// Uses production handlers, migrations, sessions and billing state with synthetic
// Stripe responses. No provider calls, email delivery, or phone runtime is involved.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-launch-plan-'));
process.env.DATABASE_PATH = path.join(directory, 'account.sqlite');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'SYNTHETIC_LAUNCH_PLAN_JWT_SECRET_DO_NOT_USE_IN_PRODUCTION';
const {db, migrate} = await import('../../server/src/db.js');
migrate();
const {createAuthHandlers, requireAuth} = await import('../../server/src/auth.js');
const {onboardingState, updateOnboardingAccount} = await import('../../server/src/onboardingService.js');
const {createBillingStateService} = await import('../../server/src/billingStateService.js');
const {installBillingRoutes, installBillingWebhookRoute} = await import('../../server/src/billingRoutes.js');
const stripeVerifier = new Stripe('sk_test_SYNTHETIC_FIXTURE_ONLY');
const webhookSecret = 'whsec_SYNTHETIC_FIXTURE_ONLY';
const priceIds = {
  Operator: {monthly:'price_operator_month', annual:'price_operator_year'},
  QuoteDone: {monthly:'price_quote_month', annual:'price_quote_year'}
};
const pricePlanMap = new Map(Object.entries(priceIds).flatMap(([plan,intervals]) =>
  Object.values(intervals).map(price => [price,{plan,kind:'base'}])));
const asyncHandler = handler => (req,res,next) => Promise.resolve(handler(req,res,next)).catch(next);

export async function createLaunchPlanFixture({dist, port=0}={}) {
  const app = express(), calls = {customer:[],checkout:[]}, mail=[];
  const customerSessions = new Map();
  const billing = createBillingStateService({db,pricePlanMap});
  const stripeClient = {
    customers:{create:async parameters=>{
      const customer={id:'cus_'+crypto.randomUUID().replaceAll('-','')};
      calls.customer.push({parameters,customer});return customer;
    }},
    checkout:{sessions:{
      create:async parameters=>{
        const created=Math.floor(Date.now()/1000);
        const session={id:'cs_'+crypto.randomUUID().replaceAll('-',''),customer:parameters.customer,
          mode:'subscription',status:'open',created,expires_at:created+3600,url:'https://checkout.stripe.com/c/pay/synthetic_launch'};
        calls.checkout.push({parameters,session});customerSessions.set(session.customer,session);
        return session;
      },
      retrieve:async id=>{
        const row=calls.checkout.find(row=>row.session.id===id);
        if(!row)throw Error('Unknown synthetic session');
        return {...row.session,subscription:'sub_'+row.session.id,
          line_items:{data:[{price:{id:row.parameters.line_items[0].price}}]}};
      }
    }},
    billingPortal:{sessions:{create:async()=>({url:'https://billing.stripe.com/p/session/synthetic_launch'})}}
  };
  installBillingWebhookRoute(app,{rawBodyMiddleware:express.raw({type:'application/json'}),
    constructEvent:(...args)=>stripeVerifier.webhooks.constructEvent(...args),
    webhookSecret,billingStateService:billing,stripeClient});
  app.use(express.json());
  const server=await new Promise(resolve=>{const listener=app.listen(port,'127.0.0.1',()=>resolve(listener));});
  server.unref();
  const origin='http://127.0.0.1:'+server.address().port;
  const handlers=createAuthHandlers({database:db,environment:{NODE_ENV:'test',JWT_SECRET:process.env.JWT_SECRET,
    CLIENT_URL:origin,BCRYPT_COST:12},sendEmail:async message=>{mail.push(message);return {accepted:true};}});
  for(const [route,handler] of [['register',handlers.register],['login',handlers.login],
    ['forgot-password',handlers.forgotPassword],['reset-password',handlers.resetPassword]]) {
    app.post('/api/auth/'+route,asyncHandler(handler));
  }
  app.get('/api/auth/account',requireAuth(['owner']),handlers.accountStatus);
  app.post('/api/auth/account/resend-verification',requireAuth(['owner']),asyncHandler(handlers.resendVerification));
  app.post('/api/auth/refresh',handlers.refresh);
  app.post('/api/auth/logout',handlers.logout);
  installBillingRoutes(app,{stripeClient,billingStateService:billing,database:db,requireAuth,
    requireProviderWrites:(_req,_res,next)=>next(),asyncHandler,priceIds,
    successUrl:origin+'/settings/billing?checkout=success',cancelUrl:origin+'/settings/billing?checkout=cancel',
    portalReturnUrl:origin+'/settings/billing',integrationIdentifier:'launch_plan_fixture_abcdefgh',
    checkoutReceiptEncryptionKey:'11'.repeat(32),allowInsecureLoopback:true});
  app.get('/api/onboarding/state',requireAuth(['owner']),(req,res)=>res.json(onboardingState(req.tenantOwnerId)));
  app.post('/api/onboarding/account',requireAuth(['owner']),(req,res)=>
    res.json({account:updateOnboardingAccount(req.tenantOwnerId,req.body)}));
  app.get('/api/pricebook/meta',requireAuth(['owner']),(_req,res)=>res.json({services:[]}));
  if(dist) {
    app.use(express.static(dist));
    app.get('*',(_req,res)=>res.sendFile(path.join(dist,'index.html')));
  }
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message,code:error.code}));
  async function request(route,{token,body,method=body===undefined?'GET':'POST',key,signature,raw}={}) {
    const response=await fetch(origin+route,{method,headers:{
      ...(body!==undefined||raw?{'Content-Type':'application/json'}:{}),
      ...(token?{Authorization:'Bearer '+token}:{}),
      ...(key?{'Idempotency-Key':key}:{}),
      ...(signature?{'Stripe-Signature':signature}: {})
    },body:raw??(body===undefined?undefined:JSON.stringify(body))});
    return {status:response.status,body:await response.json()};
  }
  async function sendEvent(event,{badSignature=false}={}) {
    const raw=JSON.stringify(event);
    const signature=stripeVerifier.webhooks.generateTestHeaderString({payload:raw,
      secret:badSignature?'whsec_WRONG_SYNTHETIC':webhookSecret});
    return request('/api/stripe/webhook',{method:'POST',raw,signature});
  }
  async function completeCheckout(ownerId,{status='trialing',paymentMethod=true}={}) {
    const account=db.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get(ownerId);
    const session=customerSessions.get(account.stripeCustomerId);
    const row=calls.checkout.find(row=>row.session.id===session.id);
    const price=row.parameters.line_items[0].price, subscription='sub_'+session.id;
    const created=Math.floor(Date.now()/1000);
    const checkout={id:'evt_'+crypto.randomUUID(),created,type:'checkout.session.completed',livemode:false,
      data:{object:{id:session.id,object:'checkout.session',mode:'subscription',customer:session.customer,
        subscription,status:'complete',payment_status:'no_payment_required',
        line_items:{data:[{price:{id:price}}]}}}};
    const first=await sendEvent(checkout);
    const afterCheckout=db.prepare('SELECT plan,planStatus,trialEndsAt FROM users WHERE id=?').get(ownerId);
    const subscriptionEvent={id:'evt_'+crypto.randomUUID(),created:created+1,
      type:'customer.subscription.created',livemode:false,data:{object:{
        id:subscription,object:'subscription',customer:session.customer,status,
        default_payment_method:paymentMethod?'pm_SYNTHETIC_VERIFIED':null,
        created,trial_start:status==='trialing'?created:null,
        trial_end:status==='trialing'?created+14*86400:null,current_period_end:created+30*86400,
        cancel_at_period_end:false,items:{data:[{price:{id:price}}]}
      }}};
    const second=await sendEvent(subscriptionEvent);
    return {first,second,afterCheckout,subscriptionEvent};
  }
  return {origin,request,sendEvent,completeCheckout,db,calls,mail,priceIds,
    close:()=>new Promise(resolve=>server.close(resolve))};
}
export function closeLaunchPlanDatabase(){db.close();}
