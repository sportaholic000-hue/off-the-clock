import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,address} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';

// Owner ruling 2026-11-16: when the booking service says a job cannot be booked
// until the business reviews the request (REVIEW_REQUIRES_SITE_VISIT), the
// model is told that, so it stops offering other dates. Every other reason is
// unchanged. Fake booking service; in-memory database. Expected values written
// before running.
const secret='SYNTHETIC_CAPTURE_REPAIR_KEY_NEVER_LIVE'.padEnd(64,'x');
const REVIEW='This request needs a site visit or owner review before the job can be booked.';
function setup(t,{withHandle=false}={}){
  const f=fixture(t),c=f.context();let body;
  const bookingService={createIntent:()=>({intentId:'intent-synthetic-1'}),availability:async()=>({body}),appointmentAvailability:async()=>({body,intentId:'intent-synthetic-2'})};
  f.db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,?,?,?,?,1,?)").run(c.ownerId,'voice-appointment','r1','book_job',60,'2026-10-06T12:00:00.000Z');
  f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({serviceArea:{mode:'all',cities:[]}}),c.ownerId);
  const runtime=createVoiceToolRuntime({database:f.db,callContext:c,handleSecret:secret,bookingService,clock:()=>new Date('2026-10-06T12:00:00.000Z')});
  const dispatch=createVoiceToolDispatcher({handlers:runtime.handlers,callContext:c,idempotencyStore:runtime.idempotencyStore}).dispatch;
  let n=0;const call=(name,args)=>dispatch({name,args,toolCallId:'synthetic-'+(++n)});
  return {f,c,call,set:value=>{body=value;}};
}
// What the model hears for each reason, through the real dispatcher.
const CASES=[
  [{status:'UNAVAILABLE',reason:'REVIEW_REQUIRES_SITE_VISIT'},{status:'unavailable',message:REVIEW}],
  [{status:'UNAVAILABLE',reason:'NO_SLOTS',slots:[]},{status:'unavailable',message:'No bookable times are available for that preference.'}],
  [{status:'UNAVAILABLE'},{status:'unavailable',message:'No bookable times are available for that preference.'}],
  [{status:'PREFERRED_TIME_ONLY',reason:'BOOKING_CONFIGURATION_INCOMPLETE'},{status:'preferred_time_only',message:'Your preferred time can be recorded, but it is not a confirmed booking.'}],
  [{status:'PREFERRED_TIME_ONLY',reason:'OUT_OF_AREA'},{status:'preferred_time_only',message:'Your preferred time can be recorded, but it is not a confirmed booking.'}],
  [{status:'EXTERNAL_HANDOFF',externalUrl:'https://synthetic.invalid/book'},{status:'external_handoff',message:'Scheduling is available through the business booking link.'}]
];
for(const [body,heard] of CASES)test('checkAvailability for a lead: '+(body.reason||body.status),async t=>{
  const s=setup(t);
  const lead=await s.call('captureLead',{name:'Synthetic Caller',phone:'+19025550100',address,notes:'[SYNTHETIC] roof leak'});
  s.set(body);
  assert.deepEqual(await s.call('checkAvailability',{leadHandle:lead.leadHandle}),heard);
});
