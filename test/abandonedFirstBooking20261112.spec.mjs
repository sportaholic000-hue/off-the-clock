import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,CUSTOMER,deferred} from './fixtures/bookingCalendar20261006.mjs';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';

// A first booking left at PENDING_PROVIDER because its process stopped while
// writing the calendar (restart or redeploy). A new process on the same
// database settles it in the background pass by the same rule as a booking
// waiting for confirmation: confirmed when the calendar has the event,
// released when the calendar answers that it does not, left waiting when the
// calendar cannot be read. A booking a live process is still writing is not
// touched. Fakes only: the fixture's in-memory calendar; no email provider.
// Expected before the change: the background pass ignores PENDING_PROVIDER,
// so the "event exists" and "no event" tests fail (the booking stays
// PENDING_PROVIDER, no calendar read, no alert, the slot stays blocked) and
// the race test fails at its check that the pass read the calendar; the
// unreadable and live-write tests pass.
const ownerId='synthetic-a';
const SERVICE='[SYNTHETIC] Cedar fence';
const SIX_HOURS=6*60*60*1000;
const RELEASED_LINES=[
  'The calendar never confirmed this booking, so it is not booked and the time was released.',
  'Customer: '+CUSTOMER.name,'Phone: '+CUSTOMER.phone,'Email: '+CUSTOMER.email,'Service: '+SERVICE,
  'Requested time: Wed, Oct 7, 2026, 9:00 – 9:45 AM ADT','Call the customer back to book a new time.'
];
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(condition){for(let n=0;n<500&&!condition();n++)await tick();assert.ok(condition(),'condition reached');}

// Process A starts a booking; its calendar write never answers (the process
// is then treated as gone). saveEvent: the calendar keeps the event first.
async function interruptedBooking(t,{saveEvent}){
  const f=fixture(t),{i,held,slot}=await f.ready(),originalCreate=f.calendar.createEvent,write=deferred();
  assert.equal(f.db.prepare("UPDATE quotes SET resultJson=? WHERE ownerId=? AND id=(SELECT sourceId FROM bookingIntents WHERE ownerId=? AND id=? AND sourceType='quote')")
    .run(JSON.stringify({customerResult:{pricedScope:{service:SERVICE}}}),ownerId,ownerId,i.intentId).changes,1);
  let writing=false;
  f.calendar.createEvent=async request=>{writing=true;if(saveEvent)await originalCreate(request);return write.promise;};
  const liveConfirm=f.booking.confirm(f.request(i,held));
  await until(()=>writing);
  const row=()=>f.db.prepare('SELECT status,providerEventStatus,updatedAt FROM appointments WHERE ownerId=?').get(ownerId);
  assert.deepEqual({status:row().status,providerEventStatus:row().providerEventStatus},{status:'PENDING_PROVIDER',providerEventStatus:'PENDING_PROVIDER'});
  f.calendar.createEvent=originalCreate;
  let reads=0;const originalGet=f.calendar.getEvent;f.calendar.getEvent=async request=>{reads++;return originalGet(request);};
  const count=type=>f.db.prepare('SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType=?').get(ownerId,type).n;
  const hold=()=>f.db.prepare('SELECT status FROM bookingHolds WHERE ownerId=? AND id=?').get(ownerId,held.body.holdId).status;
  const offered=async service=>(await f.slots(f.intent(),f.date,service)).filter(row=>row.startUtc===slot.startUtc).length;
  const pass=async service=>{const errors=[],stop=service.startChangeReconciler({intervalMs:3600000,onError:code=>errors.push(code)});await stop();assert.deepEqual(errors,[]);};
  const noTextMessages=()=>{
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM voiceSmsDeliveries').get().n,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE eventType LIKE '%sms%'").get().n,0);
  };
  return {f,i,held,slot,write,liveConfirm,row,reads:()=>reads,count,hold,offered,pass,noTextMessages};
}

test('calendar has the event and the process is gone: a new process confirms it once; the slot stays taken',async t=>{
  const s=await interruptedBooking(t,{saveEvent:true});
  s.f.advance(SIX_HOURS);
  const next=s.f.restart();
  await s.pass(next);
  assert.equal(s.reads(),1,'one calendar read');
  assert.deepEqual({status:s.row().status,providerEventStatus:s.row().providerEventStatus},{status:'CONFIRMED',providerEventStatus:'CONFIRMED'});
  assert.equal(s.hold(),'CONFIRMED');
  assert.equal(s.count('booking.confirmed'),1);
  assert.equal(s.count('booking.released'),0);
  assert.equal(s.f.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE ownerId=? AND eventType='appointment.booked'").get(ownerId).n,1);
  assert.equal(s.f.writes.length,1,'the background pass never writes to the calendar');
  assert.equal(await s.offered(next),0,'a confirmed slot is not offered');
  // Running the pass again changes nothing and raises no second alert.
  await s.pass(next);
  assert.equal(s.count('booking.confirmed'),1);
  assert.equal(s.reads(),1);
  s.noTextMessages();
});

test('calendar says there is no event: a new process releases it with one alert; the slot is offered again once',async t=>{
  const s=await interruptedBooking(t,{saveEvent:false});
  assert.equal(await s.offered(s.f.booking),0,'blocked while waiting');
  s.f.advance(SIX_HOURS);
  const next=s.f.restart();
  await s.pass(next);
  assert.equal(s.reads(),1);
  assert.equal(s.row().status,'PROVIDER_FAILED');
  assert.equal(s.hold(),'RELEASED');
  assert.equal(s.count('booking.released'),1);
  assert.equal(s.count('booking.confirmed'),0);
  assert.equal(s.f.writes.length,0,'the background pass never writes to the calendar');
  assert.equal(await s.offered(next),1,'offered again exactly once');
  const listed=s.f.ownerCalls.dashboard(ownerId).notifications.find(row=>row.eventType==='booking.released');
  assert.equal(listed.title,'Booking not confirmed — time released');
  assert.deepEqual(listed.details,RELEASED_LINES);
  const sent=[];
  const alerts=createOwnerAlertService({database:s.f.db,environment:{EMAIL_FROM:'alerts@example.invalid',CLIENT_URL:'https://app.example.invalid/'},ready:()=>true,
    clock:()=>s.f.clock().getTime(),send:async message=>{sent.push(message);return {accepted:true,id:'SYNTHETIC-'+sent.length};},readReceipt:async()=>{throw Error('[SYNTHETIC] not read');}});
  for(let n=0;n<5;n++)if(!await alerts.processOne(ownerId))break;
  const email=sent.find(message=>message.subject==='Off The Clock: Booking not confirmed — time released');
  assert.deepEqual(email.text.split('\n'),['Booking not confirmed — time released',...RELEASED_LINES,'Open saved record: https://app.example.invalid/calls?record='+ownerId+'-call']);
  await s.pass(next);
  assert.equal(s.count('booking.released'),1,'a second pass raises no second alert');
  assert.equal(await s.offered(next),1);
  s.noTextMessages();
});

test('calendar cannot be read: the booking stays PENDING_PROVIDER with no alert and the slot stays blocked',async t=>{
  const s=await interruptedBooking(t,{saveEvent:true});
  s.f.advance(SIX_HOURS);
  const next=s.f.restart();
  s.f.calendar.getEvent=async()=>{throw Error('[SYNTHETIC] calendar read failed');};
  await s.pass(next);
  await s.pass(next);
  assert.deepEqual({status:s.row().status,providerEventStatus:s.row().providerEventStatus},{status:'PENDING_PROVIDER',providerEventStatus:'PENDING_PROVIDER'});
  assert.equal(s.hold(),'CONFIRMING');
  assert.equal(s.count('booking.released'),0);
  assert.equal(s.count('booking.confirmed'),0);
  assert.equal(await s.offered(next),0);
  s.noTextMessages();
});

test('a live write in progress is not touched: no calendar read and no change, from another process or its own',async t=>{
  const s=await interruptedBooking(t,{saveEvent:true}),before=s.row();
  // Another process, 90 seconds after the write started (inside the 2-minute lease).
  s.f.advance(90*1000);
  await s.pass(s.f.restart());
  assert.equal(s.reads(),0);
  assert.deepEqual(s.row(),before);
  // The writing process itself, however long the write takes.
  s.f.advance(SIX_HOURS);
  await s.pass(s.f.booking);
  assert.equal(s.reads(),0);
  assert.deepEqual(s.row(),before);
  assert.equal(s.count('booking.released')+s.count('booking.confirmed'),0);
  // The live write then finishes normally.
  s.write.resolve({status:'CONFIRMED',eventId:s.f.writes[0].eventId,startAtUtc:s.f.writes[0].startAtUtc,endAtUtc:s.f.writes[0].endAtUtc});
  assert.equal((await s.liveConfirm).body.status,'CONFIRMED');
  assert.equal(s.count('booking.confirmed'),1);
});

test('race: the live process confirms while the pass is reading; exactly one settlement and one alert',async t=>{
  const s=await interruptedBooking(t,{saveEvent:false});
  s.f.advance(11*60*1000);
  const next=s.f.restart(),read=deferred();let reading=false;
  s.f.calendar.getEvent=async()=>{reading=true;return read.promise;};
  const passing=s.pass(next);
  for(let n=0;n<50&&!reading;n++)await tick();
  // The live write lands and the live process confirms.
  const request=s.f.writes.length?s.f.writes[0]:null;assert.equal(request,null);
  s.write.resolve({status:'CONFIRMED',eventId:s.f.db.prepare('SELECT providerEventId FROM appointments WHERE ownerId=?').get(ownerId).providerEventId,
    startAtUtc:s.slot.startUtc,endAtUtc:s.f.db.prepare('SELECT endAtUtc FROM appointments WHERE ownerId=?').get(ownerId).endAtUtc});
  assert.equal((await s.liveConfirm).body.status,'CONFIRMED');
  // The pass's read had answered "no event" before the write landed.
  read.resolve(null);
  await passing;
  assert.equal(reading,true,'the pass read the calendar while the live write was in flight');
  assert.equal(s.row().status,'CONFIRMED');
  assert.equal(s.hold(),'CONFIRMED');
  assert.equal(s.count('booking.confirmed'),1);
  assert.equal(s.count('booking.released'),0);
  assert.equal(await s.offered(next),0);
  await s.pass(next);
  assert.equal(s.count('booking.confirmed'),1);
  assert.equal(s.count('booking.released'),0);
});
