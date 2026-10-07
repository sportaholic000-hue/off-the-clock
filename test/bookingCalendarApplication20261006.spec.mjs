import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';

test('production server booking routes, adapter and owner views agree under concurrent HTTP requests',{timeout:40000},async t=>{
  const s=await application(t),intents=[s.intent(),s.intent()],prefix=i=>'/api/public/bookings/'+i.bookingToken;
  const available=await Promise.all(intents.map(i=>s.request(prefix(i)+'/availability',{method:'POST',body:s.filters,publicRequest:true})));
  for(const r of available)assert.equal(r.status,200,JSON.stringify(r));
  const held=await Promise.all(intents.map((i,n)=>s.request(prefix(i)+'/holds',{method:'POST',body:{slotId:available[n].body.slots[0].slotId},idempotencyKey:randomUUID(),publicRequest:true})));
  assert.deepEqual(held.map(r=>r.status).sort(),[201,409]);const n=held.findIndex(r=>r.status===201),i=intents[n],req=s.request;
  const confirmation={holdId:held[n].body.holdId,confirmedSlotId:held[n].body.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:s.filters.customer,location:s.filters.location};
  const key=randomUUID(),confirm=()=>req(prefix(i)+'/confirm',{method:'POST',body:confirmation,idempotencyKey:key,publicRequest:true});
  const confirmed=await Promise.all([confirm(),confirm()]);assert.ok(confirmed.some(r=>r.status===201),JSON.stringify(confirmed));
  const result=confirmed.find(r=>r.status===201).body;assert.equal(result.startUtc,'2026-11-01T13:00:00.000Z');assert.equal(result.startLocal,'2026-11-01T09:00:00-04:00');
  assert.equal((await confirm()).body.appointmentId,result.appointmentId);
  assert.equal(Object.keys(s.provider().events).length,1);assert.equal(s.provider().calls.filter(c=>c.method==='POST'&&c.path.endsWith('/events')).length,1);
  const dash=await req('/api/dashboard'),schedule=await req('/api/calendar/schedule?fromDate=2026-11-01&days=1'),call=await req('/api/calls/synthetic-a-call');
  assert.equal(dash.status,200);assert.equal(dash.body.callActivity.counts.bookings,1);assert.equal(schedule.status,200,JSON.stringify({schedule,user:s.db.prepare('SELECT plan,planStatus FROM users WHERE id=?').get(i.ownerId)}));assert.equal(schedule.body.appointments[0].id,result.appointmentId);assert.equal(call.body.bookings[0].id,result.appointmentId);
  assert.equal((await req('/api/dashboard',{owner:'synthetic-b'})).body.callActivity.counts.bookings,0);
  assert.deepEqual((await req('/api/calendar/schedule?fromDate=2026-11-01&days=1',{owner:'synthetic-b'})).body.appointments,[]);
  assert.equal((await req('/api/bookings/'+i.intentId+'/availability',{method:'POST',body:s.filters,owner:'synthetic-b'})).status,404);
  assert.equal((await req('/api/calls/synthetic-a-call',{owner:'synthetic-b'})).status,404);
  assert.equal((await req('/api/calendar/schedule',{owner:null})).status,401);
  assert.equal((await req('/api/booking/configuration')).status,200);
  const foreignSchedule=await req('/api/calendar/schedule?ownerId=synthetic-b');assert.equal(foreignSchedule.status,403);assert.deepEqual(foreignSchedule.body,{error:'Forbidden'});
  assert.equal((await req(prefix(i)+'/confirm',{method:'POST',body:{...confirmation,customer:{...confirmation.customer,name:'Changed'}},idempotencyKey:key,publicRequest:true})).status,409);
});

test('production provider response loss stays visible and reconciles after lookup recovery',{timeout:40000},async t=>{
  const s=await application(t),i=s.intent(),prefix='/api/public/bookings/'+i.bookingToken;
  const slots=await s.request(prefix+'/availability',{method:'POST',body:s.filters,publicRequest:true});
  const held=await s.request(prefix+'/holds',{method:'POST',body:{slotId:slots.body.slots[0].slotId},idempotencyKey:randomUUID(),publicRequest:true});
  s.changeProvider({mode:'lost-response'});
  const body={holdId:held.body.holdId,confirmedSlotId:held.body.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:s.filters.customer,location:s.filters.location};
  const pending=await s.request(prefix+'/confirm',{method:'POST',body,idempotencyKey:randomUUID(),publicRequest:true});assert.equal(pending.status,202,JSON.stringify(pending));
  const schedule=await s.request('/api/calendar/schedule?fromDate=2026-11-01&days=1');assert.equal(schedule.status,200,JSON.stringify(schedule));assert.equal(schedule.body.appointments[0].status,'PENDING_CONFIRMATION');
  assert.equal((await s.request('/api/calls/synthetic-a-call')).body.bookings[0].id,pending.body.appointmentId);
  s.changeProvider({mode:'normal'});
  await s.restartApplication();
  const poll=await s.request(prefix+'/confirmations/'+encodeURIComponent(pending.body.confirmationId),{publicRequest:true});assert.equal(poll.body.status,'CONFIRMED');
  assert.equal((await s.request('/api/dashboard')).body.callActivity.counts.bookings,1);assert.equal(Object.keys(s.provider().events).length,1);
});
