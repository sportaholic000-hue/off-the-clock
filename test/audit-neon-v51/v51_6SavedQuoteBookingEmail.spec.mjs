// Neon audit of v51, V51-6 (November 26, 2026): a customer quoted without an
// email (by phone, or the web form with only a phone) who gave their email
// when booking could not be sent the saved quote: only the quote-time email
// counted (QUOTE_EMAIL_RECIPIENT_UNCONFIRMED), and the owner screen hid the
// action. Expected, written before the fix:
// - phone quote with no email, then a booking with jane@example.com: the
//   saved quote can be emailed to jane@example.com (queued);
// - another address is still refused (QUOTE_EMAIL_RECIPIENT_UNCONFIRMED);
// - the owner's quote view offers that confirmed email.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {voiceCallFixture,MOWING_INPUTS,ADDRESS} from '../audit-neon-v49/voiceCallFixture.mjs';
import {createQuoteEmailService} from '../../server/src/quoteEmailService.js';
import {quoteFollowUpView} from '../../server/src/leadCaptureRepair20261006FollowUp.js';
import {usageOwnerQuery} from '../../server/src/billingUsagePolicy.js';

test('V51-6: a booking email confirmed after a phone quote can receive the saved quote',async t=>{
  const f=voiceCallFixture(t),invoke=f.call('+15065550177');
  const match=await invoke('matchService',{query:'Lawn Mowing'});
  const quote=await invoke('getQuote',{serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs:MOWING_INPUTS});assert.equal(quote.status,'quoted');
  const lead=await invoke('captureLead',{name:'Jane Doe',email:'jane@example.com',address:ADDRESS});
  const a=await invoke('checkAvailability',{quoteHandle:quote.quoteHandle,leadHandle:lead.leadHandle,preference:{fromDate:'2026-06-16',days:1}});
  assert.equal((await invoke('bookAppointment',{slotHandle:a.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true})).status,'confirmed');
  const quoteId=f.db.prepare('SELECT id FROM quotes WHERE ownerId=?').get(f.ownerId).id;
  const emails=createQuoteEmailService({database:f.db,environment:{EMAIL_FROM:'quotes@example.com',PUBLIC_BASE_URL:'https://app.example.com/'},clock:()=>Date.parse(f.nowIso)});
  assert.throws(()=>emails.enqueueSavedQuote({ownerId:f.ownerId,quoteId,email:'other@example.com',customerConfirmed:true}),e=>e.code==='QUOTE_EMAIL_RECIPIENT_UNCONFIRMED');
  const sent=emails.enqueueSavedQuote({ownerId:f.ownerId,quoteId,email:'jane@example.com',customerConfirmed:true});
  assert.equal(sent.recipient,'jane@example.com');
  const row=f.db.prepare('SELECT * FROM quotes WHERE ownerId=?').get(f.ownerId);
  const view=quoteFollowUpView(usageOwnerQuery(f.db),row,'owner');
  assert.equal(view.confirmedEmail,'jane@example.com');
});
