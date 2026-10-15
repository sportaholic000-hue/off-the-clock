import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {mowing,custom} from '../verification/engine-independent/fixtures.mjs';
import {webQuote,phone,quoteEmailFixture,bridge,publicCopy,notice} from './quoteDeliveryBatch20261015Fixture.mjs';
import {installQuoteEmailRoutes} from '../server/src/quoteEmailRoutes.js';

const additional='[SYNTHETIC] Remove the oak stump and roots; not included in mowing.';
function tiered(){const f=mowing();Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:15});
  f.ownerPricing.tiers=[{name:'Standard',overrides:{}},{name:'Premium',overrides:{mowingBaseRatePerSqft:3}},{name:'Unavailable',overrides:{mowingBaseRatePerSqft:0}}];return f;}
for(const partial of [false,true])for(const tiers of [false,true])test(`QE-005 actual widget save → owner email/public: partial=${partial}, tiers=${tiers}`,async()=>{
  const f=tiers?tiered():mowing(),h=webQuote(f,partial?[additional]:[]),before=h.row.customerResponseJson;
  const estimate=partial?h.result.pricedEstimate:h.result,expected=tiers?[115,172.5]:[100];
  assert.deepEqual(estimate.options.map(o=>o.midEstimate),expected);
  // Change current approved configuration after saving: copies are immutable.
  const current=bridge.readApplicationBook(h.owner);current.services[0].pricing.mowingBaseRatePerSqft=999;
  bridge.saveApplicationBook(h.owner,current);assert.equal(h.submit().status,200);
  const queued=h.email.enqueueSavedQuote({ownerId:h.owner,quoteId:h.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  assert.equal(queued.status,'PENDING');await h.email.dispatchOnce();assert.equal(h.sends(),1);
  const row=h.rows()[0],{message,copy,token}=publicCopy(h.email,row),text=copy.narration;
  assert.equal(message.text.split('\n\nView your saved quote: ')[0],text);
  assert.match(text,/[Ss]cope/);assert.ok(text.includes(f.ownerPricing.service));assert.match(text,/5000 square feet/);
  assert.match(text,/CAD/);assert.match(text,/per visit/);assert.match(text,tiers?/Includes applicable tax/:/No tax added/);
  for(const option of estimate.options){
    assert.ok(text.includes(String(option.midEstimate)),'exact saved price');
    assert.ok(text.includes(option.disclaimer),'complete option qualification');
    for(const excluded of option.skippedAddons)assert.ok(text.includes(excluded));
  }
  if(tiers){assert.ok(text.includes(notice));assert.match(text,/Standard/);assert.match(text,/Premium/);assert.doesNotMatch(text,/Unavailable:/);}
  if(partial){assert.ok(text.includes(additional));assert.match(text,/not included|excluded/i);assert.match(text,/total for all requested work is not available|no.*whole.job total|not a full.*total/i);assert.ok(text.includes(h.result.customerMessage));}
  assert.doesNotMatch(text,/mowingBaseRatePerSqft|bookRevision|markup|confirmedFacts|costCents/);
  assert.equal(h.rows().length,1);assert.equal(h.email.enqueueSavedQuote({ownerId:h.owner,quoteId:h.row.recordId,email:'caller@example.invalid',customerConfirmed:true}).id,queued.id);
  assert.equal(h.rows()[0].messageJson,row.messageJson);assert.equal(h.submit().response.resultType,h.result.resultType);
  assert.equal(h.row.customerResponseJson,before);assert.equal(h.email.publicQuote(h.owner,token).narration,text);
  assert.throws(()=>h.email.publicQuote('synthetic-other-owner',token),e=>e.statusCode===404);
  assert.throws(()=>h.email.enqueueSavedQuote({ownerId:'synthetic-other-owner',quoteId:h.row.recordId,email:'caller@example.invalid',customerConfirmed:true}),e=>e.statusCode===404);
  assert.throws(()=>h.email.enqueueSavedQuote({ownerId:h.owner,quoteId:h.row.recordId,email:'different@example.invalid',customerConfirmed:true}),e=>e.code==='QUOTE_EMAIL_RECIPIENT_UNCONFIRMED');
});
test('QE-005 saved voice partial copy keeps the presented script, recipient/call binding and saved amounts',async t=>{
  const h=quoteEmailFixture(t),p=await phone(h,tiered(),{additionalWork:[additional]});assert.equal(p.result.status,'quoted');
  assert.deepEqual(p.result.options.map(o=>o.midEstimate),[115,172.5]);
  const record=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);
  assert.throws(()=>h.emailService().enqueueSavedQuote({ownerId:h.c.ownerId,quoteId:record.recordId,email:'unconfirmed@example.invalid',customerConfirmed:true}),e=>e.code==='QUOTE_EMAIL_RECIPIENT_UNCONFIRMED');
  const prepared=await h.tool('prepareQuoteEmail',{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'});
  const result=await h.tool('sendQuoteEmail',{emailConfirmationHandle:prepared.emailConfirmationHandle,customerConfirmed:true});
  const retry=await h.tool('sendQuoteEmail',{emailConfirmationHandle:prepared.emailConfirmationHandle,customerConfirmed:true});assert.equal(retry.id,result.id);
  await h.emailService().dispatchOnce();assert.equal(h.sends(),1);
  const {copy,message,token}=publicCopy(h.emailService(),h.rows()[0]);assert.equal(copy.narration,p.result.quoteNarration);assert.ok(copy.narration.includes(additional));assert.match(copy.narration,/5000 square feet/);
  assert.ok(message.text.includes(p.result.quoteNarration));assert.ok(copy.narration.includes(notice));
  const other=h.context(h.c.ownerId);await assert.rejects(h.voice(other)({name:'prepareQuoteEmail',args:{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'}}));
  assert.throws(()=>h.emailService().publicQuote('synthetic-b',token),e=>e.statusCode===404);
});
test('QE-005 public HTTP copy escapes unpriced work without losing its qualification',async t=>{
  const work='[SYNTHETIC] <script>stump & roots</script>',h=webQuote(mowing(),[work]);
  h.email.enqueueSavedQuote({ownerId:h.owner,quoteId:h.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  const {token}=publicCopy(h.email,h.rows()[0]),app=express();installQuoteEmailRoutes(app,{service:h.email});
  const server=app.listen(0,'127.0.0.1');t.after(()=>new Promise(resolve=>server.close(resolve)));await new Promise(resolve=>server.once('listening',resolve));
  const response=await fetch(`http://127.0.0.1:${server.address().port}/quote-copy/${h.owner}/${token}`),html=await response.text();
  assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
  assert.match(html,/&lt;script&gt;stump &amp; roots&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);assert.match(html,/5000 square feet/);
});
test('QE-005 saved exact cents and a distinct range midpoint survive owner email and immutable resend',()=>{
  const f=mowing();f.ownerPricing.pricing.mowingBaseRatePerSqft=2.0098;
  const h=webQuote(f);assert.equal(h.result.midEstimate,100.49);
  h.email.enqueueSavedQuote({ownerId:h.owner,quoteId:h.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  assert.match(publicCopy(h.email,h.rows()[0]).copy.narration,/\$100\.49 CAD per visit/);
  const buffered=mowing();Object.assign(buffered.businessDefaults,{rangeBufferPercent:10});
  const b=webQuote(buffered);assert.deepEqual([b.result.lowEstimate,b.result.midEstimate,b.result.highEstimate],[90,100,110]);
  b.email.enqueueSavedQuote({ownerId:b.owner,quoteId:b.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  const copy=publicCopy(b.email,b.rows()[0]).copy.narration;assert.match(copy,/\$90.*\$110/);assert.match(copy,/Midpoint estimate: \$100 CAD per visit/);
});
test('QE-005 owner copy of a historical voice-origin record uses its bound frozen narration',async t=>{
  const h=quoteEmailFixture(t),p=await phone(h,mowing(),{additionalWork:[additional]}),row=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);
  // Historical imported voice records can have a previously confirmed contact.
  // This fixture supplies that stored authorization; no new authorization rule.
  const original=JSON.parse(row.originalSubmissionJson);original.contact.email='caller@example.invalid';
  h.db.prepare('UPDATE quoteSubmissions SET originalSubmissionJson=? WHERE ownerId=? AND requestId=?').run(JSON.stringify(original),h.c.ownerId,row.requestId);
  h.emailService().enqueueSavedQuote({ownerId:h.c.ownerId,quoteId:row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  assert.equal(publicCopy(h.emailService(),h.rows()[0]).copy.narration,p.result.quoteNarration);
});
test('QE-005 equal tier midpoints keep their own option labels and distinct saved ranges',()=>{
  const f=custom();Object.assign(f.ownerPricing.pricing,{customPricingMode:'range',low:9000,high:11000});delete f.ownerPricing.pricing.price;
  f.ownerPricing.tiers=[{name:'Standard',overrides:{}},{name:'Wider',overrides:{low:8000,high:12000}}];
  const h=webQuote(f);assert.deepEqual(h.result.options.map(o=>[o.lowEstimate,o.midEstimate,o.highEstimate]),[[90,100,110],[80,100,120]]);
  h.email.enqueueSavedQuote({ownerId:h.owner,quoteId:h.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  const copy=publicCopy(h.email,h.rows()[0]).copy.narration;
  assert.match(copy,/Standard midpoint estimate: \$100 CAD/);assert.match(copy,/Wider midpoint estimate: \$100 CAD/);
  assert.match(copy,/Standard: \$90.*\$110/);assert.match(copy,/Wider: \$80.*\$120/);
});
