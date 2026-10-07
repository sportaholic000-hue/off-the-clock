import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';
import {migrateDatabase} from '../server/src/migrations.js';

test('D02: notification outbox mirrors email acceptance/failure without a duplicate historical resend',async t=>{
  const f=fixture(t),c=f.context();await f.voice(c).tool('flagUrgent',{reason:'complaint',summary:'[SYNTHETIC] callback'});
  let sends=0;const worker=createOwnerAlertService({database:f.db,ownerQuery:f.ownerQuery,clock:()=>Date.parse(at),ready:()=>true,environment:{EMAIL_FROM:'synthetic@example.invalid'},send:async()=>({accepted:true,id:'SYNTHETIC-'+(++sends)})});await worker.dispatchOnce();const alert=f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='voice.urgent_flagged'").get(c.ownerId);
  assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(c.ownerId,alert.aggregateId).status,'ACCEPTED');assert.equal(alert.status,'ACCEPTED');f.db.prepare("UPDATE outboxEvents SET status='PENDING' WHERE ownerId=? AND id=?").run(c.ownerId,alert.aggregateId);migrateDatabase(f.db);await worker.dispatchOnce();assert.equal(sends,2);assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(c.ownerId,alert.aggregateId).status,'ACCEPTED');
});
test('D02: quote-review and preference outboxes preserve failure and acceptance state by tenant',async t=>{
  const f=fixture(t),c=f.context();const review=await f.voice(c).tool('logQuoteRequest',{description:'[SYNTHETIC] Quote review'});
  const request=f.db.prepare('SELECT id FROM quoteRequests WHERE ownerId=?').get(c.ownerId);
  f.db.prepare("UPDATE ownerAlerts SET status='FAILED' WHERE ownerId=? AND aggregateId=? AND eventType='quote.requested'").run(c.ownerId,request.id);
  assert.equal(f.db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='voice.quote_request_logged'").get(c.ownerId).status,'FAILED');
  const lead=f.lead(c)[0];f.db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES('SYNTHETIC-preference-intent',?,'SYNTHETIC','lead',?,'SYNTHETIC','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-10-10T00:00:00Z',?)").run(c.ownerId,lead.id,at);
  f.db.prepare("INSERT INTO bookingPreferences(id,ownerId,intentId,preferredWindowsJson,customerJson,locationJson,status,createdAt,updatedAt) VALUES('SYNTHETIC-preference',?,'SYNTHETIC-preference-intent','[]','{}','{}','REQUESTED',?,?)").run(c.ownerId,at,at);
  f.db.prepare("INSERT INTO outboxEvents(id,ownerId,eventType,aggregateId,payloadJson,createdAt,updatedAt) VALUES('SYNTHETIC-preference-outbox',?,'booking.preference_requested','SYNTHETIC-preference','{}',?,?)").run(c.ownerId,at,at);
  f.db.prepare("UPDATE ownerAlerts SET status='ACCEPTED' WHERE ownerId=? AND eventType='booking.preference_requested'").run('synthetic-b');assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(c.ownerId,'SYNTHETIC-preference-outbox').status,'PENDING');
  f.db.prepare("UPDATE ownerAlerts SET status='ACCEPTED' WHERE ownerId=? AND eventType='booking.preference_requested'").run(c.ownerId);assert.equal(f.db.prepare('SELECT status FROM outboxEvents WHERE ownerId=? AND id=?').get(c.ownerId,'SYNTHETIC-preference-outbox').status,'ACCEPTED');
});
test('D20: older unresolved webhooks remain discoverable, paginated, safe and tenant-bound',async t=>{
  const f=fixture(t),w=f.webhook();await w.save('synthetic-a',{url:'https://synthetic.example.invalid/hook',events:['lead.created']});const version=f.db.prepare('SELECT version FROM webhookEndpoints WHERE ownerId=?').get('synthetic-a').version;
  for(let n=0;n<105;n++)f.db.prepare("INSERT INTO webhookDeliveries(id,ownerId,eventType,aggregateId,endpointVersion,payloadJson,status,nextAttemptAt,createdAt,updatedAt) VALUES(?,?,'lead.created',?,?,'{}',?,0,?,?)").run('SYNTHETIC-'+String(n).padStart(3,'0'),'synthetic-a','SYNTHETIC-lead-'+n,version,n===0?'FAILED':'PENDING',new Date(Date.parse(at)+n*1000).toISOString(),at);
  assert.equal(w.getConfiguration('synthetic-a').deliveries.length,20);const first=w.listDeliveries('synthetic-a'),last=w.listDeliveries('synthetic-a',{offset:'100'});assert.equal(first.total,105);assert.equal(first.deliveries.length,50);assert.equal(first.nextOffset,50);assert.equal(last.deliveries.length,5);assert.equal(last.nextOffset,null);assert.ok(last.deliveries.some(d=>d.id==='SYNTHETIC-000'&&d.status==='FAILED'));assert.equal(w.listDeliveries('synthetic-b').total,0);assert.doesNotMatch(JSON.stringify(first),/payloadJson|credentials|secret/);
  for(const query of [{status:'bad'},{offset:'-1'},{offset:['0']},{offset:'1e1'}])assert.throws(()=>w.listDeliveries('synthetic-a',query));
});
