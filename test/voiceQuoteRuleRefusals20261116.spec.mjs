import test from 'node:test';
import assert from 'node:assert/strict';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';
import {fixture,address} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {BookingServiceError} from '../server/src/bookingService.js';

// Owner request 2026-11-16: a phone booking or reschedule refused by a quote
// rule (busy-season requote, expired quote or booking request, quote address
// rule) reaches the model with the booking service's own sentence, never as a
// calendar failure, and the saved callback request names that reason. On the
// reschedule path, EXTERNAL_HANDOFF and PREFERRED_TIME_ONLY use checkAvailability's
// own sentences. Real calendar or provider failures are unchanged. The booking
// service is a fake that throws the same errors the real one does
// (quoteBookingLocation.js and bookingService.js). Expected values written
// before running.
const BUSY_IN='This quote was priced for work outside the busy season. The chosen date is in the busy season, so request a new quote for that date before booking the job.';
const BUSY_OUT='This quote was priced for busy-season work. The chosen date is outside the busy season, so request a new quote for that date before booking the job.';
const EXPIRED='This booking request has expired.';
const requote=message=>Object.assign(new Error(message),{code:'REQUOTE_REQUIRED',statusCode:409,details:{reason:'REQUOTE_REQUIRED',recoveryAction:'REQUEST_NEW_QUOTE'}});
const expired=()=>new BookingServiceError('BOOKING_CONTEXT_EXPIRED',410,EXPIRED);
const provider=()=>new BookingServiceError('PROVIDER_UNAVAILABLE',503,'The calendar is temporarily unavailable.',{retryable:true});
const SLOT={slotId:'synthetic-slot-1',label:'Wednesday 9 AM',startUtc:'2026-11-04T13:00:00.000Z',endUtc:'2026-11-04T14:00:00.000Z'};

// Reschedules: the real voice runtime through the production voice routes.
async function reschedule(t,{availability,modify}){
  const calls={modify:0};
  const h=await harness(t,{install:{bookingService:{
    appointmentAvailability:async()=>{if(availability instanceof Error)throw availability;return {body:availability,intentId:'synthetic-intent-2'};},
    modifyAppointment:async()=>{calls.modify++;throw modify();}
  }}});
  const c=await h.connect();
  h.db.prepare("INSERT INTO appointments(id,ownerId,status,customerJson,createdAt) VALUES('synthetic-appointment',?,'CONFIRMED',?,'2026-10-06T12:00:00.000Z')").run(h.owner,JSON.stringify({phone:c.params.From,name:'Sally Synthetic'}));
  const first=await h.tool(c.callback,'getCustomerContext',{});
  c.callback.onmessage({serverContent:{outputTranscription:{text:first.message},turnComplete:true}});
  c.callback.onmessage({serverContent:{inputTranscription:{text:'Yes, speaking.'}}});
  await until(()=>JSON.parse(h.db.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,c.params.CallSid).transcriptJson).some(turn=>turn.text==='Yes, speaking.'));
  const found=await h.tool(c.callback,'getCustomerContext',{callerConfirmedIdentity:true});
  const handle=found.recentAppointments[0].split(' — ')[0];
  const callbacks=()=>h.db.prepare("SELECT json_extract(collectedInputsJson,'$.description') description,json_extract(collectedInputsJson,'$.notes') notes FROM leads WHERE ownerId=? AND type='CALLBACK'").all(h.owner).map(row=>({...row}));
  const outbox=()=>h.db.prepare("SELECT status FROM outboxEvents WHERE ownerId=? AND eventType='voice.appointment_change_requested'").all(h.owner).map(row=>row.status);
  const times=()=>h.tool(c.callback,'checkAvailability',{appointmentHandle:handle});
  const change=slotHandle=>h.tool(c.callback,'modifyAppointment',{appointmentHandle:handle,action:'reschedule',slotHandle,customerConfirmed:true});
  return {h,calls,callbacks,outbox,times,change};
}

for(const [name,error,sentence] of [['into the busy season',()=>requote(BUSY_IN),BUSY_IN],['out of the busy season',()=>requote(BUSY_OUT),BUSY_OUT],['of an expired quote',expired,EXPIRED]])
  test('reschedule '+name+': the model hears the booking service sentence and the callback names it',async t=>{
    const s=await reschedule(t,{availability:{status:'AVAILABLE',slots:[SLOT]},modify:error});
    const offered=await s.times();
    assert.equal(offered.status,'available');
    const result=await s.change(offered.slotOptions[0].slotHandle);
    assert.deepEqual(result,{status:'unavailable',message:sentence});
    assert.deepEqual(s.outbox(),['FAILED']);
    const note='The caller requested an appointment reschedule. It was not made: '+sentence;
    assert.deepEqual(s.callbacks(),[{description:'Appointment reschedule requested',notes:note}]);
    // Asking again gives the same reason and keeps the note.
    assert.deepEqual(await s.change(offered.slotOptions[0].slotHandle),{status:'unavailable',message:sentence});
    assert.equal(s.calls.modify,1);
    assert.deepEqual(s.callbacks(),[{description:'Appointment reschedule requested',notes:note}]);
  });

test('reschedule: a real calendar failure keeps today\'s wording and note',async t=>{
  const s=await reschedule(t,{availability:{status:'AVAILABLE',slots:[SLOT]},modify:provider});
  const offered=await s.times();
  assert.deepEqual(await s.change(offered.slotOptions[0].slotHandle),{status:'unavailable',message:'The appointment change failed.'});
  assert.deepEqual(s.outbox(),['FAILED']);
  assert.deepEqual(s.callbacks(),[{description:'Appointment reschedule requested',notes:'The caller requested an appointment reschedule. Provider confirmation was not received.'}]);
});

for(const [body,heard] of [
  [{status:'EXTERNAL_HANDOFF',externalUrl:'https://synthetic.invalid/book'},{status:'external_handoff',message:'Scheduling is available through the business booking link.'}],
  [{status:'PREFERRED_TIME_ONLY',reason:'BOOKING_CONFIGURATION_INCOMPLETE'},{status:'preferred_time_only',message:'Your preferred time can be recorded, but it is not a confirmed booking.'}],
  [{status:'UNAVAILABLE',reason:'NO_SLOTS',slots:[]},{status:'unavailable',message:'No replacement times are available for that preference.'}],
  [expired(),{status:'unavailable',message:EXPIRED}],
  [requote('[SYNTHETIC] The new address is outside the quoted travel area, so request a new quote before booking the job.'),{status:'unavailable',message:'[SYNTHETIC] The new address is outside the quoted travel area, so request a new quote before booking the job.'}]
])test('reschedule times: '+(body.status||body.code),async t=>{
  const s=await reschedule(t,{availability:body,modify:provider});
  assert.deepEqual(await s.times(),heard);
});

// New bookings: the real voice runtime and dispatcher, in-memory database.
const secret='SYNTHETIC_CAPTURE_REPAIR_KEY_NEVER_LIVE'.padEnd(64,'x');
function booking(t,confirmError){
  const f=fixture(t),c=f.context(),released=[];
  const bookingService={createIntent:()=>({intentId:'intent-synthetic-1'}),availability:async()=>({body:{status:'AVAILABLE',slots:[SLOT]}}),
    hold:async()=>({body:{status:'HELD',holdId:'hold-1'}}),confirm:async()=>{throw confirmError();},releaseHold:async input=>{released.push(input.holdId);return {};}};
  f.db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,?,?,?,?,1,?)").run(c.ownerId,'voice-appointment','r1','book_job',60,'2026-10-06T12:00:00.000Z');
  f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({serviceArea:{mode:'all',cities:[]}}),c.ownerId);
  const runtime=createVoiceToolRuntime({database:f.db,callContext:c,handleSecret:secret,bookingService,clock:()=>new Date('2026-10-06T12:00:00.000Z')});
  const dispatch=createVoiceToolDispatcher({handlers:runtime.handlers,callContext:c,idempotencyStore:runtime.idempotencyStore}).dispatch;
  let n=0;const call=(name,args)=>dispatch({name,args,toolCallId:'synthetic-'+(++n)});
  const callbacks=()=>f.db.prepare("SELECT json_extract(collectedInputsJson,'$.description') description,json_extract(collectedInputsJson,'$.notes') notes FROM leads WHERE ownerId=? AND type='CALLBACK'").all(c.ownerId).map(row=>({...row}));
  return {call,callbacks,released};
}
async function book(s){
  const lead=await s.call('captureLead',{name:'Synthetic Caller',phone:'+19025550100',address,notes:'[SYNTHETIC] fence'});
  const offered=await s.call('checkAvailability',{leadHandle:lead.leadHandle});
  return s.call('bookAppointment',{slotHandle:offered.slotOptions[0].slotHandle,leadHandle:lead.leadHandle,customerConfirmed:true});
}
for(const [name,error,sentence] of [['into the busy season',()=>requote(BUSY_IN),BUSY_IN],['with an expired booking request',expired,EXPIRED]])
  test('new booking '+name+': the model hears the booking service sentence and a callback names it',async t=>{
    const s=booking(t,error);
    assert.deepEqual(await book(s),{status:'unavailable',message:sentence});
    assert.deepEqual(s.released,['hold-1']);
    assert.deepEqual(s.callbacks(),[{description:'Appointment booking requested',notes:'The caller asked to book an appointment. It was not booked: '+sentence}]);
  });
test('new booking: a real calendar failure is unchanged (the tool call is refused)',async t=>{
  const s=booking(t,provider);
  await assert.rejects(book(s));
  assert.deepEqual(s.released,['hold-1']);
  assert.deepEqual(s.callbacks(),[]);
});
