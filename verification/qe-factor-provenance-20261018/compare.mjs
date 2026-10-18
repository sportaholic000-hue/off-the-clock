// Read frozen independent expectations; never derive them from engine output.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {generateQuoteVNext,ENGINE_VERSION} from '../../server/quote-engine-vnext/engine.js';
const dir=path.dirname(new URL(import.meta.url).pathname);
const label=process.argv[2]||'comparison-first';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Simple output label required');
const target=path.join(dir,label+'.json');if(fs.existsSync(target))throw Error('Refusing to overwrite preserved execution');
const raw=fs.readFileSync(path.join(dir,'expected-cases.json'),'utf8'),plan=JSON.parse(raw),rows=[];
console.log('Expected-file SHA256 '+crypto.createHash('sha256').update(raw).digest('hex'));
const selected=process.argv[3]?plan.cases.filter(c=>c.id===process.argv[3]):plan.cases;
if(!selected.length)throw Error('No selected cases');
for(const c of selected){
 const outcomes={};for(const which of ['baseline','active']){
  try{const q=generateQuoteVNext(c[which]);outcomes[which]={resultType:q.resultType,totalCents:q.lineItems?.reduce((s,l)=>s+l.amountCents,0)??null,display:{lowEstimate:q.lowEstimate,midEstimate:q.midEstimate,highEstimate:q.highEstimate},lines:q.lineItems?.map(l=>({name:l.name,category:l.category,amountCents:l.amountCents,calculation:l.calculation})),diagnostics:q.resultType==='INSTANT_ESTIMATE_READY'?undefined:q};}
  catch(e){outcomes[which]={error:{name:e.name,message:e.message,stack:e.stack},totalCents:null};}
 }
 const pass=['baseline','active'].every(k=>outcomes[k].resultType==='INSTANT_ESTIMATE_READY'&&outcomes[k].totalCents===c.expected[k+'Cents']);
 const delta=outcomes.active.totalCents!==null&&outcomes.baseline.totalCents!==null?outcomes.active.totalCents-outcomes.baseline.totalCents:null;
 rows.push({id:c.id,service:c.service,classification:c.classification,calculation:c.calculation,expected:c.expected,actualDeltaCents:delta,pass,...outcomes});
 console.log(`${pass?'PASS':'FAIL'} ${c.id}: expected ${c.expected.baselineCents} -> ${c.expected.activeCents} (${c.expected.deltaCents>=0?'+':''}${c.expected.deltaCents}); actual ${outcomes.baseline.totalCents} -> ${outcomes.active.totalCents} (${delta}); ${outcomes.baseline.resultType}/${outcomes.active.resultType}`);
}
const report={base:plan.base,expectedSha256:crypto.createHash('sha256').update(raw).digest('hex'),startedFromExpectationsPreparedAt:plan.preparedAt,completedAt:new Date().toISOString(),engineVersion:ENGINE_VERSION,node:process.version,summary:{cases:rows.length,engineCalls:rows.length*2,passed:rows.filter(r=>r.pass).length,failed:rows.filter(r=>!r.pass).length},rows};
fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));process.exitCode=report.summary.failed?1:0;
