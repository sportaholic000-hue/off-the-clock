// Backlog (verdicts audit): above its exact-search limit, the carpet cut plan
// turned one area at a time for at most 3 passes and could buy more carpet than
// the best plan. Expected, written before the change: these four jobs (12 ft
// roll, no pattern repeat), drawn from a 1,200-job random run where the
// earlier search overbought, buy the best plan found by pricing every
// combination of directions; two of them are now inside the exact search
// (2^areas x rooms <= 16,384) and two use the improved search.
// Values in square feet: before (earlier search) and best (every combination).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {carpetRollPurchase} from '../../server/quote-engine-vnext/flooringPricing.js';
import {exactToNumber} from '../../server/quote-engine-vnext/exactMath.js';

const CASES=[{"rooms":[[17,17],[9.5,6],[20.5,23.5],[22,6.5],[6.5,21.5],[11,22.5],[22.5,17.5],[15.5,11],[21.5,14],[16.5,16.5],[19,18.5],[9,20],[19,19.5]],"areas":[[1],[2],[3],[4],[5],[6],[7],[8],[9],[10],[11],[12],[13]],"seams":"allowed","before":3888,"best":3750},{"rooms":[[12.5,8],[20,7.5],[19.5,14],[15.5,18],[7,19],[20,23],[21.5,9],[12,10.5],[19.5,10],[22.5,6.5],[23,17.5],[19.5,14]],"areas":[[1],[2],[3],[4],[5],[6],[7],[8],[9],[10],[11],[12]],"seams":"not_allowed","before":3096,"best":3012},{"rooms":[[10.5,9],[14.5,11.5],[16.5,23],[14.5,21.5],[19.5,16.5],[20,15.5],[19.5,15.5],[12.5,8.5],[15,24],[18,20.5],[14,17.5],[20.5,6]],"areas":[[1],[2],[3,4],[5],[6],[7,8],[9],[10],[11],[12]],"seams":"allowed","before":3497,"best":3348},{"rooms":[[7,12],[16.5,9.5],[19.5,8],[21,17],[19,11.5],[23,23.5],[18,12.5],[14,16.5],[20,21],[17,20.5],[16,24]],"areas":[[1],[2,3],[4],[5],[6],[7],[8,9],[10],[11]],"seams":"not_allowed","before":3552,"best":3408}];
const job=k=>({c:{carpetRooms:k.rooms.map(([lengthFt,widthFt])=>({lengthFt,widthFt})),carpetConnectedAreas:k.areas},p:{carpetRollWidthFt:12,carpetPatternRepeatFt:0,carpetCrossgrainSeams:k.seams}});
for(const [n,k] of CASES.entries())test('carpet job '+(n+1)+' ('+k.areas.length+' areas, crossgrain seams '+k.seams.replace('_',' ')+') buys the best plan',()=>{
  const {c,p}=job(k);
  assert.equal(exactToNumber(carpetRollPurchase(c,p,{exhaustive:true}).purchasedQuantity),k.best);
  const bought=exactToNumber(carpetRollPurchase(c,p).purchasedQuantity);
  assert.equal(bought,k.best);assert.ok(bought<k.before);
});
test('a job beyond 24 areas still prices, using the earlier search',()=>{
  const rooms=Array.from({length:26},(_,i)=>({lengthFt:10+i%5,widthFt:9+i%4}));
  const r=carpetRollPurchase({carpetRooms:rooms,carpetConnectedAreas:rooms.map((_,i)=>[i+1])},{carpetRollWidthFt:12,carpetPatternRepeatFt:0,carpetCrossgrainSeams:'allowed'});
  assert.ok(exactToNumber(r.purchasedQuantity)>0);assert.equal(r.areaChoices.length,26);
});
