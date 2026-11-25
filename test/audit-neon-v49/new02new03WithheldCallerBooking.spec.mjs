// Neon re-audit of v49, NEW-2 and NEW-3 (November 25, 2026): my v49 #7 fix let
// a caller with a withheld number get a quote with a callback number, but the
// rest of the call was not tested end to end. Expected, written before the fix:
// NEW-2 (booking):
// - withheld caller, callback +15065550199 given to getQuote and captureLead:
//   quote 10,500 cents ($105.00) -> availability -> bookAppointment confirmed;
//   the appointment's customer phone is +15065550199;
// - in the same call that caller can reschedule the appointment it just booked;
//   CORRECTED after reading the booking service: a phone reschedule requires
//   the caller ID to match the appointment phone (bookingService
//   ownedAppointment), a deliberate security check a withheld number cannot
//   pass. Kept: a withheld caller's change is refused. Found instead: a caller
//   WITH a number could not reschedule in the same call either (the booking
//   handle carried the lead's customer id; voice appointments store none).
//   Expected: that caller can now reschedule in the same call;
// - a withheld caller with no callback number on the lead is asked for one
//   (needs_details, CALLBACK_PHONE_REQUIRED) instead of a 400 from booking;
// - a caller with a real number is unchanged: appointment phone = caller ID.
// NEW-3 (quote):
// - withheld caller with a callback: the saved quote is linked to a customer
//   whose phone is the callback number (it was null);
// - when the callback question is asked on a service that needs a scope
//   confirmation, the question still carries the confirmation token.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceCallFixture,MOWING_INPUTS,ADDRESS} from './voiceCallFixture.mjs';
import {flooring} from '../../verification/engine-independent/fixtures.mjs';
import {quoteEmailFixture} from '../quoteEmailFixture.mjs';
import {secret,at} from '../leadCaptureRepair20261006Fixture.mjs';
import {savePricebook,loadPricebook} from '../../server/priceBookService.js';
import {approveApplicationService,bookRevision} from '../../server/src/quoteDoneBridge.js';
import {createVoiceToolRuntime} from '../../server/src/voice/voiceToolRuntime.js';

async function quoteAndBook(f,from,{quoteCallback,leadPhone}={}){
  const invoke=f.call(from);
  const match=await invoke('matchService',{query:'Lawn Mowing'});assert.equal(match.status,'matched');
  const quote=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs:MOWING_INPUTS,...(quoteCallback?{callbackPhone:quoteCallback}:{})});
  assert.equal(quote.status,'quoted',JSON.stringify(quote));assert.equal(quote.midEstimate,105);
  const lead=await invoke('captureLead',{name:'Synthetic caller',...(leadPhone?{phone:leadPhone}:{}),address:ADDRESS});
  const availability=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-16',days:2}});
  assert.equal(availability.status,'available',JSON.stringify(availability));
  const booked=await invoke('bookAppointment',{slotHandle:availability.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true});
  return {invoke,quote,lead,availability,booked};
}
const appointment=f=>{const row=f.db.prepare('SELECT * FROM appointments WHERE ownerId=?').get(f.ownerId);return {row,customer:JSON.parse(row.customerJson)};};

test('NEW-2: a withheld caller who gives a callback number can book; the appointment keeps that number',async t=>{
  const f=voiceCallFixture(t);
  const {booked}=await quoteAndBook(f,'anonymous',{quoteCallback:'+15065550199',leadPhone:'+15065550199'});
  assert.equal(booked.status,'confirmed',JSON.stringify(booked));
  assert.equal(appointment(f).customer.phone,'+15065550199');
  assert.equal(f.events.length,1);
});
test('NEW-2: a caller with a number can reschedule in the same call',async t=>{
  const f=voiceCallFixture(t);
  const {invoke,booked}=await quoteAndBook(f,'+15065550177',{});
  assert.equal(booked.status,'confirmed');
  const before=f.db.prepare('SELECT startAtUtc FROM appointments WHERE ownerId=?').get(f.ownerId).startAtUtc;
  const slots=await invoke('checkAvailability',{appointmentHandle:booked.appointmentHandle,preference:{fromDate:'2026-06-17',days:2}});
  assert.equal(slots.status,'available',JSON.stringify(slots));
  const moved=await invoke('modifyAppointment',{appointmentHandle:booked.appointmentHandle,action:'reschedule',slotHandle:slots.slotOptions.at(-1).slotHandle,customerConfirmed:true});
  assert.equal(moved.status,'rescheduled',JSON.stringify(moved));
  const after=f.db.prepare('SELECT startAtUtc,status FROM appointments WHERE ownerId=?').get(f.ownerId);
  assert.notEqual(after.startAtUtc,before);assert.equal(after.status,'CONFIRMED');
});
test('NEW-2: a withheld caller cannot change a booking by phone (caller ID cannot be verified)',async t=>{
  const f=voiceCallFixture(t);
  const {invoke,booked}=await quoteAndBook(f,'anonymous',{quoteCallback:'+15065550199',leadPhone:'+15065550199'});
  assert.equal(booked.status,'confirmed');
  await assert.rejects(invoke('checkAvailability',{appointmentHandle:booked.appointmentHandle,preference:{fromDate:'2026-06-17',days:2}}),e=>e.code==='INVALID_APPOINTMENT_HANDLE');
});
test('NEW-2: a withheld caller with no callback number on the lead is asked for one',async t=>{
  const f=voiceCallFixture(t);
  const {booked}=await quoteAndBook(f,'anonymous',{quoteCallback:'+15065550199'});
  assert.equal(booked.status,'needs_details',JSON.stringify(booked));assert.equal(booked.reason,'CALLBACK_PHONE_REQUIRED');
  assert.equal(f.events.length,0);
});
test('NEW-2: a caller with a real number is unchanged (appointment phone = caller ID)',async t=>{
  const f=voiceCallFixture(t);
  const {booked}=await quoteAndBook(f,'+15065550177',{leadPhone:'+15065550222'});
  assert.equal(booked.status,'confirmed');
  assert.equal(appointment(f).customer.phone,'+15065550177');
});
test('NEW-3: a withheld caller\'s quote is linked to the customer with the callback number',async t=>{
  const f=voiceCallFixture(t);
  const invoke=f.call('anonymous');
  const match=await invoke('matchService',{query:'Lawn Mowing'});
  const quote=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs:MOWING_INPUTS,callbackPhone:'+15065550199'});
  assert.equal(quote.status,'quoted');
  const internal=JSON.parse(f.db.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=?').get(f.ownerId).internalOutcomeJson);
  assert.ok(internal.customerId,'quote not linked to a customer');
  assert.equal(f.db.prepare('SELECT phoneE164 FROM customers WHERE ownerId=? AND id=?').get(f.ownerId,internal.customerId).phoneE164,'+15065550199');
});
test('NEW-3: the callback question keeps the scope confirmation token',async t=>{
  // Laminate with underlayment confirmation, as in quoteEngineLeftovers20261007.
  const fl=flooring('laminate');delete fl.ownerPricing.pricing.perStepPrice;
  Object.assign(fl.ownerPricing.pricing,{laborPerSqft:{laminate:100},materialPerSqft:{laminate:200},scopeDetails:{
    floor_underlayment_hardwood:{description:'[SYNTHETIC] hardwood plywood',mode:'installed_area_sell_price'},
    floor_underlayment_laminate:{description:'[SYNTHETIC] laminate foam',mode:'installed_area_sell_price'}},
    scopeRates:{floor_underlayment_hardwood:100,floor_underlayment_laminate:100}});
  fl.customerInputs.underlaymentScopeConfirmed=true;delete fl.ownerPricing.origin;
  const h=quoteEmailFixture(t);savePricebook(h.c.ownerId,{services:[fl.ownerPricing],defaults:{...fl.businessDefaults,currency:'CAD'}});
  const book=loadPricebook(h.c.ownerId);approveApplicationService(h.c.ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC',quoteInstant:at});
  const c={...h.c,from:'anonymous'};h.db.prepare('UPDATE calls SET callerNumber=? WHERE ownerId=? AND callSid=?').run('anonymous',c.ownerId,c.callSid);
  const runtime=createVoiceToolRuntime({database:h.db,callContext:c,handleSecret:secret,clock:()=>new Date(at)});
  const invoke=(name,args)=>runtime.handlers[name]({context:c,args});
  const match=await invoke('matchService',{query:fl.ownerPricing.service}),inputs=structuredClone(fl.customerInputs);delete inputs.confirmedFacts;
  const first=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true});
  const token=first.questionContract.fields.find(x=>x.field==='underlaymentScopeConfirmed').confirmationToken;assert.ok(token);
  const ask=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,scopeConfirmations:{underlaymentScopeConfirmed:token}});
  assert.equal(ask.status,'needs_details');assert.match(ask.followUps.join(' '),/callback phone number/);
  assert.equal(ask.questionContract.fields.find(x=>x.field==='underlaymentScopeConfirmed').confirmationToken,token);
  const done=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerInputs:inputs,customerConfirmed:true,scopeConfirmations:{underlaymentScopeConfirmed:token},callbackPhone:'+15065550199'});
  assert.equal(done.status,'quoted',JSON.stringify(done));assert.equal(done.midEstimate,852);
});
