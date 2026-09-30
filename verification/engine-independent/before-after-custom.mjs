import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import crypto from 'node:crypto';
import {custom} from './fixtures.mjs';
const baseline=path.resolve(process.argv[2]),candidate=path.resolve(process.argv[3]),evidence=path.resolve(process.argv[4]);fs.mkdirSync(evidence,{recursive:true});
const input=custom(),expected={resultType:'INSTANT_ESTIMATE_READY',midEstimate:125};
fs.writeFileSync(path.join(evidence,'custom-expected-input.json'),JSON.stringify({input,expected,calculation:'One confirmed fixed service at12500 cents; no tax, fees, markup, minimum or range buffer.'},null,2));
const rows=[];for(const [name,root]of [['before',baseline],['after',candidate]]){
 const engine=await import(pathToFileURL(path.join(root,'server/quote-engine-vnext/index.js')));const result=engine.generateQuoteVNext(input);
 const hashes={};for(const file of fs.readdirSync(path.join(root,'server/quote-engine-vnext')).filter(f=>f.endsWith('.js')))hashes[file]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'server/quote-engine-vnext',file))).digest('hex');
 rows.push({name,input,result,customer:engine.sanitizeForCustomerVNext(result),status:engine.vNextServiceStatus(input.ownerPricing,input.businessDefaults),sourceHashes:hashes});
}fs.writeFileSync(path.join(evidence,'custom-before-after.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows.map(r=>({name:r.name,resultType:r.result.resultType,midEstimate:r.result.midEstimate,activation:r.status.status}))));
