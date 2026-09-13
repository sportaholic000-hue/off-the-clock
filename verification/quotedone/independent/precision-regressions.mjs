/** Independent acceptance cases for the frozen QuoteDone decimal-output defect.
 * Usage: node precision-regressions.mjs /absolute/path/to/off-the-clock
 * Reads this directory's precision-cases.json; mutates no source or evidence.
 * Six tests intentionally fail on 11d4ef7. All must pass after a scoped repair.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const root=process.argv[2];
if(!root)throw Error('Supply the repository/source directory.');
const cases=JSON.parse(fs.readFileSync(new URL('./precision-cases.json',import.meta.url),'utf8'));
const api=await import(pathToFileURL(path.resolve(root,'server/quote-engine-vnext/index.js')));
// Parse the actual decimal emitted in JSON. No Number multiplication, formatter,
// exactMath import, epsilon, tolerance or toFixed-derived expected amount.
function centsOnWire(value){
 assert.equal(typeof value,'number','Do not silently change the public amount type.');
 const wire=JSON.stringify(value),m=/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(wire);
 assert.ok(m,`Not a nonnegative numeric JSON decimal: ${wire}`);
 const fraction=m[2]||'',scale=fraction.length-Number(m[3]||0)-2,n=BigInt(m[1]+fraction);
 if(scale<=0)return n*10n**BigInt(-scale);
 const divisor=10n**BigInt(scale);assert.equal(n%divisor,0n,'Wire value includes fractional cents.');return n/divisor;
}
function allOutputs(request){
 const owner=api.generateQuoteVNext(structuredClone(request));
 const book={pricebook:{defaults:request.businessDefaults,services:[request.ownerPricing]},serviceType:request.serviceType,customerInputs:request.customerInputs,currentMonth:request.currentMonth};
 return {owner,sanitized:api.sanitizeForCustomerVNext(owner),directCustomer:api.generateQuoteVNext({...structuredClone(request),callerType:'customer'}),ownerPreview:api.previewQuoteVNext(structuredClone(request)),bookOwner:api.quoteFromVNextPricebook({...structuredClone(book),callerType:'owner'}),bookCustomer:api.quoteFromVNextPricebook({...structuredClone(book),callerType:'customer'}),bookPreview:api.previewFromVNextPricebook(structuredClone(book))};
}
for(const c of cases)test(c.id,()=>{
 const outputs=allOutputs(c.request);
 for(const [entry,result]of Object.entries(outputs)){
  assert.equal(result.resultType,c.expectedOutcome,`${entry}: wrong readiness result`);
  if(c.expectedOutcome==='ESTIMATE_REQUIRES_REVIEW')continue;
  for(const [label,amounts]of [['root',result],...result.options.map((v,i)=>[`options[${i}]`,v])])
   for(const [i,key]of ['lowEstimate','midEstimate','highEstimate'].entries())
    assert.equal(centsOnWire(amounts[key]),BigInt(c.expectedWireCents[i]),`${entry}.${label}.${key}: changed intended amount`);
 }
});
