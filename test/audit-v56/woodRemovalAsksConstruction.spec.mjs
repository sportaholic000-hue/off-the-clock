// v56 audit, V56-2: removing a wood floor in a building built in 1990 or
// earlier quotes when the floor sits on joists, but the customer form never
// asked what it sits on unless the new floor was tile or a floating floor
// with conditions, so these jobs always went to review.
// Expected, written before the change (blank "Removal in older buildings"):
// - hardwood removed, new vinyl plank, built before 1978: the form shows "Do you
//   know what the existing floor is laid on?", and after Yes the wood-floor
//   question; answering joists quotes, with the removal note;
// - built in 1991 or later: neither question is shown (no age hold to clear);
// - carpet removed (not wood): the wood question is not shown;
// - "Quote removal; testing and abatement are not included": not shown.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flooring} from '../../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../quoteEngineVNextFixtures.mjs';
import {generateQuoteVNext,customerContractForVNext} from '../../server/quote-engine-vnext/index.js';
import {customerFieldVisible} from '../../server/scopeConfiguration.js';

function job(existing,age,policy){
  const f=flooring('vinyl_plank',200),p=f.ownerPricing.pricing;p.removalPerSqft={[existing]:100};
  if(policy)p.olderMaterialRemoval=policy;else delete p.olderMaterialRemoval;
  const {confirmedFacts,...rest}=f.customerInputs;
  f.customerInputs=confirmedFixtureInputs({...rest,existingFloorType:existing,removalNeeded:true,removalAreaSqft:250,buildingAge:age});
  return f;
}
const shown=(f,name,extra={})=>{
  const contract=customerContractForVNext(f.ownerPricing.serviceType,f.ownerPricing.pricing,f.ownerPricing);
  const field=contract.fields[name];if(!field||field.evidenceOnly)return false;
  const {confirmedFacts,...values}={...f.customerInputs,...extra};
  return customerFieldVisible({...field,name},values);
};
test('older-home hardwood removal asks what the floor sits on, and joists quote',()=>{
  const f=job('hardwood','before_1978');
  assert.equal(shown(f,'floorConstructionKnown'),true);
  assert.equal(shown(f,'woodFloorAssembly'),false,'asked only after Yes');
  assert.equal(shown(f,'woodFloorAssembly',{floorConstructionKnown:'yes'}),true);
  const held=generateQuoteVNext(f);assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW');
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,floorConstructionKnown:'yes',woodFloorAssembly:'joists'});
  const q=generateQuoteVNext(f);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  assert.match(q.disclaimer,/Removal does not include testing for or removing asbestos/);
});
test('the question is not added where it cannot clear a hold',()=>{
  assert.equal(shown(job('hardwood','1991_or_later'),'woodFloorAssembly',{floorConstructionKnown:'yes'}),false);
  assert.equal(shown(job('carpet','before_1978'),'woodFloorAssembly',{floorConstructionKnown:'yes'}),false);
  assert.equal(shown(job('hardwood','before_1978','exclude'),'woodFloorAssembly',{floorConstructionKnown:'yes'}),false);
});
