// Executes the unchanged server entry point. All storage/credentials are synthetic.
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import Database from 'better-sqlite3';
import Stripe from 'stripe';
import {migrateDatabase} from '../../server/src/migrations.js';
import {createBillingStateService} from '../../server/src/billingStateService.js';
import {createAuthSessionService} from '../../server/src/authSessionService.js';

const dir=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-billing-entry-'));
const root=fileURLToPath(new URL('../../',import.meta.url));
const filename=path.join(dir,'SYNTHETIC.sqlite');
const env={NODE_ENV:'test',JWT_SECRET:'SYNTHETIC-entry-key'.padEnd(64,'x'),DATABASE_PATH:filename,APP_DATA_DIR:dir,PRICEBOOK_PATH:path.join(dir,'books'),ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',DEMO_ENABLED:'false',LOCAL_PREVIEW_ENABLED:'false',STRIPE_BILLING_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_SYNTHETIC',STRIPE_WEBHOOK_SECRET:'whsec_SYNTHETIC',STRIPE_OPERATOR_MONTHLY_PRICE_ID:'price_op_month',STRIPE_OPERATOR_ANNUAL_PRICE_ID:'price_op_year',STRIPE_QUOTEDONE_MONTHLY_PRICE_ID:'price_qd_month',STRIPE_QUOTEDONE_ANNUAL_PRICE_ID:'price_qd_year',STRIPE_CHECKOUT_SUCCESS_URL:'https://app.example.invalid/settings/billing',STRIPE_CHECKOUT_CANCEL_URL:'https://app.example.invalid/settings/billing',STRIPE_PORTAL_RETURN_URL:'https://app.example.invalid/settings/billing',STRIPE_INTEGRATION_IDENTIFIER:'audit_entry_abcdefgh',CREDENTIAL_ENCRYPTION_KEY:'44'.repeat(32),EMAIL_PROVIDER:'console',EMAIL_DELIVERY_ENABLED:'false'};
const db=new Database(filename);db.pragma('foreign_keys=ON');migrateDatabase(db);
const owner='SYNTHETIC-entry-owner',now=Math.floor(Date.now()/1000),date=t=>new Date(t*1000).toISOString();
db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Entry Co','QuoteDone','pending_payment','UTC','owner',?)").run(owner,owner+'@example.invalid',date(now));
const billing=createBillingStateService({db,pricePlanMap:{price_qd_month:'QuoteDone'}});billing.registerBillingCustomer({ownerId:owner,stripeCustomerId:'cus_entry'});
const subscription=(id,time,status)=>({id,type:'customer.subscription.updated',created:time,data:{object:{id:'sub_entry',customer:'cus_entry',status,default_payment_method:'pm_SYNTHETIC',items:{data:[{price:{id:'price_qd_month'},current_period_end:now+30*86400}]}}}});
billing.applyVerifiedStripeEvent(subscription('evt_active',now-10*86400,'active'));
billing.applyVerifiedStripeEvent({id:'evt_failed',type:'invoice.payment_failed',created:now-8*86400,data:{object:{id:'in_entry',customer:'cus_entry',subscription:'sub_entry',amount_paid:0,status:'open',lines:{data:[{price:{id:'price_qd_month'}}]}}}});
const token=createAuthSessionService(db,{environment:env}).create(db.prepare('SELECT * FROM users WHERE id=?').get(owner)).token;
db.prepare("INSERT INTO leads(id,ownerId,describedService,collectedInputsJson,type,status,createdAt) VALUES('SYNTHETIC-lead',?,'SYNTHETIC','{}','quote_review','NEEDS REVIEW',?)").run(owner,date(now));
db.prepare("INSERT INTO quoteAccessKeys(ownerId,publicKey,allowedOriginsJson,createdAt) VALUES(?,'SYNTHETIC-public','[\"https://tenant.example.invalid\"]',?)").run(owner,date(now));
const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const child=spawn(process.execPath,['server/src/server.js'],{cwd:root,env:{...process.env,...env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
const base='http://127.0.0.1:'+port,verifier=new Stripe('sk_test_SYNTHETIC_ONLY'),rows=[];
async function request(url,{method='GET',body,headers={}}={}){
 const r=await fetch(base+url,{method,headers:{Authorization:'Bearer '+token,'content-type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)});const text=await r.text();let parsed;try{parsed=JSON.parse(text);}catch{parsed='[NON-JSON RESPONSE]';}return {status:r.status,body:parsed};
}
try{
 const end=Date.now()+20000;while(!output.includes('Off The Clock AI server listening')){assert.equal(child.exitCode,null,output);assert.ok(Date.now()<end,output);await new Promise(resolve=>setTimeout(resolve,20));}
 const stale=await request('/api/billing/status');assert.equal(stale.status,200);assert.equal(stale.body.planStatus,'payment_failed');
 rows.push({id:'S01-real-entry-grace-expired-not-swept',expected:'suspended persisted status',actual:{status:stale.body.planStatus,graceEndsAt:stale.body.graceEndsAt}});
 const denied=await request('/api/quote/prepare',{method:'POST',body:{}});assert.equal(denied.status,403);
 const publicDenied=await request('/api/public/quote/SYNTHETIC-public/prepare',{method:'POST',body:{},headers:{Origin:'https://tenant.example.invalid'}});assert.equal(publicDenied.status,403);
 rows.push({id:'S02-private-and-public-current-state-gates',expected:'403 both without using client plan claims',actual:{private:denied.status,public:publicDenied.status}});
 const write=await request('/api/leads/SYNTHETIC-lead',{method:'PATCH',body:{status:'DISMISSED'}});assert.equal(write.status,200);assert.equal(db.prepare("SELECT status FROM leads WHERE id='SYNTHETIC-lead'").get().status,'DISMISSED');
 const account=await request('/api/onboarding/account',{method:'POST',body:{firstName:'Changed while unpaid',businessName:'SYNTHETIC edit'}});assert.equal(account.status,200);
 rows.push({id:'S03-expired-grace-can-mutate',expected:'read-only dashboard except billing',actual:{leadWriteStatus:write.status,leadPersisted:'DISMISSED',accountWriteStatus:account.status,accountPersisted:db.prepare('SELECT firstName FROM users WHERE id=?').get(owner).firstName}});
 // Execute a real Stripe-signed local webhook; no retrieve path on subscriptions.
 const raw=JSON.stringify(subscription('evt_card_only',now,'active'));
 const signature=verifier.webhooks.generateTestHeaderString({payload:raw,secret:env.STRIPE_WEBHOOK_SECRET});
 const response=await fetch(base+'/api/stripe/webhook',{method:'POST',headers:{'content-type':'application/json','stripe-signature':signature},body:raw});assert.equal(response.status,200);
 const restored=await request('/api/billing/status'),quote=await request('/api/quote/prepare',{method:'POST',body:{}});assert.equal(restored.body.planStatus,'active');assert.notEqual(quote.status,403);
 rows.push({id:'S04-unsettled-debt-real-signed-webhook',expected:'remains denied without resolution of failed invoice',actual:{webhookStatus:response.status,status:restored.body.planStatus,paymentFailedAt:restored.body.paymentFailedAt,quoteGateStatus:quote.status}});
 const refund=await request('/api/billing/refund',{method:'POST',body:{}});assert.equal(refund.status,404);
 rows.push({id:'S05-no-self-serve-refund-endpoint',expected:'unsupported facility identified, no invented refund entitlement rule',actual:{status:refund.status}});
 const checkout=await request('/api/billing/checkout',{method:'POST',body:{plan:'QuoteDone',billingInterval:'monthly'}});assert.equal(checkout.status,503);
 rows.push({id:'S06-provider-write-switch',expected:'provider operations disabled; no Stripe calls',actual:{status:checkout.status}});
 writeFileSync(new URL('server-results.json',import.meta.url),JSON.stringify({syntheticOnly:true,experimentCount:rows.length,rows},null,2)+'\n');
 console.log(JSON.stringify(rows,null,2));
}finally{
 child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(()=>{child.kill('SIGKILL');resolve();},5000))]);
 writeFileSync(new URL('server-runtime.log',import.meta.url),output);db.close();rmSync(dir,{recursive:true,force:true});
}
