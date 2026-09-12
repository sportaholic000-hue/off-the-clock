import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {configuration,dollarsToMicros,LIMITS} from '../config.mjs';
import {systemInstruction} from '../policy.mjs';
import {Quotas,normalizeIP,clientIP} from '../quota.mjs';
import {DemoSession,conservativeUsageMicros} from '../session.mjs';

const defaults=()=>({...configuration({}),enabled:true,key:'FIXTURE_NOT_A_CREDENTIAL',model:'fixture-model',database:':memory:',dailyMicros:10_000_000,reserveMicros:1_000_000,maxRateMicros:20_000_000});
function quota(extra={}){return new Quotas({dailyMicros:10_000_000,reserveMicros:1_000_000,...extra});}
const rejectsCode=(f,code)=>assert.throws(f,e=>e.code===code);
function session(extra={}){
  let time=1_000_000;const now=()=>time,config={...defaults(),...extra};const q=quota({now}),lease=q.admit('127.0.0.1',195000),sent=[],events=[];
  const fake={closed:false,text:t=>sent.push(t),audio:b=>sent.push(b),audioEnd:()=>{},close(){this.closed=true;}};
  let callbacks;
  const s=new DemoSession({config,agent:'miles',mode:'voice',quotas:q,lease,now,emit:()=>{},onEnd:()=>{},providerFactory:(c,a,e)=>{callbacks=e;return fake;}});
  s.attach((type,data)=>{events.push({type,...data});return true;});callbacks.ready();callbacks.usage({totalTokenCount:10});callbacks.turnComplete();
  return {s,q,fake,sent,events,callbacks,now,advance:n=>time+=n,finish:()=>{s.end();q.close();}};
}

test('money parsing is exact to microdollars and rejects implicit/unsafe values',()=>{
  assert.equal(dollarsToMicros('0.01','budget'),10000);assert.equal(dollarsToMicros('12.345678','budget'),12345678);
  for(const x of ['','1e3','-1','NaN','0.0000001','1,000','999999999999'])assert.throws(()=>dollarsToMicros(x,'budget'));
});
test('no credentials or model are assumed; default server cannot call provider',()=>{
  assert.equal(configuration({}).enabled,false);assert.equal(configuration({}).model,'');
  assert.throws(()=>configuration({DEMO_ENABLED:'true'}),/GEMINI_API_KEY/);
  assert.throws(()=>configuration({DEMO_ENABLED:'true',GEMINI_API_KEY:'fixture'}),/GEMINI_LIVE_MODEL/);
});
test('enabled configuration requires explicit budgets and distinct voices',()=>{
  const e={DEMO_ENABLED:'true',GEMINI_API_KEY:'fixture',GEMINI_LIVE_MODEL:'chosen-live-model',DEMO_DAILY_BUDGET_USD:'0.01',DEMO_SESSION_RESERVE_USD:'0.5',DEMO_MAX_TOKEN_RATE_USD_PER_MILLION:'20'};
  assert.equal(configuration(e).dailyMicros,10000);assert.throws(()=>configuration({...e,DEMO_NOVA_VOICE:'Puck'}));
  assert.throws(()=>configuration({...e,DEMO_ORIGIN:'http://example.test'}));
  assert.throws(()=>configuration({...e,DEMO_SIGNUP_URL:'javascript:alert(1)'}));
});
test('spec timing and allowance constants are not client supplied',()=>{
  assert.equal(LIMITS.sessionMs,180000);assert.equal(LIMITS.silenceMs,10000);assert.equal(LIMITS.hourlySessions,2);
});
test('both names receive the same scope and full offer, without customer tools',()=>{
  for(const n of ['Miles','Nova']){const p=systemInstruction(n);for(const x of ['WEBSITE SALES DEMO','one question per turn','NO tools','$119','$279','1,200','No arbitrary markup cap','Never invent actual rates','No booking','No call-audio recording'])assert.ok(p.includes(x),x);}
});
test('two sessions per rolling hour and boundary release',()=>{
  let n=0;const q=quota({now:()=>n});let a=q.admit('a',195000);q.release(a);a=q.admit('a',195000);q.release(a);
  rejectsCode(()=>q.admit('a',195000),'hourly');n=3599999;rejectsCode(()=>q.admit('a',195000),'hourly');n=3600000;assert.ok(q.admit('a',195000));q.close();
});
test('concurrent admission is checked before provider and released once',()=>{
  const q=quota({maxConcurrent:1});const a=q.admit('a',195000);rejectsCode(()=>q.admit('b',195000),'busy');q.release(a);q.release(a);assert.ok(q.admit('b',195000));q.close();
});
test('0.01 dollar daily budget rejects a larger reservation before spend',()=>{
  const q=quota({dailyMicros:10000,reserveMicros:500000});rejectsCode(()=>q.admit('a',195000),'budget');assert.equal(q.charged(),0);assert.equal(q.active(),0);q.close();
});
test('daily ceiling includes reserved sessions even after disconnect',()=>{
  const q=quota({dailyMicros:2000000});const a=q.admit('a',195000);q.release(a);q.admit('b',195000);rejectsCode(()=>q.admit('c',195000),'budget');assert.equal(q.charged(),2000000);q.close();
});
test('midnight crossing reserves both affected UTC days',()=>{
  let n=Date.parse('2026-09-11T23:59:00Z');const q=quota({now:()=>n});q.admit('a',195000);
  assert.equal(q.charged('2026-09-11'),1000000);assert.equal(q.charged('2026-09-12'),1000000);q.close();
});
test('restarting or using a second process ledger does not reset allowance or budget',()=>{
  const dir=mkdtempSync(join(tmpdir(),'otc-demo-'));const db=join(dir,'ledger.sqlite');
  try{let q=quota({database:db});let a=q.admit('a',195000);q.release(a);q.close();q=quota({database:db});a=q.admit('a',195000);q.release(a);rejectsCode(()=>q.admit('a',195000),'hourly');assert.equal(q.charged(),2000000);
    const q2=quota({database:db,maxConcurrent:1});q.admit('b',195000);rejectsCode(()=>q2.admit('c',195000),'busy');q2.close();q.close();
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('IP normalization handles mapped v4 and IPv6 /64 consistently',()=>{
  for(const ip of ['127.0.0.1','::ffff:127.0.0.1','::FFFF:7f00:1','0:0:0:0:0:ffff:127.0.0.1'])assert.equal(normalizeIP(ip),'127.0.0.1');
  assert.equal(normalizeIP('2001:db8::1'),normalizeIP('2001:0db8:0000:0000::99'));assert.throws(()=>normalizeIP('not an IP'));
});
test('untrusted forwarded headers cannot select the rate-limit identity',()=>{
  const req={socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'8.8.8.8'}};
  assert.equal(clientIP(req),'127.0.0.1');assert.equal(clientIP(req,['127.0.0.1']),'8.8.8.8');
  req.headers['x-forwarded-for']='garbage';assert.throws(()=>clientIP(req,['127.0.0.1']));
});
test('silence signs off at ten seconds, then closes within bounded grace',()=>{
  const f=session();f.advance(9999);f.s.tick();assert.equal(f.s.state,'active');f.advance(1);f.s.tick();assert.equal(f.s.state,'closing');assert.match(f.sent.at(-1),/stepped away/);
  f.advance(4000);f.s.tick();assert.equal(f.s.state,'ended');assert.equal(f.fake.closed,true);assert.equal(f.q.active(),0);f.q.close();
});
test('hard duration cannot be extended by speech or a frozen model',()=>{
  const f=session();f.advance(176000);f.s.activity=f.now();f.s.tick();assert.equal(f.s.state,'closing');f.advance(4000);f.s.tick();assert.equal(f.s.state,'ended');assert.equal(f.events.at(-1).reason,'time');f.q.close();
});
test('silence does not expire while the audible response is playing',()=>{
  const f=session();f.callbacks.audio(Buffer.alloc(48000*12));f.callbacks.turnComplete();f.advance(12000);f.s.tick();assert.equal(f.s.state,'active');f.advance(10000);f.s.tick();assert.equal(f.s.state,'closing');f.finish();
});
test('failed or abandoned connection releases the slot',()=>{
  let n=100;const q=quota({now:()=>n});const lease=q.admit('a',195000);let ended=false;
  const s=new DemoSession({config:defaults(),agent:'nova',mode:'text',quotas:q,lease,now:()=>n,emit:()=>{},onEnd:()=>ended=true});
  n+=15000;s.tick();assert.equal(s.state,'ended');assert.equal(ended,true);assert.equal(q.active(),0);q.close();
});
test('audio quotas reject odd bytes, wrong mode, oversized and accelerated streams',()=>{
  const f=session();assert.throws(()=>f.s.audio(Buffer.alloc(3)));assert.throws(()=>f.s.audio(Buffer.alloc(16002)));
  for(let i=0;i<4;i++)f.s.audio(Buffer.alloc(16000));assert.throws(()=>f.s.audio(Buffer.alloc(2)));assert.equal(f.s.state,'ended');f.q.close();
  const t=session();t.s.mode='text';assert.throws(()=>t.s.audio(Buffer.alloc(3200)));t.finish();
});
test('text accepts only user text, obeys in-flight and length guards',()=>{
  const f=session();f.s.mode='text';assert.throws(()=>f.s.text(''));assert.throws(()=>f.s.text('x'.repeat(2001)));f.s.text('How does QuoteDone work?');assert.throws(()=>f.s.text('more'));assert.equal(f.events.at(-1).text,'How does QuoteDone work?');f.finish();
});
test('budget reserve trips on conservative usage and closes without refund',()=>{
  const f=session();f.callbacks.usage({totalTokenCount:100000});assert.equal(f.s.state,'ended');assert.equal(f.q.charged(),10000000);f.q.close();
});
test('usage rejects malformed values and counts all reported categories',()=>{
  assert.equal(conservativeUsageMicros({totalTokenCount:10,promptTokenCount:8,responseTokenCount:2},20000000),400);
  for(const u of [{},{totalTokenCount:-1},{totalTokenCount:1.1},{totalTokenCount:Infinity},{totalTokenCount:5,promptTokensDetails:[{tokenCount:'3'}]}])assert.throws(()=>conservativeUsageMicros(u,20000000));
});
test('upstream close, backpressure and end are idempotent',()=>{
  const f=session();f.callbacks.close('provider');f.s.end();f.s.tick();assert.equal(f.q.active(),0);assert.equal(f.events.filter(x=>x.type==='ended').length,1);f.q.close();
});
