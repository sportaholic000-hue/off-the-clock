import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import path from 'node:path';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';
import {createAuthSessionService} from '../server/src/authSessionService.js';

test('real application dashboard and record routes show persisted synthetic call data',{timeout:40000},async t=>{
  const root=path.resolve(new URL('..',import.meta.url).pathname),directory=mkdtempSync(path.join(tmpdir(),'owner-calls-'));
  const filename=path.join(directory,'synthetic.sqlite'),secret='synthetic-owner-calls-session-secret'.padEnd(64,'x');
  const {db}=ownerCallFixture(filename),sessions=createAuthSessionService(db,{environment:{JWT_SECRET:secret}}),tokens={};
  for(const id of ['synthetic-a','synthetic-b','synthetic-staff'])tokens[id]=sessions.create(db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
  db.close();
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['server/src/server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),DATABASE_PATH:filename,PRICEBOOK_PATH:path.join(directory,'pricebooks'),APP_DATA_DIR:directory,JWT_SECRET:secret,LOCAL_PREVIEW_MODE:'false',ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false'},stdio:['ignore','pipe','pipe']});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk);
  const request=async(route,owner='synthetic-a')=>{const response=await fetch('http://127.0.0.1:'+port+route,{headers:owner?{authorization:'Bearer '+tokens[owner]}:{}});return {status:response.status,body:await response.json()};};
  try{
    const deadline=Date.now()+20000;while(!output.includes('Off The Clock AI server listening')){assert.equal(child.exitCode,null,output);if(Date.now()>deadline)throw Error(output);await new Promise(resolve=>setTimeout(resolve,25));}
    await t.test('dashboard includes stored feed and real counters',async()=>{const {status,body}=await request('/api/dashboard');assert.equal(status,200);assert.equal(body.previewActivity,null);assert.equal(body.callActivity.total,3);assert.equal(body.callActivity.counts.answered,1);assert.equal(body.callActivity.counts.quotes,1);assert.equal(body.callActivity.calls.find(row=>row.id==='synthetic-a-call').summaryText,'[SYNTHETIC] synthetic-a gate repair');});
    await t.test('call detail contains transcript, outcome, quote drivers, lead and bookings',async()=>{const {status,body}=await request('/api/calls/synthetic-a-call');assert.equal(status,200);assert.match(body.transcript[0].text,/synthetic-a/);assert.equal(body.outcome,'CALL_ENDED');assert.equal(body.quotes[0].result.lowEstimate,221.23);assert.match(body.quotes[0].result.priceDrivers[0],/measured gate labor/);assert.equal(body.leads[0].customerName,'[SYNTHETIC] synthetic-a Alex');assert.equal(body.bookings.length,2);assert.equal(body.bookingRequests.length,1);});
    await t.test('Calls list and specific record enforce session tenant',async()=>{assert.equal((await request('/api/calls/synthetic-b-call')).status,404);assert.equal((await request('/api/calls?ownerId=synthetic-b')).status,400);assert.doesNotMatch(JSON.stringify((await request('/api/calls')).body),/synthetic-b/);assert.equal((await request('/api/calls/synthetic-b-call','synthetic-b')).status,200);assert.equal((await request('/api/calls',null)).status,401);});
    await t.test('Quotes view reads the voice receipt and includes its call link',async()=>{const {status,body}=await request('/api/quotes');assert.equal(status,200);assert.equal(body.quotes.length,1);assert.equal(body.quotes[0].callId,'synthetic-a-call');assert.equal(body.quotes[0].result.lowEstimate,221.23);assert.doesNotMatch(JSON.stringify(body),/synthetic-b/);});
    await t.test('Leads view reads captured voice contact and review inputs',async()=>{const {status,body}=await request('/api/leads');assert.equal(status,200);assert.equal(body.leads.find(row=>row.id==='synthetic-a-lead').contact.email,'synthetic-a@example.invalid');assert.equal(body.leads.find(row=>row.id==='synthetic-a-review').customerInputs.height,4);assert.doesNotMatch(JSON.stringify(body),/synthetic-b/);});
    await t.test('staff sees only its parent tenant and no owner calculation evidence',async()=>{const {status,body}=await request('/api/calls/synthetic-a-call','synthetic-staff');assert.equal(status,200);assert.equal(body.quotes[0].internal,undefined);assert.equal(body.leads[0].internal,undefined);assert.equal((await request('/api/calls/synthetic-b-call','synthetic-staff')).status,404);});
  } finally {
    if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(resolve=>{const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},5000);timer.unref();})]);}
    rmSync(directory,{recursive:true,force:true});
  }
});
