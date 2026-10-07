import {randomUUID,createHash} from 'node:crypto';
import {billingReference,billingPrice,billingIso,createBillingEvidence} from './billingEvidence.js';
import {billingUsageId,billingMoney,MINUTE_PLANS,monthlyAnniversary,usageOwnerQuery,usageTransaction} from './billingUsagePolicy.js';
import {withBillingLease,billingProviderRead,BILLING_PROVIDER_OPTIONS} from './billingProvider.js';
import {createOwnerEmailDelivery} from './ownerEmailDelivery.js';

const DAY=86400000;
const error=(code,statusCode=409)=>Object.assign(new Error(code),{code,statusCode});
const addDays=(at,days)=>new Date(Date.parse(at)+days*DAY).toISOString();
// Called only after the minute service verifies the signed/provider invoice
// against its frozen customer, invoice ID, amount, currency and usage digest.
export function recordUsageInvoicePayment(database,{ownerId,period,charge,invoice,at}){
  return usageTransaction(database,()=>{
    const query=usageOwnerQuery(database),account=query(`SELECT b.*,u.planStatus FROM billingAccounts b
      JOIN users u ON u.id=b.ownerId WHERE b.ownerId=?`).get(ownerId);
    const object={...invoice,subscription:period.stripeSubscriptionId,
      amount_paid:Number.isSafeInteger(invoice.amount_paid)?invoice.amount_paid:charge.amountCents};
    const paid=invoice.status==='paid',evidence=createBillingEvidence({db:database,fail:code=>error(code,502)});
    evidence.recordInvoice({ownerId,customerId:period.stripeCustomerId,subscriptionId:period.stripeSubscriptionId,object,paid,created:Math.floor(Date.parse(at)/1000)});
    if(account?.stripeSubscriptionId!==period.stripeSubscriptionId)return;
    const debt=evidence.debt(ownerId,period.stripeSubscriptionId),hold=query('SELECT reason FROM billingRecoveryHolds WHERE ownerId=? AND stripeSubscriptionId=?').get(ownerId,period.stripeSubscriptionId);
    if(debt.count){
      const failedAt=[billingIso(debt.failedAt),account.paymentFailedAt].filter(Boolean).sort()[0],graceEndsAt=addDays(failedAt,7);
      query('UPDATE billingAccounts SET paymentFailedAt=?,graceEndsAt=?,updatedAt=? WHERE ownerId=?').run(failedAt,graceEndsAt,at,ownerId);
      query("UPDATE users SET paymentFailedAt=@failedAt,planStatus=CASE WHEN planStatus='canceled' THEN planStatus ELSE @status END WHERE id=@ownerId AND role='owner'")
        .run({ownerId,failedAt,status:at>=graceEndsAt?'suspended':'payment_failed'});
    }else if(!hold){
      const sub=query('SELECT stateJson FROM billingSubscriptionEvidence WHERE ownerId=? AND stripeSubscriptionId=? AND ambiguous=0').get(ownerId,period.stripeSubscriptionId);
      const facts=sub?JSON.parse(sub.stateJson):null;
      if(facts?.status==='active'&&account.paymentMethodVerifiedAt){
        query('UPDATE billingAccounts SET paymentFailedAt=NULL,graceEndsAt=NULL,updatedAt=? WHERE ownerId=?').run(at,ownerId);
        query("UPDATE users SET paymentFailedAt=NULL,planStatus=CASE WHEN planStatus='canceled' THEN planStatus ELSE 'active' END WHERE id=@ownerId AND role='owner'").run({ownerId});
      }
    }
  });
}
export function installBillingLifecycleSchema(database){
  database.exec(`CREATE TABLE IF NOT EXISTS billingLifecycleNotices (
    id TEXT PRIMARY KEY REFERENCES outboxEvents(id),ownerId TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,
    referenceId TEXT NOT NULL,message TEXT NOT NULL,amountCents INTEGER,currency TEXT,dueAt TEXT,createdAt TEXT NOT NULL,
    UNIQUE(ownerId,kind,referenceId));
    CREATE TABLE IF NOT EXISTS billingCancellations (
    ownerId TEXT PRIMARY KEY REFERENCES users(id),stripeSubscriptionId TEXT NOT NULL,operationId TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('PENDING','CONFIRMED','ENDED','RESTORING','RESTORED')),
    endAt TEXT NOT NULL,requestedAt TEXT NOT NULL,confirmedAt TEXT,endedAt TEXT,
    operatorWasEnabled INTEGER NOT NULL DEFAULT 0,forwardingOffAt TEXT,phoneReleasedAt TEXT,dataDeletedAt TEXT,
    restoredForwardingAt TEXT,lastError TEXT,updatedAt TEXT NOT NULL);`);
  if(!database.prepare('PRAGMA table_info(billingCancellations)').all().some(column=>column.name==='restoredForwardingAt'))database.exec('ALTER TABLE billingCancellations ADD COLUMN restoredForwardingAt TEXT');
}

// Only an actual settled base invoice grants cancellation time. Monthly and
// annual grants share the exact same amount/period/tenant checks.
export function syncBillingPaidThrough(database,ownerId){
  const query=usageOwnerQuery(database);
  const row=query(`SELECT b.*,u.plan,e.stateJson FROM billingAccounts b JOIN users u ON u.id=b.ownerId
    LEFT JOIN billingSubscriptionEvidence e ON e.ownerId=b.ownerId AND e.stripeSubscriptionId=b.stripeSubscriptionId WHERE b.ownerId=?`).get(ownerId);
  if(!row)return;
  let facts;try{facts=JSON.parse(row.stateJson);}catch{return;}
  if(!facts)return;
  const policy=MINUTE_PLANS[facts.plan],interval=facts.billingInterval;
  let endAt=null;
  if(policy&&['monthly','annual'].includes(interval))for(const evidence of query("SELECT invoiceJson FROM billingInvoiceEvidence WHERE ownerId=? AND stripeSubscriptionId=? AND status='PAID' AND invoiceJson IS NOT NULL").all(ownerId,row.stripeSubscriptionId)){
    const invoice=JSON.parse(evidence.invoiceJson),amount=policy[interval==='annual'?'annualCents':'monthlyCents'];
    if(invoice.customer!==row.stripeCustomerId||invoice.amount_paid<amount||invoice.lines?.has_more)continue;
    for(const line of invoice.lines?.data||[]){
      const start=billingIso(line.period?.start),end=billingIso(line.period?.end);
      if(billingPrice(line)!==facts.priceId||line.amount!==amount||(line.quantity??1)!==1||!start||!end||
        monthlyAnniversary(start,interval==='annual'?12:1)!==end||facts.trialEnd&&line.period.start<facts.trialEnd)continue;
      if(!endAt||end>endAt)endAt=end;
    }
  }
  query("UPDATE users SET paidThroughAt=@endAt WHERE id=@ownerId AND role='owner'").run({ownerId,endAt});
}

export function syncBillingCancellationEvidence(database,ownerId,at){
  const query=usageOwnerQuery(database),row=query(`SELECT b.*,u.paidThroughAt,u.trialEndsAt,e.stateJson
    FROM billingAccounts b JOIN users u ON u.id=b.ownerId LEFT JOIN billingSubscriptionEvidence e
    ON e.ownerId=b.ownerId AND e.stripeSubscriptionId=b.stripeSubscriptionId WHERE b.ownerId=?`).get(ownerId);
  if(!row?.stateJson)return;
  const f=JSON.parse(row.stateJson),prior=query('SELECT * FROM billingCancellations WHERE ownerId=?').get(ownerId);
  if(prior&&prior.state!=='RESTORED')return;
  if(!f.cancelAtPeriodEnd&&!['canceled','incomplete_expired'].includes(f.status))return;
  const endAt=row.paidThroughAt||(f.status==='trialing'?row.trialEndsAt:null)||at;
  const profile=query('SELECT operatorEnabled FROM businessProfiles WHERE ownerId=?').get(ownerId);
  query(`INSERT INTO billingCancellations(ownerId,stripeSubscriptionId,operationId,state,endAt,requestedAt,confirmedAt,operatorWasEnabled,updatedAt)
    VALUES(?,?,?,'CONFIRMED',?,?,?,?,?) ON CONFLICT(ownerId) DO UPDATE SET stripeSubscriptionId=excluded.stripeSubscriptionId,
    operationId=excluded.operationId,state='CONFIRMED',endAt=excluded.endAt,requestedAt=excluded.requestedAt,confirmedAt=excluded.confirmedAt,
    operatorWasEnabled=excluded.operatorWasEnabled,endedAt=NULL,forwardingOffAt=NULL,phoneReleasedAt=NULL,dataDeletedAt=NULL,updatedAt=excluded.updatedAt`)
    .run(ownerId,row.stripeSubscriptionId,randomUUID(),endAt,at,at,profile?.operatorEnabled||0,at);
  query("UPDATE users SET serviceEndsAt=@endAt WHERE id=@ownerId AND role='owner'").run({ownerId,endAt});
}

const DATA_TABLES=['quoteEmailDeliveries','quoteEmailRecipients','voiceQuoteNarrations','callbackRequests','ownerAlertAttempts','ownerAlerts','voiceSmsAttempts','voiceSmsDeliveries',
  'appointments','bookingIdempotency','bookingPreferences','bookingHolds','bookingIntents',
  'quoteSubmissions','transcriptTurns','voiceOpaqueHandles','voiceToolReceipts','voiceSessionNonces',
  'billingVoiceUsage','webhookDeliveries','leads','quoteRequests','quotes','calls','customers'];
export function createBillingCustomerLifecycle({database,ownerQuery,priceIds={},stripeClient,emailProvider,telephony,
  releaseNumber,enabled=()=>false,clock=()=>new Date(),dashboardUrl}={}){
  const query=usageOwnerQuery(database,ownerQuery),now=()=>clock().toISOString();
  const emails=createOwnerEmailDelivery({database,ownerQuery,provider:emailProvider,enabled,clock});
  const owner=ownerId=>query(`SELECT u.*,b.stripeCustomerId,b.stripeSubscriptionId,b.stripePriceId,b.currentPeriodEndAt,b.cancelAtPeriodEnd,b.graceEndsAt
    FROM users u LEFT JOIN billingAccounts b ON b.ownerId=u.id WHERE u.id=@ownerId AND u.role='owner'`).get({ownerId});
  const cancellation=ownerId=>query('SELECT * FROM billingCancellations WHERE ownerId=?').get(ownerId);
  const facts=ownerId=>{const row=query('SELECT e.stateJson,e.ambiguous FROM billingSubscriptionEvidence e JOIN billingAccounts b ON b.ownerId=e.ownerId AND b.stripeSubscriptionId=e.stripeSubscriptionId WHERE e.ownerId=?').get(ownerId);
    return row&&!row.ambiguous?JSON.parse(row.stateJson):null;};
  function link(action){if(!dashboardUrl)return 'Open Billing in your dashboard.';const url=new URL('/settings/billing',dashboardUrl);if(action)url.searchParams.set('billingAction',action);return url.href;}
  function notice(ownerId,kind,referenceId,message,{amountCents=null,currency=null,dueAt=null}={}){
    return usageTransaction(database,()=>{
      const account=owner(ownerId);if(!account)throw error('OWNER_NOT_FOUND',404);
      const id=billingUsageId('billing-lifecycle-v1',ownerId,kind,referenceId),at=now();
      if(query('SELECT id FROM billingLifecycleNotices WHERE ownerId=? AND id=?').get(ownerId,id))return id;
      query(`INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt)
        VALUES(?,?,'billing.lifecycle_notice',?,?,'PENDING',?,?)`).run(id,ownerId,referenceId,JSON.stringify({kind,message,amountCents,currency,dueAt}),at,at);
      query('INSERT INTO billingLifecycleNotices(id,ownerId,kind,referenceId,message,amountCents,currency,dueAt,createdAt) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(id,ownerId,kind,referenceId,message,amountCents,currency,dueAt,at);
      emails.queue({id,ownerId,message:{to:account.email,subject:({trial_ending:'Your free trial ends in three days',annual_renewal:'Your annual plan renews in thirty days',receipt:'Your payment receipt',payment_failed:'Payment failed: action needed',cancellation:'Your plan cancellation',service_ended:'Your service has ended',reactivated:'Your service is reactivated',suspended:'Your service is suspended'})[kind]||'Billing update',text:message}});
      return id;
    });
  }
  function syncNotices(ownerId){
    const account=owner(ownerId);if(!account)return;
    const cancelled=cancellation(ownerId);
    if(cancelled&&['CONFIRMED','ENDED','RESTORING'].includes(cancelled.state))notice(ownerId,'cancellation',cancelled.operationId,
      `Your plan is cancelled. Service ends ${cancelled.endAt}. No partial refund. Phone retained until ${addDays(cancelled.endAt,30)}; CSV export until ${addDays(cancelled.endAt,90)}. Reactivate: ${link()}.`);
    for(const invoice of query('SELECT * FROM billingInvoiceEvidence WHERE ownerId=? ORDER BY stripeInvoiceId').all(ownerId)){
      const metered=query('SELECT periodId FROM billingUsageCharges WHERE ownerId=? AND providerInvoiceId=?').get(ownerId,invoice.stripeInvoiceId);
      if(invoice.status==='PAID'&&invoice.amountPaid>0&&['cad','usd'].includes(invoice.currency))notice(ownerId,'receipt',invoice.stripeInvoiceId,
        `${metered?'Overage payment received':'Payment received'}: ${billingMoney(invoice.amountPaid)} ${invoice.currency.toUpperCase()}. Invoice ${invoice.stripeInvoiceId}. Charge date: ${billingIso(invoice.paidAt)}. ${link()}`,
        {amountCents:invoice.amountPaid,currency:invoice.currency,dueAt:billingIso(invoice.paidAt)});
      if(invoice.failedAt!=null)notice(ownerId,'payment_failed',invoice.stripeInvoiceId,
        `Payment failed for invoice ${invoice.stripeInvoiceId}. Resolve it using Manage billing: ${link('payment')}. Service continues during the seven-day grace period ending ${addDays(billingIso(invoice.failedAt),7)}; unresolved payment suspends service.`,{dueAt:addDays(billingIso(invoice.failedAt),7)});
    }
    for(const charge of query("SELECT * FROM billingUsageCharges WHERE ownerId=? AND status='PAID'").all(ownerId))if(charge.providerInvoiceId)
      notice(ownerId,'receipt',charge.providerInvoiceId,`Overage payment received: ${billingMoney(charge.amountCents)} ${(charge.currency||'').toUpperCase()}. Invoice ${charge.providerInvoiceId}. Charge confirmed: ${charge.updatedAt}. ${link()}`,
        {amountCents:charge.amountCents,currency:charge.currency,dueAt:charge.updatedAt});
    if(account.planStatus==='suspended')notice(ownerId,'suspended',account.paymentFailedAt||account.stripeSubscriptionId,
      `Service is suspended until outstanding payment is resolved. Manage billing: ${link('payment')}.`);
  }
  async function reminders(ownerId){
    const account=owner(ownerId),f=facts(ownerId);if(!account||!f||!stripeClient||!enabled()||account.serviceEndsAt||account.cancelAtPeriodEnd)return;
    const at=now(),trial=account.planStatus==='trialing',dueAt=trial?account.trialEndsAt:f.billingInterval==='annual'&&account.planStatus==='active'?account.currentPeriodEndAt:null;
    const days=trial?3:30;if(!dueAt||at<addDays(dueAt,-days)||at>=dueAt)return;
    const kind=trial?'trial_ending':'annual_renewal',referenceId=account.stripeSubscriptionId+':'+dueAt;
    if(query('SELECT id FROM billingLifecycleNotices WHERE ownerId=? AND kind=? AND referenceId=?').get(ownerId,kind,referenceId))return;
    const price=await billingProviderRead(()=>stripeClient.prices.retrieve(account.stripePriceId,{},BILLING_PROVIDER_OPTIONS));
    const interval=f.billingInterval,expected=MINUTE_PLANS[account.plan]?.[interval==='annual'?'annualCents':'monthlyCents'];
    if(price.id!==account.stripePriceId||price.unit_amount!==expected||!['cad','usd'].includes(price.currency)||
      price.recurring?.interval!==(interval==='annual'?'year':'month')||(price.recurring.interval_count??1)!==1)throw error('BILLING_PRICE_CONFIRMATION_REQUIRED',502);
    const preview=await billingProviderRead(()=>stripeClient.invoices.createPreview({customer:account.stripeCustomerId,subscription:account.stripeSubscriptionId},BILLING_PROVIDER_OPTIONS));
    if(billingReference(preview.customer)!==account.stripeCustomerId||preview.currency!==price.currency||
      !Number.isSafeInteger(preview.amount_due)||preview.amount_due<0||preview.lines?.has_more!==false||
      !preview.lines.data.some(line=>billingPrice(line)===account.stripePriceId&&billingIso(line.period?.start)===dueAt))throw error('BILLING_AMOUNT_CONFIRMATION_REQUIRED',502);
    const amount=preview.amount_due;
    // Recheck after the read; cancellation or selection changes can race it.
    const current=owner(ownerId);if(now()>=dueAt||current.planStatus!==account.planStatus||current.serviceEndsAt||current.cancelAtPeriodEnd||current.stripePriceId!==account.stripePriceId||
      (trial?current.trialEndsAt:current.currentPeriodEndAt)!==dueAt)return;
    notice(ownerId,kind,referenceId,`${trial?'Your fourteen-day free trial ends':'Your annual plan renews'} on ${dueAt}. Plan: ${account.plan} ${interval}. ${billingMoney(amount)} ${price.currency.toUpperCase()} will be charged on ${dueAt}${interval==='annual'?' for twelve months paid up front':''}. Cancel before that charge: ${link('cancel')}. Change plan: ${link('change')}.`,{amountCents:amount,currency:price.currency,dueAt});
  }
  async function recoverReceiptCurrencies(ownerId){
    if(!enabled()||!stripeClient)return;
    for(const row of query("SELECT stripeInvoiceId,stripeCustomerId,amountPaid FROM billingInvoiceEvidence WHERE ownerId=? AND status='PAID' AND amountPaid>0 AND currency IS NULL LIMIT 32").all(ownerId)){
      try{
        const invoice=await billingProviderRead(()=>stripeClient.invoices.retrieve(row.stripeInvoiceId,{},BILLING_PROVIDER_OPTIONS));
        if(invoice?.id!==row.stripeInvoiceId||billingReference(invoice.customer)!==row.stripeCustomerId||invoice.status!=='paid'||invoice.amount_paid!==row.amountPaid||!['cad','usd'].includes(invoice.currency))continue;
        query('UPDATE billingInvoiceEvidence SET currency=? WHERE ownerId=? AND stripeInvoiceId=? AND currency IS NULL').run(invoice.currency,ownerId,row.stripeInvoiceId);
      }catch{/* A missing receipt stays pending; never invent its currency. */}
    }
  }
  async function cancel(ownerId){
    if(!enabled()||!stripeClient)throw error('BILLING_PROVIDER_UNAVAILABLE',503);
    return withBillingLease(database,ownerId,async assertLease=>{
      let row=cancellation(ownerId);if(row&&['CONFIRMED','ENDED'].includes(row.state))return snapshot(ownerId);
      if(row?.state==='RESTORING')throw error('BILLING_OPERATION_IN_PROGRESS');
      const account=owner(ownerId);if(!account?.stripeSubscriptionId)throw error('BILLING_SUBSCRIPTION_REQUIRED');
      if(!row||row.state==='RESTORED'){
        syncBillingPaidThrough(database,ownerId);const current=owner(ownerId);
        const endAt=current.planStatus==='trialing'||!(current.paidThroughAt>now())?now():current.paidThroughAt;
        const profile=query('SELECT operatorEnabled FROM businessProfiles WHERE ownerId=?').get(ownerId);
        query(`INSERT INTO billingCancellations(ownerId,stripeSubscriptionId,operationId,state,endAt,requestedAt,operatorWasEnabled,updatedAt)
          VALUES(?,?,?,'PENDING',?,?,?,?) ON CONFLICT(ownerId) DO UPDATE SET stripeSubscriptionId=excluded.stripeSubscriptionId,operationId=excluded.operationId,
          state='PENDING',endAt=excluded.endAt,requestedAt=excluded.requestedAt,operatorWasEnabled=excluded.operatorWasEnabled,confirmedAt=NULL,endedAt=NULL,forwardingOffAt=NULL,restoredForwardingAt=NULL,phoneReleasedAt=NULL,dataDeletedAt=NULL,lastError=NULL,updatedAt=excluded.updatedAt`)
          .run(ownerId,current.stripeSubscriptionId,randomUUID(),endAt,now(),profile?.operatorEnabled||0,now());row=cancellation(ownerId);
      }
      try{
        const sub=await billingProviderRead(()=>stripeClient.subscriptions.retrieve(row.stripeSubscriptionId,{},BILLING_PROVIDER_OPTIONS));assertLease();
        if(sub?.id!==row.stripeSubscriptionId||billingReference(sub.customer)!==account.stripeCustomerId)throw error('BILLING_PROVIDER_MISMATCH',502);
        let confirmed=sub;
        if(sub.status!=='canceled'&&!sub.cancel_at_period_end){
          const providerEnd=billingIso(sub.items?.data?.find(item=>billingPrice(item)===account.stripePriceId)?.current_period_end??sub.current_period_end);
          confirmed=row.endAt<=row.requestedAt||providerEnd!==row.endAt
            ?await billingProviderRead(()=>stripeClient.subscriptions.cancel(sub.id,{prorate:false,invoice_now:false},BILLING_PROVIDER_OPTIONS))
            :await billingProviderRead(()=>stripeClient.subscriptions.update(sub.id,{cancel_at_period_end:true,proration_behavior:'none'},{...BILLING_PROVIDER_OPTIONS,idempotencyKey:'lifecycle-cancel/'+row.operationId}));
        }
        assertLease();if(confirmed?.id!==row.stripeSubscriptionId||billingReference(confirmed.customer)!==account.stripeCustomerId||
          !(confirmed.status==='canceled'||confirmed.cancel_at_period_end===true))throw error('BILLING_CANCELLATION_UNCONFIRMED',502);
        usageTransaction(database,()=>{
          assertLease();query("UPDATE billingCancellations SET state='CONFIRMED',confirmedAt=?,lastError=NULL,updatedAt=? WHERE ownerId=? AND operationId=?").run(now(),now(),ownerId,row.operationId);
          query("UPDATE users SET serviceEndsAt=@endAt WHERE id=@ownerId AND role='owner'").run({ownerId,endAt:row.endAt});
          query('UPDATE billingAccounts SET cancelAtPeriodEnd=1 WHERE ownerId=?').run(ownerId);
          notice(ownerId,'cancellation',row.operationId,`Your plan is cancelled. Service ends ${row.endAt}. No partial refund. Phone retained until ${addDays(row.endAt,30)}; CSV export until ${addDays(row.endAt,90)}. Reactivate: ${link()}.`);
        });
      }catch(e){query('UPDATE billingCancellations SET lastError=?,updatedAt=? WHERE ownerId=? AND operationId=?').run('CANCELLATION_CONFIRMATION_PENDING',now(),ownerId,row.operationId);throw e;}
      return snapshot(ownerId);
    },{clock});
  }
  async function reactivate(ownerId){
    if(!enabled()||!stripeClient)throw error('BILLING_PROVIDER_UNAVAILABLE',503);
    const prior=cancellation(ownerId);if(!prior||prior.state==='RESTORED')return snapshot(ownerId);
    if(prior.endAt<=now()&&prior.state!=='RESTORING')throw error('BILLING_NEW_SUBSCRIPTION_REQUIRED');
    return withBillingLease(database,ownerId,async assertLease=>{
      const row=cancellation(ownerId),account=owner(ownerId);
      if(row.state==='PENDING')throw error('BILLING_CANCELLATION_UNCONFIRMED');
      query("UPDATE billingCancellations SET state='RESTORING',updatedAt=? WHERE ownerId=?").run(now(),ownerId);
      const sub=await billingProviderRead(()=>stripeClient.subscriptions.retrieve(row.stripeSubscriptionId,{},BILLING_PROVIDER_OPTIONS));assertLease();
      if(sub?.id!==row.stripeSubscriptionId||billingReference(sub.customer)!==account.stripeCustomerId)throw error('BILLING_PROVIDER_MISMATCH',502);
      if(sub.status==='canceled'){
        query("UPDATE billingCancellations SET state='CONFIRMED',updatedAt=? WHERE ownerId=?").run(now(),ownerId);
        throw error('BILLING_NEW_SUBSCRIPTION_REQUIRED');
      }
      if(row.endAt<=now()&&!(sub.cancel_at_period_end===false&&account.paidThroughAt>now()))throw error('BILLING_NEW_SUBSCRIPTION_REQUIRED');
      const confirmed=sub.cancel_at_period_end?await billingProviderRead(()=>stripeClient.subscriptions.update(sub.id,{cancel_at_period_end:false,proration_behavior:'none'},BILLING_PROVIDER_OPTIONS)):sub;
      assertLease();if(confirmed?.id!==sub.id||billingReference(confirmed.customer)!==account.stripeCustomerId||confirmed.cancel_at_period_end!==false)throw error('BILLING_REACTIVATION_UNCONFIRMED',502);
      restoreLocal(ownerId,row);return snapshot(ownerId);
    },{clock});
  }
  function restoreLocal(ownerId,row){usageTransaction(database,()=>{
    query("UPDATE users SET serviceEndsAt=NULL WHERE id=@ownerId AND role='owner'").run({ownerId});
    query('UPDATE billingAccounts SET cancelAtPeriodEnd=0 WHERE ownerId=?').run(ownerId);
    query("UPDATE billingCancellations SET state='RESTORED',lastError=NULL,updatedAt=? WHERE ownerId=?").run(now(),ownerId);
    notice(ownerId,'reactivated',row.operationId,`Your retained service and data are reactivated. ${row.phoneReleasedAt?'The previous phone number has already been released; set up a new number.':''} ${row.dataDeletedAt?'The previous records have already been deleted.':''} ${link()}`);
  });}
  function erase(ownerId,row){usageTransaction(database,()=>{
    // Child-first, explicitly enumerated record tables. Billing evidence and
    // the account survive. No FK bypass, provider calls or unscoped DELETEs.
    for(const call of query('SELECT callSid FROM calls WHERE ownerId=? AND callSid IS NOT NULL').all(ownerId)){
      for(const prefix of ['', 'inbound\0'])query(`DELETE FROM voiceToolIdempotencyReceipts WHERE scopeHash=@scopeHash
        AND EXISTS(SELECT 1 FROM calls WHERE ownerId=@ownerId AND callSid=@callSid)`).run({ownerId,callSid:call.callSid,
        scopeHash:createHash('sha256').update(`${prefix}${ownerId}\0${call.callSid}`,'utf8').digest('hex')});
    }
    for(const table of DATA_TABLES)query(`DELETE FROM ${table} WHERE ownerId=?`).run(ownerId);
    query("DELETE FROM outboxEvents WHERE ownerId=? AND eventType NOT LIKE 'billing.%'").run(ownerId);
    query("DELETE FROM events WHERE ownerId=? AND eventType NOT LIKE 'billing.%'").run(ownerId);
    query("UPDATE billingCancellations SET dataDeletedAt=?,updatedAt=? WHERE ownerId=? AND operationId=?").run(now(),now(),ownerId,row.operationId);
  });}
  async function stopUsageCollection(ownerId,assertLease){
    if(!enabled()||!stripeClient)return;
    const charges=query(`SELECT c.*,p.stripeCustomerId,p.stripeSubscriptionId FROM billingUsageCharges c JOIN billingUsagePeriods p
      ON p.ownerId=c.ownerId AND p.id=c.periodId WHERE c.ownerId=? AND c.providerInvoiceId IS NOT NULL
      AND c.status!='PAID' AND c.collectionStoppedAt IS NULL`).all(ownerId);
    for(const charge of charges){
      const invoice=await billingProviderRead(()=>stripeClient.invoices.retrieve(charge.providerInvoiceId,{},BILLING_PROVIDER_OPTIONS));
      assertLease();
      const bound=i=>i?.id===charge.providerInvoiceId&&billingReference(i.customer)===charge.stripeCustomerId&&i.metadata?.otc_usage_period===charge.periodId&&i.metadata?.otc_usage_digest===charge.usageDigest;
      if(!bound(invoice))throw error('BILLING_PROVIDER_MISMATCH',502);
      if(invoice.status==='paid'){
        const period=query('SELECT * FROM billingUsagePeriods WHERE ownerId=? AND id=?').get(ownerId,charge.periodId);
        query("UPDATE billingUsageCharges SET status='PAID',updatedAt=? WHERE ownerId=? AND periodId=? AND status!='REVIEW'").run(now(),ownerId,charge.periodId);
        recordUsageInvoicePayment(database,{ownerId,period,charge,invoice,at:now()});
      }else{
        const receipt=invoice.auto_advance===false?invoice:await billingProviderRead(()=>stripeClient.invoices.update(invoice.id,{auto_advance:false},BILLING_PROVIDER_OPTIONS));
        assertLease();
        if(!bound(receipt)||receipt.auto_advance!==false)throw error('BILLING_COLLECTION_STOP_PENDING',502);
      }
      query('UPDATE billingUsageCharges SET collectionStoppedAt=?,updatedAt=? WHERE ownerId=? AND periodId=?').run(now(),now(),ownerId,charge.periodId);
    }
  }
  async function cleanup(ownerId,{deadlineAt=now(),assertLease}={}){
    let row=cancellation(ownerId);if(!row||!['CONFIRMED','ENDED'].includes(row.state)||deadlineAt<row.endAt)return;
    if(!row.endedAt)usageTransaction(database,()=>{
      query("UPDATE billingCancellations SET state='ENDED',endedAt=?,updatedAt=? WHERE ownerId=?").run(row.endAt,now(),ownerId);
      // Access is already denied by the clock guard, even before this sweep.
      notice(ownerId,'service_ended',row.operationId,`Service ended ${row.endAt}. AI answering and quoting are unavailable. Turn off any forwarding to your Off The Clock number. Carrier shutdown is tracked in Billing. Export records before ${addDays(row.endAt,90)}. ${link()}`);
    });
    row=cancellation(ownerId);
    await stopUsageCollection(ownerId,assertLease);
    if(!row.dataDeletedAt&&deadlineAt>=addDays(row.endAt,90))erase(ownerId,row);
    if(enabled()){
      const profile=query('SELECT * FROM businessProfiles WHERE ownerId=?').get(ownerId);
      if(!row.forwardingOffAt&&profile?.twilioNumber&&telephony){
        const result=await telephony.setCoverage(ownerId,false);
        assertLease();
        if(result.confirmedEnabled===false&&!result.pending)query('UPDATE billingCancellations SET forwardingOffAt=?,lastError=NULL,updatedAt=? WHERE ownerId=?').run(now(),now(),ownerId);
        else query("UPDATE billingCancellations SET lastError='FORWARDING_SHUTDOWN_PENDING',updatedAt=? WHERE ownerId=?").run(now(),ownerId);
      }
      if(!row.phoneReleasedAt&&deadlineAt>=addDays(row.endAt,30)&&releaseNumber){
        // Release the saved SID, never a number discovered by a broad search.
        const result=profile?.twilioNumberSid?await releaseNumber({ownerId,sid:profile.twilioNumberSid}):{released:true};
        assertLease();
        if(result?.released===true)usageTransaction(database,()=>{
          query("UPDATE businessProfiles SET twilioNumber=NULL,twilioNumberSid=NULL,operatorEnabled=0,phoneProvisioningStatus='not_started' WHERE ownerId=?").run(ownerId);
          query('DELETE FROM phoneProvisioningOperations WHERE ownerId=?').run(ownerId);
          query('DELETE FROM operatorCoverageOperations WHERE ownerId=?').run(ownerId);
          query('UPDATE billingCancellations SET phoneReleasedAt=?,updatedAt=? WHERE ownerId=?').run(now(),now(),ownerId);
        });
      }
    }
  }
  async function processOwner(ownerId){
    let row=cancellation(ownerId);
    if(row?.state==='PENDING')try{await cancel(ownerId);}catch{/* Durable intent retried; dashboard reports ambiguity. */}
    if(row?.state==='RESTORING')try{await reactivate(ownerId);}catch{/* Safe current-state read on replay. */}
    await withBillingLease(database,ownerId,async assertLease=>{
      syncBillingPaidThrough(database,ownerId);const account=owner(ownerId);row=cancellation(ownerId);
      const restoring=row&&['CONFIRMED','ENDED'].includes(row.state)&&account.stripeSubscriptionId!==row.stripeSubscriptionId&&account.planStatus==='active'&&account.paidThroughAt>now();
      const payment=restoring?query("SELECT MIN(paidAt) paidAt FROM billingInvoiceEvidence WHERE ownerId=? AND stripeSubscriptionId=? AND status='PAID' AND amountPaid>0").get(ownerId,account.stripeSubscriptionId):null;
      await cleanup(ownerId,{deadlineAt:payment?.paidAt!=null?billingIso(payment.paidAt):now(),assertLease});assertLease();row=cancellation(ownerId);
      if(restoring){
        restoreLocal(ownerId,row);
      }
      row=cancellation(ownerId);
      if(row?.state==='RESTORED'&&row.endedAt&&row.operatorWasEnabled&&!row.phoneReleasedAt&&!row.restoredForwardingAt&&enabled()&&telephony){
        const result=await telephony.setCoverage(ownerId,true);assertLease();
        if(result.confirmedEnabled===true&&!result.pending)query('UPDATE billingCancellations SET restoredForwardingAt=?,lastError=NULL,updatedAt=? WHERE ownerId=?').run(now(),now(),ownerId);
        else query("UPDATE billingCancellations SET lastError='REACTIVATION_FORWARDING_PENDING',updatedAt=? WHERE ownerId=?").run(now(),ownerId);
      }
    },{clock});
    await recoverReceiptCurrencies(ownerId);syncNotices(ownerId);await reminders(ownerId);
    for(let i=0;i<12;i++)if(!await emails.deliverOne(ownerId))break;
  }
  function snapshot(ownerId){syncNotices(ownerId);const row=cancellation(ownerId),account=owner(ownerId);return {
    serviceEndsAt:account?.serviceEndsAt||null,cancellation:row?{...row,phoneReleaseAt:addDays(row.endAt,30),exportUntilAt:addDays(row.endAt,90)}:null,
    notices:query(`SELECT n.*,e.status emailStatus,e.lastError deliveryError FROM billingLifecycleNotices n
      LEFT JOIN ownerEmailDeliveries e ON e.ownerId=n.ownerId AND e.id=n.id WHERE n.ownerId=? ORDER BY n.createdAt DESC,n.id`).all(ownerId)};}
  function exportCsv(ownerId,kind){
    const table={leads:'leads',quotes:'quotes',calls:'calls'}[kind];if(!table)throw error('INVALID_EXPORT',400);
    const row=cancellation(ownerId);if(row&&row.state!=='RESTORED'&&(row.dataDeletedAt||now()>=addDays(row.endAt,90)))throw error('BILLING_EXPORT_EXPIRED',410);
    const rows=query(`SELECT * FROM ${table} WHERE ownerId=? ORDER BY createdAt,id`).all(ownerId);
    const columns=database.prepare(`PRAGMA table_info(${table})`).all().map(r=>r.name).filter(name=>name!=='ownerId');
    const cell=value=>'"'+String(value??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';
    return columns.map(cell).join(',')+'\r\n'+rows.map(r=>columns.map(c=>cell(r[c])).join(',')).join('\r\n')+'\r\n';
  }
  let running=null,cursor='';
  async function tick(){if(running)return running;running=(async()=>{
    // Platform inventory only. Every following operation binds the owner.
    let owners=database.prepare("SELECT id FROM users WHERE role='owner' AND id>? ORDER BY id LIMIT 32").all(cursor);
    if(!owners.length){cursor='';owners=database.prepare("SELECT id FROM users WHERE role='owner' ORDER BY id LIMIT 32").all();}
    for(const {id} of owners){try{await processOwner(id);}catch{query("UPDATE billingCancellations SET lastError='LIFECYCLE_ACTION_PENDING',updatedAt=? WHERE ownerId=?").run(now(),id);}finally{cursor=id;}}
  })();try{await running;}finally{running=null;}}
  function start(){void tick();const timer=setInterval(()=>void tick(),60000);timer.unref?.();return async()=>{clearInterval(timer);if(running)await running;};}
  return {notice,syncNotices,reminders,cancel,reactivate,processOwner,snapshot,exportCsv,tick,start,emails};
}

export function installBillingCustomerLifecycleRoutes(app,{service,requireAuth,requireProviderWrites,asyncHandler}){
  const onlyOwner=requireAuth(['owner']);
  app.get('/api/billing/lifecycle',onlyOwner,(req,res)=>res.json(service.snapshot(req.tenantOwnerId)));
  for(const action of ['cancel','reactivate'])app.post('/api/billing/'+action,onlyOwner,requireProviderWrites,asyncHandler(async(req,res)=>{
    if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length)throw error('INVALID_REQUEST',400);
    return res.json(await service[action](req.tenantOwnerId));
  }));
  app.get('/api/billing/export/:kind',onlyOwner,(req,res)=>res.type('text/csv').set('Content-Disposition',`attachment; filename="${['leads','quotes','calls'].includes(req.params.kind)?req.params.kind:'records'}.csv"`).send(service.exportCsv(req.tenantOwnerId,req.params.kind)));
}
