import assert from 'node:assert/strict';
import {spawnSync,execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const directory=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(directory,'../..');
const phase=process.argv[2];
assert.ok(['before-repair','after-repair'].includes(phase),'phase must be before-repair or after-repair');
mkdirSync(directory,{recursive:true});
const args=['--test','--test-reporter=tap','test/qeAgent3WidgetDependencies20261019.spec.mjs'];
const result=spawnSync(process.execPath,args,{cwd:root,encoding:'utf8',env:{...process.env,TMPDIR:process.env.TMPDIR||path.join(path.dirname(root),'tmp')}});
const output=(result.stdout||'')+(result.stderr||'');
writeFileSync(path.join(directory,phase+'.tap'),output);
const binding={
  phase,
  command:[process.execPath,...args],
  head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  tree:execFileSync('git',['write-tree'],{cwd:root,encoding:'utf8'}).trim(),
  branch:execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),
  node:process.version,
  exitCode:result.status,
  signal:result.signal,
  expected:phase==='before-repair'?'non-zero (regressions fail on exact base)':'zero'
};
writeFileSync(path.join(directory,phase+'-source-binding.json'),JSON.stringify(binding,null,2)+'\n');
if(phase==='before-repair')assert.notEqual(result.status,0,'the exact-base regression capture unexpectedly passed');
else assert.equal(result.status,0,output);
console.log(JSON.stringify(binding));
