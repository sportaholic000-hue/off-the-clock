import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import WebSocket from 'ws';
import twilio from 'twilio';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';

// Run the exact executable specified by npm start. Providers remain disabled;
// the signed callback still has to reach the real tenant-bound fallback and
// the same HTTP server must own the voice WebSocket upgrade path.
test('actual start-script server registers signed incoming and voice WebSocket routes',{timeout:40000},async()=>{
  const root=path.resolve(new URL('..',import.meta.url).pathname);
  assert.equal(JSON.parse(readFileSync(path.join(root,'package.json'),'utf8')).scripts.start,'node server/src/server.js');
  const temp=mkdtempSync(path.join(tmpdir(),'voice-entry-')),filename=path.join(temp,'app.sqlite');
  const owner=crypto.randomUUID(),accountSid='AC'+'a'.repeat(32),callSid='CA'+'b'.repeat(32),from='+19025550100',to='+19025550101',fallback='+19025550199',token='synthetic-callback-token';
  const db=new Database(filename);for(const sql of CREATE_TABLE_STATEMENTS)db.exec(sql);
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'synthetic','Synthetic','Synthetic Entry Co','QuoteDone','active','UTC','owner',?)").run(owner,owner+'@example.invalid','2026-10-05T12:00:00.000Z');
  db.prepare("INSERT INTO businessProfiles(ownerId,twilioNumber,existingPhoneNumber,phoneProvisioningStatus,operatorEnabled,updatedAt) VALUES(?,?,?,'provisioned',1,?)").run(owner,to,fallback,'2026-10-05T12:00:00.000Z');db.close();
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const origin='https://voice-entry.example.test',base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,['server/src/server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),DATABASE_PATH:filename,APP_DATA_DIR:temp,PRICEBOOK_PATH:path.join(temp,'pricebooks'),JWT_SECRET:'synthetic-entry-signing-key-never-live'.padEnd(64,'x'),BOOKING_SLOT_TOKEN_SECRET:'synthetic-entry-booking-key-never-live'.padEnd(64,'x'),ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',TWILIO_ACCOUNT_SID:accountSid,TWILIO_AUTH_TOKEN:token,PUBLIC_BASE_URL:origin},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
  let ws;
  try{
    const deadline=Date.now()+20000;
    while(!output.includes('Off The Clock AI server listening')){assert.equal(child.exitCode,null,output);if(Date.now()>deadline)throw Error('Startup timed out: '+output);await new Promise(resolve=>setTimeout(resolve,25));}
    const callback='/api/twilio/voice/incoming',params={AccountSid:accountSid,CallSid:callSid,From:from,To:to,Direction:'inbound'};
    const request=signature=>fetch(base+callback,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded','x-twilio-signature':signature},body:new URLSearchParams(params)});
    assert.equal((await request('invalid')).status,403);
    const response=await request(twilio.getExpectedTwilioSignature(token,origin+callback,params));assert.equal(response.status,200);
    const xml=await response.text();assert.match(xml,/<Gather/);assert.doesNotMatch(xml,/<Dial|<Hangup/);assert.doesNotMatch(xml,/operator connection is ready/);
    const status=await new Promise((resolve,reject)=>{
      ws=new WebSocket(base.replace(/^http:/,'ws:')+'/api/twilio/voice/stream/'+'x'.repeat(43));
      ws.once('unexpected-response',(_request,res)=>{res.resume();resolve(res.statusCode);});ws.once('error',reject);ws.once('open',()=>reject(Error('Unsigned upgrade must not open.')));
    });assert.equal(status,403);
    const check=new Database(filename,{readonly:true});try{const row=check.prepare('SELECT ownerId,status FROM calls WHERE callSid=?').get(callSid);assert.equal(row.ownerId,owner);assert.equal(row.status,'FALLBACK');}finally{check.close();}
  }finally{
    if(ws&&ws.readyState===WebSocket.OPEN)ws.close();
    if(child.exitCode===null){child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(()=>{child.kill('SIGKILL');resolve();},5000))]);}
    rmSync(temp,{recursive:true,force:true});
  }
});
