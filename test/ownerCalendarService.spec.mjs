import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createOwnerCalendarService} from '../server/src/ownerCalendarService.js';
import {installAppointmentChangeSchema} from '../server/src/appointmentChangeSchema.js';

function fixture(calendar={listBusy:async()=>[]}){
 const db=new DatabaseSync(':memory:');
 db.exec(`CREATE TABLE users(id TEXT PRIMARY KEY,ownerId TEXT,role TEXT,timezone TEXT);
 CREATE TABLE bookingSettings(ownerId TEXT PRIMARY KEY,timezone TEXT);
 CREATE TABLE calendarConnections(ownerId TEXT PRIMARY KEY,provider TEXT,status TEXT,calendarId TEXT,externalUrl TEXT,credentialsCiphertext TEXT);
 CREATE TABLE bookingIntents(id TEXT PRIMARY KEY,ownerId TEXT,sourceType TEXT,sourceId TEXT);
 CREATE TABLE appointments(id TEXT PRIMARY KEY,ownerId TEXT,status TEXT,serviceType TEXT,bookingMode TEXT,startAtUtc TEXT,endAtUtc TEXT,timezone TEXT,tierChosen TEXT,customerJson TEXT,locationJson TEXT,createdAt TEXT,updatedAt TEXT,bookingIntentId TEXT);
 CREATE TABLE bookingPreferences(id TEXT PRIMARY KEY,ownerId TEXT,status TEXT,preferredWindowsJson TEXT,customerJson TEXT,locationJson TEXT,note TEXT,createdAt TEXT,intentId TEXT);
 INSERT INTO users VALUES('a',NULL,'owner','America/Halifax'),('b',NULL,'owner','UTC');
 INSERT INTO calendarConnections VALUES('a','google','connected','primary',NULL,'DO-NOT-EXPOSE');
 INSERT INTO bookingIntents VALUES('ia','a','quote','qa'),('ib','b','lead','lb');`);
 installAppointmentChangeSchema(db);
 const ownerQuery=sql=>{assert.match(sql,/ownerId/);return db.prepare(sql);};
 const service=createOwnerCalendarService({ownerQuery,calendar,clock:()=>new Date('2026-10-02T01:00:00.000Z')});
 return {db,service};
}
test('Calendar uses business date and correct 25-hour fall-back day boundaries',()=>{
 const {db,service}=fixture();try{
  assert.equal(service.schedule({ownerId:'a'}).range.fromDate,'2026-10-01');
  assert.equal(service.schedule({ownerId:'b'}).range.fromDate,'2026-10-02');
  const range=service.schedule({ownerId:'a',query:{fromDate:'2026-11-01',days:'1'}}).range;
  assert.equal(range.startAtUtc,'2026-11-01T03:00:00.000Z');assert.equal(range.endAtUtc,'2026-11-02T04:00:00.000Z');
 }finally{db.close();}
});
test('Owner schedule includes overlapping appointments, preserves states and excludes other tenants',()=>{
 const {db,service}=fixture();try{
  const insert=db.prepare("INSERT INTO appointments(id,ownerId,status,startAtUtc,endAtUtc,bookingIntentId,customerJson,locationJson) VALUES (?,?,?,?,?,?,?,?)");
  const person=JSON.stringify({name:'[SYNTHETIC] Person',email:'a@example.invalid',rate:9000}),place=JSON.stringify({city:'Halifax',internalSecret:'hidden'});
  insert.run('edge','a','CONFIRMED','2026-10-01T02:00:00.000Z','2026-10-01T04:00:00.000Z','ia',person,place);
  insert.run('pending','a','PENDING_CONFIRMATION','2026-10-01T14:00:00.000Z','2026-10-01T15:00:00.000Z','ia',person,place);
  insert.run('before','a','CONFIRMED','2026-10-01T02:00:00.000Z','2026-10-01T03:00:00.000Z','ia',person,place);
  insert.run('foreign','b','CONFIRMED','2026-10-01T14:00:00.000Z','2026-10-01T15:00:00.000Z','ib',person,place);
  insert.run('wrong-link','a','FAILED','2026-10-01T14:30:00.000Z','2026-10-01T15:30:00.000Z','ib',person,place);
  const pref=db.prepare("INSERT INTO bookingPreferences(id,ownerId,status,preferredWindowsJson,customerJson,locationJson,note,intentId) VALUES (?,?,'REQUESTED',?,?,?,?,?)");
  pref.run('pa','a',JSON.stringify([{date:'2026-10-01',timeOfDay:'morning'},{date:'2026-10-08',timeOfDay:'afternoon'}]),person,place,'Original note','ia');
  pref.run('pb','b',JSON.stringify([{date:'2026-10-01',timeOfDay:'morning'}]),person,place,'Other owner','ib');
  const result=service.schedule({ownerId:'a',query:{fromDate:'2026-10-01',days:'1'}});
  assert.deepEqual(result.appointments.map(row=>row.id),['edge','pending','wrong-link']);
  assert.deepEqual(result.appointments[0].source,{type:'quote',id:'qa'});assert.equal(result.appointments[2].source,null);
  assert.equal(result.appointments[1].status,'PENDING_CONFIRMATION');assert.equal(result.requests.length,1);assert.equal(result.requests[0].note,'Original note');assert.equal(result.requests[0].preferredWindows.length,2);
  for(const text of ['DO-NOT-EXPOSE','internalSecret','9000','Other owner','lb'])assert.equal(JSON.stringify(result).includes(text),false);
 }finally{db.close();}
});
test('Calendar rejects unsupported filters, impossible dates and missing owner',()=>{
 const {db,service}=fixture();try{
  for(const query of [{ownerId:'b'},{days:'0'},{days:'32'},{days:['7']},{fromDate:['2026-10-01']},{fromDate:'2026-02-31'}])assert.throws(()=>service.schedule({ownerId:'a',query}),e=>e.statusCode===400);
  assert.throws(()=>service.schedule({ownerId:'missing'}),e=>e.statusCode===404);
 }finally{db.close();}
});
test('Busy-time read is scoped and changing the connection in flight rejects the old response',async()=>{
 let resolveBusy,seen;const {db,service}=fixture({listBusy:args=>{seen=args;return new Promise(resolve=>{resolveBusy=resolve;});}});
 try{
  const response=service.busy({ownerId:'a',query:{fromDate:'2026-10-01',days:'1'}});
  assert.equal(seen.ownerId,'a');assert.equal(seen.calendarId,'primary');assert.equal(seen.timeMinUtc,'2026-10-01T03:00:00.000Z');
  db.prepare("UPDATE calendarConnections SET status='disconnected' WHERE ownerId='a'").run();resolveBusy([]);
  await assert.rejects(response,e=>e.code==='CALENDAR_CHANGED');
  await assert.rejects(service.busy({ownerId:'a'}),e=>e.code==='CALENDAR_NOT_CONNECTED');
  await assert.rejects(service.busy({ownerId:'b'}),e=>e.code==='CALENDAR_NOT_CONNECTED');
 }finally{db.close();}
});
test('Provider failure is an error, never a successful empty calendar',async()=>{
 const {db,service}=fixture({listBusy:async()=>{throw Object.assign(new Error('Unavailable'),{code:'PROVIDER_UNAVAILABLE'});}});
 try{await assert.rejects(service.busy({ownerId:'a'}),e=>e.code==='PROVIDER_UNAVAILABLE');}finally{db.close();}
});
