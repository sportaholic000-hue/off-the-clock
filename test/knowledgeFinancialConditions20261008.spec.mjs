// Synthetic owner listings; no database or external communication.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {rewriteKnowledgeText} from '../server/src/voice/knowledgeText.js';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';

const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const compiledPrices=prices=>{
 const prompt=compileVoiceSystemInstruction({guideText,business:{businessName:'[SYNTHETIC] Business',agentName:'Ava'},services:[],knowledge:{prices}});
 return JSON.parse(prompt.match(/<OWNER_FACTS_JSON>\s*([\s\S]*?)\s*<\/OWNER_FACTS_JSON>/)[1]).knowledge.prices;
};

for(const listing of [
 'Mowing: $10 per acre. Text us for a 10% discount.',
 '$10 per acre only if you text us before booking',
 'Mowing: $10 per acre. Call or text for a discount.',
 'Mowing: $10 per acre. Text or call to waive the minimum.',
 'Mowing $10 per acre. Only if you text us before booking.',
 'Mowing $10 per acre. Provided that you text us before booking.',
 'Mowing $10 per acre. Provided you text us before booking.',
 'Mowing $10 per acre. Providing that you text us before booking.',
 'Mowing $10 per acre. Providing you text us before booking.',
 'Mowing $10 per acre. Unavailable unless you text us before booking.',
 'Mowing $10 per acre. Conditional on you texting; text us before booking.',
 'Mowing $10 per acre. Subject to confirmation; text us before booking.',
 'Mowing $10 per acre. Texting is required; text us before booking.',
 'Mowing $10 per acre. Available if you text us before booking.',
 'Mowing $10 per acre. Text us to save.',
])test('audit 2 financial contact condition stays verbatim and requires review: '+listing,()=>{
 assert.equal(rewriteKnowledgeText(listing),listing);
 assert.equal(compiledPrices(listing),listing);
 const result=calculateSavedListedPrice({prices:listing},{listedItem:compiledPrices(listing),quantity:'2',customerConfirmed:true});
 assert.equal(result.status,'needs_review');
 assert.equal(Object.hasOwn(result,'extendedAmount'),false);
});

for(const sentence of [
 'Text us for a discount.',
 'Call or text to avoid the surcharge.',
 'Text or call for our minimum booking.',
 'Text me to waive the tax.',
 'Text us to waive the fee.',
 'Text us for a rebate.',
 'Text us for a refund.',
 'Text us before paying the deposit.',
 'Text us for the payment terms.',
 'Text us for the coupon.',
 'Text us for the promo.',
 'Text us for our sale.',
 'Text us for the special.',
 'Text us for this deal.',
 'Text us for financing.',
 'Text us to get half off.',
 'Text us for free delivery.',
 'Free estimates only if you text us.',
 'Text us for a free estimate.',
 "We'll text you about the discount.",
 'We send texts explaining surcharges.',
])test('audit 2 financial sentence without an amount is untouched: '+sentence,()=>{
 assert.equal(rewriteKnowledgeText(sentence),sentence);
});

test('audit 2 only non-financial sentences in a mixed paragraph are rewritten or removed',()=>{
 const input='Text us for hours. Mowing: $10 per acre. Text us for a 10% discount. We send texts. Text me for access.';
 const expected='Mowing: $10 per acre. Text us for a 10% discount.';
 assert.equal(rewriteKnowledgeText(input),expected);
 assert.equal(compiledPrices(input),expected);
});

test('audit 2 prompt and calculator accept the same rewritten ordinary contact invitation',()=>{
 const original='Window washing: $6 each. Text us for a quote.';
 const rewritten='Window washing: $6 each.';
 assert.equal(compiledPrices(original),rewritten);
 const result=calculateSavedListedPrice({prices:original},{listedItem:rewritten,quantity:'10',customerConfirmed:true});
 assert.equal(result.status,'calculated');
 assert.equal(result.extendedAmount,'60.00');
 assert.equal(result.listedItem,rewritten);
});

test('audit 2 free-estimate financial condition remains word for word',()=>{
 assert.equal(rewriteKnowledgeText('Call or text for a free estimate.'),'Call or text for a free estimate.');
 assert.equal(rewriteKnowledgeText('Text or call for a free quote.'),'Text or call for a free quote.');
});
