import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import Stripe from 'stripe';
import {migrateDatabase} from '../server/src/migrations.js';
import {createBillingStateService} from '../server/src/billingStateService.js';
import {installBillingRoutes,installBillingWebhookRoute} from '../server/src/billingRoutes.js';
const T=1791288000, day=86400;
const iso=t=>new Date(t*1000).toISOString();
const catalogue={Starter:{monthly:'price_SYNTHETIC_starter_month',annual:'price_SYNTHETIC_starter_year'},
  Operator:{monthly:'price_op_month',annual:'price_op_year'},QuoteDone:{monthly:'price_qd_month',annual:'price_qd_year'}};
const amounts={price_op_month:11900,price_op_year:119000,price_qd_month:27900,price_qd_year:279000};
const rows=[];
function harness({filename=':memory:',resume=false}={}){
 const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON');migrateDatabase(db);
 if(!resume)for(const id of ['SYNTHETIC-A','SYNTHETIC-B'])db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Billing','Operator','pending_payment','UTC','owner',?)").run(id,id+'@example.invalid',iso(T));
 let at=T;
 const service=createBillingStateService({db,pricePlanMap:Object.fromEntries(Object.entries(catalogue).flatMap(([plan,intervals])=>Object.values(intervals).map(price=>[price,plan]))),clock:()=>new Date(at*1000)});
 service.registerBillingCustomer({ownerId:'SYNTHETIC-A',stripeCustomerId:'cus_A'});
 const get=()=>({...db.prepare('SELECT * FROM users WHERE id=?').get('SYNTHETIC-A')});
 const billing=()=>({...db.prepare('SELECT * FROM billingAccounts WHERE ownerId=?').get('SYNTHETIC-A')});
 const sub=(id,offset=0,extra={})=>({id,type:'customer.subscription.updated',created:T+offset,livemode:false,data:{object:{id:'sub_A',customer:'cus_A',status:'active',default_payment_method:'pm_SYNTHETIC',items:{data:[{price:{id:'price_op_month'}}]},current_period_end:T+30*day,cancel_at_period_end:false,...extra}}});
 const inv=(id,offset=0,extra={})=>({id,type:'invoice.paid',created:T+offset,livemode:false,data:{object:{id:'in_'+id,customer:'cus_A',subscription:'sub_A',status:'paid',amount_paid:11900,lines:{data:[{price:{id:'price_op_month'}}]},...extra}}});
 const checkout=(id,offset=0,extra={})=>({id,type:'checkout.session.completed',created:T+offset,livemode:false,data:{object:{id:'cs_A',mode:'subscription',customer:'cus_A',subscription:'sub_A',status:'complete',payment_status:'no_payment_required',line_items:{data:[{price:{id:'price_op_month'}}]},...extra}}});
 return {db,service,get,billing,sub,inv,checkout,setTime:t=>{at=t;},now:()=>at};
}
async function httpHarness(h){
 const app=express(),verifier=new Stripe('sk_test_SYNTHETIC_NEVER_NETWORK'),secret='whsec_SYNTHETIC_ONLY';
 const calls={customer:[],checkout:[],portal:[],retrieve:[]},sessions=new Map();
 const subscriptions=new Map(), invoices=new Map();
 const stub={subscriptions:{retrieve:async id=>subscriptions.get(id),list:async()=>({data:[...subscriptions.values()],has_more:false})},invoices:{retrieve:async id=>invoices.get(id)},customers:{create:async(p,o)=>{calls.customer.push({p,o});return {id:'cus_A'};}},checkout:{sessions:{
  create:async(p,o)=>{
   calls.checkout.push({p,o});const prior=[...sessions.values()].find(s=>s.key===o.idempotencyKey);if(prior)return prior;
   const s={id:'cs_'+calls.checkout.length,customer:p.customer,mode:'subscription',status:'open',created:h.now(),expires_at:h.now()+3600,url:'https://checkout.example.invalid/'+calls.checkout.length,key:o.idempotencyKey,line_items:{data:p.line_items.map(l=>({price:{id:l.price},quantity:l.quantity}))}};sessions.set(s.id,s);return s;
  },retrieve:async id=>{calls.retrieve.push(id);return sessions.get(id);}
 }},billingPortal:{sessions:{create:async(p,o)=>{calls.portal.push({p,o});return {url:'https://billing.example.invalid/session'};}}}};
 installBillingWebhookRoute(app,{rawBodyMiddleware:express.raw({type:'application/json'}),constructEvent:(...a)=>verifier.webhooks.constructEvent(...a),webhookSecret:secret,billingStateService:h.service,stripeClient:stub});app.use(express.json());
 const requireAuth=roles=>(req,res,next)=>{if(!roles.includes(req.get('X-Synthetic-Role')||'owner'))return res.status(403).json({error:'SYNTHETIC role denied'});req.tenantOwnerId=req.get('X-Synthetic-Owner')||'SYNTHETIC-A';next();};
 installBillingRoutes(app,{stripeClient:stub,billingStateService:h.service,database:h.db,requireAuth,requireProviderWrites:(_q,_r,n)=>n(),asyncHandler:f=>(q,r,n)=>Promise.resolve(f(q,r,n)).catch(n),priceIds:catalogue,successUrl:'https://app.example.invalid/billing?checkout=success',cancelUrl:'https://app.example.invalid/billing?checkout=cancel',portalReturnUrl:'https://app.example.invalid/billing',integrationIdentifier:'synthetic_audit_abcdefgh',checkoutReceiptEncryptionKey:'33'.repeat(32),clock:()=>new Date(h.now()*1000)});
 app.use((e,q,r,n)=>r.status(e.statusCode||500).json({code:e.code||'ERROR'}));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
 const base='http://127.0.0.1:'+server.address().port;
 async function request(path,{body,key='synthetic-key-1234',headers={},raw,signature}={}){
  const res=await fetch(base+path,{method:body===undefined&&raw===undefined?'GET':'POST',headers:{'content-type':'application/json','idempotency-key':key,...headers,...(signature?{'stripe-signature':signature}:{})},body:raw??(body===undefined?undefined:JSON.stringify(body))});return {status:res.status,body:await res.json()};
 }
 async function send(event,options={}){const raw=JSON.stringify(event);const signature=verifier.webhooks.generateTestHeaderString({payload:raw,secret:options.bad?'whsec_WRONG':secret,...(options.timestamp?{timestamp:options.timestamp}:{})});return request('/api/stripe/webhook',{raw:options.tamper?raw+' ':raw,signature});}
 return {request,send,calls,sessions,subscriptions,invoices,stub,close:async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

export {T,day,iso,catalogue,amounts,harness,httpHarness};
