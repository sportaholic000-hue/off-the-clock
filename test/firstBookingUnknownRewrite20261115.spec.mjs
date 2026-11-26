import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,deferred} from './fixtures/bookingCalendar20261006.mjs';

// A status check's same-event-ID rewrite of a missing event (recoverMissingEvent)
// whose outcome is unknown must leave the booking waiting. The calendar supports
// the rewrite (idempotentCreateByEventId: true, as the production Google adapter
// declares). The fixture uses a real SQLite database file; f.restart() opens a
// second connection to it with a second booking service (another process).
// Fakes only: the fixture's in-memory calendar. No call, text message, email or
// live calendar is used.
//
// Expected results, written before running:
// - 1 (saved, reply lost) and 3 (not saved, then released) and 6 (two status
//   checks at once) fail on e0b72f7f: the status check answers FAILED, stores
//   PROVIDER_FAILED, releases the hold and raises one released alert while the
//   calendar holds the event (1, 6) or before any definite answer (3).
// - 2 (background pass racing the rewrite) fails on e0b72f7f: the pass releases
//   the booking while the rewrite is landing.
// - 4 (rewrite succeeds) and 5 (busy check shows a conflict, no rewrite) pass on
//   e0b72f7f and after the change.
// After the change every case passes.
const ownerId='synthetic-a';
const TWO_MINUTES=2*60*1000;
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(check){for(let n=0;n<500&&!check();n++)await tick();assert.ok(check(),'condition reached');}

async function setup(t){
  const f=fixture(t),{i,held,slot}=await f.ready();
  assert.equal(f.calendar.idempotentCreateByEventId,true);
  // The rewrite reads the owner's account as the HTTP gate does: an entitled owner.
  const at=f.clock().toISOString();
  f.db.prepare(`INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt)
    VALUES(?,'cus_SYNTHETIC_unknown_rewrite',?,?,?)`).run(ownerId,at,at,at);
  f.db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(ownerId);
  assert.equal(f.db.prepare('SELECT planStatus FROM users WHERE id=?').get(ownerId).planStatus,'active');
  const row=()=>f.db.prepare('SELECT status,providerEventStatus FROM appointments WHERE ownerId=?').get(ownerId);
  const count=type=>f.db.prepare('SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType=?').get(ownerId,type).n;
  const hold=()=>f.db.prepare('SELECT status FROM bookingHolds WHERE ownerId=? AND id=?').get(ownerId,held.body.holdId).status;
  const offered=async service=>(await f.slots(f.intent(),f.date,service)).filter(s=>s.startUtc===slot.startUtc).length;
  const pass=async service=>{const errors=[],stop=service.startChangeReconciler({intervalMs:3600000,onError:code=>errors.push(code)});await stop();assert.deepEqual(errors,[]);};
  const request=f.request(i,held);
  // Process A is killed in createEvent before its write lands.
  const original=f.calendar.createEvent;
  let writing=false;f.calendar.createEvent=async()=>{writing=true;return new Promise(()=>{});};
  const confirm=f.booking.confirm(request);confirm.catch(()=>{});
  await until(()=>writing);
  assert.deepEqual(row(),{status:'PENDING_PROVIDER',providerEventStatus:'PENDING_PROVIDER'});
  f.calendar.createEvent=original;
  const confirmationId=JSON.parse(f.db.prepare("SELECT responseJson FROM bookingIdempotency WHERE ownerId=? AND operation='confirm'").get(ownerId).responseJson).confirmationId;
  const poll=service=>service.getConfirmationStatus({bookingToken:i.bookingToken,confirmationId});
  // Past the 2-minute guard.
  f.advance(TWO_MINUTES+1000);
  const waiting=()=>{
    assert.deepEqual(row(),{status:'PENDING_PROVIDER',providerEventStatus:'PENDING_PROVIDER'});
    assert.equal(hold(),'CONFIRMING');
    assert.equal(count('booking.released'),0);assert.equal(count('booking.confirmed'),0);
  };
  const booked=()=>{
    assert.deepEqual(row(),{status:'CONFIRMED',providerEventStatus:'CONFIRMED'});
    assert.equal(hold(),'CONFIRMED');
    assert.equal(count('booking.confirmed'),1);assert.equal(count('booking.released'),0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE eventType='appointment.booked'").get().n,1);
  };
  return {f,i,slot,row,count,hold,offered,pass,poll,waiting,booked,original};
}
// The calendar saves the event, then the reply is lost.
const savesThenThrows=s=>async r=>{await s.original(r);throw Error('[SYNTHETIC] calendar reply lost');};
const throwsWithoutSaving=s=>async r=>{s.f.writes.push(structuredClone(r));throw Error('[SYNTHETIC] calendar write failed');};

test('1: rewrite saved but its reply lost: the booking keeps waiting; the next check confirms it once',async t=>{
  for(const next of ['status check','background pass'])await t.test('then '+next,async t2=>{
    const s=await setup(t2),b=s.f.restart();
    s.f.calendar.createEvent=savesThenThrows(s);
    const answer=await s.poll(b);
    assert.equal(answer.body.status,'PENDING_CONFIRMATION');
    s.waiting();
    assert.equal(s.f.events.size,1,'the calendar holds the event');assert.equal(s.f.writes.length,1);
    assert.equal(await s.offered(b),0,'the slot is not offered again');
    s.f.calendar.createEvent=s.original;
    if(next==='status check'){
      assert.equal((await s.poll(s.f.restart())).body.status,'CONFIRMED');
    }else{
      // The rewrite started a fresh 2-minute guard; the background pass settles after it.
      await s.pass(s.f.restart());s.waiting();
      s.f.advance(TWO_MINUTES+1000);
      await s.pass(s.f.restart());
      assert.equal((await s.poll(b)).body.status,'CONFIRMED');
    }
    s.booked();assert.equal(s.f.writes.length,1,'no second write');
    await s.pass(b);await s.poll(b);s.booked();
  });
});

test('2: a background pass racing the status-check rewrite does not release the booking',async t=>{
  for(const where of ['another process','the same process'])await t.test('pass in '+where,async t2=>{
    const s=await setup(t2),b=s.f.restart(),c=where==='another process'?s.f.restart():b;
    // The pass reads the calendar before the rewrite lands and settles after it started.
    const originalGet=s.f.calendar.getEvent,passRead=deferred();let passReading=false;
    s.f.calendar.getEvent=async r=>{
      const answer=await originalGet(r);
      if(!passReading){passReading=true;await passRead.promise;}
      return answer;
    };
    const passing=s.pass(c);await until(()=>passReading);
    const landing=deferred();let rewriting=false;
    s.f.calendar.createEvent=async r=>{rewriting=true;await s.original(r);await landing.promise;throw Error('[SYNTHETIC] calendar reply lost');};
    const checking=s.poll(b);await until(()=>rewriting);
    passRead.resolve();await passing;
    s.waiting();
    landing.resolve();
    assert.equal((await checking).body.status,'PENDING_CONFIRMATION');
    s.waiting();assert.equal(s.f.events.size,1);
    s.f.calendar.getEvent=originalGet;s.f.calendar.createEvent=s.original;
    assert.equal((await s.poll(s.f.restart())).body.status,'CONFIRMED');
    s.booked();assert.equal(s.f.writes.length,1);
  });
});

test('3: rewrite failed without saving: keeps waiting; a later definite "no event" with no rewrite releases it once',async t=>{
  for(const later of ['background pass','status check, rewrite not supported'])await t.test('released by '+later,async t2=>{
    const s=await setup(t2),b=s.f.restart();
    s.f.calendar.createEvent=throwsWithoutSaving(s);
    assert.equal((await s.poll(b)).body.status,'PENDING_CONFIRMATION');
    s.waiting();assert.equal(s.f.events.size,0);
    assert.equal(await s.offered(b),0,'the slot is not offered again');
    s.f.advance(TWO_MINUTES+1000);
    if(later==='background pass')await s.pass(s.f.restart());
    else{
      s.f.calendar.idempotentCreateByEventId=false;
      assert.deepEqual((await s.poll(s.f.restart())).body,{status:'FAILED',code:'PROVIDER_UNAVAILABLE',recoveryAction:'REQUEST_NEW_SLOT'});
    }
    assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.hold(),'RELEASED');
    assert.equal(s.count('booking.released'),1);assert.equal(s.count('booking.confirmed'),0);
    assert.equal(s.f.writes.length,1,'only the failed rewrite was sent');
    await s.pass(b);await s.poll(b);assert.equal(s.count('booking.released'),1);
    assert.equal(await s.offered(b),1,'the slot is offered again once');
  });
});

test('4: the rewrite succeeds: confirmed, one "Booking confirmed"',async t=>{
  const s=await setup(t),b=s.f.restart();
  assert.equal((await s.poll(b)).body.status,'CONFIRMED');
  s.booked();assert.equal(s.f.writes.length,1);assert.equal(s.f.events.size,1);
  await s.poll(b);await s.pass(b);s.booked();
});

test('5: no rewrite because the busy check shows a conflict: released, one released alert',async t=>{
  const s=await setup(t),b=s.f.restart();
  const end=new Date(Date.parse(s.slot.startUtc)+3600000).toISOString();
  s.f.events.set('other',{ownerId,calendarId:'primary',eventId:'other',status:'CONFIRMED',startAtUtc:s.slot.startUtc,endAtUtc:end});
  assert.deepEqual((await s.poll(b)).body,{status:'FAILED',code:'PROVIDER_UNAVAILABLE',recoveryAction:'REQUEST_NEW_SLOT'});
  assert.equal(s.row().status,'PROVIDER_FAILED');assert.equal(s.hold(),'RELEASED');
  assert.equal(s.count('booking.released'),1);assert.equal(s.count('booking.confirmed'),0);
  assert.equal(s.f.writes.length,0,'no rewrite');
  await s.poll(b);await s.pass(b);assert.equal(s.count('booking.released'),1);
});

test('6: two status checks at once on one server while the rewrite is landing: no release, confirmed once',async t=>{
  const s=await setup(t),b=s.f.restart();
  const landing=deferred();let rewriting=false;
  s.f.calendar.createEvent=async r=>{rewriting=true;const result=await s.original(r);await landing.promise;return result;};
  // Both checks read the calendar before either starts the rewrite.
  const first=s.poll(b),secondCheck=s.poll(b);await until(()=>rewriting);
  const second=await secondCheck;
  assert.equal(second.body.status,'PENDING_CONFIRMATION');
  s.waiting();
  landing.resolve();
  assert.equal((await first).body.status,'CONFIRMED');
  s.booked();assert.equal(s.f.writes.length,1);
});
