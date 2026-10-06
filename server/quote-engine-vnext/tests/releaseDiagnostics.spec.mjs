import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../index.js';
// Handwritten expected $100/$110 and review outcomes are in the release spec.
const instant='2026-11-01T06:30:00.000Z';
function request(){const f=mowing();delete f.currentMonth;f.businessDefaults.quoteTimeZone='UTC';return {...f,quoteDate:{timeZone:'UTC',quoteInstant:instant}};}
for(const [name,alter,path] of [
 ['missing context fields',f=>{f.quoteDate={};},'quoteDate'],
 ['null context',f=>{f.quoteDate=null;},'quoteDate'],
 ['invalid instant',f=>{f.quoteDate.quoteInstant='not-an-instant';},'quoteDate.quoteInstant'],
 ['noncanonical instant',f=>{f.quoteDate.quoteInstant='2026-11-01';},'quoteDate.quoteInstant'],
 ['invalid supplied zone',f=>{f.quoteDate.timeZone='Invalid/Zone';},'quoteDate.timeZone'],
 ['zone contradicts book',f=>{f.quoteDate.timeZone='America/Los_Angeles';},'quoteDate.timeZone'],
 ['month contradicts instant',f=>{f.currentMonth=10;},'currentMonth'],
 ['peak lacks any zone',f=>{delete f.businessDefaults.quoteTimeZone;f.ownerPricing.peakMonths=[10];f.ownerPricing.peakSurchargePercent=10;f.quoteDate.timeZone=null;},'businessDefaults.quoteTimeZone']
])test('release diagnostics: '+name+' identifies '+path,()=>{
 const f=request();alter(f);const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(q.midEstimate,undefined);
 assert.ok(q.invalidOwnerFields.includes(path),JSON.stringify(q));assert.ok(q.ownerDiagnostics.some(d=>d.path===path&&d.kind==='quote_date'),JSON.stringify(q));
});
for(const [zone,expected] of [['UTC',100],['America/Los_Angeles',110]])test('release diagnostics: valid '+zone+' still quotes $'+expected,()=>{
 const f=request();f.businessDefaults.quoteTimeZone=zone;f.quoteDate.timeZone=zone;f.ownerPricing.peakMonths=[10];f.ownerPricing.peakSurchargePercent=10;
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,expected);assert.deepEqual(q.calculationRecord.quoteDate,f.quoteDate);
});
