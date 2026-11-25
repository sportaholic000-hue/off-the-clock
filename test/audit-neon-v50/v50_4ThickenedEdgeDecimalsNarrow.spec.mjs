// Neon audit of v50, V50-4 (November 26, 2026). Expected, worked by hand
// before the fix (1 ft thickened edge):
// - decimal L outline (0,0)(10.1,0)(10.1,8)(20.4,8)(20.4,18)(0,18), 10.3 ft
//   against the house: the 10.3 ft step is found as a whole edge (it was
//   missed: 20.4 - 10.1 in binary floating point is 10.299999999999999);
//   band = 284.8 - (56.7 + 165.6 - 2) = 64.5 sq ft;
// - 20 x 2 walkway with 15 ft (not a whole edge) against a wall: the partial-
//   edge formula (44 - 15) x 1 - 2 = 27, not the whole slab (40);
// - 20 x 2 strip bounded on all 4 sides (44 ft): 0, not 40;
// - unchanged: 20 x 2 with nothing adjoining is thickened through (40).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {exactToNumber} from '../../server/quote-engine-vnext/exactMath.js';
import {thickenedEdgeAreaSqft,adjoiningEdgeRuns} from '../../server/quote-engine-vnext/concreteLandscapePricing.js';

const p={thickenedEdgeWidthInches:12};
const L=[{x:0,y:0},{x:10.1,y:0},{x:10.1,y:8},{x:20.4,y:8},{x:20.4,y:18},{x:0,y:18},{x:0,y:0}];
const ex=(l,w,a)=>exactToNumber(thickenedEdgeAreaSqft({dimensionMethod:'exact',length:l,width:w,...(a?{adjoinsExistingConcrete:true,adjoiningEdgeLF:a}:{})},l*w,2*(l+w),p));
test('V50-4: a decimal edge is matched exactly',()=>{
  assert.deepEqual(adjoiningEdgeRuns(L,10.3).map(s=>[...s]),[[2]]);
  assert.equal(exactToNumber(thickenedEdgeAreaSqft({dimensionMethod:'measured_outline',outlinePoints:L,adjoinsExistingConcrete:true,adjoiningEdgeLF:10.3},284.8,77.6,p)),64.5);
});
test('V50-4: a narrow slab against a wall is not thickened through',()=>{
  assert.equal(ex(20,2,15),27);
  assert.equal(ex(20,2,44),0);
  assert.equal(ex(20,2),40);
});
