import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {production,facts} from './voiceAgent2FactsRefreshProduction20261019Fixture.mjs';
import {until} from './voiceAgent2FactsRefresh20261019Fixture.mjs';
import {quoteEmailFixture} from './quoteEmailFixture.mjs';
import {at} from './leadCaptureRepair20261006Fixture.mjs';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {submitQuote} from '../server/src/quoteDoneRoutes.js';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';

// Read the incoming authentic receipts verbatim; no fixture regeneration.
const path='../verification/qe-agent1-roof-pitch-activation-20261019/';
const bytes=gunzipSync(readFileSync(new URL(path+'historical-v12.json.gz',import.meta.url)));
assert.equal(createHash('sha256').update(bytes).digest('hex'),readFileSync(new URL(path+'historical-v12.sha256',import.meta.url),'utf8').split(' ')[0]);
const historical=JSON.parse(bytes);assert.equal(historical.engineVersion,ENGINE_VERSION);
const records=historical.records.filter(saved=>saved.voice.tool==='getQuote');assert.equal(records.length,2);

for(const saved of records)test('voice H2 owner facts refresh preserves authentic v12 receipt '+saved.id,async t=>{
  const f=await production(t);
  for(const [table,rows] of Object.entries(saved.tables))for(const row of rows){
    const keys=Object.keys(row);f.db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(key=>row[key]));
  }
  // The users-insert trigger precedes this fixture's captured billing evidence.
  // Restore the captured account status after that evidence exists, then prove
  // the entire account matches the genuine saved row. No approval is renewed.
  for(const row of saved.tables.users){
    f.db.prepare('UPDATE users SET planStatus=?,trialEndsAt=?,paymentFailedAt=? WHERE id=?').run(row.planStatus,row.trialEndsAt,row.paymentFailedAt,row.id);
    assert.deepEqual(f.db.prepare('SELECT * FROM users WHERE id=?').get(row.id),row);
  }
  savePricebook(saved.owner,saved.book,{clock:()=>new Date(at)});
  const index=records.indexOf(saved)+1,owner={id:saved.owner,name:saved.tables.users[0].businessName,number:'+1902569999'+index};f.owners.push(owner);
  // Provision a separate synthetic call for the saved owner; original call and
  // quote/submission/idempotency/narration records remain unchanged.
  f.db.prepare("UPDATE businessProfiles SET twilioNumber=?,twilioNumberSid=?,phoneProvisioningStatus='provisioned',operatorEnabled=1 WHERE ownerId=?")
    .run(owner.number,'PN'+index.toString(16).padStart(32,'f'),owner.id);
  const original=structuredClone(loadPricebook(saved.owner));
  const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/);return f.db.prepare(sql);};
  const replay=quoteEmailFixture(t,{base:{db:f.db,ownerQuery},context:saved.voice.context});
  const unchanged=async()=>{
    const web=submitQuote(saved.owner,saved.widget.body);assert.equal(web.status,200);assert.deepEqual(web.response,saved.widget.response);
    assert.deepEqual(await replay.tool('getQuote',saved.voice.args,saved.voice.toolCallId),saved.voice.result);
    for(const table of ['quotes','quoteSubmissions','voiceToolIdempotencyReceipts','voiceQuoteNarrations']){
      const keys=f.db.prepare(`PRAGMA table_info(${table})`).all().filter(column=>column.pk).map(column=>column.name);
      for(const row of saved.tables[table])assert.deepEqual(f.db.prepare(`SELECT * FROM ${table} WHERE ${keys.map(key=>key+'=?').join(' AND ')}`).get(...keys.map(key=>row[key])),row,table+' entire frozen historical row');
    }
    assert.deepEqual(loadPricebook(saved.owner),original,'A public facts save must not rewrite prices, metadata or approval');
    assert.equal(replay.sends(),0);
  };
  await unchanged();await f.save('Widget $10 each',owner,{about:'[SYNTHETIC] Saved historical owner facts',hours:'Weekdays'});const call=await f.connect(owner);
  await unchanged();await f.save('Widget $12 each\nAvailable to members',owner);f.media(call);
  await until(()=>call.rows.length===2&&call.rows.at(-1).established&&call.rows.at(-1).realtime.some(value=>value.audio));
  assert.deepEqual(f.delivered(call),['Widget $10 each','Widget $12 each\nAvailable to members']);
  for(const listing of ['Widget $10 each','Widget $12 each\nAvailable to members']){
    const result=await f.tool(call,listing);assert.equal(result.status,'needs_review');assert.equal(Object.hasOwn(result,'extendedAmount'),false);
  }
  await unchanged();
  const delivered=JSON.stringify(call.rows.map(row=>[facts(row.config.systemInstruction),row.content,row.responses]));
  assert.doesNotMatch(delivered,/"(?:pricing|priceMetadata|quoteDoneApproval|priceBasisByCategory|taxabilityByCategory|laborPerSquare|materialPerSquare|markupPercent)"\s*:/);
  assert.doesNotMatch(delivered,/FOREIGN_SENTINEL/);
  assert.deepEqual(loadPricebook(saved.owner).services.map(service=>service.quoteDoneApproval),original.services.map(service=>service.quoteDoneApproval));
});
