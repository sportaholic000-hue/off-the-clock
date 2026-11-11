import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {formatOwnerDateTime,formatOwnerDate,formatOwnerTimeRange,formatLocalDate,formatDuration,ownerTimeZone,plainReason,
  plainCallResult,plainQuoteStatus,plainAppointmentStatus,formatPreferredWindow,serviceName,formatAddress,labeled} from '../server/src/ownerMessageFormat.js';
import {quoteOptionLines} from '../server/src/ownerAlertService.js';
import {callFailureReason as dashboardReason} from '../client/src/callFailureReasons.js';
import {callFailureReason} from '../server/src/callFailureReasons.js';
import {fixture,A,B,START,SIGNUP,prices} from './overageMinute20261006Fixture.mjs';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {installTelephonyOperationsSchema} from '../server/src/telephonyOperationsMigration.js';
import {createBillingMinuteService} from '../server/src/billingMinuteService.js';
import {installAuthSessionSchema} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';
import {createAuthTokenService,installAuthTokenSchema} from '../server/src/authTokenService.js';

// Every expected string below was worked out by hand before execution.
// Moncton is UTC-3 (ADT) until 2:00 AM local on Sunday, November 1, 2026, then UTC-4 (AST).
const ISO_INSTANT=/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const MONCTON='America/Moncton';

test('owner email formatting: times, dates, ranges and durations in plain words',()=>{
  assert.equal(formatOwnerDateTime('2026-10-07T12:00:00.000Z',MONCTON),'Wed, Oct 7, 2026, 9:00 AM ADT');
  assert.equal(formatOwnerDateTime('2026-11-20T12:00:00.000Z',MONCTON),'Fri, Nov 20, 2026, 8:00 AM AST');
  assert.equal(formatOwnerDateTime('2026-10-07T23:00:00.000Z','America/Los_Angeles'),'Wed, Oct 7, 2026, 4:00 PM PDT');
  assert.equal(formatOwnerTimeRange('2026-10-07T12:00:00.000Z','2026-10-07T12:45:00.000Z',MONCTON),'Wed, Oct 7, 2026, 9:00 – 9:45 AM ADT');
  assert.equal(formatOwnerTimeRange('2026-10-07T23:00:00.000Z','2026-10-08T06:00:00.000Z',MONCTON),'Wed, Oct 7, 2026, 8:00 PM ADT – Thu, Oct 8, 2026, 3:00 AM ADT');
  assert.equal(formatOwnerDate('2026-11-01T00:00:00.000Z',MONCTON),'Sat, Oct 31, 2026');
  assert.equal(formatLocalDate('2026-10-09'),'Fri, Oct 9, 2026');
  assert.equal(formatDuration(24*3600000),'24 hours');assert.equal(formatDuration(30*60000),'30 minutes');
  assert.equal(formatDuration(3600000),'1 hour');assert.equal(formatDuration(7*86400000),'7 days');assert.equal(formatDuration(-1),null);
  assert.equal(ownerTimeZone('Mars/Base'),'UTC');assert.equal(ownerTimeZone(undefined),'UTC');assert.equal(ownerTimeZone(MONCTON),MONCTON);
  assert.equal(formatOwnerDateTime('2026-10-07T12:00:00.000Z','Not/AZone'),'Wed, Oct 7, 2026, 12:00 PM UTC');
  for(const text of [formatOwnerDateTime('2026-10-07T12:00:00.000Z',MONCTON),formatOwnerTimeRange('2026-10-07T12:00:00.000Z','2026-10-07T12:45:00.000Z',MONCTON)])
    assert.doesNotMatch(text,/[   ]/,'plain-text email uses ordinary spaces');
});

test('owner email wording: codes become plain words and unknown codes are never printed',()=>{
  assert.equal(plainReason('flooding'),'Flooding');assert.equal(plainReason('active_leak'),'Active leak');
  assert.equal(plainReason('TRANSFER_OUTSIDE_HOURS'),'It was outside your transfer hours.');
  assert.equal(plainReason('TRIAL_EXPIRED'),'The trial had ended.');
  assert.equal(plainReason('SOME_FUTURE_CODE'),null);
  assert.equal(plainReason('Wants a quote for the back fence'),'Wants a quote for the back fence');
  assert.equal(plainCallResult({status:'COMPLETED',outcome:'CALL_ENDED'}),'Answered by the receptionist');
  assert.equal(plainCallResult({status:'FALLBACK',outcome:'AI_FALLBACK'}),'Taken as a message on the backup line');
  assert.equal(plainCallResult({status:'HUMAN_ROUTING',outcome:'OPERATOR_OFF'}),'Rang through to you (answering was off)');
  assert.equal(plainQuoteStatus('INSTANT'),'Priced instantly');assert.equal(plainQuoteStatus('PARTIAL'),'Partly priced; the rest needs your review');
  assert.equal(plainAppointmentStatus('CANCELLED'),'Cancelled');assert.equal(plainAppointmentStatus('CONFIRMED'),'Confirmed');
  assert.equal(formatPreferredWindow({date:'2026-10-09',timeOfDay:'morning'}),'Fri, Oct 9, 2026, morning');
  assert.equal(serviceName('FENCE_INSTALL'),'Fence install');assert.equal(serviceName('Cedar privacy fence'),'Cedar privacy fence');
  assert.equal(formatAddress({addressLine1:'1 Test St',addressLine2:'',city:'Moncton',region:'NB',postalCode:'E1A 0A1',country:'CA'}),'1 Test St, Moncton, NB, E1A 0A1, CA');
  assert.equal(labeled('Phone',''),null);assert.equal(labeled('Phone',' +15065550123 '),'Phone: +15065550123');
  // The dashboard and owner emails share one wording source.
  assert.equal(dashboardReason('VOICE_CIRCUIT_OPEN'),callFailureReason('VOICE_CIRCUIT_OPEN'));
});

test('owner email quote lines: saved customer amounts, one tax line, no pipes or raw values',()=>{
  const lines=quoteOptionLines({currency:'CAD',priceUnit:'per job',options:[
    {tierName:'Good',lowEstimate:4200,highEstimate:5600,taxTreatment:'Includes applicable tax.'},
    {tierName:'Better',lowEstimate:5800,highEstimate:7100.5,taxTreatment:'Includes applicable tax.'}]});
  assert.deepEqual(lines,['Option Good: $4,200.00 – $5,600.00 CAD per job','Option Better: $5,800.00 – $7,100.50 CAD per job','Tax: Includes applicable tax.']);
  assert.deepEqual(quoteOptionLines({lowEstimate:900,highEstimate:900,currency:'USD'}),['Price: $900 USD']);
  assert.deepEqual(quoteOptionLines(null),[]);
});

function lifecycleSetup(t){
  const f=fixture(t);installTelephonyOperationsSchema(f.db);
  f.fakes.stripe.invoices.createPreview=async({customer,subscription})=>{const sub=f.fakes.subscriptions.get(subscription),price=await f.fakes.stripe.prices.retrieve(sub.items.data[0].price.id);
    return {customer,currency:price.currency,amount_due:price.unit_amount,lines:{has_more:false,data:[{price:{id:price.id},period:{start:sub.status==='trialing'?sub.trial_end:sub.current_period_end}}]}};};
  f.fakes.stripe.subscriptions.update=async(id,params)=>{const sub=f.fakes.subscriptions.get(id);Object.assign(sub,params);return structuredClone(sub);};
  f.fakes.stripe.subscriptions.cancel=async id=>{const sub=f.fakes.subscriptions.get(id);sub.status='canceled';return structuredClone(sub);};
  const lifecycle=createBillingCustomerLifecycle({database:f.db,priceIds:prices,stripeClient:f.fakes.stripe,emailProvider:f.fakes.email,
    enabled:()=>true,clock:f.clock,dashboardUrl:'https://synthetic.example.invalid/settings',
    telephony:{async setCoverage(){return {confirmedEnabled:false,pending:false};}},releaseNumber:async()=>({released:true})});
  f.db.prepare("UPDATE users SET timezone=? WHERE id=?").run(MONCTON,A);
  return {...f,lifecycle};
}
const sec=at=>Date.parse(at)/1000;
function paymentEvent(f,{id='in_SYNTHETIC_plain',type='invoice.paid',created=sec(START)}={}){
  const end='2026-11-20T12:00:00.000Z',amount=11900;
  const object={id,customer:'cus_'+A,subscription:'sub_'+A,currency:'cad',status:type==='invoice.paid'?'paid':'open',amount_paid:type==='invoice.paid'?amount:0,amount_remaining:type==='invoice.paid'?0:amount,
    period_start:sec(START),period_end:sec(end),lines:{has_more:false,data:[{price:{id:prices.Operator.monthly},amount,quantity:1,period:{start:sec(START),end:sec(end)}}]}};
  const event={id:'evt_'+id+'_'+type,type,created,livemode:false,data:{object}};f.billing.applyVerifiedStripeEvent(event);return event;
}

test('billing notices: trial reminder, receipt and failed payment read in the business time zone',async t=>{
  const f=lifecycleSetup(t);f.setTime(SIGNUP);f.subscription(A,{status:'trialing',start:SIGNUP,end:START});
  f.setTime('2026-10-17T12:00:00.000Z');await f.lifecycle.processOwner(A);
  const trial=f.lifecycle.snapshot(A).notices.find(n=>n.kind==='trial_ending');
  assert.match(trial.message,/^Your fourteen-day free trial ends on Tue, Oct 20, 2026, 9:00 AM ADT\./);
  assert.match(trial.message,/will be charged on Tue, Oct 20, 2026, 9:00 AM ADT\./);
  assert.equal(trial.dueAt,START,'stored due date stays exact');
  f.setTime(START);f.subscription(A,{start:START,end:'2026-11-20T12:00:00.000Z'});
  const fail=paymentEvent(f,{id:'in_SYNTHETIC_fail',type:'invoice.payment_failed'});f.billing.applyVerifiedStripeEvent(fail);await f.lifecycle.processOwner(A);
  const failed=f.lifecycle.snapshot(A).notices.find(n=>n.kind==='payment_failed');
  assert.match(failed.message,/three-day grace period ending Fri, Oct 23, 2026, 9:00 AM ADT;/);
  paymentEvent(f);await f.lifecycle.processOwner(A);
  const receipt=f.lifecycle.snapshot(A).notices.find(n=>n.kind==='receipt'&&n.referenceId==='in_SYNTHETIC_plain');
  assert.match(receipt.message,/Charge date: Tue, Oct 20, 2026\./);
  for(const notice of f.lifecycle.snapshot(A).notices)assert.doesNotMatch(notice.message,ISO_INSTANT,notice.kind);
  for(const sent of f.fakes.writes.email)assert.doesNotMatch(sent.text,ISO_INSTANT,'emailed copy matches');
});

test('billing notices: cancellation and service end use plain dates across the November time change',async t=>{
  const f=lifecycleSetup(t);f.activate();f.setTime('2026-11-01T12:00:00.000Z');await f.lifecycle.cancel(A);
  const cancel=f.lifecycle.snapshot(A).notices.find(n=>n.kind==='cancellation');
  assert.match(cancel.message,/^Your plan is cancelled\. Service ends Fri, Nov 20, 2026, 8:00 AM AST\. No partial refund\. Your phone number is held until Sun, Dec 20, 2026, 8:00 AM AST, and CSV export is available until Thu, Feb 18, 2027, 8:00 AM AST\./);
  f.setTime('2026-11-20T12:00:00.000Z');await f.lifecycle.processOwner(A);
  const ended=f.lifecycle.snapshot(A).notices.find(n=>n.kind==='service_ended');
  assert.match(ended.message,/^Service ended Fri, Nov 20, 2026, 8:00 AM AST\..*Export records before Thu, Feb 18, 2027, 8:00 AM AST\./);
  assert.equal(f.lifecycle.snapshot(B).notices.length,0);
});

test('minute warnings show the billing month in the business time zone',async t=>{
  const f=fixture(t);f.db.prepare("UPDATE users SET timezone=? WHERE id=?").run(MONCTON,A);
  f.activate(A,{plan:'Operator'});f.call((300-60)*60);await f.service.processOwner(A);
  const sent=f.fakes.writes.email.find(m=>m.to===A+'@example.invalid'&&/60 voice minutes left/.test(m.subject));
  assert.ok(sent,'warning email sent');
  assert.match(sent.text,/^Billing month: Tue, Oct 20, 2026 to Fri, Nov 20, 2026\.$/m);
  assert.doesNotMatch(sent.text,ISO_INSTANT);
});

test('account verification and reset links state how long they last instead of a UTC timestamp',async t=>{
  const database=new Database(':memory:');t.after(()=>database.close());
  database.exec('CREATE TABLE users(id TEXT PRIMARY KEY, ownerId TEXT, email TEXT UNIQUE, passwordHash TEXT, firstName TEXT, businessName TEXT, plan TEXT, planStatus TEXT, trialEndsAt TEXT, timezone TEXT, role TEXT, createdAt TEXT, emailVerifiedAt TEXT)');
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  const mail=[],now=()=>new Date('2026-10-29T12:00:00Z');
  const handlers=createAuthHandlers({database,tokenService:createAuthTokenService(database,{clock:now}),now,
    environment:{NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:'SYNTHETIC_PLAIN_TIME_SECRET_ONLY',BCRYPT_COST:12},
    hashPassword:async p=>'hash:'+p,comparePassword:async(p,h)=>h==='hash:'+p,issueSessionToken:u=>'session:'+u.id,
    sendEmail:async m=>{mail.push(m);return {accepted:true};}});
  const call=async(handler,body)=>{const res={statusCode:200,setHeader(){},status(c){this.statusCode=c;return this;},json(p){this.body=p;return this;}};await handler({method:'POST',ip:'synthetic-ip',body,query:{}},res);return res;};
  await call(handlers.register,{email:'owner@example.invalid',password:'original-pass',firstName:'Owner',businessName:'Synthetic business',plan:'Operator'});
  database.prepare("UPDATE users SET emailVerifiedAt=? WHERE email='owner@example.invalid'").run('2026-10-29T12:00:00.000Z');
  await call(handlers.forgotPassword,{email:'owner@example.invalid'});
  assert.match(mail[0].text,/This link expires in 24 hours\./);
  assert.match(mail.at(-1).text,/This link expires in 30 minutes\./);
  for(const m of mail)assert.doesNotMatch(m.text,ISO_INSTANT);
});

test('office-staff invitations state how long the link lasts instead of a UTC timestamp',async t=>{
  const {CREATE_TABLE_STATEMENTS,CREATE_TRIGGER_STATEMENTS}=await import('../server/src/schema.js');
  const {createStaffService}=await import('../server/src/staffService.js');
  const {createAuthSessionService}=await import('../server/src/authSessionService.js');
  const env={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:'SYNTHETIC_STAFF_PLAIN_TIME_SECRET_ONLY',BCRYPT_COST:12};
  const database=new Database(':memory:');database.pragma('foreign_keys=ON');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS customers')));
  for(const sql of CREATE_TRIGGER_STATEMENTS.filter(sql=>sql.includes('users_staff_parent')))database.exec(sql);
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  const now=()=>new Date('2026-10-29T12:00:00.000Z'),mail=[];
  const staff=createStaffService({database,ownerQuery:sql=>database.prepare(sql),tokenService:createAuthTokenService(database,{clock:now}),
    sessionService:createAuthSessionService(database,{environment:env}),now,environment:env,
    sendEmail:async message=>{mail.push(message);return {accepted:true};},hashPassword:async p=>'hash:'+p});
  database.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,emailVerifiedAt)
    VALUES('SYNTHETIC-owner','owner@example.invalid','hash:x','Owner','Synthetic Fence Co','Operator','active',?,'owner',?,?)`).run(MONCTON,now().toISOString(),now().toISOString());
  await staff.invite('SYNTHETIC-owner',{name:'Synthetic staff',email:'staff@example.invalid'});
  assert.equal(mail.length,1);
  assert.match(mail[0].text,/This one-time link expires in 24 hours\./);
  assert.doesNotMatch(mail[0].text,ISO_INSTANT);
});
