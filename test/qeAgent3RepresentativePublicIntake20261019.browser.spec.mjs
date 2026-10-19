import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const OWNED_SOURCE='client/src/quoteDoneControls.jsx';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const harness=path.join(root,'verification/qe-agent3-widget-dependencies-20261019/representative-browser-audit.mjs');
const preservedSha256='b569519b641eb3cc8ea25e8b6bf2fb740097011bab9e5013a0f936cf736cecc0';

test('qe-agent3 preserved representative public-intake Chromium harness covers its actual 8 of 20 services',{timeout:300_000},t=>{
  assert.equal(OWNED_SOURCE,'client/src/quoteDoneControls.jsx');
  assert.equal(createHash('sha256').update(readFileSync(harness)).digest('hex'),preservedSha256);
  const output=mkdtempSync(path.join(tmpdir(),'qe-agent3-representative-'));
  t.after(()=>rmSync(output,{recursive:true,force:true}));
  const run=spawnSync(process.execPath,[harness,root,output],{
    cwd:root,encoding:'utf8',maxBuffer:20*1024*1024,env:{...process.env}
  });
  assert.equal(run.signal,null,run.stderr||run.stdout);
  assert.equal(run.status,0,run.stderr||run.stdout);
  const result=JSON.parse(readFileSync(path.join(output,'result.json'),'utf8'));
  const coverage=JSON.parse(readFileSync(path.join(output,'coverage.json'),'utf8'));
  assert.deepEqual(result,{status:'passed',caseCount:11,browserServiceCount:8,browserUntested:coverage.browserUntested,actionableFindings:0});
  assert.equal(coverage.browserCovered.length,8);
  assert.equal(coverage.browserUntested.length,12);
  assert.deepEqual([...coverage.browserCovered].sort(),[
    'CONCRETE_DRIVEWAY','FENCING_INSTALL','FLAT_ROOF_REPAIR','FLOORING_REPLACEMENT',
    'LANDSCAPING_MOWING','LANDSCAPING_MULCH','LANDSCAPING_PLANTING','ROOFING_REPAIR'
  ]);
});
