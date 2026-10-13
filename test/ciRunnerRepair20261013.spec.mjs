import test from 'node:test';
import assert from 'node:assert/strict';
import {runFixture,passingTap} from './helpers/ciRunnerRepairFixture20261013.mjs';

test('CI runner repair: complete passing TAP is accepted by the actual checker',()=>{
  const r=runFixture({name:'checker-complete'});assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(r.signal,null);
});
test('CI runner repair: truncated summary after positive tests count is rejected',()=>{
  const r=runFixture({name:'checker-truncated',tap:passingTap.slice(0,passingTap.indexOf('# suites'))});
  assert.equal(r.status,1,r.stdout+r.stderr);
});
test('CI runner repair: no-summary control is rejected',()=>{
  const r=runFixture({name:'checker-no-summary',tap:'TAP version 13\n'});assert.equal(r.status,1,r.stdout+r.stderr);
});
test('CI runner repair: passing TAP followed by real child exit 7 cannot pass',()=>{
  const r=runFixture({name:'wrapper-exit-seven',kind:'wrapper',childExit:7});
  assert.ok(r.captured.includes(passingTap),'complete child TAP retained alongside stderr diagnostics');
  assert.notEqual(r.status,0,r.stdout+r.stderr);assert.equal(r.signal,null);
});

for (const key of ['tests','suites','pass','fail','cancelled','skipped','todo']) test('CI runner repair: checker refuses missing '+key+' count',()=>{
  const tap=passingTap.replace(new RegExp('^# '+key+' .*\\n','m'),'');
  const r=runFixture({name:'missing-'+key,tap});assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,/Missing final summary count/);
});
for (const [name,value] of [['negative','-1'],['fraction','0.5'],['nan','NaN'],['infinity','Infinity'],['exponent','1e0'],['empty',''],['extra-space',' 1'],['trailing-text','1 trailing'],['unsafe-integer','9007199254740992']]) {
  test('CI runner repair: checker refuses '+name+' count',()=>{
    const r=runFixture({name:'malformed-'+name,tap:passingTap.replace('# pass 1','# pass '+value)});
    assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,/Invalid final summary count/);
  });
}
for (const key of ['fail','cancelled','skipped','todo']) test('CI runner repair: checker refuses nonzero '+key,()=>{
  const tap=passingTap.replace('# pass 1','# pass 0').replace('# '+key+' 0','# '+key+' 1');
  const r=runFixture({name:'nonzero-'+key,tap});assert.equal(r.status,1,r.stdout+r.stderr);
});
for (const [name,tap,message] of [
  ['zero-tests',passingTap.replace('# tests 1','# tests 0').replace('# pass 1','# pass 0'),/No positive completed test count/],
  ['mismatched-passes',passingTap.replace('# pass 1','# pass 2'),/Contradictory final summary/],
  ['inconsistent-total',passingTap.replace('# tests 1','# tests 2'),/Contradictory final summary/],
  ['duplicate-count',passingTap+'# pass 1\n',/Duplicate final summary count/],
  ['duplicate-conflicting-count',passingTap+'# fail 2\n',/Duplicate final summary count/],
  ['unfinished-second-report',passingTap+'TAP version 13\n# Subtest: SYNTHETIC unfinished\n',/Test output continues/],
  ['failed-test-with-passing-counts',passingTap.replace('ok 1 -','not ok 1 -'),/New test failure/],
  ['nested-failure-with-passing-counts',passingTap.replace('ok 1 -','    not ok 1 -'),/New test failure/]
]) test('CI runner repair: checker refuses '+name,()=>{
  const r=runFixture({name,tap});assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,message);
});
test('CI runner repair: checker accepts complete CRLF output',()=>{
  const r=runFixture({name:'checker-crlf',tap:passingTap.replaceAll('\n','\r\n')});assert.equal(r.status,0,r.stdout+r.stderr);
});
test('CI runner repair: known failures remain diagnostic and cannot exempt failure',()=>{
  const tap=passingTap.replace('ok 1 -','not ok 1 -').replace('# pass 1','# pass 0').replace('# fail 0','# fail 1');
  const r=runFixture({name:'known-failure',tap,known:'SYNTHETIC runner control\n'});
  assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,/Known failures still failing: 1\/1/);
});
test('CI runner repair: checker missing report fails',()=>{
  const r=runFixture({name:'missing-input',mode:'missing-input'});assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stderr,/ENOENT/);
});
test('CI runner repair: successful wrapper control preserves selection and reporter flags',()=>{
  const r=runFixture({name:'wrapper-success',kind:'wrapper'});assert.equal(r.status,0,r.stdout+r.stderr);
  assert.deepEqual(r.selected.args,['--experimental-test-module-mocks','--import','./test/pricebookTestEnv.mjs','--test-concurrency=1','--test','--test-reporter=tap','test/SYNTHETIC-only.spec.mjs']);
  assert.ok(r.captured.includes(passingTap));
});
test('CI runner repair: wrapper rejects incomplete TAP even with child exit zero',()=>{
  const r=runFixture({name:'wrapper-truncated',kind:'wrapper',tap:passingTap.slice(0,passingTap.indexOf('# suites'))});
  assert.equal(r.status,1,r.stdout+r.stderr);assert.match(r.stdout,/Missing final summary count/);
});
for (const [mode,message] of [
  ['child-signal',/Test child terminated by signal SIGTERM/],
  ['spawn-error',/Test child spawn failure.*ENOENT/],
  ['spawn-throw',/Test child spawn failure.*SYNTHETIC_SYNCHRONOUS_SPAWN_FAILURE/],
  ['output-open-error',/TAP output failure.*EISDIR/],
  ['output-write-error',/TAP output failure.*ENOSPC/],
  ['output-close-error',/TAP output failure.*EIO/],
  ['checker-spawn-error',/Checker spawn failure.*ENOENT/],
  ['checker-signal',/Checker terminated by signal SIGTERM/]
]) test('CI runner repair: wrapper rejects '+mode+' with useful diagnostics',()=>{
  const r=runFixture({name:'wrapper-'+mode,kind:'wrapper',mode});
  assert.equal(r.error,undefined,'fixture subprocess must complete without timeout');
  assert.notEqual(r.status,0,r.stdout+r.stderr);assert.match(r.stderr,message);
  if(mode==='output-open-error')assert.equal(r.selected,null,'do not launch tests without an output file');
  if(mode==='child-signal'||mode==='output-close-error')assert.ok(r.captured.includes(passingTap),'passing TAP alone is insufficient');
});
test('CI runner repair: wrapper preserves unsuccessful checker status',()=>{
  const r=runFixture({name:'wrapper-checker-exit',kind:'wrapper',mode:'checker-exit'});assert.equal(r.status,9,r.stdout+r.stderr);
});
test('CI runner repair: wrapper preserves original child status when checker also fails',()=>{
  const r=runFixture({name:'wrapper-two-failures',kind:'wrapper',childExit:7,tap:'TAP version 13\n'});
  assert.equal(r.status,7,r.stdout+r.stderr);assert.match(r.stderr,/Test child exited with code 7/);assert.match(r.stdout,/Missing final summary count/);
});
