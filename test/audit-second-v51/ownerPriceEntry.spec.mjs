// Second audit of v51 (November 26, 2026): owner price entry. "$1,250" showed
// "Enter a finite decimal number." Expected, written before the change:
// - a money field accepts a leading "$": "$25" -> 25, "$ 25.50" -> 25.5;
// - commas stay refused ("1,250" is also how a Quebec owner writes 1.25; a
//   silent misread is worse than a clear refusal), with the message "Enter a
//   plain number, for example 1250.50.";
// - a non-money field does not accept "$"; accepted values are read as before.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOwnerNumericInput} from '../../server/priceBookMoney.js';

const MESSAGE='Enter a plain number, for example 1250.50.';
test('owner price entry: leading $ on money, plain-number message',()=>{
  assert.equal(parseOwnerNumericInput('$25',{kind:'fixed_amount',path:'p'}),25);
  assert.equal(parseOwnerNumericInput('$ 25.50',{kind:'fixed_amount',path:'p'}),25.5);
  for(const raw of ['1,250','$1,250','12,5','abc','25%'])assert.throws(()=>parseOwnerNumericInput(raw,{kind:'fixed_amount',path:'p'}),e=>e.message===MESSAGE,raw);
  assert.throws(()=>parseOwnerNumericInput('$25',{path:'p'}),e=>e.message===MESSAGE);
  for(const [raw,value] of [['25.50',25.5],['25',25],['.5',0.5],['1e3',1000]])assert.equal(parseOwnerNumericInput(raw,{kind:'fixed_amount',path:'p'}),value,raw);
});
