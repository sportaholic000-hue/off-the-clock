import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import {migrateDatabase} from '../server/src/migrations.js';
import {completeVoiceCall,summarizeCompletedCall,callSummaryModelReady,transcriptSummary,CALL_SUMMARY_TIMEOUT_MS} from '../server/src/callSummaryService.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {harness} from './callerHistoryFollowup20261006LiveFixture.mjs';

// Call summary written by the text model, with the first-three/last-three
// extract kept whenever the model is unconfigured, fails or misses its deadline.
// Synthetic database, transcript, provider and email sender only.
const AT='2026-11-04T15:00:00.000Z',AT_MS=Date.parse(AT),DEADLINE=AT_MS+CALL_SUMMARY_TIMEOUT_MS;
const MODEL_ENV={GEMINI_API_KEY:'synthetic-text-key',GEMINI_TEXT_MODEL:'synthetic-text-model'};
const MODEL_TEXT='[SYNTHETIC] Alex called about a fallen gate and asked for a repair. The receptionist saved a callback request for after five.';
const TURNS=[
  ['caller','[SYNTHETIC] Hi, this is Alex.'],['assistant','[SYNTHETIC] Hello Alex, how can I help?'],
  ['caller','[SYNTHETIC] My gate fell down.'],['assistant','[SYNTHETIC] I can take the details.'],
  ['caller','[SYNTHETIC] It is the side gate.'],['assistant','[SYNTHETIC] Noted.'],
  ['caller','[SYNTHETIC] Please call after five.'],['assistant','[SYNTHETIC] I will pass that on.']
].map(([role,text])=>({role,text}));
const TRANSCRIPT=JSON.stringify(TURNS),EXTRACT=transcriptSummary(TRANSCRIPT);

function fixture(t){
  const directory=mkdtempSync(path.join(tmpdir(),'call-summary-')),db=new Database(path.join(directory,'synthetic.sqlite'));
  db.pragma('foreign_keys = ON');migrateDatabase(db);
  const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/,'every query is owner-bound');return db.prepare(sql);};
  for(const owner of ['synthetic-a','synthetic-b'])db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','[SYNTHETIC] Gate Co','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid',AT);
  let n=0;
  function call(owner='synthetic-a',transcript=TRANSCRIPT){
    const id='SYNTHETIC-call-'+(++n),callSid='CA'+String(n).padStart(32,'0');
    db.prepare("INSERT INTO calls(id,ownerId,callSid,callerNumber,status,transcriptJson,createdAt) VALUES(?,?,?,'+19025550100','CONNECTED',?,?)").run(id,owner,callSid,transcript,AT);
    return {ownerId:owner,callId:id,callSid};
  }
  function complete(c,summaryModel){completeVoiceCall({database:db,ownerQuery,...c,outcome:{status:'completed',reason:'TWILIO_STOP'},streamSid:null,duration:30,at:AT,summaryModel});}
  const row=c=>db.prepare('SELECT summaryText,summaryStatus,summaryDeadlineAt,status,transcriptJson,completedAt FROM calls WHERE ownerId=? AND id=?').get(c.ownerId,c.callId);
  t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
  return {db,ownerQuery,call,complete,row};
}
const reply=text=>async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text}]}}]})});

test('model summary is stored when the model returns one',async t=>{
  const f=fixture(t),c=f.call(),requests=[];
  f.complete(c,true);
  assert.deepEqual({...f.row(c),transcriptJson:undefined,completedAt:undefined},{summaryText:EXTRACT,summaryStatus:'PENDING',summaryDeadlineAt:DEADLINE,status:'COMPLETED',transcriptJson:undefined,completedAt:undefined},'extract is stored at completion');
  const result=await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,...c,env:MODEL_ENV,clock:()=>AT_MS+1000,
    fetchImpl:async(url,init)=>{requests.push({url,init});return reply(MODEL_TEXT)();}});
  assert.equal(result,'MODEL');
  assert.equal(f.row(c).summaryText,MODEL_TEXT);assert.equal(f.row(c).summaryStatus,'MODEL');
  assert.equal(f.row(c).transcriptJson,TRANSCRIPT,'transcript is unchanged');
  assert.equal(requests.length,1);
  const {url,init}=requests[0],body=JSON.parse(init.body);
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/synthetic-text-model:generateContent');
  assert.ok(!url.includes('synthetic-text-key'),'key is never in the URL');assert.equal(init.headers['x-goog-api-key'],'synthetic-text-key');
  const sent=body.contents[0].parts[0].text;
  for(const turn of TURNS)assert.ok(sent.includes(turn.text),'whole transcript is sent: '+turn.text);
  assert.match(body.systemInstruction.parts[0].text,/Use only what the transcript says/);
});

test('extract stays when the text model is not configured',async t=>{
  for(const env of [{},{GEMINI_API_KEY:'synthetic-text-key'},{GEMINI_TEXT_MODEL:'synthetic-text-model'},{...MODEL_ENV,GEMINI_TEXT_MODEL:'gemini-live-audio'}])
    assert.equal(callSummaryModelReady(env),false,JSON.stringify(Object.keys(env)));
  assert.equal(callSummaryModelReady(MODEL_ENV),true);
  const f=fixture(t),c=f.call();let fetched=0;
  f.complete(c,false);
  assert.equal(f.row(c).summaryText,EXTRACT);assert.equal(f.row(c).summaryStatus,'EXTRACT');assert.equal(f.row(c).summaryDeadlineAt,null);
  assert.equal(await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,...c,env:{},fetchImpl:async()=>{fetched++;}}),'NOT_PENDING');
  // A pending call whose model setting is missing by the time it runs also keeps the extract.
  const pending=f.call();f.complete(pending,true);
  assert.equal(await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,...pending,env:{},clock:()=>AT_MS,fetchImpl:async()=>{fetched++;}}),'EXTRACT');
  assert.equal(f.row(pending).summaryText,EXTRACT);assert.equal(f.row(pending).summaryStatus,'EXTRACT');assert.equal(fetched,0);
});

test('extract stays when the model errors or returns unusable output',async t=>{
  const f=fixture(t);
  const failures=[async()=>{throw Error('[SYNTHETIC] network down');},async()=>({ok:false,json:async()=>({})}),
    async()=>({ok:true,json:async()=>({candidates:[{finishReason:'MAX_TOKENS',content:{parts:[{text:'[SYNTHETIC] cut'}]}}]})}),
    reply('   '),reply('x'.repeat(1201))];
  for(const fetchImpl of failures){
    const c=f.call();f.complete(c,true);
    assert.equal(await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,...c,env:MODEL_ENV,clock:()=>AT_MS,fetchImpl}),'EXTRACT');
    assert.equal(f.row(c).summaryText,EXTRACT);assert.equal(f.row(c).summaryStatus,'EXTRACT');
  }
});

test('extract stays when the model takes past the deadline',async t=>{
  const f=fixture(t),c=f.call();f.complete(c,true);let aborted=false;
  const started=Date.now();
  // The run starts 60 ms before the deadline, so the model gets 60 ms.
  const result=await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,...c,env:MODEL_ENV,clock:()=>DEADLINE-60,
    fetchImpl:(url,init)=>new Promise(()=>{init.signal.addEventListener('abort',()=>{aborted=true;});})});
  assert.equal(result,'EXTRACT');assert.ok(aborted,'the provider request is aborted');
  assert.ok(Date.now()-started<2000,'the run ends at the deadline, not when the provider answers');
  assert.equal(f.row(c).summaryText,EXTRACT);assert.equal(f.row(c).summaryStatus,'EXTRACT');
  // A model answer that arrives after the deadline is not stored.
  const late=f.call();f.complete(late,true);let now=AT_MS;
  const answer=await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,...late,env:MODEL_ENV,clock:()=>now,
    fetchImpl:async()=>{now=DEADLINE;return reply(MODEL_TEXT)();}});
  assert.equal(answer,'EXTRACT');assert.equal(f.row(late).summaryText,EXTRACT);assert.equal(f.row(late).summaryStatus,'EXTRACT');
});

test('a summary run never touches another owner\'s call',async t=>{
  const f=fixture(t),mine=f.call('synthetic-a'),theirs=f.call('synthetic-b');
  f.complete(mine,true);f.complete(theirs,true);
  assert.equal(await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,ownerId:'synthetic-a',callId:theirs.callId,callSid:theirs.callSid,env:MODEL_ENV,clock:()=>AT_MS,fetchImpl:reply(MODEL_TEXT)}),'NOT_PENDING');
  assert.equal(f.row(theirs).summaryText,EXTRACT);assert.equal(f.row(theirs).summaryStatus,'PENDING');
});

function alerts(f,clock){
  const sent=[];
  const service=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,clock,ready:()=>true,environment:{EMAIL_FROM:'alerts@example.invalid'},
    send:async message=>{sent.push(message);return {accepted:true,id:'SYNTHETIC-'+sent.length};}});
  return {service,sent};
}
const summaryLine=message=>message.text.split('\n').find(line=>line.startsWith('Summary:'));

test('call email waits for the model summary and carries it',async t=>{
  const f=fixture(t),c=f.call();f.complete(c,true);let now=AT_MS+1000;
  const {service,sent}=alerts(f,()=>now);
  await service.dispatchOnce();
  assert.equal(sent.length,0,'the call email is held while the summary is pending');
  assert.equal(await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,...c,env:MODEL_ENV,clock:()=>now,fetchImpl:reply(MODEL_TEXT)}),'MODEL');
  await service.dispatchOnce();
  assert.equal(sent.length,1);assert.equal(summaryLine(sent[0]),'Summary: '+MODEL_TEXT);
});

test('call email carries the extract when the model misses the deadline, errors or is unconfigured',async t=>{
  const f=fixture(t);
  // Deadline passed with the model still out: the email goes with the extract.
  const hung=f.call();f.complete(hung,true);let now=AT_MS+1000;
  const {service,sent}=alerts(f,()=>now);
  await service.dispatchOnce();assert.equal(sent.length,0);
  now=DEADLINE;await service.dispatchOnce();
  assert.equal(sent.length,1);assert.equal(summaryLine(sent[0]),'Summary: '+EXTRACT.split('\n')[0]);
  assert.ok(sent[0].text.includes(EXTRACT),'the full extract is in the email');
  // Model error before the deadline: the email goes right away with the extract.
  const failed=f.call();f.complete(failed,true);now=AT_MS+1000;
  await summarizeCompletedCall({database:f.db,ownerQuery:f.ownerQuery,...failed,env:MODEL_ENV,clock:()=>now,fetchImpl:async()=>{throw Error('[SYNTHETIC] down');}});
  await service.dispatchOnce();assert.equal(sent.length,2);assert.ok(sent[1].text.includes(EXTRACT));
  // Unconfigured: no hold at all.
  const plain=f.call();f.complete(plain,false);
  await service.dispatchOnce();assert.equal(sent.length,3);assert.ok(sent[2].text.includes(EXTRACT));
});

test('a held call email does not hold the owner\'s other alerts',async t=>{
  const f=fixture(t),held=f.call(),other=f.call();f.complete(held,true);f.complete(other,false);
  const {service,sent}=alerts(f,()=>AT_MS+1000);
  await service.dispatchOnce();
  assert.equal(sent.length,1);assert.ok(sent[0].text.includes('/calls?record='+other.callId));
});

async function liveCall(t,{fetchImpl}){
  const h=await harness({env:MODEL_ENV,providers:{callSummaryFetch:fetchImpl}});t.after(()=>h.close());
  const {ws}=await h.connect();await new Promise(resolve=>setImmediate(resolve));
  const words='[SYNTHETIC] My gate fell down. Please call after five.';
  await h.fake.speak(words);await h.fake.tool('captureLead',{name:'[SYNTHETIC] Alex',description:'[SYNTHETIC] Gate repair'});
  ws.send(JSON.stringify({event:'stop',sequenceNumber:'2',streamSid:'MZ'+'c'.repeat(32),stop:{accountSid:'AC'+'a'.repeat(32),callSid:h.callSid}}));
  const read=()=>h.db.prepare('SELECT c.*,u.completedAt AS usageCompletedAt FROM calls c LEFT JOIN billingVoiceUsage u ON u.ownerId=c.ownerId AND u.callId=c.id WHERE c.ownerId=? AND c.callSid=?').get(h.owner,h.callSid);
  const deadline=Date.now()+5000;while(Date.now()<deadline&&read().status!=='COMPLETED')await new Promise(resolve=>setTimeout(resolve,10));
  return {h,read,words};
}

test('live call: model summary replaces the extract after completion',async t=>{
  const {h,read,words}=await liveCall(t,{fetchImpl:reply(MODEL_TEXT)});
  const until=Date.now()+5000;while(Date.now()<until&&read().summaryStatus!=='MODEL')await new Promise(resolve=>setTimeout(resolve,10));
  const row=read();
  assert.equal(row.status,'COMPLETED');assert.equal(row.summaryStatus,'MODEL');assert.equal(row.summaryText,MODEL_TEXT);
  assert.ok(row.usageCompletedAt,'minutes usage is finished');
  assert.ok(JSON.parse(row.transcriptJson).some(turn=>turn.text===words),'transcript is kept whole');
  assert.deepEqual(h.errors,[]);
});

test('live call: completion, minutes and transcript do not wait on a hung model',async t=>{
  let called=0;
  const {h,read,words}=await liveCall(t,{fetchImpl:()=>{called++;return new Promise(()=>{});}});
  const row=read();
  assert.equal(row.status,'COMPLETED');assert.ok(row.completedAt);
  assert.ok(row.usageCompletedAt,'minutes usage is finished while the model is still out');
  assert.equal(row.summaryText,'Caller: '+words,'the extract is the summary meanwhile');
  assert.equal(row.summaryStatus,'PENDING');assert.equal(called,1);
  assert.ok(JSON.parse(row.transcriptJson).some(turn=>turn.text===words));
  assert.deepEqual(h.errors,[]);
});
