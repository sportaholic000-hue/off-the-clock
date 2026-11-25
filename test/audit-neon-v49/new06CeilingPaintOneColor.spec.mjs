// Neon re-audit of v49, NEW-6 (November 25, 2026): v49 #6 bought ceiling
// paint in its own cans only when the walls had several colors. With one wall
// color (the most common job) walls and ceilings on the same product still
// shared cans. Industry practice: ceilings are normally another color (most
// often flat white), mixed and bought separately. Expected, written before
// the fix (400 coverage, 10% waste, $50 per can, 2 coats, no doors/windows):
// - walls: 250 x 2 x 1.10 / 400 = 1.375 -> 2 cans = 10000;
// - ceilings: 100 x 2 x 1.10 / 400 = 0.55 -> 1 can = 5000 on its own line;
//   (before: pooled 1.925 -> 2 cans = 10000 for both, one can short);
// - walls and ceilings on different products: unchanged (no new label).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

function job(ceilingProduct='paint'){
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,ceilingLaborPerSqftPerCoat:80,ceilingMaterialPerSqftPerCoat:25},
    {areaInputMethod:'wall_sqft',wallAreaSqft:250,doorCount:0,windowCount:0,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:2,ceilingSurfaceCondition:'good',trimIncluded:false,wallColorCount:1});
  f.ownerPricing.priceBasisByCategory.material='cost';const p=f.ownerPricing.pricing;p.scopeDetails={};p.scopeRates={};
  for(const key of ['paint_wall','paint_ceiling']){p.scopeDetails[key]={description:'[SYNTHETIC] '+key,mode:'package_cost',productKey:key==='paint_ceiling'?ceilingProduct:'paint',coverage:400,wastePercent:10};p.scopeRates[key]=5000;}
  f.customerInputs.paintProductsConfirmed=true;
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  return Object.fromEntries(q.options[0].lineItems.filter(l=>l.name.startsWith('Purchased materials')).map(l=>[l.name,l.amountCents]));
}
test('NEW-6: one wall color, same product: ceiling paint in its own cans',()=>{
  assert.deepEqual(job(),{'Purchased materials: paint':10000,'Purchased materials: paint — ceilings':5000});
});
test('NEW-6: walls and ceilings on different products are unchanged',()=>{
  assert.deepEqual(job('ceiling_white'),{'Purchased materials: paint':10000,'Purchased materials: ceiling_white':5000});
});
