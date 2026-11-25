// Neon re-audit of v49, NEW-4 (November 25, 2026): availability offered dates
// that confirm then refused with REQUOTE_REQUIRED, e.g. an off-season mowing
// quote offered busy-season dates. Expected, written before the fix
// (busy season July and August at 15%, quote made June 15, job booking):
// - asking for June 30 and July 1: only the June 30 times are offered, and
//   booking one is confirmed (first version asked from June 29 for 5 days;
//   the 10-time cap filled with June before July, so it passed before the
//   fix and proved nothing; corrected);
// - asking from July 1: nothing bookable at this price, so the caller hears
//   the same reason confirm gives ("priced for work outside the busy
//   season"), status unavailable, reason REQUOTE_REQUIRED;
// - the web booking service answers the same case with 409 REQUOTE_REQUIRED
//   (the widget already sends the customer back to the quote on that code);
// - a site visit (not the job date) is unchanged: July visits are offered.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceCallFixture,MOWING_INPUTS,ADDRESS} from './voiceCallFixture.mjs';

const season={defaults:{peakMonths:[7,8],peakSurchargePercent:15},horizonDays:45};
async function start(f){
  const invoke=f.call('+15065550177');
  const match=await invoke('matchService',{query:'Lawn Mowing'});
  let quote=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs:{...MOWING_INPUTS,workMonth:'june'}});
  assert.equal(quote.status,'quoted',JSON.stringify(quote));assert.equal(quote.midEstimate,105);
  const lead=await invoke('captureLead',{name:'Synthetic caller',address:ADDRESS});
  return {invoke,quote,lead};
}
const months=slots=>[...new Set(slots.map(s=>s.label.match(/(January|February|March|April|May|June|July|August|September|October|November|December)/)[1]))];

test('NEW-4: a job booking only offers dates the quote price holds for',async t=>{
  const f=voiceCallFixture(t,{...season,bookingMode:'book_job'});const {invoke,quote,lead}=await start(f);
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-30',days:2}});
  assert.equal(a.status,'available',JSON.stringify(a));
  assert.deepEqual(months(a.slotOptions),['June']);
  const booked=await invoke('bookAppointment',{slotHandle:a.slotOptions.at(-1).slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true});
  assert.equal(booked.status,'confirmed',JSON.stringify(booked));
});
test('NEW-4: only busy-season dates asked for: the caller is told a new quote is needed',async t=>{
  const f=voiceCallFixture(t,{...season,bookingMode:'book_job'});const {invoke,quote,lead}=await start(f);
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-07-01',days:3}});
  assert.equal(a.status,'unavailable',JSON.stringify(a));assert.equal(a.reason,'REQUOTE_REQUIRED');
  assert.match(a.message,/priced for work outside the busy season/);
  const intentId=f.db.prepare("SELECT id FROM bookingIntents WHERE ownerId=? AND sourceType='quote'").get(f.ownerId).id;
  await assert.rejects(f.booking.availability({ownerId:f.ownerId,intentId,filters:{fromDate:'2026-07-01',days:3,location:{...ADDRESS}}}),e=>e.code==='REQUOTE_REQUIRED'&&e.statusCode===409);
});
test('NEW-4: a site visit is not the job date and is unchanged',async t=>{
  const f=voiceCallFixture(t,{...season,bookingMode:'site_visit_first'});const {invoke,quote,lead}=await start(f);
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-07-01',days:3}});
  assert.equal(a.status,'available',JSON.stringify(a));assert.deepEqual(months(a.slotOptions),['July']);
});
test('NEW-4: confirm keeps its own date check (a time held before the owner switched to job booking)',async t=>{
  const f=voiceCallFixture(t,{...season,bookingMode:'site_visit_first'});const {invoke,quote,lead}=await start(f);
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-07-01',days:1}});
  assert.equal(a.status,'available');
  f.db.prepare("UPDATE bookingPolicies SET bookingMode='book_job' WHERE ownerId=?").run(f.ownerId);
  const booked=await invoke('bookAppointment',{slotHandle:a.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true}).catch(e=>e);
  assert.equal(booked.code,'REQUOTE_REQUIRED',JSON.stringify(booked));assert.match(booked.message,/priced for work outside the busy season/);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM appointments WHERE ownerId=?').get(f.ownerId).n,0);
  assert.equal(f.events.length,0);
});
