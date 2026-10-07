import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCandidateSlots,formatLocalIso,localDateTimeCandidates} from '../server/src/calendarTime.js';
import {fixture,deferred,providerResult} from './fixtures/bookingCalendar20261006.mjs';
import {randomUUID} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';

function dstSlots(date,window,duration=120){return generateCandidateSlots({now:date+'T00:00:00.000Z',timeZone:'America/Moncton',weeklyAvailability:{sun:[window]},fromDate:date,days:1,durationMinutes:duration,slotIncrementMinutes:60,minimumNoticeMinutes:0,bookingHorizonDays:2});}
test('booking B01 spring-forward duration cannot extend past owner closing time',()=>{
  assert.deepEqual(dstSlots('2026-03-08',{start:'01:00',end:'03:00'}),[]);
});
test('booking B01 fall-back elapsed duration includes the valid extra-hour slot',()=>{
  const slots=dstSlots('2026-11-01',{start:'00:00',end:'02:00'});
  assert.deepEqual(slots.map(s=>[s.startAtUtc,s.endAtUtc]),[['2026-11-01T03:00:00.000Z','2026-11-01T05:00:00.000Z'],['2026-11-01T04:00:00.000Z','2026-11-01T06:00:00.000Z']]);
});
test('DST control: a skipped closing wall time does not discard an earlier valid short appointment',()=>{
  const slots=dstSlots('2026-03-08',{start:'01:00',end:'02:30'},30);
  assert.deepEqual(slots.map(s=>[s.startAtUtc,s.endAtUtc]),[['2026-03-08T05:00:00.000Z','2026-03-08T05:30:00.000Z']]);
});
test('DST control: a narrow repeated-hours window cannot span intervening closed clock times',()=>{
  assert.deepEqual(dstSlots('2026-11-01',{start:'01:30',end:'01:45'},75),[]);
});
for(const late of ['pending','failure','confirmed-after-cancel'])test('booking B02 finalizer cannot overwrite newer provider reconciliation: '+late,async t=>{
  const s=fixture(t),{i,held}=await s.ready(),req=s.request(i,held),started=deferred(),release=deferred();let providerRequest;
  s.calendar.createEvent=async r=>{providerRequest=r;s.writes.push(r);started.resolve();await release.promise;if(late==='failure')throw Error('known failure');return {...providerResult(r),status:late==='pending'?'PENDING_CONFIRMATION':'CONFIRMED'};};
  const original=s.booking.confirm(req);await started.promise;
  const receipt=JSON.parse(s.db.prepare("SELECT responseJson FROM bookingIdempotency WHERE operation='confirm'").get().responseJson);
  s.calendar.getEvent=async()=>({...providerResult(providerRequest),status:late==='confirmed-after-cancel'?'CANCELLED':'CONFIRMED'});
  const poll=await s.restart().getConfirmationStatus({bookingToken:i.bookingToken,confirmationId:receipt.confirmationId});
  assert.equal(poll.body.status,late==='confirmed-after-cancel'?'FAILED':'CONFIRMED');
  release.resolve();await original.catch(()=>null);
  const row=s.db.prepare('SELECT status FROM appointments WHERE ownerId=?').get(i.ownerId);
  assert.equal(row.status,late==='confirmed-after-cancel'?'PROVIDER_FAILED':'CONFIRMED');
  assert.equal(s.ownerCalls.dashboard(i.ownerId).counts.bookings,late==='confirmed-after-cancel'?0:1);
});
for(const delayedRead of [false,true])test('booking B03 confirmation rechecks a slot start that passed '+(delayedRead?'during provider read':'during hold'),async t=>{
  const s=fixture(t,{now:'2026-10-07T11:59:00.000Z'}),{i,held}=await s.ready(),req=s.request(i,held);
  if(delayedRead)s.calendar.listBusy=async()=>{s.advance(120000);return [];};else s.advance(120000);
  await assert.rejects(s.booking.confirm(req),e=>e.code==='SLOT_UNAVAILABLE');
  assert.equal(s.writes.length,0);assert.equal(s.ownerCalls.dashboard(i.ownerId).counts.bookings,0);
});

test('booking B04 changed owner availability during busy read prevents stale provider write',async t=>{
  const s=fixture(t),{i,held}=await s.ready();
  s.calendar.listBusy=async()=>{s.db.prepare("UPDATE bookingSettings SET revision='s2',directBookingEnabled=0 WHERE ownerId=?").run(i.ownerId);return [];};
  await assert.rejects(s.booking.confirm(s.request(i,held)),e=>e.code==='SCHEDULE_CHANGED');
  assert.equal(s.writes.length,0);
});

test('two independent SQLite workers racing for one slot yield exactly one hold and one booking',async t=>{
  const s=fixture(t),intents=[s.intent(),s.intent()],slots=await Promise.all(intents.map(i=>s.slots(i))),barrier=new SharedArrayBuffer(4);
  const workers=intents.map((i,index)=>new Worker(new URL('./fixtures/bookingCalendarRace20261006.mjs',import.meta.url),{workerData:{path:s.path,barrier,now:s.clock().toISOString(),request:{...i,slotId:slots[index][0].slotId,idempotencyKey:randomUUID()}}}));
  t.after(async()=>Promise.all(workers.map(w=>w.terminate())));
  await Promise.all(workers.map(w=>once(w,'message')));
  const completed=workers.map(w=>once(w,'message'));Atomics.store(new Int32Array(barrier),0,1);Atomics.notify(new Int32Array(barrier),0);
  const results=(await Promise.all(completed)).map(([r])=>r);assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.code==='SLOT_UNAVAILABLE').length,1);
  const winner=results.findIndex(r=>r.ok),req=s.request(intents[winner],results[winner].result);
  const responses=await Promise.all([s.booking.confirm(req),s.restart().confirm(req)]);
  assert.ok(responses.some(r=>r.body.status==='CONFIRMED'));assert.equal(s.events.size,1);assert.equal(s.writes.length,1);
  assert.equal(s.db.prepare('SELECT count(*) n FROM appointments').get().n,1);assert.equal(s.db.prepare('SELECT count(*) n FROM outboxEvents').get().n,1);
});

for(const elapsed of [299999,300000,300001])test('hold expiry releases overlap exactly at five minutes: '+elapsed,async t=>{
  const s=fixture(t),{i,slot,held}=await s.ready(),second=s.intent();s.advance(elapsed);
  const available=await s.slots(second),same=available.find(r=>r.startUtc===slot.startUtc);
  if(elapsed<300000){assert.equal(same,undefined);assert.equal((await s.booking.confirm(s.request(i,held))).body.status,'CONFIRMED');}
  else {assert.ok(same);s.hold(second,same);await assert.rejects(s.booking.confirm(s.request(i,held)),e=>e.code==='HOLD_EXPIRED');assert.equal(s.writes.length,0);}
});

test('hold and booking receipts survive restart; changed payload and alternate key cannot duplicate',async t=>{
  const s=fixture(t),i=s.intent(),[slot]=await s.slots(i),key=randomUUID(),held=s.hold(i,slot,s.booking,key);
  assert.deepEqual(s.hold(i,slot,s.restart(),key),held);
  const req=s.request(i,held),result=await s.booking.confirm(req);assert.deepEqual(await s.restart().confirm(req),result);
  await assert.rejects(s.booking.confirm({...req,body:{...req.body,customer:{...req.body.customer,name:'Changed'}}}),e=>e.code==='IDEMPOTENCY_CONFLICT');
  await assert.rejects(s.restart().confirm({...req,idempotencyKey:randomUUID()}),e=>e.code==='BOOKING_ALREADY_EXISTS');
  assert.equal(s.events.size,1);assert.equal(s.writes.length,1);
});

for(const failure of ['busy-rejection','create-rejection','lost-response','sqlite-finalization'])test('provider/storage failure keeps visible durable outcome: '+failure,async t=>{
  const s=fixture(t),{i,held}=await s.ready(),req=s.request(i,held),create=s.calendar.createEvent.bind(s.calendar);
  if(failure==='busy-rejection')s.calendar.listBusy=async()=>{throw Error('synthetic busy failure');};
  if(failure==='create-rejection')s.calendar.createEvent=async()=>{throw Error('synthetic rejection');};
  if(failure==='lost-response'){s.calendar.createEvent=async r=>{await create(r);throw Object.assign(Error('synthetic response loss'),{ambiguous:true});};s.calendar.getEvent=async()=>{throw Error('synthetic lookup timeout');};}
  if(failure==='sqlite-finalization')s.db.exec("CREATE TEMP TRIGGER synthetic_finalize_failure BEFORE INSERT ON outboxEvents BEGIN SELECT RAISE(ABORT,'synthetic finalization failure'); END");
  if(failure==='lost-response')assert.equal((await s.booking.confirm(req)).body.status,'PENDING_CONFIRMATION');
  else await assert.rejects(s.booking.confirm(req));
  const rows=s.ownerCalendar.schedule({ownerId:i.ownerId,query:{fromDate:s.date,days:'1'}}).appointments;
  assert.equal(rows.length,1);assert.equal(s.ownerCalls.detail({ownerId:i.ownerId,id:i.ownerId+'-call'}).bookings.length,1);
  const ambiguous=['lost-response','sqlite-finalization'].includes(failure);
  assert.equal(rows[0].status,ambiguous?(failure==='lost-response'?'PENDING_CONFIRMATION':'PENDING_PROVIDER'):'PROVIDER_FAILED');
  assert.equal(s.events.size,ambiguous?1:0);assert.equal(s.ownerCalls.dashboard(i.ownerId).counts.bookings,0);
  if(ambiguous){
    if(failure==='sqlite-finalization')s.db.exec('DROP TRIGGER synthetic_finalize_failure');
    s.calendar.getEvent=async r=>providerResult([...s.events.values()].find(e=>e.eventId===r.eventId));
    const receipt=JSON.parse(s.db.prepare("SELECT responseJson FROM bookingIdempotency WHERE operation='confirm'").get().responseJson);
    const recovered=await s.restart().getConfirmationStatus({bookingToken:i.bookingToken,confirmationId:receipt.confirmationId});assert.equal(recovered.body.status,'CONFIRMED');
    assert.equal(s.events.size,1);assert.equal(s.writes.length,1);assert.equal(s.ownerCalls.dashboard(i.ownerId).counts.bookings,1);
    assert.equal(s.db.prepare('SELECT count(*) n FROM outboxEvents').get().n,1);
  }
});

test('tenant contexts, holds, slots, confirmations, dashboard and provider reads never cross owners',async t=>{
  const s=fixture(t),{i,slot,held}=await s.ready(),other=s.intent('synthetic-b'),otherSlots=await s.slots(other);
  assert.equal(otherSlots[0].startUtc,slot.startUtc,'A hold does not block an unrelated tenant primary calendar');
  await assert.rejects(s.booking.availability({...i,ownerId:other.ownerId}),e=>e.code==='BOOKING_CONTEXT_NOT_FOUND');
  assert.throws(()=>s.hold(other,slot),e=>e.code==='INVALID_REQUEST');
  await assert.rejects(s.booking.confirm({...s.request(i,held),ownerId:other.ownerId}),e=>e.code==='BOOKING_CONTEXT_NOT_FOUND');
  s.calendar.createEvent=async r=>({...providerResult(r),status:'PENDING_CONFIRMATION'});
  const pending=await s.booking.confirm(s.request(i,held));
  await assert.rejects(s.booking.getConfirmationStatus({bookingToken:other.bookingToken,confirmationId:pending.body.confirmationId}),e=>e.code==='CONFIRMATION_NOT_FOUND');
  assert.equal(s.ownerCalendar.schedule({ownerId:other.ownerId,query:{fromDate:s.date,days:'1'}}).appointments.length,0);
  assert.equal(s.ownerCalls.detail({ownerId:other.ownerId,id:other.ownerId+'-call'}).bookings.length,0);
  assert.equal(s.ownerCalls.dashboard(other.ownerId).counts.bookings,0);
});

for(const [date,utc,offset] of [['2026-03-07','13:00','-04:00'],['2026-03-08','12:00','-03:00'],['2026-11-01','13:00','-04:00']])test('Moncton booking, owner views and Los Angeles instant agree on '+date,async t=>{
  const s=fixture(t,{now:date+'T00:00:00.000Z',date}),{i,slot,held}=await s.ready(),result=await s.booking.confirm(s.request(i,held));
  assert.equal(slot.startUtc,date+'T'+utc+':00.000Z');assert.equal(result.body.startLocal,date+'T09:00:00'+offset);
  assert.equal(formatLocalIso(slot.startUtc,'America/Los_Angeles').slice(11,16),'05:00');
  const scheduled=s.ownerCalendar.schedule({ownerId:i.ownerId,query:{fromDate:date,days:'1'}}).appointments;
  assert.equal(scheduled.length,1);assert.equal(scheduled[0].startAtUtc,result.body.startUtc);assert.equal(scheduled[0].endAtUtc,result.body.endUtc);
  assert.equal([...s.events.values()][0].startAtUtc,result.body.startUtc);assert.equal([...s.events.values()][0].endAtUtc,result.body.endUtc);
  assert.equal(s.ownerCalls.dashboard(i.ownerId).counts.bookings,1);assert.equal(s.ownerCalls.detail({ownerId:i.ownerId,id:i.ownerId+'-call'}).bookings[0].id,result.body.appointmentId);
});
test('Moncton DST gap and repeated times have exact unambiguous instants',()=>{
  assert.deepEqual(localDateTimeCandidates('2026-03-08','02:30','America/Moncton'),[]);
  assert.deepEqual(localDateTimeCandidates('2026-11-01','01:30','America/Moncton'),['2026-11-01T04:30:00.000Z','2026-11-01T05:30:00.000Z']);
});
