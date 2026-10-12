// Intentional TEST-HARNESS failures only. Never modify the committed rehearsal.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const original=fs.readFileSync(path.join(root,'test/backupRestoreRehearsal.spec.mjs'),'utf8');
const disposable=fs.mkdtempSync(path.join(here,'disposable-'));
const results=[];
function replaceOnce(source,needle,replacement) {
  assert.equal(source.split(needle).length,2,'probe must target exactly one known statement');
  return source.replace(needle,replacement);
}
try {
  let base=original.replace("from './helpers/railwayEnv.mjs'","from '../../../test/helpers/railwayEnv.mjs'")
    .replace("from '../verification/engine-independent/fixtures.mjs'","from '../../engine-independent/fixtures.mjs'")
    .replaceAll("from '../server/","from '../../../server/");
  base=replaceOnce(base,"fileURLToPath(import.meta.url)),'..');","fileURLToPath(import.meta.url)),'../../..');");
  base=replaceOnce(base,"      assert.equal(ownerRead.status,corruption==='missing'?409:503);",
    "      if(corruption==='invalid JSON')assert.fail('INTENTIONAL_OWNER_READ_FAILURE: disposable harness probe only');\n      assert.equal(ownerRead.status,corruption==='missing'?409:503);");
  for(const mode of ['assertion','assertion-and-cleanup']) {
    let source=base;
    if(mode==='assertion-and-cleanup')source=replaceOnce(source,'        evidence.restored=bookObservation(filename);',
      "        evidence.restored=bookObservation(filename);\n        if(corruption==='invalid JSON')throw Object.assign(Error('INTENTIONAL_CLEANUP_FAILURE: after actual restoration'),{code:'INTENTIONAL_CLEANUP_FAILURE'});");
    const filename=path.join(disposable,mode+'.mjs');fs.writeFileSync(filename,source);
    const args=['--experimental-test-module-mocks','--import','./test/pricebookTestEnv.mjs','--test','--test-reporter=tap',filename];
    const execution=spawnSync(process.execPath,args,{cwd:root,env:process.env,encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
    const output=(execution.stdout||'')+(execution.stderr||'');
    fs.writeFileSync(path.join(here,'intentional-'+mode+'.tap'),output);
    fs.writeFileSync(path.join(here,'intentional-'+mode+'.exit'),String(execution.status)+'\n');
    // Save the result before checking it, including an unexpected probe failure.
    const result={mode,command:[process.execPath,...args],exit:execution.status,signal:execution.signal,
      ...(execution.error?{runnerError:execution.error.code}:{}),verified:false};
    results.push(result);fs.writeFileSync(path.join(here,'intentional-results.json'),JSON.stringify(results,null,2)+'\n');
    assert.equal(execution.status,1,'the induced assertion must remain a failing test');
    assert.match(output,/# tests 9\n# suites 0\n# pass 7\n# fail 2\n# cancelled 0\n# skipped 0\n# todo 0/);
    assert.match(output,/error: 'INTENTIONAL_OWNER_READ_FAILURE: disposable harness probe only'/);
    assert.match(output,/\bok 7 - 6\. invalid structure after restore/);
    assert.match(output,/\bok 8 - 6\. missing after restore/);
    const raw=output.match(/^\s*# restore-recovery (.+)$/m)?.[1];assert.ok(raw);assert.ok(raw.length<=32768);
    const evidence=JSON.parse(raw);
    assert.equal(evidence.corruption,'invalid JSON');
    assert.deepEqual(evidence.requests.map(row=>row.label),['owner read','fresh quote','historical replay','changed binding','health']);
    assert.equal(evidence.requests[0].status,503);assert.ok([409,503].includes(evidence.requests[1].status));
    assert.deepEqual(evidence.requests.slice(2).map(row=>row.status),[200,409,200]);
    assert.equal(evidence.replayUnchanged,true);assert.equal(evidence.submissions,2);
    assert.equal(evidence.restored.sha256,evidence.expectedBookHash);
    assert.equal(evidence.child.databasePath,evidence.expectedDatabasePath);
    assert.equal(evidence.child.pricebookPath,path.dirname(evidence.restored.path));
    assert.equal(evidence.finalChild.pid,evidence.child.pid);assert.equal(evidence.finalChild.exitCode,0);
    for(const state of evidence.states.filter(row=>row.instanceId===evidence.child.instanceId)) {
      assert.equal(state.pid,evidence.child.pid);assert.equal(state.port,evidence.child.port);
      assert.equal(state.creationRecorded,true);assert.equal(state.book.exists,true);assert.ok(state.book.sha256);
      assert.ok(state.observedAt);assert.ok(state.startedAt);
    }
    if(mode==='assertion-and-cleanup')assert.equal(evidence.restoreError.code,'INTENTIONAL_CLEANUP_FAILURE');
    else assert.equal(evidence.restoreError,undefined);
    assert.doesNotMatch(output,/Bearer\s+\S+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|Synthetic!Restore2026-Only|Synthetic!Second2026-Only/);
    result.verified=true;result.assertions='expected failure retained; five HTTP observations; exact restoration; next two cases pass; no credential values';
    fs.writeFileSync(path.join(here,'intentional-results.json'),JSON.stringify(results,null,2)+'\n');
    console.log('Verified intentional '+mode+' failure (not a product defect).');
  }
} finally {fs.rmSync(disposable,{recursive:true,force:true});}
