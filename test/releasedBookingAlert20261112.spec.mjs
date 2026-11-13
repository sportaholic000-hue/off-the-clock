import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,CUSTOMER} from './fixtures/bookingCalendar20261006.mjs';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';

// A first booking left waiting for calendar confirmation and then released by
// the background pass (the calendar answers that the event does not exist)
// raises one owner alert, sent by email through the normal owner alert sender
// and listed on the dashboard. Fakes only: the calendar is the fixture's
// in-memory fake and the email transport is a fake fetch; nothing reaches
// Google Calendar, Resend, Twilio or Gemini.
// Expected before the change: the release raises no owner alert, so the
// release, email and dashboard tests fail; the confirmed and unreadable cases pass.
const ownerId='synthetic-a';
const SERVICE='[SYNTHETIC] Cedar fence';
const EXPECTED_LINES=[
  'Booking not confirmed — time released',
  'The calendar never confirmed this booking, so it is not booked and the time was released.',
  'Customer: '+CUSTOMER.name,
  'Phone: '+CUSTOMER.phone,
  'Email: '+CUSTOMER.email,
  'Service: '+SERVICE,
  'Requested time: Wed, Oct 7, 2026, 9:00 – 9:45 AM ADT',
  'Call the customer back to book a new time.'
];

async function waitingFirstBooking(t){
  const f=fixture(t),{i,held,slot}=await f.ready(),originalCreate=f.calendar.createEvent;
  assert.equal(f.db.prepare("UPDATE quotes SET resultJson=? WHERE ownerId=? AND id=(SELECT sourceId FROM bookingIntents WHERE ownerId=? AND id=? AND sourceType='quote')")
    .run(JSON.stringify({customerResult:{pricedScope:{service:SERVICE}}}),ownerId,ownerId,i.intentId).changes,1);
  // The calendar keeps the event; the create answer is lost, so the booking waits.
  f.calendar.createEvent=async request=>{await originalCreate(request);return {status:'PENDING_CONFIRMATION',eventId:request.eventId};};
  const pending=await f.booking.confirm(f.request(i,held));
  assert.equal(pending.body.status,'PENDING_CONFIRMATION');
  f.calendar.createEvent=originalCreate;
  const count=type=>f.db.prepare('SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType=?').get(ownerId,type).n;
  const appointment=()=>f.db.prepare('SELECT status FROM appointments WHERE ownerId=?').get(ownerId).status;
  const backgroundPass=async()=>{const errors=[],stop=f.booking.startChangeReconciler({intervalMs:3600000,onError:code=>errors.push(code)});await stop();assert.deepEqual(errors,[]);};
  const noTextMessages=()=>{
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM voiceSmsDeliveries').get().n,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE eventType LIKE '%sms%'").get().n,0);
  };
  // The calendar answers that the event does not exist, and no retry with the same event ID is supported.
  const eventMissing=()=>{f.events.clear();f.calendar.idempotentCreateByEventId=false;};
  return {f,i,slot,pending,count,appointment,backgroundPass,noTextMessages,eventMissing};
}

test('background release of a waiting first booking raises exactly one owner alert; a second pass raises none',async t=>{
  const {f,i,slot,count,appointment,backgroundPass,noTextMessages,eventMissing}=await waitingFirstBooking(t);
  assert.equal(count('booking.released'),0);
  eventMissing();
  await backgroundPass();
  assert.equal(appointment(),'PROVIDER_FAILED');
  assert.equal(count('booking.released'),1);
  assert.equal(count('booking.confirmed'),0);
  const alert=f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='booking.released'").get(ownerId);
  assert.equal(alert.aggregateId,f.db.prepare('SELECT id FROM appointments WHERE ownerId=?').get(ownerId).id);
  assert.equal(alert.eventKey,'booking.released:'+alert.aggregateId);
  assert.equal(alert.callId,ownerId+'-call');
  assert.equal(alert.status,'PENDING');
  await backgroundPass();
  assert.equal(count('booking.released'),1);
  // The released slot is offered again.
  assert.ok((await f.slots(f.intent())).some(row=>row.startUtc===slot.startUtc));
  // The other owner gets nothing.
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId='synthetic-b'").get().n,0);
  noTextMessages();
  assert.ok(i.ownerId);
});

test('the released-booking email goes through the normal owner alert sender with the caller details',async t=>{
  const {f,backgroundPass,noTextMessages,eventMissing}=await waitingFirstBooking(t);
  eventMissing();
  await backgroundPass();
  const environment={ALLOW_PROVIDER_WRITES:'true',EMAIL_PROVIDER:'resend',EMAIL_DELIVERY_ENABLED:'true',
    RESEND_API_KEY:'[SYNTHETIC]-resend-key',EMAIL_FROM:'alerts@example.invalid',CLIENT_URL:'https://app.example.invalid/'};
  const requests=[];
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    requests.push({url:String(url),options});
    return {ok:true,status:200,json:async()=>({id:'SYNTHETIC-provider-'+requests.length})};
  });
  // Default send and ready: the production owner alert sender, with fetch faked.
  const alerts=createOwnerAlertService({database:f.db,environment,clock:()=>Date.parse('2026-10-06T12:00:00.000Z'),
    readReceipt:async()=>{throw Error('[SYNTHETIC] receipt not read in this test');}});
  for(let n=0;n<5;n++)if(!await alerts.processOne(ownerId))break;
  const alert=f.db.prepare("SELECT * FROM ownerAlerts WHERE ownerId=? AND eventType='booking.released'").get(ownerId);
  assert.equal(alert.status,'ACCEPTED');
  const sent=requests.map(r=>({url:r.url,method:r.options.method,headers:r.options.headers,body:JSON.parse(r.options.body)}))
    .filter(r=>r.body.subject==='Off The Clock: Booking not confirmed — time released');
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,'https://api.resend.com/emails');
  assert.equal(sent[0].method,'POST');
  assert.equal(sent[0].headers['Idempotency-Key'],'owner-alert/'+alert.id);
  assert.deepEqual(sent[0].body.to,[ownerId+'@example.invalid']);
  assert.equal(sent[0].body.from,'alerts@example.invalid');
  assert.deepEqual(sent[0].body.text.split('\n'),[...EXPECTED_LINES,'Open saved record: https://app.example.invalid/calls?record='+encodeURIComponent(ownerId+'-call')]);
  assert.ok(requests.every(r=>r.url==='https://api.resend.com/emails'),'only the owner email provider is called');
  noTextMessages();
});

test('the released booking counts as needing attention on the dashboard until reviewed, with the caller details',async t=>{
  const {f,backgroundPass,eventMissing}=await waitingFirstBooking(t);
  eventMissing();
  await backgroundPass();
  const listed=()=>f.ownerCalls.dashboard(ownerId).notifications;
  const released=()=>listed().find(row=>row.eventType==='booking.released');
  assert.equal(listed()[0].eventType,'booking.released','listed first while unreviewed');
  assert.equal(released().title,'Booking not confirmed — time released');
  assert.deepEqual(released().details,EXPECTED_LINES.slice(1));
  // Email accepted: still listed first until the owner marks it reviewed.
  f.db.prepare("UPDATE ownerAlerts SET status='ACCEPTED' WHERE ownerId=?").run(ownerId);
  assert.equal(listed()[0].eventType,'booking.released');
  f.db.prepare("UPDATE ownerAlerts SET seenAt=? WHERE ownerId=? AND eventType='booking.released'").run('2026-10-06T12:30:00.000Z',ownerId);
  assert.equal(released(),undefined);
});

test('a confirmed first booking still raises exactly one "Booking confirmed" alert and no released alert',async t=>{
  const {f,count,appointment,backgroundPass,noTextMessages}=await waitingFirstBooking(t);
  await backgroundPass();
  assert.equal(appointment(),'CONFIRMED');
  assert.equal(count('booking.confirmed'),1);
  assert.equal(count('booking.released'),0);
  await backgroundPass();
  assert.equal(count('booking.confirmed'),1);
  assert.equal(count('booking.released'),0);
  assert.equal(f.ownerCalls.dashboard(ownerId).notifications.find(row=>row.eventType==='booking.confirmed').title,'Booking confirmed');
  noTextMessages();
});

test('a waiting first booking whose calendar cannot be read keeps waiting and raises no alert',async t=>{
  const {f,slot,count,appointment,backgroundPass,noTextMessages}=await waitingFirstBooking(t);
  f.calendar.getEvent=async()=>{throw Error('[SYNTHETIC] calendar read failed');};
  await backgroundPass();
  await backgroundPass();
  assert.equal(appointment(),'PENDING_CONFIRMATION');
  assert.equal(count('booking.released'),0);
  assert.equal(count('booking.confirmed'),0);
  assert.equal((await f.slots(f.intent())).some(row=>row.startUtc===slot.startUtc),false,'a waiting slot is not offered again');
  noTextMessages();
});

test('a booking the calendar refuses during the request (the customer is told at once) raises one released alert',async t=>{
  const f=fixture(t),{i,held}=await f.ready();
  f.calendar.createEvent=async()=>{throw Error('[SYNTHETIC] calendar refused');};
  await assert.rejects(f.booking.confirm(f.request(i,held)));
  assert.equal(f.db.prepare('SELECT status FROM appointments WHERE ownerId=?').get(ownerId).status,'PROVIDER_FAILED');
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType='booking.released'").get(ownerId).n,1);
});

test('a waiting first booking released by the customer\'s own status check raises the same single alert',async t=>{
  const {f,i,pending,count,backgroundPass}=await waitingFirstBooking(t);
  // The calendar answers with the event cancelled; the customer's poll releases the booking.
  f.calendar.getEvent=async r=>({status:'CANCELLED',eventId:r.eventId});
  const poll=await f.booking.getConfirmationStatus({bookingToken:i.bookingToken,confirmationId:pending.body.confirmationId});
  assert.equal(poll.body.status,'FAILED');
  assert.equal(count('booking.released'),1);
  await backgroundPass();
  assert.equal(count('booking.released'),1);
});
