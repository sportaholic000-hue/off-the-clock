import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {input} from '../verification/qe-roof-exact-subtraction-20261018/fixture.mjs';
const cases=JSON.parse(readFileSync(new URL('../verification/qe-roof-exact-subtraction-20261018/expected-cases.json',import.meta.url)));
for(const row of cases)test('roof exact subtraction: '+row.id,()=>{
 const q=generateQuoteVNext(input(row));
 assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
 assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,row.expectedCents);
 assert.deepEqual(q.lineItems.map(l=>({name:l.name,cents:l.amountCents})),row.lines.map(l=>({name:l.name,cents:l.cents})));
 for(let i=0;i<row.lines.length;i++)if(row.lines[i].delta){
  const line=q.lineItems[i],expected=row.lines[i];
  const factor=line.calculation.multipliers.find(m=>/story addition|complexity addition/.test(m.name));
  assert.deepEqual(factor.exactValue,expected.delta);
  assert.deepEqual(line.calculation.exactUnroundedCents,expected.unrounded);
 }
});

import {randomUUID} from 'node:crypto';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {EXPECTED_QUOTE_ENGINE_VERSION} from '../server/src/runtimeConfig.js';
import {OLD,CURRENT as REPAIR_VERSION} from '../verification/qe-roof-exact-subtraction-20261018/fixture.mjs';
import {bridge,date,db,fixture,quoteEmailFixture} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
const CURRENT='quote-engine-vnext-accuracy-20261018-v11';
assert.equal(REPAIR_VERSION,'quote-engine-vnext-accuracy-20261018-v10');
const historical=JSON.parse(readFileSync(new URL('../verification/qe-roof-exact-subtraction-20261018/historical-v9.json',import.meta.url)));
const publicOnly=q=>assert.doesNotMatch(JSON.stringify(q),/"(?:lineItems|pricing|rateCents|priceMetadata|storyMultiplier|complexityLaborMultiplier|exactValue)"/);

test('roof exact subtraction: production version literals agree on v10; historical capture is v9',()=>{
 assert.equal(ENGINE_VERSION,CURRENT);assert.equal(EXPECTED_QUOTE_ENGINE_VERSION,CURRENT);
 assert.equal(historical.base,'21f0ccf9ba3cd6859697483745bd4c8152274169');assert.equal(historical.engineVersion,OLD);
});
for(const saved of historical.records)test('roof exact subtraction: genuine v9 widget and voice replay / explicit reapproval '+saved.id,async t=>{
 migrate();
 for(const [table,rows] of Object.entries(saved.tables))for(const row of rows){
  const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
 }
 savePricebook(saved.owner,saved.book);
 const base=fixture(t,process.env.DATABASE_PATH),h=quoteEmailFixture(t,{base,context:saved.voice.context});
 const unchangedRecords=()=>{
  for(const table of ['quotes','quoteSubmissions','voiceToolIdempotencyReceipts','voiceQuoteNarrations']){
   const keys=db.prepare(`PRAGMA table_info(${table})`).all().filter(c=>c.pk).map(c=>c.name);
   assert.ok(keys.length);
   for(const row of saved.tables[table])assert.deepEqual(db.prepare(`SELECT * FROM ${table} WHERE ${keys.map(k=>k+'=?').join(' AND ')}`).get(...keys.map(k=>row[k])),row,table+' immutable');
  }
 };
 const replay=async label=>{
  const w=submitQuote(saved.owner,saved.widget.body);assert.equal(w.status,200);assert.deepEqual(w.response,saved.widget.response);publicOnly(w.response);
  assert.deepEqual(await h.tool('getQuote',saved.voice.args,saved.voice.toolCallId),saved.voice.result,'original tool ID '+label);
  const v=await h.tool('getQuote',saved.voice.args,'synthetic-replay-'+label+'-'+saved.id);
  assert.deepEqual(v,saved.voice.result,'new tool ID / original receipt '+label);publicOnly(v);unchangedRecords();
 };
 for(const row of saved.tables.quoteSubmissions){
  const internal=JSON.parse(row.internalOutcomeJson);assert.equal((internal.internalResult||internal.applicationOutcome.internalResult).engineVersion,OLD);
  assert.equal(JSON.parse(row.customerResponseJson).midEstimate,saved.observedCents/100);
 }
 await replay('stale');
 const originalApproval=structuredClone(saved.book.services[0].quoteDoneApproval);
 const stale=()=>{const b=loadPricebook(saved.owner);assert.deepEqual(b.services[0].quoteDoneApproval,originalApproval);assert.equal(bridge.applicationStatus(b.services[0],b,date).approvalCurrent,false);return b;};
 stale();bridge.saveApplicationBook(saved.owner,bridge.readApplicationBook(saved.owner),date);stale();await replay('ordinary-save');
 const fresh={...structuredClone(saved.widget.body),requestId:randomUUID()};delete fresh.intakeConfirmation;
 assert.equal(bridge.prepareApplicationIntake(saved.owner,fresh,date).status,'needs_details');
 const refused=submitQuote(saved.owner,{...fresh,reviewRequested:true},{clock:()=>new Date(date.quoteInstant)});
 assert.equal(refused.response.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(refused.response.midEstimate,undefined);
 assert.notEqual((await h.tool('matchService',{query:saved.book.services[0].service})).status,'matched');
 await assert.rejects(h.tool('getQuote',{...saved.voice.args,customerInputs:{...saved.voice.args.customerInputs,roofSizeInput:101}}),error=>error.code==='TOOL_EXECUTION_FAILED');
 const view=bridge.readApplicationBook(saved.owner),pricing=structuredClone(stale().services[0].pricing);
 assert.throws(()=>bridge.approveApplicationService(saved.owner,view.services[0].id,{revision:view.revision,confirmLegacySettings:true},date),/Explicit confirmation/);
 stale();
 bridge.approveApplicationService(saved.owner,view.services[0].id,{revision:view.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
 const approved=loadPricebook(saved.owner);assert.deepEqual(approved.services[0].pricing,pricing);assert.equal(approved.services[0].quoteDoneApproval.engineVersion,CURRENT);
 assert.equal(bridge.applicationStatus(approved.services[0],approved,date).status,'QUOTING LIVE');
 fresh.requestId=randomUUID();const prepared=bridge.prepareApplicationIntake(saved.owner,fresh,date);assert.equal(prepared.status,'ready');
 const corrected=submitQuote(saved.owner,{...fresh,intakeConfirmation:prepared.confirmation},{clock:()=>new Date(date.quoteInstant)});
 assert.equal(corrected.status,201);assert.equal(corrected.response.midEstimate,saved.expectedCents/100);publicOnly(corrected.response);
 const match=await h.tool('matchService',{query:approved.services[0].service});assert.equal(match.status,'matched');
 const voice=await h.tool('getQuote',{...saved.voice.args,serviceHandle:match.serviceHandle});
 assert.equal(voice.status,'quoted',JSON.stringify(voice));assert.equal(voice.midEstimate,saved.expectedCents/100);publicOnly(voice);
 const newRows=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').all(saved.owner).filter(r=>!saved.tables.quoteSubmissions.some(old=>old.requestId===r.requestId)&&r.resultType==='INSTANT_ESTIMATE_READY');
 assert.equal(newRows.length,2);
 for(const row of newRows){const o=JSON.parse(row.internalOutcomeJson);assert.equal((o.internalResult||o.applicationOutcome.internalResult).engineVersion,CURRENT);}
 await replay('reapproved-and-corrected');assert.equal(h.sends(),0);
 console.log(JSON.stringify({case:saved.id,historicalWidgetCents:saved.observedCents,historicalVoiceCents:saved.observedCents,newWidgetCents:saved.expectedCents,newVoiceCents:saved.expectedCents,storedRecords:'unchanged',wording:'unchanged',ordinarySaveApproval:'stale',explicitApproval:CURRENT,providerCalls:h.sends()}));
});
for(const target of ['storyMultiplier','complexityLaborMultiplier'])for(const bad of [0,.5,-1,6,null,'1.15',Infinity,NaN])test(`roof exact subtraction: unchanged factor rejection ${target} ${String(bad)}`,()=>{
 const f=input(cases[0]);f.ownerPricing.pricing[target][target==='storyMultiplier'?'1':'simple']=bad;
 assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
