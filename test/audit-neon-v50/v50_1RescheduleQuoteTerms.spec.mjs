// Neon audit of v50, V50-1 (November 26, 2026): NEW-4 stopped first-time
// booking on dates the quote price does not hold for, but a reschedule
// offered and confirmed them (an off-season quote moved into the busy
// season at the off-season price). Expected, written before the fix (busy
// season July and August at 15%, June-priced mowing quote booked as the job):
// - same-call reschedule asking for July: unavailable, REQUOTE_REQUIRED, with
//   confirm's reason; the appointment stays on its date;
// - asking for June 29 and 30 (and July 1): only June times are offered, and
//   moving to one is confirmed;
// - a July time held before the owner switched to job booking is refused at
//   the change itself (defense in depth: the phone layer re-checks the held
//   time, since server/src/bookingService.js is pinned byte-identical), with
//   reason REQUOTE_REQUIRED, and the appointment is unchanged.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceCallFixture,MOWING_INPUTS,ADDRESS} from '../audit-neon-v49/voiceCallFixture.mjs';

const season={defaults:{peakMonths:[7,8],peakSurchargePercent:15},horizonDays:45};
async function booked(f){
  const invoke=f.call('+15065550177');
  const match=await invoke('matchService',{query:'Lawn Mowing'});
  const quote=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs:{...MOWING_INPUTS,workMonth:'june'}});
  assert.equal(quote.status,'quoted');
  const lead=await invoke('captureLead',{name:'Synthetic caller',address:ADDRESS});
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-16',days:1}});
  const b=await invoke('bookAppointment',{slotHandle:a.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true});
  assert.equal(b.status,'confirmed',JSON.stringify(b));
  return {invoke,b,start:()=>f.db.prepare('SELECT startAtUtc FROM appointments WHERE ownerId=?').get(f.ownerId).startAtUtc};
}
const months=slots=>[...new Set(slots.map(s=>s.label.match(/(June|July|August)/)[1]))];

test('V50-1: a reschedule into the busy season needs a new quote',async t=>{
  const f=voiceCallFixture(t,{...season,bookingMode:'book_job'});const {invoke,b,start}=await booked(f);const before=start();
  const a=await invoke('checkAvailability',{appointmentHandle:b.appointmentHandle,preference:{fromDate:'2026-07-06',days:3}});
  assert.equal(a.status,'unavailable',JSON.stringify(a));assert.equal(a.reason,'REQUOTE_REQUIRED');
  assert.match(a.message,/priced for work outside the busy season/);
  assert.equal(start(),before);
});
test('V50-1: a reschedule offers only dates the price holds for, and moves there',async t=>{
  const f=voiceCallFixture(t,{...season,bookingMode:'book_job'});const {invoke,b,start}=await booked(f);const before=start();
  const a=await invoke('checkAvailability',{appointmentHandle:b.appointmentHandle,preference:{fromDate:'2026-06-30',days:2}});
  assert.equal(a.status,'available',JSON.stringify(a));assert.deepEqual(months(a.slotOptions),['June']);
  const moved=await invoke('modifyAppointment',{appointmentHandle:b.appointmentHandle,action:'reschedule',slotHandle:a.slotOptions.at(-1).slotHandle,customerConfirmed:true});
  assert.equal(moved.status,'rescheduled',JSON.stringify(moved));assert.notEqual(start(),before);
});
test('V50-1: the change itself re-checks the date (time held before job booking was switched on)',async t=>{
  const f=voiceCallFixture(t,{...season,bookingMode:'book_job'});const {invoke,b,start}=await booked(f);const before=start();
  f.db.prepare("UPDATE bookingPolicies SET bookingMode='site_visit_first' WHERE ownerId=?").run(f.ownerId);
  const a=await invoke('checkAvailability',{appointmentHandle:b.appointmentHandle,preference:{fromDate:'2026-07-06',days:1}});
  assert.equal(a.status,'available',JSON.stringify(a));
  f.db.prepare("UPDATE bookingPolicies SET bookingMode='book_job' WHERE ownerId=?").run(f.ownerId);
  const moved=await invoke('modifyAppointment',{appointmentHandle:b.appointmentHandle,action:'reschedule',slotHandle:a.slotOptions[0].slotHandle,customerConfirmed:true});
  assert.equal(moved.status,'unavailable',JSON.stringify(moved));assert.equal(moved.reason,'REQUOTE_REQUIRED');
  assert.equal(start(),before);
});
