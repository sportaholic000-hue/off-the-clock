import './pricebookTestEnv.mjs';
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {bridge,date,fixture,quoteEmailFixture,db} from './quoteDeliveryBatch20261015Fixture.mjs';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
const cleanup=[],base=fixture({after:fn=>cleanup.push(fn)},process.env.DATABASE_PATH);
after(()=>{for(const fn of cleanup.reverse())fn();});
const publicOnly=q=>assert.doesNotMatch(JSON.stringify(q),/"(?:lineItems|pricing|rateCents|installedLaborPercent|installedMaterialsPercent|priceMetadata)"/);
const bytes=gunzipSync(readFileSync(new URL('../verification/qe-agent1-interior-activation-20261019/historical-v12.json.gz',import.meta.url)));
const recordedHash=readFileSync(new URL('../verification/qe-agent1-interior-activation-20261019/historical-v12.sha256',import.meta.url),'utf8').split(' ')[0];
assert.equal(createHash('sha256').update(bytes).digest('hex'),recordedHash);
const historical=JSON.parse(bytes);assert.equal(historical.base,'e50c9f58459a4362537eb5da5dc1cf082fbc3ca8');assert.equal(historical.engineVersion,ENGINE_VERSION);
for(const saved of historical.records)test('PI00 genuine v12 immutable saved widget/voice '+saved.id,async t=>{
 for(const [table,rows] of Object.entries(saved.tables))for(const row of rows){const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}
 savePricebook(saved.owner,saved.book);const h=quoteEmailFixture(t,{base,context:saved.voice.context});
 const unchanged=()=>{
  for(const table of ['quotes','quoteSubmissions','voiceToolIdempotencyReceipts','voiceQuoteNarrations']){
   const keys=db.prepare(`PRAGMA table_info(${table})`).all().filter(c=>c.pk).map(c=>c.name);
   for(const row of saved.tables[table])assert.deepEqual(db.prepare(`SELECT * FROM ${table} WHERE ${keys.map(k=>k+'=?').join(' AND ')}`).get(...keys.map(k=>row[k])),row,table+' entire historical row');
  }
 };
 const replay=async label=>{
  const w=submitQuote(saved.owner,saved.widget.body);assert.equal(w.status,200);assert.deepEqual(w.response,saved.widget.response);assert.equal(w.response.midEstimate,saved.expectedCents/100);publicOnly(w.response);
  assert.deepEqual(await h.tool('getQuote',saved.voice.args,saved.voice.toolCallId),saved.voice.result);
  const v=await h.tool('getQuote',saved.voice.args,'PI00-replay-'+label+'-'+saved.id);assert.deepEqual(v,saved.voice.result);assert.equal(v.midEstimate,saved.expectedCents/100);publicOnly(v);unchanged();
 };
 const approval=structuredClone(saved.book.services[0].quoteDoneApproval);
 assert.equal(bridge.bookStatuses(loadPricebook(saved.owner),date)[0].approvalCurrent,true);await replay('current');
 bridge.saveApplicationBook(saved.owner,bridge.readApplicationBook(saved.owner),date);assert.deepEqual(loadPricebook(saved.owner).services[0].quoteDoneApproval,approval);await replay('ordinary-save');
 const view=bridge.readApplicationBook(saved.owner);view.services[0].pricing.offeringDetails.description+=' [SYNTHETIC] owner edited description';bridge.saveApplicationBook(saved.owner,view,date);
 assert.deepEqual(loadPricebook(saved.owner).services[0].quoteDoneApproval,approval);assert.equal(bridge.bookStatuses(loadPricebook(saved.owner),date)[0].approvalCurrent,false);await replay('stale-content');
 assert.notEqual((await h.tool('matchService',{query:saved.book.services[0].service})).status,'matched');
 const pending=bridge.readApplicationBook(saved.owner);assert.throws(()=>bridge.approveApplicationService(saved.owner,pending.services[0].id,{revision:pending.revision,confirmLegacySettings:true},date),/Explicit confirmation/);assert.deepEqual(loadPricebook(saved.owner).services[0].quoteDoneApproval,approval);
 bridge.approveApplicationService(saved.owner,pending.services[0].id,{revision:pending.revision,confirmConfiguration:true,confirmLegacySettings:true},date);assert.equal(bridge.bookStatuses(loadPricebook(saved.owner),date)[0].approvalCurrent,true);await replay('explicit-reapproval');assert.equal(h.sends(),0);
});
