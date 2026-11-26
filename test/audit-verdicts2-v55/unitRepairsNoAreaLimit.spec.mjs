// Verdicts on the deployment and v54 audits, item 1.2 (V54-2): repairs priced
// per linear foot or per item always required "Largest affected area priced as
// a repair", although those repairs never ask for an area. With the field
// blank every size band read as incomplete and the whole service stopped
// quoting. Expected, written before the change:
// - a flat-roof repair priced per linear foot with the field blank is QUOTING
//   LIVE, and a 100 ft repair at $9.00/ft quotes $900;
// - per item: 2 items at $350 each quote $700 with the field blank;
// - an area-priced (per square foot) row still requires the field;
// - an entered field is still validated (0 is refused).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flatRepair} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

function unitJob(unit,price,quantity){
  const f=flatRepair(),p=f.ownerPricing.pricing,c=f.customerInputs,m=c.membraneType,r=c.repairType;
  p.repairPricingUnit={[m]:{[r]:unit}};p.repairUnitPrice={[m]:{[r]:price}};p.installedLaborPercent={['repairUnitPrice.'+m+'.'+r]:60};
  delete c.affectedArea;if(unit==='linear_feet')c.repairLengthLF=quantity;else c.repairItemCount=quantity;
  delete p.largeRepairMaxSqft;return f;
}
const status=f=>vNextServiceStatus(f.ownerPricing,f.businessDefaults);
test('per-foot and per-item repairs go live without the largest-area field',()=>{
  for(const [unit,price,qty,total] of [['linear_feet',900,100,90000],['each',35000,2,70000]]){
    const f=unitJob(unit,price,qty);
    assert.equal(status(f).status,'QUOTING LIVE',unit+': '+JSON.stringify(status(f).missingOwnerFields));
    const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',unit+': '+q.reviewReason);
    assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,total,unit);
  }
});
test('area-priced repairs still need the field, and an entered field is still checked',()=>{
  const f=flatRepair();delete f.ownerPricing.pricing.largeRepairMaxSqft;
  assert.ok(status(f).missingOwnerFields.includes('largeRepairMaxSqft')||status(f).scopeCoverage.some(r=>/_repairs$/.test(r.key)),JSON.stringify(status(f).missingOwnerFields));
  const g=unitJob('linear_feet',900,100);g.ownerPricing.pricing.largeRepairMaxSqft=0;
  assert.equal(status(g).status,'NEEDS PRICING');
});
