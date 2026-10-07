import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {quoteEmailFixture,environment,fixedReceipt} from './quoteEmailFixture.mjs';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createQuoteEmailService} from '../server/src/quoteEmailService.js';
import {migrateDatabase} from '../server/src/migrations.js';
import {VOICE_TOOL_NAMES,validateVoiceToolCall} from '../server/src/voice/toolSchemas.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';

test('No SMS tool, template or provider remains reachable, including old persisted requests',async t=>{
  const f=quoteEmailFixture(t);
  assert.ok(!VOICE_TOOL_NAMES.includes('sendSms'));
  for(const template of ['quote','booking','callback','reminder'])await assert.rejects(f.tool('sendSms',{template,recordHandle:'a'.repeat(40)}));
  for(const name of ['voiceSmsService.js','voiceSmsProvider.js'])assert.equal(existsSync(new URL('../server/src/'+name,import.meta.url)),false);
  const server=readFileSync(new URL('../server/src/server.js',import.meta.url),'utf8');assert.doesNotMatch(server,/smsDelivery|Sms|sms-status/);
  const adapters=readFileSync(new URL('../server/src/voice/voiceProviderAdapters.js',import.meta.url),'utf8');assert.doesNotMatch(adapters,/messages\.create|sendSms/);
  f.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,status,createdAt,updatedAt) VALUES('SYNTHETIC-old',?,'voice.sms_requested','SYNTHETIC','{}','PENDING',?,?)").run(f.c.ownerId,at,at);
  migrateDatabase(f.db);await f.emailService().dispatchOnce();
  assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(f.c.ownerId,'SYNTHETIC-old').status,'CANCELLED');assert.equal(f.sends(),0);
});
test('Read-back correction invalidates the mistaken email before any delivery',async t=>{
  const f=quoteEmailFixture(t),q=f.savedQuote();
  const wrong=await f.tool('prepareQuoteEmail',{quoteHandle:q.quoteHandle,email:'wrong@example.invalid'});
  assert.match(wrong.readBack,/wrong@example.invalid/);assert.match(wrong.readBack,/w r o n g at/);
  const corrected=await f.tool('prepareQuoteEmail',{quoteHandle:q.quoteHandle,email:'correct@example.invalid'});
  await assert.rejects(f.tool('sendQuoteEmail',{emailConfirmationHandle:wrong.emailConfirmationHandle,customerConfirmed:true}));
  await assert.rejects(f.tool('sendQuoteEmail',{emailConfirmationHandle:corrected.emailConfirmationHandle,customerConfirmed:false}));
  assert.equal(f.rows().length,0);assert.equal(f.sends(),0);
  await f.tool('sendQuoteEmail',{emailConfirmationHandle:corrected.emailConfirmationHandle,customerConfirmed:true});
  await f.emailService().dispatchOnce();assert.equal(f.rows()[0].recipient,'correct@example.invalid');assert.equal(f.rows()[0].status,'DELIVERED');assert.equal(f.sends(),1);
});
test('Frozen complete spoken quote is the email body, under business name with owner reply-to',async t=>{
  const f=quoteEmailFixture(t),receipt={resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:fixedReceipt(),pricedScope:{service:'[SYNTHETIC] Lawn',facts:[{label:'Area',value:'5000 square feet'}]},additionalWork:[{description:'[SYNTHETIC] Stump removal'}],fullJobTotal:null};
  const saved=f.savedQuote(receipt);await f.queue(saved);
  f.db.prepare("UPDATE quoteSubmissions SET customerResponseJson='{}' WHERE ownerId=? AND requestId=?").run(f.c.ownerId,saved.requestId);
  await f.emailService().dispatchOnce();const r=f.rows()[0],m=JSON.parse(r.messageJson);
  assert.equal(m.text.split('\n\nView your saved quote: ')[0],saved.narration);assert.equal(r.narration,saved.narration);
  for(const phrase of ['$100 CAD per visit','No tax added.','Clipping bagging and disposal','Stump removal','5000 square feet','Access must be clear.','A total for all requested work is not available.'])assert.ok(m.text.includes(phrase),phrase);
  assert.equal(m.from,'"Synthetic Repairs" <quotes@example.invalid>');assert.equal(m.replyTo,'synthetic-a@example.invalid');assert.doesNotMatch(m.text,/PRIVATE_RATE/);
  assert.match(m.text,/https:\/\/synthetic.example.invalid\/quote-copy\/synthetic-a\/[A-Za-z0-9_-]{43}$/);
});
test('Retries, new tool IDs and restarts keep one durable email and one provider acceptance',async t=>{
  const f=quoteEmailFixture(t),saved=f.savedQuote();await f.queue(saved);await f.emailService().dispatchOnce();const before=f.rows()[0];
  f.restart();await f.queue(saved);await f.emailService().dispatchOnce();assert.equal(f.sends(),1);assert.equal(f.rows().length,1);assert.equal(f.rows()[0].messageJson,before.messageJson);
  assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(f.c.ownerId,before.id).status,'DELIVERED');
  const view=f.service.detail({ownerId:f.c.ownerId,id:f.c.callSid,role:'owner'}).deliveryActions[0];
  assert.equal(view.status,'DELIVERED');assert.equal(view.recipient,'caller@example.invalid');assert.equal(view.attemptCount,1);assert.doesNotMatch(JSON.stringify(view),/tokenHash|messageJson|View your saved|PRIVATE_RATE/);
});
test('Ambiguous accepted POST retries the same key and bytes, with one physical delivery',async t=>{
  let posts=0,physical=0,first;const accepted=new Map();
  const f=quoteEmailFixture(t,{provider:{send:async m=>{posts++;if(!accepted.has(m.idempotencyKey)){physical++;accepted.set(m.idempotencyKey,structuredClone(m));first=m;throw Error('SYNTHETIC lost response');}assert.deepEqual(m,first);return {accepted:true,id:'SYNTHETIC-id'};},read:async id=>({id,to:[first.to],from:first.from,subject:first.subject,last_event:'delivered'})}});
  await f.queue();await f.emailService().processOne(f.c.ownerId);assert.equal(f.rows()[0].status,'PENDING');f.advance(60000);f.restart();await f.emailService().dispatchOnce();assert.equal(posts,2);assert.equal(physical,1);assert.equal(f.rows()[0].status,'DELIVERED');
});
test('Expired idempotency window requires review and never risks resending',async t=>{
  let posts=0;const f=quoteEmailFixture(t,{provider:{send:async()=>{posts++;throw Error('SYNTHETIC uncertain');}}});await f.queue();await f.emailService().processOne(f.c.ownerId);f.advance(23*3600000);f.restart();await f.emailService().dispatchOnce();assert.equal(posts,1);assert.equal(f.rows()[0].status,'REVIEW');assert.equal(f.rows()[0].lastErrorCode,'EMAIL_DEDUPE_WINDOW_EXPIRED');
});
test('Concurrent workers hold one send lease; crashed lease replays safely',async t=>{
  let release,posts=0;const f=quoteEmailFixture(t,{provider:{send:async()=>{posts++;await new Promise(r=>release=r);return {accepted:true,id:'SYNTHETIC-one'};}}});await f.queue();const work=f.emailService().processOne(f.c.ownerId);assert.ok(release);f.restart();assert.equal(await f.emailService().processOne(f.c.ownerId),false);assert.equal(posts,1);release();await work;assert.equal(f.rows()[0].status,'ACCEPTED');
});
test('Blocked provider preserves the request and recovers without claiming delivery',async t=>{
  let ready=false,posts=0;const f=quoteEmailFixture(t,{provider:{ready:()=>ready,send:async()=>({accepted:true,id:'SYNTHETIC-'+(++posts)})}});const r=await f.queue();assert.equal(r.result.deliveryStatus,'PENDING');await f.emailService().dispatchOnce();assert.equal(f.rows()[0].status,'BLOCKED');assert.equal(f.rows()[0].attemptCount,0);ready=true;f.advance(5000);await f.emailService().processOne(f.c.ownerId);assert.equal(f.rows()[0].status,'ACCEPTED');assert.equal(posts,1);
});
test('Permanent rejection and bounded ambiguous retries do not become resend loops',async t=>{
  for(const definitive of [true,false]){
    let posts=0;const f=quoteEmailFixture(t,{provider:{send:async()=>{posts++;throw Object.assign(Error('SYNTHETIC'),{definitive});}}});await f.queue();for(let i=0;i<12;i++){await f.emailService().dispatchOnce();f.advance(60000);}assert.equal(posts,definitive?1:8);assert.equal(f.rows()[0].status,definitive?'FAILED':'REVIEW');
  }
});
test('Transactional queue failure cannot leave an outbox or acknowledge delivery',async t=>{
  const f=quoteEmailFixture(t);f.db.exec("CREATE TRIGGER synthetic_email_fail BEFORE INSERT ON quoteEmailDeliveries BEGIN SELECT RAISE(ABORT,'SYNTHETIC_DB_FAILURE'); END");await assert.rejects(f.queue());assert.equal(f.sends(),0);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE ownerId=? AND eventType='quote.email_requested'").get(f.c.ownerId).n,0);
});
test('Durable pending email survives a real SQLite close and reopen',async t=>{
  const dir=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-email-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const filename=path.join(dir,'data.sqlite');const f=quoteEmailFixture(t,{filename});await f.queue();const before=f.rows()[0];f.db.close();
  const reopened=fixture(t,filename),service=createQuoteEmailService({database:reopened.db,ownerQuery:reopened.ownerQuery,environment,provider:f.provider,clock:()=>Date.parse(at)+60000});await service.dispatchOnce();assert.equal(f.sends(),1);const after=reopened.db.prepare('SELECT * FROM quoteEmailDeliveries WHERE ownerId=?').get(f.c.ownerId);assert.equal(after.messageJson,before.messageJson);assert.equal(after.status,'DELIVERED');
});
test('Quote and confirmation capabilities are bound to tenant, caller and call',async t=>{
  const f=quoteEmailFixture(t),q=f.savedQuote(),c=await f.tool('prepareQuoteEmail',{quoteHandle:q.quoteHandle,email:'caller@example.invalid'});
  for(const context of [f.context('synthetic-b'),f.context(),{...f.c,from:'+19025550999'}]){
    await assert.rejects(f.voice(context)({name:'prepareQuoteEmail',args:{quoteHandle:q.quoteHandle,email:'attacker@example.invalid'},toolCallId:'SYNTHETIC-foreign-prepare'}));
    await assert.rejects(f.voice(context)({name:'sendQuoteEmail',args:{emailConfirmationHandle:c.emailConfirmationHandle,customerConfirmed:true},toolCallId:'SYNTHETIC-foreign-send'}));
  }
  assert.equal(f.rows().length,0);assert.throws(()=>f.emailService().state('synthetic-b',q.requestId));
});
test('Changed owner reply-to requires review before any outbound message',async t=>{
  const f=quoteEmailFixture(t);await f.queue();f.db.prepare('UPDATE users SET email=? WHERE id=?').run('new@example.invalid',f.c.ownerId);await f.emailService().dispatchOnce();assert.equal(f.sends(),0);assert.equal(f.rows()[0].lastErrorCode,'OWNER_EMAIL_CHANGED');
});
test('Booking outboxes alert only the owner once with appointment details',async t=>{
  const f=quoteEmailFixture(t),requests=[];
  f.db.prepare("INSERT INTO appointments(id,ownerId,status,startAtUtc,endAtUtc,timezone,customerJson,locationJson,createdAt) VALUES('SYNTHETIC-booking',?,'CONFIRMED','2026-10-07T13:00:00Z','2026-10-07T14:00:00Z','UTC',?,? ,?)").run(f.c.ownerId,JSON.stringify({name:'[SYNTHETIC] Caller',email:'caller@example.invalid'}),JSON.stringify({addressLine1:'[SYNTHETIC] 10 Test Street'}),at);
  for(const eventType of ['appointment.booked','appointment.changed'])f.db.prepare('INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)').run('SYNTHETIC-'+eventType,f.c.ownerId,eventType,'SYNTHETIC-booking','{}',at,at);
  const worker=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,clock:()=>Date.parse(at),ready:()=>true,environment:{EMAIL_FROM:'synthetic@example.invalid'},send:async r=>{requests.push(r);return {accepted:true,id:'SYNTHETIC-owner-'+requests.length};}});
  await worker.dispatchOnce();await worker.dispatchOnce();assert.equal(requests.length,2);for(const m of requests){assert.equal(m.to,'synthetic-a@example.invalid');assert.match(m.text,/2026-10-07T13:00:00Z/);assert.match(m.text,/10 Test Street/);}assert.equal(f.rows().length,0);
});
