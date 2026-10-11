import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,A,B,prices} from './overageMinute20261006Fixture.mjs';
import {createBillingCustomerLifecycle,syncBillingCancellationEvidence} from '../server/src/billingCustomerLifecycle.js';

const ENDED='2026-10-01T00:00:00.000Z',PROCESSED='2026-10-10T00:00:00.000Z';
const sec=value=>Date.parse(value)/1000;
// Written before execution: October 1 + 30 days = October 31; + 90 days =
// December 30. Nine days of webhook delay must add ZERO days to either window.
function assertDeadlines(f){
  const service=createBillingCustomerLifecycle({database:f.db,clock:f.clock});
  const state=service.snapshot(A);
  assert.equal(state.serviceEndsAt,ENDED);
  assert.equal(state.cancellation.endAt,ENDED);
  assert.equal(state.cancellation.phoneReleaseAt,'2026-10-31T00:00:00.000Z');
  assert.equal(state.cancellation.exportUntilAt,'2026-12-30T00:00:00.000Z');
  f.setTime('2026-12-29T23:59:59.999Z');assert.doesNotThrow(()=>service.exportCsv(A,'calls'));
  f.setTime('2026-12-30T00:00:00.000Z');assert.throws(()=>service.exportCsv(A,'calls'),{code:'BILLING_EXPORT_EXPIRED'});
  assert.equal(f.db.prepare('SELECT serviceEndsAt FROM users WHERE id=?').get(B).serviceEndsAt,null);
}

test('day90 clock: stored canceledAt survives a nine-day processing delay',t=>{
  const f=fixture(t);f.setTime(PROCESSED);
  f.db.prepare('UPDATE billingAccounts SET stripeSubscriptionId=?,canceledAt=? WHERE ownerId=?').run('sub_'+A,ENDED,A);
  f.db.prepare('INSERT INTO billingSubscriptionEvidence(stripeSubscriptionId,ownerId,stripeCustomerId,eventCreatedAt,stateJson) VALUES(?,?,?,?,?)')
    .run('sub_'+A,A,'cus_'+A,sec(ENDED),JSON.stringify({status:'canceled',cancelAtPeriodEnd:false}));
  syncBillingCancellationEvidence(f.db,A,PROCESSED);
  assertDeadlines(f);
});

for(const [label,fields,eventAt] of [
  ['ended_at wins over the earlier cancellation request',{ended_at:sec(ENDED),canceled_at:sec('2026-09-25T00:00:00.000Z')},PROCESSED],
  ['canceled_at is used when ended_at is absent',{canceled_at:sec(ENDED)},PROCESSED],
  ['legacy terminal event time is retained when provider fields are absent',{},ENDED]
])test('day90 clock: delayed subscription deletion — '+label,t=>{
  const f=fixture(t);f.setTime(PROCESSED);
  f.billing.applyVerifiedStripeEvent({id:'evt_SYNTHETIC_late_end',type:'customer.subscription.deleted',created:sec(eventAt),livemode:false,
    data:{object:{id:'sub_'+A,customer:'cus_'+A,status:'canceled',cancel_at_period_end:false,
      current_period_start:sec('2026-09-17T00:00:00.000Z'),current_period_end:sec(ENDED),
      items:{data:[{price:{id:prices.Operator.monthly}}]},...fields}}});
  assert.equal(f.db.prepare('SELECT canceledAt FROM billingAccounts WHERE ownerId=?').get(A).canceledAt,ENDED);
  assertDeadlines(f);
});
