import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Real HTTP route, auth middleware and SQLite. Pressing Cancel on Google's consent screen
// used to leave the owner on a page of raw error text, with the one-time state unused.
// HANDWRITTEN EXPECTATIONS, before execution:
// - Cancel (error=access_denied, no code) redirects to CLIENT_URL/onboarding?step=8&calendar=cancelled;
// - the state issued for that attempt is used up, and a later callback with it is refused;
// - with no state or an unknown one: the same redirect, nothing written.
test('Google consent screen Cancel: back to the app with calendar=cancelled, the state used up',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-calendar-cancel-'));
  const original={...process.env};
  Object.assign(process.env,{NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),PRICEBOOK_PATH:join(directory,'books'),
    JWT_SECRET:'SYNTHETIC_CALENDAR_CANCEL_SECRET_20261125',VOICE_RUNTIME_ENABLED:'false',ALLOW_PROVIDER_WRITES:'true',
    CLIENT_URL:'https://app.synthetic.invalid/',
    GOOGLE_CLIENT_ID:'SYNTHETIC_GOOGLE_CLIENT',GOOGLE_CLIENT_SECRET:'SYNTHETIC_GOOGLE_SECRET',GOOGLE_CALENDAR_REDIRECT_URI:'https://app.synthetic.invalid/api/onboarding/calendar/google/callback',
    TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC_TEST_ONLY'});
  let lifecycle;
  try{
    const server=await import('../server/src/server.js');lifecycle=server.lifecycle;
    if(!server.httpServer.listening)await once(server.httpServer,'listening');
    const {db}=await import('../server/src/db.js');
    const {createAuthSessionService}=await import('../server/src/authSessionService.js');
    const base='http://127.0.0.1:'+server.httpServer.address().port,now=new Date().toISOString(),id='synthcalcancel1';
    db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(id,'calendar-cancel@example.invalid','[SYNTHETIC]','[SYNTHETIC] First','[SYNTHETIC] Business','Operator','active',now,'America/Moncton','owner',now);
    db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(id,'cus_SYNTHETIC_calendar_cancel',now,now,now);
    db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
    const token=createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
    const started=await fetch(base+'/api/onboarding/calendar/google/start',{headers:{authorization:'Bearer '+token}});
    assert.equal(started.status,200);
    const state=new URL((await started.json()).authorizationUrl).searchParams.get('state');
    const rows=()=>db.prepare('SELECT consumedAt FROM calendarOAuthStates WHERE ownerId=?').all(id);
    assert.deepEqual(rows(),[{consumedAt:null}]);
    const cancel=await fetch(base+'/api/onboarding/calendar/google/callback?error=access_denied&state='+encodeURIComponent(state),{redirect:'manual'});
    assert.equal(cancel.status,302);
    assert.equal(cancel.headers.get('location'),'https://app.synthetic.invalid/onboarding?step=8&calendar=cancelled');
    assert.equal(typeof rows()[0].consumedAt,'number');
    // The used-up state cannot complete a connection afterwards.
    const replay=await fetch(base+'/api/onboarding/calendar/google/callback?code=SYNTHETIC&state='+encodeURIComponent(state),{redirect:'manual'});
    assert.notEqual(replay.status,302);
    // No state, or a made-up one: same redirect, nothing written.
    for(const query of ['?error=access_denied','?error=access_denied&state=SYNTHETIC_UNKNOWN_STATE']){
      const response=await fetch(base+'/api/onboarding/calendar/google/callback'+query,{redirect:'manual'});
      assert.equal(response.status,302);assert.equal(response.headers.get('location'),'https://app.synthetic.invalid/onboarding?step=8&calendar=cancelled');
    }
    assert.equal(db.prepare('SELECT COUNT(*) n FROM calendarOAuthStates').get().n,1);
  }finally{
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!(key in original))delete process.env[key];
    Object.assign(process.env,original);
    rmSync(directory,{recursive:true,force:true});
  }
});

