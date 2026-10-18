import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/engine.js';
const cases=JSON.parse(readFileSync(new URL('./expected-cases.json',import.meta.url))).cases.filter(c=>c.category==='rounding');
for(const c of cases)test(c.id+' — independent '+c.literalExpectedCents+' cents',()=>{
  const q=generateQuoteVNext(c.input),actual=q.lineItems?.reduce((s,l)=>s+l.amountCents,0);
  console.log(JSON.stringify({id:c.id,resultType:q.resultType,expectedCents:c.literalExpectedCents,actualCents:actual,lines:q.lineItems?.map(l=>({name:l.name,cents:l.amountCents,multipliers:l.calculation.multipliers}))}));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(actual,c.literalExpectedCents);
});
