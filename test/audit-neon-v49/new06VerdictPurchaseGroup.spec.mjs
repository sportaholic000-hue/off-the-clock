// Neon re-audit of v49, NEW-6 (November 25, 2026) — verdict: not changed.
// The price book editor tells owners: "Use the same purchase group only for
// the exact same product and variant." Walls and ceiling in one group are the
// same paint in the same color, so they share cans (deliberate core 4 rule,
// October 5). A ceiling in another color goes in its own group and gets its
// own cans. (A change to always separate them was made and reverted after the
// v50 full gate failed core 4.) Expected (400 coverage, 10% waste, $50 a can,
// 2 coats, 250 sq ft walls, 100 sq ft ceilings, one wall color):
// - one group: (500 + 200) x 1.10 / 400 = 1.925 -> 2 cans = 10000;
// - ceiling in its own group: walls 1.375 -> 2 cans, ceilings 0.55 -> 1 can.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

function job(ceilingProduct){
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,ceilingLaborPerSqftPerCoat:80,ceilingMaterialPerSqftPerCoat:25},
    {areaInputMethod:'wall_sqft',wallAreaSqft:250,doorCount:0,windowCount:0,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:2,ceilingSurfaceCondition:'good',trimIncluded:false,wallColorCount:1});
  f.ownerPricing.priceBasisByCategory.material='cost';const p=f.ownerPricing.pricing;p.scopeDetails={};p.scopeRates={};
  for(const key of ['paint_wall','paint_ceiling']){p.scopeDetails[key]={description:'[SYNTHETIC] '+key,mode:'package_cost',productKey:key==='paint_ceiling'?ceilingProduct:'paint',coverage:400,wastePercent:10};p.scopeRates[key]=5000;}
  f.customerInputs.paintProductsConfirmed=true;
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  return Object.fromEntries(q.options[0].lineItems.filter(l=>l.name.startsWith('Purchased materials')).map(l=>[l.name,l.amountCents]));
}
test('NEW-6 verdict: one purchase group (same product and color) shares cans',()=>{
  assert.deepEqual(job('paint'),{'Purchased materials: paint':10000});
});
test('NEW-6 verdict: a ceiling in its own purchase group gets its own cans',()=>{
  assert.deepEqual(job('ceiling_white'),{'Purchased materials: paint':10000,'Purchased materials: ceiling_white':5000});
});
