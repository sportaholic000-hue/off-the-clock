import test from 'node:test';
import assert from 'node:assert/strict';
import * as policy from '../server/src/billingUsagePolicy.js';
import * as access from '../server/src/planAccess.js';
// Literal expectations were written in verification/starter-plan-20261009/EXPECTATIONS.md before execution.
const expected=[['Starter',6900,69000,150],['Operator',11900,119000,300],['QuoteDone',27900,279000,1200]];
for(const [plan,monthlyCents,annualCents,included] of expected){
 test(`Starter lineup: ${plan} prices, included allowance and exact overage`,()=>{
  assert.deepEqual(policy.MINUTE_PLANS[plan],{monthlyCents,annualCents,included});
  for(const [extra,cents] of [[0,0],[1,35],[71,2485],[72,2520]]){
   const result=policy.usageAmounts(plan,included+extra);assert.equal(result.overageCents,cents);assert.equal(result.includedMinutes,included);assert.equal(result.minutesLeft,0);
  }
 });
 test(`Starter lineup: ${plan} account and feature access`,()=>{
  const account={plan,planStatus:'active'};assert.equal(access.accountAccessDecision(account).allowed,true);
  assert.equal(access.hasProviderWriteAccess(account),true);
  assert.equal(access.hasOperatorAccess(account),plan!=='Starter');
  assert.equal(access.hasPriceBookAccess(account),plan!=='Starter');
  assert.equal(access.hasQuoteDoneAccess(account),plan==='QuoteDone');
  for(const minutesUsed of [0,59,60])assert.equal(access.trialVoiceCapDecision({...account,planStatus:'trialing',trialEndsAt:'2030-01-15T00:00:00.000Z'},{now:'2030-01-01T00:00:00.000Z',minutesUsed}).canStartNewCall,minutesUsed<60);
 });
}
for(const [from,to,monthly,annual] of [['Starter','Starter',0,0],['Starter','Operator',5000,50000],['Starter','QuoteDone',21000,210000],['Operator','Starter',-5000,-50000],['Operator','Operator',0,0],['Operator','QuoteDone',16000,160000],['QuoteDone','Starter',-21000,-210000],['QuoteDone','Operator',-16000,-160000],['QuoteDone','QuoteDone',0,0]])test(`Starter lineup: ${from} to ${to} recurring price differences`,()=>{
 assert.equal(policy.planPriceDifferenceCents(from,to,'monthly'),monthly);assert.equal(policy.planPriceDifferenceCents(from,to,'annual'),annual);
});
for(const [plan,used,interval,target,savings] of [['Starter',300,'monthly','Operator',250],['Starter',1200,'monthly','QuoteDone',15750],['Operator',1200,'monthly','QuoteDone',15500],['Starter',300,'annual','Operator',1083],['Operator',1200,'annual','QuoteDone',18166]])test(`Starter lineup: ${plan} ${interval} upgrade savings at ${used} minutes`,()=>{
 const result=policy.usageAmounts(plan,used,interval);assert.equal(result.upgradePlan,target);assert.equal(result.savingsCents,savings);
});
