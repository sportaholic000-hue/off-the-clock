import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './fixtures/bookingCalendar20261006.mjs';

// Full production schema: a first booking confirmed by the background pass
// raises the same owner booking alert and booked event as a caller's poll.
// Expected before the change: nothing is confirmed and no alert exists.
const ownerId='synthetic-a';
test('background confirmation of a first booking raises the owner booking alert once',async t=>{
  const f=fixture(t),{i,held}=await f.ready(),originalCreate=f.calendar.createEvent;
  f.calendar.createEvent=async request=>{await originalCreate(request);return {status:'PENDING_CONFIRMATION',eventId:request.eventId};};
  const pending=await f.booking.confirm(f.request(i,held));
  assert.equal(pending.body.status,'PENDING_CONFIRMATION');
  const alerts=()=>f.db.prepare("SELECT COUNT(*) n FROM ownerAlerts WHERE ownerId=? AND eventType='booking.confirmed'").get(ownerId).n;
  assert.equal(alerts(),0);
  const errors=[],stop=f.booking.startChangeReconciler({intervalMs:3600000,onError:code=>errors.push(code)});await stop();
  assert.deepEqual(errors,[]);
  assert.equal(f.db.prepare('SELECT status FROM appointments WHERE ownerId=?').get(ownerId).status,'CONFIRMED');
  assert.equal(alerts(),1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE ownerId=? AND eventType='appointment.booked'").get(ownerId).n,1);
  // The caller's later poll changes nothing and raises no second alert.
  assert.equal((await f.booking.getConfirmationStatus({bookingToken:i.bookingToken,confirmationId:pending.body.confirmationId})).body.status,'CONFIRMED');
  assert.equal(alerts(),1);
});
