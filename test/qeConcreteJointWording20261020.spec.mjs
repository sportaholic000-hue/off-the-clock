import test from 'node:test';
import assert from 'node:assert/strict';
import {concreteLandscapeNotices} from '../server/quote-engine-vnext/concreteLandscapePricing.js';

// Written before execution: a 4-inch slab (no minimum thickness set) has a
// warning past 36 x 4 in = 12 ft; 15 ft warns with the NRMCA wording, 10 ft does not.
const NOTICE="Control-joint spacing of 15 feet exceeds 12 feet for a 4-inch slab. NRMCA recommends a maximum of 24 to 36 times the slab thickness (about 10 feet for a 4-inch slab) and never more than 15 feet. A quote for a slab too thin for this spacing (more than 36 times its thickness) goes to you for review.";
const pricing=spacing=>({slabLaborMinThicknessInches:4,slabLaborMaxThicknessInches:4,controlJointPricing:'excluded',controlJointSpacingFt:spacing});
test('4-inch slab at 15 ft control-joint spacing shows the NRMCA wording',()=>{
  assert.deepEqual(concreteLandscapeNotices('CONCRETE_PATIO_SLAB',pricing(15)),[NOTICE]);
});
test('4-inch slab at 10 ft control-joint spacing shows no spacing warning',()=>{
  assert.deepEqual(concreteLandscapeNotices('CONCRETE_PATIO_SLAB',pricing(10)),[]);
});
