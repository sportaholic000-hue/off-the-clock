import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {db,migrate} from '../server/src/db.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {confirmedHistory} from './returningCallerTestHelper.mjs';

function context(f){const c={ownerId:'synthetic-a',callSid:'CA'+crypto.randomBytes(16).toString('hex'),accountSid:'AC'+'a'.repeat(32),from:'+19025550100',to:'+19025550101'};f.db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,transcriptJson,createdAt) VALUES(?,?,?,?,?,?,'CONNECTED','[]',?)").run(c.callSid,c.ownerId,c.callSid,c.accountSid,c.from,c.to,at);return c;}

test('D16 web review and voice share exact normalized owner-phone identity',async t=>{
 migrate();const f=fixture(t,process.env.DATABASE_PATH),phone='+1 (902) 555-0100';
 const body={requestId:crypto.randomUUID(),serviceId:crypto.randomUUID(),serviceRequest:'[SYNTHETIC] repair gate',customerInputs:{},contact:{phone},reviewRequested:true};
 submitQuote('synthetic-a',body);const web=db.prepare('SELECT * FROM customers WHERE ownerId=? AND phoneE164=?').get('synthetic-a','+19025550100');assert.ok(web,'Web must create a normalized customer identity');
 const c=context(f);await f.voice(c).tool('captureLead',{name:'[SYNTHETIC] Alex'});
 assert.equal(JSON.parse(f.lead(c)[0].collectedInputsJson).customerId,web.id);
 const receipt=db.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(c.ownerId,body.requestId);assert.equal(JSON.parse(receipt.internalOutcomeJson).customerId,web.id);
 assert.equal(submitQuote(c.ownerId,body).status,200);assert.equal(db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=?').get(c.ownerId).n,1);
});

test('D16 email-only and ambiguous local phones never deduplicate on name or email',t=>{
 const f=fixture(t,process.env.DATABASE_PATH);const before=db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=?').get('synthetic-a').n;
 for(const contact of [{email:'same@example.invalid'},{email:'same@example.invalid',phone:'5550100'},{phone:'9025550100'}])submitQuote('synthetic-a',{requestId:crypto.randomUUID(),serviceId:crypto.randomUUID(),serviceRequest:'[SYNTHETIC] unknown phone country',customerInputs:{},contact,reviewRequested:true});
 assert.equal(db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=?').get('synthetic-a').n,before);
});
test('D16 public web input cannot overwrite established voice identity and web history reaches returning caller',async t=>{
 const f=fixture(t,process.env.DATABASE_PATH),c=context(f),voice=f.voice(c);await voice.tool('captureLead',{name:'[SYNTHETIC] Established',email:'known@example.invalid'});
 const body={requestId:crypto.randomUUID(),serviceId:crypto.randomUUID(),serviceRequest:'[SYNTHETIC] web history request',customerInputs:{},contact:{phone:'+1 (902) 555-0100',email:'claimed@example.invalid'},reviewRequested:true};submitQuote(c.ownerId,body);
 const customer=db.prepare('SELECT * FROM customers WHERE ownerId=? AND phoneE164=?').get(c.ownerId,c.from);assert.equal(customer.name,'[SYNTHETIC] Established');assert.equal(JSON.parse(customer.notesJson).email,'known@example.invalid');
 const result=await confirmedHistory(f.db,c,args=>voice.tool('getCustomerContext',args));assert.ok(result.openLeads.some(v=>v.description===body.serviceRequest));assert.ok(result.quoteRequests.some(v=>v.description===body.serviceRequest));
});
test('D16 web identity and all related records roll back when receipt persistence fails',t=>{
 fixture(t,process.env.DATABASE_PATH);const contact={phone:'+19025550155'},body={requestId:crypto.randomUUID(),serviceId:crypto.randomUUID(),serviceRequest:'[SYNTHETIC] rollback',customerInputs:{},contact,reviewRequested:true};
 db.exec("CREATE TRIGGER synthetic_web_failure BEFORE INSERT ON quoteSubmissions BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");try{assert.throws(()=>submitQuote('synthetic-a',body));assert.equal(db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=? AND phoneE164=?').get('synthetic-a',contact.phone).n,0);}finally{db.exec('DROP TRIGGER synthetic_web_failure');}
 submitQuote('synthetic-a',body);assert.equal(db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=? AND phoneE164=?').get('synthetic-a',contact.phone).n,1);
});
test('D16 independent concurrent processes and restarted retry resolve one persistent identity',async t=>{
 fixture(t,process.env.DATABASE_PATH);const {spawn}=await import('node:child_process');const contact={phone:'+19025550156'};
 const body={requestId:crypto.randomUUID(),serviceId:crypto.randomUUID(),serviceRequest:'[SYNTHETIC] concurrent identity',customerInputs:{},contact,reviewRequested:true};
 const code="import {submitQuote} from './server/src/quoteDoneRoutes.js';import {db} from './server/src/db.js';console.log(JSON.stringify(submitQuote('synthetic-a',JSON.parse(process.env.SYNTHETIC_HISTORY_BODY))));db.close();";
 const run=body=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:new URL('..',import.meta.url),env:{...process.env,SYNTHETIC_HISTORY_BODY:JSON.stringify(body)}});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error(err)));});
 const responses=await Promise.all([run(body),run({...body,requestId:crypto.randomUUID()})]);assert.deepEqual(responses.map(v=>v.status),[201,201]);assert.equal(db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=? AND phoneE164=?').get('synthetic-a',contact.phone).n,1);
 assert.equal((await run(body)).status,200);
});
