// Genuine v12 runtime receipts captured BEFORE the PI-00 contract repair.
import '../../test/pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {ENGINE_VERSION} from '../../server/quote-engine-vnext/index.js';
import {webQuote,publish,quoteEmailFixture,fixture,db} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {gunzipSync} from 'node:zlib';
const OLD='quote-engine-vnext-geometry-20261019-v12';
const base='e50c9f58459a4362537eb5da5dc1cf082fbc3ca8';
assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),base);
assert.equal(execFileSync('git',['diff','--','server'],{encoding:'utf8'}),'');assert.equal(ENGINE_VERSION,OLD);
const cases=[{id:'legacy-full-interior',cents:380000},{id:'legacy-wall-only',cents:300000}];
const cleanup=[],t={after:fn=>cleanup.push(fn)},baseFixture=fixture(t,process.env.DATABASE_PATH);
const records=[];
for(const row of cases){
 const f=offeringFixture('INTERIOR_PAINTING','installed');
 if(row.id==='legacy-wall-only'){f.customerInputs.ceilingsIncluded=false;f.customerInputs.trimIncluded=false;delete f.customerInputs.ceilingAreaSqft;delete f.customerInputs.trimLengthLF;}delete f.ownerPricing.startingValueAdoptions;
 const w=webQuote(f,[],undefined,{roofRuleMode:'new'});
 // Same approved book/owner, separate voice call; no synthetic outcome injection.
 db.prepare('INSERT INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)').run(w.owner,'cus_SYNTHETIC_'+w.owner,'2026-10-06T12:00:00.000Z','2026-10-06T12:00:00.000Z','2026-10-06T12:00:00.000Z');
 const h=quoteEmailFixture(t,{base:baseFixture,context:baseFixture.context(w.owner)});
 const match=await h.tool('matchService',{query:f.ownerPricing.service},'synthetic-match-'+row.id);assert.equal(match.status,'matched');
 const customerInputs=structuredClone(f.customerInputs);delete customerInputs.confirmedFacts;
 const args={serviceHandle:match.serviceHandle,customerInputs,customerConfirmed:true,additionalWork:[],productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(k=>[k,true]))};
 const toolCallId='synthetic-quote-'+row.id;
 let result=await h.tool('getQuote',args,'synthetic-initial-'+row.id);
 if(result.questionContract?.fields.some(field=>field.confirmationToken))args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));
 result=await h.tool('getQuote',args,toolCallId);
 assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,w.result.midEstimate);assert.equal(Math.round(w.result.midEstimate*100),row.cents);assert.equal(h.sends(),0);
 const tables={};
 for(const table of ['users','billingAccounts','businessProfiles','bookingPolicies','calls','quotes','quoteSubmissions','voiceOpaqueHandles','voiceToolIdempotencyReceipts','voiceQuoteNarrations'])tables[table]=db.prepare(`SELECT * FROM ${table} WHERE ${table==='users'?'id':'ownerId'}=? ORDER BY rowid`).all(w.owner);
 records.push({id:row.id,expectedCents:row.cents,observedCents:Math.round(w.result.midEstimate*100),owner:w.owner,book:w.book,widget:{body:w.body,response:w.result},voice:{context:h.c,args,toolCallId,result},tables});
 console.log(JSON.stringify({id:row.id,engineVersion:ENGINE_VERSION,widgetCents:Math.round(w.result.midEstimate*100),voiceCents:Math.round(result.midEstimate*100),independentCents:row.cents,submissions:tables.quoteSubmissions.length,providerCalls:0}));
}
writeFileSync(new URL('./historical-v12.json',import.meta.url),JSON.stringify({base,engineVersion:ENGINE_VERSION,records},null,2)+'\n');
for(const fn of cleanup.reverse())fn();
