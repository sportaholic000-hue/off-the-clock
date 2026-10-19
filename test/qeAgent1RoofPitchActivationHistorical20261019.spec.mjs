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
const path='../verification/qe-agent1-roof-pitch-activation-20261019/';
const bytes=gunzipSync(readFileSync(new URL(path+'historical-v12.json.gz',import.meta.url)));
assert.equal(createHash('sha256').update(bytes).digest('hex'),readFileSync(new URL(path+'historical-v12.sha256',import.meta.url),'utf8').split(' ')[0]);
const historical=JSON.parse(bytes);assert.equal(historical.base,'2b452feeb1af7c288c19b12bea5b95e48b81920e');assert.equal(historical.engineVersion,ENGINE_VERSION);
for(const saved of historical.records)test('AP01/AP02 authentic v12 immutable priced/review receipts: '+saved.id,async t=>{
 for(const [table,rows] of Object.entries(saved.tables))for(const row of rows){const keys=Object.keys(row);db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));}
 savePricebook(saved.owner,saved.book,{clock:()=>new Date(date.quoteInstant)});const h=quoteEmailFixture(t,{base,context:saved.voice.context});
 const unchanged=()=>{
  for(const table of ['quotes','quoteSubmissions','voiceToolIdempotencyReceipts','voiceQuoteNarrations']){
   const keys=db.prepare(`PRAGMA table_info(${table})`).all().filter(c=>c.pk).map(c=>c.name);
   for(const row of saved.tables[table])assert.deepEqual(db.prepare(`SELECT * FROM ${table} WHERE ${keys.map(k=>k+'=?').join(' AND ')}`).get(...keys.map(k=>row[k])),row,table+' entire historical row');
  }
 };
 const replay=async()=>{
  const w=submitQuote(saved.owner,saved.widget.body);assert.equal(w.status,200);assert.deepEqual(w.response,saved.widget.response);
  // matchService is read-only, has no durable quote receipt, and is expected
  // to change discovery after this repair. Replay only genuine getQuote rows.
  if(saved.voice.tool==='getQuote')assert.deepEqual(await h.tool('getQuote',saved.voice.args,saved.voice.toolCallId),saved.voice.result);
  unchanged();
 };
 const approval=structuredClone(saved.book.services[0].quoteDoneApproval);
 assert.equal(bridge.bookStatuses(loadPricebook(saved.owner),date)[0].approvalCurrent,true);
 assert.equal(bridge.bookStatuses(loadPricebook(saved.owner),date)[0].status,'QUOTING LIVE');
 await replay();assert.deepEqual(loadPricebook(saved.owner),saved.book);
 bridge.saveApplicationBook(saved.owner,bridge.readApplicationBook(saved.owner),date);assert.deepEqual(loadPricebook(saved.owner).services[0].quoteDoneApproval,approval);await replay();
 const view=bridge.readApplicationBook(saved.owner);view.services[0].pricing.laborPerSquare.asphalt_shingle+=.01;bridge.saveApplicationBook(saved.owner,view,date);
 assert.deepEqual(loadPricebook(saved.owner).services[0].quoteDoneApproval,approval);assert.equal(bridge.bookStatuses(loadPricebook(saved.owner),date)[0].approvalCurrent,false);
 await replay();assert.notEqual((await h.tool('matchService',{query:saved.book.services[0].service})).status,'matched');
 assert.equal(bridge.bookStatuses(loadPricebook(saved.owner),date)[0].approvalCurrent,false);assert.deepEqual(loadPricebook(saved.owner).services[0].quoteDoneApproval,approval);assert.equal(h.sends(),0);
});
