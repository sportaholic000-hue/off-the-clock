import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fork} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {fixture,A,B} from './overageMinute20261006Fixture.mjs';
import {productionEnv} from './helpers/railwayEnv.mjs';

test('actual production routes enforce cancelled service and tenant-scoped exports without enabling any providers', {timeout:60000},async t=>{
  const volume=mkdtempSync(join(tmpdir(),'SYNTHETIC-lifecycle-production-'));t.after(()=>rmSync(volume,{recursive:true,force:true}));
  const f=fixture(null,{filename:join(volume,'off-the-clock.sqlite')});const at=new Date(Math.floor(Date.now()/1000)*1000-1000).toISOString();
  f.activate(A,{plan:'QuoteDone'});f.activate(B);f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(at,A);
  for(const id of [A,B])f.db.prepare('INSERT INTO leads(id,ownerId,customerName,createdAt) VALUES(?,?,?,?)').run('lead_'+id,id,id===A?'SYNTHETIC_A_PRIVATE':'SYNTHETIC_B_PRIVATE',at);
  f.db.prepare("INSERT INTO quoteAccessKeys(ownerId,publicKey,allowedOriginsJson,createdAt) VALUES(?,'SYNTHETIC-public-key','[\"https://synthetic.example.invalid\"]',?)").run(A,at);
  f.db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,role,createdAt) VALUES('SYNTHETIC-staff',?,'staff@example.invalid','SYNTHETIC','Synthetic','Synthetic','staff',?)").run(A,at);f.close();
  const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  const env={...process.env,...productionEnv(volume),PORT:String(port),DATABASE_PATH:'',PRICEBOOK_PATH:'',RAILWAY_ENVIRONMENT_ID:'',GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_CALENDAR_REDIRECT_URI:'',ADMIN_EMAIL:'',ADMIN_PASSWORD_HASH:'',LOCAL_PREVIEW_MODE:'false',EMAIL_PROVIDER:'console'};
  delete env.NODE_TEST_CONTEXT;delete env.DEMO_TRUSTED_PROXY_HOPS;
  const child=fork('test/helpers/overageProductionFixture.mjs',[],{env,execArgv:[],stdio:['ignore','pipe','pipe','ipc']});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){const ended=once(child,'exit');child.kill('SIGKILL');await ended;}});
  const ready=await new Promise((resolve,reject)=>{child.once('message',resolve);child.once('exit',()=>reject(Error(output)));setTimeout(()=>reject(Error('SYNTHETIC startup timeout: '+output)),20000).unref();});
  const origin='http://127.0.0.1:'+ready.port,headers=id=>({authorization:'Bearer '+ready.tokens[id]});
  const foreignCsv=await fetch(origin+'/api/billing/export/leads?ownerId='+B,{headers:headers(A)});assert.equal(foreignCsv.status,403);assert.deepEqual(await foreignCsv.json(),{error:'Forbidden'});
  const csv=await fetch(origin+'/api/billing/export/leads',{headers:headers(A)});assert.equal(csv.status,200);const text=await csv.text();assert.match(text,/SYNTHETIC_A_PRIVATE/);assert.doesNotMatch(text,/SYNTHETIC_B_PRIVATE/);
  assert.equal((await fetch(origin+'/api/billing/export/leads',{headers:headers('SYNTHETIC-staff')})).status,403);
  const publicQuote=await fetch(origin+'/api/public/quote/SYNTHETIC-public-key',{headers:{origin:'https://synthetic.example.invalid'}});assert.equal(publicQuote.status,403);assert.deepEqual(await publicQuote.json(),{error:'This business is currently unavailable.',code:'BUSINESS_UNAVAILABLE'});
  const mutate=await fetch(origin+'/api/onboarding/account',{method:'POST',headers:{...headers(A),'content-type':'application/json'},body:JSON.stringify({businessName:'SYNTHETIC forbidden'})});assert.equal(mutate.status,403);
  const expiredBilling=await fetch(origin+'/api/billing/lifecycle',{headers:headers(A)});assert.equal(expiredBilling.status,200);assert.equal((await expiredBilling.json()).serviceEndsAt,at);
  const ended=once(child,'exit');child.kill('SIGTERM');const [code]=await ended;assert.equal(code,0,output);
});

test('signed production incoming call after service end starts no AI and forwards no call',async t=>{
  const [{default:express},{default:twilio},{installProductionVoice}]=await Promise.all([import('express'),import('twilio'),import('../server/src/voice/productionVoiceRuntime.js')]);
  const f=fixture(t);f.activate();f.setTime('2026-11-20T12:00:00.000Z');f.db.prepare('UPDATE users SET serviceEndsAt=? WHERE id=?').run(f.clock().toISOString(),A);
  const to='+19025550101',account='AC'+'a'.repeat(32),secret='SYNTHETIC-voice-token',origin='https://synthetic.voice.invalid';
  f.db.prepare("INSERT INTO businessProfiles(ownerId,twilioNumber,existingPhoneNumber,twilioNumberSid,operatorEnabled,phoneProvisioningStatus,updatedAt) VALUES(?,?,'+19025550199','PNaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'provisioned',?)").run(A,to,f.clock().toISOString());
  let connects=0;const app=express(),voice=installProductionVoice({app,database:f.db,clock:f.clock,runtimeConfig:{voiceRuntime:true,providerWrites:true},env:{TWILIO_ACCOUNT_SID:account,TWILIO_AUTH_TOKEN:secret,PUBLIC_BASE_URL:origin,JWT_SECRET:'SYNTHETIC'.padEnd(64,'x')},googleClient:{live:{connect:async()=>{connects++;throw Error('SYNTHETIC forbidden AI');}}}});
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await voice.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const path='/api/twilio/voice/incoming',params={AccountSid:account,CallSid:'CA'+'b'.repeat(32),From:'+19025550100',To:to,Direction:'inbound'};
  const response=await fetch('http://127.0.0.1:'+server.address().port+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(secret,origin+path,params)},body:new URLSearchParams(params)});
  assert.equal(response.status,200);const xml=await response.text();assert.doesNotMatch(xml,/<Stream|<Dial/);assert.match(xml,/currently unavailable/);assert.equal(connects,0);
  const pending={...params,CallSid:'CA'+'c'.repeat(32)};
  const post=route=>fetch('http://127.0.0.1:'+server.address().port+route,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':twilio.getExpectedTwilioSignature(secret,origin+route,pending)},body:new URLSearchParams(pending)});
  f.setTime('2026-11-20T11:59:59.999Z');assert.match(await (await post(path)).text(),/<Gather/);
  f.setTime('2026-11-20T12:00:00.000Z');pending.SpeechResult='SYNTHETIC request after service end';pending.UnstableSpeechResult=pending.SpeechResult;
  for(const suffix of ['', '/partial','/again']){
    const late=await post('/api/twilio/voice/capture'+suffix);assert.equal(late.status,200);
    const body=await late.text();assert.doesNotMatch(body,/<Stream|<Dial|<Gather/);assert.match(body,/currently unavailable/);
  }
  assert.equal(connects,0);
});
