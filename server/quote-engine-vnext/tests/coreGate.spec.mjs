import '../../../test/pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {quotePricebookSpecFiles} from '../../../scripts/testSelection.mjs';
// No money calculations in gate/selection tests.
const gate=resolve('server/scripts/quote-vnext-gate.js');
function sandbox(t){
 const root=mkdtempSync(join(tmpdir(),'core-strict-gate-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const dir of ['server/src','server/quote-engine-vnext','test'])mkdirSync(join(root,dir),{recursive:true});
 writeFileSync(join(root,'server/src/quoteDoneBridge.js'),'// generateQuoteVNext sanitizeForCustomerVNext');
 writeFileSync(join(root,'server/src/customerSummary.js'),'');
 writeFileSync(join(root,'server/quote-engine-vnext/probe.js'),'export const x=1;');
 writeFileSync(join(root,'test/pricebookTestEnv.mjs'),'');return root;
}
function execute(root){const env={...process.env};delete env.NODE_TEST_CONTEXT;return spawnSync(process.execPath,[gate],{cwd:root,env,encoding:'utf8',timeout:15000});}
for(const [name,body,expected] of [
 ['passing',"test('runs',()=>{});",0],
 ['skipped',"test.skip('does not run',()=>{});",1],
 ['nested skipped',"test('outer',async t=>{await t.test('inner',{skip:true},()=>{});});",1],
 ['todo',"test.todo('unfinished');",1],
 ['empty file','',1],
 ['empty suite',"describe('empty',()=>{});",1],
 ['failing',"test('fails',()=>{throw new Error('synthetic');});",1],
 ['missing imported module',"await import('./missing.mjs');test('unreachable',()=>{});",1]
])test('core 10 strict gate: '+name,t=>{
 const root=sandbox(t);writeFileSync(join(root,'test/example.spec.mjs'),"import test,{describe} from 'node:test';import '../server/quote-engine-vnext/probe.js';\n"+body);
 const result=execute(root);assert.equal(result.status,expected,result.stdout+'\n'+result.stderr);
});
test('core 10 strict gate: zero selected files fails',t=>{const r=execute(sandbox(t));assert.equal(r.status,1,r.stdout+r.stderr);});
test('core 10 selection: standalone supporting modules and nested specs',t=>{
 const root=sandbox(t),sources=['server/src/quoteDate.js','server/src/calendarTime.js','server/productNames.js','server/customerQuoteFields.js','server/priceBookCopy.js','server/installedPriceConfiguration.js','server/scopeConfiguration.js','server/pricePrecision.js'];
 for(const [i,source] of sources.entries()){
  mkdirSync(join(root,source,'..'),{recursive:true});writeFileSync(join(root,source),'export const value=1;');
  writeFileSync(join(root,'test/support'+i+'.spec.mjs'),"import '../"+source+"';");
 }
 mkdirSync(join(root,'server/quote-engine-vnext/tests'),{recursive:true});writeFileSync(join(root,'server/quote-engine-vnext/tests/nested.spec.mjs'),"import '../probe.js';");
 assert.deepEqual(quotePricebookSpecFiles(root),['server/quote-engine-vnext/tests/nested.spec.mjs',...sources.map((_,i)=>'test/support'+i+'.spec.mjs')].sort());
});
