import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,A,START,prices} from './overageMinute20261006Fixture.mjs';
import {createBillingCustomerLifecycle} from '../server/src/billingCustomerLifecycle.js';
import {installTelephonyOperationsSchema} from '../server/src/telephonyOperationsMigration.js';
import {accountAccessDecision,ACCESS_REASON,PAYMENT_FAILURE_GRACE_DAYS,PAYMENT_FAILURE_GRACE_MS} from '../server/src/planAccess.js';

// Payment-failure grace is three days, from one shared value in planAccess.js.
// A real invoice.payment_failed event goes through billing state and the
// customer lifecycle; access and the emailed notice are checked against it.
const DAY=24*60*60*1000;
const MONCTON='America/Moncton';
const sec=at=>Date.parse(at)/1000;

function setup(t){
  const f=fixture(t);installTelephonyOperationsSchema(f.db);
  const lifecycle=createBillingCustomerLifecycle({database:f.db,priceIds:prices,stripeClient:f.fakes.stripe,emailProvider:f.fakes.email,
    enabled:()=>true,clock:f.clock,dashboardUrl:'https://synthetic.example.invalid/settings',
    telephony:{async setCoverage(){return {confirmedEnabled:false,pending:false};}},releaseNumber:async()=>({released:true})});
  f.db.prepare('UPDATE users SET timezone=? WHERE id=?').run(MONCTON,A);
  return {...f,lifecycle};
}
function failPayment(f){
  const end='2026-11-20T12:00:00.000Z',amount=11900;
  const object={id:'in_SYNTHETIC_grace_three',customer:'cus_'+A,subscription:'sub_'+A,currency:'cad',status:'open',amount_paid:0,amount_remaining:amount,
    period_start:sec(START),period_end:sec(end),lines:{has_more:false,data:[{price:{id:prices.Operator.monthly},amount,quantity:1,period:{start:sec(START),end:sec(end)}}]}};
  f.billing.applyVerifiedStripeEvent({id:'evt_SYNTHETIC_grace_three_failed',type:'invoice.payment_failed',created:sec(START),livemode:false,data:{object}});
}

test('payment-failure grace: shared value is three days',()=>{
  assert.equal(PAYMENT_FAILURE_GRACE_DAYS,3);
  assert.equal(PAYMENT_FAILURE_GRACE_MS,3*DAY);
});

test('payment-failure grace: allowed at 2.9 days, denied at 3.1 days; email names the three-day grace and its end date',async t=>{
  const f=setup(t);f.activate();
  failPayment(f);await f.lifecycle.processOwner(A);
  const user=()=>f.db.prepare('SELECT * FROM users WHERE id=?').get(A);
  assert.equal(user().planStatus,'payment_failed');
  assert.equal(user().paymentFailedAt,START);
  const graceEndsAt=new Date(Date.parse(START)+3*DAY).toISOString();
  assert.equal(f.db.prepare('SELECT graceEndsAt FROM billingAccounts WHERE ownerId=?').get(A).graceEndsAt,graceEndsAt);

  const at=days=>new Date(Date.parse(START)+days*DAY);
  const before=accountAccessDecision(user(),{now:at(2.9)});
  assert.deepEqual(before,{allowed:true,reason:ACCESS_REASON.PAYMENT_FAILURE_GRACE,accessUntilUtc:graceEndsAt});
  const after=accountAccessDecision(user(),{now:at(3.1)});
  assert.equal(after.allowed,false);
  assert.equal(after.reason,ACCESS_REASON.PAYMENT_FAILURE_GRACE_EXPIRED);

  // START is Tue, Oct 20, 2026 12:00 UTC; three days later is Fri, Oct 23, 9:00 AM ADT.
  const notice=f.lifecycle.snapshot(A).notices.find(n=>n.kind==='payment_failed');
  assert.ok(notice,'payment_failed notice exists');
  assert.match(notice.message,/Service continues during the three-day grace period ending Fri, Oct 23, 2026, 9:00 AM ADT;/);
  assert.doesNotMatch(notice.message,/seven-day/);
  assert.equal(notice.dueAt,graceEndsAt);
  const sent=f.fakes.writes.email.filter(message=>/three-day grace period/.test(message.text));
  assert.equal(sent.length>0,true,'the emailed copy carries the three-day wording');
  for(const message of sent)assert.match(message.text,/ending Fri, Oct 23, 2026, 9:00 AM ADT;/);

  // The grace sweep suspends at 3.1 days, not at 7.
  f.setTime(at(3.1).toISOString());
  assert.deepEqual(f.billing.suspendExpiredGracePeriods(),{suspendedCount:1});
  assert.equal(user().planStatus,'suspended');
});
