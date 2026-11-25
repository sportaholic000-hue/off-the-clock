// Neon audit of v50, V50-2 (November 26, 2026): a quote with exactly one
// named option could not be booked as a job: the website shows no option
// picker for one option and confirm refused "Choose a quote option", and the
// phone refused with TIER_SELECTION_REQUIRED. Expected, written before the
// fix (mowing with one option "Standard", job booking):
// - phone: quote -> availability -> booking confirmed, the appointment's
//   chosen option is "Standard";
// - website path (booking service, no option sent): confirmed, "Standard";
// - two options: the phone still asks which option (unchanged).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {voiceCallFixture,mowingServiceCents,MOWING_INPUTS,ADDRESS} from '../audit-neon-v49/voiceCallFixture.mjs';

function withTiers(t,names){
  const svc=mowingServiceCents('tier-owner');svc.tiers=names.map(name=>({name,overrides:{}}));
  return voiceCallFixture(t,{serviceCents:svc,bookingMode:'book_job',defaultsFull:{currency:'CAD',quoteTimeZone:'America/Moncton',markupMode:'markup',markupPercent:0,markupApplies:Object.fromEntries(['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'].map(c=>[c,false])),overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,peakMonths:[],peakSurchargePercent:0}});
}
async function quoted(f){
  const invoke=f.call('+15065550177');
  const match=await invoke('matchService',{query:'Lawn Mowing'});
  const quote=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs:MOWING_INPUTS});
  assert.equal(quote.status,'quoted',JSON.stringify(quote));
  const lead=await invoke('captureLead',{name:'Synthetic caller',address:ADDRESS});
  return {invoke,quote,lead};
}
test('V50-2: one option, by phone: booked under that option',async t=>{
  const f=withTiers(t,['Standard']);const {invoke,quote,lead}=await quoted(f);
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-16',days:1}});
  assert.equal(a.status,'available',JSON.stringify(a));
  const b=await invoke('bookAppointment',{slotHandle:a.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true});
  assert.equal(b.status,'confirmed',JSON.stringify(b));
  assert.equal(f.db.prepare('SELECT tierChosen FROM appointments WHERE ownerId=?').get(f.ownerId).tierChosen,'Standard');
});
test('V50-2: one option, website path with no option sent: booked under that option',async t=>{
  const f=withTiers(t,['Standard']);await quoted(f);
  const intentId=f.db.prepare("SELECT id FROM bookingIntents WHERE ownerId=? AND sourceType='quote'").get(f.ownerId).id;
  const location={addressLine1:'10 King St',addressLine2:'',city:'Saint John',region:'NB',postalCode:'E2L 4L1',country:'CA'};const customer={name:'Synthetic caller',email:'synthetic@example.com',phone:'+15065550177'};
  const avail=await f.booking.availability({ownerId:f.ownerId,intentId,filters:{fromDate:'2026-06-16',days:1,scopeConfirmation:'UNCHANGED',customer,location}});
  const slotId=avail.body.slots[0].slotId;
  const held=await f.booking.hold({ownerId:f.ownerId,intentId,idempotencyKey:crypto.randomUUID(),slotId});
  const done=await f.booking.confirm({ownerId:f.ownerId,intentId,idempotencyKey:crypto.randomUUID(),body:{holdId:held.body.holdId,confirmedSlotId:slotId,explicitConfirmation:true,addressConfirmation:true,customer,location}});
  assert.equal(done.body.status,'CONFIRMED',JSON.stringify(done.body));
  assert.equal(f.db.prepare('SELECT tierChosen FROM appointments WHERE ownerId=?').get(f.ownerId).tierChosen,'Standard');
});
test('V50-2: two options: the phone still asks which one',async t=>{
  const f=withTiers(t,['Standard','Premium']);const {invoke,quote,lead}=await quoted(f);
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-16',days:1}});
  assert.equal(a.status,'unavailable');assert.equal(a.reason,'TIER_SELECTION_REQUIRED');
});
