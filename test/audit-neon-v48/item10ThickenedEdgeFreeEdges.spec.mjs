// Neon audit of v48 #10 (November 25, 2026): on a slab against a house
// foundation, formwork left out the adjoining edge but the thickened edge
// still ran the full perimeter, thickening concrete against the foundation.
// Residential practice: an isolation joint at the foundation, a thickened
// turn-down at free edges only. Expected, written before the fix (20 x 20 ft,
// 4 in slab, 1 ft edge 4 in deeper, no waste, $180.00 per cubic yard):
// - free-standing (unchanged): (80 - 4) = 76 sq ft band; 476/81 cu yd ->
//   105778 cents (hand-checked in qeLaunchC_20261119);
// - one 20 ft side against the house: free edges 60 ft, band 60 - 2 = 58 sq
//   ft; 400*4/324 + 58*4/324 = 458/81 = 5.654321 cu yd -> 101777.78 ->
//   101778 cents.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {concrete} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const slab=inputs=>{const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false,length:20,width:20},inputs);Object.assign(f.ownerPricing.pricing,{thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12,concreteWasteFactor:0,isolationJointPricing:'included'});return f;};
const concreteCents=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason+' '+JSON.stringify([q.missingOwnerFields,q.invalidOwnerFields,q.missingCustomerFields]));return q.options[0].lineItems.find(l=>l.name==='Ready-mix concrete').amountCents;};
test('Neon v48 #10: the thickened edge runs along free edges only',()=>{
  assert.equal(concreteCents(slab({adjoinsExistingConcrete:false})),105778);
  assert.equal(concreteCents(slab({adjoinsExistingConcrete:true,adjoiningEdgeLF:20})),101778);
});
