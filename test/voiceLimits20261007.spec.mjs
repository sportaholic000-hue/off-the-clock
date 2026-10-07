import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Database from 'better-sqlite3';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {harness,env,FROM,TO,until} from './voiceLifecycle20261006Fixture.mjs';
import {at} from './leadCaptureRepair20261006Fixture.mjs';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';
import {installOwnerCallRoutes} from '../server/src/ownerCallRoutes.js';
import {installLiveDemoRoutes,liveDemoConfig,lockedSetup} from '../server/src/demo/liveDemo.js';
import {demoInstructions} from '../server/src/demo/demoInstructions.js';
import {createVoiceAdmission,voiceAdmissionConfig,voiceAdmissionStatus} from '../server/src/voice/voiceAdmission.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {createBillingVoiceUsage} from '../server/src/billingVoiceUsage.js';
import {createOwnerCallService} from '../server/src/ownerCallService.js';

const limits={...env,VOICE_MAX_CONCURRENT:'100',VOICE_CALLER_DAILY_LIMIT:'6',VOICE_BREAKER_FAILURE_THRESHOLD:'3',VOICE_BREAKER_WINDOW_SECONDS:'60',VOICE_BREAKER_COOLDOWN_SECONDS:'30'};
const sid=n=>'CA'+n.toString(16).padStart(32,'0');
function history(f,count=6,owner='synthetic-a',phone=FROM,time=at){
  for(let i=0;i<count;i++)f.db.prepare("INSERT INTO calls(id,ownerId,callerNumber,status,duration,createdAt) VALUES(?,?,?,'COMPLETED',60,?)").run('synthetic-history-'+owner+'-'+i,owner,phone,time);
}
function secondOwner(f){f.db.prepare("UPDATE businessProfiles SET twilioNumber='+19025550102',phoneProvisioningStatus='provisioned',operatorEnabled=1 WHERE ownerId='synthetic-b'").run();}
function noStream(result){assert.equal(result.status,200);assert.doesNotMatch(result.xml,/<Stream /);}

test('repeat callers A: six persisted answered calls route the next signed inbound to capture',async t=>{
  const h=await harness(t,{install:{env:limits},beforeInstall:f=>history(f)});
  const r=await h.incoming(100);noStream(r);assert.match(r.xml,/several times today/);
  assert.equal(h.db.prepare('SELECT failureCode FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(100)).failureCode,'VOICE_CALLER_THROTTLED');
  assert.equal(h.callbacks.length,0);
});
test('repeat callers B: repeated real signed HTTP/WebSocket sessions exhaust the allowance',async t=>{
  const h=await harness(t,{install:{env:limits}});
  for(let n=1;n<=6;n++){
    const c=await h.connect(n);await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(n))?.status==='CONNECTED');
    c.ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:c.streamSid,stop:{accountSid:env.TWILIO_ACCOUNT_SID,callSid:sid(n)}}));
    await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(n))?.status==='COMPLETED');c.ws.close();
  }
  noStream(await h.incoming(7));assert.equal(h.callbacks.length,6);
});

export async function ownerHarness(t){
  const {db,service}=ownerCallFixture();const app=express();app.use(express.json());
  const requireAuth=roles=>(req,res,next)=>{const role=req.get('x-synthetic-role')||'owner';if(!roles.includes(role))return res.sendStatus(403);req.role=role;req.tenantOwnerId=req.get('x-synthetic-owner')||'synthetic-a';next();};
  installOwnerCallRoutes(app,{service,requireAuth,asyncHandler:fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next)});
  app.use((err,_req,res,_next)=>res.status(err.statusCode||500).json({error:err.message}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
  const request=async(route,method='GET',body,headers={})=>{const r=await fetch('http://127.0.0.1:'+server.address().port+route,{method,headers:{'content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json().catch(()=>null)};};
  return {db,service,request};
}
test('spam controls A: owner can mark a stored call and retain its number in the blocklist',async t=>{
  const h=await ownerHarness(t);
  assert.equal((await h.request('/api/calls/synthetic-a-call/spam','POST',{})).status,200);
  const list=await h.request('/api/call-blocklist');assert.equal(list.status,200);assert.equal(list.body.numbers[0].phoneNumber,FROM);
  assert.equal(h.db.prepare('SELECT spamFiltered,minutesBilled FROM calls WHERE ownerId=? AND id=?').get('synthetic-a','synthetic-a-call').spamFiltered,1);
});
test('spam controls B: the actual call component exposes the owner spam action',async()=>{
  const {db,service}=ownerCallFixture(),vite=await createServer({root:new URL('../client',import.meta.url).pathname,server:{middlewareMode:true},appType:'custom'});
  try{const {CallDetail}=await vite.ssrLoadModule('/src/calls.jsx');const html=renderToStaticMarkup(React.createElement(CallDetail,{call:service.detail({ownerId:'synthetic-a',id:'synthetic-a-call'})}));assert.match(html,/Mark as spam/);}finally{await vite.close();db.close();}
});

const demoEnv={DEMO_ENABLED:'true',GEMINI_API_KEY:'synthetic-no-provider',DEMO_ALLOWED_ORIGINS:'https://synthetic-demo.example.invalid',DEMO_IP_SALT:'synthetic-salt'};
async function demoHarness(t,{patch={},filename=':memory:',fetchImpl}={}){
  const db=new Database(filename),app=express(),bodies=[];
  installLiveDemoRoutes(app,{db,env:{...demoEnv,...patch},now:()=>Date.parse(at),fetchImpl:async(url,init)=>{bodies.push(JSON.parse(init.body));return fetchImpl?fetchImpl(url,init):{ok:true,json:async()=>({name:'auth_tokens/synthetic'})};}});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));db.close();});
  return {db,bodies,post:async()=>{const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/demo/session',{method:'POST',headers:{'content-type':'application/json',origin:demoEnv.DEMO_ALLOWED_ORIGINS},body:JSON.stringify({agent:'nova'})});return {status:r.status,body:await r.json()};}};
}
for(const shared of [false,true])test('demo admission '+(shared?'B: separate database connections':'A: one HTTP server')+' cannot race any ceiling',async t=>{
  for(const [key,error]of [['DEMO_SESSIONS_PER_IP_PER_HOUR','hourly'],['DEMO_DAILY_SESSION_CAP','daily'],['DEMO_MAX_CONCURRENT','busy']])await t.test(key,async t=>{
    const directory=mkdtempSync(path.join(tmpdir(),'synthetic-demo-limits-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
    let release;const held=new Promise(r=>release=r);t.after(()=>release());
    const options={patch:{DEMO_SESSIONS_PER_IP_PER_HOUR:'100',DEMO_DAILY_SESSION_CAP:'100',DEMO_MAX_CONCURRENT:'100',[key]:'1'},filename:shared?path.join(directory,'demo.sqlite'):':memory:',fetchImpl:async()=>{await held;return {ok:true,json:async()=>({name:'auth_tokens/synthetic'})};}};
    const a=await demoHarness(t,options),b=shared?await demoHarness(t,options):a;
    const first=a.post();await until(()=>a.bodies.length===1);let secondSettled=false;
    const second=b.post().then(r=>{secondSettled=true;return r;});
    await until(()=>secondSettled||a.bodies.length+(shared?b.bodies.length:0)===2);release();const results=await Promise.all([first,second]);
    assert.deepEqual(results.map(r=>r.status),[200,429]);assert.equal(results[1].body.error,error);assert.equal(a.bodies.length+(shared?b.bodies.length:0),1);
  });
});
function currentFacts(text){
  assert.doesNotMatch(text,/automatic text follow-ups|text reminders|Thirty-day money-back guarantee|Quotes are ranges|To answer calls themselves again, they turn forwarding off/);
  assert.match(text,/does not send text messages/i);assert.match(text,/master toggle/i);assert.match(text,/dashboard and (?:by )?email/i);
}
test('demo facts A: generated instructions match the current owner ruling',()=>currentFacts(demoInstructions('Nova')));
test('demo facts B: the token provider receives those same corrected locked instructions',async t=>{
  const h=await demoHarness(t);assert.equal((await h.post()).status,200);const text=h.bodies[0].bidiGenerateContentSetup.systemInstruction.parts[0].text;
  currentFacts(text);assert.equal(text,lockedSetup(liveDemoConfig(demoEnv),'nova').systemInstruction.parts[0].text);
});

test('platform ceiling A: configured capacity applies across owners',async t=>{
  const h=await harness(t,{install:{env:{...limits,VOICE_MAX_CONCURRENT:'1'}},beforeInstall:secondOwner});
  assert.match((await h.incoming(1)).xml,/<Stream /);
  const r=await h.post('/api/twilio/voice/incoming',{...h.params(2,'+19025550103'),To:'+19025550102'});noStream({status:r.status,xml:await r.text()});
  assert.equal(h.db.prepare('SELECT failureCode FROM calls WHERE ownerId=? AND callSid=?').get('synthetic-b',sid(2)).failureCode,'VOICE_PLATFORM_CAPACITY');
});
test('platform ceiling B: simultaneous signed inbound requests share the same reservation limit',async t=>{
  const h=await harness(t,{install:{env:{...limits,VOICE_MAX_CONCURRENT:'2'}}});
  const replies=await Promise.all([1,2,3,4].map(n=>h.incoming(n,'+1902555010'+n)));
  assert.equal(replies.filter(r=>r.xml.includes('<Stream ')).length,2);
});
test('circuit breaker A: repeated model-open failures stop subsequent model admissions',async t=>{
  const h=await harness(t,{fail:true,install:{env:limits}});
  for(let n=1;n<=3;n++){const c=await h.connect(n);await until(()=>c.ws.readyState===3);}
  noStream(await h.incoming(4));assert.equal(h.callbacks.length,3);
});
test('circuit breaker B: repeated mid-call provider failures stop subsequent model admissions',async t=>{
  const h=await harness(t,{install:{env:limits}});
  for(let n=1;n<=3;n++){const c=await h.connect(n);c.callback.onerror(new Error('synthetic provider failure'));await until(()=>c.ws.readyState===3);}
  noStream(await h.incoming(4));assert.equal(h.callbacks.length,3);
});

test('owner spam actions reject staff, foreign records and ambiguous phone identities',async t=>{
  const h=await ownerHarness(t);
  for(const [route,method,body]of [['/api/calls/synthetic-a-call/spam','POST',{}],['/api/call-blocklist','GET'],['/api/call-blocklist','POST',{phoneNumber:FROM}],['/api/call-blocklist','DELETE',{phoneNumber:FROM}]])assert.equal((await h.request(route,method,body,{'x-synthetic-role':'staff'})).status,403);
  assert.equal((await h.request('/api/calls/synthetic-b-call/spam','POST',{})).status,404);
  for(const phoneNumber of ['anonymous','9025550100','not-a-phone','+1; DROP TABLE calls'])assert.equal((await h.request('/api/call-blocklist','POST',{phoneNumber})).status,400);
  assert.equal((await h.request('/api/call-blocklist','POST',{phoneNumber:'+1 (902) 555-0100'})).status,200);
  await h.request('/api/call-blocklist','POST',{phoneNumber:FROM});assert.equal((await h.request('/api/call-blocklist')).body.total,1);
  assert.equal((await h.request('/api/call-blocklist','GET',undefined,{'x-synthetic-owner':'synthetic-b'})).body.total,0);
  await h.request('/api/call-blocklist','DELETE',{phoneNumber:FROM});assert.equal((await h.request('/api/call-blocklist')).body.total,0);
});
test('blocklist survives database reopen and remains scoped to its owner',()=>{
  const directory=mkdtempSync(path.join(tmpdir(),'synthetic-blocklist-')),filename=path.join(directory,'db.sqlite');
  try{const f=ownerCallFixture(filename);f.service.markSpam({ownerId:'synthetic-a',id:'synthetic-a-call'});f.db.close();
    const db=new Database(filename);try{const service=createOwnerCallService({ownerQuery:sql=>db.prepare(sql),database:db});assert.equal(service.blocklist({ownerId:'synthetic-a'}).total,1);assert.equal(service.blocklist({ownerId:'synthetic-b'}).total,0);assert.equal(service.detail({ownerId:'synthetic-a',id:'synthetic-a-call',role:'staff'}).canManageSpam,false);}finally{db.close();}
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('blocked signed calls are rejected before AI, create no lead and cannot accrue minutes',async t=>{
  const h=await harness(t,{install:{env:limits},beforeInstall:f=>{secondOwner(f);f.db.prepare('INSERT INTO callerBlocklist(ownerId,phoneNumber,createdAt) VALUES(?,?,?)').run('synthetic-a',FROM,at);}});
  const r=await h.incoming(1);assert.match(r.xml,/<Reject /);assert.equal(h.callbacks.length,0);assert.deepEqual(h.writes,[]);
  const row=h.db.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(1));assert.equal(row.spamFiltered,1);assert.equal(row.minutesBilled,0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM leads WHERE ownerId=? AND callId=?').get(h.owner,row.id).n,0);
  const meter=createBillingVoiceUsage({database:h.db,clock:()=>new Date(at)});assert.equal(meter.providerComplete({...h.params(1),CallStatus:'completed',CallDuration:'180'}),0);
  const b=await h.post('/api/twilio/voice/incoming',{...h.params(2),To:'+19025550102'});assert.match(await b.text(),/<Stream /);
});
test('repeat limit isolates owners and phones, resets after 24 hours, and never groups withheld callers',async t=>{
  let now=Date.parse(at);const h=await harness(t,{install:{env:limits,clock:()=>new Date(now)},beforeInstall:f=>{history(f);secondOwner(f);}});
  noStream(await h.incoming(1));assert.match((await h.incoming(2,'+19025550109')).xml,/<Stream /);
  const b=await h.post('/api/twilio/voice/incoming',{...h.params(3),To:'+19025550102'});assert.match(await b.text(),/<Stream /);
  assert.match((await h.incoming(4,'anonymous')).xml,/<Stream /);
  now+=86400001;assert.match((await h.incoming(5)).xml,/<Stream /);
});
test('simultaneous caller reservations cannot bypass a configured repeat limit; retries do not consume it twice',async t=>{
  const h=await harness(t,{install:{env:{...limits,VOICE_CALLER_DAILY_LIMIT:'2'}}});
  const first=await h.incoming(1),duplicate=await h.incoming(1);assert.equal(duplicate.xml,first.xml);
  const replies=await Promise.all([2,3,4].map(n=>h.incoming(n)));assert.equal(replies.filter(r=>r.xml.includes('<Stream ')).length,1);
});
test('repeat warning is durable, emailed once through the fake sender, and visible without forwarding the abuser',async t=>{
  const h=await harness(t,{install:{env:limits},beforeInstall:f=>history(f)});
  await h.incoming(100);await h.incoming(100);await h.incoming(101);
  const rows=h.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='voice.caller_throttled'").all(h.owner);assert.equal(rows.length,1);
  const messages=[],alerts=createOwnerAlertService({database:h.db,environment:{EMAIL_FROM:'synthetic@example.invalid'},clock:()=>Date.parse(at),ready:()=>true,send:async message=>{messages.push(message);return {accepted:true,id:'synthetic-'+messages.length};}});
  for(let i=0;i<12&&await alerts.processOne(h.owner);i++);assert.equal(messages.filter(m=>m.subject.includes('Repeated caller')).length,1);
  assert.equal(h.service.detail({ownerId:h.owner,id:rows[0].callId}).notifications.find(n=>n.id===rows[0].id).status,'ACCEPTED');
  const captured=await h.post('/api/twilio/voice/capture',{...h.params(100),SpeechResult:'[SYNTHETIC] Please review my request.'});assert.doesNotMatch(await captured.text(),/<Dial/);
  assert.ok(voiceAdmissionStatus(h.db).alerts.some(a=>a.code==='VOICE_CALLER_THROTTLED'));assert.deepEqual(h.writes,[]);
});
test('platform reservations expire or release on termination; 80 percent produces an admin alert',async t=>{
  let now=Date.parse(at);const h=await harness(t,{install:{env:{...limits,VOICE_MAX_CONCURRENT:'5'},clock:()=>new Date(now)}});
  for(let n=1;n<=4;n++)await h.incoming(n,'+1902555010'+n);
  const alerts=voiceAdmissionStatus(h.db).alerts;assert.equal(alerts.find(a=>a.code==='VOICE_PLATFORM_CAPACITY').details.active,4);
  now+=61000;assert.match((await h.incoming(5,'+19025550105')).xml,/<Stream /);assert.ok(voiceAdmissionStatus(h.db).alerts[0].resolvedAt);
});
test('circuit state is durable, ignores duplicate failures, and grants exactly one recovering probe',async t=>{
  const h=await harness(t,{install:{env:limits}});let now=Date.parse(at);
  const a=createVoiceAdmission({database:h.db,env:limits,clock:()=>new Date(now)});
  const context=n=>({ownerId:h.owner,callSid:sid(n),from:FROM,to:TO,accountSid:env.TWILIO_ACCOUNT_SID});
  a.failed(context(1));a.failed(context(1));a.failed(context(2));assert.equal(voiceAdmissionStatus(h.db).circuit.openUntil,0);a.failed(context(3));
  const restarted=createVoiceAdmission({database:h.db,env:limits,clock:()=>new Date(now)});
  assert.equal(h.db.transaction(()=>restarted.reserve(context(4))).immediate(),'VOICE_CIRCUIT_OPEN');
  now+=30001;assert.equal(h.db.transaction(()=>restarted.reserve(context(4))).immediate(),null);
  assert.equal(h.db.transaction(()=>a.reserve(context(5))).immediate(),'VOICE_CIRCUIT_OPEN');
  a.connected(context(2));assert.ok(voiceAdmissionStatus(h.db).circuit.openUntil>0,'old successful calls cannot reset the breaker');
  restarted.failed(context(4));assert.ok(voiceAdmissionStatus(h.db).circuit.openUntil>now);
  now+=30001;assert.equal(h.db.transaction(()=>a.reserve(context(5))).immediate(),null);a.connected(context(5));
  assert.equal(voiceAdmissionStatus(h.db).circuit.openUntil,0);assert.ok(voiceAdmissionStatus(h.db).alerts.find(a=>a.code==='VOICE_CIRCUIT_OPEN').resolvedAt);
});
test('healthy calls and caller disconnects do not count as model failures; old failures age out',async t=>{
  const h=await harness(t,{install:{env:limits}});const c=await h.connect(1);c.ws.close();await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,sid(1)).status==='COMPLETED');
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM voiceModelFailures').get().n,0);
  let now=Date.parse(at);const a=createVoiceAdmission({database:h.db,env:limits,clock:()=>new Date(now)});
  a.failed({callSid:sid(1)});a.failed({callSid:sid(2)});now+=60001;a.failed({callSid:sid(3)});assert.equal(voiceAdmissionStatus(h.db).circuit.openUntil,0);
});
test('invalid admission environment values fail closed at construction',()=>{
  for(const key of ['VOICE_MAX_CONCURRENT','VOICE_MAX_CONCURRENT_PER_OWNER','VOICE_CALLER_DAILY_LIMIT','VOICE_BREAKER_FAILURE_THRESHOLD','VOICE_BREAKER_WINDOW_SECONDS','VOICE_BREAKER_COOLDOWN_SECONDS'])for(const value of ['0','-1','NaN','1.5','Infinity'])assert.throws(()=>voiceAdmissionConfig({[key]:value}),new RegExp(key));
});
