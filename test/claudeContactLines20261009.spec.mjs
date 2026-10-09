import test from 'node:test';
import assert from 'node:assert/strict';
import {rewriteKnowledgeText} from '../server/src/voice/knowledgeText.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {calculateSavedListedPrice} from '../server/src/voice/listedPriceCalculation.js';
import {readFileSync} from 'node:fs';
const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');

// Owner ruling 2026-10-08: contact-only invitations, including free-estimate
// invitations, are removed from owner text without rewriting. October 9 audits
// found word orders the first grammar missed. Expected values written by hand
// before running.
for(const sentence of [
  'For a free estimate, call us.',
  'Email us at quotes@example.invalid for a free estimate.',
  'Call us to get a free estimate.',
  'For a free quote, give us a call today.',
  'Contact us anytime for a free, no-obligation quote.',
  'To book an appointment, call us.',
  'For pricing, call 506-555-0100.',
  'Call or text us at 506-555-0100 for a free estimate.',
  'Email quotes@example.invalid to request a quote.'
])test(`contact-only invitation is removed in any word order: "${sentence}"`,()=>{
  assert.equal(rewriteKnowledgeText(sentence),'');
});

for(const sentence of [
  'For a free estimate on jobs over $500, call us.',
  'Call us for a 10% discount.',
  'If you book on Monday, the price is $25.',
  'Free estimates on jobs over $500.',
  'For emergencies, call us 24/7.',
  'Free estimates!'
])test(`sentence carrying an amount, condition or other fact is kept word for word: "${sentence}"`,()=>{
  assert.equal(rewriteKnowledgeText(sentence),sentence);
});

test('a contact sentence is removed while the fact beside it stays',()=>{
  assert.equal(rewriteKnowledgeText('Free estimates! Call 506-555-0100.'),'Free estimates!');
});

test('the compiled receptionist prompt no longer carries the reordered invitation',()=>{
  const prompt=compileVoiceSystemInstruction({guideText,business:{businessName:'Synthetic Business',agentName:'Alex'},services:[],knowledge:{prices:'Gutter cleaning $2.50 per foot. For a free estimate, call us.'}});
  assert.match(prompt,/Gutter cleaning \$2\.50 per foot\./);
  assert.doesNotMatch(prompt,/For a free estimate, call us/);
});

test('a listed price followed by a reordered invitation still multiplies: 120 x $2.50 = $300.00',()=>{
  const prices='Gutter cleaning $2.50 per foot. For a free estimate, call us.';
  const result=calculateSavedListedPrice({prices},{listedItem:'Gutter cleaning $2.50 per foot.',quantity:'120',customerConfirmed:true});
  assert.equal(result.extendedAmount,'300.00');
});
