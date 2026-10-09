import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import twilio from 'twilio';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {harness,T,day,iso} from './billingCoreRepair20261006.helpers.mjs';
import {createBillingVoiceUsage,voiceUsagePeriod} from '../server/src/billingVoiceUsage.js';
import {installBillingVoiceRoutes} from '../server/src/billingVoiceRoutes.js';
import {createTwilioRequestValidator} from '../server/src/voice/twilioValidation.js';
import {migrateDatabase} from '../server/src/migrations.js';
const owner='SYNTHETIC-A',account='AC'+'a'.repeat(32),from='+19025550100',to='+19025550101';
const completion={status:'COMPLETED',outcome:'SYNTHETIC_END',failureCode:null,streamSid:null};
const receipt=(c,seconds)=>({AccountSid:account,CallSid:c.context.callSid,From:from,To:to,CallStatus:'completed',CallDuration:String(seconds),Direction:'inbound'});
function setup(options){const h=harness(options);h.service.applyVerifiedStripeEvent(h.sub('evt_trial',0,{status:'trialing',trial_start:T,trial_end:T+14*day}));let n=0;const meter=createBillingVoiceUsage({database:h.db,clock:()=>new Date(h.now()*1000)});
 const call=(at=T)=>{const id='SYNTHETIC-call-'+(++n),callSid='CA'+n.toString(16).padStart(32,'0');h.db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,createdAt) VALUES(?,?,?,?,?,?,'CONNECTED',?)").run(id,owner,callSid,account,from,to,iso(at));return {id,context:{ownerId:owner,accountSid:account,callSid,from,to}};};return {...h,meter,call};}
// Hand expectations: duration0/1/59/60/61/3601sec =0/1/1/1/2/61min. Trial overrun $0. No provider charge.
for(const [seconds,minutes] of [[0,0],[1,1],[59,1],[60,1],[61,2],[3601,61]])test('F10: per-call ceiling '+seconds+'sec => '+minutes+'min, duplicate/restart stable',()=>{
 const h=setup();try{const c=h.call();h.meter.start(c.context,c.id);h.setTime(T+seconds);assert.equal(h.meter.finish(c.context,c.id,completion),minutes);h.setTime(T+seconds+90);assert.equal(createBillingVoiceUsage({database:h.db,clock:()=>new Date(h.now()*1000)}).finish(c.context,c.id),minutes);assert.equal(h.meter.minutesUsed(owner),0);h.meter.providerComplete(receipt(c,seconds));assert.equal(h.meter.minutesUsed(owner),minutes);}finally{h.db.close();}
});
test('F10: two31second calls count2minutes; spam and fallback add0',()=>{
 const h=setup();try{for(let n=0;n<2;n++){const c=h.call();h.meter.start(c.context,c.id);h.setTime(h.now()+31);h.meter.finish(c.context,c.id,completion);h.meter.providerComplete(receipt(c,31));}assert.equal(h.meter.minutesUsed(owner),2);
 for(const type of ['spam','FALLBACK','AI_FALLBACK']){const c=h.call();h.meter.start(c.context,c.id);h.setTime(h.now()+3601);h.db.prepare("UPDATE calls SET status=?,spamFiltered=? WHERE id=?").run(type==='spam'?'COMPLETED':type,type==='spam'?1:0,c.id);assert.equal(h.meter.finish(c.context,c.id),0);}assert.equal(h.meter.minutesUsed(owner),2);
 }finally{h.db.close();}
});
test('F10: trial and paid usage periods exclude historic calls, preserve boundary-crossing attribution',()=>{
 const h=setup();try{for(const [at,minutes] of [[T-1,70],[T,3],[T+14*day-1,2],[T+14*day,80]]){const c=h.call(at);h.setTime(at);h.meter.start(c.context,c.id);h.setTime(at+minutes*60);h.meter.finish(c.context,c.id,completion);h.meter.providerComplete(receipt(c,minutes*60));}assert.equal(h.meter.minutesUsed(owner),5);
 h.service.applyVerifiedStripeEvent(h.sub('evt_paid_period',14*day,{current_period_start:T+14*day,current_period_end:T+44*day}));assert.equal(voiceUsagePeriod(h.db,owner).kind,'paid');assert.equal(h.meter.minutesUsed(owner),80);
 h.db.prepare('UPDATE billingAccounts SET currentPeriodStartAt=NULL WHERE ownerId=?').run(owner);assert.equal(h.meter.minutesUsed(owner),null);
 }finally{h.db.close();}
});
test('F10: provider duration supersedes local interval, exact retries stable, changed receipts and foreign bindings rejected atomically',()=>{
 const h=setup();try{const c=h.call();h.meter.start(c.context,c.id);h.setTime(T+59);assert.equal(h.meter.finish(c.context,c.id,completion),1);assert.equal(h.meter.minutesUsed(owner),0);
 const p={AccountSid:account,CallSid:c.context.callSid,From:from,To:to,CallStatus:'completed',CallDuration:'61',Direction:'inbound'};
 assert.equal(h.meter.providerComplete(p),2);assert.equal(h.meter.providerComplete({...p,Timestamp:'ignored delivery metadata'}),2);assert.equal(h.meter.finish(c.context,c.id),2);
 for(const extra of [{CallDuration:'62'},{AccountSid:'AC'+'b'.repeat(32)},{From:'+19025550999'},{To:'+19025550999'},{Direction:'outbound-api'}])assert.throws(()=>h.meter.providerComplete({...p,...extra}));assert.equal(h.meter.minutesUsed(owner),2);
 }finally{h.db.close();}
});
test('F10: provider completion after process restart finalizes once; failed persistence rolls back',()=>{
 const dir=mkdtempSync(join(tmpdir(),'SYNTHETIC-meter-')),filename=join(dir,'meter.sqlite'),h=setup({filename});let c;
 try{c=h.call();h.meter.start(c.context,c.id);}finally{h.db.close();}
 try{const input=JSON.stringify({AccountSid:account,CallSid:c.context.callSid,From:from,To:to,CallStatus:'completed',CallDuration:'3601'});
 const script=`import {DatabaseSync} from 'node:sqlite';import {createBillingVoiceUsage} from './server/src/billingVoiceUsage.js';const db=new DatabaseSync(process.env.SYNTHETIC_DB);const meter=createBillingVoiceUsage({database:db});console.log(meter.providerComplete(JSON.parse(process.env.SYNTHETIC_RECEIPT)));db.close();`;
 for(let i=0;i<2;i++){const run=spawnSync(process.execPath,['--input-type=module','-e',script],{env:{...process.env,SYNTHETIC_DB:filename,SYNTHETIC_RECEIPT:input},encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(run.stdout.trim(),'61');}
 const r=harness({filename,resume:true});try{const m=createBillingVoiceUsage({database:r.db});r.db.exec("CREATE TRIGGER SYNTHETIC_fail BEFORE UPDATE ON calls BEGIN SELECT RAISE(ABORT,'SYNTHETIC');END;");assert.throws(()=>m.providerComplete(JSON.parse(input)));assert.equal(r.db.prepare('SELECT minutesBilled FROM calls WHERE id=?').get(c.id).minutesBilled,61);migrateDatabase(r.db);assert.equal(r.db.prepare('PRAGMA foreign_key_check').all().length,0);}finally{r.db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('F10: signed duration HTTP rejects forgery and wrong tenant; unknown provider events cannot write usage',async()=>{
 const h=setup(),c=h.call(),app=express(),secret='SYNTHETIC-secret',origin='https://voice.example.invalid';
 h.meter.start(c.context,c.id);h.meter.finish(c.context,c.id,completion);
 const validator=createTwilioRequestValidator({validateRequest:twilio.validateRequest,authToken:secret,publicBaseUrl:origin,allowedAccountSids:[account]});installBillingVoiceRoutes(app,{validator,meter:h.meter});
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));}),base='http://127.0.0.1:'+server.address().port,path='/api/twilio/voice/status';
 async function send(extra={},bad=false){const body={AccountSid:account,CallSid:c.context.callSid,From:from,To:to,CallStatus:'completed',CallDuration:'61',...extra};return fetch(base+path,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':bad?'forged':twilio.getExpectedTwilioSignature(secret,origin+path,body)},body:new URLSearchParams(body)});}
 try{assert.equal((await send({},true)).status,403);assert.equal(h.meter.minutesUsed(owner),0);assert.equal((await send()).status,204);assert.equal((await send()).status,204);assert.equal(h.meter.minutesUsed(owner),2);assert.equal((await send({To:'+19025550999'})).status,409);assert.equal((await send({CallDuration:'62'})).status,409);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));h.db.close();}
});
// Expected before execution: fallback is excluded ($0,0minutes), even if an
// asynchronous media close arrives later with61seconds of local elapsed time.
test('F10: late media finalization cannot undo fallback exclusion',()=>{
 const h=setup();try{const c=h.call();h.meter.start(c.context,c.id);h.setTime(T+61);
 h.db.prepare("UPDATE calls SET status='FALLBACK',outcome='VOICE_SESSION_UNAVAILABLE',minutesBilled=0 WHERE id=?").run(c.id);
 assert.equal(h.meter.finish(c.context,c.id,{status:'COMPLETED',outcome:'STOP',failureCode:null,streamSid:null}),0);
 assert.equal(h.db.prepare('SELECT status FROM calls WHERE id=?').get(c.id).status,'FALLBACK');assert.equal(h.meter.minutesUsed(owner),0);
 }finally{h.db.close();}
});
