import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,roof,mowing} from './opusQuoteFixtures.mjs';
import {explanationCases,customerText,duplicateLines,duplicateFacts,internalCopy} from './customerExplanationFixtures.mjs';
const evidence=[];
function quote(input){const internal=engine.generateQuoteVNext(input);assert.equal(internal.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(internal));const customer=engine.sanitizeForCustomerVNext(internal);assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(customer));evidence.push({input,internal,customer});return customer;}
test.after(()=>{if(process.env.CUSTOMER_WORDING_EVIDENCE)fs.writeFileSync(process.env.CUSTOMER_WORDING_EVIDENCE,JSON.stringify(evidence,null,2));});
test('customer wording 1: unspecified decking has one on-site per-sheet disclosure and no internal charge wording',()=>{
 const c=quote(roof());for(const o of [c,...c.options]){const lines=o.priceDrivers.filter(s=>/decking/i.test(s));assert.deepEqual(lines,['Any additional decking is priced per sheet and confirmed on site.']);assert.doesNotMatch(customerText(o),/reviewed customer charge|\$89\.00/);}
});
test('customer wording 2: the existing roof layer count appears once',()=>{
 const input=roof();input.customerInputs.existingLayers=2;const c=quote(input);
 for(const o of [c,...c.options])assert.equal((customerText(o).match(/\b2 (?:measured )?existing (?:roof )?layers\b/g)||[]).length,1);
});
test('customer wording 3: biweekly mowing states its per-visit explanation once',()=>{
 const c=quote(mowing('biweekly'));for(const o of [c,...c.options]){assert.equal(o.priceUnit,'per visit');assert.equal((customerText(o).match(/Price is per visit\./g)||[]).length,1);}
});
const cases=explanationCases();
test('customer wording coverage includes every registered service with a complete quote control',()=>{
 assert.deepEqual([...new Set(cases.map(c=>c.input.serviceType))].sort(),[...engine.SERVICE_TYPES].sort());
});
for(const type of engine.SERVICE_TYPES)test('customer wording scan: '+type,()=>{
 for(const row of cases.filter(c=>c.input.serviceType===type)){const c=quote(row.input);for(const o of [c,...c.options]){assert.deepEqual(duplicateLines(o),[],row.id);assert.deepEqual(duplicateFacts(o,row.input),[],row.id);assert.doesNotMatch(customerText(o),internalCopy,row.id);}}
});
