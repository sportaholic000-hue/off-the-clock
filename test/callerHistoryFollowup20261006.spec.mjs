import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,address,at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {createOwnerCalendarService} from '../server/src/ownerCalendarService.js';

const phone='+19025550100';
function appointment(f,id,ownerId,number,start){f.db.prepare("INSERT INTO appointments(id,ownerId,customerJson,status,startAtUtc,createdAt) VALUES(?,?,?,'CONFIRMED',?,?)").run(id,ownerId,JSON.stringify({phone:number}),start,at);}
function preference(f,id,ownerId,status,date){
 f.db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES(?,?,?,'lead',?,'synthetic-service','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-12-31T00:00:00Z',?)").run(id,ownerId,id,id,at);
 f.db.prepare("INSERT INTO bookingPreferences(id,ownerId,intentId,status,preferredWindowsJson,customerJson,locationJson,createdAt,updatedAt) VALUES(?,?,?,?,?,'{}','{}',?,?)").run(id,ownerId,id,status,JSON.stringify([{date,timeOfDay:'morning'}]),at,at);
}
test('D14 caller filter precedes limit with tenant and malformed-record controls',async t=>{
 const f=fixture(t),c=f.context();appointment(f,'wanted',c.ownerId,phone,'2026-10-07T12:00:00Z');
 for(let i=0;i<30;i++)appointment(f,'unrelated-'+i,c.ownerId,'+19025550177','2026-10-08T12:00:00Z');
 appointment(f,'foreign','synthetic-b',phone,'2026-10-09T12:00:00Z');
 f.db.prepare("INSERT INTO appointments(id,ownerId,customerJson,createdAt) VALUES('malformed',?,'{',?)").run(c.ownerId,at);
 const result=await f.voice(c).tool('getCustomerContext',{});assert.equal(result.status,'found');assert.equal(result.recentAppointments.length,1);assert.match(result.recentAppointments[0],/2026-10-07/);
});
test('D15 dispatched identity and saved history preserve only safe fields and exact recorded dollars',async t=>{
 const f=fixture(t),c=f.context(),v=f.voice(c);await v.tool('captureLead',{name:'[SYNTHETIC] Alex',address,description:'[SYNTHETIC] repair gate'});
 const other=f.context('synthetic-b');await f.voice(other).tool('captureLead',{name:'FOREIGN PERSON',description:'FOREIGN REQUEST'});
 // Handwritten expected before execution: saved range $221.23–$243.35, not recalculated.
 f.db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES('saved-quote',?,?,?,'INSTANT',?)").run(c.ownerId,c.callSid,JSON.stringify({originalSubmission:{contact:{phone}},customerResult:{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:221.23,highEstimate:243.35,currency:'CAD'},privateCost:'PRIVATE_SENTINEL'}),at);
 const result=await v.tool('getCustomerContext',{});assert.equal(result.greetingName,'[SYNTHETIC] Alex');assert.equal(result.address.line1,address.line1);assert.equal(result.openLeads[0].description,'[SYNTHETIC] repair gate');assert.equal(result.recentQuotes[0].lowEstimate,221.23);assert.equal(result.recentQuotes[0].highEstimate,243.35);assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SENTINEL|FOREIGN|ownerId|callSid|lineItems/);
});
test('D16 handle credential rotation preserves one owner-phone customer and historical references',async t=>{
 const f=fixture(t),a=f.context();await f.voice(a).tool('captureLead',{name:'[SYNTHETIC] Alex',address});const id=JSON.parse(f.lead(a)[0].collectedInputsJson).customerId;
 const b=f.context(),runtime=createVoiceToolRuntime({database:f.db,callContext:b,handleSecret:secret+'ROTATED',clock:()=>new Date(at)});
 await createVoiceToolDispatcher({handlers:runtime.handlers,callContext:b,idempotencyStore:runtime.idempotencyStore}).dispatch({name:'captureLead',args:{notes:'[SYNTHETIC] second request'},toolCallId:'rotated'});
 assert.equal(JSON.parse(f.lead(b)[0].collectedInputsJson).customerId,id);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=? AND phoneE164=?').get(a.ownerId,phone).n,1);
});
test('D21 unresolved preferences survive calendar range changes until resolved',t=>{
 const f=fixture(t);preference(f,'past','synthetic-a','REQUESTED','2026-09-01');preference(f,'future','synthetic-a','REQUESTED','2026-12-01');preference(f,'resolved','synthetic-a','RESOLVED','2026-09-01');preference(f,'foreign','synthetic-b','REQUESTED','2026-09-01');
 const calendar=createOwnerCalendarService({ownerQuery:f.ownerQuery,clock:()=>new Date(at)});
 assert.deepEqual(calendar.schedule({ownerId:'synthetic-a'}).requests.map(v=>v.id).sort(),['future','past']);
 f.db.prepare("UPDATE bookingPreferences SET status='RESOLVED' WHERE ownerId=? AND id=?").run('synthetic-a','past');
 assert.deepEqual(calendar.schedule({ownerId:'synthetic-a'}).requests.map(v=>v.id),['future']);
 assert.ok(calendar.schedule({ownerId:'synthetic-a',query:{fromDate:'2026-09-01',days:'1'}}).requests.some(v=>v.id==='past'));
});

test('D14 legacy duplicate IDs preserve caller bookings; contradictory and foreign customer links are rejected',async t=>{
 const f=fixture(t),c=f.context();
 for(const [id,owner,number] of [['old','synthetic-a',phone],['duplicate','synthetic-a',phone],['other','synthetic-a','+19025550199'],['foreign','synthetic-b',phone]])f.db.prepare('INSERT INTO customers(id,ownerId,phoneE164,createdAt) VALUES(?,?,?,?)').run(id,owner,number,at);
 for(const id of ['duplicate','other','foreign']){appointment(f,id+'-booking',c.ownerId,phone,'2026-10-07T12:00:00Z');f.db.prepare('UPDATE appointments SET customerId=? WHERE ownerId=? AND id=?').run(id,c.ownerId,id+'-booking');}
 const result=await f.voice(c).tool('getCustomerContext',{});assert.equal(result.recentAppointments.length,1);
 const handle=result.recentAppointments[0].split(' — ')[0];assert.equal(f.voice(c).runtime.handleStore.resolve({context:c,handle,expectedType:'appointment'}).reference.appointmentId,'duplicate-booking');
});
test('D14 normalized appointment phone and per-caller limit do not mix callers',async t=>{
 const f=fixture(t),c=f.context();for(let i=0;i<8;i++)appointment(f,'own-'+i,c.ownerId,'+1 (902) 555-0100','2026-10-07T12:00:00Z');
 const result=await f.voice(c).tool('getCustomerContext',{});assert.equal(result.recentAppointments.length,5);
});
test('D15 history remains available without customer row; closed leads excluded; malformed receipts fail safely',async t=>{
 const f=fixture(t),c=f.context();
 f.db.prepare("INSERT INTO leads(id,ownerId,callerNumber,describedService,status,createdAt) VALUES('legacy',?,?,?,'NEEDS REVIEW',?)").run(c.ownerId,phone,'[SYNTHETIC] Legacy request',at);
 f.db.prepare("INSERT INTO leads(id,ownerId,callerNumber,describedService,status,createdAt) VALUES('closed',?,?,?,'DISMISSED',?)").run(c.ownerId,phone,'CLOSED SENTINEL',at);
 f.db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES('broken',?,?,'{','INSTANT',?)").run(c.ownerId,c.callSid,at);
 const result=await f.voice(c).tool('getCustomerContext',{});assert.equal(result.status,'found');assert.equal(result.openLeads.length,1);assert.equal(result.recentQuotes.length,1);assert.equal(result.recentQuotes[0].lowEstimate,undefined);assert.doesNotMatch(JSON.stringify(result),/CLOSED SENTINEL/);
});
test('D15 quote and request joins reject foreign-call and foreign-submission links',async t=>{
 const f=fixture(t),c=f.context(),foreign=f.context('synthetic-b');
 f.db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES('bad-link',?,?,'{}','INSTANT',?)").run(c.ownerId,foreign.callSid,at);
 f.db.prepare("INSERT INTO quoteRequests(id,ownerId,callId,describedService,createdAt) VALUES('bad-link',?,?,'FOREIGN',?)").run(c.ownerId,foreign.callSid,at);
 f.db.prepare("INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,'foreign','synthetic','bad-link','INSTANT_ESTIMATE_READY','synthetic',?,'{}','{}',?)").run(foreign.ownerId,JSON.stringify({contact:{phone}}),at);
 assert.equal((await f.voice(c).tool('getCustomerContext',{})).status,'not_found');
});
test('D16 same names and emails do not join different phones or different tenants',async t=>{
 const f=fixture(t),a=f.context(),b={...f.context(),from:'+19025550199'},foreign=f.context('synthetic-b');
 f.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND id=?').run(b.from,b.ownerId,b.callSid);
 for(const c of [a,b,foreign])await f.voice(c).tool('captureLead',{name:'[SYNTHETIC] Same name',email:'shared@example.invalid'});
 const ids=[a,b,foreign].map(c=>JSON.parse(f.lead(c)[0].collectedInputsJson).customerId);assert.equal(new Set(ids).size,3);
});
test('D16 legacy formatted phone reuses identity and preserves omitted contact fields',async t=>{
 const f=fixture(t),c=f.context();f.db.prepare('INSERT INTO customers(id,ownerId,phoneE164,name,notesJson,createdAt) VALUES(?,?,?,?,?,?)').run('legacy',c.ownerId,'+1 (902) 555-0100','[SYNTHETIC] Existing',JSON.stringify({email:'prior@example.invalid'}),at);
 await f.voice(c).tool('captureLead',{notes:'[SYNTHETIC] new request'});const details=JSON.parse(f.lead(c)[0].collectedInputsJson);assert.equal(details.customerId,'legacy');assert.equal(details.contact.email,'prior@example.invalid');assert.equal(f.db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=?').get(c.ownerId).n,1);
});
test('D16 customer write rolls back with inquiry failure and retries create one identity',async t=>{
 const f=fixture(t),c=f.context();f.db.exec("CREATE TRIGGER synthetic_fail BEFORE INSERT ON leads BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
 await assert.rejects(f.voice(c).tool('captureLead',{notes:'[SYNTHETIC] rollback'}));assert.equal(f.db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=?').get(c.ownerId).n,0);
 f.db.exec('DROP TRIGGER synthetic_fail');await f.voice(c).tool('captureLead',{notes:'[SYNTHETIC] rollback'});assert.equal(f.db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=?').get(c.ownerId).n,1);
});
test('D15 malformed optional quote entries cannot hide valid saved ranges or other caller history',async t=>{
 const f=fixture(t),c=f.context(),v=f.voice(c);await v.tool('captureLead',{description:'[SYNTHETIC] valid lead'});
 // Expected before execution: retain saved $221.23–$243.35, never recalculate.
 f.db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES('mixed-receipt',?,?,?,'INSTANT',?)").run(c.ownerId,c.callSid,JSON.stringify({customerResult:{resultType:'INSTANT_ESTIMATE_READY',options:[null,'invalid',{tierName:'Saved',lowEstimate:221.23,highEstimate:243.35,currency:'CAD'}]}}),at);
 const result=await v.tool('getCustomerContext',{});assert.equal(result.openLeads.length,1);assert.deepEqual(result.recentQuotes[0].options,[{tierName:'Saved',lowEstimate:221.23,highEstimate:243.35,currency:'CAD'}]);
});
