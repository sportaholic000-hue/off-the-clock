// Audit f1501ff #5b (November 24, 2026): a concrete book with the base always
// included and no labor share for the combined base preparation price was
// NEEDS PRICING, while the same gap with customers asked about base only
// showed a per-access notice. Expected, written before the fix: both are
// QUOTING LIVE with notices for moderate and difficult access; easy access
// quotes 353889 cents (hand-checked in verification/engine-independent/
// fixtures.mjs: labor 120000 + concrete 48889 + forming 150000 + base 35000);
// difficult access goes to review naming basePrepLaborPercent.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {concrete} from '../../verification/engine-independent/fixtures.mjs';
import {concreteBaseIncluded} from './fixtures.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

for(const [name,make] of [['customers asked about base',concrete],['base always included',concreteBaseIncluded]])
test('f1501ff #5b: '+name+' — live, per-access notices, easy access 353889 cents',()=>{
  const f=make(),status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status.validationErrors));
  assert.deepEqual(status.laborAdjustmentCoverage.map(r=>[r.selection.accessDifficulty,r.missingOwnerFields]),[['moderate',['basePrepLaborPercent']],['difficult',['basePrepLaborPercent']]]);
  const q=generateQuoteVNext(structuredClone(f));
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,353889);
  const hard=structuredClone(f);hard.customerInputs.accessDifficulty='difficult';
  assert.deepEqual(generateQuoteVNext(hard).missingOwnerFields,['basePrepLaborPercent']);
});
