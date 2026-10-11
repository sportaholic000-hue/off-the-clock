import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {A,B,END,START,DEADLINE,KEY,retentionFixture,businessRows} from './helpers/tenantRetentionFixture.mjs';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {createCalendarRetentionRevoker} from '../server/src/calendarRetentionRevocation.js';
import {decryptCredentialPayload} from '../server/src/credentialEncryption.js';
import {eraseTenantPricebookFiles} from '../server/src/billingTenantErasure.js';

const SID='PN'+'a'.repeat(32),DAY=86400000;
function setup(t,{google='success',phone='success',enabled=true}={}){
  const f=retentionFixture(t),beforeB=businessRows(f.db,B),calls={google:0,phone:0,backups:0};
  f.db.prepare('UPDATE businessProfiles SET twilioNumberSid=? WHERE ownerId=?').run(SID,A);
  let googleOutcome=google,phoneOutcome=phone,writes=enabled;
  const revoker=createCalendarRetentionRevoker({enabled:()=>writes,key:KEY,timeoutMs:15,fetchImpl:async(_url,options)=>{
    calls.google++;assert.equal(new URLSearchParams(options.body).get('token'),'[SYNTHETIC] refresh '+A);
    if(googleOutcome==='network')throw Error('[SYNTHETIC] connection lost');
    if(googleOutcome==='timeout')return new Promise(()=>{});
    return {status:googleOutcome==='success'?200:googleOutcome==='invalid_token'?400:Number(googleOutcome),
      json:async()=>({error:googleOutcome==='invalid_token'?'invalid_token':'[SYNTHETIC] other error'})};
  }});
  const options={database:f.db,clock:f.clock,enabled:()=>writes,revokeCalendar:revoker,
    releaseNumber:async input=>{calls.phone++;assert.deepEqual(input,{ownerId:A,sid:SID});
      if(phoneOutcome==='success')return {released:true};
      throw Object.assign(Error('[SYNTHETIC] release failed'),{statusCode:Number(phoneOutcome)});},
    erasePricebookFiles:ownerId=>eraseTenantPricebookFiles(ownerId,{directory:f.deployment.pricebookPath}),
    eraseBackupCopies:async()=>{calls.backups++;}};
  return {...f,beforeB,calls,options,service:()=>createBillingCustomerLifecycle(options),
    recover:()=>{googleOutcome=phoneOutcome='success';writes=true;},setWrites:value=>{writes=value;},
    row:()=>f.db.prepare('SELECT * FROM billingCancellations WHERE ownerId=?').get(A)};
}
function localErased(f){
  for(const table of ['businessProfiles','calendarConnections','calls','leads','quotes','customers'])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE ownerId=?').get(A).n,0);
  assert.ok(!fs.existsSync(path.join(f.deployment.pricebookPath,A+'.json')));
  assert.deepEqual(businessRows(f.db,B),f.beforeB);
}

// Written before execution: transient failures leave completion unset, keep only
// the refresh token encrypted and exact number SID, retry after reconstruction,
// then erase retry material. B and all billing records remain unchanged.
for(const google of ['503','429','network','timeout','400'])test('day90 Google retry after '+google+' survives local deletion and restart',async t=>{
  const f=setup(t,{google});f.setTime(DEADLINE);
  await f.service().processOwner(A,{localOnly:true});localErased(f);
  assert.equal(f.row().dataDeletedAt,null,'An unrevoked grant cannot be marked complete');
  assert.equal(f.row().calendarRevokeStatus,google==='timeout'?'TIMEOUT':'FAILED');
  const secrets=f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A);
  assert.deepEqual(decryptCredentialPayload(secrets,{key:KEY}),{refreshToken:'[SYNTHETIC] refresh '+A});
  assert.equal(secrets.phoneNumberSid,null);
  f.recover();await f.service().processOwner(A,{localOnly:true});localErased(f);
  assert.equal(f.calls.google,2);assert.equal(f.calls.phone,1);
  assert.equal(f.row().calendarRevokeStatus,'REVOKED');assert.equal(f.row().dataDeletedAt,DEADLINE);
  assert.equal(f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A),undefined);
  await f.service().processOwner(A,{localOnly:true});assert.equal(f.calls.google,2);
});
test('day90 phone retry retains the original SID and never invents release after profile erasure',async t=>{
  const f=setup(t,{phone:'503'});f.setTime(DEADLINE);
  await f.service().processOwner(A,{localOnly:true});localErased(f);
  assert.equal(f.row().phoneReleasedAt,null);assert.equal(f.row().dataDeletedAt,null);
  const secrets=f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A);
  assert.equal(secrets.phoneNumberSid,SID);assert.equal(secrets.credentialsCiphertext,null);
  await f.service().processOwner(A,{localOnly:true});assert.equal(f.calls.phone,2);assert.equal(f.row().phoneReleasedAt,null);
  f.recover();await f.service().processOwner(A,{localOnly:true});assert.equal(f.calls.phone,3);assert.equal(f.calls.google,1);
  assert.equal(f.row().phoneReleasedAt,DEADLINE);assert.equal(f.row().dataDeletedAt,DEADLINE);
  assert.equal(f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A),undefined);
});
test('day90 provider writes disabled retains both retry values without postponing local or off-site deletion',async t=>{
  const f=setup(t,{enabled:false});f.setTime(DEADLINE);
  await f.service().processOwner(A,{localOnly:true});localErased(f);
  assert.equal(f.row().dataDeletedAt,null);assert.equal(f.row().phoneReleasedAt,null);
  assert.equal(f.calls.backups,1);assert.equal(f.calls.google,0);assert.equal(f.calls.phone,0);
  f.recover();await f.service().processOwner(A,{localOnly:true});
  assert.equal(f.calls.google,1);assert.equal(f.calls.phone,1);assert.ok(f.row().dataDeletedAt);
});
test('day90 Google refresh-token invalid_token and number 404 are completed outcomes',async t=>{
  const f=setup(t,{google:'invalid_token',phone:'404'});f.setTime(DEADLINE);
  await f.service().processOwner(A,{localOnly:true});await f.service().processOwner(A,{localOnly:true});
  localErased(f);assert.equal(f.row().calendarRevokeStatus,'ALREADY_REVOKED');assert.equal(f.row().phoneReleasedAt,DEADLINE);
  assert.equal(f.calls.google,1);assert.equal(f.calls.phone,1);assert.ok(f.row().dataDeletedAt);
});
test('day90 retry material expires exactly 30 days after first attempt and permanent failure reaches admin status',async t=>{
  const f=setup(t,{google:'503',phone:'503'});f.setTime(DEADLINE);
  await f.service().processOwner(A,{localOnly:true});
  f.setTime(Date.parse(DEADLINE)+30*DAY-1);await f.service().processOwner(A,{localOnly:true});
  assert.equal(f.calls.google,2);assert.equal(f.calls.phone,2);
  f.setTime(Date.parse(DEADLINE)+30*DAY);await f.service().processOwner(A,{localOnly:true});
  assert.equal(f.calls.google,2);assert.equal(f.calls.phone,2);assert.equal(f.row().phoneReleasedAt,null);
  assert.equal(f.row().calendarRevokeStatus,'PERMANENT_FAILURE');assert.equal(f.row().dataDeletedAt,null);
  assert.equal(f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A),undefined);
  const status=f.service().retentionStatus();assert.equal(status.ok,false);assert.equal(status.permanentFailures.length,2);
  for(const failure of status.permanentFailures){assert.equal(failure.ownerId,A);assert.equal(failure.failedAt,'2027-03-20T12:00:00.000Z');}
  f.recover();await f.service().processOwner(A,{localOnly:true});assert.equal(f.calls.google,2);assert.equal(f.calls.phone,2);
});
test('day90 undecryptable Google token is discarded immediately with a permanent failure, without blocking other steps',async t=>{
  const f=setup(t);f.db.prepare("UPDATE calendarConnections SET credentialsCiphertext='[SYNTHETIC] corrupt' WHERE ownerId=?").run(A);f.setTime(DEADLINE);
  await f.service().processOwner(A,{localOnly:true});localErased(f);
  assert.equal(f.row().calendarRevokeStatus,'PERMANENT_FAILURE');assert.equal(f.row().dataDeletedAt,null);
  assert.equal(f.calls.google,0);assert.equal(f.calls.phone,1);assert.equal(f.calls.backups,1);
  assert.equal(f.db.prepare('SELECT * FROM billingRetentionSecrets WHERE ownerId=?').get(A),undefined);
  assert.equal(f.service().retentionStatus().permanentFailures[0].failedAt,DEADLINE);
});

test('day90 provider success removes retry material from the main database and WAL immediately',async t=>{
  const f=setup(t,{google:'503',phone:'503'});f.db.pragma('journal_mode=WAL');f.setTime(DEADLINE);
  await f.service().processOwner(A,{localOnly:true});
  const secret=f.db.prepare('SELECT credentialsCiphertext FROM billingRetentionSecrets WHERE ownerId=?').get(A).credentialsCiphertext;
  f.recover();await f.service().processOwner(A,{localOnly:true});
  for(const suffix of ['','-wal']){
    const file=f.db.name+suffix;if(!fs.existsSync(file))continue;
    const bytes=fs.readFileSync(file);
    assert.ok(!bytes.includes(Buffer.from(secret)),'Erased refresh-token ciphertext remains in '+suffix+' database bytes');
    assert.ok(!bytes.includes(Buffer.from(SID)),'Released SID remains in '+suffix+' database bytes');
  }
});

test('day90 sweep deletes every due owner locally before waiting for a slow provider',async t=>{
  const f=setup(t);f.setTime(DEADLINE);
  f.db.prepare("INSERT INTO billingCancellations(ownerId,stripeSubscriptionId,operationId,state,endAt,requestedAt,updatedAt) VALUES(?,'sub_SYNTHETIC_B','op_SYNTHETIC_B','CONFIRMED',?,?,?)").run(B,END,START,START);
  let entered,finish;const enteredProvider=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{finish=resolve;});
  f.options.eraseBackupCopies=async ownerId=>{if(ownerId===A){entered();await held;}};
  const service=f.service(),running=service.tick();
  await enteredProvider;
  try{
    for(const ownerId of [A,B])assert.equal(f.db.prepare('SELECT COUNT(*) n FROM businessProfiles WHERE ownerId=?').get(ownerId).n,0,ownerId+' local deletion waited for another provider');
  }finally{finish();await running;}
});
