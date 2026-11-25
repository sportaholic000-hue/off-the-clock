// Neon re-audit of v49, NEW-10 (November 25, 2026): the AI interview accepted
// 51%-100% for the diagonal and herringbone waste additions, whose engine
// limit is 50%; the service then showed NEEDS PRICING. Expected, written
// before the fix:
// - {tile: 80} is refused at the interview with "0 to 50";
// - {tile: 50} and {tile: 4} are accepted (returned as entered, converted
//   later when the draft becomes the price book);
// - other percent fields keep their 0-100 limit (baseCompactionAllowance 80 ok).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {validateInterviewValue} from '../../server/src/priceBookAI.js';

test('NEW-10: flooring waste additions are capped at 50% in the interview',()=>{
  for(const field of ['diagonalWasteAdderByType','herringboneWasteAdderByType']){
    assert.throws(()=>validateInterviewValue('FLOORING_INSTALL',field,{tile:80},{}),/0 to 50/,field);
    assert.doesNotThrow(()=>validateInterviewValue('FLOORING_INSTALL',field,{tile:50},{}),field);
    assert.doesNotThrow(()=>validateInterviewValue('FLOORING_INSTALL',field,{tile:4},{}),field);
  }
  assert.doesNotThrow(()=>validateInterviewValue('CONCRETE_DRIVEWAY','baseCompactionAllowance',80,{}));
});
