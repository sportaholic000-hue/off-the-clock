import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';
import {createAuthSessionService} from '../server/src/authSessionService.js';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {createVoiceToolDispatcher} from '../server/src/voice/toolDispatcher.js';
import {SECRET} from './fixtures/bookingCalendar20261006.mjs';

// HANDWRITTEN EXPECTATIONS, before execution:
// 1. Three instant contact submissions + one partial = exactly FOUR lead rows:
//    one@example.invalid (phone +15065550123), two@example.invalid (same phone,
//    formatted), three@example.invalid (phone +15065550124), partial@example.invalid
//    (email only). The first two share a customer, the third is a different
//    customer, and the email-only request has no inferred phone identity.
// 2. A no-contact submission keeps the base's 422 refusal and creates NO row.
// 3. Booking the third quote links ONE appointment to its existing lead; four
//    leads remain after quote and booking retries, restart, owner/staff reads.
// 4. The fixed synthetic quote is $100 + $0 tax/fees/markup = $100.00. A partial
//    keeps that same $100 priced scope and leaves the separate work unpriced.
// 5. An older widget quote with no lead gains exactly ONE on booking confirmation,
//    including delayed provider reconciliation. Existing call leads stay identical.
// 6. Saved Moncton/NB/CA allows Moncton and refuses Halifax/NS/CA on BOTH the
//    widget booking API and receptionist tool. Saving all areas allows both.
// 7. Empty/duplicate/101-city policies and invalid country codes return 400 and
//    preserve the saved area. Staff cannot save it. Operator and QuoteDone retain
//    widget/booking access; Starter retains 403 for both.
// 8. Restart backfills one missing historical widget lead and links its already
//    confirmed booking to the phone customer; a second restart adds none and
//    leaves the partial lead, quote bytes and receipt bytes unchanged.
// 9. A failed lead write rolls back the quote, request receipt and new customer;
//    retry after storage recovers creates exactly one complete set.
const expectedEmails=['one@example.invalid','partial@example.invalid','three@example.invalid','two@example.invalid'];
const area={mode:'cities',cities:[{city:'Moncton',region:'NB',country:'CA'}]};
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
async function setup(t,plan='QuoteDone'){
  const s=await application(t);
  s.db.prepare('UPDATE users SET plan=? WHERE id=?').run(plan,'synthetic-a');
  s.db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES('synthetic-staff','synthetic-a','staff@example.invalid','SYNTHETIC','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','America/Moncton','staff',?)").run(s.clock().toISOString());
  s.tokens['synthetic-staff']=createAuthSessionService(s.db,{environment:{JWT_SECRET:SECRET},clock:s.clock}).create(s.db.prepare("SELECT * FROM users WHERE id='synthetic-staff'").get()).token;
  const book=await s.request('/api/pricebook/synthetic-a');assert.equal(book.status,200,JSON.stringify(book));
  const serviceId=randomUUID();
  const saved=await s.request('/api/pricebook/save',{method:'POST',body:{...book.body,
    defaults:{currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(false),peakMonths:[],peakSurchargePercent:0},
    services:[{id:serviceId,serviceType:'CUSTOM',service:'Synthetic visit',source:'MANUAL',active:true,
      feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),
      pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},tiers:[]}]}});
  assert.equal(saved.status,200,JSON.stringify(saved));
  const approved=await s.request('/api/pricebook/services/'+serviceId+'/approve',{method:'POST',body:{revision:saved.body.revision,confirmConfiguration:true}});
  assert.equal(approved.status,200,JSON.stringify(approved));
  for(const id of [serviceId,'voice-appointment'])s.db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt) VALUES('synthetic-a',?,'SYNTHETIC','site_visit_first',45,1,?)").run(id,s.clock().toISOString());
  const quote=contact=>({requestId:randomUUID(),serviceId,serviceRequest:'Synthetic visit',customerInputs:{service:'Synthetic visit',serviceConfirmed:true,unit:'flat'},contact});
  const submit=body=>s.request('/api/public/quote/synthetic-a',{method:'POST',body,publicRequest:true});
  const record=body=>s.db.prepare('SELECT recordId FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',body.requestId)?.recordId;
  return {...s,serviceId,quote,submit,record};
}
async function book(s,bookingToken,{lost=false}={}){
  const prefix='/api/public/bookings/'+bookingToken;
  const available=await s.request(prefix+'/availability',{method:'POST',body:s.filters,publicRequest:true});
  assert.equal(available.status,200,JSON.stringify(available));assert.equal(available.body.status,'AVAILABLE');
  const held=await s.request(prefix+'/holds',{method:'POST',idempotencyKey:randomUUID(),body:{slotId:available.body.slots[0].slotId},publicRequest:true});
  assert.equal(held.status,201,JSON.stringify(held));
  if(lost)s.changeProvider({mode:'lost-response'});
  const body={holdId:held.body.holdId,confirmedSlotId:held.body.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer:s.filters.customer,location:s.filters.location};
  const idempotencyKey=randomUUID(),retry=()=>s.request(prefix+'/confirm',{method:'POST',body,idempotencyKey,publicRequest:true});
  return {result:await retry(),retry,prefix};
}
for(const plan of ['Operator','QuoteDone'])test(`${plan}: widget quotes, partial and booking form one linked inbox with phone-only customer dedupe`,{timeout:40000},async t=>{
  const s=await setup(t,plan),bodies=[
    s.quote({email:'one@example.invalid',phone:'+15065550123'}),
    s.quote({email:'two@example.invalid',phone:'+1 (506) 555-0123'}),
    s.quote({email:'three@example.invalid',phone:'+15065550124'}),
    {...s.quote({email:'partial@example.invalid'}),additionalWork:['[SYNTHETIC] A separate repair for an on-site estimate']}
  ];
  const responses=[];for(const body of bodies)responses.push(await s.submit(body));
  assert.deepEqual(responses.map(r=>r.status),[201,201,201,201],JSON.stringify(responses));
  assert.deepEqual(responses.map(r=>r.body.resultType),['INSTANT_ESTIMATE_READY','INSTANT_ESTIMATE_READY','INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'],JSON.stringify(bodies.map(body=>JSON.parse(s.db.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get('synthetic-a',body.requestId).internalOutcomeJson).internalResult)));
  for(const r of responses)assert.equal((r.body.pricedEstimate||r.body).midEstimate,100);
  assert.equal((await s.submit(s.quote({}))).status,422);
  const before=(await s.request('/api/leads')).body.leads;
  assert.deepEqual(before.map(l=>l.contact.email).sort(),expectedEmails);
  const byEmail=Object.fromEntries(before.map(l=>[l.contact.email,l]));
  assert.equal(byEmail['one@example.invalid'].customerId,byEmail['two@example.invalid'].customerId);
  assert.notEqual(byEmail['one@example.invalid'].customerId,byEmail['three@example.invalid'].customerId);
  assert.equal(byEmail['partial@example.invalid'].customerId,null);
  for(const body of bodies)assert.equal(byEmail[body.contact.email].linkedQuoteId,s.record(body));
  assert.equal(byEmail['partial@example.invalid'].type,'additional_work');
  // The same name on an established customer is never a merge instruction.
  s.db.prepare('UPDATE customers SET name=? WHERE ownerId=? AND id=?').run('[SYNTHETIC] Same Name','synthetic-a',byEmail['one@example.invalid'].customerId);
  s.filters.customer={name:'[SYNTHETIC] Same Name',phone:'+15065550124',email:'three@example.invalid'};
  const booking=await book(s,responses[2].body.bookingToken);
  assert.equal(booking.result.status,201,JSON.stringify(booking.result));
  assert.equal(booking.result.body.status,'CONFIRMED');
  assert.equal((await booking.retry()).body.appointmentId,booking.result.body.appointmentId);
  for(const body of bodies)assert.equal((await s.submit(body)).status,200);
  await s.restartApplication();
  const owner=(await s.request('/api/leads')).body.leads,staff=(await s.request('/api/leads',{owner:'synthetic-staff'})).body.leads;
  assert.deepEqual(owner.map(l=>l.contact.email).sort(),expectedEmails);
  assert.deepEqual(staff.map(l=>l.id).sort(),owner.map(l=>l.id).sort());assert.ok(staff.every(l=>!('internal'in l)));
  const booked=staff.find(l=>l.id===s.record(bodies[2]));
  assert.deepEqual(booked.bookings.map(b=>({id:b.id,status:b.status,customerId:b.customerId})),[{id:booking.result.body.appointmentId,status:'CONFIRMED',customerId:byEmail['three@example.invalid'].customerId}]);
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM customers WHERE ownerId=?').get('synthetic-a').n,2);
  assert.deepEqual((await s.request('/api/leads',{owner:'synthetic-b'})).body.leads,[]);
  assert.equal((await s.request('/api/leads/'+booked.id,{owner:'synthetic-b'})).status,404);
  assert.equal((await s.request('/api/leads',{owner:null})).status,401);
});

for(const lost of [false,true])test(`older widget booking creates one lead; call leads stay unchanged; delayed confirmation=${lost}`,{timeout:40000},async t=>{
  const s=await setup(t),body=s.quote({email:'legacy@example.invalid',phone:'+15065550123'}),quoted=await s.submit(body),id=s.record(body);
  s.db.prepare('DELETE FROM leads WHERE ownerId=? AND id=?').run('synthetic-a',id); // exact pre-fix storage shape
  s.db.prepare("INSERT INTO leads(id,ownerId,callId,customerName,callerNumber,type,status,collectedInputsJson,createdAt) VALUES('SYNTHETIC-call-lead','synthetic-a','synthetic-a-call','[SYNTHETIC] Call','+15065550123','call','NEEDS REVIEW','{}',?)").run(s.clock().toISOString());
  const before=s.db.prepare("SELECT * FROM leads WHERE id='SYNTHETIC-call-lead'").get();
  const booking=await book(s,quoted.body.bookingToken,{lost});
  assert.equal(booking.result.status,lost?202:201,JSON.stringify(booking.result));
  if(lost){s.changeProvider({mode:'normal'});await s.restartApplication();const poll=await s.request(booking.prefix+'/confirmations/'+encodeURIComponent(booking.result.body.confirmationId),{publicRequest:true});assert.equal(poll.body.status,'CONFIRMED',JSON.stringify(poll));}
  await booking.retry();
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM leads WHERE ownerId=? AND id=?').get('synthetic-a',id).n,1);
  assert.deepEqual(s.db.prepare("SELECT * FROM leads WHERE id='SYNTHETIC-call-lead'").get(),before);
  const lead=await s.request('/api/leads/'+id,{owner:'synthetic-staff'});
  assert.equal(lead.status,200);assert.equal(lead.body.linkedQuoteId,id);assert.equal(lead.body.bookings.length,1);
});

test('owner-saved service area drives widget and receptionist checks, validates limits and preserves plan gates',{timeout:40000},async t=>{
  const s=await setup(t),save=serviceArea=>s.request('/api/onboarding/knowledge-base',{method:'POST',body:{about:'[SYNTHETIC] Service area setup',hours:'[SYNTHETIC] Weekdays',serviceArea}});
  const saved=await save({mode:'cities',cities:[{city:' Moncton ',region:' NB ',country:'ca'}]});assert.equal(saved.status,200,JSON.stringify(saved));
  assert.deepEqual(JSON.parse(s.db.prepare("SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId='synthetic-a'").get().knowledgeBaseJson).serviceArea,area);
  const quoted=await s.submit(s.quote({email:'area@example.invalid'}));
  const inArea={...s.filters.location},outArea={...inArea,city:'Halifax',region:'NS'};
  const widget=location=>s.request('/api/public/bookings/'+quoted.body.bookingToken+'/availability',{method:'POST',body:{...s.filters,location},publicRequest:true});
  assert.equal((await widget(inArea)).body.status,'AVAILABLE');
  const outside=await widget(outArea);assert.equal(outside.body.reason,'OUT_OF_AREA');assert.equal(outside.body.status,'PREFERRED_TIME_ONLY');
  async function voice(location){
    const callSid='CA'+randomUUID().replaceAll('-',''),context={ownerId:'synthetic-a',callSid,accountSid:'AC'+'a'.repeat(32),from:'+15065550130',to:'+15065550131'};
    s.db.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,createdAt) VALUES(?,?,?,?,?,?,'CONNECTED',?)").run(callSid,context.ownerId,callSid,context.accountSid,context.from,context.to,s.clock().toISOString());
    const runtime=createVoiceToolRuntime({database:s.db,callContext:context,handleSecret:SECRET,clock:s.clock,bookingService:s.booking});
    const dispatch=createVoiceToolDispatcher({handlers:runtime.handlers,callContext:context,idempotencyStore:runtime.idempotencyStore}).dispatch;
    const captured=await dispatch({name:'captureLead',toolCallId:randomUUID(),args:{name:'[SYNTHETIC] Area caller',address:{line1:location.addressLine1,city:location.city,region:location.region,country:location.country,postalCode:location.postalCode}}});
    assert.equal(captured.status,'captured',JSON.stringify(captured));
    return dispatch({name:'checkAvailability',toolCallId:randomUUID(),args:{leadHandle:captured.leadHandle,preference:{fromDate:s.date,days:1}}});
  }
  assert.equal((await voice(inArea)).status,'available');
  const voiceOutside=await voice(outArea);assert.equal(voiceOutside.status,'unavailable');assert.equal(voiceOutside.message,'The service address is outside the configured service area.');
  for(const invalid of [{mode:'cities',cities:[]},{mode:'cities',cities:[area.cities[0],{city:'moncton',region:'nb',country:'ca'}]},
    {mode:'cities',cities:Array.from({length:101},(_,i)=>({city:'Synthetic '+i,region:'NB',country:'CA'}))},{mode:'cities',cities:[{city:'Moncton',region:'NB',country:'CAN'}]}]){
    assert.equal((await save(invalid)).status,400);
    assert.deepEqual(JSON.parse(s.db.prepare("SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId='synthetic-a'").get().knowledgeBaseJson).serviceArea,area);
  }
  assert.equal((await s.request('/api/onboarding/knowledge-base',{owner:'synthetic-staff',method:'POST',body:{serviceArea:{mode:'all'}}})).status,403);
  assert.equal((await save({mode:'all'})).status,200);assert.equal((await widget(outArea)).body.status,'AVAILABLE');assert.equal((await voice(outArea)).status,'available');
  for(const plan of ['Operator','QuoteDone','Starter']){
    s.db.prepare('UPDATE users SET plan=? WHERE id=?').run(plan,'synthetic-a');const expected=plan==='Starter'?403:200;
    assert.equal((await s.request('/api/public/quote/synthetic-a',{publicRequest:true})).status,expected);
    assert.equal((await widget(inArea)).status,expected);
  }
});

test('restart restores historical widget inbox gaps without changing receipts or duplicating partial leads',{timeout:40000},async t=>{
  const s=await setup(t),body=s.quote({phone:'+15065550123'}),partial={...s.quote({email:'partial@example.invalid'}),additionalWork:['[SYNTHETIC] Separate repair']};
  const quoted=await s.submit(body);assert.equal(quoted.body.resultType,'INSTANT_ESTIMATE_READY');assert.equal((await s.submit(partial)).body.resultType,'PARTIAL_ESTIMATE_READY');
  s.filters.customer={name:'[SYNTHETIC] Historical booking',phone:'+15065550123'};
  const booking=await book(s,quoted.body.bookingToken);assert.equal(booking.result.body.status,'CONFIRMED');
  const id=s.record(body),partialId=s.record(partial),partialBefore=s.db.prepare('SELECT * FROM leads WHERE ownerId=? AND id=?').get('synthetic-a',partialId);
  const quotes=s.db.prepare('SELECT * FROM quotes WHERE ownerId=? ORDER BY id').all('synthetic-a'),receipts=s.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? ORDER BY recordId').all('synthetic-a');
  s.db.prepare('DELETE FROM leads WHERE ownerId=? AND id=?').run('synthetic-a',id);
  s.db.prepare('UPDATE appointments SET customerId=NULL WHERE ownerId=? AND id=?').run('synthetic-a',booking.result.body.appointmentId);
  for(let n=0;n<2;n++){
    await s.restartApplication();const leads=(await s.request('/api/leads')).body.leads;
    assert.deepEqual(leads.map(l=>l.id).sort(),[id,partialId].sort());assert.equal(leads.find(l=>l.id===id).linkedQuoteId,id);
    const restored=leads.find(l=>l.id===id);assert.equal(restored.bookings.length,1);assert.equal(restored.bookings[0].id,booking.result.body.appointmentId);
    assert.ok(restored.customerId);assert.equal(restored.bookings[0].customerId,restored.customerId);
    assert.deepEqual(s.db.prepare('SELECT * FROM leads WHERE ownerId=? AND id=?').get('synthetic-a',partialId),partialBefore);
    assert.deepEqual(s.db.prepare('SELECT * FROM quotes WHERE ownerId=? ORDER BY id').all('synthetic-a'),quotes);
    assert.deepEqual(s.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? ORDER BY recordId').all('synthetic-a'),receipts);
  }
});

test('widget lead write failure rolls back the whole submission and allows an exact retry',{timeout:40000},async t=>{
  const s=await setup(t),body=s.quote({phone:'+15065550199'});
  s.db.exec("CREATE TRIGGER synthetic_lead_failure BEFORE INSERT ON leads BEGIN SELECT RAISE(ABORT,'SYNTHETIC storage failure'); END");
  const failed=await s.submit(body);assert.equal(failed.status,500);
  for(const table of ['leads','quotes','quoteSubmissions','customers'])assert.equal(s.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ownerId=?`).get('synthetic-a').n,0,table);
  s.db.exec('DROP TRIGGER synthetic_lead_failure');assert.equal((await s.submit(body)).status,201);assert.equal((await s.submit(body)).status,200);
  for(const table of ['leads','quotes','quoteSubmissions','customers'])assert.equal(s.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ownerId=?`).get('synthetic-a').n,1,table);
});

test('Calendar configuration reports both missing hours and missing connection on an unconfigured business',{timeout:40000},async t=>{
  // Handwritten: missing settings, missing destination calendar and missing
  // service area must all be reported together; none requires a failed booking.
  const s=await setup(t);s.db.prepare('DELETE FROM bookingSettings WHERE ownerId=?').run('synthetic-a');s.db.prepare('DELETE FROM calendarConnections WHERE ownerId=?').run('synthetic-a');
  s.db.prepare("UPDATE businessProfiles SET knowledgeBaseJson='{}' WHERE ownerId=?").run('synthetic-a');
  const result=await s.request('/api/booking/configuration');assert.equal(result.status,200,JSON.stringify(result));
  assert.deepEqual(result.body.directBooking.globalBlockers.map(b=>b.code),['BOOKING_SETTINGS_MISSING','CALENDAR_NOT_CONNECTED']);
  assert.deepEqual(result.body.directBooking.releaseBlockers.map(b=>b.code),['SERVICE_AREA_MISSING']);
});
