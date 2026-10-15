import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../verification/engine-independent/fixtures.mjs';
import {projectSavedQuoteContext,projectVoiceQuote,VOICE_RESULT_BYTES} from '../server/src/voice/voiceQuotePresentation.js';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {quoteEmailFixture,gates,phone,publish,runtime,bridge,loadPricebook,date} from './quoteDeliveryBatch20261015Fixture.mjs';

// Independent prices: 100 LF * $40 plus N gates * $250. Presentation must
// never change these amounts. All complete descriptions, including tails, survive.
for(const [length,count,character] of [[45,1,'G'],[1512,1,'G'],[1512,3,'G'],[2000,3,'G'],[2000,3,'界'],[2000,3,'😀']]){
  test(`QE-004/015 production save/approve/match/quote: ${count} x ${length} ${character}`,async t=>{
    const h=quoteEmailFixture(t),f=gates(length,count,character),p=await phone(h,f),expected=4000+count*250;
    assert.equal(p.result.status,'quoted');assert.equal(p.result.midEstimate,expected);
    assert.equal(p.result.options[0].midEstimate,expected);
    const choice=p.match.questionContract.fields.find(field=>field.field==='gates');
    const canonical=bridge.calculateApplicationQuote(p.book,p.service,{customerInputs:f.customerInputs,customerFeeSelections:{}},{preparingIntake:true,...date}).customerResult;
    assert.equal(canonical.midEstimate,expected);
    const line=canonical.pricedScope.facts.find(fact=>fact.label==='Gates by measured opening width');
    assert.ok(p.result.pricedScope.join('').includes(line.value));
    for(const [key,gate] of Object.entries(f.ownerPricing.pricing.offeringDetails.gates)){
      assert.ok(choice.choices.find(c=>c.value===key).label.includes(gate.description),'choice retains full description');
      assert.match(choice.choices.find(c=>c.value===key).label,new RegExp(gate.widthLF+' ft opening'));
      assert.ok(p.result.quoteNarration.includes(gate.description));
    }
    assert.ok(p.result.pricedScope.every(fact=>fact.length<=4000));
    assert.ok(Buffer.byteLength(JSON.stringify(p.result))<=VOICE_RESULT_BYTES);
    assert.ok(!/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(p.result.pricedScope.join('\n')),'no split surrogate');
    const replay=await h.tool('getQuote',p.args);assert.equal(replay.quoteNarration,p.result.quoteNarration);assert.equal(replay.midEstimate,expected);
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId).n,1);
    assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quotes WHERE ownerId=?').get(h.c.ownerId).n,1);
    const saved=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);
    assert.deepEqual(JSON.parse(saved.originalSubmissionJson).customerInputs.gates,f.customerInputs.gates);
    assert.ok(projectSavedQuoteContext(JSON.parse(saved.customerResponseJson)).pricedScope.join('').includes(line.value));
    const confirm=await h.tool('prepareQuoteEmail',{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'});
    await h.tool('sendQuoteEmail',{emailConfirmationHandle:confirm.emailConfirmationHandle,customerConfirmed:true});
    await h.emailService().dispatchOnce();assert.equal(h.rows()[0].narration,p.result.quoteNarration);
  });
}
for(const length of [239,240,241])test(`QE-015 entire ${length}-character gate label survives matching`,async t=>{
  const f=gates(10,1),key='walk_1',prefix='walk 1 — 4 ft opening; ';
  f.ownerPricing.pricing.offeringDetails.gates[key].description='[SYNTHETIC] '+ 'A'.repeat(length-prefix.length-12);
  const h=quoteEmailFixture(t),a=publish(h.c.ownerId,f),field=a.definition.customerFields.find(q=>q.name==='gates');assert.equal(field.options[key].length,length);
  assert.equal(voiceQuestionContract(a.service,a.definition).fields.find(q=>q.field==='gates').choices[0].label,field.options[key]);
  const match=await h.tool('matchService',{query:f.ownerPricing.service});assert.equal(match.questionContract.fields.find(q=>q.field==='gates').choices[0].label,field.options[key]);
});
test('QE-015 similar names bind the measured choice and its own price, never another opening',async t=>{
  const h=quoteEmailFixture(t),f=gates(2000,2);f.ownerPricing.pricing.offeringRates.gate_walk_2=55000;f.customerInputs.gates={'Walk 2':1};
  const p=await phone(h,f);assert.equal(p.result.status,'quoted');assert.equal(p.result.midEstimate,4550);
  const saved=JSON.parse(h.db.prepare('SELECT originalSubmissionJson FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId).originalSubmissionJson);
  assert.deepEqual(saved.customerInputs.gates,{walk_2:1});assert.match(p.result.quoteNarration,/5 ft opening/);assert.doesNotMatch(p.result.quoteNarration,/END_GATE_1/);
});
for(const kind of ['characters','bytes','scope count'])test(`QE-004 unpresentable ${kind} outcome is durably review-only and idempotent`,async t=>{
  const h=quoteEmailFixture(t),f=mowing();let original;
  const p=await phone(h,f,{quoteApplication:{calculate:(book,service,body,options)=>{
    const normal=bridge.calculateApplicationQuote(book,service,body,{...options,...date});
    const result=structuredClone(normal.customerResult);
    if(kind==='characters')result.disclaimer='[SYNTHETIC] '+ 'C'.repeat(65536);
    if(kind==='bytes'){
      const disclosure='界'.repeat(40000);result.disclaimer=disclosure;result.options[0].disclaimer=disclosure;
    }
    if(kind==='scope count')result.pricedScope.facts=Array.from({length:64},(_,i)=>({label:'[SYNTHETIC] '+i,value:'V'.repeat(3999)}));
    original={...normal,customerResult:result};return original;
  }}});
  assert.equal(p.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(p.result.status,'needs_details');
  assert.equal(p.result.midEstimate,undefined);assert.equal(p.result.quoteNarration,undefined);assert.match(p.result.customerMessage,/saved.*review/i);
  const saved=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);assert.ok(saved);
  assert.equal(saved.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(JSON.parse(saved.internalOutcomeJson).applicationOutcome.customerResult.midEstimate,100);
  assert.deepEqual(JSON.parse(saved.internalOutcomeJson).applicationOutcome,JSON.parse(JSON.stringify(original)));
  assert.equal(JSON.parse(saved.originalSubmissionJson).customerInputs.yardSqft,5000);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quotes WHERE ownerId=?').get(h.c.ownerId).n,0);
  assert.equal(h.db.prepare("SELECT COUNT(*) n FROM leads WHERE ownerId=? AND type='quote_review'").get(h.c.ownerId).n,1);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM voiceQuoteNarrations WHERE ownerId=?').get(h.c.ownerId).n,0);
  const replay=await p.tool('getQuote',p.args);assert.equal(replay.resultType,p.result.resultType);assert.equal(replay.customerMessage,p.result.customerMessage);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId).n,1);
});
test('QE-004 presentation fallback never converts pricebook/storage failure into saved review success',async t=>{
  const h=quoteEmailFixture(t),f=mowing();publish(h.c.ownerId,f);
  const normal=await h.tool('matchService',{query:f.ownerPricing.service});
  const v=runtime(h,{loadBook:()=>{throw Object.assign(Error('SYNTHETIC uncertain storage'),{code:'PRICEBOOK_STORAGE_UNCERTAIN'});}});
  await assert.rejects(v.tool('getQuote',{serviceHandle:normal.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true}));
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId).n,0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM leads WHERE ownerId=?').get(h.c.ownerId).n,0);
});
test('QE-004 combined gate configuration envelope rejects before save instead of truncating',t=>{
  const h=quoteEmailFixture(t),f=gates(2000,30,'界'),before=bridge.readApplicationBook(h.c.ownerId),service=structuredClone(f.ownerPricing);delete service.origin;
  const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  assert.throws(()=>bridge.saveApplicationBook(h.c.ownerId,{...draft,revision:before.revision},date),error=>error.statusCode===422&&error.details.code==='INVALID_QUOTE_PRESENTATION');
  assert.deepEqual(bridge.readApplicationBook(h.c.ownerId),before);
});
for(const length of [3999,4000,4001,7999,8000,8001])test(`QE-004 aggregate ${length}-character scope preserves spaces and Unicode through real transport`,()=>{
  const prefix='Gates: ',body=('word 😀 boundary ').repeat(600).slice(0,length-prefix.length-4),line=prefix+body+' END';
  assert.equal(line.length,length);
  const receipt={resultType:'INSTANT_ESTIMATE_READY',lowEstimate:4750,midEstimate:4750,highEstimate:4750,
    pricedScope:{service:'[SYNTHETIC] Fence',facts:[{label:'Gates',value:body+' END'}]}};
  const out=projectVoiceToolResult('getQuote',projectVoiceQuote(receipt,'x'.repeat(43)));
  assert.equal(out.pricedScope.slice(1).join(''),line);
  for(const chunk of out.pricedScope){assert.ok(chunk.length<=4000);assert.ok(!/[\uD800-\uDBFF]$|^[\uDC00-\uDFFF]/u.test(chunk));}
  assert.ok(out.quoteNarration.includes(line));
});
test('QE-004 a fallback database write failure is never acknowledged; a clean retry saves exactly once',async t=>{
  const h=quoteEmailFixture(t),f=mowing();publish(h.c.ownerId,f);
  const v=runtime(h,{calculate:(book,service,body,options)=>{
    const normal=bridge.calculateApplicationQuote(book,service,body,{...options,...date});normal.customerResult.disclaimer='D'.repeat(65537);return normal;
  }});
  const match=await v.tool('matchService',{query:f.ownerPricing.service}),args={serviceHandle:match.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true};
  h.db.exec("CREATE TRIGGER synthetic_submission_write_failure BEFORE INSERT ON quoteSubmissions BEGIN SELECT RAISE(ABORT,'SYNTHETIC write failure'); END");
  await assert.rejects(v.tool('getQuote',args));
  for(const table of ['quotes','leads','quoteSubmissions','quoteRequests'])assert.equal(h.db.prepare('SELECT COUNT(*) n FROM '+table+' WHERE ownerId=?').get(h.c.ownerId).n,0);
  h.db.exec('DROP TRIGGER synthetic_submission_write_failure');
  const retry=await v.tool('getQuote',args);assert.equal(retry.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId).n,1);
});
