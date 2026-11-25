// Neon re-audit of v49, note on v48 #8 (November 25, 2026): "Plus GST & PST"
// with an ampersand still fell back to review. Expected, written before the
// fix: $129 x 2 = $258.00, like "Plus GST and PST"; "Plus shipping & handling"
// is still refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSavedListedPrice} from '../../server/src/voice/listedPriceCalculation.js';

const calc=tax=>{const item='Furnace tune-up $129 per visit. '+tax;return calculateSavedListedPrice({prices:item},{listedItem:item,quantity:'2',customerConfirmed:true});};
test('Neon v49 note: "Plus GST & PST" calculates the listed price',()=>{
  for(const tax of ['Plus GST & PST.','Plus GST & QST.','Plus TPS & TVQ.']){const r=calc(tax);assert.equal(r.status,'calculated',tax);assert.equal(r.extendedAmount,'258.00',tax);}
  assert.equal(calc('Plus shipping & handling.').status,'needs_review');
});
