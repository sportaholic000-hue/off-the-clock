import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { offeringFixture } from './configuredOfferingsFixtures.mjs';

// Owner ruling October 16 removes all height-ratio price multiplication.
// Keep the 182 entered-height and fractional-unit rounding boundaries: each
// height has an explicit exact row, and $45.00005/LF * 100 = 450000.5 cents,
// independently of height. The expected rounded total is 450001 cents.
const engine = await import('../server/quote-engine-vnext/index.js');
const { reviewRows } = await import('../client/src/pricebookReview.js');

const gcd = (a, b) => b ? gcd(b, a % b) : (a < 0n ? -a : a);
const frac = (n, d) => { const g = gcd(n, d) || 1n; return [n / g, d / g]; };
const decimal = text => { const [w, f = ''] = String(text).split('.'); return frac(BigInt(w + f), 10n ** BigInt(f.length)); };
const mul = (...xs) => xs.reduce(([a, b], [c, d]) => frac(a * c, b * d), [1n, 1n]);
const div = ([a, b], [c, d]) => frac(a * d, b * c);
const add = ([a, b], [c, d]) => frac(a * d + c * b, b * d);
const isHalfCent = ([n, d]) => (2n * n) % d === 0n && (n % d) * 2n === d;
const halfUp = ([n, d]) => Number((2n * n + d) / (2n * d));
const feetInches = (feet, inches) => div(add(mul(decimal(feet), decimal(12)), decimal(inches)), decimal(12)); // exact feet

function installedQuote({ ratePerFootCents, linearFeet, pricedHeight, requestedHeight }) {
  const input = offeringFixture('FENCING_INSTALL', 'installed');
  input.ownerPricing.pricing.offeringRates.installedFencePerLF = ratePerFootCents;
  input.ownerPricing.pricing.offeringDetails.fenceHeight = pricedHeight;
  Object.assign(input.customerInputs, { linearFeet, fenceHeight:requestedHeight, gates:{} });
  const result = engine.generateQuoteVNext(input);
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(result.reviewReason));
  return result.options[0].calculationRecord.scenarios.mid.finalTotalCents;
}

test('5 ft 3.65 in uses its exact saved height and rounds 450000.5 cents up to 450001',()=>{
 assert.equal(installedQuote({ratePerFootCents:4500.005,linearFeet:100,pricedHeight:5+3.65/12,requestedHeight:5+3.65/12}),450001);
});
test('182 feet-and-inches exact-height offerings from 1 to 13 ft retain half-cent rounding without height scaling',()=>{
 let checked=0;
 for(let feet=1;feet<=13;feet++)for(const inches of ['0.05','0.15','1.35','2.45','3.65','4.75','5.85','6.95','7.05','8.15','9.25','10.35','11.45','11.95']){
  const height=feet+Number(inches)/12;
  const exact=mul(decimal(100),decimal('4500.005'));assert.ok(isHalfCent(exact));assert.equal(halfUp(exact),450001);
  assert.equal(installedQuote({ratePerFootCents:4500.005,linearFeet:100,pricedHeight:height,requestedHeight:height}),450001,feet+' ft '+inches+' in');checked++;
 }
 assert.equal(checked,182);
});
test('priced feet-and-inches and decimal-feet heights use only their own rates, with exact half-cent rounding',()=>{
 // 1 LF * 6365 cents = 6365; 3 LF * 3333.5 cents = 10000.5 -> 10001;
 // 100 LF * 4500.005 cents = 450000.5 -> 450001. Height never multiplies price.
 assert.equal(installedQuote({ratePerFootCents:6365,linearFeet:1,pricedHeight:5+3.65/12,requestedHeight:5+3.65/12}),6365);
 assert.equal(installedQuote({ratePerFootCents:3333.5,linearFeet:3,pricedHeight:4+8/12,requestedHeight:4+8/12}),10001);
 assert.equal(installedQuote({ratePerFootCents:4500.005,linearFeet:100,pricedHeight:5.0125,requestedHeight:5.0125}),450001);
});

test('the saved priced height reads as entered in the owner approval table', () => {
  const input = offeringFixture('FENCING_INSTALL', 'installed');
  input.ownerPricing.pricing.offeringDetails.fenceHeight = 5 + 3.65 / 12;
  const rows = reviewRows({ serviceType:'FENCING_INSTALL', pricing:input.ownerPricing.pricing }, {}, {});
  assert.deepEqual(rows.filter(row => /Fence height/.test(row.label)).map(row => row.value), ['5 ft 3.65 in']);
});
