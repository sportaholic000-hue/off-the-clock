import './pricebookTestEnv.mjs';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';
import {compileVoiceSystemInstruction,EMERGENCY_RULE,END_CALL_RULE,VOICE_GUIDE_SERVICE_TYPES} from '../server/src/voice/voicePromptCompiler.js';
import {END_CALL_TOOL_DECLARATION} from '../server/src/voice/toolSchemas.js';
import {RECEPTIONIST_ENDED_CALL} from '../server/src/voice/geminiMediaBridge.js';
import {harness,until} from './voiceLifecycle20261006Fixture.mjs';

// Two receptionist changes. Expected results written before execution:
// 1. Calendar booking on calls (platform spec, onboarding step 8: calendar is
//    skippable and the agent collects preferred times until connected).
//    - callBookingAvailable is true only when at least one enabled booking
//      policy is DIRECT by the rule the voice booking tools use
//      (resolveBookingCapability: Google calendar, booking hours and a service
//      area); Calendly, a disabled policy, no service area or an incomplete
//      setup is false, and another business's setup never counts.
//    - Operator and QuoteDone without calendar booking get a CALENDAR BOOKING
//      rule, never offer to book or schedule, never get the booking-flow lines,
//      the booking close, or "→ book" in a trade flow, and the spoken
//      roof-repair inspection line asks when suits them. Callback, transfer and
//      quote-email rules stay.
//    - With calendar booking, or when the status is not given, the text is the
//      same as before. Starter is unchanged either way.
//    - The production call path passes the real status: an Operator business
//      with no calendar gets the rule; one with a complete setup does not. The
//      tools offered are the same in both.
// 2. Emergencies: after telling the caller to hang up and call 911 and flagging
//    it, the receptionist says goodbye and ends the call with endCall reason
//    emergency. On a real call that ends the call like any receptionist hang-up
//    and keeps the urgent flag.

const GUIDE=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const PLANS={
  starter:{booking:false,transfer:false,phoneQuoting:false},
  operator:{booking:true,transfer:true,phoneQuoting:false},
  quoteDone:{booking:true,transfer:true,phoneQuoting:true},
};
const ALL_SERVICES=VOICE_GUIDE_SERVICE_TYPES.map(serviceType=>({serviceType,serviceLabel:'Synthetic '+serviceType.toLowerCase().replaceAll('_',' '),active:true,status:'QUOTING LIVE',offerings:[]}));
function compile(capabilities,services=[]){
  return compileVoiceSystemInstruction({guideText:GUIDE,business:{businessName:'[SYNTHETIC] Cedar Co',agentName:'Nova'},services,knowledge:{about:'[SYNTHETIC] About',hours:'[SYNTHETIC] Hours'},capabilities});
}
const BOOKING_TEXT=['Want me to get you on the schedule','BOOKING CLOSE','Your booking is confirmed','For an existing appointment','checkAvailability with leadHandle alone','offer to handle the quote, capture or booking on this call.','callers receive booking confirmations'];

// ── callBookingAvailable ────────────────────────────────────────────────
function bookingDb(){
  const db=new Database(':memory:');for(const sql of CREATE_TABLE_STATEMENTS)db.exec(sql);
  const now='2026-11-19T12:00:00.000Z';
  for(const id of ['[SYNTHETIC]-a','[SYNTHETIC]-b']){
    db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'x','x','x','Operator','active','UTC','owner',?)").run(id,id+'@example.invalid',now);
    db.prepare('INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,?,?)').run(id,JSON.stringify({serviceArea:{mode:'all'}}),now);
  }
  const settings=(ownerId,patch={})=>{const row={ownerId,revision:'s1',timezone:'America/Moncton',provider:'google',calendarId:'synthetic-calendar',externalUrl:null,weeklyAvailabilityJson:JSON.stringify({mon:[{start:'09:00',end:'17:00'}]}),blackoutsJson:'[]',bookingHorizonDays:30,minimumNoticeMinutes:60,slotIncrementMinutes:30,bufferBeforeMinutes:0,bufferAfterMinutes:0,directBookingEnabled:1,updatedAt:now,...patch};
    db.prepare(`INSERT OR REPLACE INTO bookingSettings(${Object.keys(row)}) VALUES(${Object.keys(row).map(()=>'?')})`).run(...Object.values(row));};
  const policy=(ownerId,patch={})=>{const row={ownerId,serviceId:'voice-appointment',revision:'p1',bookingMode:'site_visit_first',durationMinutes:60,enabled:1,updatedAt:now,...patch};
    db.prepare(`INSERT OR REPLACE INTO bookingPolicies(${Object.keys(row)}) VALUES(${Object.keys(row).map(()=>'?')})`).run(...Object.values(row));};
  return {db,settings,policy};
}
test('callBookingAvailable: only a complete Google calendar setup with an enabled booking policy and a service area',async()=>{
  const {callBookingAvailable:available}=await import('../server/src/voice/callBooking.js');
  const {usageOwnerQuery}=await import('../server/src/billingUsagePolicy.js');
  const {db,settings,policy}=bookingDb(),A='[SYNTHETIC]-a',B='[SYNTHETIC]-b';
  const callBookingAvailable=(database,ownerId)=>available(usageOwnerQuery(database),ownerId);
  assert.equal(callBookingAvailable(db,A),false,'nothing set up');
  settings(A);assert.equal(callBookingAvailable(db,A),false,'calendar but no booking policy');
  policy(A,{enabled:0});assert.equal(callBookingAvailable(db,A),false,'policy turned off');
  policy(A);assert.equal(callBookingAvailable(db,A),true,'complete setup');
  policy(A,{serviceId:'synthetic-roofing',bookingMode:'book_job',durationMinutes:240});policy(A,{enabled:0});
  assert.equal(callBookingAvailable(db,A),true,'any enabled policy counts');
  for(const [patch,why] of [[{directBookingEnabled:0},'direct booking off'],[{calendarId:null},'no calendar chosen'],[{provider:'calendly',externalUrl:'https://calendly.example.invalid/synthetic'},'Calendly link only'],[{timezone:'Not/AZone'},'invalid timezone'],[{bookingHorizonDays:null},'booking horizon missing']]){
    settings(A,patch);assert.equal(callBookingAvailable(db,A),false,why);
  }
  settings(A);assert.equal(callBookingAvailable(db,A),true);
  db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run('{}',A);
  assert.equal(callBookingAvailable(db,A),false,'no service area: the booking tools refuse too');
  db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({serviceArea:{mode:'all'}}),A);
  settings(B);policy(B);db.prepare('DELETE FROM bookingSettings WHERE ownerId=?').run(A);
  assert.equal(callBookingAvailable(db,A),false,'another business\'s calendar never counts');
  assert.equal(callBookingAvailable(db,B),true);
  db.close();
});

// ── compiled instructions ───────────────────────────────────────────────
test('no calendar: Operator and QuoteDone never offer a booking and take preferred times',()=>{
  for(const [name,capabilities,services] of [['Operator',PLANS.operator,[]],['QuoteDone, every trade live',PLANS.quoteDone,ALL_SERVICES],['QuoteDone, no live services',PLANS.quoteDone,[]]]){
    const text=compile({...capabilities,calendarBooking:false},services);
    assert.ok(text.startsWith('CALENDAR BOOKING: This business has not set up calendar booking for calls'),name);
    assert.ok(text.includes('save their request and preferred time with captureLead'),name);
    for(const booking of BOOKING_TEXT)assert.equal(text.includes(booking),false,name+': '+booking);
    assert.equal(/→ book/.test(text),false,name+': a trade flow still ends in booking');
    for(const kept of ['callbackRequested=true','Supply the caller words in transferCall.notes.','Never invent availability, successful notifications or a transfer.'])assert.ok(text.includes(kept),name+': '+kept);
    if(capabilities.phoneQuoting){
      assert.ok(text.includes('offer to handle the quote or capture the caller’s request on this call.'),name);
      assert.ok(text.includes("After the price, capture the caller's details and preferred time for the business to follow up."),name);
      assert.ok(text.includes('Then capture their details and preferred time for the\n  business to follow up.'),name);
      assert.ok(text.includes('When the caller accepts the offered written copy of their quote'),name+': quote email kept');
    }else assert.ok(text.includes('capture the caller’s request on this call.'),name);
  }
  const roofing=compile({...PLANS.quoteDone,calendarBooking:false},ALL_SERVICES);
  assert.ok(roofing.includes('When would\n  suit you for that?" → capture the preferred time for an inspection.'));
  assert.equal(roofing.includes('get you scheduled'),false);
  assert.equal(roofing.split('→ take their preferred time').length-1,20);
});

test('with a calendar, or when the status is not given, the instructions are unchanged',()=>{
  for(const [name,capabilities,services] of [['Operator',PLANS.operator,[]],['QuoteDone',PLANS.quoteDone,ALL_SERVICES]]){
    const unknown=compile(capabilities,services),connected=compile({...capabilities,calendarBooking:true},services);
    assert.equal(connected,unknown,name);
    assert.equal(connected.includes('CALENDAR BOOKING'),false,name);
    for(const booking of ['For an existing appointment','checkAvailability with leadHandle alone','BOOKING CLOSE'])assert.ok(connected.includes(booking),name+': '+booking);
    assert.ok(connected.includes('Quote → book:'),name+': booking close kept');
    assert.equal(connected.includes('Recap → quote → book.'),services.length>0,name+': trade flows still end in booking');
  }
  const quoted=compile({...PLANS.quoteDone,calendarBooking:true},ALL_SERVICES);
  assert.ok(quoted.includes('"Want me to get you on the schedule?"'));
  assert.ok(quoted.includes('get you scheduled'));
});

test('Starter is the same with or without a calendar and never gets the calendar rule',()=>{
  const off=compile({...PLANS.starter,calendarBooking:false}),on=compile({...PLANS.starter,calendarBooking:true});
  assert.equal(off,on);assert.equal(off,compile(PLANS.starter));
  assert.equal(off.includes('CALENDAR BOOKING'),false);assert.ok(off.startsWith('PLAN CAPABILITIES:'));
  assert.equal(off.includes('transferCall'),false,'Starter cannot transfer');
});

test('production call: the real calendar status decides; the offered tools do not change',async t=>{
  const got=[];
  const h=await harness(t,{onConnect:input=>got.push(input.config)});
  const tools=config=>config.tools[0].functionDeclarations.map(tool=>tool.name);
  await h.connect(1);
  const without=got.at(-1);
  assert.ok(without.systemInstruction.startsWith('CALENDAR BOOKING:'),'Operator without a calendar');
  assert.equal(without.systemInstruction.includes('For an existing appointment'),false);
  const now='2026-11-19T12:00:00.000Z';
  h.db.prepare(`INSERT INTO bookingSettings(ownerId,revision,timezone,provider,calendarId,weeklyAvailabilityJson,blackoutsJson,bookingHorizonDays,minimumNoticeMinutes,slotIncrementMinutes,bufferBeforeMinutes,bufferAfterMinutes,directBookingEnabled,updatedAt)
    VALUES(?,'s1','America/Moncton','google','synthetic-calendar',?,'[]',30,60,30,0,0,1,?)
    ON CONFLICT(ownerId) DO UPDATE SET revision='s1',timezone='America/Moncton',provider='google',calendarId='synthetic-calendar',weeklyAvailabilityJson=excluded.weeklyAvailabilityJson,blackoutsJson='[]',bookingHorizonDays=30,minimumNoticeMinutes=60,slotIncrementMinutes=30,bufferBeforeMinutes=0,bufferAfterMinutes=0,directBookingEnabled=1,updatedAt=excluded.updatedAt`)
    .run(h.owner,JSON.stringify({mon:[{start:'09:00',end:'17:00'}]}),now);
  h.db.prepare(`INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES(?,'voice-appointment','p1','site_visit_first',60,1,?)
    ON CONFLICT(ownerId,serviceId) DO UPDATE SET enabled=1,bookingMode='site_visit_first',durationMinutes=60`).run(h.owner,now);
  const kb=JSON.parse(h.db.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(h.owner).knowledgeBaseJson);
  h.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=? WHERE ownerId=?').run(JSON.stringify({...kb,serviceArea:{mode:'all'}}),h.owner);
  await h.connect(2);
  const withCalendar=got.at(-1);
  assert.equal(withCalendar.systemInstruction.includes('CALENDAR BOOKING'),false,'Operator with a calendar');
  assert.ok(withCalendar.systemInstruction.includes('For an existing appointment'));
  assert.deepEqual(tools(withCalendar),tools(without));
});

// ── emergencies ─────────────────────────────────────────────────────────
test('emergency: after 911 and the urgent flag, say goodbye and end the call with reason emergency',()=>{
  for(const term of ['first tell them to hang up and call 911 or their local emergency number right now','Then call flagUrgent with reason safety.','Once flagUrgent returns, whether or not it worked, say a short goodbye','"Please hang up now and call 911 or your local emergency number. Goodbye."','then end the call with endCall reason emergency','Ask nothing and offer nothing else first.'])
    assert.ok(EMERGENCY_RULE.includes(term),term);
  assert.ok(END_CALL_RULE.includes("Call it only after the caller's request is handled, the caller says goodbye, or you have finished the EMERGENCY steps, and only after you have said goodbye."));
  assert.ok(END_CALL_RULE.includes('Except after an emergency, never call endCall while a quote, booking or email confirmation is in progress'));
  assert.deepEqual(END_CALL_TOOL_DECLARATION.parameters.properties.reason.enum,['request_handled','caller_said_goodbye','emergency']);
  assert.match(END_CALL_TOOL_DECLARATION.description,/hang up and call 911 \(reason emergency\)/);
  for(const [name,capabilities] of Object.entries(PLANS)){
    const text=compile(capabilities);
    assert.ok(text.includes(EMERGENCY_RULE),name);assert.ok(text.includes(END_CALL_RULE),name);
  }
});

test('emergency on a real call: the urgent flag is kept and the receptionist ends the call',async t=>{
  const declared=[];
  const h=await harness(t,{onConnect:input=>declared.push(input.config.tools[0].functionDeclarations)});
  const call=await h.connect(1);
  const endCall=declared.at(-1).find(tool=>tool.name==='endCall');
  assert.ok(endCall.parameters.properties.reason.enum.includes('emergency'),'the live model is offered the emergency reason');
  call.callback.onmessage({serverContent:{inputTranscription:{text:'[SYNTHETIC] I smell gas in the kitchen.'}}});
  call.callback.onmessage({serverContent:{outputTranscription:{text:'Please hang up now and call 911.'},turnComplete:true}});
  const flagged=await h.tool(call.callback,'flagUrgent',{reason:'safety',summary:'[SYNTHETIC] Gas smell in the kitchen'},'synthetic-urgent');
  assert.equal(flagged.status,'flagged');
  call.callback.onmessage({serverContent:{outputTranscription:{text:'Please hang up now and call 911 or your local emergency number. Goodbye.'},turnComplete:true}});
  call.callback.onmessage({toolCall:{functionCalls:[{id:'synthetic-emergency-end',name:'endCall',args:{reason:'emergency'}}]}});
  await until(()=>h.db.prepare('SELECT status FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,call.params.CallSid)?.status==='COMPLETED');
  await until(()=>call.ws.readyState===3);
  const row=h.db.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(h.owner,call.params.CallSid);
  assert.equal(row.transportOutcome,RECEPTIONIST_ENDED_CALL);
  assert.equal(row.failureCode,null);
  assert.equal(row.urgency,'safety');
  assert.equal(h.responses.has('synthetic-emergency-end'),false,'endCall never asks the model for another reply');
});
