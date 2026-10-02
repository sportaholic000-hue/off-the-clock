import Database from 'better-sqlite3';
import {migrateDatabase} from '../../server/src/migrations.js';
import {createCallUsageService} from '../../server/src/callUsageService.js';
export const START = Date.UTC(2026,0,31,15);
export const END = Date.UTC(2026,1,28,15);
export const usageConfig = {priceId:'price_usage',meterId:'mtr_usage',eventName:'otc_voice_overage',livemode:false,
  basePrices:{price_operator:{plan:'Operator',interval:'monthly'},price_quote:{plan:'QuoteDone',interval:'monthly'},
    price_operator_year:{plan:'Operator',interval:'annual'},price_quote_year:{plan:'QuoteDone',interval:'annual'}}};
export function fixture({filename=':memory:',now=START+86400000}={}) {
  const database=new Database(filename);database.pragma('foreign_keys=ON');database.pragma('busy_timeout=10000');
  if(filename!==':memory:')database.pragma('journal_mode=WAL');
  migrateDatabase(database);
  let time=now;
  const ownerQuery=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Tenant query lacks ownerId');return database.prepare(sql);};
  const service=createCallUsageService({database,ownerQuery,usageConfig,clock:()=>time});
  function owner(id='A',plan='Operator',interval='monthly',status='active') {
    const price=plan==='Operator'?'price_operator':'price_quote',priceId=price+(interval==='annual'?'_year':'');
    const iso=new Date(START).toISOString();
    database.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,role,createdAt) VALUES (?,?,?,?,?,?,'owner',?)")
      .run(id,id+'@usage-fixture.invalid','unused','Fixture','Fixture '+id,plan,iso);
    database.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,stripeSubscriptionId,stripePriceId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)')
      .run(id,'cus_'+id,'sub_'+id,priceId,iso,iso,iso);
    database.prepare('UPDATE users SET planStatus=?,trialEndsAt=? WHERE id=?').run(status,status==='trialing'?new Date(START+14*86400000).toISOString():null,id);
    return id;
  }
  function subscription(id='A',{plan='Operator',interval='monthly',start=START,end=END,status='active',trial=false}={}) {
    const priceId=(plan==='Operator'?'price_operator':'price_quote')+(interval==='annual'?'_year':'');
    const currency='usd';
    return {id:'sub_'+id,object:'subscription',customer:'cus_'+id,livemode:false,status,billing_mode:{type:'flexible'},
      default_payment_method:'pm_fixture',created:START/1000,
      ...(trial?{trial_start:START/1000,trial_end:(START+14*86400000)/1000}:{}),
      items:{has_more:false,data:[
        {id:'si_base_'+id,price:{id:priceId,currency,recurring:{interval:interval==='annual'?'year':'month',interval_count:1,usage_type:'licensed'}},
          current_period_start:start/1000,current_period_end:(interval==='annual'?Date.UTC(2027,0,31,15):end)/1000},
        {id:'si_usage_'+id,price:{id:'price_usage',currency,unit_amount:35,recurring:{interval:'month',interval_count:1,usage_type:'metered',meter:'mtr_usage'}},
          current_period_start:start/1000,current_period_end:end/1000}
      ]}};
  }
  let event=0;
  function capture(id='A',options={}) {
    return service.captureVerifiedSubscription({ownerId:id,subscription:subscription(id,options),sourceEventId:'evt_fixture_'+(++event)});
  }
  function report(callId,durationMs,{ownerId='A',start=START+1000,spamFiltered=false}={}) {
    return service.recordCompletedCall({tenantOwnerId:ownerId,callId,answeredStartAt:new Date(start).toISOString(),
      answeredEndAt:new Date(start+durationMs).toISOString(),spamFiltered});
  }
  return {database,ownerQuery,service,owner,subscription,capture,report,setTime:value=>{time=value;},clock:()=>time};
}

