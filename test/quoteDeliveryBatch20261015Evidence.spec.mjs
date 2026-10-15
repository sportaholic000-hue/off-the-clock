import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {roofingDisplayFixture} from './quoteDisplayFixtures20261006.mjs';
import {webQuote,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {flatRoof} from '../verification/engine-independent/fixtures.mjs';

// Independent base-10 rational oracle: no production exact-math helper is used.
function rational(value){const [whole,fraction='']=String(value).split('.');return [BigInt(whole+fraction),10n**BigInt(fraction.length)];}
function expectedArea(area,percent){const [a,b]=rational(area),[c,d]=rational(percent);return reduce(a*c,b*d*100n);}
function reduce(n,d){let a=n,b=d;while(b)[a,b]=[b,a%b];return {numerator:String(n/a),denominator:String(d/a)};}
function roof(area,percent,extra={}){const f=roofingDisplayFixture();Object.assign(f.customerInputs,{roofSizeInput:area,serviceScope:'partial',partialPercent:percent,...extra});return f;}
const evidence=q=>q.options[0].calculationRecord.quantityDerivations;
const selected=q=>evidence(q).find(row=>row.name==='selectedRoofAreaSqft');
for(const [area,percent] of [[999999.9,33.33333333333333],[50,2],[1000,0.1],[1000000,99.999],[999999.9,0.1],[12345.6789,12.3456789]])test(`QE-020 exact partial-roof evidence ${area} * ${percent}/100`,()=>{
  const f=roof(area,percent),q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
  const want=expectedArea(area,percent);assert.deepEqual(selected(q).exactResult,want);
  assert.deepEqual(selected(JSON.parse(JSON.stringify(q))).exactResult,want);
  const replay=generateQuoteVNext(JSON.parse(JSON.stringify(f)));assert.deepEqual(selected(replay).exactResult,want);
  const record=q.options[0].calculationRecord;
  assert.equal(record.customerProjection.midEstimate,q.midEstimate);
  // Every other roofing derivation must preserve this same rational input.
  const n=BigInt(want.numerator),d=BigInt(want.denominator);
  assert.deepEqual(evidence(q).find(x=>x.name==='roofSquares').exactResult,reduce(n,d*100n));
  assert.deepEqual(evidence(q).find(x=>x.name==='materialSquares').exactResult,reduce(n*11n,d*1000n));
  assert.deepEqual(evidence(q).find(x=>x.name==='tearOffSquares').exactResult,reduce(n,d*100n));
  assert.equal(sanitizeForCustomerVNext(JSON.parse(JSON.stringify(q))).resultType,'INSTANT_ESTIMATE_READY');
});
test('QE-020 extreme independent oracle and unchanged whole-cent charges persist/replay at application boundary',()=>{
  const f=roof(999999.9,33.33333333333333),h=webQuote(f),internal=JSON.parse(db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(h.owner,h.row.recordId).resultJson),q=internal.internalResult;
  assert.deepEqual(selected(q).exactResult,{numerator:'33333329999999996666667',denominator:'100000000000000000'});
  // Before execution, hand round each extended charge once: labor
  // 24,999,997; materials 43,999,996; tear-off 9,999,999; underlayment
  // 4,999,999 cents = 83,999,991 cents. No formula/rounding change is allowed.
  assert.deepEqual(q.lineItems.map(x=>x.amountCents),[24999997,43999996,9999999,4999999]);
  assert.equal(q.midEstimate,839999.91);assert.equal(h.result.midEstimate,839999.91);assert.equal(h.submit().response.midEstimate,839999.91);
  assert.deepEqual(JSON.parse(h.row.internalOutcomeJson).internalResult.calculationRecord,q.calculationRecord);
});
test('QE-020 explicit measured partial area wins; contradictory percentages still require review',()=>{
  const valid=generateQuoteVNext(roof(1000,25,{partialAreaSqft:250}));assert.equal(valid.resultType,'INSTANT_ESTIMATE_READY');assert.equal(selected(valid),undefined);
  assert.deepEqual(evidence(valid).find(x=>x.name==='roofSquares').exactResult,{numerator:'5',denominator:'2'});
  const conflict=generateQuoteVNext(roof(1000,25,{partialAreaSqft:300}));assert.equal(conflict.resultType,'ESTIMATE_REQUIRES_REVIEW');
  const explicit=roof(1000,25,{partialAreaSqft:250});delete explicit.customerInputs.partialPercent;
  assert.equal(generateQuoteVNext(explicit).midEstimate,630);
  for(const percent of [0,-1,0.0001,100,100.01])assert.equal(generateQuoteVNext(roof(1000,percent)).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('QE-020 representative flat-roof derivation retains the same independent exact partial-area oracle',()=>{
  const f=flatRoof();Object.assign(f.customerInputs,{roofSqft:999999.9,serviceScope:'partial',partialPercent:33.33333333333333});
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  const derived=evidence(q).find(x=>x.name==='selectedFlatRoofAreaSqft');
  assert.deepEqual(derived.exactResult,{numerator:'33333329999999996666667',denominator:'100000000000000000'});
});
