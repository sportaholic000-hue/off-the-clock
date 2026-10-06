// Validate the unapplied test-only patch in a private temporary Git index.
// The working tree and shared historical tests are never changed.
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=mkdtempSync(path.join(os.tmpdir(),'synthetic-billing-proposed-'));
const env={...process.env,GIT_INDEX_FILE:path.join(dir,'index')};
function git(args){const r=spawnSync('git',args,{cwd:root,env,encoding:'utf8'});if(r.status!==0)throw Error(r.stderr);return r.stdout;}
try {
 git(['read-tree','HEAD']);git(['apply','--cached','verification/billing-core-repairs-20261006/UNAPPLIED-test-integration.patch']);
 const files=['billingRoutes.spec.mjs','billingStateService.spec.mjs'].map(name=>{
  const text=git(['show',':test/'+name]).replaceAll(/(['"])\.\.\/server\//g,(_,quote)=>quote+pathToFileURL(path.join(root,'server')).href+'/');
  const output=path.join(dir,'billingCoreRepair20261006-proposed-'+name);writeFileSync(output,text);return output;
 });
 const result=spawnSync(process.execPath,['--test','--test-concurrency=1','--test-reporter=tap',...files],{cwd:root,env:process.env,encoding:'utf8',maxBuffer:8*1024*1024});
 process.stdout.write(result.stdout);process.stderr.write(result.stderr);process.exitCode=result.status??1;
 if (!/^# tests /m.test(result.stdout))process.exitCode=1;
} finally {rmSync(dir,{recursive:true,force:true});}
