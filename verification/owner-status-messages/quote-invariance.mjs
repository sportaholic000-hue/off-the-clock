// Synthetic fixture matrix: compare readiness and complete quote output before/after.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {generateQuoteVNext, sanitizeForCustomerVNext, vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

// Stable synthetic identities make exact quote/record comparisons reproducible.
crypto.randomUUID = () => '00000000-0000-4000-8000-000000000001';
const rows = [];
for (const type of ['INTERIOR_PAINTING', 'EXTERIOR_PAINTING']) {
  for (const setup of ['legacy', 'confirmed', 'missing_wall_labor', 'no_prep', 'partial_good', 'zero_good', 'invalid_good', 'mixed_tiers']) {
    const f = offeringFixture(type, 'itemized'), p = f.ownerPricing.pricing;
    f.ownerPricing.id = f.ownerPricing.origin.serviceId = '00000000-0000-4000-8000-000000000002';
    if (type === 'INTERIOR_PAINTING') p.offeringDetails.wallHeight = 'high';
    p.offeringDetails.baselinePricesConfirmed = true;
    if (setup === 'legacy') delete p.offeringDetails.baselinePricesConfirmed;
    if (setup === 'missing_wall_labor') delete p.offeringRates.wallLaborPerSqftPerCoat;
    if (setup === 'no_prep') { delete p.offeringRates.prepLaborPerSqft; delete p.offeringRates.prepMaterialPerSqft; }
    if (setup === 'partial_good') p.offeringRates.prepLaborPerSqft_good = 100;
    if (setup === 'zero_good') p.offeringRates.prepLaborPerSqft_good = 0;
    if (setup === 'zero_good') p.offeringRates.prepMaterialPerSqft_good = 0;
    if (setup === 'invalid_good') p.offeringRates.prepLaborPerSqft_good = -1;
    if (setup === 'mixed_tiers') f.ownerPricing.tiers = [{name:'Standard',overrides:{}},{name:'Legacy',overrides:{offeringDetails:{baselinePricesConfirmed:false}}}];
    const s = vNextServiceStatus(f.ownerPricing, f.businessDefaults);
    for (const condition of ['good', 'fair', 'poor']) {
      f.customerInputs.surfaceCondition = condition;
      const result = generateQuoteVNext(f);
      rows.push({type,setup,condition,status:s.status,validTierNames:s.validTierNames,productEligibility:s.productCoverage.map(p=>({tierName:p.tierName,selection:p.selection,configurationComplete:p.configurationComplete})),result,customer:sanitizeForCustomerVNext(result)});
    }
  }
}
fs.writeFileSync(process.argv[2], JSON.stringify(rows, null, 2)+'\n');
console.log(`${rows.length} quote/status snapshots written`);
