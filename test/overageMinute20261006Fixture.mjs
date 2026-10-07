import {DatabaseSync} from 'node:sqlite';
import {migrateDatabase} from '../server/src/migrations.js';
import {createBillingStateService} from '../server/src/billingStateService.js';
import {createBillingVoiceUsage} from '../server/src/billingVoiceUsage.js';
import {createBillingMinuteService} from '../server/src/billingMinuteService.js';
import {createStripeOverageProvider} from '../server/src/billingOverageProvider.js';
import {MINUTE_PLANS,monthlyAnniversary} from '../server/src/billingUsagePolicy.js';
import assert from 'node:assert/strict';

export const A='SYNTHETIC-owner-a',B='SYNTHETIC-owner-b';
export const SIGNUP='2026-10-06T12:00:00.000Z',START='2026-10-20T12:00:00.000Z';
export const prices={Operator:{monthly:'price_SYNTHETIC_op_month',annual:'price_SYNTHETIC_op_year'},QuoteDone:{monthly:'price_SYNTHETIC_qd_month',annual:'price_SYNTHETIC_qd_year'}};
const copy=value=>JSON.parse(JSON.stringify(value));
const sec=iso=>Date.parse(iso)/1000;
export function fakeProviders(){
  const invoices=new Map(),items=new Map(),subscriptions=new Map(),keys=new Map(),mail=new Map(),faults=new Map();
  const writes={invoice:[],item:[],finalize:[],email:[]};let barrier=null;
  async function mutate(kind,p,o,work){
    writes[kind].push({p:copy(p),key:o.idempotencyKey});
    const prior=keys.get(o.idempotencyKey);if(prior){assert.equal(prior.input,JSON.stringify(p));return copy(prior.result);}
    const fault=faults.get(kind);faults.delete(kind);if(fault==='before')throw Error('SYNTHETIC provider unavailable');
    if(barrier&&kind==='invoice')await barrier;
    const result=work();keys.set(o.idempotencyKey,{input:JSON.stringify(p),result:copy(result)});
    if(fault==='after')throw Error('SYNTHETIC response lost after acceptance');return copy(result);
  }
  const stripe={prices:{retrieve:async id=>{for(const [plan,catalog] of Object.entries(prices))for(const [interval,pid] of Object.entries(catalog))if(pid===id)return {id,unit_amount:MINUTE_PLANS[plan][interval==='annual'?'annualCents':'monthlyCents'],currency:'cad',recurring:{interval:interval==='annual'?'year':'month',interval_count:1}};throw Error('SYNTHETIC unknown price');}},
    subscriptions:{retrieve:async id=>copy(subscriptions.get(id))},
    invoices:{list:async({customer})=>({data:[...invoices.values()].filter(i=>i.customer===customer).map(copy),has_more:false}),retrieve:async id=>copy(invoices.get(id)),
      create:async(p,o)=>mutate('invoice',p,o,()=>{const id='in_SYNTHETIC_'+(invoices.size+1),row={...p,id,status:'draft',subtotal:0,amount_remaining:0};invoices.set(id,row);return row;}),
      finalizeInvoice:async(id,p,o)=>mutate('finalize',{id,...p},o,()=>{const row=invoices.get(id);row.status='paid';row.amount_remaining=0;return row;})},
    invoiceItems:{list:async({invoice})=>({data:[...items.values()].filter(i=>i.invoice===invoice).map(copy),has_more:false}),
      create:async(p,o)=>mutate('item',p,o,()=>{const id='ii_SYNTHETIC_'+(items.size+1),row={id,...p};items.set(id,row);invoices.get(p.invoice).subtotal+=p.amount;return row;})}
  };
  const email={async send(message){
    writes.email.push(copy(message));const prior=mail.get(message.idempotencyKey);if(prior){assert.deepEqual(prior.message,message);return {id:prior.id,accepted:true};}
    const fault=faults.get('email');faults.delete('email');if(fault==='before')throw Error('SYNTHETIC email unavailable');
    const row={id:'mail_SYNTHETIC_'+(mail.size+1),message:copy(message)};mail.set(message.idempotencyKey,row);
    if(fault==='after')throw Error('SYNTHETIC lost email response');return {id:row.id,accepted:true};
  },async read(id){const row=[...mail.values()].find(r=>r.id===id);return {id,to:[row.message.to],subject:row.message.subject,last_event:'delivered'};}};
  return {stripe,email,invoices,items,subscriptions,keys,mail,writes,fail:(kind,when='before')=>faults.set(kind,when),blockInvoice:p=>{barrier=p;}};
}
export function fixture(t,{filename=':memory:',resume=false,fakes=fakeProviders(),observe=true}={}){
  const db=new DatabaseSync(filename);db.exec('PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000');migrateDatabase(db);let closed=false;
  const close=()=>{if(!closed){closed=true;db.close();}};t?.after(close);
  let time=new Date(START),sequence=0,event=0;
  const clock=()=>new Date(time),setTime=value=>{time=new Date(value);};
  const billing=createBillingStateService({db,priceIds:prices,pricePlanMap:Object.fromEntries(Object.entries(prices).flatMap(([plan,ids])=>Object.values(ids).map(id=>[id,plan]))),clock});
  let enabled=true;
  const options={database:db,priceIds:prices,clock,paymentProvider:createStripeOverageProvider({stripeClient:fakes.stripe}),emailProvider:fakes.email,enabled:()=>enabled};
  const service=createBillingMinuteService(options);
  const meter=createBillingVoiceUsage({database:db,clock,onUsage:observe?id=>service.syncOwner(id):()=>{}});
  function subscription(ownerId=A,{plan='Operator',interval='monthly',status='active',start=START,end=monthlyAnniversary(start,interval==='annual'?12:1),...extra}={}){
    const object={id:'sub_'+ownerId,customer:'cus_'+ownerId,status,default_payment_method:'pm_'+ownerId,trial_start:sec(SIGNUP),trial_end:sec(START),billing_cycle_anchor:sec(START),
      current_period_start:sec(start),current_period_end:sec(end),cancel_at_period_end:false,
      items:{data:[{price:{id:prices[plan][interval],currency:'cad',recurring:{interval:interval==='annual'?'year':'month',interval_count:1}}}]},...extra};
    fakes.subscriptions.set(object.id,copy(object));
    billing.applyVerifiedStripeEvent({id:'evt_SYNTHETIC_sub_'+(++event),type:status==='canceled'?'customer.subscription.deleted':'customer.subscription.updated',created:sec(clock().toISOString())+event,livemode:false,data:{object}});
    return object;
  }
  function paid(ownerId=A,{plan='Operator',interval='monthly',start=START,end=monthlyAnniversary(start,interval==='annual'?12:1),amount=MINUTE_PLANS[plan][interval==='annual'?'annualCents':'monthlyCents']}={}){
    const invoice={id:'in_SYNTHETIC_base_'+(++event),customer:'cus_'+ownerId,subscription:'sub_'+ownerId,status:'paid',amount_paid:amount,
      period_start:sec(start),period_end:sec(end),lines:{data:[{price:{id:prices[plan][interval]},amount,quantity:1,period:{start:sec(start),end:sec(end)}}]}};
    billing.applyVerifiedStripeEvent({id:'evt_SYNTHETIC_paid_'+event,type:'invoice.paid',created:sec(clock().toISOString())+event,livemode:false,data:{object:invoice}});return invoice;
  }
  function activate(ownerId=A,options={}){const sub=subscription(ownerId,options);paid(ownerId,options);return sub;}
  if(!resume)for(const id of [A,B]){
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Billing','Operator','pending_payment','UTC','owner',?)").run(id,id+'@example.invalid',SIGNUP);
    billing.registerBillingCustomer({ownerId:id,stripeCustomerId:'cus_'+id});
  }
  function call(seconds,{ownerId=A,at=clock().toISOString(),provider=true,localSeconds=seconds,spam=false,fallback=false}={}){
    setTime(at);const id='SYNTHETIC-call-'+(++sequence),context={ownerId,callSid:'CA'+sequence.toString(16).padStart(32,'0'),accountSid:'AC'+'a'.repeat(32),from:'+19025550100',to:ownerId===A?'+19025550101':'+19025550102'};
    db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,minutesBilled,spamFiltered,createdAt) VALUES(?,?,?,?,?,?,'CONNECTED',0,?,?)").run(id,ownerId,context.callSid,context.accountSid,context.from,context.to,spam?1:0,at);
    meter.start(context,id);setTime(Date.parse(at)+localSeconds*1000);
    if(fallback)db.prepare("UPDATE calls SET status='AI_FALLBACK',outcome='AI_FALLBACK' WHERE ownerId=? AND id=?").run(ownerId,id);
    meter.finish(context,id,{status:'COMPLETED',outcome:'SYNTHETIC_END',failureCode:null,streamSid:null});
    const receipt={AccountSid:context.accountSid,CallSid:context.callSid,From:context.from,To:context.to,CallStatus:'completed',CallDuration:String(seconds),Direction:'inbound'};
    if(provider)meter.providerComplete(receipt);
    return {id,context,receipt};
  }
  return {db,close,clock,setTime,billing,service,meter,options,fakes,subscription,paid,activate,call,disable:()=>{enabled=false;},enable:()=>{enabled=true;}};
}
