import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';
const rows=s=>Object.fromEntries(['bookingSettings','bookingPolicies','calendarConnections','appointments','quoteAccessKeys'].map(table=>[table,s.db.prepare(`SELECT * FROM ${table} WHERE ownerId=?`).all('synthetic-a')]));
test('Starter lineup: downgrade preserves data and blocks owner/public booking, widget and price book',async t=>{
 const s=await application(t),i=s.intent(),prefix='/api/public/bookings/'+i.bookingToken;
 const prior=s.intent(),priorRoot='/api/public/bookings/'+prior.bookingToken;
 const slots=await s.request(priorRoot+'/availability',{method:'POST',publicRequest:true,body:s.filters});assert.equal(slots.status,200);
 const held=await s.request(priorRoot+'/holds',{method:'POST',publicRequest:true,idempotencyKey:randomUUID(),body:{slotId:slots.body.slots[0].slotId}});assert.equal(held.status,201);
 const confirmed=await s.request(priorRoot+'/confirm',{method:'POST',publicRequest:true,idempotencyKey:randomUUID(),body:{holdId:held.body.holdId,confirmedSlotId:held.body.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:s.filters.customer,location:s.filters.location}});assert.equal(confirmed.status,201);assert.equal(confirmed.body.status,'CONFIRMED');
 const before=rows(s);assert.equal(before.appointments.length,1);s.db.prepare("UPDATE users SET plan='Starter' WHERE id=?").run('synthetic-a');s.changeProvider({calls:[]});
 for(const path of ['/api/pricebook/synthetic-a','/api/quotedone/access','/api/pricebook/interview','/api/public/quote/synthetic-a','/api/calendar/schedule','/api/booking/configuration']){
  const r=await s.request(path,{publicRequest:path.includes('/public/')});assert.equal(r.status,403,path+JSON.stringify(r));
 }
 for(const root of [prefix,'/api/bookings/'+i.bookingIntentId])for(const operation of ['availability','holds','confirm','preference']){
  const r=await s.request(root+'/'+operation,{method:'POST',body:{},publicRequest:root===prefix,idempotencyKey:randomUUID()});assert.equal(r.status,403,root+'/'+operation+JSON.stringify(r));assert.equal(r.body.code,'BOOKING_UNAVAILABLE');
 }
 for(const [path,method,body] of [['/api/onboarding/calendar','POST',{skipped:true}],['/api/onboarding/calendar/google/start','GET',undefined],['/api/onboarding/voice','POST',{transferNumber:'+19025550199'}],['/api/widget/settings','PUT',{}]])assert.equal((await s.request(path,{method,body})).status,403,path);
 assert.deepEqual(s.provider().calls,[]);assert.deepEqual(rows(s),before);
 s.db.prepare("UPDATE users SET plan='Operator' WHERE id=?").run('synthetic-a');
 for(const path of ['/api/pricebook/synthetic-a','/api/quotedone/access','/api/pricebook/interview','/api/public/quote/synthetic-a','/api/calendar/schedule'])assert.equal((await s.request(path,{publicRequest:path.includes('/public/')})).status,200,path);
 const r=await s.request(prefix+'/availability',{method:'POST',body:s.filters,publicRequest:true});assert.equal(r.status,200);assert.ok(r.body.slots.length>0);
});
