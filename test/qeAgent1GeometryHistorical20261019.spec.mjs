import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {after} from 'node:test';
import {randomUUID} from 'node:crypto';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {bridge,date,db,fixture,quoteEmailFixture} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
const OLD='quote-engine-vnext-accuracy-20261018-v11',CURRENT='quote-engine-vnext-geometry-20261019-v12';
const historical=JSON.parse(gunzipSync(readFileSync(new URL('../verification/qe-agent1-geometry-boundary-repair-20261019/historical-v11.json.gz',import.meta.url))));
assert.equal(historical.base,'f4978665167538917732dcd061a18a4099f090d8');assert.equal(historical.engineVersion,OLD);assert.equal(ENGINE_VERSION,CURRENT);
const publicOnly=q=>assert.doesNotMatch(JSON.stringify(q),/"(?:lineItems|pricing|rateCents|priceMetadata|storyMultiplier|complexityLaborMultiplier|exactValue)"/);
const cleanup=[],base=fixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);
after(()=>{for(const fn of cleanup.reverse())fn();});
for(const saved of historical.records)test('Agent1 genuine v11 immutable widget/voice replay and explicit current-version reapproval '+saved.id,async t=>{
 migrate();
 for(const [table,rows] of Object.entries(saved.tables))for(const row of rows){
  const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
 }
 savePricebook(saved.owner,saved.book);
 const h=quoteEmailFixture(t,{base,context:saved.voice.context});
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
 const newArgs={...saved.voice.args,serviceHandle:match.serviceHandle};delete newArgs.scopeConfirmations;
 let voice=await h.tool('getQuote',newArgs);
 if(voice.questionContract?.fields.some(field=>field.confirmationToken)){newArgs.scopeConfirmations=Object.fromEntries(voice.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));voice=await h.tool('getQuote',newArgs);}
 assert.equal(voice.status,'quoted',JSON.stringify(voice));assert.equal(voice.midEstimate,saved.expectedCents/100);publicOnly(voice);
 const newRows=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').all(saved.owner).filter(r=>!saved.tables.quoteSubmissions.some(old=>old.requestId===r.requestId)&&r.resultType==='INSTANT_ESTIMATE_READY');
 assert.equal(newRows.length,2);
 for(const row of newRows){const o=JSON.parse(row.internalOutcomeJson);assert.equal((o.internalResult||o.applicationOutcome.internalResult).engineVersion,CURRENT);}
 await replay('reapproved-and-corrected');assert.equal(h.sends(),0);
 console.log(JSON.stringify({case:saved.id,historicalWidgetCents:saved.observedCents,historicalVoiceCents:saved.observedCents,newWidgetCents:saved.expectedCents,newVoiceCents:saved.expectedCents,storedRecords:'unchanged',wording:'unchanged',ordinarySaveApproval:'stale',explicitApproval:CURRENT,providerCalls:h.sends()}));
});
