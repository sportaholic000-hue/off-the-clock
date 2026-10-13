import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const script=path.resolve('verification/release-candidate-20261012l/render-test-summary.mjs');
for(const [name,checker,tap,checkerOutcome,suiteOutcome]of[
  ['complete passing inputs','Summary: 2 pass / 0 fail\n','ok 1 - one\nok 2 - two\n# tests 2\n# pass 2\n# fail 0\n','success','success'],
  ['failed TAP with checker absent',null,'    not ok 1 - synthetic nested failure\nnot ok 1 - synthetic parent\n# tests 2\n# pass 0\n# fail 2\n','skipped','failure'],
  ['inputs absent after earlier failure',null,null,'skipped','skipped']
])test('CI summary: '+name,t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-summary-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
  if(checker!==null)fs.writeFileSync(path.join(directory,'test-check.txt'),checker);
  if(tap!==null)fs.writeFileSync(path.join(directory,'test-results.tap'),tap);
  // Exercise the real CLI inside bash -e, including the command after it.
  const result=spawnSync('bash',['-e','-c','"$SUMMARY_NODE" "$SUMMARY_SCRIPT" > "$GITHUB_WORKSPACE/summary.txt"\necho SUMMARY_RENDER_COMPLETED'],{encoding:'utf8',env:{...process.env,SUMMARY_NODE:process.execPath,SUMMARY_SCRIPT:script,GITHUB_WORKSPACE:directory,GITHUB_RUN_ID:'synthetic-run',GITHUB_SHA:'synthetic-sha',CHECKER_OUTCOME:checkerOutcome,SUITE_OUTCOME:suiteOutcome,PRIOR_GATES:tap===null?'build=failure':'build=success'}});
  assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/SUMMARY_RENDER_COMPLETED/);
  const summary=fs.readFileSync(path.join(directory,'summary.txt'),'utf8');
  assert.match(summary,/does not override the original gate outcomes/);
  if(checker===null)assert.match(summary,/Checker output unavailable.*checker skipped/);else assert.ok(summary.includes(checker.trim()));
  if(tap===null){assert.match(summary,/TAP unavailable.*NOT RUN/);assert.match(summary,/Earlier gate outcomes: build=failure/);}
  else if(suiteOutcome==='failure'){assert.match(summary,/not ok 1 - synthetic nested failure/);assert.match(summary,/not ok 1 - synthetic parent/);assert.match(summary,/# fail 2/);assert.match(summary,/Full-suite outcome: failure/);}
  else assert.match(summary,/# pass 2/);
});
