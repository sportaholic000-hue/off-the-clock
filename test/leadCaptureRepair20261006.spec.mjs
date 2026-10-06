import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture,address,at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {csvRows} from '../server/src/integrationData.js';
import {installOutboundWebhookSchema} from '../server/src/outboundWebhookSchema.js';
import {leadFollowUpView} from '../server/src/leadFollowUp.js';
import {storedQuoteView} from '../server/src/ownerRecordViews.js';

const detail=row=>JSON.parse(row.collectedInputsJson),name='[SYNTHETIC] Alex',email='followup@example.invalid';
const count=(f,table)=>f.db.prepare('SELECT COUNT(*) n FROM '+table).get().n;

test('D01/D09: usable nameless request retains notes/description in owner and staff views',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c),notes='[SYNTHETIC] Gate fell down; call after 5pm.';
  const result=await v.tool('captureLead',{notes,description:'[SYNTHETIC] Gate repair'});
  assert.equal(result.status,'captured_address_required');const row=f.lead(c)[0];assert.equal(row.customerName,null);
  assert.equal(detail(row).notes,notes);assert.equal(row.describedService,'[SYNTHETIC] Gate repair');
  for(const role of ['owner','staff']){const view=f.service.detail({ownerId:c.ownerId,id:c.callSid,role}).leads[0];assert.equal(view.notes,notes);assert.equal(view.contact.phone,c.from);assert.equal(view.describedService,row.describedService);assert.equal(view.internal!==undefined,role==='owner');}
  const other=f.context();await f.voice(other).tool('captureLead',{notes});assert.equal(f.lead(other)[0].describedService,notes);
});

test('D09: omitted name is valid, but supplied invalid contact/oversized fields remain rejected',async t=>{
  const f=fixture(t),v=f.voice(f.context());
  for(const args of [{name:''},{email:'invalid'},{notes:'x'.repeat(1001)},{inquiryNumber:0},{inquiryNumber:101},{inquiryNumber:'2'},{ownerId:'synthetic-b'}])await assert.rejects(v.tool('captureLead',args));
  assert.equal(count(f,'leads'),0);assert.equal((await v.tool('captureLead',{})).status,'captured_address_required');
});

test('D11/D12/D13: corrections retain inquiry, omitted fields and owner disposition; replay is immutable',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c),args={name:'[SYNTHETIC] Alxe',email,address,notes:'[SYNTHETIC] Repair gate'};
  const original=await v.tool('captureLead',args,'first');const id=f.lead(c)[0].id;
  f.db.prepare("UPDATE leads SET status='DISMISSED' WHERE ownerId=? AND id=?").run(c.ownerId,id);
  f.advance(1000);const corrected=await f.voice(c).tool('captureLead',{name,email:'corrected@example.invalid',leadHandle:original.leadHandle},'correction');
  assert.equal(corrected.leadHandle,original.leadHandle);assert.equal(f.lead(c).length,1);
  let row=f.lead(c)[0];assert.equal(row.id,id);assert.equal(row.status,'DISMISSED');assert.equal(detail(row).contact.email,'corrected@example.invalid');assert.deepEqual(detail(row).address,address);
  assert.equal(detail(row).captureHistory[0].contact.email,email);assert.equal(detail(row).captureHistory.length,2);
  await f.voice(c).tool('captureLead',{name},'new-provider-retry');row=f.lead(c)[0];assert.equal(row.status,'DISMISSED');assert.equal(detail(row).captureHistory.length,2);
  assert.deepEqual(await f.voice(c).tool('captureLead',args,'first'),original);
  await assert.rejects(v.tool('captureLead',{...args,name},'first'),e=>e.code==='IDEMPOTENCY_CONFLICT');
  assert.equal(JSON.parse(f.db.prepare('SELECT notesJson FROM customers WHERE ownerId=?').get(c.ownerId).notesJson).email,'corrected@example.invalid');
});

test('D13: new call retains known customer email/address without inventing the new job site',async t=>{
  const f=fixture(t),c=f.context();await f.voice(c).tool('captureLead',{name,email,address});
  const returning=f.context();await f.voice(returning).tool('captureLead',{notes:'[SYNTHETIC] A different repair'});
  const customer=f.db.prepare('SELECT * FROM customers WHERE ownerId=?').get(c.ownerId);
  assert.equal(JSON.parse(customer.notesJson).email,email);assert.deepEqual(JSON.parse(customer.address),address);
  assert.equal(detail(f.lead(returning)[0]).contact.email,email);assert.equal(detail(f.lead(returning)[0]).address,null);assert.equal(f.lead(returning).length,1);
});

test('D11: separate inquiry numbers preserve distinct jobs; explicit handle correction touches only its inquiry',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c);
  const one=await v.tool('captureLead',{name,email,description:'[SYNTHETIC] Gate repair',inquiryNumber:1});
  await v.tool('captureLead',{name,email,description:'[SYNTHETIC] Paint shed',inquiryNumber:2,address});
  await v.tool('captureLead',{leadHandle:one.leadHandle,notes:'[SYNTHETIC] Gate callback after 5'});
  const rows=f.lead(c);assert.equal(rows.length,2);assert.equal(rows[0].describedService,'[SYNTHETIC] Gate repair');assert.equal(rows[1].describedService,'[SYNTHETIC] Paint shed');assert.equal(detail(rows[1]).notes,null);
  const next=f.context();await f.voice(next).tool('captureLead',{description:'[SYNTHETIC] Gate repair'});assert.equal(count(f,'leads'),3);
});

test('D03/D10: all schema-valid urgency reasons persist without summary, survive capture and do not claim notification',async t=>{
  const f=fixture(t);
  for(const reason of ['active_leak','flooding','safety','complaint']){
    const c=f.context(),v=f.voice(c);const result=await v.tool('flagUrgent',{reason},'urgent-'+reason);
    assert.equal(result.status,'flagged');assert.match(result.message,/notification has not been confirmed/);
    assert.equal(f.db.prepare('SELECT urgency FROM calls WHERE ownerId=? AND id=?').get(c.ownerId,c.callSid).urgency,reason);
    await v.tool('captureLead',{name,email});let row=f.lead(c)[0];assert.equal(f.lead(c).length,1);assert.equal(detail(row).urgency.reason,reason);assert.equal(detail(row).urgency.summary,null);
    assert.equal(row.type,reason==='complaint'?'COMPLAINT':'voice_lead');const history=detail(row).captureHistory.length;
    f.advance(1000);await f.voice(c).tool('flagUrgent',{reason},'repeat-'+reason);row=f.lead(c)[0];assert.equal(detail(row).captureHistory.length,history);
    assert.equal(f.service.detail({ownerId:c.ownerId,id:c.callSid,role:'staff'}).leads[0].urgency.reason,reason);
  }
  assert.equal(count(f,'events'),4);assert.equal(count(f,'outboxEvents'),4);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE status<>'PENDING'").get().n,0);
});

test('D03: target urgency belongs to its inquiry and preserves summary/complaint classification',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c);await v.tool('captureLead',{name,inquiryNumber:1});const two=await v.tool('captureLead',{name,inquiryNumber:2});
  await v.tool('flagUrgent',{reason:'complaint',summary:'[SYNTHETIC] Previous repair failed.',leadHandle:two.leadHandle});
  const rows=f.lead(c);assert.equal(detail(rows[0]).urgency,null);assert.equal(rows[1].type,'COMPLAINT');assert.equal(detail(rows[1]).urgency.summary,'[SYNTHETIC] Previous repair failed.');
});

test('capture and urgency database failures roll back without a successful acknowledgement',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c);
  f.db.exec("CREATE TRIGGER synthetic_fail_lead BEFORE INSERT ON leads BEGIN SELECT RAISE(ABORT,'[SYNTHETIC] DB failure'); END");
  await assert.rejects(v.tool('captureLead',{name,email},'failure'));assert.equal(count(f,'customers'),0);assert.equal(count(f,'leads'),0);f.db.exec('DROP TRIGGER synthetic_fail_lead');
  f.db.exec("CREATE TRIGGER synthetic_fail_outbox BEFORE INSERT ON outboxEvents BEGIN SELECT RAISE(ABORT,'[SYNTHETIC] DB failure'); END");
  await assert.rejects(v.tool('flagUrgent',{reason:'safety'}));assert.equal(count(f,'leads'),0);assert.equal(count(f,'events'),0);assert.equal(f.db.prepare('SELECT urgency FROM calls WHERE ownerId=? AND id=?').get(c.ownerId,c.callSid).urgency,null);
  f.db.exec('DROP TRIGGER synthetic_fail_outbox');await f.voice(c).tool('captureLead',{name,email},'failure');assert.equal(count(f,'leads'),1);
});

test('capture persisted before handle failure recovers the same inquiry once',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c);f.db.exec("CREATE TRIGGER synthetic_fail_handle BEFORE INSERT ON voiceOpaqueHandles BEGIN SELECT RAISE(ABORT,'[SYNTHETIC] lost response'); END");
  await assert.rejects(v.tool('captureLead',{name,email},'lost-ack'));const id=f.lead(c)[0].id;f.db.exec('DROP TRIGGER synthetic_fail_handle');
  await f.voice(c).tool('captureLead',{name,email},'lost-ack');assert.equal(f.lead(c)[0].id,id);assert.equal(f.lead(c).length,1);assert.equal(detail(f.lead(c)[0]).captureHistory.length,1);
});

test('cold process replay preserves dismissed inquiry and original contact receipt',async t=>{
  const directory=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-lead-restart-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const filename=path.join(directory,'synthetic.sqlite'),f=fixture(t,filename),c=f.context(),args={name,email};
  const response=await f.voice(c).tool('captureLead',args,'restart');const id=f.lead(c)[0].id;f.db.prepare("UPDATE leads SET status='DISMISSED' WHERE ownerId=? AND id=?").run(c.ownerId,id);
  const code=`import Database from 'better-sqlite3';import {createVoiceToolRuntime} from './server/src/voice/voiceToolRuntime.js';import {createVoiceToolDispatcher} from './server/src/voice/toolDispatcher.js';const db=new Database(process.argv[1]),context=JSON.parse(process.argv[2]),args=JSON.parse(process.argv[3]);const r=createVoiceToolRuntime({database:db,callContext:context,handleSecret:process.argv[4],clock:()=>new Date('${at}')});const d=createVoiceToolDispatcher({handlers:r.handlers,callContext:context,idempotencyStore:r.idempotencyStore});console.log(JSON.stringify(await d.dispatch({name:'captureLead',args,toolCallId:'restart'})));db.close();`;
  const child=spawnSync(process.execPath,['--input-type=module','-e',code,filename,JSON.stringify(c),JSON.stringify(args),secret],{encoding:'utf8',env:{...process.env,NODE_NO_WARNINGS:'1'}});
  assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),response);assert.equal(f.lead(c).length,1);assert.equal(f.lead(c)[0].status,'DISMISSED');
});

test('wrong tenant/call, expired and deleted handles cannot correct or flag another inquiry',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c),result=await v.tool('captureLead',{name,email});
  for(const foreign of [f.context('synthetic-b'),f.context()]){
    await assert.rejects(f.voice(foreign).tool('captureLead',{leadHandle:result.leadHandle,name:'[SYNTHETIC] wrong'}));
    await assert.rejects(f.voice(foreign).tool('flagUrgent',{reason:'safety',leadHandle:result.leadHandle}));
    await assert.rejects(f.voice(foreign).tool('logQuoteRequest',{description:'[SYNTHETIC] wrong',leadHandle:result.leadHandle}));
  }
  f.advance(3*60*60*1000);await assert.rejects(v.tool('captureLead',{leadHandle:result.leadHandle,name}));assert.equal(f.lead(c)[0].customerName,name);
  const fresh=await v.tool('captureLead',{name});f.db.prepare('DELETE FROM leads WHERE ownerId=? AND callId=?').run(c.ownerId,c.callSid);await assert.rejects(v.tool('captureLead',{leadHandle:fresh.leadHandle,name}));
  assert.equal(count(f,'quoteRequests'),0);assert.equal(count(f,'events'),0);
});

test('D17: fresh and upgraded producers preserve voice email, CSV and historical deliveries',async t=>{
  const f=fixture(t);await f.webhook().save('synthetic-a',{url:'https://synthetic.example.invalid/hooks',events:['lead.created','quote.requested']});
  f.db.exec("DROP TRIGGER webhook_leads_insert;CREATE TRIGGER webhook_leads_insert AFTER INSERT ON leads BEGIN INSERT OR IGNORE INTO webhookDeliveries(id,ownerId,endpointVersion,eventType,aggregateId,payloadJson,status,attemptCount,nextAttemptAt,createdAt,updatedAt) SELECT lower(hex(randomblob(16))),NEW.ownerId,version,'lead.created',NEW.id,'{\"email\":null}','PENDING',0,0,NEW.createdAt,NEW.createdAt FROM webhookEndpoints WHERE ownerId=NEW.ownerId;END;");
  const old=f.context();await f.voice(old).tool('captureLead',{name,email});const historic=f.db.prepare('SELECT * FROM webhookDeliveries WHERE ownerId=?').get('synthetic-a');f.db.prepare("UPDATE webhookDeliveries SET status='DELIVERED' WHERE ownerId=? AND id=?").run('synthetic-a',historic.id);
  installOutboundWebhookSchema(f.db);const c=f.context();f.db.prepare("INSERT INTO leads(id,ownerId,callId,customerName,callerNumber,collectedInputsJson,type,status,createdAt) VALUES('synthetic-direct-lead',?,?,?,?,?,'voice_lead','CAPTURED',?)").run(c.ownerId,c.callSid,name,c.from,JSON.stringify({voiceVersion:1,contact:{name,email,phone:c.from}}),at);
  const payload=JSON.parse(f.db.prepare('SELECT payloadJson FROM webhookDeliveries WHERE ownerId=? AND aggregateId=?').get(c.ownerId,f.lead(c)[0].id).payloadJson);assert.equal(payload.email,email);
  assert.match([...csvRows(f.ownerQuery,c.ownerId,'leads')].join(''),/followup@example.invalid/);assert.equal(f.db.prepare('SELECT payloadJson FROM webhookDeliveries WHERE ownerId=? AND id=?').get('synthetic-a',historic.id).payloadJson,historic.payloadJson);
});

test('D17: corrections refresh only an unattempted pending snapshot, not a historical attempt',async t=>{
  const f=fixture(t);await f.webhook().save('synthetic-a',{url:'https://synthetic.example.invalid/hooks',events:['lead.created']});const c=f.context(),v=f.voice(c);await v.tool('captureLead',{name,email});
  await v.tool('captureLead',{email:'corrected@example.invalid'});let row=f.db.prepare('SELECT * FROM webhookDeliveries WHERE ownerId=?').get(c.ownerId);assert.equal(JSON.parse(row.payloadJson).email,'corrected@example.invalid');
  f.db.prepare('UPDATE webhookDeliveries SET attemptCount=1 WHERE ownerId=? AND id=?').run(c.ownerId,row.id);const snapshot=row.payloadJson;
  await v.tool('captureLead',{email:'latest@example.invalid'});row=f.db.prepare('SELECT * FROM webhookDeliveries WHERE ownerId=?').get(c.ownerId);assert.equal(row.payloadJson,snapshot);assert.equal(detail(f.lead(c)[0]).contact.email,'latest@example.invalid');
});

test('D18: standalone quote review creates actionable phone lead and linked export/webhook; distinct descriptions stay distinct',async t=>{
  const f=fixture(t);await f.webhook().save('synthetic-a',{url:'https://synthetic.example.invalid/hooks',events:['lead.created','quote.requested']});const c=f.context(),v=f.voice(c),args={description:'[SYNTHETIC] Repair gate'};
  const result=await v.tool('logQuoteRequest',args,'review');assert.equal(result.status,'logged');assert.equal(f.lead(c).length,1);assert.equal(f.lead(c)[0].status,'NEEDS REVIEW');assert.equal(f.service.detail({ownerId:c.ownerId,id:c.callSid,role:'staff'}).leads[0].contact.phone,c.from);
  await f.voice(c).tool('logQuoteRequest',args,'review-again');assert.equal(count(f,'quoteRequests'),1);assert.equal(f.lead(c).length,1);
  const payload=JSON.parse(f.db.prepare("SELECT payloadJson FROM webhookDeliveries WHERE ownerId=? AND eventType='quote.requested'").get(c.ownerId).payloadJson);assert.equal(payload.customer.phone,c.from);assert.equal(payload.leadId,f.lead(c)[0].id);
  assert.match([...csvRows(f.ownerQuery,c.ownerId,'quote-requests')].join(''),/19025550100/);
  await v.tool('captureLead',{name,email});assert.equal(f.lead(c).length,1);assert.equal(f.lead(c)[0].status,'NEEDS REVIEW');
  await v.tool('logQuoteRequest',{description:'[SYNTHETIC] Paint shed'});assert.equal(f.lead(c).length,2);assert.equal(count(f,'quoteRequests'),2);
});

test('D18: bound quote-review exports preserve saved name/email and dismissed disposition',async t=>{
  const f=fixture(t);await f.webhook().save('synthetic-a',{url:'https://synthetic.example.invalid/hooks',events:['quote.requested']});const c=f.context(),v=f.voice(c),lead=await v.tool('captureLead',{name,email});
  f.db.prepare("UPDATE leads SET status='DISMISSED' WHERE ownerId=? AND callId=?").run(c.ownerId,c.callSid);
  await v.tool('logQuoteRequest',{description:'[SYNTHETIC] Gate quote',leadHandle:lead.leadHandle});assert.equal(f.lead(c).length,1);assert.equal(f.lead(c)[0].status,'DISMISSED');
  assert.match([...csvRows(f.ownerQuery,c.ownerId,'quote-requests')].join(''),/followup@example.invalid/);assert.equal(JSON.parse(f.db.prepare("SELECT payloadJson FROM webhookDeliveries WHERE ownerId=? AND eventType='quote.requested'").get(c.ownerId).payloadJson).customer.email,email);
});

test('D18: quote-review storage failure leaves no partial follow-up or success; retry recovers once',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c),args={description:'[SYNTHETIC] Quote repair'};
  f.db.exec("CREATE TRIGGER synthetic_fail_request BEFORE INSERT ON quoteRequests BEGIN SELECT RAISE(ABORT,'[SYNTHETIC] DB failure'); END");await assert.rejects(v.tool('logQuoteRequest',args,'failed-review'));
  assert.equal(count(f,'leads'),0);assert.equal(count(f,'customers'),0);assert.equal(count(f,'outboxEvents'),0);f.db.exec('DROP TRIGGER synthetic_fail_request');
  await f.voice(c).tool('logQuoteRequest',args,'failed-review');assert.equal(count(f,'leads'),1);assert.equal(count(f,'quoteRequests'),1);
});

test('D22/D23: preferred contact is projected with provenance while stored instant amounts and receipts remain unchanged',async t=>{
  const f=fixture(t),c=f.context();await f.voice(c).tool('captureLead',{name,email,address});const row=f.lead(c)[0];
  f.db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES('synthetic-intent',?,'SYNTHETIC','lead',?,'synthetic-service','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-10-10T00:00:00Z',?)").run(c.ownerId,row.id,at);
  const customer=JSON.stringify({name:'[SYNTHETIC] Corrected Alex',email:'preferred@example.invalid',phone:'+19025550199',cost:'SECRET_COST'}),location=JSON.stringify({addressLine1:'[SYNTHETIC] Corrected site',city:'Synthetic City',privateRate:'SECRET_RATE'});
  f.db.prepare("INSERT INTO bookingPreferences(id,ownerId,intentId,preferredWindowsJson,customerJson,locationJson,status,createdAt,updatedAt) VALUES('synthetic-preference',?,'synthetic-intent','[]',?,?,'REQUESTED',?,?)").run(c.ownerId,customer,location,at,at);
  const receipt=JSON.stringify({customerResult:{resultType:'INSTANT_QUOTE',lowEstimate:221.23,highEstimate:221.23},originalSubmission:{contact:{email},location:address,context:'[SYNTHETIC] After 5'},privateCost:'SECRET_COST'});
  f.db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES('synthetic-instant',?,? ,?,'INSTANT',?)").run(c.ownerId,c.callSid,receipt,at);
  for(const role of ['owner','staff']){const lead=leadFollowUpView(f.ownerQuery,row,role),call=f.service.detail({ownerId:c.ownerId,id:c.callSid,role});assert.equal(lead.contact.email,'preferred@example.invalid');assert.equal(lead.customerName,'[SYNTHETIC] Corrected Alex');assert.equal(lead.location.addressLine1,'[SYNTHETIC] Corrected site');assert.equal(lead.submittedContact.email,email);assert.equal(lead.followUpSource.id,'synthetic-preference');assert.equal(call.bookingRequests[0].customer.email,'preferred@example.invalid');assert.equal(call.quotes[0].contact.email,email);assert.equal(call.quotes[0].result.lowEstimate,221.23);if(role==='staff')assert.doesNotMatch(JSON.stringify(call),/SECRET_COST|SECRET_RATE|internal/);}
  assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=?').get(c.ownerId).resultJson,receipt);assert.equal(f.db.prepare('SELECT customerJson FROM bookingPreferences WHERE ownerId=?').get(c.ownerId).customerJson,customer);assert.equal(f.lead(c)[0].collectedInputsJson,row.collectedInputsJson);
  assert.equal(storedQuoteView({resultJson:receipt},'staff').contact.email,email);
});

test('D11/D18: review binds matching capture and retry preserves newer corrections and historical attempts',async t=>{
  const f=fixture(t);await f.webhook().save('synthetic-a',{url:'https://synthetic.example.invalid/hooks',events:['quote.requested']});
  const c=f.context(),v=f.voice(c),description='[SYNTHETIC] Repair gate';const captured=await v.tool('captureLead',{name,email,description});const id=f.lead(c)[0].id;
  await v.tool('logQuoteRequest',{description},'initial-review');assert.equal(f.lead(c).length,1);assert.equal(f.lead(c)[0].id,id);
  const delivery=f.db.prepare("SELECT * FROM webhookDeliveries WHERE ownerId=? AND eventType='quote.requested'").get(c.ownerId);f.db.prepare('UPDATE webhookDeliveries SET attemptCount=1 WHERE ownerId=? AND id=?').run(c.ownerId,delivery.id);
  f.db.prepare("UPDATE leads SET status='DISMISSED' WHERE ownerId=? AND id=?").run(c.ownerId,id);f.advance(1000);
  await v.tool('captureLead',{leadHandle:captured.leadHandle,description:'[SYNTHETIC] Replace gate',email:'corrected@example.invalid'});
  await f.voice(c).tool('logQuoteRequest',{description},'new-provider-review-retry');
  assert.equal(f.lead(c).length,1);assert.equal(f.lead(c)[0].describedService,'[SYNTHETIC] Replace gate');assert.equal(f.lead(c)[0].status,'DISMISSED');
  assert.equal(f.db.prepare('SELECT describedService FROM quoteRequests WHERE ownerId=?').get(c.ownerId).describedService,description);
  assert.equal(f.db.prepare('SELECT payloadJson FROM webhookDeliveries WHERE ownerId=? AND id=?').get(c.ownerId,delivery.id).payloadJson,delivery.payloadJson);
});

test('D11/D18: standalone review retry cannot undo a later description correction',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c),description='[SYNTHETIC] Repair gate';await v.tool('logQuoteRequest',{description});
  await v.tool('captureLead',{description:'[SYNTHETIC] Replace gate'});await f.voice(c).tool('logQuoteRequest',{description});
  assert.equal(f.lead(c).length,1);assert.equal(f.lead(c)[0].describedService,'[SYNTHETIC] Replace gate');
});

test('D22: preferred address is coherent and later explicit voice correction takes precedence with provenance',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c);await v.tool('captureLead',{name,email,address});const row=f.lead(c)[0];f.advance(1000);
  const prefAt='2026-10-06T12:00:01.000Z';f.db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES('synthetic-intent',?,'SYNTHETIC','lead',?,'synthetic-service','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-10-10T00:00:00Z',?)").run(c.ownerId,row.id,at);
  f.db.prepare("INSERT INTO bookingPreferences(id,ownerId,intentId,preferredWindowsJson,customerJson,locationJson,status,createdAt,updatedAt) VALUES('synthetic-preference',?,'synthetic-intent','[]',?,?,'REQUESTED',?,?)").run(c.ownerId,JSON.stringify({name:'[SYNTHETIC] Preferred Alex',email:'preferred@example.invalid',phone:'+19025550199'}),JSON.stringify({addressLine1:'[SYNTHETIC] Preferred site',city:'Synthetic City'}),prefAt,prefAt);
  let view=leadFollowUpView(f.ownerQuery,row,'staff');assert.equal(view.location.line1,undefined);assert.equal(view.location.addressLine1,'[SYNTHETIC] Preferred site');assert.equal(view.submittedLocation.line1,address.line1);
  f.advance(1000);await v.tool('captureLead',{email:'latest@example.invalid'});view=leadFollowUpView(f.ownerQuery,f.lead(c)[0],'staff');
  assert.equal(view.contact.email,'latest@example.invalid');assert.equal(view.contact.phone,'+19025550199');assert.equal(view.contact.name,'[SYNTHETIC] Preferred Alex');assert.equal(view.preferredRequest.contact.email,'preferred@example.invalid');assert.equal(view.followUpSource.kind,'voice_capture');assert.equal(view.captureHistory.length,2);
});

test('D11/D12/D13: simultaneous duplicate corrections serialize and an update failure preserves prior contact',async t=>{
  const f=fixture(t),c=f.context(),v=f.voice(c);await v.tool('captureLead',{name,email,description:'[SYNTHETIC] Gate'});
  f.db.prepare("UPDATE leads SET status='DISMISSED' WHERE ownerId=? AND callId=?").run(c.ownerId,c.callSid);
  await Promise.all([v.tool('captureLead',{email:'corrected@example.invalid'},'duplicate-one'),f.voice(c).tool('captureLead',{email:'corrected@example.invalid'},'duplicate-two')]);
  let row=f.lead(c)[0];assert.equal(f.lead(c).length,1);assert.equal(row.status,'DISMISSED');assert.equal(detail(row).captureHistory.length,2);
  const before=row.collectedInputsJson,customer=f.db.prepare('SELECT notesJson FROM customers WHERE ownerId=?').get(c.ownerId).notesJson;
  f.db.exec("CREATE TRIGGER synthetic_fail_update BEFORE UPDATE ON leads BEGIN SELECT RAISE(ABORT,'[SYNTHETIC] update failure'); END");
  await assert.rejects(v.tool('captureLead',{email:'newest@example.invalid'}));row=f.lead(c)[0];assert.equal(row.collectedInputsJson,before);assert.equal(f.db.prepare('SELECT notesJson FROM customers WHERE ownerId=?').get(c.ownerId).notesJson,customer);f.db.exec('DROP TRIGGER synthetic_fail_update');
});

test('D17/D18: existing webhook worker delivers only allowlisted saved voice contact to local stub',async t=>{
  const f=fixture(t),requests=[];const worker=f.webhook({enabled:()=>true,deliver:async(_,request)=>{requests.push(JSON.parse(request.body));return 204;}});
  await worker.save('synthetic-a',{url:'https://synthetic.example.invalid/hooks',events:['lead.created','quote.requested']});const c=f.context(),v=f.voice(c),lead=await v.tool('captureLead',{name,email,description:'[SYNTHETIC] Gate quote'});
  await v.tool('logQuoteRequest',{description:'[SYNTHETIC] Gate quote',leadHandle:lead.leadHandle});await worker.dispatchOnce();await worker.dispatchOnce();
  assert.equal(requests.length,2);const text=JSON.stringify(requests);assert.match(text,/followup@example.invalid/);assert.match(text,/19025550100/);assert.doesNotMatch(text,/captureHistory|customerId|leadHandle|privateCost/);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM webhookDeliveries WHERE ownerId=? AND status='DELIVERED'").get(c.ownerId).n,2);
});

test('D22: an empty legacy preference does not replace an established display name or callback number',async t=>{
  const f=fixture(t),c=f.context();await f.voice(c).tool('captureLead',{name,email});const row=f.lead(c)[0];
  f.db.prepare('UPDATE leads SET customerName=? WHERE ownerId=? AND id=?').run('[SYNTHETIC] Established name',c.ownerId,row.id);
  f.db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES('synthetic-empty-intent',?,'SYNTHETIC_EMPTY','lead',?,'synthetic-service','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-10-10T00:00:00Z',?)").run(c.ownerId,row.id,at);
  f.db.prepare("INSERT INTO bookingPreferences(id,ownerId,intentId,preferredWindowsJson,customerJson,locationJson,status,createdAt,updatedAt) VALUES('synthetic-empty-preference',?,'synthetic-empty-intent','[]','{}','{}','REQUESTED',?,?)").run(c.ownerId,at,at);
  const view=leadFollowUpView(f.ownerQuery,f.lead(c)[0],'staff');assert.equal(view.customerName,'[SYNTHETIC] Established name');assert.equal(view.callerNumber,c.from);assert.equal(view.contact.email,email);
});
