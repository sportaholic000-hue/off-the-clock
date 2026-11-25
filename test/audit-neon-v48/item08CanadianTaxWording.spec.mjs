// Neon audit of v48 #8 (November 25, 2026): the phone agent's listed-price
// calculator refused any saved price followed by PST, QST or RST wording
// (BC, SK, MB, QC price sheets), and the website importer did not treat those
// taxes as price qualifications. Expected, written before the fix: each
// Canadian tax wording calculates $129 x 2 = $258.00 like "Plus HST"; other
// trailing wording is still refused.
import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSavedListedPrice} from '../../server/src/voice/listedPriceCalculation.js';

const calc=tax=>{const item='Furnace tune-up $129 per visit. '+tax;return calculateSavedListedPrice({prices:item},{listedItem:item,quantity:'2',customerConfirmed:true});};
test('Neon v48 #8: Canadian provincial tax wording calculates the listed price',()=>{
  for(const tax of ['Plus HST.','Plus GST.','Plus GST/PST.','Plus GST and QST.','Plus PST.','Plus GST and RST.','Plus TPS/TVQ.']){
    const r=calc(tax);assert.equal(r.status,'calculated',tax);assert.equal(r.extendedAmount,'258.00',tax);
  }
});
test('Neon v48 #8: other trailing wording is still refused',()=>{
  for(const tax of ['Plus shipping.','Plus PST on parts only.'])assert.equal(calc(tax).status,'needs_review',tax);
});
