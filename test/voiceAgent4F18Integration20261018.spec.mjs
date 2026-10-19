import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture as engineFixture,mowing} from '../verification/engine-independent/fixtures.mjs';
import {customerReceiptPresentation} from '../server/src/quoteScopeDisclosure.js';
import {projectSavedQuoteContext} from '../server/src/voice/voiceQuotePresentation.js';
import {webQuote,db,fixture,at,quoteEmailFixture,phone,bridge,date} from './quoteDeliveryBatch20261015Fixture.mjs';
import {confirmedHistory} from './returningCallerTestHelper.mjs';

const work={source:'unpriced_surface_work',description:'Door sides'};
const genuine={source:'additionalWork[0]',description:'[PLACEHOLDER] Repair the detached fence.'};
const option=()=>({tierName:'[PLACEHOLDER] Saved',lowEstimate:221.23,highEstimate:243.35,currency:'CAD',skippedAddons:['Door sides'],disclaimer:'[PLACEHOLDER] Door sides excluded.'});
const partial=options=>({resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:{resultType:'INSTANT_ESTIMATE_READY',options},additionalWork:[work,genuine],additionalWorkStatus:'ON_SITE_ESTIMATE_REQUIRED',fullJobTotal:null});
function surface(){
  const f=engineFixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false,surfaceOptionalItems:['doorSides'],paintDoorSides:2});
  f.ownerPricing.priceBasisByCategory.material='sell_price';
  f.ownerPricing.tiers=[{name:'Base',overrides:{}},{name:'Complete',overrides:{surfaceExtraRates:{doorSides:5000}}}];
  return f;
}

test('F18 real saved retry preserves qualified scope, exact identity, options and stored JSON',()=>{
  const saved=webQuote(surface()),historical=partial([null,'invalid',saved.result.options[0]]);
  historical.quoteId=saved.result.quoteId;
  historical.pricedEstimate.quoteId=saved.result.quoteId;
  historical.pricedScope=saved.result.pricedScope;
  const raw=JSON.stringify(historical);
  db.prepare("UPDATE quoteSubmissions SET resultType='PARTIAL_ESTIMATE_READY',customerResponseJson=? WHERE ownerId=? AND requestId=?").run(raw,saved.owner,saved.body.requestId);
  const before=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(saved.owner,saved.body.requestId);
  for(let i=0;i<2;i++){
    const retry=saved.submit();assert.equal(retry.status,200);
    assert.deepEqual(retry.response,customerReceiptPresentation(historical));
    assert.equal(retry.response.quoteId,saved.result.quoteId);
    assert.equal(retry.response.resultType,'PARTIAL_ESTIMATE_READY');
    assert.deepEqual(retry.response.additionalWork,[genuine,work]);
    assert.equal(retry.response.pricedEstimate.options[2].midEstimate,1064);
    assert.equal(retry.response.fullJobTotal,null);
    const spoken=projectSavedQuoteContext(retry.response);
    assert.deepEqual(spoken.additionalWork,[genuine.description,'Door sides']);
    assert.equal(spoken.options[0].midEstimate,1064);
  }
  assert.deepEqual(db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(saved.owner,saved.body.requestId),before);
});

for(const kind of ['D15 junk','inverted','empty record','no price'])test('F18 real history dispatcher safely projects '+kind,async t=>{
  const f=fixture(t),c=f.context(),voice=f.voice(c);
  await voice.tool('captureLead',{name:'[PLACEHOLDER] Caller',description:'[PLACEHOLDER] Existing lead'});
  const options=kind==='D15 junk'?[null,'invalid',option(),false,0,[]]:kind==='inverted'?[{...option(),lowEstimate:300,highEstimate:200}]:kind==='empty record'?[{},option()]:[null,'invalid'];
  const receipt=partial(options);
  receipt.pricedEstimate.lineItems=[{rate:'PRIVATE_RATE_SENTINEL'}];
  const raw=JSON.stringify({customerResult:receipt,privateCost:'PRIVATE_COST_SENTINEL'});
  f.db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES('f18-saved',?,?,?,'INSTANT',?)").run(c.ownerId,c.callSid,raw,at);
  const foreign=f.context('synthetic-b');
  f.db.prepare("INSERT INTO quotes(id,ownerId,callId,resultJson,status,createdAt) VALUES('foreign-f18',?,?,?,'INSTANT',?)").run(foreign.ownerId,foreign.callSid,JSON.stringify({customerResult:{resultType:'INSTANT_ESTIMATE_READY',...option(),tierName:'FOREIGN_SENTINEL'}}),at);
  const result=await confirmedHistory(f.db,c,args=>voice.tool('getCustomerContext',args));
  assert.equal(result.recentQuotes.length,1);assert.equal(result.openLeads.length,1);
  const projected=result.recentQuotes[0];
  if(kind==='D15 junk'){
    assert.equal(projected.resultType,'PARTIAL_ESTIMATE_READY');
    assert.deepEqual(projected.additionalWork,[genuine.description,'Door sides']);
    assert.equal(projected.options.length,1);
    assert.equal(projected.options[0].lowEstimate,221.23);
    assert.equal(projected.options[0].highEstimate,243.35);
    assert.equal(projected.options[0].currency,'CAD');
    assert.deepEqual(projected.options[0].skippedAddons,['Door sides']);
  }else{
    assert.equal(projected.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(projected.options,undefined);assert.equal(projected.lowEstimate,undefined);
    assert.match(projected.customerMessage,/review.*saved estimate/i);
  }
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|FOREIGN_SENTINEL|lineItems|ownerId|callSid/);
  const repeat=await voice.tool('getCustomerContext',{callerConfirmedIdentity:true});
  assert.deepEqual(repeat.recentQuotes,result.recentQuotes);
  assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(c.ownerId,'f18-saved').resultJson,raw);
});

for(const additionalWork of [[],[genuine.description]])test('F18 real live dispatcher preserves mixed options and genuine work '+additionalWork.length,async t=>{
  const h=quoteEmailFixture(t),p=await phone(h,surface(),{additionalWork});
  assert.equal(p.result.status,'quoted');
  assert.equal(p.result.resultType,additionalWork.length?'PARTIAL_ESTIMATE_READY':'INSTANT_ESTIMATE_READY');
  assert.deepEqual(p.result.options.map(o=>[o.tierName,o.midEstimate,o.skippedAddons]),[['Base',1064,['Door sides']],['Complete',1164,[]]]);
  assert.deepEqual(p.result.additionalWork,additionalWork.length?additionalWork:undefined);
  const before=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);
  const retry=await p.tool('getQuote',p.args);
  assert.deepEqual(retry,p.result);
  assert.deepEqual(h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId),before);
  assert.doesNotMatch(JSON.stringify(retry),/lineItems|rangeBufferUsed|markupPercent|bookRevision/);
});

test('F18 real live dispatcher saves malformed options as review without an amount or narration',async t=>{
  const h=quoteEmailFixture(t);
  const p=await phone(h,mowing(),{quoteApplication:{calculate:(book,service,body,options)=>{
    const outcome=bridge.calculateApplicationQuote(book,service,body,{...options,...date});
    outcome.customerResult.options={invalid:'[PLACEHOLDER] not an array'};
    return outcome;
  }}});
  assert.equal(p.result.status,'needs_details');
  assert.equal(p.result.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(p.result.lowEstimate,undefined);assert.equal(p.result.midEstimate,undefined);assert.equal(p.result.highEstimate,undefined);
  assert.equal(p.result.options,undefined);assert.equal(p.result.quoteNarration,undefined);
  const row=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);
  assert.equal(row.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(JSON.parse(row.internalOutcomeJson).originalApplicationOutcome.customerResult.options,{invalid:'[PLACEHOLDER] not an array'});
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quotes WHERE ownerId=?').get(h.c.ownerId).n,0);
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM voiceQuoteNarrations WHERE ownerId=?').get(h.c.ownerId).n,0);
  const repeat=await p.tool('getQuote',p.args);
  assert.equal(repeat.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId),row);
});
