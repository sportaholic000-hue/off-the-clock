import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteKnowledgeText} from '../server/src/voice/knowledgeText.js';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';

// Owner ruling 2026-10-08: the receptionist never tells a caller to call, text,
// email or message the business. Expected values written by hand before running.
for(const sentence of [
  'Call us for a free estimate.','Call or text for a free quote.','Call us for pricing.','Call for rates.',
  'Give us a call for a quote.','Contact us for a quote.','Get in touch for a free consultation.',
  'Text us anytime at 506-555-0100.','Call 506-555-0100 to book.','Call us today!','Reach out to us for more details.',
  'Please call for more information.','Email us to schedule an appointment.'
])test(`contact-only invitation is removed: "${sentence}"`,()=>{
  assert.equal(rewriteKnowledgeText(sentence),'');
});

for(const sentence of [
  'Text us for a 10% discount.','Text us for free delivery.','Free estimates only if you text us.',
  'Call us for emergency service.','Call for pricing on large orders.','Text us for the coupon.','Free estimates.'
])test(`sentence carrying an offer, condition or fact is kept word for word: "${sentence}"`,()=>{
  assert.equal(rewriteKnowledgeText(sentence),sentence);
});

for(const [prices,quantity,amount] of [
  ['Window washing: $6 each. Call us for a free estimate.','10','60.00'],
  ['Gutter cleaning: $2.50 per linear foot\nAll prices plus HST. Call or text for a free estimate.','120','300.00'],
  ['Stump grinding: $75 per stump.\nGive us a call for a quote.','3','225.00']
])test(`listing with a contact line still multiplies and never says call or text: ${JSON.stringify(prices)}`,()=>{
  const listedItem=rewriteKnowledgeText(prices);
  const result=calculateSavedListedPrice({prices},{listedItem,quantity,customerConfirmed:true});
  assert.equal(result.status,'calculated');
  assert.equal(result.extendedAmount,amount);
  assert.doesNotMatch(result.voiceSummary,/\b(?:call|text|email|message|contact)\b/i);
});
