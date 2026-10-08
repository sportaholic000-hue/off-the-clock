import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';

// Synthetic owner listings only. Expected products are hand-written before execution.
const calculate=(listing,quantity='2')=>calculateSavedListedPrice(
 {prices:listing},{listedItem:listing,quantity,customerConfirmed:true}
);
const assertReview=listing=>{
 const result=calculate(listing);
 assert.equal(result.status,'needs_review');
 for(const field of ['extendedAmount','currency','voiceSummary'])assert.ok(!Object.hasOwn(result,field),field);
};

for(const listing of [
 'Minimum charge of $10 per hour',
 'Minimum charge $50 per hour.',
 'Up to $10 per acre',
 'About $10 per acre',
 'From only $10 per acre',
 'Half price on Tuesdays: $10 per item',
 'First item $10 each',
 'Second item half price $10 each.',
 'Starting price $10 per item.'
])test(`engine audit listed prices: pre-price condition requires review: ${listing}`,()=>assertReview(listing));

for(const qualification of [
 'minimum','min','maximum','max','from','starting','start','up to','about','approx',
 'around','only','first','second','half','discount','off','sale','special','promo',
 'deal','free','extra','additional','each additional','per'
])test(`engine audit listed prices: qualification anywhere in item prefix requires review: ${qualification}`,()=>{
 assertReview(`Synthetic ${qualification} service: $10 each`);
 assertReview(`SYNTHETIC ${qualification.toUpperCase()} SERVICE: $10 each`);
});

for(const listing of [
 'Synthetic 2 item $10 each','2 synthetic items $10 each','Synthetic item 2 $10 each',
 'Synthetic ½ item $10 each','Half-round gutter: $10 per linear foot',
 'Synthetic per-visit service: $10 each'
])test(`engine audit listed prices: numeric and qualified item names require review: ${listing}`,()=>assertReview(listing));

for(const [listing,quantity,expected,spoken] of [
 ['Bricks $2 each','500','1000.00','$1,000.00'],
 ['Gutter cleaning: $2.50 per linear foot','120','300.00','$300.00'],
 ['Service call: $95 each.','3','285.00','$285.00'],
 ['Custom text engraving: $25 each','2','50.00','$50.00'],
 ['Furnace tune-up: $129 each.','2','258.00','$258.00'],
 ['Synthetic item: $1.25 each','2.5','3.13','$3.13']
])test(`engine audit listed prices: flat listing retains exact product: ${listing} x ${quantity}`,()=>{
 const result=calculate(listing,quantity);
 assert.equal(result.status,'calculated');
 assert.equal(result.extendedAmount,expected);
 assert.ok(result.voiceSummary.includes(spoken));
 assert.ok(result.voiceSummary.startsWith(listing));
});

test('engine audit listed prices: qualification words use word boundaries',()=>{
 const result=calculate('Synthetic offshore periwinkle service: $10 each');
 assert.equal(result.status,'calculated');
 assert.equal(result.extendedAmount,'20.00');
});
