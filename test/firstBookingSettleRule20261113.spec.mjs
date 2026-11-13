import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,deferred} from './fixtures/bookingCalendar20261006.mjs';

// A customer's status check and the background pass settle a first booking by
// one rule, and every release raises exactly one owner alert. The fixture uses
// a real SQLite database file; f.restart() opens a second connection to it
// with a second booking service (a second process, or the same server after a
// restart). Fakes only: the fixture's in-memory calendar.
// The released-booking alert is for releases the customer was not told about
// on the spot (status check, background pass). A live request that fails and
// answers the customer at once raises no released alert.
const ownerId='synthetic-a';
const TWO_MINUTES=2*60*1000;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let n=0;n<500&&!check();n++)await tick();assert.ok(check(),'condition reached');}

async function setup(t){
  const f=fixture(t),{i,held,slot}=await f.ready();
  // The status check's same-event-ID retry of a missing event (recoverMissingEvent)
  // is not exercised here: this calendar does not support it, so a missing event
  // is answered as missing by both paths.
  f.calendar.idempotentCreateByEventId=false;
  const row=()=>f.db.prepare('SELECT status,providerEventStatus,updatedAt FROM appointments WHERE ownerId=?').get(ownerId);
  const count=type=>f.db.prepare('SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType=?').get(ownerId,type).n;
  const hold=()=>f.db.prepare('SELECT status FROM bookingHolds WHERE ownerId=? AND id=?').get(ownerId,held.body.holdId).status;
  const offered=async service=>(await f.slots(f.intent(),f.date,service)).filter(s=>s.startUtc===slot.startUtc).length;
  const pass=async service=>{const errors=[],stop=service.startChangeReconciler({intervalMs:3600000,onError:code=>errors.push(code)});await stop();assert.deepEqual(errors,[]);};
  let reads=0;const originalGet=f.calendar.getEvent;f.calendar.getEvent=async r=>{reads++;return originalGet(r);};
  return {f,i,held,slot,row,count,hold,offered,pass,reads:()=>reads,request:f.request(i,held)};
}
// Process A stops while preparing: its busy-time check never answers.
function stuckPreparing(s){
  const original=s.f.calendar.listBusy,busy=deferred();let asked=false;
  s.f.calendar.listBusy=async r=>{if(!asked){asked=true;return busy.promise;}return original(r);};
  const confirm=s.f.booking.confirm(s.request);confirm.catch(()=>{});
  return {confirm,busy,asked:()=>asked,restore:()=>{s.f.calendar.listBusy=original;}};
}
// Process A stops while writing: createEvent never answers (saveEvent: the calendar kept it).
function stuckWriting(s,{saveEvent}){
  const original=s.f.calendar.createEvent,write=deferred();let writing=false;
  s.f.calendar.createEvent=async r=>{writing=true;if(saveEvent)await original(r);return write.promise;};
  const confirm=s.f.booking.confirm(s.request);confirm.catch(()=>{});
  return {confirm,write,writing:()=>writing,restore:()=>{s.f.calendar.createEvent=original;}};
}
const poll=(service,s,confirmationId)=>service.getConfirmationStatus({bookingToken:s.i.bookingToken,confirmationId});
const confirmationIdOf=s=>JSON.parse(s.f.db.prepare("SELECT responseJson FROM bookingIdempotency WHERE ownerId=? AND operation='confirm'").get(ownerId).responseJson).confirmationId;

test('1: a status check through another process within 2 minutes of preparation does not release, answers pending, no alert',async t=>{
  const s=await setup(t),a=stuckPreparing(s);await until(a.asked);
  assert.deepEqual({status:s.row().status,providerEventStatus:s.row().providerEventStatus},{status:'PENDING_PROVIDER',providerEventStatus:'PREPARING'});
  s.f.advance(1000);
  const b=s.f.restart(),answer=await poll(b,s,confirmationIdOf(s));
  assert.equal(answer.body.status,'PENDING_CONFIRMATION');
  assert.equal(s.row().status,'PENDING_PROVIDER');assert.equal(s.hold(),'CONFIRMING');assert.equal(s.reads(),0);
  assert.equal(s.count('booking.released'),0);
  // Process A then finishes normally.
  a.restore();a.busy.resolve([]);
  assert.equal((await a.confirm).body.status,'CONFIRMED');
  assert.equal(s.row().status,'CONFIRMED');assert.equal(s.count('booking.confirmed'),1);assert.equal(s.count('booking.released'),0);
});

test('2: after 2 minutes with process A gone, a status check settles by the calendar',async t=>{
  await t.test('event present: confirmed, one "Booking confirmed"',async t2=>{
    const s=await setup(t2),a=stuckWriting(s,{saveEvent:true});await until(a.writing);
    s.f.advance(TWO_MINUTES+1000);
    const answer=await poll(s.f.restart(),s,confirmationIdOf(s));
    assert.equal(answer.body.status,'CONFIRMED');assert.equal(s.row().status,'CONFIRMED');
    assert.equal(s.count('booking.confirmed'),1);assert.equal(s.count('booking.released'),0);
    assert.equal(s.f.writes.length,1,'no calendar write by the status check');
  });
  await t.test('no event: released, one released alert, slot offered again once',async t2=>{
    const s=await setup(t2),a=stuckWriting(s,{saveEvent:false});await until(a.writing);
    s.f.advance(TWO_MINUTES+1000);
    const b=s.f.restart(),answer=await poll(b,s,confirmationIdOf(s));
    assert.deepEqual(answer.body,{status:'FAILED',code:'PROVIDER_UNAVAILABLE',recoveryAction:'REQUEST_NEW_SLOT'});
    assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.hold(),'RELEASED');
    assert.equal(s.count('booking.released'),1);assert.equal(await s.offered(b),1);
    assert.equal(s.f.writes.length,0,'no calendar write by the status check');
    await poll(b,s,confirmationIdOf(s));await s.pass(b);
    assert.equal(s.count('booking.released'),1);
  });
  await t.test('calendar unreadable: keeps waiting',async t2=>{
    const s=await setup(t2),a=stuckWriting(s,{saveEvent:true});await until(a.writing);
    s.f.advance(TWO_MINUTES+1000);
    s.f.calendar.getEvent=async()=>{throw Error('[SYNTHETIC] calendar read failed');};
    const answer=await poll(s.f.restart(),s,confirmationIdOf(s));
    assert.equal(answer.body.status,'PENDING_CONFIRMATION');
    assert.equal(s.row().status,'PENDING_PROVIDER');assert.equal(s.hold(),'CONFIRMING');
    assert.equal(s.count('booking.released')+s.count('booking.confirmed'),0);
  });
});

test('3: background pass settles the same way; status check and pass racing settle once',async t=>{
  const s=await setup(t),a=stuckWriting(s,{saveEvent:false});await until(a.writing);
  s.f.advance(TWO_MINUTES+1000);
  const b=s.f.restart(),c=s.f.restart(),gate=deferred();let readers=0;
  s.f.calendar.getEvent=async()=>{readers++;await gate.promise;return null;};
  const checking=poll(b,s,confirmationIdOf(s)),passing=s.pass(c);
  await until(()=>readers===2);
  gate.resolve();
  const [answer]=await Promise.all([checking,passing]);
  assert.equal(answer.body.status,'FAILED');
  assert.equal(s.row().status,'PROVIDER_FAILED');
  assert.equal(s.count('booking.released'),1);assert.equal(s.count('booking.confirmed'),0);
  assert.equal(await s.offered(b),1);
});

test('4: process A finishing after another process settled answers the stored release and does not overwrite it',async t=>{
  const s=await setup(t),a=stuckWriting(s,{saveEvent:false});await until(a.writing);
  s.f.advance(TWO_MINUTES+1000);
  await poll(s.f.restart(),s,confirmationIdOf(s));
  const settled=s.row();assert.equal(settled.status,'PROVIDER_FAILED');
  a.write.resolve({status:'CONFIRMED',eventId:s.f.db.prepare('SELECT providerEventId FROM appointments WHERE ownerId=?').get(ownerId).providerEventId,
    startAtUtc:s.slot.startUtc,endAtUtc:s.f.db.prepare('SELECT endAtUtc FROM appointments WHERE ownerId=?').get(ownerId).endAtUtc});
  await assert.rejects(a.confirm,error=>error.code==='PROVIDER_UNAVAILABLE'&&error.message==='The calendar is temporarily unavailable.');
  assert.deepEqual(s.row(),settled);
  assert.equal(s.count('booking.released'),1);assert.equal(s.count('booking.confirmed'),0);
  // A retry of the same request gets the same stored answer.
  await assert.rejects(s.f.booking.confirm(s.request),error=>error.code==='PROVIDER_UNAVAILABLE');
});

test('5: live failures told on the spot raise no released alert; status-check and pass releases raise one, also when run twice',async t=>{
  await t.test('live calendar refusal',async t2=>{
    const s=await setup(t2);s.f.calendar.createEvent=async()=>{throw Error('[SYNTHETIC] refused');};
    await assert.rejects(s.f.booking.confirm(s.request));await assert.rejects(s.f.booking.confirm(s.request));
    assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.count('booking.released'),0);
  });
  await t.test('live calendar answers the event failed',async t2=>{
    const s=await setup(t2);s.f.calendar.createEvent=async r=>({status:'FAILED',eventId:r.eventId});
    await assert.rejects(s.f.booking.confirm(s.request));await assert.rejects(s.f.booking.confirm(s.request));
    assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.count('booking.released'),0);
  });
  await t.test('busy-time check fails',async t2=>{
    const s=await setup(t2);s.f.calendar.listBusy=async()=>{throw Error('[SYNTHETIC] busy read failed');};
    await assert.rejects(s.f.booking.confirm(s.request));await assert.rejects(s.f.booking.confirm(s.request));
    assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.count('booking.released'),0);
  });
  await t.test('slot taken on the calendar',async t2=>{
    const s=await setup(t2);s.f.calendar.listBusy=async()=>[{startAtUtc:s.slot.startUtc,endAtUtc:new Date(Date.parse(s.slot.startUtc)+3600000).toISOString()}];
    await assert.rejects(s.f.booking.confirm(s.request));await assert.rejects(s.f.booking.confirm(s.request));
    assert.equal(s.row().status,'CONFLICTED');assert.equal(s.count('booking.released'),0);
  });
  await t.test('status check finds the event cancelled',async t2=>{
    const s=await setup(t2),original=s.f.calendar.createEvent;
    s.f.calendar.createEvent=async r=>{await original(r);return {status:'PENDING_CONFIRMATION',eventId:r.eventId};};
    const pending=await s.f.booking.confirm(s.request);
    s.f.calendar.getEvent=async r=>({status:'CANCELLED',eventId:r.eventId});
    for(let n=0;n<2;n++)assert.equal((await poll(s.f.booking,s,pending.body.confirmationId)).body.status,'FAILED');
    assert.equal(s.count('booking.released'),1);
  });
  await t.test('background pass finds no event',async t2=>{
    const s=await setup(t2);s.f.calendar.createEvent=async r=>({status:'PENDING_CONFIRMATION',eventId:r.eventId});
    await s.f.booking.confirm(s.request);
    await s.pass(s.f.booking);await s.pass(s.f.booking);
    assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.count('booking.released'),1);
  });
});

test('6: single server restarted during preparation: the customer\'s next check waits, then settles by the calendar',async t=>{
  const s=await setup(t),a=stuckPreparing(s);await until(a.asked);
  const restarted=s.f.restart();
  s.f.advance(1000);
  assert.equal((await poll(restarted,s,confirmationIdOf(s))).body.status,'PENDING_CONFIRMATION');
  assert.equal(s.row().status,'PENDING_PROVIDER');assert.equal(s.count('booking.released'),0);
  s.f.advance(TWO_MINUTES);
  assert.equal((await poll(restarted,s,confirmationIdOf(s))).body.status,'FAILED');
  assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.count('booking.released'),1);
  await s.pass(restarted);assert.equal(s.count('booking.released'),1);
  assert.equal(await s.offered(restarted),1);
});

// A database created between 23ed206d and this change also holds the broader
// trigger that alerted live failures. Installing the schema again removes it;
// the narrower released-booking trigger keeps alerting unseen releases once.
const BROAD_TRIGGER=`CREATE TRIGGER IF NOT EXISTS owner_alert_first_booking_released AFTER UPDATE OF status ON appointments
  WHEN NEW.status IN ('PROVIDER_FAILED','CONFLICTED') AND OLD.status IN ('CONFIRMING','PENDING_PROVIDER','PENDING_CONFIRMATION') AND OLD.providerEventStatus IS NOT 'CHANGE_PENDING'
  BEGIN INSERT INTO ownerAlerts(id,ownerId,eventKey,eventType,aggregateId,callId,createdAt,updatedAt)
  VALUES(lower(hex(randomblob(16))),NEW.ownerId,'booking.released:'||NEW.id,'booking.released',NEW.id,NULL,NEW.updatedAt,NEW.updatedAt) ON CONFLICT(ownerId,eventKey) DO NOTHING; END;`;
test('7: an existing database with both triggers installed alerts only unseen releases, once',async t=>{
  const {migrateDatabase}=await import('../server/src/migrations.js');
  await t.test('live refusal: no alert',async t2=>{
    const s=await setup(t2);s.f.db.exec(BROAD_TRIGGER);migrateDatabase(s.f.db);
    const names=s.f.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'owner_alert_%released'").all().map(r=>r.name).sort();
    assert.deepEqual(names,['owner_alert_booking_released']);
    s.f.calendar.createEvent=async()=>{throw Error('[SYNTHETIC] refused');};
    await assert.rejects(s.f.booking.confirm(s.request));await assert.rejects(s.f.booking.confirm(s.request));
    assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.count('booking.released'),0);
  });
  await t.test('background pass release: one alert',async t2=>{
    const s=await setup(t2);s.f.db.exec(BROAD_TRIGGER);migrateDatabase(s.f.db);
    s.f.calendar.createEvent=async r=>({status:'PENDING_CONFIRMATION',eventId:r.eventId});
    await s.f.booking.confirm(s.request);
    await s.pass(s.f.booking);await s.pass(s.f.booking);
    assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.count('booking.released'),1);
  });
  await t.test('status check release after a restart: one alert',async t2=>{
    const s=await setup(t2);s.f.db.exec(BROAD_TRIGGER);migrateDatabase(s.f.db);
    const a=stuckWriting(s,{saveEvent:false});await until(a.writing);
    s.f.advance(TWO_MINUTES+1000);
    const b=s.f.restart();
    for(let n=0;n<2;n++)assert.equal((await poll(b,s,confirmationIdOf(s))).body.status,'FAILED');
    assert.equal(s.count('booking.released'),1);
  });
});
