import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {explanationCases,duplicateLines,internalCopy,customerText,duplicateFacts} from '../../test/customerExplanationFixtures.mjs';
const [sourceRoot,out,baselineFile]=process.argv.slice(2);
const engine=await import(pathToFileURL(path.join(sourceRoot,'server/quote-engine-vnext/index.js')).href);
const baseline=baselineFile?JSON.parse(fs.readFileSync(baselineFile,'utf8')):null;
const cases=baseline?baseline.rows.map(({id,input})=>({id,input})):explanationCases().flatMap(row=>['TAX_NONE','TAX_MATERIALS','TAX_ALL'].map(mode=>{const input=structuredClone(row.input);input.businessDefaults.taxMode=mode;input.businessDefaults.taxPercent=mode==='TAX_NONE'?0:15;return{id:row.id+'-'+mode,input};}));
const omitted=new Set(['quoteId','customerDriver','priceDrivers','disclaimer','disclosures']);
function unchanged(value){if(Array.isArray(value))return value.map(unchanged);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!omitted.has(key)).map(([key,v])=>[key,unchanged(v)]));return value;}
const rows=cases.map(({id,input},index)=>{
 const internal=engine.generateQuoteVNext(input),customer=engine.sanitizeForCustomerVNext(internal);
 assert.equal(internal.resultType,'INSTANT_ESTIMATE_READY',id+': '+JSON.stringify(internal));
 assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY',id);
 const findings=customer.options.flatMap((o,option)=>[
 ...duplicateLines(o).map(text=>({option,kind:'duplicate sentence',text})),
 ...duplicateFacts(o,input).map(text=>({option,kind:'repeated fact',text})),
 ...(internalCopy.test(customerText(o))?[{option,kind:'internal wording',text:customerText(o).match(internalCopy)[0]}]:[])
 ]);
 if(baseline){assert.deepEqual(unchanged(internal),unchanged(baseline.rows[index].internal),id+': calculation or non-wording behavior changed');assert.deepEqual(unchanged(customer),unchanged(baseline.rows[index].customer),id+': public amount or non-wording behavior changed');}
 return {id,input,internal,customer,findings};
});
const services=engine.SERVICE_TYPES.map(serviceType=>{const matching=rows.filter(row=>row.input.serviceType===serviceType);assert.ok(matching.length,serviceType);return {serviceType,cases:matching.length,findings:matching.flatMap(row=>row.findings.map(f=>({id:row.id,...f})))};});
const summary={sourceRoot,cases:rows.length,services:services.length,options:rows.reduce((n,row)=>n+row.customer.options.length,0),findings:rows.reduce((n,row)=>n+row.findings.length,0),identicalCalculations:baseline?rows.length:null};
fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify({summary,services,rows},null,2));fs.writeFileSync(out.replace(/\.json$/,'.summary.json'),JSON.stringify({summary,services},null,2));console.log(JSON.stringify(summary));
if(baseline)assert.equal(summary.findings,0,'Customer wording findings remain; see complete evidence.');
