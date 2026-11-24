// Audit f1501ff #12 (November 24, 2026), the parts that follow the owner's
// settled field-specific zero policy (server/quote-engine-vnext/AUDIT.md:
// "Required core zeros need an explicit audited free/included classification
// ... Minima, physical quantities, optional add-ons, and disposal retain their
// supported zero meaning"). Expected, written before the fix:
// - a roof repair's own $0 unit price with no classification is NOT quoted
//   free: NEEDS PRICING and review naming the path (it quoted 30000);
// - the same $0 marked included in the repair minimum quotes 30000 (the 50 sq
//   ft $300.00 minimum; the extra 10 sq ft at $0) — unchanged;
// - control at $5.00: 30000 + 10 x 500 = 35000;
// - a $0 self-adhered low-slope price can be marked included in the shingle
//   price, as QUOTE_ENGINE.md states (it was rejected as an invalid path).
//   With materials at selling price: 3/12 roof, 20 squares: labor 400000 +
//   shingles 330000 + tear-off 120000 + disposal 60000 = 910000 (no
//   underlayment line: self-adhered replaces it). Unclassified $0 stays
//   NEEDS PRICING.
// Not changed (owner policy keeps their $0 meaning; the audit's "one rule"
// needs an owner ruling): optional add-ons, flat-roof detail prices, disposal.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {roofRepairByArea,zeroPolicy} from './fixtures.mjs';
import {slopeRoof} from './roofFixture.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const status=f=>vNextServiceStatus(f.ownerPricing,f.businessDefaults).status;
const total=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;

test('f1501ff #12: a $0 repair unit price needs a classification; included in the minimum quotes 30000',()=>{
  assert.equal(total(generateQuoteVNext(roofRepairByArea(500))),35000);
  const zero=roofRepairByArea(0);
  assert.equal(status(zero),'NEEDS PRICING');
  assert.deepEqual(generateQuoteVNext(zero).missingOwnerFields,['repairUnitPrice.asphalt_shingle.shingle_patch']);
  const included=roofRepairByArea(0);included.ownerPricing.zeroPricePolicy=zeroPolicy(included,{'repairUnitPrice.asphalt_shingle.shingle_patch':'repairAreaMinimum.asphalt_shingle.shingle_patch'});
  assert.equal(status(included),'QUOTING LIVE');
  assert.equal(total(generateQuoteVNext(included)),30000);
});
test('f1501ff #12: a $0 self-adhered price can be marked included in the shingle price',()=>{
  const low=()=>{const f=slopeRoof({pitchBand:'under_four',pitchRisePer12:3},{lowSlopeAssemblyByProduct:{asphalt_shingle:'self_adhered_underlayment'},selfAdheredUnderlaymentPerSquare:0});f.ownerPricing.priceBasisByCategory.material='sell_price';return f;};
  assert.equal(status(low()),'NEEDS PRICING');
  const included=low();included.ownerPricing.zeroPricePolicy=zeroPolicy(included,{selfAdheredUnderlaymentPerSquare:'materialCostPerSquare.asphalt_shingle'});
  assert.equal(status(included),'QUOTING LIVE');
  assert.equal(total(generateQuoteVNext(included)),910000);
});
