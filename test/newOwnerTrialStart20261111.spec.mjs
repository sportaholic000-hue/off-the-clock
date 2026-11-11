import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Real HTTP server, auth middleware and SQLite. Before this change a new owner
// (never started a trial) saving step 2, 5 or 9 got 403 "Your account is
// read-only. Manage billing to restore service." Expected, written first:
// - same 403 (no product access before Stripe confirms a card), but the new
//   owner is told "Start your 14-day trial to continue setup." with code
//   TRIAL_NOT_STARTED, and never sees "read-only" or "restore service";
// - an account that had service and lost it keeps the read-only wording;
// - /api/onboarding/state says trialNotStarted (billing status: test/billingRoutes.spec.mjs).
const directory=mkdtempSync(join(tmpdir(),'otc-new-owner-trial-'));
const originalEnvironment={...process.env};
Object.assign(process.env,{
  NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),
  PRICEBOOK_PATH:join(directory,'books'),JWT_SECRET:'SYNTHETIC_NEW_OWNER_TRIAL_SECRET_20261111',
  VOICE_RUNTIME_ENABLED:'false',ALLOW_PROVIDER_WRITES:'false',
  TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),
  TWILIO_API_KEY_SECRET:'SYNTHETIC_TEST_ONLY'
});

const NOW='2026-11-11T12:00:00.000Z';
const STEP_SAVES=[
  ['step 2','/api/onboarding/business-types',{businessTypes:['CUSTOM']}],
  ['step 5','/api/onboarding/knowledge-base',{about:'[SYNTHETIC] About',hours:'[SYNTHETIC] Weekdays'}],
  ['step 9','/api/onboarding/voice',{voiceId:'female',agentName:'',greeting:'[SYNTHETIC] Thanks for calling, how can I help?'}]
];

test('new owner: step saves are refused with start-trial wording; lost-service accounts keep read-only wording',async()=>{
  let lifecycle;
  try {
    const server=await import('../server/src/server.js');
    lifecycle=server.lifecycle;
    if(!server.httpServer.listening)await once(server.httpServer,'listening');
    const {db}=await import('../server/src/db.js');
    const {createAuthSessionService}=await import('../server/src/authSessionService.js');
    const {trialNeverStarted}=await import('../server/src/billingMutationGuard.js');
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    let sequence=0;
    function owner({planStatus='pending_payment',users={},billing=null,terminalSubscription=false}={}){
      const id='[SYNTHETIC]-trial-start-'+(++sequence);
      db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC] Pat','[SYNTHETIC] Cedar Co','Operator','pending_payment',NOW,'UTC','owner',NOW);
      if(billing)db.prepare(`INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,canceledAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?)`)
        .run(id,'cus_SYNTHETIC_trial_'+sequence,billing.paymentMethodVerifiedAt??null,billing.canceledAt??null,NOW,NOW);
      if(terminalSubscription)db.prepare(`INSERT INTO billingSubscriptionHistory(stripeSubscriptionId,ownerId,stripeCustomerId,status,firstEventId,firstEventCreatedAt,terminalEventId,terminalEventCreatedAt,createdAt,updatedAt)
        VALUES(?,?,?,'TERMINAL',?,1,?,2,?,?)`).run('sub_SYNTHETIC_trial_'+sequence,id,'cus_SYNTHETIC_trial_'+sequence,'evt_SYNTHETIC_first_'+sequence,'evt_SYNTHETIC_end_'+sequence,NOW,NOW);
      const set=Object.entries({planStatus,...users});
      db.prepare(`UPDATE users SET ${set.map(([key])=>key+'=?').join(',')} WHERE id=?`).run(...set.map(([,value])=>value),id);
      return {id,token:createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token};
    }
    async function request(who,path,body){
      const response=await fetch(base+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+who.token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
      return {status:response.status,body:await response.json()};
    }

    // Brand-new owner: registered and verified, never opened checkout.
    for(const brandNew of [owner(),owner({billing:{}})]){
      assert.equal(trialNeverStarted(db,brandNew.id),true);
      for(const [label,path,body] of STEP_SAVES){
        const result=await request(brandNew,path,body);
        assert.equal(result.status,403,label);
        assert.deepEqual({error:result.body.error,code:result.body.code},{error:'Start your 14-day trial to continue setup.',code:'TRIAL_NOT_STARTED'},label);
        assert.doesNotMatch(JSON.stringify(result.body),/read-only|restore service/i,label);
      }
      const state=await request(brandNew,'/api/onboarding/state');
      assert.equal(state.status,200);
      assert.equal(state.body.account.trialNotStarted,true);
      assert.equal(state.body.account.plan,'Operator','the plan picked at sign-up');
      // The first account step stays open, as before.
      const account=await request(brandNew,'/api/onboarding/account',{firstName:'[SYNTHETIC] Pat',businessName:'[SYNTHETIC] Cedar Co'});
      assert.equal(account.status,200,JSON.stringify(account.body));
    }

    // Accounts that had service (or a subscription) and lost it: unchanged wording.
    const lostService=[
      ['card confirmed, then suspended',owner({planStatus:'suspended',billing:{paymentMethodVerifiedAt:NOW}})],
      ['trial expired',owner({planStatus:'trialing',users:{trialEndsAt:'2026-11-01T12:00:00.000Z'},billing:{paymentMethodVerifiedAt:'2026-10-18T12:00:00.000Z'}})],
      ['canceled',owner({planStatus:'canceled',billing:{paymentMethodVerifiedAt:'2026-10-01T12:00:00.000Z',canceledAt:'2026-11-01T12:00:00.000Z'}})],
      ['ended subscription, new checkout pending',owner({billing:{},terminalSubscription:true})],
      ['service ended',owner({users:{serviceEndsAt:'2026-11-01T12:00:00.000Z'}})],
    ];
    for(const [label,who] of lostService){
      assert.equal(trialNeverStarted(db,who.id),false,label);
      const result=await request(who,'/api/onboarding/business-types',{businessTypes:['CUSTOM']});
      assert.equal(result.status,403,label);
      assert.deepEqual({error:result.body.error,code:result.body.code},{error:'Your account is read-only. Manage billing to restore service.',code:'ACCOUNT_READ_ONLY'},label);
      assert.equal((await request(who,'/api/onboarding/state')).body.account.trialNotStarted,false,label);
    }

    // The server rule is unchanged: no product access until Stripe confirms a card.
    const trialing=owner({planStatus:'trialing',users:{trialEndsAt:'2026-11-25T12:00:00.000Z'},billing:{paymentMethodVerifiedAt:NOW}});
    const confirmed=db.prepare('SELECT planStatus FROM users WHERE id=?').get(trialing.id).planStatus;
    assert.equal(confirmed,'trialing');
    assert.equal(trialNeverStarted(db,trialing.id),false);
    const saved=await request(trialing,'/api/onboarding/business-types',{businessTypes:['CUSTOM']});
    assert.notEqual(saved.status,403,JSON.stringify(saved.body));
    // A trialing label without confirmed card evidence is forced back to pending.
    const unconfirmed=owner({planStatus:'trialing',users:{trialEndsAt:'2026-11-25T12:00:00.000Z'}});
    assert.equal(db.prepare('SELECT planStatus FROM users WHERE id=?').get(unconfirmed.id).planStatus,'pending_payment');
    assert.equal((await request(unconfirmed,'/api/onboarding/business-types',{businessTypes:['CUSTOM']})).status,403);
  } finally {
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!(key in originalEnvironment))delete process.env[key];
    Object.assign(process.env,originalEnvironment);
    rmSync(directory,{recursive:true,force:true});
  }
});

test('never-started check keeps the existing wording when billing evidence cannot be read',async()=>{
  const {trialNeverStarted}=await import('../server/src/billingMutationGuard.js');
  // A database without billing evidence tables keeps the existing wording.
  const broken={prepare(){throw new Error('no such table');}};
  assert.equal(trialNeverStarted(broken,'[SYNTHETIC]-owner'),false);
  assert.equal(trialNeverStarted(broken,''),false);
});
