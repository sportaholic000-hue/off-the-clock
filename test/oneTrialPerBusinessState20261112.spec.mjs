import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Owner ruling 2026-11-12: one free trial per business. Real HTTP server,
// auth middleware and SQLite. Expected, written before execution:
// - /api/onboarding/state carries account.trialEligible: true for a brand-new
//   owner, false once the account has trial evidence or has paid;
// - a never-started owner who is not trial-eligible is told "Start your plan to
//   continue setup." (code TRIAL_NOT_STARTED); a brand-new owner still gets
//   "Start your 14-day trial to continue setup.";
// - no product access before Stripe confirms a card, as before.
const directory=mkdtempSync(join(tmpdir(),'otc-one-trial-state-'));
const originalEnvironment={...process.env};
Object.assign(process.env,{
  NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),
  PRICEBOOK_PATH:join(directory,'books'),JWT_SECRET:'SYNTHETIC_ONE_TRIAL_STATE_SECRET_20261112',
  VOICE_RUNTIME_ENABLED:'false',ALLOW_PROVIDER_WRITES:'false',
  TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),
  TWILIO_API_KEY_SECRET:'SYNTHETIC_TEST_ONLY'
});
const NOW='2026-11-12T12:00:00.000Z';

test('onboarding state exposes trialEligible and the start wording follows it',async()=>{
  let lifecycle;
  try {
    const server=await import('../server/src/server.js');
    lifecycle=server.lifecycle;
    if(!server.httpServer.listening)await once(server.httpServer,'listening');
    const {db}=await import('../server/src/db.js');
    const {createAuthSessionService}=await import('../server/src/authSessionService.js');
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    let sequence=0;
    function owner(){
      const id='[SYNTHETIC]-one-trial-'+(++sequence);
      db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC] Pat','[SYNTHETIC] Cedar Co','Operator','pending_payment',NOW,'UTC','owner',NOW);
      db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,createdAt,updatedAt) VALUES(?,?,?,?)').run(id,'cus_SYNTHETIC_one_trial_'+sequence,NOW,NOW);
      return {id,customer:'cus_SYNTHETIC_one_trial_'+sequence,token:createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token};
    }
    async function request(who,path,body){
      const response=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+who.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
      return {status:response.status,body:await response.json()};
    }
    const save=who=>request(who,'/api/onboarding/business-types',{businessTypes:['CUSTOM']});

    const brandNew=owner();
    let state=(await request(brandNew,'/api/onboarding/state')).body.account;
    assert.deepEqual({trialNotStarted:state.trialNotStarted,trialEligible:state.trialEligible},{trialNotStarted:true,trialEligible:true});
    let refused=await save(brandNew);
    assert.deepEqual({status:refused.status,error:refused.body.error,code:refused.body.code},{status:403,error:'Start your 14-day trial to continue setup.',code:'TRIAL_NOT_STARTED'});

    // Still waiting for a first card, but Stripe already reported a subscription
    // with a trial for this business: no second trial is offered.
    const usedTrial=owner();
    db.prepare(`INSERT INTO billingSubscriptionEvidence(stripeSubscriptionId,ownerId,stripeCustomerId,eventCreatedAt,stateJson) VALUES(?,?,?,?,?)`)
      .run('sub_SYNTHETIC_used_trial',usedTrial.id,usedTrial.customer,1,JSON.stringify({status:'incomplete_expired',trialStart:1,trialEnd:2}));
    state=(await request(usedTrial,'/api/onboarding/state')).body.account;
    assert.deepEqual({trialNotStarted:state.trialNotStarted,trialEligible:state.trialEligible},{trialNotStarted:true,trialEligible:false});
    refused=await save(usedTrial);
    assert.deepEqual({status:refused.status,error:refused.body.error,code:refused.body.code},{status:403,error:'Start your plan to continue setup.',code:'TRIAL_NOT_STARTED'});
    assert.doesNotMatch(refused.body.error,/trial|free/i);

    // Paid before: not eligible either.
    const paid=owner();
    db.prepare(`INSERT INTO billingInvoiceEvidence(stripeInvoiceId,ownerId,stripeCustomerId,stripeSubscriptionId,status,paidAt,amountPaid) VALUES(?,?,?,?,'PAID',1,12900)`)
      .run('in_SYNTHETIC_one_trial_paid',paid.id,paid.customer,'sub_SYNTHETIC_paid');
    assert.equal((await request(paid,'/api/onboarding/state')).body.account.trialEligible,false);
    assert.equal((await save(paid)).status,403,'no product access until Stripe confirms a card');
  } finally {
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!(key in originalEnvironment))delete process.env[key];
    Object.assign(process.env,originalEnvironment);
    rmSync(directory,{recursive:true,force:true});
  }
});
