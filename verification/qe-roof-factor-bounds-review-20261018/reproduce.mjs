// Deliberately failing evidence. These assertions describe the two accepted,
// positive-component coordinator cases; they do not approve negative totals.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/engine.js';
import {validateClass2FactorsDetailed,validateOwnerPricing,validateServiceRulesDetailed} from '../../server/quote-engine-vnext/contracts.js';
const base=JSON.parse(readFileSync(new URL('./fixture.json',import.meta.url)));
for(const [name,change,expected] of [
  ['positive-rate low-pitch control: 391000 cents',()=>{},391000],
  ['accepted story factor 0.5 must calculate 261000 cents',f=>{f.ownerPricing.pricing.storyMultiplier[1]=0.5;},261000],
  ['accepted shape factor 0.5 must calculate 291000 cents',f=>{f.ownerPricing.pricing.complexityLaborMultiplier.simple=0.5;},291000]
])test(name,()=>{
  const f=structuredClone(base);change(f);
  const factors=validateClass2FactorsDetailed(f.serviceType,f.ownerPricing.pricing);
  const rates=validateOwnerPricing(f.serviceType,f.customerInputs,f.ownerPricing.pricing,f.ownerPricing);
  const rules=validateServiceRulesDetailed(f.ownerPricing,f.serviceType);
  const q=generateQuoteVNext(f),actual=q.lineItems?.reduce((s,l)=>s+l.amountCents,0)??null;
  console.log(JSON.stringify({name,expectedCents:expected,factors,ratesOk:rates.ok,rules,resultType:q.resultType,actualCents:actual,reviewReason:q.reviewReason,invalidOwnerFields:q.invalidOwnerFields}));
  assert.deepEqual(factors,[]);assert.equal(rates.ok,true);assert.deepEqual(rules,[]);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(actual,expected);
});
