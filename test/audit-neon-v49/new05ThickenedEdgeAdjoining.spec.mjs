// Neon re-audit of v49, NEW-5 (November 25, 2026): v49 #10 kept the
// thickened edge off the foundation only for rectangles entered by length and
// width, and only through a formula that assumed one wall: outlines ignored
// the adjoining edge, a narrow walkway against a wall was thickened through,
// and an L-corner was 1 sq ft short. The caller gives only the total length
// against the house, so the edges are found as the run of connected slab
// edges with that length; the band is the slab within the edge width of the
// remaining free edges. Expected (1 ft edge width), worked by hand before the fix:
// - 10 x 10, one 10 ft wall: 30 - 2 corners = 28 sq ft, entered by length and
//   width or as an outline (outline was 36);
// - 20 x 2 walkway along a 20 ft wall: far side 20 + two 1 x 1 ends = 22
//   (was 40, the whole slab);
// - 10 x 10 in an L-corner (20 ft adjoining): 20 - 1 corner = 19 (was 18);
// - 10 x 20 against three sides (40 ft): the free 20 ft side = 20;
// - L outline (legs 10 x 4 and 4 x 6, area 64), 10 ft adjoining: against its
//   bottom edge 28 (36 sq ft more than 1 ft from every free edge). CORRECTED
//   after the first run: 10 ft also fits the inside corner of the L (4 + 6 ft,
//   the usual L patio around a house corner): 64 - (25 + 10) = 29, worked by
//   hand. With two readings the larger band is ordered, so the quote uses 29;
//   28 is checked directly for the bottom-edge reading;
// - unchanged: nothing adjoining (20 x 20 -> 76, 20 x 2 -> 40); an adjoining
//   length that is no run of whole edges (8 ft of a 20 x 20) keeps the v49
//   formula (80 - 8) - 2 = 70;
// - quote: the 20 x 2 walkway, 4 in slab + 4 in deeper edge at $180.00/cu yd,
//   no waste: (40 + 22) x 4 / 324 = 0.765432 cu yd -> 13778 cents (was 17778).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {exactToNumber} from '../../server/quote-engine-vnext/exactMath.js';
import {thickenedEdgeAreaSqft,outlineEdgeBandSqft} from '../../server/quote-engine-vnext/concreteLandscapePricing.js';
import {concrete} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const p={thickenedEdgeWidthInches:12};
const rect=(length,width,adjoining)=>exactToNumber(thickenedEdgeAreaSqft({dimensionMethod:'exact',length,width,...(adjoining?{adjoinsExistingConcrete:true,adjoiningEdgeLF:adjoining}:{})},length*width,2*(length+width),p));
const outline=(points,area,perimeter,adjoining)=>exactToNumber(thickenedEdgeAreaSqft({dimensionMethod:'measured_outline',outlinePoints:points,...(adjoining?{adjoinsExistingConcrete:true,adjoiningEdgeLF:adjoining}:{})},area,perimeter,p));
const square=[{x:0,y:0},{x:10,y:0},{x:10,y:10},{x:0,y:10},{x:0,y:0}];
const ell=[{x:0,y:0},{x:10,y:0},{x:10,y:4},{x:4,y:4},{x:4,y:10},{x:0,y:10},{x:0,y:0}];

test('NEW-5: band along free edges for one wall, an L-corner, three sides and a narrow walkway',()=>{
  assert.equal(rect(10,10,10),28);
  assert.equal(rect(20,2,20),22);
  assert.equal(rect(10,10,20),19);
  assert.equal(rect(10,20,40),20);
});
test('NEW-5: outlines leave the adjoining edges out too',()=>{
  assert.equal(outline(square,100,40,10),28);
  assert.equal(outline(square,100,40,20),19);
  assert.equal(outline(ell,64,40,10),29);
  assert.equal(exactToNumber(outlineEdgeBandSqft(ell,1,new Set([0]))),28);
});
test('NEW-5: unchanged with nothing adjoining or a partial edge',()=>{
  assert.equal(rect(20,20),76);assert.equal(rect(20,2),40);assert.equal(outline(ell,64,40),36);
  assert.equal(rect(20,20,8),70);
});
test('NEW-5: the walkway quote orders concrete for the free-edge band only',()=>{
  const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false,length:20,width:2,adjoinsExistingConcrete:true,adjoiningEdgeLF:20});
  Object.assign(f.ownerPricing.pricing,{thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12,concreteWasteFactor:0,isolationJointPricing:'included'});
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  assert.equal(q.options[0].lineItems.find(l=>l.name==='Ready-mix concrete').amountCents,13778);
});
