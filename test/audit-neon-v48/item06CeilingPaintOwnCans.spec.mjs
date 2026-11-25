// Neon audit of v48 #6 (November 25, 2026): with paint bought by the can,
// more than one wall color, and walls and ceilings on the same product, the
// ceiling paint was pooled into "wall color 1" (wrong label, and one can too
// few when the two fractions shared a can). Expected, written before the fix
// (400 coverage, 10% waste, $50 per can, 2 coats each):
// - wall color 1: 50 x 2 x 1.10 / 400 = 0.275 -> 1 can = 5000;
// - wall color 2: 280 x 2 x 1.10 / 400 = 1.54 -> 2 cans = 10000;
// - ceilings: 60 x 2 x 1.10 / 400 = 0.33 -> 1 can = 5000 on its own line
//   (before: pooled into wall color 1, 0.605 -> 1 can for both).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

test('Neon v48 #6: ceiling paint is bought in its own cans when walls have several colors',()=>{
  const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,ceilingLaborPerSqftPerCoat:80,ceilingMaterialPerSqftPerCoat:25},
    {areaInputMethod:'wall_sqft',wallAreaSqft:400,doorCount:2,windowCount:2,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:true,ceilingAreaSqft:60,ceilingCoats:2,ceilingSurfaceCondition:'good',trimIncluded:false,wallColorCount:2,wallColorAreas:[{areaSqft:50},{areaSqft:280}]});
  f.ownerPricing.priceBasisByCategory.material='cost';const p=f.ownerPricing.pricing;p.scopeDetails={};p.scopeRates={};
  for(const key of ['paint_wall','paint_ceiling']){p.scopeDetails[key]={description:'[SYNTHETIC] '+key,mode:'package_cost',productKey:'paint',coverage:400,wastePercent:10};p.scopeRates[key]=5000;}
  f.customerInputs.paintProductsConfirmed=true;
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  const paint=Object.fromEntries(q.options[0].lineItems.filter(l=>l.name.startsWith('Purchased materials')).map(l=>[l.name,l.amountCents]));
  assert.deepEqual(paint,{'Purchased materials: paint — wall color 1':5000,'Purchased materials: paint — wall color 2':10000,'Purchased materials: paint — ceilings':5000});
});
