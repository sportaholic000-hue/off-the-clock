import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';

// Expected amounts written by hand before running.
const calculate=(listing,quantity)=>calculateSavedListedPrice({prices:listing},{listedItem:listing,quantity,customerConfirmed:true});

for(const [listing,quantity,expected] of [
  ['Sod: $1.20 per square foot','500','600.00'],
  ['Gutter cleaning: $2.50 per linear foot','120','300.00'],
  ['Mulch: $45 per cubic yard','4','180.00'],
  ['Tile: $8 per sq ft','25','200.00'],
  ['Tile: $8/sq ft','25','200.00'],
  ['Trim: $3 per lin ft','10','30.00'],
  ['Stump grinding: $75 per stump','3','225.00'],
  ['Labour: $20 per hour','1.25','25.00']
])test(`listed unit: "${listing}" x ${quantity} = $${expected}`,()=>{
  const result=calculate(listing,quantity);
  assert.equal(result.status,'calculated');
  assert.equal(result.extendedAmount,expected);
});

for(const [listing,quantity] of [
  ['Service: $75 per hour minimum','0.5'],
  ['Rental: $10 per item daily','3'],
  ['Paint: $2 per sqft twice','10'],
  ['Stump grinding: $50 per tree stump','2'],
  ['Labour: $90 per hour extra','2']
])test(`listed unit with a second word that may change the charge is not multiplied: "${listing}"`,()=>{
  const result=calculateSavedListedPrice({prices:listing},{listedItem:listing,quantity,customerConfirmed:true});
  assert.equal(result.status,'needs_review');
  assert.equal(result.extendedAmount,undefined);
});
