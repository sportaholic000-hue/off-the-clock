import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Agent} from 'node:http';
import {NodeHttpHandler} from '@smithy/node-http-handler';
import {fakeS3} from './helpers/offsiteFakeS3.mjs';
import {readOffsiteConfig,createS3BackupStore} from '../server/src/offsiteStore.js';
import {callFailureReason} from '../client/src/callFailureReasons.js';

// Handwritten before execution: default/path -> /synthetic-bucket/probe.json
// on localhost; virtual -> /probe.json on synthetic-bucket.localhost. Region
// auto remains auto in the signed request. PUT/GET/HEAD/LIST/DELETE round-trip
// unchanged bytes under each style. All network traffic stays on loopback.
const env={OFFSITE_BACKUP_ENDPOINT:'https://t3.storageapi.dev',OFFSITE_BACKUP_BUCKET:'synthetic-bucket',
  OFFSITE_BACKUP_ACCESS_KEY_ID:'SYNTHETIC_ACCESS',OFFSITE_BACKUP_SECRET_ACCESS_KEY:'SYNTHETIC_SECRET',
  OFFSITE_BACKUP_ENCRYPTION_KEY:'01'.repeat(32),OFFSITE_BACKUP_REGION:'auto'};
test('off-site URL style defaults to path; Railway auto region and virtual style are accepted',()=>{
  assert.equal(readOffsiteConfig(env).urlStyle,'path');assert.equal(readOffsiteConfig(env).region,'auto');
  assert.equal(readOffsiteConfig({...env,OFFSITE_BACKUP_URL_STYLE:'virtual'}).urlStyle,'virtual');
  for(const value of ['Virtual','host','../path',' path'])assert.equal(readOffsiteConfig({...env,OFFSITE_BACKUP_URL_STYLE:value}).reason,'OFFSITE_CONFIG_INVALID');
});
for(const style of ['path','virtual'])test('fake S3 store round trip using '+style+' URLs',async t=>{
  const fake=await fakeS3(t),root=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-offsite-style-'));
  const httpAgent=new Agent({lookup:(_host,options,callback)=>options.all?callback(null,[{address:'127.0.0.1',family:4}]):callback(null,'127.0.0.1',4)});
  const store=createS3BackupStore(readOffsiteConfig({...env,OFFSITE_BACKUP_ENDPOINT:fake.endpoint.replace('127.0.0.1','localhost'),OFFSITE_BACKUP_URL_STYLE:style}),
    {requestHandler:new NodeHttpHandler({httpAgent})});
  t.after(()=>{store.close();httpAgent.destroy();fs.rmSync(root,{recursive:true,force:true});});
  await store.putRecord('probe.json',{marker:'[SYNTHETIC] unchanged'});
  assert.deepEqual(await store.record('probe.json'),{marker:'[SYNTHETIC] unchanged'});
  assert.deepEqual(await store.list('probe'),['probe.json']);assert.ok((await store.head('probe.json')).ContentLength>0);
  const bytes=Buffer.from('[SYNTHETIC] backup bytes'),source=path.join(root,'input'),out=path.join(root,'output');fs.writeFileSync(source,bytes);
  await store.putFile('probe.enc',source,'1'.repeat(64));await store.download('probe.enc',out,bytes.length);assert.deepEqual(fs.readFileSync(out),bytes);
  const first=fake.requests[0];assert.equal(first.path,style==='path'?'/synthetic-bucket/probe.json':'/probe.json');
  assert.equal(first.host.split(':')[0],style==='path'?'localhost':'synthetic-bucket.localhost');
  assert.match(first.authorization,/\/auto\/s3\/aws4_request/);
  await store.remove('probe.enc');await store.remove('probe.json');assert.equal(fake.objects.size,0);
});
test('repeat caller copy exactly matches the October 9 owner approval',()=>{
  const expected='This caller called too many times in 24 hours and was asked to leave a message.';
  assert.equal(callFailureReason('VOICE_CALLER_THROTTLED'),expected);
  const calls=fs.readFileSync(new URL('../client/src/calls.jsx',import.meta.url),'utf8');
  assert.ok(calls.includes('<Notice title="Repeated caller">'+expected+'</Notice>'));
  assert.ok(!calls.includes('Repeated caller — review requested'));
});
test('Railway guide and template document the approved bucket configuration',()=>{
  for(const file of ['docs/RAILWAY_SETUP.md','deployment/railway.env.example']){
    const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
    for(const value of ['OFFSITE_BACKUP_ENDPOINT=https://t3.storageapi.dev','OFFSITE_BACKUP_REGION=auto','OFFSITE_BACKUP_URL_STYLE=virtual'])assert.ok(text.includes(value),file+': '+value);
  }
});
test('an erased application account cannot reopen a price-book save',async()=>{
  // Before execution: the callback must never run and no book/lock is created.
  // Standalone stores without an account schema retain their existing behavior.
  const {db,migrate}=await import('../server/src/db.js');migrate();
  const {withPricebookLock}=await import('../server/priceBookService.js');
  const id='SYNTHETIC-erased-save';
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,role,dataDeletedAt,createdAt) VALUES(?,?,'!','','','owner','2027-02-18T12:00:00.000Z','2026-10-20T12:00:00.000Z')").run(id,id+'@account.invalid');
  let called=false;assert.throws(()=>withPricebookLock(id,()=>{called=true;}),{code:'ACCOUNT_ERASED'});
  assert.equal(called,false);assert.equal(fs.existsSync(path.join(process.env.PRICEBOOK_PATH,id+'.json')),false);
});
