// Run from repository root: node --experimental-vm-modules test/quoteEngineVNextReplay.mjs <output-directory>
// Instrumented regression replay through an in-memory module loader,
// inspecting every returned field and customer allowlist. This is not an independent external audit.
// No repository mutation. Activation generateQuoteVNext calls are captured as well.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=process.cwd(), output=process.argv[2];
if(!output)throw new TypeError('Supply an evidence output directory outside the repository.');
const outputPath=path.resolve(output);
if(outputPath===root||outputPath.startsWith(root+path.sep))throw new TypeError('Evidence output must be outside the repository.');
fs.mkdirSync(outputPath,{recursive:true});
const cache=new Map(),captures=[],tests=[];let activeTest='',depth=0,objects=0,leaves=0,publicReady=0,publicReview=0;
const selected=/^(?:repair (139|14[0-6]):|precision follow-up: (?:composite|all-service catalog))/;
globalThis.__vnextAuditCapture=(entry,fn,args)=>{
 const outer=depth++===0;
 try{const result=fn(...args);if((outer||entry==='generateQuoteVNext')&&selected.test(activeTest))captures.push({test:activeTest,entry,args:structuredClone(args),result:structuredClone(result)});return result;}
 catch(error){if((outer||entry==='generateQuoteVNext')&&selected.test(activeTest))captures.push({test:activeTest,entry,error:{name:error.name,message:error.message}});throw error;}
 finally{depth--;}
};
const fakeTest=(name,fn)=>{if(!selected.test(name))return;activeTest=name;try{fn();tests.push({name,pass:true});}catch(error){tests.push({name,pass:false,error:{name:error.name,message:error.message,stack:error.stack}});}activeTest='';};
async function moduleFor(specifier,ref){
 const id=specifier.startsWith('node:')?specifier:path.resolve(ref?path.dirname(ref.identifier):root,specifier);
 if(cache.has(id))return cache.get(id);
 if(id.startsWith('node:')){const imports=id==='node:test'?{default:fakeTest}:await import(id);const m=new vm.SyntheticModule(Object.keys(imports),function(){for(const key of Object.keys(imports))this.setExport(key,imports[key]);},{identifier:id});cache.set(id,m);return m;}
 let source=fs.readFileSync(id,'utf8');
 if(/quote-engine-vnext[\\/](engine|priceBook|contracts)\.js$/.test(id)){
  const names=[];source=source.replace(/export function (\w+)\(/g,(_,name)=>{names.push(name);return 'function __original_'+name+'(';});
  source+='\n'+names.map(name=>'export function '+name+'(...args){return globalThis.__vnextAuditCapture('+JSON.stringify(name)+',__original_'+name+',args);}').join('\n');
 }
 const m=new vm.SourceTextModule(source,{identifier:id});cache.set(id,m);return m;
}
for(const testFile of ['test/quoteEngineVNextRepairs.spec.js','test/quoteEngineVNext.spec.js']){const module=await moduleFor(path.resolve(testFile));await module.link(moduleFor);await module.evaluate();}
delete globalThis.__vnextAuditCapture;
function visit(v){if(v===null||typeof v!=='object'){leaves++;if(typeof v==='number')assert.ok(Number.isFinite(v));assert.ok(!['function','symbol','bigint'].includes(typeof v));return;}objects++;for(const d of Object.values(Object.getOwnPropertyDescriptors(v))){assert.ok(Object.hasOwn(d,'value'));visit(d.value);}}
const readyKeys=new Set(['resultType','lowEstimate','midEstimate','highEstimate','priceDrivers','disclaimer','quoteId','rangeBufferUsed','options','optionAvailabilityNotice']);
const optionKeys=new Set(['tierName','lowEstimate','midEstimate','highEstimate','priceDrivers','skippedAddons','disclaimer','rangeBufferUsed']);
for(const capture of captures){
 if(capture.error){visit(capture.error);continue;}const r=capture.result;visit(r);
 if(capture.entry==='sanitizeForCustomerVNext'){
  if(r.resultType==='ESTIMATE_REQUIRES_REVIEW'){publicReview++;assert.deepEqual(Object.keys(r).sort(),['customerMessage','quoteId','resultType']);}
  else{publicReady++;for(const k of Object.keys(r))assert.ok(readyKeys.has(k),k);for(const option of r.options)for(const k of Object.keys(option))assert.ok(optionKeys.has(k),k);assert.equal(/ratePath|rateCents|markup|margin|overhead|ownerDiagnostics/i.test(JSON.stringify(r)),false);}
 }
 if(r?.calculationRecord&&r.resultType==='INSTANT_ESTIMATE_READY'){
  assert.equal(r.customerEligible,r.calculationRecord.customerEligible);assert.deepEqual(r.calculationRecord.options,r.options.map(o=>o.calculationRecord));assert.deepEqual(r.lineItems,r.options[0].lineItems);
  for(const o of r.options){assert.deepEqual(o.lineItems,o.calculationRecord.lineItems);for(const scenario of Object.values(o.calculationRecord.scenarios)){assert.equal(scenario.lineItems.reduce((sum,line)=>sum+BigInt(line.amountCents),0n),BigInt(scenario.finalTotalCents));for(const line of scenario.lineItems)assert.equal(line.amountCents,line.calculation.roundedAmountCents);}}
 }
 if(capture.entry==='generateQuoteVNext'&&r?.submittedCustomerInputs){assert.equal(r.serviceType,capture.args[0].serviceType);assert.deepEqual(r.submittedCustomerInputs,capture.args[0].customerInputs);}
}
const sourceHashes=Object.fromEntries([...cache.keys()].filter(k=>!k.startsWith('node:')).map(k=>[path.relative(root,k).replaceAll('\\','/'),createHash('sha256').update(fs.readFileSync(k)).digest('hex')]));
const configuredQuoteExecutions=captures.filter(c=>c.entry==='generateQuoteVNext').length;
assert.ok(configuredQuoteExecutions>0);
const report={tests,captureCount:captures.length,configuredQuoteExecutions,inspection:{objects,leaves,publicReady,publicReview},sourceHashes};
const encode=(_,v)=>typeof v==='number'&&!Number.isFinite(v)?{nonJsonNumber:String(v)}:v===undefined?{nonJsonValue:'undefined'}:v;
fs.writeFileSync(path.join(outputPath,'replay-captures.json'),JSON.stringify({report,captures},encode,2));
fs.writeFileSync(path.join(outputPath,'replay-summary.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
assert.equal(tests.length,10);assert.equal(tests.filter(t=>!t.pass).length,0);
