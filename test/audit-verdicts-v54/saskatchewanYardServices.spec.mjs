// Verdicts on two audits (item 4): a Saskatchewan business starts at 11%
// (5% GST + 6% PST), and only mowing was offered 5%. Saskatchewan PST-12
// (Services to Real Property, revised July 2024), Section L: lawn and yard care
// (mulching and mowing named) is exempt from PST when not billed with taxable
// real property services; so is the collection, clearing and removal of
// garbage or debris from land that does not alter the land. Planting saplings,
// tree relocation, tree removal and stump grinding are taxable; sod is not
// named. Expected, written before the change:
// - mulch and yard cleanup in Saskatchewan get the same 5% offer as mowing,
//   needing owner confirmation, each with its own note;
// - sod and planting get no offer; nothing outside Saskatchewan changes.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceTaxPrefill} from '../../server/taxJurisdiction.js';

test('Saskatchewan mulch and yard cleanup are offered 5% GST only for the owner to confirm',()=>{
  for(const type of ['LANDSCAPING_MOWING','LANDSCAPING_MULCH','LANDSCAPING_CLEANUP']){
    const p=serviceTaxPrefill('CA','SK',type);
    assert.equal(p?.taxPercent,5,type);assert.equal(p.needsOwnerConfirmation,true,type);assert.match(p.note,/5% GST only\. Confirm the rate for this service with your accountant\./,type);
  }
  assert.match(serviceTaxPrefill('CA','SK','LANDSCAPING_MULCH').note,/^Saskatchewan does not charge PST on mulching that is not billed with taxable work/);
  assert.match(serviceTaxPrefill('CA','SK','LANDSCAPING_CLEANUP').note,/^Saskatchewan does not charge PST on yard cleanup and debris removal that does not alter the land/);
  for(const args of [['CA','SK','LANDSCAPING_SOD'],['CA','SK','LANDSCAPING_PLANTING'],['CA','MB','LANDSCAPING_MULCH'],['CA','ON','LANDSCAPING_CLEANUP'],['US','SK','LANDSCAPING_MULCH']])assert.equal(serviceTaxPrefill(...args),null,args.join(' '));
});
