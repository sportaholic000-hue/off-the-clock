import {syntheticLocalTls} from './helpers/syntheticTls.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createHmac,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import express from 'express';
import jwt from 'jsonwebtoken';
import {migrateDatabase} from '../server/src/migrations.js';
import {csvCell,csvRows,exportDefinition} from '../server/src/integrationData.js';
import {createOutboundWebhookService,WEBHOOK_RETRY_DELAYS_MS} from '../server/src/outboundWebhookService.js';
import {WEBHOOK_EVENTS} from '../server/src/outboundWebhookSchema.js';
import {publicAddress,parseWebhookUrl,resolveWebhookDestination,postWebhook,signWebhook,webhookDispatchEnabled} from '../server/src/outboundWebhookTransport.js';
import {installOwnerIntegrationRoutes} from '../server/src/ownerIntegrationRoutes.js';
import {requireAuth} from '../server/src/authMiddleware.js';
import {createAuthSessionService} from '../server/src/authSessionService.js';

const AT = Date.parse('2026-10-01T12:00:00.000Z');
const SYNTHETIC_KEY = '37'.repeat(32);
const SYNTHETIC_JWT = 'SYNTHETIC_OWNER_INTEGRATION_SESSION_KEY_DO_NOT_USE';
const publicLookup = async () => [{address:'8.8.8.8',family:4}];

function fixture(t,{filename=':memory:',deliver,lookup=publicLookup}={}) {
  const database = new DatabaseSync(filename);database.exec('PRAGMA foreign_keys=ON');
  let closed=false;t.after(()=>{if(!closed)database.close();});
  migrateDatabase(database);
  const timestamp=new Date(AT).toISOString();
  for(const id of ['a','b']) {
    database.prepare(`INSERT OR IGNORE INTO users
      (id,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt)
      VALUES (?,?,'SYNTHETIC_PASSWORD_HASH','Owner','Synthetic business','Operator','pending_payment','owner',?)`).run(id,id+'@example.invalid',timestamp);
    database.prepare(`INSERT OR IGNORE INTO billingAccounts
      (ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt)
      VALUES (?,?,?,?,?)`).run(id,'cus_SYNTHETIC_'+id,timestamp,timestamp,timestamp);
    database.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(id);
  }
  const calls=[];let at=AT,dispatchEnabled=true;
  const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/);return database.prepare(sql);};
  const serviceOptions={database,ownerQuery,encryptionOptions:{key:SYNTHETIC_KEY},now:()=>at,
    resolveDestination:url=>resolveWebhookDestination(url,{lookup}),
    deliver:deliver||(async(destination,request)=>{calls.push({destination,request});return 204;}),
    enabled:()=>dispatchEnabled};
  const service=createOutboundWebhookService(serviceOptions);
  function lead(owner='a',{id=randomUUID(),name='Synthetic Customer',phone='+19025550123',details={originalSubmission:{contact:{email:'customer@example.invalid'}},
      bookSnapshot:{apiKey:'SECRET_PRICE_BOOK_CREDENTIAL'},passwordHash:'SECRET_HASH'},service='Synthetic service'}={}) {
    database.prepare(`INSERT INTO leads (id,ownerId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt)
      VALUES (?,?,?,?,?,?,'quote_review','NEEDS REVIEW',?)`).run(id,owner,name,phone,service,typeof details==='string'?details:JSON.stringify(details),timestamp);
    return id;
  }
  function quote(owner='a',{id=randomUUID(),contact={name:'Synthetic Customer',phone:'+19025550123',email:'customer@example.invalid'}}={}) {
    database.prepare('INSERT INTO quoteRequests(id,ownerId,describedService,estimatedValue,createdAt) VALUES (?,?,?,?,?)').run(id,owner,'Synthetic requested service',12500,timestamp);
    database.prepare(`INSERT INTO quoteSubmissions
      (ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,bookingTokenReceipt,createdAt)
      VALUES (?,?,?,?,'ESTIMATE_REQUIRES_REVIEW','SYNTHETIC_REVISION',?,'{"credentials":"SECRET_INTERNAL"}','{}','SECRET_BOOKING_RECEIPT',?)`).run(
      owner,randomUUID(),'digest',id,JSON.stringify({contact,credentials:'SECRET_SUBMISSION_CREDENTIAL'}),timestamp);
    return id;
  }
  function booking(owner='a',{id=randomUUID(),status='CONFIRMED',customer={name:'Synthetic Booking Customer',phone:'+19025550123',email:'booking@example.invalid',token:'SECRET_CUSTOMER_TOKEN'}}={}) {
    database.prepare(`INSERT INTO appointments(id,ownerId,serviceType,status,startAtUtc,endAtUtc,timezone,customerJson,confirmedAt,createdAt)
      VALUES (?,?,'SYNTHETIC_SERVICE',?,'2026-10-02T12:00:00.000Z','2026-10-02T13:00:00.000Z','America/Halifax',?,?,?)`).run(
      id,owner,status,typeof customer==='string'?customer:JSON.stringify(customer),status==='CONFIRMED'?timestamp:null,timestamp);
    return id;
  }
  return {database,ownerQuery,service,serviceOptions,calls,lead,quote,booking,
    save:(owner='a',events=WEBHOOK_EVENTS)=>service.save(owner,{url:'https://'+owner+'.example.invalid/hooks',events}),
    rows:owner=>database.prepare('SELECT * FROM webhookDeliveries WHERE ownerId=? ORDER BY eventType').all(owner),
    advance:ms=>{at+=ms;},disable:()=>{dispatchEnabled=false;},enable:()=>{dispatchEnabled=true;},
    close:()=>{database.close();closed=true;}};
}

function parseCsv(text) {
  text=text.replace(/^\ufeff/,'');const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(ch==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(ch===','&&!quoted){row.push(value);value='';}
    else if(ch==='\r'&&text[i+1]==='\n'&&!quoted){row.push(value);rows.push(row);row=[];value='';i++;}
    else value+=ch;
  }
  assert.equal(quoted,false);return rows;
}

test('CSV neutralizes formula prefixes, whitespace, controls and locale variants',()=>{
  for(const value of ['=SUM(A1:A2)','+1','-2','@SUM(A1)',' \t=1','\ufeff+1','\r@1','＝1','＋1','－1','＠1','\ttext','\ntext']) {
    const cell=parseCsv(csvCell(value)+'\r\n')[0][0];assert.equal(cell[0],"'");assert.equal(cell.slice(1),value);
  }
  assert.equal(csvCell(123),'"123"');assert.equal(csvCell(null),'""');
});
test('CSV quoting preserves separators, quotes and multiline data without creating extra cells',()=>{
  const values=['safe,=HYPERLINK("https://example.invalid")','line\r\n=1','semi;@1','"quoted"'];
  assert.deepEqual(parseCsv(values.map(csvCell).join(',')+'\r\n'),[values]);
});
for(const kind of ['leads','quote-requests','bookings']) test(kind+' CSV exports only the authenticated tenant and no internal JSON/credentials',t=>{
  const f=fixture(t);f.lead('a',{name:'=SYNTHETIC_FORMULA'});f.lead('b',{name:'OTHER_TENANT_NAME'});
  f.quote('a');f.quote('b',{contact:{name:'OTHER_TENANT_NAME',email:'other-tenant@example.invalid'}});
  f.booking('a');f.booking('b',{customer:{name:'OTHER_TENANT_NAME',email:'other-tenant@example.invalid'}});
  const output=[...csvRows(f.ownerQuery,'a',kind)].join('');const rows=parseCsv(output);
  assert.equal(rows.length,2);assert.equal(rows[0].length,rows[1].length);
  assert.doesNotMatch(output,/OTHER_TENANT|other-tenant|SECRET_|passwordHash|credentials|bookSnapshot|bookingTokenReceipt/);
  if(kind==='leads')assert.ok(rows[1].includes("'=SYNTHETIC_FORMULA"));
});
test('CSV pagination includes more than 500 rows once each, without tenant bleed',t=>{
  const f=fixture(t);for(let i=0;i<503;i++)f.lead('a',{id:'lead-'+String(i).padStart(4,'0')});
  f.lead('b',{id:'other-tenant'});
  const rows=parseCsv([...csvRows(f.ownerQuery,'a','leads')].join(''));
  assert.equal(rows.length,504);assert.equal(new Set(rows.slice(1).map(row=>row[0])).size,503);
  assert.equal(rows.flat().includes('other-tenant'),false);
});
test('unknown export names and prototype properties are unavailable',()=>{
  for(const kind of ['calls','../../users','constructor','__proto__','toString'])assert.equal(exportDefinition(kind),null);
});
test('capture is tenant-scoped and the signing secret is encrypted and shown once',async t=>{
  const f=fixture(t),saved=await f.save('a');f.lead('a');f.lead('b');assert.equal(f.rows('a').length,1);assert.equal(f.rows('b').length,0);
  assert.match(saved.signingSecret,/^[a-f0-9]{64}$/);assert.equal(f.service.getConfiguration('a').signingSecret,undefined);
  const stored=f.database.prepare('SELECT * FROM webhookEndpoints WHERE ownerId=?').get('a');
  assert.equal(JSON.stringify(stored).includes(saved.signingSecret),false);
  assert.equal(f.service.getConfiguration('b').webhook,null);
});
test('all three event POSTs carry tenant-specific data, independently verifiable signatures and no credentials',async t=>{
  const f=fixture(t),secrets={a:(await f.save('a')).signingSecret,b:(await f.save('b')).signingSecret};
  f.lead('a');f.quote('a');f.booking('a');f.lead('b',{name:'OTHER_TENANT_NAME'});f.quote('b');f.booking('b');
  for(let i=0;i<3;i++)await f.service.dispatchOnce();
  assert.equal(f.calls.length,6);
  for(const {destination,request} of f.calls) {
    const owner=destination.url.hostname[0],body=JSON.parse(request.body),h=request.headers;
    const expected='v1='+createHmac('sha256',secrets[owner]).update(h['X-OTC-Timestamp']+'.'+h['X-OTC-Event-ID']+'.'+request.body).digest('hex');
    assert.equal(h['X-OTC-Signature'],expected);assert.equal(body.id,h['X-OTC-Event-ID']);assert.equal(body.type,h['X-OTC-Event']);
    assert.doesNotMatch(request.body,/SECRET_|credentials|passwordHash|bookSnapshot|bookingToken|ownerId/);
    if(owner==='a')assert.doesNotMatch(request.body,/OTHER_TENANT/);
    const wrong='v1='+createHmac('sha256',secrets[owner==='a'?'b':'a']).update(h['X-OTC-Timestamp']+'.'+body.id+'.'+request.body).digest('hex');
    assert.notEqual(expected,wrong);
    assert.notEqual(expected,signWebhook(secrets[owner],h['X-OTC-Timestamp'],body.id,request.body+' '));
  }
  assert.deepEqual(new Set(f.calls.map(call=>JSON.parse(call.request.body).type)),new Set(WEBHOOK_EVENTS));
  assert.equal(f.rows('a').every(row=>row.status==='DELIVERED'),true);
});
test('bookings emit only on confirmation; repeated confirmations do not duplicate events',async t=>{
  const f=fixture(t);await f.save();const id=f.booking('a',{status:'PENDING_PROVIDER'});
  assert.equal(f.rows('a').length,0);f.database.prepare("UPDATE appointments SET status='CONFIRMED',confirmedAt=? WHERE ownerId=? AND id=?").run(new Date(AT).toISOString(),'a',id);
  assert.equal(f.rows('a').length,1);f.database.prepare("UPDATE appointments SET status='CONFIRMED' WHERE ownerId=? AND id=?").run('a',id);
  assert.equal(f.rows('a').length,1);
});
test('transaction rollback removes the captured event and never invokes delivery inline',async t=>{
  const f=fixture(t);await f.save();f.database.exec('BEGIN IMMEDIATE');f.lead();f.quote();f.booking();assert.equal(f.rows('a').length,3);
  f.database.exec('ROLLBACK');assert.equal(f.rows('a').length,0);assert.equal(f.calls.length,0);
});
test('malformed or credential-shaped nested JSON never breaks capture or leaks credentials',async t=>{
  const f=fixture(t);await f.save();f.lead('a',{details:'{malformed'});f.booking('a',{customer:'{malformed'});f.quote('a',{contact:{name:{password:'SECRET_NESTED'},email:{apiKey:'SECRET_NESTED'}}});
  for(let i=0;i<3;i++)await f.service.dispatchOnce();assert.equal(f.calls.length,3);
  assert.equal(f.calls.some(call=>call.request.body.includes('SECRET_')),false);
  for(const kind of ['leads','quote-requests','bookings'])assert.doesNotThrow(()=>[...csvRows(f.ownerQuery,'a',kind)]);
});
test('disabled event toggles capture only the selected event',async t=>{
  const f=fixture(t);await f.save('a',['quote.requested']);f.lead();f.quote();f.booking();
  assert.deepEqual(f.rows('a').map(row=>row.eventType),['quote.requested']);
});
test('receiver failures do not affect inserts, and retry obeys due time with stable event/body',async t=>{
  let attempts=0;const requests=[];const f=fixture(t,{deliver:async(_destination,request)=>{requests.push(request);return ++attempts===1?503:200;}});
  await f.save();const id=f.lead();assert.equal(attempts,0);assert.ok(f.database.prepare('SELECT id FROM leads WHERE ownerId=? AND id=?').get('a',id));
  await f.service.dispatchOnce();assert.equal(f.rows('a')[0].status,'PENDING');assert.equal(f.rows('a')[0].attemptCount,1);
  assert.equal(f.rows('a')[0].nextAttemptAt,AT+60_000);await f.service.dispatchOnce();assert.equal(attempts,1);
  f.advance(60_000);await f.service.dispatchOnce();assert.equal(f.rows('a')[0].status,'DELIVERED');
  assert.equal(requests[0].body,requests[1].body);assert.notEqual(requests[0].headers['X-OTC-Signature'],requests[1].headers['X-OTC-Signature']);
});
test('retry is durable across a real database close/reopen and encrypted key read',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'otc-webhook-restart-'));
  t.after(()=>{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(resolved,{recursive:true,force:true});});
  const filename=path.join(dir,'fixture.sqlite');let count=0;const deliver=async()=>++count===1?500:204;
  const first=fixture(t,{filename,deliver});await first.save();first.lead();await first.service.dispatchOnce();const eventId=first.rows('a')[0].id;first.close();
  const second=fixture(t,{filename,deliver});second.advance(60_000);await second.service.dispatchOnce();
  assert.equal(second.rows('a')[0].id,eventId);assert.equal(second.rows('a')[0].status,'DELIVERED');assert.equal(count,2);second.close();
});
test('exhausted retries become visible failures; only their own owner can requeue them',async t=>{
  let count=0;const f=fixture(t,{deliver:async()=>{count++;throw Error('SECRET_RECEIVER_RESPONSE https://private.invalid/secret');}});
  await f.save('a');await f.save('b');f.lead('a');
  for(let i=0;i<=WEBHOOK_RETRY_DELAYS_MS.length;i++){await f.service.dispatchOnce();f.advance(WEBHOOK_RETRY_DELAYS_MS[i]||0);}
  const row=f.rows('a')[0];assert.equal(row.status,'FAILED');assert.equal(count,8);assert.equal(row.lastErrorCode,'WEBHOOK_DELIVERY_FAILED');
  assert.doesNotMatch(JSON.stringify(f.service.getConfiguration('a')),/SECRET_RECEIVER/);
  assert.throws(()=>f.service.retry('b',row.id),{statusCode:404});f.service.retry('a',row.id);assert.equal(f.rows('a')[0].status,'PENDING');
});
test('two workers cannot concurrently deliver the same leased event',async t=>{
  let release,started;const begun=new Promise(resolve=>{started=resolve;});let count=0;
  const f=fixture(t,{deliver:async()=>{count++;started();return await new Promise(resolve=>{release=resolve;});}});
  await f.save();f.lead();const other=createOutboundWebhookService(f.serviceOptions);
  const first=f.service.dispatchOnce();await begun;await other.dispatchOnce();assert.equal(count,1);release(204);await first;
  assert.equal(f.rows('a')[0].status,'DELIVERED');
});
test('expired worker lease is reclaimed after a crash, without changing event identity',async t=>{
  const f=fixture(t);await f.save();f.lead();const row=f.rows('a')[0];
  f.database.prepare("UPDATE webhookDeliveries SET status='DELIVERING',attemptCount=1,leaseId='crashed-worker',leaseExpiresAt=? WHERE ownerId=? AND id=?").run(AT+60_000,'a',row.id);
  await f.service.dispatchOnce();assert.equal(f.calls.length,0);f.advance(60_000);await f.service.dispatchOnce();
  assert.equal(f.rows('a')[0].id,row.id);assert.equal(f.rows('a')[0].attemptCount,2);assert.equal(f.calls.length,1);
});
test('changing URL or rotating/removing a key cancels older pending events without touching other tenants',async t=>{
  const f=fixture(t);await f.save('a');await f.save('b');f.lead('a');f.lead('b');
  const saved=await f.service.save('a',{url:'https://new-a.example.invalid/hooks',events:WEBHOOK_EVENTS});assert.equal(f.rows('a')[0].status,'CANCELED');
  assert.equal(f.rows('b')[0].status,'PENDING');await f.service.dispatchOnce();assert.equal(f.calls.length,1);assert.equal(f.calls[0].destination.url.hostname,'b.example.invalid');
  f.lead('a');const rotated=f.service.rotate('a');assert.notEqual(rotated.signingSecret,saved.signingSecret);
  assert.equal(f.rows('a').every(row=>row.status==='CANCELED'),true);f.lead('a');f.service.remove('a');
  assert.equal(f.service.getConfiguration('a').webhook,null);assert.equal(f.rows('a').every(row=>row.status==='CANCELED'),true);
});
test('an endpoint change during DNS resolution prevents sending to the old destination',async t=>{
  let resolve,started;const begun=new Promise(r=>{started=r;});const f=fixture(t);await f.save();f.lead();
  const service=createOutboundWebhookService({...f.serviceOptions,resolveDestination:async url=>{started();await new Promise(r=>{resolve=r;});return resolveWebhookDestination(url,{lookup:publicLookup});}});
  const pending=service.dispatchOnce();await begun;f.service.remove('a');resolve();await pending;assert.equal(f.calls.length,0);assert.equal(f.rows('a')[0].status,'CANCELED');
});
test('swapping encrypted signing records across tenants fails closed without delivering',async t=>{
  const f=fixture(t);await f.save('a');await f.save('b');const b=f.database.prepare('SELECT * FROM webhookEndpoints WHERE ownerId=?').get('b');
  f.database.prepare('UPDATE webhookEndpoints SET credentialsCiphertext=?,credentialsIv=?,credentialsTag=? WHERE ownerId=?').run(b.credentialsCiphertext,b.credentialsIv,b.credentialsTag,'a');
  f.lead('a');await f.service.dispatchOnce();assert.equal(f.calls.length,0);assert.equal(f.rows('a')[0].status,'PENDING');
});
test('platform dispatch and account entitlements pause delivery without blocking inserts',async t=>{
  const f=fixture(t);await f.save();f.disable();f.lead();await f.service.dispatchOnce();assert.equal(f.calls.length,0);assert.equal(f.rows('a')[0].attemptCount,0);
  f.enable();f.database.prepare("UPDATE users SET planStatus='canceled' WHERE id=?").run('a');await f.service.dispatchOnce();
  assert.equal(f.calls.length,0);assert.equal(f.rows('a')[0].attemptCount,0);assert.equal(f.rows('a')[0].lastErrorCode,'ACCOUNT_ACCESS_PAUSED');
  f.database.prepare("UPDATE users SET planStatus='active' WHERE id=?").run('a');f.advance(3_600_000);await f.service.dispatchOnce();assert.equal(f.calls.length,1);
});
test('destination validation rejects HTTP, URL credentials and local/reserved IPv4/IPv6',async()=>{
  for(const url of ['http://8.8.8.8/hook','https://user:pass@8.8.8.8/hook','https://8.8.8.8/hook#secret',' https://8.8.8.8','https://8.8.8.8\\@127.0.0.1/hook'])assert.throws(()=>parseWebhookUrl(url));
  for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','100.64.0.1','0.0.0.0','192.0.2.1','198.18.0.1','224.0.0.1','255.255.255.255','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:0808:0808::','2001::1'])assert.equal(publicAddress(ip),false,ip);
  for(const ip of ['8.8.8.8','1.1.1.1','2001:4860:4860::8888','2606:4700:4700::1111'])assert.equal(publicAddress(ip),true,ip);
  for(const url of ['https://127.0.0.1','https://2130706433','https://0x7f000001','https://[::ffff:7f00:1]'])await assert.rejects(()=>resolveWebhookDestination(url));
});
test('mixed DNS records, rebinding on a later attempt and DNS timeout fail before any POST',async t=>{
  await assert.rejects(()=>resolveWebhookDestination('https://receiver.example.invalid',{lookup:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}]}));
  await assert.rejects(()=>resolveWebhookDestination('https://receiver.example.invalid',{lookup:()=>new Promise(()=>{}),timeoutMs:5}),{code:'WEBHOOK_DNS_TIMEOUT'});
  let privateNow=false;const f=fixture(t,{lookup:async()=>[{address:privateNow?'10.0.0.1':'8.8.8.8',family:4}]});
  await f.save();f.lead();privateNow=true;await f.service.dispatchOnce();assert.equal(f.calls.length,0);assert.equal(f.rows('a')[0].lastErrorCode,'WEBHOOK_DESTINATION_BLOCKED');
});
test('HTTPS transport pins DNS, retains TLS checks, sends exact signed bytes, and never follows redirects',async()=>{
  let captured;const request=(url,options,callback)=>{
    const req=new EventEmitter();req.destroy=()=>{};req.end=body=>{
      captured={url,options,body};const response=new EventEmitter();response.statusCode=302;response.destroy=()=>{};callback(response);
    };return req;
  };
  const destination=await resolveWebhookDestination('https://receiver.example.invalid/hooks',{lookup:publicLookup});
  assert.equal(await postWebhook(destination,{body:'{"synthetic":true}',headers:{'X-OTC-Signature':'v1=synthetic'},request}),302);
  assert.equal(captured.options.method,'POST');assert.equal(captured.options.agent,false);assert.equal(captured.options.rejectUnauthorized,undefined);
  assert.equal(captured.options.servername,'receiver.example.invalid');assert.equal(captured.body,'{"synthetic":true}');
  captured.options.lookup('receiver.example.invalid',{all:true},(error,records)=>{assert.equal(error,null);assert.deepEqual(records,[{address:'8.8.8.8',family:4}]);});
});
test('transport deadline rejects a receiver that never responds',async()=>{
  const request=()=>{const req=new EventEmitter();req.end=()=>{};req.destroy=error=>req.emit('error',error);return req;};
  await assert.rejects(()=>postWebhook({url:new URL('https://receiver.example.invalid'),hostname:'receiver.example.invalid',address:'8.8.8.8',family:4},{body:'{}',headers:{},request,timeoutMs:5}),{code:'WEBHOOK_TIMEOUT'});
});
test('webhook dispatch is independently configured and stays off in preview',()=>{
  assert.equal(webhookDispatchEnabled({NODE_ENV:'production'}),true);assert.equal(webhookDispatchEnabled({NODE_ENV:'test'}),false);
  assert.equal(webhookDispatchEnabled({NODE_ENV:'production',OUTBOUND_WEBHOOKS_ENABLED:'false'}),false);
  assert.equal(webhookDispatchEnabled({OUTBOUND_WEBHOOKS_ENABLED:'true'}),true);
  assert.equal(webhookDispatchEnabled({NODE_ENV:'test',LOCAL_PREVIEW_MODE:'true',OUTBOUND_WEBHOOKS_ENABLED:'true'}),false);
});
test('strict webhook settings reject client tenant IDs and unsupported events',async t=>{
  const f=fixture(t);
  for(const body of [{url:'https://a.example.invalid',events:WEBHOOK_EVENTS,ownerId:'b'},
    {url:'https://a.example.invalid',events:['call.completed']},{url:'https://a.example.invalid',events:['lead.created','lead.created']}])await assert.rejects(()=>f.service.save('a',body),{statusCode:400});
  assert.equal(f.service.getConfiguration('a').webhook,null);
});
test('background worker handles store failure outside requests and stops scheduling after close',async t=>{
  const f=fixture(t);let errors=0;f.database.prepare("DROP TABLE webhookDeliveries").run();
  const stop=f.service.start({intervalMs:5,onError:code=>{assert.equal(code,'WEBHOOK_WORKER_UNAVAILABLE');errors++;}});
  await new Promise(resolve=>setTimeout(resolve,30));stop();const stoppedAt=errors;assert.ok(errors>0);
  await new Promise(resolve=>setTimeout(resolve,20));assert.equal(errors,stoppedAt);
});

async function httpFixture(t) {
  const f=fixture(t),app=express();app.use(express.json());process.env.JWT_SECRET=SYNTHETIC_JWT;
  const sessions=createAuthSessionService(f.database,{environment:{NODE_ENV:'test',JWT_SECRET:SYNTHETIC_JWT}});
  const tokens={};for(const id of ['a','b'])tokens[id]=sessions.create(f.database.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
  const authenticate=roles=>requireAuth(roles,{database:f.database,sessionService:sessions});
  const gate=(req,res,next)=>f.database.prepare('SELECT planStatus FROM users WHERE id=?').get(req.tenantOwnerId)?.planStatus==='active'?next():res.status(403).json({error:'Operator access required'});
  installOwnerIntegrationRoutes(app,{service:f.service,ownerQuery:f.ownerQuery,requireAuth:authenticate,requireOperatorAccess:gate,
    asyncHandler:handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next)});
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message}));
  const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(()=>new Promise(resolve=>server.close(resolve)));const origin='http://127.0.0.1:'+server.address().port;
  const request=(route,{token=tokens.a,method='GET',body}={})=>fetch(origin+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  return {...f,tokens,request,sessions};
}
test('real authenticated HTTP downloads reject anonymous/forged sessions and isolate every CSV',async t=>{
  const f=await httpFixture(t);f.lead('a');f.lead('b',{name:'OTHER_TENANT_NAME'});f.quote('a');f.quote('b');f.booking('a');f.booking('b');
  for(const kind of ['leads','quote-requests','bookings']) {
    const response=await f.request('/api/exports/'+kind+'?ownerId=b');assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/text\/csv/);assert.match(response.headers.get('content-disposition'),/attachment/);
    assert.equal(response.headers.get('cache-control'),'no-store');assert.doesNotMatch(await response.text(),/OTHER_TENANT_NAME/);
    assert.equal((await f.request('/api/exports/'+kind,{token:null})).status,401);
  }
  const forged=jwt.sign({ownerId:'b',tenantOwnerId:'b',role:'owner'},SYNTHETIC_JWT);
  assert.equal((await f.request('/api/exports/leads',{token:forged})).status,401);
});
test('real authenticated settings expose no keys on GET and cannot mutate another tenant',async t=>{
  const f=await httpFixture(t);
  const response=await f.request('/api/integrations/webhook',{method:'PUT',body:{url:'https://a.example.invalid/hooks',events:WEBHOOK_EVENTS}});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');const saved=await response.json();assert.match(saved.signingSecret,/^[a-f0-9]{64}$/);
  const own=await (await f.request('/api/integrations/webhook?ownerId=b')).json();assert.equal(own.signingSecret,undefined);assert.equal(own.webhook.url,'https://a.example.invalid/hooks');
  const other=await (await f.request('/api/integrations/webhook',{token:f.tokens.b})).json();assert.equal(other.webhook,null);
  const invalid=await f.request('/api/integrations/webhook',{method:'PUT',body:{url:'https://b.example.invalid',events:WEBHOOK_EVENTS,ownerId:'b'}});assert.equal(invalid.status,400);
  await f.request('/api/integrations/webhook',{token:f.tokens.b,method:'DELETE'});assert.ok(f.service.getConfiguration('a').webhook);
});
test('owners retain CSV access and can remove a webhook after account cancellation, but cannot add one',async t=>{
  const f=await httpFixture(t);await f.save();f.lead();f.database.prepare("UPDATE users SET planStatus='canceled' WHERE id=?").run('a');
  assert.equal((await f.request('/api/exports/leads')).status,200);
  assert.equal((await f.request('/api/integrations/webhook',{method:'PUT',body:{url:'https://a.example.invalid',events:WEBHOOK_EVENTS}})).status,403);
  assert.equal((await f.request('/api/integrations/webhook',{method:'DELETE'})).status,200);
});

test('real HTTPS receiver verifies signed POSTs and accepts a persisted retry after 503',async t=>{
  const https=await import('node:https');
  const {cert,key}=syntheticLocalTls();
  let secret,received=[];
  const server=https.createServer({cert,key},(req,res)=>{
    let body='';req.setEncoding('utf8');req.on('data',chunk=>body+=chunk);req.on('end',()=>{
      const signature='v1='+createHmac('sha256',secret).update(req.headers['x-otc-timestamp']+'.'+req.headers['x-otc-event-id']+'.'+body).digest('hex');
      const valid=req.method==='POST'&&signature===req.headers['x-otc-signature'];
      received.push({body,valid});res.writeHead(!valid?401:received.length===1?503:204);res.end();
    });
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=new URL('https://localhost:'+server.address().port+'/hooks');
  const f=fixture(t,{deliver:(destination,request)=>postWebhook(destination,{...request,
    request:(url,options,callback)=>https.request(url,{...options,ca:cert},callback)})});
  secret=(await f.save()).signingSecret;
  const localService=createOutboundWebhookService({...f.serviceOptions,resolveDestination:async()=>({
    url,hostname:'localhost',address:'127.0.0.1',family:4
  })});
  f.lead();await localService.dispatchOnce();assert.equal(f.rows('a')[0].status,'PENDING');
  f.advance(60_000);await localService.dispatchOnce();
  assert.equal(f.rows('a')[0].status,'DELIVERED');assert.equal(received.length,2);
  assert.equal(received.every(request=>request.valid),true);assert.equal(received[0].body,received[1].body);
});

test('event selection changes preserve the signing secret while invalidating older queue entries',async t=>{
  const f=fixture(t),saved=await f.save();f.lead();
  const old=f.database.prepare('SELECT * FROM webhookEndpoints WHERE ownerId=?').get('a');
  const changed=await f.service.save('a',{url:saved.webhook.url,events:['quote.requested']});
  assert.equal(changed.signingSecret,undefined);
  const current=f.database.prepare('SELECT * FROM webhookEndpoints WHERE ownerId=?').get('a');
  assert.notEqual(current.version,old.version);assert.equal(f.rows('a')[0].status,'CANCELED');
  f.quote();await f.service.dispatchOnce();const request=f.calls[0].request;
  assert.equal(request.headers['X-OTC-Signature'],signWebhook(saved.signingSecret,request.headers['X-OTC-Timestamp'],request.headers['X-OTC-Event-ID'],request.body));
});
for(const action of ['platform disabled','account canceled'])test(action+' during DNS pauses the leased event without an external POST',async t=>{
  let release,started;const begun=new Promise(resolve=>{started=resolve;});
  const f=fixture(t);await f.save();f.lead();
  const service=createOutboundWebhookService({...f.serviceOptions,resolveDestination:async url=>{
    started();await new Promise(resolve=>{release=resolve;});return resolveWebhookDestination(url,{lookup:publicLookup});
  }});
  const pending=service.dispatchOnce();await begun;
  if(action==='platform disabled')f.disable();else f.database.prepare("UPDATE users SET planStatus='canceled' WHERE id=?").run('a');
  release();await pending;assert.equal(f.calls.length,0);assert.equal(f.rows('a')[0].status,'PENDING');assert.equal(f.rows('a')[0].attemptCount,0);
});
test('migration remains idempotent and does not replay records created before webhook registration',async t=>{
  const f=fixture(t);f.lead();f.quote();f.booking();migrateDatabase(f.database);migrateDatabase(f.database);
  await f.save();assert.equal(f.rows('a').length,0);f.lead();assert.equal(f.rows('a').length,1);
  assert.deepEqual(f.database.prepare('PRAGMA foreign_key_check').all(),[]);
});

test('a sustained backlog from the first worker batch cannot starve later owners',async t=>{
  const f=fixture(t),timestamp=new Date(AT).toISOString();
  const owners=[...Array.from({length:16},(_,i)=>'busy-'+String(i).padStart(2,'0')),'z-later'];
  for(const ownerId of owners) {
    f.database.prepare(`INSERT INTO users
      (id,email,passwordHash,firstName,businessName,plan,planStatus,role,createdAt)
      VALUES (?,?,'SYNTHETIC_HASH','Owner','Synthetic business','Operator','pending_payment','owner',?)`)
      .run(ownerId,ownerId+'@example.invalid',timestamp);
    f.database.prepare(`INSERT INTO billingAccounts
      (ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES (?,?,?,?,?)`)
      .run(ownerId,'cus_SYNTHETIC_'+ownerId,timestamp,timestamp,timestamp);
    f.database.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(ownerId);
    await f.save(ownerId);f.lead(ownerId);f.lead(ownerId);
  }
  assert.equal((await f.service.dispatchOnce()).processed,16);
  assert.equal(f.rows('z-later').every(row=>row.status==='PENDING'),true);
  assert.equal(f.rows('busy-00').some(row=>row.status==='PENDING'),true);
  await f.service.dispatchOnce();
  assert.equal(f.rows('z-later').filter(row=>row.status==='DELIVERED').length,1);
  assert.equal(f.calls.some(call=>call.destination.hostname==='z-later.example.invalid'),true);
  assert.equal(f.rows('busy-00').filter(row=>row.status==='DELIVERED').length,2);
});
