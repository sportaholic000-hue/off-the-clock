import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {fixture} from './leadCaptureRepair20261006Fixture.mjs';
import {migrateDatabase} from '../server/src/migrations.js';
import {createVoiceSessionStore} from '../server/src/voice/voicePersistence.js';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService} from '../server/src/authSessionService.js';
import {installAuthLimitSchema,createAuthRateLimiter} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';
import {installQuoteEmailRoutes} from '../server/src/quoteEmailRoutes.js';
import {validateVoiceSettings} from '../server/src/voice/voiceSettings.js';

// Server launch fixes, 2026-11-16: the real schema, the real call persistence,
// the real sign-in handlers and the real quote-copy route. Synthetic data only;
// no provider, email or text message is contacted.
//
// Expected results, written before running:
//  Owner alerts: a spam-blocked call (new row, or an existing row ended by the
//   spam block) raises no call.completed alert; every other call ending raises
//   exactly one. A database holding the earlier triggers is corrected when the
//   schema installs. Today: the spam-blocked call raises one alert.
//  Sign-in limiter: after 2,000 addresses x 5 failed sign-ins (10,000 junk
//   keys) the real owner from a new address signs in (200) and forgot-password
//   answers 200; the flooding address is still refused (429) and an account
//   with 10 failures is still refused from an unknown address (429). Today:
//   the owner and forgot-password get 429.
//  Quote-copy limiter: after 10,000 addresses, a new address still opens its
//   quote copy (200) and an address over 60 requests a minute is still refused
//   (429). Today: the new address gets 429.
//  Transfer windows: the server's refusal names the day.

// Owner alerts ----------------------------------------------------------------
const completedAlerts=(f,callId)=>f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='call.completed' AND aggregateId=?").all('synthetic-a',callId);
const at='2026-11-16T12:00:00.000Z';
function newContext(serial){return {ownerId:'synthetic-a',callSid:'CA'+String(serial).padStart(32,'0'),accountSid:'AC'+'a'.repeat(32),from:'+19025550100',to:'+19025550101'};}

function checkCallAlerts(f){
  const store=createVoiceSessionStore({database:f.db,clock:()=>new Date(at)});
  // Insert path: the spam block writes a new, already-completed call.
  const fresh=newContext(901);
  const inserted=store.recordFallback({context:fresh,reason:'VOICE_SPAM_BLOCKED'});
  assert.equal(f.db.prepare('SELECT spamFiltered FROM calls WHERE ownerId=? AND id=?').get('synthetic-a',inserted.callRecordId).spamFiltered,1);
  assert.equal(completedAlerts(f,inserted.callRecordId).length,0,'spam insert');
  // Update path: a call already on file is ended by the spam block.
  const existing=f.context();
  store.recordFallback({context:existing,reason:'VOICE_SPAM_BLOCKED'});
  const row=f.db.prepare('SELECT spamFiltered,completedAt FROM calls WHERE ownerId=? AND id=?').get('synthetic-a',existing.callSid);
  assert.equal(row.spamFiltered,1);assert.equal(row.completedAt,at);
  assert.equal(completedAlerts(f,existing.callSid).length,0,'spam update');
  // Non-spam calls still alert exactly once on both paths.
  const ended=f.context();
  f.db.prepare("UPDATE calls SET status='COMPLETED',outcome='CALL_ENDED',completedAt=? WHERE ownerId=? AND id=?").run(at,'synthetic-a',ended.callSid);
  f.db.prepare('UPDATE calls SET completedAt=?,updatedAt=? WHERE ownerId=? AND id=?').run(at,at,'synthetic-a',ended.callSid);
  f.db.prepare("UPDATE calls SET summaryText='[SYNTHETIC] later edit' WHERE ownerId=? AND id=?").run('synthetic-a',ended.callSid);
  assert.equal(completedAlerts(f,ended.callSid).length,1,'non-spam update');
  f.db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,outcome,transcriptJson,completedAt,createdAt) VALUES(?,?,?,?,?,?,'COMPLETED','CALL_ENDED','[]',?,?)")
    .run('synthetic-inserted-ended','synthetic-a','CA'+'f'.repeat(32),'AC'+'a'.repeat(32),'+19025550100','+19025550101',at,at);
  assert.equal(completedAlerts(f,'synthetic-inserted-ended').length,1,'non-spam insert');
  // A non-spam fallback (no completion) raises none, as before.
  const fallback=f.context();store.recordFallback({context:fallback,reason:'VOICE_SESSION_UNAVAILABLE'});
  assert.equal(completedAlerts(f,fallback.callSid).length,0,'fallback without completion');
}

test('owner alerts: a spam-blocked call raises no "Call ended" alert; other calls alert exactly once',t=>{
  checkCallAlerts(fixture(t));
});

// The two triggers exactly as installed before this change (8095fdf9).
const EARLIER_TRIGGERS=[
  `CREATE TRIGGER owner_alert_call_finish AFTER UPDATE OF completedAt ON calls WHEN NEW.completedAt IS NOT NULL AND OLD.completedAt IS NULL
    BEGIN INSERT INTO ownerAlerts(id,ownerId,eventKey,eventType,aggregateId,callId,createdAt,updatedAt)
    VALUES(lower(hex(randomblob(16))),NEW.ownerId,'call.completed:'||NEW.id,'call.completed',NEW.id,NEW.id,NEW.completedAt,NEW.completedAt) ON CONFLICT(ownerId,eventKey) DO NOTHING; END;`,
  `CREATE TRIGGER owner_alert_call_fallback AFTER INSERT ON calls WHEN NEW.completedAt IS NOT NULL
    BEGIN INSERT INTO ownerAlerts(id,ownerId,eventKey,eventType,aggregateId,callId,createdAt,updatedAt)
    VALUES(lower(hex(randomblob(16))),NEW.ownerId,'call.completed:'||NEW.id,'call.completed',NEW.id,NEW.id,NEW.completedAt,NEW.completedAt) ON CONFLICT(ownerId,eventKey) DO NOTHING; END;`
];
test('owner alerts: a database holding the earlier call triggers gets the corrected ones when the schema installs',t=>{
  const f=fixture(t);
  const others=()=>f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name NOT IN ('owner_alert_call_finish','owner_alert_call_fallback') ORDER BY name").all();
  const before=others();
  f.db.exec('DROP TRIGGER owner_alert_call_finish; DROP TRIGGER owner_alert_call_fallback;');
  for(const sql of EARLIER_TRIGGERS)f.db.exec(sql);
  migrateDatabase(f.db);
  for(const name of ['owner_alert_call_finish','owner_alert_call_fallback'])
    assert.match(f.db.prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name=?").get(name).sql,/spamFiltered/,name);
  assert.deepEqual(others(),before,'every other trigger, booking alerts included, is unchanged');
  checkCallAlerts(f);
  // Installing again changes nothing.
  const installed=f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all();
  migrateDatabase(f.db);
  assert.deepEqual(f.db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all(),installed);
});

// Sign-in limiter -------------------------------------------------------------
const ENV={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:'SYNTHETIC_LIMITER_FLOOD_SECRET_ONLY'.padEnd(64,'x'),BCRYPT_COST:12};
function authHarness(){
  const db=new Database(':memory:');db.exec(CREATE_TABLE_STATEMENTS.find(s=>s.includes('CREATE TABLE IF NOT EXISTS users')));
  installAuthTokenSchema(db);installAuthSessionSchema(db);installAuthLimitSchema(db);
  const clock={t:Date.parse(at)};const now=()=>new Date(clock.t);
  const auth=createAuthHandlers({database:db,tokenService:createAuthTokenService(db,{clock:now}),sessionService:createAuthSessionService(db,{environment:ENV,clock:now}),
    environment:ENV,now,hashPassword:async p=>'hash:'+p,comparePassword:async(p,h)=>h==='hash:'+p,sendEmail:async()=>({accepted:true,id:'[SYNTHETIC]'})});
  for(const [id,email] of [['owner-1','owner@example.invalid'],['owner-2','second@example.invalid']])
    db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,emailVerifiedAt) VALUES(?,?,'hash:right','[SYNTHETIC]','[SYNTHETIC]','Operator','active','UTC','owner',?,?)`).run(id,email,at,at);
  const response=()=>({statusCode:200,headers:{},setHeader(){},cookie(){},clearCookie(){},status(c){this.statusCode=c;return this;},json(v){this.body=v;return this;}});
  const request=(body,ip)=>({method:'POST',headers:{origin:ENV.CLIENT_URL},ip,body,get:()=>undefined});
  return {db,clock,
    login:async(email,password,ip)=>{const res=response();await auth.login(request({email,password},ip),res);return res.statusCode;},
    forgot:async(email,ip)=>{const res=response();await auth.forgotPassword(request({email},ip),res);return res.statusCode;},
    rows:()=>db.prepare('SELECT COUNT(*) AS n FROM authRateLimits').get().n};
}

test('sign-in limiter: a flood of junk keys cannot lock out a real owner, and per-address and per-account limits still hold',{timeout:240000},async()=>{
  const h=authHarness();
  // Before the flood: 10 failed sign-ins on the second owner's account from two addresses.
  for(const ip of ['203.0.113.1','203.0.113.2'])for(let n=0;n<5;n++)assert.equal(await h.login('second@example.invalid','wrong',ip),401);
  assert.equal(await h.login('second@example.invalid','right','203.0.113.3'),429,'account limit before the flood');
  // 2,000 addresses x 5 failed sign-ins, every one with a made-up email.
  let serial=0;const codes={};
  for(let a=0;a<2000;a++)for(let k=0;k<5;k++){const code=await h.login(`junk${serial++}@example.invalid`,'wrong',`10.${a>>8}.${a&255}.1`);codes[code]=(codes[code]||0)+1;}
  assert.deepEqual(codes,{401:10000});
  assert.ok(h.rows()<=10000,'the table stays within its cap: '+h.rows());
  assert.equal(await h.login('owner@example.invalid','right','198.51.100.9'),200,'real owner, never-seen address, right password');
  assert.equal(await h.forgot('owner@example.invalid','198.51.100.10'),200,'forgot-password from a new address');
  assert.equal(await h.login(`junk${serial++}@example.invalid`,'wrong','10.0.0.1'),429,'the first flooding address is still over its limit');
  assert.equal(await h.login(`junk${serial++}@example.invalid`,'wrong','10.7.207.1'),429,'the last flooding address is still over its limit');
  assert.equal(await h.login('second@example.invalid','right','198.51.100.11'),429,'the account limit still holds from an unknown address');
  assert.ok(h.rows()<=10000);
});

test('sign-in limiter: expired rows are purged before the cap applies; a full table admits a new key without forgetting a limited one',()=>{
  const db=new Database(':memory:');installAuthLimitSchema(db);
  const clock={t:Date.parse(at)};
  const limits=createAuthRateLimiter(db,{secret:ENV.JWT_SECRET,clock:()=>new Date(clock.t),maximumKeys:3});
  for(let n=0;n<3;n++)assert.ok(limits.take('login','limited',3));
  assert.equal(limits.take('login','limited',3),null,'over its limit');
  assert.ok(limits.take('login','one',3));assert.ok(limits.take('login','two',3));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM authRateLimits').get().n,3);
  assert.ok(limits.take('login','new',3),'a new key is admitted while the table is full');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM authRateLimits').get().n,3,'the cap holds');
  assert.equal(limits.take('login','limited',3),null,'the limited key is still limited');
  clock.t+=15*60*1000;
  assert.ok(limits.take('login','after',3));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM authRateLimits').get().n,1,'every expired row was purged first');
  assert.ok(limits.take('login','limited',3),'its window ended');
});

// Quote-copy limiter ----------------------------------------------------------
test('quote-copy limiter: 10,000 addresses cannot lock out a new customer; a flooding address is still refused',t=>{
  t.mock.timers.enable({apis:['Date'],now:Date.parse(at)});
  const routes={};installQuoteEmailRoutes({get:(path,...handlers)=>{routes[path]=handlers;}},{service:{publicQuote:()=>({businessName:'[SYNTHETIC] Cedar Co',narration:'[SYNTHETIC] Saved quote'})}});
  const [limit,handler]=routes['/quote-copy/:ownerId/:token'];
  const open=ip=>{const res={statusCode:200,set(){return this;},status(c){this.statusCode=c;return this;},type(){return this;},send(){return this;}};
    let passed=false;limit({ip,params:{ownerId:'[SYNTHETIC]',token:'[SYNTHETIC]'}},res,()=>{passed=true;});if(passed)handler({ip,params:{ownerId:'[SYNTHETIC]',token:'[SYNTHETIC]'}},res);return res.statusCode;};
  for(let n=0;n<60;n++)assert.equal(open('192.0.2.1'),200);
  assert.equal(open('192.0.2.1'),429,'over 60 a minute');
  for(let n=0;n<10000;n++)assert.equal(open('10.'+(n>>16)+'.'+((n>>8)&255)+'.'+(n&255)),200);
  assert.equal(open('198.51.100.20'),200,'a new customer opens the quote copy');
  assert.equal(open('192.0.2.1'),429,'the flooding address is still refused');
  t.mock.timers.tick(60000);
  assert.equal(open('192.0.2.1'),200,'its minute ended');
});

// Transfer windows ------------------------------------------------------------
test('transfer windows: the server refusal names the day',()=>{
  const body=windows=>({voiceId:'female',agentName:'Nova',greeting:'[SYNTHETIC] Hello',transferWindows:windows});
  for(const [windows,message] of [
    [{mon:[{start:'',end:''}]},"Enter a start and end time for Monday's transfer window, or remove it."],
    [{wed:[{start:'09:00',end:'17:00'}],fri:[{start:'09:00',end:''}]},"Enter a start and end time for Friday's transfer window, or remove it."],
    [{sun:[{start:'9am',end:'17:00'}]},'Sunday transfer times must use HH:mm.'],
    [{thu:[{start:'17:00',end:'09:00'}]},'Thursday transfer windows must be ordered, non-overlapping, and end after they start.']
  ])assert.throws(()=>validateVoiceSettings(body(windows)),{message,statusCode:400,code:'INVALID_VOICE_SETTINGS'});
  assert.deepEqual(validateVoiceSettings(body({tue:[{start:'09:00',end:'17:00'}]})).transferWindows.tue,[{start:'09:00',end:'17:00'}]);
});
