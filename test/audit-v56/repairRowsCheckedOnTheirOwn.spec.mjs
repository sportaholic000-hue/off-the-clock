// v56 audit, V56-1: repair readiness grouped every material and repair type
// into three size bands. Expected, written before the change:
// - a complete per-foot row (EPDM seam patch, $9/ft) beside an incomplete
//   per-square-foot row (EPDM patch, largest area blank) is QUOTING LIVE, and
//   20 ft quotes $180; the coverage names "epdm patch";
// - EPDM seam patch complete, TPO seam patch with an unclassified $0 large
//   allowance: QUOTING LIVE, a 100 sq ft EPDM repair quotes, and the
//   large-repairs notice names "tpo seam patch".
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flatRepair} from '../../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from '../quoteEngineVNextFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

const status=f=>vNextServiceStatus(f.ownerPricing,f.businessDefaults);
test('a complete per-foot repair goes live beside an incomplete per-square-foot repair',()=>{
  const f=flatRepair(),p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType;
  assert.equal(m,'epdm');assert.equal(c.repairType,'seam_patch');
  p.repairPricingUnit={epdm:{seam_patch:'linear_feet',patch:'square_feet'}};p.repairUnitPrice={epdm:{seam_patch:900,patch:1500}};
  p.installedLaborPercent={'repairUnitPrice.epdm.seam_patch':60,'repairUnitPrice.epdm.patch':60};
  delete p.patchRepairHours;delete p.patchMaterialAllowance;delete p.largeRepairMaxSqft;
  const s=status(f);
  assert.equal(s.status,'QUOTING LIVE',JSON.stringify(s.missingOwnerFields));
  const row=s.scopeCoverage.find(r=>r.key==='repair_epdm_patch_repairs');
  assert.ok(row,JSON.stringify(s.scopeCoverage));assert.match(row.message,/epdm patch/);
  const inputs=confirmedFixtureInputs({...c,repairLengthLF:20});delete inputs.affectedArea;
  const q=generateQuoteVNext({...f,customerInputs:inputs});
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,18000);
  const patch=confirmedFixtureInputs({...c,repairType:'patch',affectedArea:20});
  assert.equal(generateQuoteVNext({...f,customerInputs:patch}).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('the large-repairs notice names the material whose large price is incomplete',()=>{
  const f=flatRepair(),p=f.ownerPricing.pricing,c=f.customerInputs;
  p.patchRepairHours.tpo={seam_patch:{small:3,medium:5,large:8}};p.patchMaterialAllowance.tpo={seam_patch:{small:6000,medium:9000,large:0}};
  const s=status(f);
  assert.equal(s.status,'QUOTING LIVE',JSON.stringify(s.missingOwnerFields));
  const row=s.scopeCoverage.find(r=>r.key==='large_repairs');
  assert.ok(row,JSON.stringify(s.scopeCoverage));assert.match(row.message,/tpo seam patch/);assert.doesNotMatch(row.message,/epdm/);
  const q=generateQuoteVNext({...f,customerInputs:confirmedFixtureInputs({...c,affectedArea:100})});
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
});
