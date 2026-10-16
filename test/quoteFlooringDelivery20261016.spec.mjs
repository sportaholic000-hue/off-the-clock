import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {carpet,estimatedCarpetPhone} from './quoteFlooring20261016Fixture.mjs';
import {quoteEmailFixture,webQuote,publicCopy,publish,bridge,date} from './quoteDeliveryBatch20261015Fixture.mjs';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {CLEANUP_BAG_WARNING,FLOORING_ADDONS} from '../server/quote-engine-vnext/flooringPricing.js';
import {cleanupFixture} from './landscapeLaneB20261016Fixture.mjs';

test('flooring no optional prices asks no new extra question and retains 178,000 cents',()=>{
  // Expected before execution:200*300*1.10+200*1.12*500=178,000.
  const f=flooring(),definition=bridge.applicationServiceDefinition(f.ownerPricing);
  const names=definition.customerFields.map(field=>field.name);
  for(const a of FLOORING_ADDONS)assert.equal(names.includes(a.input),false);
  for(const name of ['carpetRooms','carpetConnectedAreas','carpetMeasurementMethod','floorLevelingNeeded','furnitureMovingNeeded'])assert.equal(names.includes(name),false);
  const w=webQuote(f);assert.equal(w.result.midEstimate,1780);
});

test('flooring new priced questions match between owner/widget and voice, including Not sure leveling',()=>{
  // Expected before execution: five offered extra lines, with furniture per
  // room and a separate leveling Yes/No; each question has the same label.
  const f=flooring();Object.assign(f.ownerPricing.pricing,{baseboardReinstallPerLF:250,transitionPriceEach:3500,furnitureMovingPrice:7500,furnitureMovingPriceUnit:'per_room',toiletPullResetEach:12500,floorLevelingPerSqft:400});
  const def=bridge.applicationServiceDefinition(f.ownerPricing),voice=voiceQuestionContract(f.ownerPricing,def).fields;
  for(const a of FLOORING_ADDONS){assert.equal(def.customerFields.find(q=>q.name===a.input).label,a.question);assert.equal(voice.find(q=>q.field===a.input).label,a.question);}
  assert.equal(voice.find(q=>q.field==='floorLevelingSqft').unknownLabel,'Not sure');
});

test('carpet resolved phone questions use room dimensions without requesting a duplicate area or room count',()=>{
  // Expected before execution: room/roll mode asks zero duplicate area,
  // area-method, room-count or hard-floor-layout questions; one room needs no
  // connection question. The room-dimension question itself stays available.
  const f=carpet([{lengthFt:12,widthFt:14}]),def=bridge.applicationServiceDefinition(f.ownerPricing);
  const fields=voiceQuestionContract(f.ownerPricing,def,{...f.customerInputs,carpetMeasurementMethod:'rooms'}).fields.map(f=>f.field);
  for(const key of ['sqft','sqftMethod','roomCount','layoutPattern','carpetConnectedAreas'])assert.equal(fields.includes(key),false,key);
  assert.ok(fields.includes('carpetRooms'));
});

test('flooring carpet caller-confirmed about 12 by 14 quotes, persists rooms and keeps site qualifications in phone/email/public copy',async t=>{
  // Expected before execution: floor168 sq ft; roll cuts min(2*12*14.5,
  // 2*12*12.5)=300 bought sq ft=90,000c material. Labor168*300*1.10
  // =55,440c; explicitly priced underlayment168c; total145,608 cents.
  const f=carpet([{lengthFt:12,widthFt:14}]);delete f.customerInputs.sqft;delete f.customerInputs.roomCount;
  const h=quoteEmailFixture(t),p=await estimatedCarpetPhone(h,f,{publish});
  assert.equal(p.result.status,'quoted',JSON.stringify({result:p.result,stored:h.db.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId)}));
  const qualification='This price is based on the measurements you gave us. The business will confirm them on site.';
  assert.ok(p.result.quoteNarration.includes(qualification));
  assert.match(p.result.quoteNarration,/Room 1: 12 ft front to back by 14 ft side to side/);
  assert.match(p.result.quoteNarration,/carpet quantity.*confirmed on site.*seaming diagram/i);
  assert.doesNotMatch(p.result.quoteNarration,/measurement method: Exact/i);
  const row=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);
  assert.deepEqual(JSON.parse(row.originalSubmissionJson).customerInputs.carpetRooms,[{lengthFt:12,widthFt:14}]);
  const prepared=await h.tool('prepareQuoteEmail',{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'});
  await h.tool('sendQuoteEmail',{emailConfirmationHandle:prepared.emailConfirmationHandle,customerConfirmed:true});
  const delivered=publicCopy(h.emailService(),h.rows()[0]);
  for(const text of [delivered.message.text,delivered.copy.narration]){assert.ok(text.includes(qualification));assert.match(text,/seaming diagram/);}
  const w=webQuote(f);w.email.enqueueSavedQuote({ownerId:w.owner,quoteId:w.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  for(const text of [JSON.parse(w.rows()[0].messageJson).text,publicCopy(w.email,w.rows()[0]).copy.narration])assert.match(text,/carpet quantity.*confirmed on site.*seaming diagram/i);
  const internal=JSON.parse(w.row.internalOutcomeJson).internalResult;
  assert.equal(internal.lineItems.reduce((s,l)=>s+l.amountCents,0),145608);
});

test('cleanup bag-only warning is owner-only and disappears after load estimation is priced',()=>{
  // Expected before execution: exactly the prompt wording, visible only in
  // owner diagnostics; completing load price + all three coverages removes it.
  const f=cleanupFixture();delete f.ownerPricing.pricing.disposalPerLoad;
  for(const row of Object.values(f.ownerPricing.pricing.debrisPricing))delete row.sqftPerLoad;
  const book={ownerId:f.ownerPricing.origin.ownerId,services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}};
  let status=bridge.applicationStatus(f.ownerPricing,book,date);
  assert.ok(status.statusNotices.includes(CLEANUP_BAG_WARNING));
  f.ownerPricing.pricing.disposalPerLoad=12000;for(const row of Object.values(f.ownerPricing.pricing.debrisPricing))row.sqftPerLoad=2000;
  status=bridge.applicationStatus(f.ownerPricing,book,date);assert.equal(status.statusNotices?.includes(CLEANUP_BAG_WARNING)||false,false);
});
