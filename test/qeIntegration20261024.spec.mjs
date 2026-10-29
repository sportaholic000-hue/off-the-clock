import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mowing} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';

// Handwritten before execution: 5000 sq ft * 2 cents + 3500 zone travel =
// 13500 cents. The 2500 business travel fee is replaced, never added.
const zones=[{name:'Core',codes:['E2L','E2M'],charge:0},{name:'Outer',codes:['E2H','E2J'],charge:3500}];
function input(postalCode){
  const f=mowing();f.ownerPricing.feeRules.travel='always';
  Object.assign(f.businessDefaults,{travelFee:2500,travelZones:zones});
  f.customerInputs.postalCode=postalCode;return f;
}
test('integration: requested weekly 5000 sq ft Outer quote totals 13500 cents, travel 3500',()=>{
  const q=generateQuoteVNext(input('E2J2A1'));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(q.calculationRecord.options[0].range.exactMidScenarioTotalCents,13500);
  assert.equal(q.lineItems.find(x=>x.category==='travel').amountCents,3500);
});
test('integration: outside postal goes to the business for review and malformed postal is asked again',()=>{
  // Outside every zone the travel charge is unknown, so no in-town price is promised.
  const outside=generateQuoteVNext(input('E3B 5A3'));
  assert.equal(outside.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(outside.midEstimate,undefined);
  assert.match(outside.reviewReason,/outside the areas this business has set travel charges for/);
  assert.ok(generateQuoteVNext(input('12')).invalidCustomerFields.includes('postalCode'));
});
test('integration: both source voice rule blocks survive the merge',()=>{
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  const instruction=compileVoiceSystemInstruction({guideText,business:{businessName:'[SYNTHETIC] Business',agentName:'Alex'},services:[],knowledge:{}});
  assert.ok(instruction.includes('Answer definitions: when a question has choiceDefinitions'));
  assert.ok(instruction.includes('Postal or ZIP code travel zones:'));
});
