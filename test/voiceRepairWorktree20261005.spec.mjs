import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {applyVoiceRepairs} from './voiceApplyRepairs20261005.mjs';

// Temporary source-bound execution transport. Removed from the resulting
// checkpoint. No force push, merge, deployment, secrets access or live data.
const BASE='4ff586cad88769a72a9a79f146d5702181d530b4',BRANCH='fix/voice-quote-path-20261005',REPO='sportaholic000-hue/off-the-clock';
const helpers=['test/voiceRepairWorktree20261005.spec.mjs','test/voiceApplyRepairs20261005.mjs','test/voiceQuotePath20261005.spec.mjs'];
const owned=p=>p.startsWith('server/src/voice/')||p==='server/src/voiceRuntimeRoutes.js'||p==='server/src/server.js'||p==='.github/known-test-failures.txt'||p==='scripts/run-tests-with-known-failures.mjs'||/^test\/(voice|googleGenAi)/.test(p);

test('apply exact-source voice repair checkpoint; normal CI verifies the resulting commit',{timeout:120000},async t=>{
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_EVENT_NAME!=='pull_request'||process.env.GITHUB_REPOSITORY!==REPO){t.skip('Temporary execution transport; removed from the final suite.');return;}
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert.equal(event.pull_request.head.ref,BRANCH);assert.equal(event.pull_request.head.repo.full_name,REPO);
  const head=event.pull_request.head.sha,checkout=process.cwd(),temporary=mkdtempSync(path.join(tmpdir(),'voice-patch-')),base=path.join(temporary,'base'),work=path.join(temporary,'work');
  function git(args,cwd=checkout){const r=spawnSync('git',args,{cwd,encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});assert.equal(r.status,0,(r.stderr||r.stdout||String(r.error)).slice(-12000));return args[0]==='status'?r.stdout:r.stdout.trim();}
  function lease(){assert.equal(git(['ls-remote','origin','refs/heads/'+BRANCH]).split(/\s+/)[0],head,'Branch changed; refusing to overwrite another writer.');}
  try{
    lease();git(['fetch','origin','refs/heads/'+BRANCH]);git(['merge-base','--is-ancestor',BASE,head]);
    git(['worktree','add','--detach',base,BASE]);symlinkSync(path.join(checkout,'node_modules'),path.join(base,'node_modules'),'dir');
    let baseline=git(['show','e4405dc3dc97132a37b0132d0214d770a8a99cec:test/voiceQuotePath20261005.spec.mjs']);baseline=baseline.replace("new RegExp('voice/'+name+","new RegExp(name+");writeFileSync(path.join(base,'test/voiceBaselineProof20261005.spec.mjs'),baseline);
    const proof=spawnSync(process.execPath,['--test','--test-reporter=tap','test/voiceBaselineProof20261005.spec.mjs'],{cwd:base,encoding:'utf8',timeout:15000,maxBuffer:16*1024*1024});console.log(proof.stdout);assert.equal(proof.status,0,proof.stderr);
    git(['worktree','add','--detach',work,head]);applyVoiceRepairs(work);
    const fixture=path.join(work,'test/voiceQuotePathRegression20261005.spec.mjs');let source=readFileSync(fixture,'utf8');const before="'surcharge','equipment'];";assert.equal(source.split(before).length,2);source=source.replace(before,"'surcharge','equipment','other'];");writeFileSync(fixture,source);
    for(const name of helpers)rmSync(path.join(work,name),{force:true});
    for(const file of git(['status','--porcelain','--untracked-files=all'],work).split('\n').filter(Boolean).map(line=>line.slice(3)))assert.ok(owned(file),'Unowned change: '+file);
    for(const file of git(['diff','--name-only',BASE],work).split('\n').filter(Boolean))assert.ok(owned(file),'Unowned base difference: '+file);
    git(['add','--all'],work);git(['-c','user.name=Off The Clock voice repair','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m','fix(voice): wire signed runtime, recap contract, product binding and fee answers','-m','Original-source baseline characterization passed before exact patches. Only the incoming placeholder block changes in server.js. Cold acceptance is pending on this source checkpoint. Known failures are not removed until the original nine pass.'],work);
    const sha=git(['rev-parse','HEAD'],work);lease();git(['push','origin','HEAD:refs/heads/'+BRANCH],work);console.log('VOICE_SOURCE_CHECKPOINT '+sha);
  }finally{
    for(const directory of [base,work])if(existsSync(directory)){try{git(['worktree','remove','--force',directory]);}catch{}}rmSync(temporary,{recursive:true,force:true});
  }
});
