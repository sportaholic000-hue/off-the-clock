import fs from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {build} from './fixtures.mjs';
import {generateQuoteVNext,SERVICE_TYPES} from '../../server/quote-engine-vnext/index.js';
const root=new URL('./',import.meta.url),rows=JSON.parse(fs.readFileSync(new URL('expected-cases-final.json',root)));
const output=process.argv[2]||'direct-final.json.gz';
const results=rows.map(row=>{
 const input=build(row);let result,error;try{result=generateQuoteVNext(input);}catch(e){error=String(e.stack);}
 const lines=Object.fromEntries((result?.lineItems||[]).map(line=>[line.name,line.amountCents]));
 const actualCents=result?.resultType==='INSTANT_ESTIMATE_READY'?(result.lineItems||[]).reduce((n,line)=>n+line.amountCents,0):null;
 const differences=Object.entries(row.expected.lines).filter(([name,value])=>name!=='__total'&&lines[name]!==value).map(([name,value])=>({name,expected:value,actual:lines[name]??null}));
 const passed=row.expected.review?result?.resultType==='ESTIMATE_REQUIRES_REVIEW':actualCents===row.expected.totalCents&&differences.length===0;
 return {id:row.id,family:row.family,params:row.params,serviceType:input.serviceType,expected:row.expected,actualCents,lines,differences,passed,...(!passed?{input,result,error}:{})};
});
const summary={source:'abc2becff9cd252a63ff30258e9950a07af2c020',expectedSha256:createHash('sha256').update(fs.readFileSync(new URL('expected-cases-final.json',root))).digest('hex'),cases:results.length,passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,registeredTrades:SERVICE_TYPES,testedTrades:[...new Set(results.map(r=>r.serviceType))],families:Object.fromEntries([...new Set(results.map(r=>r.family))].map(k=>[k,{cases:results.filter(r=>r.family===k).length,failed:results.filter(r=>r.family===k&&!r.passed).length}]))};
const serialized=JSON.stringify({summary,results},null,2)+'\n';fs.writeFileSync(new URL(output,root),output.endsWith('.gz')?gzipSync(serialized):serialized);console.log(JSON.stringify(summary,null,2));
for(const r of results.filter(r=>!r.passed))console.log(JSON.stringify({id:r.id,params:r.params,expected:r.expected.totalCents,actual:r.actualCents,differences:r.differences,reason:r.result?.reviewReason,missing:r.result?.missingCustomerFields,invalid:r.result?.invalidCustomerFields}));
