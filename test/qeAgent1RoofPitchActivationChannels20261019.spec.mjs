import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {cases} from '../verification/qe-agent1-roof-pitch-activation-20261019/cases.mjs';
// Mixed saved-widget AND actual-voice regressions; the ordinary quote selector
// follows static imports through cases to the application/engine fixtures.
const root=mkdtempSync(join(tmpdir(),'qe-agent1-roof-pitch-'));
let run,results;
try{
 run=spawnSync(process.execPath,['--experimental-test-module-mocks',resolve('verification/qe-agent1-roof-pitch-activation-20261019/audit.mjs'),join(root,'results')],{env:{...process.env,REPAIR_CASES:'1',CASE_FILTER:'',CAPTURE:''},encoding:'utf8',maxBuffer:8*1024*1024,timeout:180000});
 results=JSON.parse(readFileSync(join(root,'results/results.json'),'utf8'));
}finally{rmSync(root,{recursive:true,force:true});}
test('AP01/AP02 actual HTTP and voice matrix completes all independent cases',()=>{
 assert.equal(run.error,undefined);assert.equal(results.length,cases().length);assert.equal(run.status,0,run.stdout+'\n'+run.stderr);
});
for(const row of results)test('AP01/AP02 saved widget + actual voice: '+row.id,()=>{
 assert.deepEqual(row.faults,[],JSON.stringify(row));
});
