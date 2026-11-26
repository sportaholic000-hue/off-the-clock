import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Real HTTP route, auth middleware, SQLite and price-book storage. Before this
// change POST /api/business/jurisdiction sat behind requirePriceBookPlan, so a
// Starter owner got 403 and step 3 saved nothing. Starter now saves country and
// region only; Operator and QuoteDone keep the price-book tax path.
test('Starter saves country and region only; Operator and QuoteDone keep the tax path',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-starter-jurisdiction-'));
  const originalEnvironment={...process.env};
  Object.assign(process.env,{
    NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),
    PRICEBOOK_PATH:join(directory,'books'),JWT_SECRET:'SYNTHETIC_STARTER_JURISDICTION_SECRET_20261104',
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
    const {loadPricebook}=await import('../server/priceBookService.js');
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    const now='2026-11-04T12:00:00.000Z';
    const bookFile=id=>join(directory,'books',id+'.json');

    function owner(plan,suffix,planStatus='active') {
      const id='[SYNTHETIC]-jurisdiction-'+suffix;
      db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]',plan,planStatus,now,'UTC','owner',now);
      db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
        .run(id,'cus_SYNTHETIC_'+suffix,now,now,now);
      return {id,planStatus,token:createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token};
    }
    async function jurisdiction(who,body) {
      db.prepare('UPDATE users SET planStatus=? WHERE id=?').run(who.planStatus,who.id);
      const response=await fetch(base+'/api/business/jurisdiction',{
        method:'POST',headers:{authorization:'Bearer '+who.token,'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      return {status:response.status,body:await response.json()};
    }
    const profile=who=>db.prepare('SELECT country,region,onboardingStep FROM businessProfiles WHERE ownerId=?').get(who.id);

    // Starter: country and region are saved; no price book is read or created.
    const starter=owner('Starter','starter');
    let result=await jurisdiction(starter,{country:'ca',region:'nb'});
    assert.equal(result.status,200,JSON.stringify(result.body));
    assert.deepEqual(result.body,{country:'CA',region:'NB'});
    assert.equal(profile(starter).country,'CA');
    assert.equal(profile(starter).region,'NB');
    assert.ok(profile(starter).onboardingStep>=4);
    assert.equal(existsSync(bookFile(starter.id)),false,'Starter must not create a price book');

    // Any tax field from Starter returns 400 and saves nothing.
    for(const body of [{country:'US',region:'OR',taxMode:'TAX_NONE'},{country:'US',region:'OR',taxPercent:5},
      {country:'US',region:'OR',taxMode:'TAX_ALL',taxPercent:''},{country:'US',region:'OR',taxPercent:null}]) {
      result=await jurisdiction(starter,body);
      assert.equal(result.status,400,JSON.stringify(body));
      assert.equal(profile(starter).country,'CA',JSON.stringify(body));
      assert.equal(profile(starter).region,'NB',JSON.stringify(body));
      assert.equal(existsSync(bookFile(starter.id)),false);
    }

    // Operator and QuoteDone: unchanged tax, price-book and currency behavior.
    for(const plan of ['Operator','QuoteDone']) {
      const who=owner(plan,plan.toLowerCase());
      result=await jurisdiction(who,{country:'CA',region:'NB'});
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal(result.body.taxMode,'TAX_ALL');
      assert.equal(result.body.taxPercent,15);
      const book=loadPricebook(who.id);
      assert.equal(book.defaults.taxMode,'TAX_ALL');
      assert.equal(book.defaults.taxPercent,15);
      assert.equal(book.defaults.currency,'CAD');
      assert.equal(profile(who).country,'CA');
      assert.equal(profile(who).region,'NB');
      // Explicit tax settings stay accepted on these plans.
      result=await jurisdiction(who,{country:'US',region:'NY',taxMode:'TAX_MATERIALS',taxPercent:8.875});
      assert.equal(result.status,200,JSON.stringify(result.body));
      assert.equal(loadPricebook(who.id).defaults.taxPercent,8.875);
    }

    // A canceled Operator account is still refused and saves nothing; the
    // Starter path never applies to a non-Starter plan.
    const lapsed=owner('Operator','lapsed-operator','canceled');
    result=await jurisdiction(lapsed,{country:'CA',region:'NB'});
    assert.equal(result.status,403,JSON.stringify(result.body));
    assert.equal(profile(lapsed)?.country||'','');
    assert.equal(existsSync(bookFile(lapsed.id)),false);
  } finally {
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!(key in originalEnvironment))delete process.env[key];
    Object.assign(process.env,originalEnvironment);
    rmSync(directory,{recursive:true,force:true});
  }
});
