import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';

test('QE-016 owner decision: real authenticated save and interview APIs reject 81 with the identical message',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'otc-name-api-')),environment={...process.env};
  Object.assign(process.env,{NODE_ENV:'test',PORT:'0',DATABASE_PATH:join(directory,'synthetic.sqlite'),PRICEBOOK_PATH:join(directory,'books'),
    JWT_SECRET:'SYNTHETIC_OWNER_NAME_SECRET_FOR_TEST_ONLY',VOICE_RUNTIME_ENABLED:'false',ALLOW_PROVIDER_WRITES:'false',
    TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC_TEST_ONLY'});
  let lifecycle;
  try{
    const server=await import('../server/src/server.js');lifecycle=server.lifecycle;
    if(!server.httpServer.listening)await once(server.httpServer,'listening');
    const {db}=await import('../server/src/db.js');
    const {createAuthSessionService}=await import('../server/src/authSessionService.js');
    const bridge=await import('../server/src/quoteDoneBridge.js');
    const {loadPricebook}=await import('../server/priceBookService.js');
    const {custom}=await import('../verification/engine-independent/fixtures.mjs');
    const id='synthetic-name-api-owner',now='2026-10-15T12:00:00.000Z';
    db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'UTC','owner',now);
    db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
      .run(id,'cus_SYNTHETIC_name',now,now,now);
    const token=createAuthSessionService(db).create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
    const base='http://127.0.0.1:'+server.httpServer.address().port;
    async function request(path,method='GET',body){
      db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
      const response=await fetch(base+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
      return {status:response.status,body:await response.json()};
    }
    const input=custom(),service=structuredClone(input.ownerPricing),date={timeZone:'UTC',quoteInstant:now};
    delete service.origin;delete service.approvedValues;delete service.quoteDoneApproval;delete service.zeroPricePolicy;
    const draft=bridge.convertApplicationBook({services:[service],defaults:{currency:'USD',quoteTimeZone:'UTC',...input.businessDefaults}},'toDollars');
    const initial=(await request('/api/pricebook/'+id)).body;
    draft.services[0].service='X'.repeat(81);
    const rejected=await request('/api/pricebook/save','POST',{...draft,revision:initial.revision});
    assert.equal(rejected.status,400,JSON.stringify(rejected));
    assert.equal(rejected.body.error,'Service name must contain 1–80 characters.');
    assert.equal(loadPricebook(id).services.length,0);
    for(const name of ['X','X'.repeat(40),'X'.repeat(80),'Réparation 🏠']){
      const current=(await request('/api/pricebook/'+id)).body;
      const payload=current.services.length?current:{...draft,revision:current.revision};
      payload.services[0].service=name;
      const saved=await request('/api/pricebook/save','POST',payload);assert.equal(saved.status,200,JSON.stringify(saved));
      const reloaded=(await request('/api/pricebook/'+id)).body,s=reloaded.services[0];
      assert.equal(s.service,name);
      const approved=await request('/api/pricebook/services/'+s.id+'/approve','POST',{revision:reloaded.revision,confirmConfiguration:true,confirmLegacySettings:true});
      assert.equal(approved.status,200,JSON.stringify(approved));
      const stored=loadPricebook(id),quote=bridge.calculateApplicationQuote(stored,stored.services[0],{customerInputs:{...input.customerInputs,service:name},customerFeeSelections:{}},{...date,preparingIntake:true});
      assert.equal(quote.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(quote.internalResult));
      assert.equal(quote.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,12500);
    }
    const created=await request('/api/pricebook/interview','POST',{serviceTypes:['CUSTOM']});assert.equal(created.status,201,JSON.stringify(created));
    const interview=created.body.draft;
    const refused=await request('/api/pricebook/interview/'+interview.id,'PUT',{revision:interview.revision,fields:{CUSTOM:{service:'X'.repeat(81)}}});
    assert.equal(refused.status,422,JSON.stringify(refused));assert.equal(refused.body.error,rejected.body.error);
    const unchanged=await request('/api/pricebook/interview/'+interview.id);assert.deepEqual(unchanged.body.draft,interview);
  }finally{
    if(lifecycle)await lifecycle.shutdown({timeoutMs:5000,exit:code=>assert.equal(code,0)});
    for(const key of Object.keys(process.env))if(!(key in environment))delete process.env[key];Object.assign(process.env,environment);
    rmSync(directory,{recursive:true,force:true});
  }
});
