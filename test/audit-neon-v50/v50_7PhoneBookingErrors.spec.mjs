// Neon audit of v50, V50-7 (November 26, 2026): expected booking refusals
// reached the phone agent as a generic TOOL_EXECUTION_FAILED, so when a time
// was taken while the caller decided, the agent could not offer another.
// Expected, written before the fix:
// - caller A is offered a time, caller B books it first, caller A books it:
//   status unavailable, reason SLOT_UNAVAILABLE, the booking service's own
//   message ("That time was just taken..."); no second appointment;
// - asking for times again on a quote that is already booked: unavailable,
//   reason BOOKING_ALREADY_EXISTS (not a failure).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceCallFixture,MOWING_INPUTS,ADDRESS} from '../audit-neon-v49/voiceCallFixture.mjs';

async function offered(f,from){
  const invoke=f.call(from);
  const match=await invoke('matchService',{query:'Lawn Mowing'});
  const quote=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs:MOWING_INPUTS});
  const lead=await invoke('captureLead',{name:'Synthetic caller',address:ADDRESS});
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-16',days:1}});
  assert.equal(a.status,'available');
  return {invoke,quote,lead,a};
}
test('V50-7: a time taken by someone else is a clear, recoverable answer',async t=>{
  const f=voiceCallFixture(t);
  const A=await offered(f,'+15065550177'),B=await offered(f,'+15065550178');
  assert.equal(A.a.slotOptions[0].label,B.a.slotOptions[0].label);
  const b=await B.invoke('bookAppointment',{slotHandle:B.a.slotOptions[0].slotHandle,leadHandle:B.lead.leadHandle,customerConfirmed:true});
  assert.equal(b.status,'confirmed');
  const r=await A.invoke('bookAppointment',{slotHandle:A.a.slotOptions[0].slotHandle,leadHandle:A.lead.leadHandle,customerConfirmed:true});
  assert.equal(r.status,'unavailable',JSON.stringify(r));assert.equal(r.reason,'SLOT_UNAVAILABLE');assert.match(r.message,/just taken/);
  assert.equal(f.db.prepare('SELECT count(*) n FROM appointments WHERE ownerId=?').get(f.ownerId).n,1);
});
test('V50-7: times for a quote that is already booked: a clear answer',async t=>{
  const f=voiceCallFixture(t);const A=await offered(f,'+15065550177');
  assert.equal((await A.invoke('bookAppointment',{slotHandle:A.a.slotOptions[0].slotHandle,leadHandle:A.lead.leadHandle,customerConfirmed:true})).status,'confirmed');
  const again=await A.invoke('checkAvailability',{quoteHandle:A.quote.quoteHandle,leadHandle:A.lead.leadHandle,preference:{fromDate:'2026-06-17',days:1}});
  assert.equal(again.status,'unavailable',JSON.stringify(again));assert.equal(again.reason,'BOOKING_ALREADY_EXISTS');
});
