import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Real HTTP route, auth middleware and SQLite. Before this change the only
// writers of users.timezone sat behind requireOperatorAccess, so a Starter
// owner could never leave UTC. POST /api/onboarding/account now accepts an
// optional IANA timezone for every plan.
test('onboarding account saves a business timezone for Starter, Operator and QuoteDone',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-onboarding-timezone-'));
  const originalEnvironment={...process.env};
  Object.assign(process.env,{
    NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),
    PRICEBOOK_PATH:join(directory,'books'),JWT_SECRET:'SYNTHETIC_ONBOARDING_TIMEZONE_SECRET_20261104',
    VOICE_RUNTIME_ENABLED:'false',ALLOW_PROVIDER_WRITES:'false',
    TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),
    TWILIO_API_KEY_SECRET:'SYNTHETIC_TEST_ONLY'
  });
  let lifecycle;
  try {
    const server=await import('../server/src/server.js');
    lifecycle=server.lifecycle;
    if(!server.httpServer.listening)await once(server.httpServer,'listening');
    const {db}=await import('../server/src/db.js');
    const {createAuthSessionService}=await import('../server/src/authSessionService.js');
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    const now='2026-11-04T12:00:00.000Z';

    function owner(plan) {
      const id='[SYNTHETIC]-timezone-'+plan;
      db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC] First','[SYNTHETIC] Business',plan,'active',now,'UTC','owner',now);
      db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
        .run(id,'cus_SYNTHETIC_timezone_'+plan,now,now,now);
      return {id,token:createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token};
    }
    async function account(who,body) {
      db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(who.id);
      const response=await fetch(base+'/api/onboarding/account',{
        method:'POST',headers:{authorization:'Bearer '+who.token,'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      return {status:response.status,body:await response.json()};
    }
    const stored=who=>db.prepare('SELECT firstName,timezone FROM users WHERE id=?').get(who.id);

    for(const plan of ['Starter','Operator','QuoteDone']) {
      const who=owner(plan);
      let result=await account(who,{firstName:'[SYNTHETIC] Pat',businessName:'[SYNTHETIC] Roofing',timezone:'America/Halifax'});
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal(result.body.account.timezone,'America/Halifax',plan);
      assert.equal(stored(who).timezone,'America/Halifax',plan);

      // Leaving the field out keeps the saved value.
      result=await account(who,{firstName:'[SYNTHETIC] Pat',businessName:'[SYNTHETIC] Roofing'});
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal(result.body.account.timezone,'America/Halifax',plan);
      assert.equal(stored(who).timezone,'America/Halifax',plan);

      // Invalid or non-string values are refused with no partial write.
      for(const timezone of ['Mars/Base','',' America/Toronto','+05:00','-0300',42,null,true,{},['America/Toronto']]) {
        result=await account(who,{firstName:'[SYNTHETIC] Changed',businessName:'[SYNTHETIC] Roofing',timezone});
        assert.equal(result.status,400,`${plan} ${JSON.stringify(timezone)}`);
        assert.equal(result.body.error,'Choose a valid time zone.');
        assert.deepEqual(stored(who),{firstName:'[SYNTHETIC] Pat',timezone:'America/Halifax'},`${plan} ${JSON.stringify(timezone)}`);
      }

      // Stored as the canonical IANA spelling.
      result=await account(who,{firstName:'[SYNTHETIC] Pat',businessName:'[SYNTHETIC] Roofing',timezone:'america/toronto'});
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal(stored(who).timezone,'America/Toronto',plan);
    }
  } finally {
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!(key in originalEnvironment))delete process.env[key];
    Object.assign(process.env,originalEnvironment);
    rmSync(directory,{recursive:true,force:true});
  }
});
