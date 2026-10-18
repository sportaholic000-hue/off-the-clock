import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,sanitizeForCustomerVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {BASE,types,expected,fixtureFor,numericalOutput,moneyText,finalCents} from '../verification/qe-concrete-base-scope-20261018/fixtures.mjs';
import {webQuote,phone,quoteEmailFixture,bridge,date,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
import {migrate} from '../server/src/db.js';
import {projectSavedQuoteContext} from '../server/src/voice/voiceQuotePresentation.js';

// Independent expectations precede execution in EXPECTED.md and fixtures.mjs.
// Frozen before evidence was captured from the exact unmodified requested base.
const before=JSON.parse(readFileSync(new URL('../verification/qe-concrete-base-scope-20261018/before-monetary.json',import.meta.url)));
const responses=JSON.parse(readFileSync(new URL('../verification/qe-concrete-base-scope-20261018/before-responses.json',import.meta.url)));
const gravel='base gravel material',labor='base excavation and grading labor';
const labels={gravel:[gravel],grading:[labor],both:[gravel,labor],zero_gravel:[gravel],zero_grading:[labor],zero_both:[gravel,labor],financial:[gravel,labor],fees:[gravel,labor],minimum:[gravel,labor]};
const optionKinds={'Gravel only':'gravel','Both components':'both','Labor only':'grading'};
function disclosure(text,kind){
  assert.doesNotMatch(text,/Base preparation is priced for/);
  if(['none','legacy','blank'].includes(kind)){
    assert.doesNotMatch(text,/Included base preparation:|Excluded base preparation:|compacted base depth/);return;
  }
  const included=labels[kind],excluded=[gravel,labor].filter(c=>!included.includes(c));
  assert.ok(text.includes(`Included base preparation: ${included.join(', ')}.`),text);
  if(excluded.length)assert.ok(text.includes(`Excluded base preparation: ${excluded.join(', ')}. Any required excluded work needs a separate on-site estimate.`),text);
  else assert.doesNotMatch(text,/Excluded base preparation:/);
  if(included.includes(gravel))assert.ok(text.includes('Base gravel material quantity assumes 4 inches of compacted base depth.'),text);
  else assert.doesNotMatch(text,/Base gravel material quantity assumes/);
}
function publicScope(result,kind){
  assert.doesNotMatch(JSON.stringify(result),/baseGravelPerCubicYard|baseExcavationGradingPerSqft|basePrepPerSqft|"lineItems"|"calculationRecord"/);
  const rootKind=kind==='options'?'gravel':kind;disclosure(result.disclaimer,rootKind);
  for(const option of result.options||[])disclosure(option.disclaimer,kind==='options'?optionKinds[option.tierName]:kind);
}
function requested(result,wanted=true){
  assert.equal(result.pricedScope.facts.find(f=>f.label==='Base preparation requested')?.value,wanted?'Yes':'No');
  assert.equal(result.pricedScope.facts.some(f=>f.label==='Base preparation included'),false);
}
for(const row of before.rows)test(`concrete base disclosure ${row.type} ${row.kind}: every numerical output unchanged`,()=>{
  assert.equal(before.base,BASE);const result=generateQuoteVNext(structuredClone(row.input)),safe=sanitizeForCustomerVNext(result),wanted=expected[row.kind];
  assert.equal(result.resultType,row.resultType);
  assert.deepEqual(numericalOutput(result),row.numbers);
  assert.deepEqual(numericalOutput(safe),row.customerNumbers);
  assert.deepEqual(moneyText(safe),row.customerMoneyText);
  if(wanted===null){assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(JSON.stringify(result),/zero/i);assert.equal(safe.midEstimate,undefined);return;}
  if(typeof wanted==='number')assert.equal(finalCents(result.options[0]),wanted);
  else assert.deepEqual(Object.fromEntries(result.options.map(o=>[o.tierName,finalCents(o)])),wanted);
  publicScope(safe,row.kind);
});

for(const type of types)for(const kind of ['none','legacy','gravel','grading','both','options'])test(`concrete base saved widget ${type} ${kind}`,()=>{
  // Match the frozen arithmetic fixture's January pricing month explicitly.
  const w=webQuote(fixtureFor(type,kind),[],'2026-01-15T15:00:00.000Z');
  assert.equal(w.result.midEstimate,(kind==='options'?803000:expected[kind])/100);
  publicScope(w.result,kind);requested(w.result,kind!=='none');
  assert.deepEqual(JSON.parse(w.row.customerResponseJson),w.result);
  const internal=JSON.parse(w.row.internalOutcomeJson).internalResult;
  assert.deepEqual(numericalOutput(internal),before.rows.find(r=>r.type===type&&r.kind===kind).numbers);
  const replay=w.submit();assert.equal(replay.status,200);assert.deepEqual(replay.response,w.result);
  if(kind==='gravel'){
    const old=responses.responses.find(r=>r.type===type);
    assert.deepEqual(numericalOutput(w.result),numericalOutput(old.widget));
    assert.deepEqual(moneyText(w.result),moneyText(old.widget));
  }
});

for(const type of types)for(const kind of ['gravel','grading','both','options'])test(`concrete base actual voice tool ${type} ${kind}`,async t=>{
  const h=quoteEmailFixture(t),observed=await phone(h,fixtureFor(type,kind)),result=observed.result;
  assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,(kind==='options'?803000:expected[kind])/100);
  assert.equal(observed.match.questionContract.fields.find(f=>f.field==='baseNeeded')?.label,'Base preparation requested');
  assert.ok(result.pricedScope.includes('Base preparation requested: Yes'));
  disclosure(result.writtenDisclosure,kind==='options'?'gravel':kind);
  for(const option of result.options)disclosure(option.writtenDisclosure,kind==='options'?optionKinds[option.tierName]:kind);
  assert.ok(result.quoteNarration.includes('Included base preparation:'));
  if(kind==='gravel'||kind==='grading')assert.ok(result.quoteNarration.includes('Excluded base preparation:'));
  assert.doesNotMatch(JSON.stringify(result),/Base preparation included|baseGravelPerCubicYard|baseExcavationGradingPerSqft|basePrepPerSqft|"lineItems"|"calculationRecord"/);
  const estimated=await h.tool('getQuote',{...observed.args,callerMeasurementsEstimated:true});
  assert.equal(estimated.midEstimate,result.midEstimate);assert.match(estimated.quoteNarration,/This price is based on the measurements you gave us\. The business will confirm them on site\./);
  if(kind==='gravel'){
    const old=responses.responses.find(r=>r.type===type);
    assert.deepEqual(numericalOutput(result),numericalOutput(old.voice));assert.deepEqual(moneyText(result),moneyText(old.voice));
  }
});

for(const type of types)test(`concrete base approved versus invalid zero through saved widget and voice ${type}`,async t=>{
  // Before execution: both zero preparation components retain 763000c of slab
  // work; unclassified zeros review, explicit included approval makes them live.
  const f=fixtureFor(type,'both'),w=webQuote(f),h=quoteEmailFixture(t);await phone(h,f);
  const owners=[w.owner,h.c.ownerId];
  const approve=(owner,extra={})=>{const book=loadPricebook(owner);bridge.approveApplicationService(owner,book.services[0].id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true,...extra},date);};
  for(const owner of owners){
    const draft=bridge.readApplicationBook(owner);Object.assign(draft.services[0].pricing,{baseGravelPerCubicYard:0,baseExcavationGradingPerSqft:0});bridge.saveApplicationBook(owner,draft,date);approve(owner);
    // Optional preparation does not disable ordinary slab quotes. The selected
    // unclassified-zero preparation request below must still require review.
    const book=loadPricebook(owner);assert.equal(bridge.applicationStatus(book.services[0],book,date).status,'QUOTING LIVE');
  }
  const body={...w.body,requestId:randomUUID()};delete body.intakeConfirmation;
  assert.equal(bridge.prepareApplicationIntake(w.owner,body,date).status,'needs_details');
  const unclassifiedMatch=await h.tool('matchService',{query:f.ownerPricing.service});assert.equal(unclassifiedMatch.status,'matched');
  const unclassified=await h.tool('getQuote',{serviceHandle:unclassifiedMatch.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true,productConfirmations:{},additionalWork:[]});
  assert.notEqual(unclassified.status,'quoted');assert.equal(unclassified.midEstimate,undefined);
  for(const owner of owners){
    const saved=loadPricebook(owner).services[0].pricing;
    approve(owner,{zeroClassification:{freeCompleteService:false,freeTiers:[],includedPrices:{baseGravelPerCubicYard:'concreteCostPerCubicYard',baseExcavationGradingPerSqft:'laborPerSqft'}}});
    assert.deepEqual(loadPricebook(owner).services[0].pricing,saved);
  }
  const prepared=bridge.prepareApplicationIntake(w.owner,body,date);assert.equal(prepared.status,'ready');
  const saved=submitQuote(w.owner,{...body,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(saved.response.midEstimate,7630);publicScope(saved.response,'zero_both');
  const match=await h.tool('matchService',{query:f.ownerPricing.service});assert.equal(match.status,'matched');
  const voice=await h.tool('getQuote',{serviceHandle:match.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true,productConfirmations:{},additionalWork:[]});
  assert.equal(voice.status,'quoted');assert.equal(voice.midEstimate,7630);disclosure(voice.writtenDisclosure,'zero_both');
});

for(const old of responses.responses)test(`concrete base genuine pre-change receipt replay ${old.type}`,()=>{
  // Original 803000c response and v8 receipt retain old words byte-for-byte.
  // Current requests use corrected disclosure at the same 803000c, with no
  // engine-version or approval change and no reapproval requirement.
  assert.equal(responses.base,BASE);const h=old.historical;assert.equal(h.response.midEstimate,8030);
  migrate();
  db.prepare("INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,'SYNTHETIC','Synthetic','Synthetic Concrete','QuoteDone','active','UTC','owner',?)").run(h.owner,h.owner+'@example.invalid',date.quoteInstant);
  db.prepare("INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,'{}',?)").run(h.owner,date.quoteInstant);
  db.prepare("INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,enabled,updatedAt) VALUES(?,?,'SYNTHETIC','site_visit_first',0,?)").run(h.owner,h.book.services[0].id,date.quoteInstant);
  for(const [table,row] of [['quotes',h.quote],['quoteSubmissions',h.submission]]){
    const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
  }
  savePricebook(h.owner,h.book);
  const book=loadPricebook(h.owner);assert.equal(book.services[0].quoteDoneApproval.engineVersion,ENGINE_VERSION);assert.equal(bridge.applicationStatus(book.services[0],book,date).approvalCurrent,true);
  const replay=()=>{
    const result=submitQuote(h.owner,h.body);assert.equal(result.status,200);assert.deepEqual(result.response,h.response);
    assert.ok(projectSavedQuoteContext(result.response).pricedScope.includes('Base preparation included: Yes'));
    assert.equal(db.prepare('SELECT internalOutcomeJson FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(h.owner,h.body.requestId).internalOutcomeJson,h.submission.internalOutcomeJson);
    assert.equal(db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(h.owner,h.quote.id).resultJson,h.quote.resultJson);
  };
  replay();const body={...h.body,requestId:randomUUID()};delete body.intakeConfirmation;
  const prepared=bridge.prepareApplicationIntake(h.owner,body,date);assert.equal(prepared.status,'ready',JSON.stringify(prepared));
  const current=submitQuote(h.owner,{...body,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});
  assert.equal(current.response.midEstimate,8030);publicScope(current.response,'gravel');requested(current.response);
  assert.deepEqual(numericalOutput(current.response),numericalOutput(h.response));
  assert.deepEqual(loadPricebook(h.owner).services[0].pricing,book.services[0].pricing);
  assert.deepEqual(loadPricebook(h.owner).services[0].quoteDoneApproval,book.services[0].quoteDoneApproval);
  replay();
});
