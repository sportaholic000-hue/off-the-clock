import test from 'node:test';
import assert from 'node:assert/strict';
import { offeringFixture } from './configuredOfferingsFixtures.mjs';

// Half-cent boundaries for fence heights entered in feet and inches. Every case
// below is chosen so the exact price ends in exactly half a cent; the engine must
// round it up. Expected values are exact fractions computed here with BigInt from
// the measurement as typed (feet and decimal inches), never from the binary number
// the shared control sends.
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

test('5 ft 3.65 in from $45/ft 6 ft prices on 100 ft is exactly $3,978.125 and rounds up to $3,978.13', () => {
  const exact = mul(decimal(100), decimal(4500), div(feetInches(5, '3.65'), decimal(6)));
  assert.ok(isHalfCent(exact));
  assert.equal(halfUp(exact), 397813);
  assert.equal(installedQuote({ ratePerFootCents:4500, linearFeet:100, pricedHeight:6, requestedHeight:5 + 3.65 / 12 }), 397813);
});

test('every feet-and-inches request from 1 to 13 ft that lands on a half cent rounds up', () => {
  let checked = 0;
  for (let feet = 1; feet <= 13; feet++) for (const inches of ['0.05', '0.15', '1.35', '2.45', '3.65', '4.75', '5.85', '6.95', '7.05', '8.15', '9.25', '10.35', '11.45', '11.95']) {
    const exact = mul(decimal(100), decimal(4500), div(feetInches(feet, inches), decimal(6)));
    assert.ok(isHalfCent(exact), feet + ' ft ' + inches + ' in should be a half-cent case');
    assert.equal(installedQuote({ ratePerFootCents:4500, linearFeet:100, pricedHeight:6, requestedHeight:feet + Number(inches) / 12 }), halfUp(exact), feet + ' ft ' + inches + ' in');
    checked++;
  }
  assert.equal(checked, 182);
});

test('a priced height entered in feet and inches is also exact, and decimal-feet half cents round up', () => {
  // Owner prices 5 ft 3.65 in at $63.65 per foot; customer asks for 6 ft on 1 ft: 6365 x 6 / (63.65/12) = 7200 cents exactly.
  assert.equal(installedQuote({ ratePerFootCents:6365, linearFeet:1, pricedHeight:5 + 3.65 / 12, requestedHeight:6 }), 7200);
  // Owner prices 4 ft 8 in; customer asks for 7 ft: 1.5 x the price, $33.33 x 1.5 x 3 ft = 14998.5 -> 14999 cents.
  const exact = mul(decimal(3), decimal(3333), div(decimal(7), feetInches(4, '8')));
  assert.ok(isHalfCent(exact));
  assert.equal(installedQuote({ ratePerFootCents:3333, linearFeet:3, pricedHeight:4 + 8 / 12, requestedHeight:7 }), halfUp(exact));
  // Decimal feet: 5.00002 ft from $45/ft 6 ft prices on 100 ft = 375001.5 cents.
  const decimalFeet = mul(decimal(100), decimal(4500), div(decimal('5.00002'), decimal(6)));
  assert.ok(isHalfCent(decimalFeet));
  assert.equal(installedQuote({ ratePerFootCents:4500, linearFeet:100, pricedHeight:6, requestedHeight:5.00002 }), halfUp(decimalFeet));
});

test('the saved priced height reads as entered in the owner approval table', () => {
  const input = offeringFixture('FENCING_INSTALL', 'installed');
  input.ownerPricing.pricing.offeringDetails.fenceHeight = 5 + 3.65 / 12;
  const rows = reviewRows({ serviceType:'FENCING_INSTALL', pricing:input.ownerPricing.pricing }, {}, {});
  assert.deepEqual(rows.filter(row => /Fence height/.test(row.label)).map(row => row.value), ['5 ft 3.65 in']);
});
