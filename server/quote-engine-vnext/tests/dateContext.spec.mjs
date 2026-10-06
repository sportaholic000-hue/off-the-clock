import '../../../test/pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mowing} from '../../../verification/engine-independent/fixtures.mjs';
import {savePricebook,loadPricebook} from '../../priceBookService.js';
import * as bridge from '../../src/quoteDoneBridge.js';
import {applicationQuoteMonth,applicationQuoteDate,quoteDateContext,registerQuoteDateDatabase} from '../../src/quoteDate.js';
import {generateQuoteVNext,sanitizeForCustomerVNext,ENGINE_VERSION} from '../index.js';

// Handwritten before execution in DATE_CONTEXT_FIX_20261006.md:
// 5,000 sqft * $0.02 = $100; October 10% labor surcharge = $10; total $110.
const west='2026-11-01T06:30:00.000Z',east='2026-09-30T15:30:00.000Z';
function setup({bookZone,months=[10],percent=10,serviceMonths,servicePercent}={}){
 const f=mowing();delete f.ownerPricing.peakMonths;delete f.ownerPricing.peakSurchargePercent;
 Object.assign(f.businessDefaults,{peakMonths:months,peakSurchargePercent:percent});
 if(bookZone!==undefined)f.businessDefaults.quoteTimeZone=bookZone;
 if(serviceMonths!==undefined)f.ownerPricing.peakMonths=serviceMonths;
 if(servicePercent!==undefined)f.ownerPricing.peakSurchargePercent=servicePercent;
 const id='[SYNTHETIC]-date-'+randomUUID(),raw=structuredClone(f.ownerPricing);delete raw.origin;
 savePricebook(id,{services:[raw],defaults:{currency:'CAD',...f.businessDefaults}});
 let book=loadPricebook(id),service=book.services[0];
 bridge.approveApplicationService(id,service.id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true});
 book=loadPricebook(id);service=book.services[0];
 return {f,id,book,service,body:{serviceId:service.id,customerInputs:f.customerInputs}};
}
const quote=(s,context)=>bridge.calculateApplicationQuote(s.book,s.service,s.body,{ownerId:s.id,...context});
const ready=(q,expected)=>{assert.equal(q.customerResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.customerResult.midEstimate,expected);return q.internalResult;};
const review=q=>{assert.equal(q.customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(q.customerResult.midEstimate,undefined);};

for(const [name,instant,profile,bookZone,expected,zone] of [
 ['west profile',west,'America/Los_Angeles',undefined,110,'America/Los_Angeles'],
 ['east profile',east,'Asia/Tokyo',undefined,110,'Asia/Tokyo'],
 ['west book wins',west,'UTC','America/Los_Angeles',110,'America/Los_Angeles'],
 ['east book wins',east,'UTC','Asia/Tokyo',110,'Asia/Tokyo'],
 ['west UTC book wins',west,'America/Los_Angeles','UTC',100,'UTC'],
 ['east UTC book wins',east,'Asia/Tokyo','UTC',100,'UTC'],
 ['invalid book uses west',west,'America/Los_Angeles','Invalid/Book',110,'America/Los_Angeles'],
 ['invalid book uses east',east,'Asia/Tokyo','Invalid/Book',110,'Asia/Tokyo'],
 ['empty book uses profile',west,'America/Los_Angeles','',110,'America/Los_Angeles'],
 ['null book uses profile',east,'Asia/Tokyo',null,110,'Asia/Tokyo'],
 ['non-string book uses profile',east,'Asia/Tokyo',17,110,'Asia/Tokyo'],
 ['Halifax fallback','2026-11-01T01:30:00.000Z','America/Halifax','Invalid/Book',110,'America/Halifax']
])test('date context: '+name+' ($'+expected+')',()=>{
 const s=setup({bookZone}),context={timeZone:profile,quoteInstant:new Date(instant)};
 const status=bridge.applicationStatus(s.service,s.book,context);assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));
 const result=ready(quote(s,context),expected);
 assert.deepEqual(result.calculationRecord.quoteDate,{timeZone:zone,quoteInstant:instant});
 assert.deepEqual(result.calculationRecord.financialInputs.quoteDate,result.calculationRecord.quoteDate);
 assert.equal(result.calculationRecord.financialInputs.currentMonth,expected===110?10:instant===west?11:9);
 assert.equal(result.calculationRecord.financialInputs.businessDefaults.quoteTimeZone,bookZone);
 assert.equal(s.book.defaults.quoteTimeZone,bookZone);
 assert.equal(bridge.previewApplicationQuote(s.id,{...s.body,revision:bridge.bookRevision(s.book)},context).midEstimate,expected);
 assert.equal(applicationQuoteMonth(s.service,s.book.defaults,context),expected===110?10:instant===west?11:9);
});
for(const [bookZone,profile] of [[undefined,undefined],['Invalid/Book','Invalid/Profile'],[null,null],['',17]])test('date context: missing valid zones stops peak '+String(bookZone),()=>{
 const s=setup({bookZone}),context={timeZone:profile,quoteInstant:new Date(west)};
 for(const status of [bridge.applicationStatus(s.service,s.book,context),bridge.bookStatuses(s.book,context)[0],bridge.bookQuoteStatuses(s.book,context)[0]]){
  assert.equal(status.status,'NEEDS PRICING');assert.ok(status.missingOwnerFields.includes('businessDefaults.quoteTimeZone'));
 }
 review(quote(s,context));assert.equal(applicationQuoteMonth(s.service,s.book.defaults,context),null);
 const preview=bridge.previewApplicationQuote(s.id,{...s.body,revision:bridge.bookRevision(s.book)},context);
 assert.equal(preview.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(preview.midEstimate,undefined);
});
for(const [name,settings] of [['zero percentage',{percent:0}],['empty months',{months:[]}],['service zero overrides business',{servicePercent:0}],['service months override business',{serviceMonths:[]}]])test('date context: '+name+' needs no zone ($100)',()=>{
 const s=setup(settings),context={timeZone:null,quoteInstant:new Date(west)};
 assert.equal(bridge.applicationStatus(s.service,s.book,context).status,'QUOTING LIVE');
 const result=ready(quote(s,context),100);assert.deepEqual(result.calculationRecord.quoteDate,{timeZone:null,quoteInstant:west});
});
test('date context: service-level peak still requires a zone',()=>{
 const s=setup({months:[],percent:0,serviceMonths:[10],servicePercent:10});
 assert.equal(bridge.applicationStatus(s.service,s.book).status,'NEEDS PRICING');review(quote(s,{timeZone:null,quoteInstant:new Date(west)}));
});
test('date context: cached readiness follows profile changes without changing the book ($110)',()=>{
 const s=setup({bookZone:'Invalid/Book'}),before=JSON.stringify(s.book);
 assert.equal(bridge.bookQuoteStatuses(s.book,{timeZone:'Invalid/Profile'})[0].status,'NEEDS PRICING');
 assert.equal(bridge.bookQuoteStatuses(s.book,{timeZone:'America/Los_Angeles'})[0].status,'QUOTING LIVE');
 ready(quote(s,{timeZone:'America/Los_Angeles',quoteInstant:new Date(west)}),110);
 assert.equal(bridge.bookQuoteStatuses(s.book,{timeZone:null})[0].status,'NEEDS PRICING');assert.equal(JSON.stringify(s.book),before);
});
test('date context: database fallback stays owner scoped and is refreshed ($110)',t=>{
 const a=setup(),b=setup(),zones=new Map([[a.id,'America/Los_Angeles'],[b.id,'Invalid/Profile']]),reads=[];
 const database={prepare(sql){assert.match(sql,/WHERE id = @ownerId/);return {get({ownerId}){reads.push(ownerId);return {timezone:zones.get(ownerId)};}};}};
 registerQuoteDateDatabase(database);t.after(()=>registerQuoteDateDatabase(undefined));
 assert.equal(bridge.bookStatuses(a.book)[0].status,'QUOTING LIVE');assert.equal(bridge.bookStatuses(b.book)[0].status,'NEEDS PRICING');
 ready(quote(a,{quoteInstant:new Date(west)}),110);
 zones.set(a.id,'Invalid/Profile');assert.equal(bridge.bookStatuses(a.book)[0].status,'NEEDS PRICING');review(quote(a,{quoteInstant:new Date(west)}));
 assert.ok(reads.includes(a.id)&&reads.includes(b.id));
 assert.deepEqual(quoteDateContext(database,b.id,new Date(east)),{timeZone:'Invalid/Profile',quoteInstant:new Date(east)});
});
test('date context: approval from the previous arithmetic version is not current',()=>{
 const s=setup({bookZone:'UTC'});assert.equal(s.service.quoteDoneApproval.engineVersion,ENGINE_VERSION);
 s.service.quoteDoneApproval.engineVersion='quote-engine-vnext-launch-fixes-20261005-v6';
 assert.equal(bridge.applicationStatus(s.service,s.book).approvalCurrent,false);review(quote(s,{quoteInstant:new Date(west)}));
});
for(const instant of [new Date(NaN),'not-an-instant',null,17])test('date context: invalid trusted instant reviews '+String(instant),()=>{
 const s=setup({bookZone:'UTC'});review(quote(s,{quoteInstant:instant}));
});
test('date context: calculation replay rejects contradictory month and altered date evidence ($110)',()=>{
 const s=setup(),out=quote(s,{timeZone:'America/Los_Angeles',quoteInstant:new Date(west)}),result=ready(out,110);
 const badRequest={...out.request,currentMonth:11};assert.equal(generateQuoteVNext(badRequest).resultType,'ESTIMATE_REQUIRES_REVIEW');
 for(const alter of [q=>{q.calculationRecord.quoteDate.timeZone='UTC';},q=>{q.calculationRecord.financialInputs.quoteDate.quoteInstant=east;},q=>{q.calculationRecord.quoteDate.timeZone='UTC';q.calculationRecord.financialInputs.quoteDate.timeZone='UTC';}]){
  const q=structuredClone(result);alter(q);assert.equal(sanitizeForCustomerVNext(q).resultType,'ESTIMATE_REQUIRES_REVIEW');
 }
 const replay=generateQuoteVNext({serviceType:result.serviceType,customerInputs:result.submittedCustomerInputs,ownerPricing:result.calculationRecord.ownerConfiguration,...result.calculationRecord.financialInputs,callerType:'owner'});
 assert.equal(replay.midEstimate,110);assert.deepEqual(replay.calculationRecord.quoteDate,result.calculationRecord.quoteDate);
});
test('date context: customer data cannot supply the trusted zone or instant',()=>{
 const s=setup();s.body={...s.body,timeZone:'Asia/Tokyo',quoteInstant:east,quoteDate:{timeZone:'Asia/Tokyo',quoteInstant:east}};
 review(quote(s,{timeZone:null,quoteInstant:new Date(west)}));
});
