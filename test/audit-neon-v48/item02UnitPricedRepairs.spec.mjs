// Neon audit of v48 #2 (November 25, 2026): a repair priced per item or per
// linear foot still required the affected area in square feet and applied
// the largest-repair-area limit, though the area is not in its price.
// Expected, written before the fix (flat roof repair fixture):
// - seam reseal at 900 cents per linear foot, 100 LF: 90000 cents with no
//   area given;
// - an area the caller gives over the owner's largest repair still goes to
//   review (the deliberate October 16 rule: damage that large is likely a
//   replacement), so the first expectation here (quote it anyway) was
//   dropped after the full suite showed that rule;
// - pipe boots at 8500 each, 3 boots, no area: 25500 cents;
// - the service stays QUOTING LIVE;
// - an area-priced repair still needs its area, and one over the limit
//   still goes to review.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {flatRepair} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

function units(f,unit,rate){const p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;p.repairPricingUnit={[m]:{[r]:unit}};p.repairUnitPrice={[m]:{[r]:rate}};p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:60};return f;}
const total=q=>{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q.options[0].calculationRecord.scenarios.mid.finalTotalCents;};

test('Neon v48 #2: a per-foot repair needs no area; a reported area over the limit still goes to review',()=>{
  const seam=()=>{const f=units(flatRepair(),'linear_feet',900);f.customerInputs.repairLengthLF=100;f.ownerPricing.pricing.largeRepairMaxSqft=150;return f;};
  assert.equal(vNextServiceStatus(seam().ownerPricing,seam().businessDefaults).status,'QUOTING LIVE');
  const none=seam();delete none.customerInputs.affectedArea;assert.equal(total(generateQuoteVNext(none)),90000);
  const big=seam();big.customerInputs.affectedArea=200;assert.equal(generateQuoteVNext(big).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('Neon v48 #2: a per-item repair needs no area',()=>{
  const f=flatRepair();f.customerInputs.repairType='pipe_boot';const id=randomUUID();f.ownerPricing.knownOfferings.repairType.pipe_boot=id;f.customerInputs.confirmedFacts.repairType={status:'identified',field:'repairType',value:'pipe_boot',offeringId:id};
  units(f,'each',8500);f.customerInputs.repairItemCount=3;delete f.customerInputs.affectedArea;
  assert.equal(total(generateQuoteVNext(f)),25500);
});
test('Neon v48 #2: an area-priced repair still needs its area and keeps its limit',()=>{
  const none=flatRepair();delete none.customerInputs.affectedArea;assert.deepEqual(generateQuoteVNext(none).missingCustomerFields,['affectedArea']);
  const big=flatRepair();big.ownerPricing.pricing.largeRepairMaxSqft=100;big.customerInputs.affectedArea=100.01;assert.equal(generateQuoteVNext(big).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
