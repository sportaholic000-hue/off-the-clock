import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture,SECRET,CUSTOMER} from './fixtures/bookingCalendar20261006.mjs';
import {createGoogleCalendarAdapter} from '../server/src/googleCalendarAdapter.js';
import {createOwnerAlertService} from '../server/src/ownerAlertService.js';

const ownerId='synthetic-a',callSid='CA'+'a'.repeat(32);
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

async function ownerOutcomeEmail(f,{rejected=false,action}) {
  // Focus this synthetic worker on the change outcome. Initial quote/booking
  // alerts have their own delivery coverage and must not obscure this message.
  f.db.prepare("UPDATE ownerAlerts SET status='ACCEPTED' WHERE ownerId=? AND eventType!='appointment.changed'").run(ownerId);
  const messages=[],worker=createOwnerAlertService({database:f.db,clock:()=>f.clock().getTime(),ready:()=>true,
    environment:{EMAIL_FROM:'alerts@example.invalid',PUBLIC_BASE_URL:'https://synthetic.example.invalid'},
    send:async message=>{messages.push(message);return {accepted:true,id:'SYNTHETIC-change-outcome'};}});
  assert.equal(await worker.processOne(ownerId),true);assert.equal(messages.length,1);
  assert.equal(messages[0].to,ownerId+'@example.invalid');
  if(rejected){assert.match(messages[0].subject,/Booking change not applied/);assert.match(messages[0].text,/original appointment remains confirmed/);assert.doesNotMatch(messages[0].text,/CANCELLED/);}
  else assert.match(messages[0].text,action==='cancel'?/CANCELLED/:/CONFIRMED/);
  assert.equal(await worker.processOne(ownerId),false,'The owner outcome is emitted once');
}

async function setup(t,action,fault) {
  const f=fixture(t),{i,held}=await f.ready(),originalCreate=f.calendar.createEvent;
  // Keep the initial confirmation handle so the original booking receipt can
  // reconcile a later change, including after its booking intent has changed.
  f.calendar.createEvent=async request=>{await originalCreate(request);return {status:'PENDING_CONFIRMATION',eventId:request.eventId};};
  const pending=await f.booking.confirm(f.request(i,held));assert.equal(pending.body.status,'PENDING_CONFIRMATION');
  const poll={bookingToken:i.bookingToken,confirmationId:pending.body.confirmationId};
  assert.equal((await f.booking.getConfirmationStatus(poll)).body.status,'CONFIRMED');
  const original=f.db.prepare('SELECT * FROM appointments WHERE ownerId=?').get(ownerId);
  f.db.prepare('UPDATE calls SET callSid=? WHERE ownerId=? AND id=?').run(callSid,ownerId,ownerId+'-call');
  let eventVersion=1,event={id:original.providerEventId,etag:'\"SYNTHETIC-v1\"',status:'confirmed',start:{dateTime:original.startAtUtc},end:{dateTime:original.endAtUtc}},patch=null;
  const writes=[],reads=[];
  const applyPatch=(body,etag)=>{
    if(etag!==event.etag)return false;
    event={...event,...body,extendedProperties:{private:{...event.extendedProperties?.private,...body.extendedProperties?.private}},etag:'"SYNTHETIC-v'+(++eventVersion)+'"'};
    return true;
  };
  const apply=()=>applyPatch(patch.body,patch.etag);
  const adapter=createGoogleCalendarAdapter({clock:f.clock,requestTimeoutMs:25,clientId:'[SYNTHETIC]-client',clientSecret:'[SYNTHETIC]-secret',
    credentialRepository:{async load(id){return {ownerId:id,provider:'google',status:'connected',calendarId:'primary',expiresAtUtc:'2027-01-01T00:00:00.000Z',scopesJson:JSON.stringify(['https://www.googleapis.com/auth/calendar']),credentials:{accessToken:'SYNTHETIC-access-token',refreshToken:null,tokenType:'Bearer'}};},async saveRefreshed(){throw Error('Unexpected synthetic refresh');}},
    fetch:async(url,options)=>{
      if(options.method==='PATCH'){
        const body=JSON.parse(options.body),etag=new Headers(options.headers).get('if-match'),fence=Boolean(body.extendedProperties?.private?.otcChangeFence);
        writes.push({url,body,etag,fence});
        if(fence){
          if(fault==='timeout-success-during-fence')apply();
          if(!applyPatch(body,etag))return response({error:{message:'[SYNTHETIC] version changed'}},412);
          if(fault==='timeout-fence-lost-response')throw Error('[SYNTHETIC] fence response lost');
          return response(event);
        }
        patch={body,etag};
        if(Number.isInteger(fault))return response({error:{message:'[SYNTHETIC] rejected'}},fault);
        if(fault==='503-after'){apply();return response({error:{message:'[SYNTHETIC] lost response'}},503);}
        if(fault==='lost-response-after'){apply();throw Error('[SYNTHETIC] transport lost after applying PATCH');}
        if(fault.startsWith('timeout-'))return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
        apply();return response(event);
      }
      if(new URL(url).pathname.endsWith('/freeBusy'))return response({calendars:{primary:{busy:[]}}});
      if(options.method==='GET'){reads.push(url);return response(event);}
      throw Error('[SYNTHETIC] unexpected provider write');
    }});
  Object.assign(f.calendar,adapter);
  const request={ownerId,callSid,appointment:{id:original.id},action,idempotencyKey:randomUUID()};
  if(action==='reschedule'){
    const availability=await f.booking.appointmentAvailability({ownerId,appointmentId:original.id,callerNumber:CUSTOMER.phone,filters:{fromDate:f.date,days:1}});
    request.intentId=availability.intentId;request.slotId=availability.body.slots.find(slot=>slot.startUtc>=original.endAtUtc).slotId;
  }
  const appointment=()=>f.db.prepare('SELECT * FROM appointments WHERE ownerId=? AND id=?').get(ownerId,original.id);
  const change=()=>f.db.prepare('SELECT * FROM appointmentChanges WHERE ownerId=? AND id=?').get(ownerId,request.idempotencyKey);
  const holds=()=>f.db.prepare('SELECT * FROM bookingHolds WHERE ownerId=? ORDER BY createdAt,rowid').all(ownerId);
  const ownerView=()=>f.ownerCalendar.schedule({ownerId,query:{fromDate:f.date,days:'1'}}).appointments.find(row=>row.id===original.id);
  return {...f,original,request,poll,appointment,change,holds,ownerView,writes,reads,apply};
}

test('calendar change recovery restores rejected bookings and reconciles ambiguous writes without retrying the requested action',async t=>{
  for(const action of ['cancel','reschedule'])for(const status of [400,403])await t.test(`${action}: definite HTTP ${status} restores the original and releases the replacement`,async t=>{
    const f=await setup(t,action,status);
    await assert.rejects(f.booking.modifyAppointment(f.request),{code:'CALENDAR_CHANGE_REJECTED',retryable:false});
    const row=f.appointment();assert.equal(row.status,'CONFIRMED');assert.equal(row.providerEventStatus,f.original.providerEventStatus);
    for(const field of ['bookingIntentId','holdId','startAtUtc','endAtUtc','lockStartAtUtc','lockEndAtUtc'])assert.equal(row[field],f.original[field]);
    assert.equal(f.holds().find(hold=>hold.id===f.original.holdId).status,'CONFIRMED');
    if(action==='reschedule')assert.equal(f.holds().find(hold=>hold.id!==f.original.holdId).status,'RELEASED');
    assert.equal(f.change().status,'REJECTED');assert.equal(f.ownerView().change.status,'REJECTED');
    assert.equal(f.ownerCalls.dashboard(ownerId).counts.bookings,1);
    assert.equal((await f.booking.getConfirmationStatus(f.poll)).body.status,'CONFIRMED');
    assert.equal((await f.restart().modifyAppointment(f.request)).status,'REJECTED');assert.equal(f.writes.length,1);
    // A later, distinct request is possible again and obtains fresh slots.
    assert.ok((await f.booking.appointmentAvailability({ownerId,appointmentId:row.id,callerNumber:CUSTOMER.phone,filters:{fromDate:f.date,days:1}})).body.slots.length);
    assert.equal(f.ownerCalendar.schedule({ownerId:'synthetic-b',query:{fromDate:f.date,days:'1'}}).appointments.length,0);
    await ownerOutcomeEmail(f,{rejected:true,action});
  });
  for(const action of ['cancel','reschedule'])for(const fault of ['timeout-delayed','503-after','lost-response-after'])await t.test(`${action}: ${fault}, restart and read reconciliation preserve one provider write`,async t=>{
    const f=await setup(t,action,fault);
    assert.equal((await f.booking.modifyAppointment(f.request)).status,'PENDING_CONFIRMATION');
    assert.equal(f.appointment().status,'PENDING_CONFIRMATION');assert.equal(f.appointment().providerEventStatus,'CHANGE_PENDING');
    assert.equal(f.holds().find(hold=>hold.id===f.original.holdId).status,'CONFIRMED');
    if(action==='reschedule')assert.equal(f.holds().find(hold=>hold.id!==f.original.holdId).status,'CONFIRMING');
    assert.equal(f.ownerView().change.status,'PENDING');assert.equal(f.ownerView().change.action,action);
    const restarted=f.restart();
    if(fault==='timeout-delayed'){
      assert.equal((await restarted.getConfirmationStatus(f.poll)).body.status,'PENDING_CONFIRMATION','The old time cannot prove that a delayed PATCH failed');
      assert.equal(f.change().lastError,'ORIGINAL_SLOT_STILL_PRESENT');
      assert.equal((await restarted.modifyAppointment(f.request)).status,'PENDING_CONFIRMATION');
      f.apply();
    }
    // The production background reconciler uses this same tenant-scoped read.
    await restarted.reconcilePendingAppointmentChanges({ownerId});
    const row=f.appointment();assert.equal(row.status,action==='cancel'?'CANCELLED':'CONFIRMED');assert.equal(f.change().status,'CONFIRMED');
    assert.equal(f.holds().find(hold=>hold.id===f.original.holdId).status,'RELEASED');
    if(action==='reschedule'){
      const next=JSON.parse(f.change().newSlotJson);assert.equal(row.holdId,next.id);assert.equal(row.bookingIntentId,next.intentId);assert.equal(row.startAtUtc,next.startAtUtc);assert.equal(row.endAtUtc,next.endAtUtc);
      assert.equal(f.holds().find(hold=>hold.id===next.id).status,'CONFIRMED');
      const replay=await restarted.getConfirmationStatus(f.poll);assert.equal(replay.body.status,'CONFIRMED');assert.equal(replay.body.startUtc,next.startAtUtc);
      assert.equal(f.ownerCalls.dashboard(ownerId).counts.bookings,1);
    }
    assert.equal(f.ownerView().change.status,'CONFIRMED');
    assert.equal((await restarted.modifyAppointment(f.request)).status,'CONFIRMED');
    assert.equal(f.writes.length,1);assert.ok(f.reads.length>=1);
    assert.equal(f.db.prepare("SELECT count(*) n FROM outboxEvents WHERE ownerId=? AND eventType='appointment.changed'").get(ownerId).n,1);
    assert.deepEqual(f.writes[0].body.attendees,[]);assert.deepEqual(f.writes[0].body.reminders,{useDefault:false,overrides:[]});assert.match(f.writes[0].url,/sendUpdates=none/);
    await ownerOutcomeEmail(f,{action});
  });
  for(const action of ['cancel','reschedule'])for(const fault of ['timeout-never','timeout-success-during-fence','timeout-fence-lost-response'])await t.test(`${action}: ${fault} safely resolves the original slot and blocks a late write`,async t=>{
    const f=await setup(t,action,fault);
    assert.equal((await f.booking.modifyAppointment(f.request)).status,'PENDING_CONFIRMATION');
    const restarted=f.restart();assert.equal((await restarted.getConfirmationStatus(f.poll)).body.status,'PENDING_CONFIRMATION');
    // The first old-time read leaves time for a delayed provider operation.
    f.advance(30001);await restarted.reconcilePendingAppointmentChanges({ownerId});
    await restarted.reconcilePendingAppointmentChanges({ownerId});
    const succeeded=fault==='timeout-success-during-fence',row=f.appointment();
    assert.equal(f.change().status,succeeded?'CONFIRMED':'REJECTED');
    assert.equal(row.status,succeeded&&action==='cancel'?'CANCELLED':'CONFIRMED');
    assert.equal(f.writes.filter(write=>!write.fence).length,1,'Never retry the original cancellation/reschedule');
    assert.equal(f.writes.filter(write=>write.fence).length,1,'One conditional version retirement');
    assert.equal(f.writes[0].etag,'"SYNTHETIC-v1"');assert.equal(f.writes[1].etag,f.writes[0].etag);
    if(!succeeded){
      assert.equal(row.startAtUtc,f.original.startAtUtc);assert.equal(row.holdId,f.original.holdId);
      assert.equal(f.holds().find(hold=>hold.id===f.original.holdId).status,'CONFIRMED');
      if(action==='reschedule')assert.equal(f.holds().find(hold=>hold.id!==f.original.holdId).status,'RELEASED');
      assert.equal(f.apply(),false,'The retired If-Match prevents the late original write');
      assert.equal(f.ownerCalls.dashboard(ownerId).counts.bookings,1);
    }else{
      assert.equal(f.holds().find(hold=>hold.id===f.original.holdId).status,'RELEASED');
      if(action==='reschedule')assert.equal(row.startAtUtc,JSON.parse(f.change().newSlotJson).startAtUtc);
    }
    assert.equal(f.ownerView().change.status,f.change().status);
    assert.equal((await restarted.modifyAppointment(f.request)).status,succeeded?'CONFIRMED':'REJECTED');
    assert.equal(f.writes.length,2);
    await ownerOutcomeEmail(f,{rejected:!succeeded,action});
  });
  await t.test('a failed local restoration retains definite rejection evidence and rolls back both slots atomically',async t=>{
    const f=await setup(t,'reschedule',400);
    f.db.exec("CREATE TRIGGER synthetic_release_failure BEFORE UPDATE OF status ON bookingHolds WHEN NEW.status='RELEASED' BEGIN SELECT RAISE(ABORT,'SYNTHETIC_RELEASE_FAILURE'); END");
    await assert.rejects(f.booking.modifyAppointment(f.request),/SYNTHETIC_RELEASE_FAILURE/);
    assert.equal(f.appointment().status,'PENDING_CONFIRMATION');assert.equal(f.change().lastError,'CALENDAR_REQUEST_REJECTED');
    assert.equal(f.holds().find(hold=>hold.id!==f.original.holdId).status,'CONFIRMING');
    f.db.exec('DROP TRIGGER synthetic_release_failure');await f.restart().reconcilePendingAppointmentChanges({ownerId});
    assert.equal(f.appointment().status,'CONFIRMED');assert.equal(f.change().status,'REJECTED');
    assert.equal(f.holds().find(hold=>hold.id!==f.original.holdId).status,'RELEASED');assert.equal(f.writes.length,1);
  });
  await t.test('interrupted preparation expires safely and an older worker cannot start a late write',async t=>{
    const f=await setup(t,'reschedule',400),listBusy=f.calendar.listBusy;let resume,started;
    const blocked=new Promise(resolve=>{resume=resolve;}),entered=new Promise(resolve=>{started=resolve;});
    f.calendar.listBusy=async input=>{started();await blocked;return listBusy(input);};
    const pending=f.booking.modifyAppointment(f.request);await entered;
    const restarted=f.restart();await restarted.reconcilePendingAppointmentChanges({ownerId});assert.equal(f.change().status,'PREPARING');
    f.advance(120001);await restarted.reconcilePendingAppointmentChanges({ownerId});assert.equal(f.change().status,'REJECTED');
    resume();assert.equal((await pending).status,'REJECTED');assert.equal(f.writes.length,0);
    assert.equal(f.appointment().status,'CONFIRMED');assert.equal(f.holds().find(hold=>hold.id!==f.original.holdId).status,'RELEASED');
  });
});
