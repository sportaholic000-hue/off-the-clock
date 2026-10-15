import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

// Actual HTTP route, auth middleware, SQLite, price-book lock, JSON persistence,
// and reload. Currency is a denomination, not a location-derived exchange:
// first-time US/Canada books default to USD/CAD, while revisiting or crossing
// jurisdictions changes tax only and preserves every numeric price verbatim.
test('QE-014: jurisdiction defaults currency only once and never converts established prices',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-owner-batch-jurisdiction-'));
  const originalEnvironment={...process.env};
  Object.assign(process.env,{
    NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'test.sqlite'),
    PRICEBOOK_PATH:join(directory,'books'),JWT_SECRET:'SYNTHETIC_OWNER_BATCH_JURISDICTION_SECRET',
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
    const {savePricebook,loadPricebook}=await import('../server/priceBookService.js');
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    const now='2026-10-15T12:00:00.000Z';

    function owner(suffix) {
      const id='[SYNTHETIC]-jurisdiction-'+suffix;
      db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'UTC','owner',now);
      db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
        .run(id,'cus_SYNTHETIC_'+suffix,now,now,now);
      return {id,token:createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token};
    }
    async function jurisdiction(account,body) {
      // The synthetic billing row has no Stripe lifecycle events. Keep this
      // explicitly entitled test owner active if a background reconciliation
      // pass observes that deliberately incomplete provider fixture.
      db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(account.id);
      const response=await fetch(base+'/api/business/jurisdiction',{
        method:'POST',headers:{authorization:'Bearer '+account.token,'content-type':'application/json'},
        body:JSON.stringify(body)
      });
      const payload=await response.json();
      assert.equal(response.status,200,JSON.stringify(payload));
      return payload;
    }

    const firstUS=owner('first-us');
    await jurisdiction(firstUS,{country:'US',region:'OR'});
    assert.equal(loadPricebook(firstUS.id).defaults.currency,'USD');

    const firstCA=owner('first-ca');
    await jurisdiction(firstCA,{country:'CA',region:'ON'});
    assert.equal(loadPricebook(firstCA.id).defaults.currency,'CAD');

    const usdInCanada=owner('usd-in-canada');
    savePricebook(usdInCanada.id,{services:[{serviceType:'CUSTOM',service:'[SYNTHETIC] USD service',pricing:{price:12345}}],defaults:{currency:'USD',taxMode:'TAX_NONE',taxPercent:0}});
    await jurisdiction(usdInCanada,{country:'CA',region:'ON'});
    let persisted=loadPricebook(usdInCanada.id);
    assert.equal(persisted.defaults.currency,'USD');
    assert.equal(persisted.defaults.taxMode,'TAX_ALL');
    assert.equal(persisted.defaults.taxPercent,13);
    assert.equal(persisted.services[0].pricing.price,12345);

    const cadInUS=owner('cad-in-us');
    savePricebook(cadInUS.id,{services:[{serviceType:'CUSTOM',service:'[SYNTHETIC] CAD service',pricing:{price:67890}}],defaults:{currency:'CAD',taxMode:'TAX_ALL',taxPercent:5}});
    await jurisdiction(cadInUS,{country:'US',region:'OR'});
    persisted=loadPricebook(cadInUS.id);
    assert.equal(persisted.defaults.currency,'CAD');
    assert.equal(persisted.defaults.taxMode,'TAX_NONE');
    assert.equal(persisted.defaults.taxPercent,0);
    assert.equal(persisted.services[0].pricing.price,67890);

    // Revisit with an explicit tax answer: denomination and price still do not
    // change, and no conversion or location-based reinterpretation occurs.
    await jurisdiction(usdInCanada,{country:'US',region:'NY',taxMode:'TAX_MATERIALS',taxPercent:8.875});
    persisted=loadPricebook(usdInCanada.id);
    assert.equal(persisted.defaults.currency,'USD');
    assert.equal(persisted.defaults.taxMode,'TAX_MATERIALS');
    assert.equal(persisted.defaults.taxPercent,8.875);
    assert.equal(persisted.services[0].pricing.price,12345);
  } finally {
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!(key in originalEnvironment))delete process.env[key];
    Object.assign(process.env,originalEnvironment);
    rmSync(directory,{recursive:true,force:true});
  }
});
