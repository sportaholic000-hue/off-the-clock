// Audit R5: independent expected examples, written before engine execution.
// Run from any working directory: node verification/rounding-spec-20261002/examples.mjs
import assert from 'node:assert/strict';
import { generateQuoteVNext, sanitizeForCustomerVNext } from '../../server/quote-engine-vnext/index.js';
import { custom } from '../engine-independent/fixtures.mjs';

const examples = [
  { id: 'ordinary-buffer', price: 10049, buffer: 10, cents: [9044, 10049, 11054], dollars: [90, 100, 111] },
  { id: 'exact-price', price: 10049, buffer: 0, cents: [10049, 10049, 10049], dollars: [100.49, 100.49, 100.49] },
  { id: 'fractional-minimum-no-tax', price: 10000, minimum: 40250, buffer: 10, cents: [40250, 40250, 44275], dollars: [402.5, 402.5, 442.75] },
  { id: 'fractional-minimum-materials-tax', price: 10000, minimum: 40250, buffer: 10, taxMode: 'TAX_MATERIALS', taxPercent: 10, material: true, cents: [41250, 41250, 45375], dollars: [412.5, 412.5, 453.75] },
  { id: 'fractional-minimum-all-tax', price: 10000, minimum: 40250, buffer: 10, taxMode: 'TAX_ALL', taxPercent: 10, cents: [44275, 44275, 48703], dollars: [442.75, 442.75, 487.03] },
  { id: 'positive-sub-dollar', price: 49, buffer: 10, cents: [44, 49, 54], dollars: [0.44, 0.49, 0.54] },
  { id: 'intrinsic-custom-range', low: 10049, high: 20051, buffer: 25, cents: [10049, 15050, 20051], dollars: [100, 151, 201] }
];

const results = [];
for (const example of examples) {
  const request = custom();
  request.ownerPricing.service = request.customerInputs.service = '[SYNTHETIC] R5 display example';
  Object.assign(request.businessDefaults, {
    rangeBufferPercent: example.buffer,
    minimumJobPrice: example.minimum ?? 0,
    taxMode: example.taxMode ?? 'TAX_NONE',
    taxPercent: example.taxPercent ?? 0
  });
  if (example.low !== undefined) {
    Object.assign(request.ownerPricing.pricing, { customPricingMode: 'range', low: example.low, high: example.high });
    delete request.ownerPricing.pricing.price;
  } else request.ownerPricing.pricing.price = example.price;
  if (example.material) {
    request.ownerPricing.pricing.customChargeClassification = 'material';
    request.ownerPricing.taxabilityByCategory.material = true;
  }
  const original = structuredClone(request);
  const result = generateQuoteVNext(request);
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify({ id: example.id, result }));
  const range = result.options[0].calculationRecord.range;
  assert.deepEqual([range.lowCents, range.midCents, range.highCents], example.cents, example.id);
  assert.equal(range.bufferPercent, example.low !== undefined ? null : example.buffer, example.id);
  const customer = sanitizeForCustomerVNext(result);
  assert.equal(customer.resultType, 'INSTANT_ESTIMATE_READY', example.id);
  for (const projection of [result, result.options[0], customer, customer.options[0], JSON.parse(JSON.stringify(customer))]) {
    assert.deepEqual([projection.lowEstimate, projection.midEstimate, projection.highEstimate], example.dollars, example.id);
  }
  assert.deepEqual(request, original, example.id + ' must not mutate input');
  results.push({ id: example.id, internalCents: example.cents, customerDollars: example.dollars, passed: true });
}
console.log(JSON.stringify({ cases: results.length, passed: results.length, results }, null, 2));
