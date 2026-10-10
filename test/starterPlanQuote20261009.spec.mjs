import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {dirname,join} from 'node:path';
import {readFileSync} from 'node:fs';
import {db as applicationDb} from '../server/src/db.js';
import {randomUUID} from 'node:crypto';
import {harness} from './voiceLifecycle20261006Fixture.mjs';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {bookRevision,approveApplicationService} from '../server/src/quoteDoneBridge.js';
import {concrete} from '../verification/engine-independent/fixtures.mjs';
process.env.JWT_SECRET='[SYNTHETIC]-starter-plan-quote-signing-key'.padEnd(64,'x');
// Hand calculation: 120000 labor + 48889 concrete + 150000 forms + 35000 prep = 353889 cents.
function approved(ownerId){
 const input=concrete();input.ownerPricing.tiers=[];delete input.ownerPricing.origin;
 savePricebook(ownerId,{services:[input.ownerPricing],defaults:{currency:'CAD',...input.businessDefaults,quoteTimeZone:'UTC'}});
 const book=loadPricebook(ownerId);approveApplicationService(ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC'});
 return input;
}
test('Starter lineup: Operator widget quotes 353889 cents; downgrade blocks exact retry without deleting prices or quotes',async t=>{
 const s=await application(t),previous=process.env.PRICEBOOK_PATH;process.env.PRICEBOOK_PATH=join(dirname(s.path),'pricebooks');t.after(()=>{process.env.PRICEBOOK_PATH=previous;applicationDb.prepare('DELETE FROM priceBookCreationRecords WHERE ownerId=?').run('synthetic-a');});
 const input=approved('synthetic-a'),filename=join(process.env.PRICEBOOK_PATH,'synthetic-a.json'),before=readFileSync(filename);
 s.db.prepare("UPDATE users SET plan='Operator' WHERE id='synthetic-a'").run();
 const catalog=await s.request('/api/public/quote/synthetic-a',{publicRequest:true});assert.equal(catalog.status,200);assert.equal(catalog.body.services.length,1);
 const body={requestId:randomUUID(),serviceId:input.ownerPricing.id,customerInputs:input.customerInputs,contact:{phone:'+19025550100'}};
 const result=await s.request('/api/public/quote/synthetic-a',{method:'POST',publicRequest:true,body});assert.equal(result.status,201,JSON.stringify(result));
 assert.deepEqual(result.body.options.map(o=>[o.lowEstimate,o.highEstimate]),[[3538.89,3538.89]]);
 const quotes=s.db.prepare('SELECT * FROM quotes WHERE ownerId=?').all('synthetic-a');
 s.db.prepare("UPDATE users SET plan='Starter' WHERE id='synthetic-a'").run();assert.equal((await s.request('/api/public/quote/synthetic-a',{method:'POST',publicRequest:true,body})).status,403);
 assert.deepEqual(readFileSync(filename),before);assert.deepEqual(s.db.prepare('SELECT * FROM quotes WHERE ownerId=?').all('synthetic-a'),quotes);
 s.db.prepare("UPDATE users SET plan='Operator' WHERE id='synthetic-a'").run();const retry=await s.request('/api/public/quote/synthetic-a',{method:'POST',publicRequest:true,body});assert.equal(retry.status,200);assert.deepEqual(retry.body.options,result.body.options);
});
test('Starter lineup: QuoteDone real phone getQuote remains 353889 cents; Operator downgrade refuses replay',async t=>{
 const f=await harness(t,{beforeInstall:({db})=>db.prepare("UPDATE users SET plan='QuoteDone' WHERE id='synthetic-a'").run()});const input=approved(f.owner),call=await f.connect();
 const match=await f.tool(call.callback,'matchService',{query:input.ownerPricing.service},'match-concrete');assert.equal(match.status,'matched',JSON.stringify(match));
 const {confirmedFacts,...customerInputs}=input.customerInputs;const args={serviceHandle:match.serviceHandle,customerConfirmed:true,customerInputs,productConfirmations:Object.fromEntries(Object.keys(confirmedFacts||{}).map(field=>[field,true]))};
 const result=await f.tool(call.callback,'getQuote',args,'quote-concrete');assert.equal(result.status,'quoted',JSON.stringify(result));assert.deepEqual(result.options.map(o=>[o.lowEstimate,o.highEstimate]),[[3538.89,3538.89]]);
 const before=f.db.prepare('SELECT * FROM quotes WHERE ownerId=?').all(f.owner);f.db.prepare("UPDATE users SET plan='Operator' WHERE id=?").run(f.owner);
 f.responses.delete('quote-concrete');const denied=await f.tool(call.callback,'getQuote',args,'quote-concrete');assert.equal(denied.status,'needs_details');assert.equal(denied.options,undefined);assert.deepEqual(f.db.prepare('SELECT * FROM quotes WHERE ownerId=?').all(f.owner),before);
});
