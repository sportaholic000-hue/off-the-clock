import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {phone,quoteEmailFixture,webQuote,publicCopy,bridge} from './quoteDeliveryBatch20261015Fixture.mjs';
import {voiceQuestionContract,bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {customerFieldForInputs} from '../server/scopeConfiguration.js';
import {FENCE_RUN_QUESTION,FENCE_CLOSED_QUESTION,FENCE_SECTION_QUESTION} from '../server/quote-engine-vnext/fencePricing.js';
import {priceChoices,reviewRows} from '../client/src/pricebookReview.js';

// Expected before execution: 7+9=16 infill LF, 5 posts: 4 terminal + 1 line.
// $160 labor + $352 waste-adjusted infill + $100 posts + $20 footing labor
// + $30 footing material + $250 gate = $912.00 (91,200 cents).
function sections(){const f=fenceFixture();f.ownerPricing.pricing.fenceOfferings.wood.offeringDetails.gates.walk.postsAndFootingsIncluded=false;
  for(const k of ['linearFeet','lfMethod','cornerCount','gates'])delete f.customerInputs[k];
  f.customerInputs.fenceRuns=[{closed:false,sections:[{lengthLF:7,gateAfter:'walk'},{lengthLF:9}]}];return f;}
test('Oct16 section questions and complete gate identities are identical for widget and phone; no height options or post-count question',()=>{
  const f=sections(),service=f.ownerPricing,definition=bridge.applicationServiceDefinition(service),inputs=f.customerInputs;
  const voice=voiceQuestionContract(service,definition,inputs).fields;
  assert.equal(voice.find(q=>q.field==='fenceRunCount').label,FENCE_RUN_QUESTION);
  const widget=customerFieldForInputs(definition.customerFields.find(q=>q.name==='fenceRuns'),inputs),spoken=voice.find(q=>q.field==='fenceRuns');
  assert.equal(widget.closedQuestion,FENCE_CLOSED_QUESTION);assert.equal(widget.sectionQuestion,FENCE_SECTION_QUESTION);
  assert.deepEqual(spoken.details,[FENCE_CLOSED_QUESTION,FENCE_SECTION_QUESTION]);assert.deepEqual(spoken.choices,widget.gateChoices);
  assert.equal(voice.find(q=>q.field==='fenceHeight').choices,undefined);assert.ok(!voice.some(q=>/post.*count/i.test(q.label)));
});
test('Oct16 section gate names bind stable keys after selecting the fence type and height',()=>{
  const f=sections(),definition=bridge.applicationServiceDefinition(f.ownerPricing),customerInputs=structuredClone(f.customerInputs);delete customerInputs.confirmedFacts;
  customerInputs.fenceRuns[0].sections[0].gateAfter='Walk';
  const b=bindVoiceQuoteInputs(f.ownerPricing,definition,{customerInputs,productConfirmations:{fenceType:true}});
  assert.deepEqual(b.followUps,[]);assert.equal(b.customerInputs.fenceRuns[0].sections[0].gateAfter,'walk');
});
test('Oct16 production section flow: widget, phone, persistence, and public copy retain 91200 cents, runs and gate positions',async t=>{
  const f=sections(),h=quoteEmailFixture(t),p=await phone(h,f),web=webQuote(f);
  assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,912);assert.equal(web.result.midEstimate,912);
  const stored=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);
  for(const row of [stored,web.row]){
    assert.deepEqual(JSON.parse(row.originalSubmissionJson).customerInputs.fenceRuns,f.customerInputs.fenceRuns);
    assert.equal(JSON.parse(row.customerResponseJson).midEstimate,912);
  }
  assert.match(p.result.quoteNarration,/Section 1: 7 ft; gate: walk/);assert.match(p.result.quoteNarration,/Section 2: 9 ft/);
  web.email.enqueueSavedQuote({ownerId:web.owner,quoteId:web.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  const {copy}=publicCopy(web.email,web.rows()[0]);assert.match(copy.narration,/\$912 CAD/);assert.match(copy.narration,/Section 1: 7 ft; gate: walk/);
});
test('Oct16 four fence types: phone aluminum has its own three 400000/410000/420000-cent options',async t=>{
  const h=quoteEmailFixture(t),p=await phone(h,fourTypes());
  assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.deepEqual(p.result.options.map(q=>q.midEstimate),[4000,4100,4200]);
});
test('Oct16 owner review: nested prices are dollars, row heights are feet, allocations are percentages, and zero choices name exact rows',()=>{
  const f=fourTypes(),service=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars').services[0];
  const choices=priceChoices(service),rows=reviewRows(service,{},{});
  assert.ok(choices.some(r=>r.path==='fenceOfferings.aluminum.heightRows.six.offeringRates.installedFencePerLF'&&r.value===40));
  assert.ok(rows.some(r=>/Aluminum.*Six.*Installed fence/.test(r.label)&&r.value==='$40'));
  assert.ok(rows.some(r=>/Height up to and including/.test(r.label)&&r.value==='6 ft'));
  assert.ok(rows.some(r=>r.value==='60%'));assert.ok(!rows.some(r=>r.value.includes('[object Object]')));
});
