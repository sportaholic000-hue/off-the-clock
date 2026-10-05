import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync,symlinkSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {applyVoiceRepairs} from './voiceApplyRepairs20261005.mjs';

// Temporary execution transport, removed from the repair checkpoint. The only
// permitted remote write is a non-force push to the user's requested branch.
const BASE='4ff586cad88769a72a9a79f146d5702181d530b4',BRANCH='fix/voice-quote-path-20261005',REPO='sportaholic000-hue/off-the-clock';
const helpers=['test/voiceRepairWorktree20261005.spec.mjs','test/voiceApplyRepairs20261005.mjs','test/voiceQuotePath20261005.spec.mjs'];
const owned=p=>p.startsWith('server/src/voice/')||p==='server/src/voiceRuntimeRoutes.js'||p==='server/src/server.js'||p==='.github/known-test-failures.txt'||p==='scripts/run-tests-with-known-failures.mjs'||/^test\/(voice|googleGenAi)/.test(p);

test('isolated voice repair checkpoint and cold acceptance execution',{timeout:1500000},async t=>{
  if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_EVENT_NAME!=='pull_request'||process.env.GITHUB_REPOSITORY!==REPO){t.skip('One-use hosted execution transport; not in the final suite.');return;}
  const event=JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  assert.equal(event.pull_request.head.ref,BRANCH);assert.equal(event.pull_request.head.repo.full_name,REPO);
  const expectedHead=event.pull_request.head.sha,checkout=process.cwd(),temp=mkdtempSync(path.join(tmpdir(),'otc-voice-repair-')),base=path.join(temp,'base'),work=path.join(temp,'work');
  const storage=path.join(temp,'synthetic-data');mkdirSync(storage,{recursive:true});
  const env={...process.env,OTC_VOICE_WORKTREE_CHILD:'1',NODE_ENV:'test',APP_DATA_DIR:storage,DB_PATH:path.join(storage,'app.sqlite'),DATABASE_PATH:path.join(storage,'app.sqlite'),PRICEBOOK_PATH:path.join(storage,'pricebooks'),ALLOW_PROVIDER_WRITES:'false',PROVIDER_WRITES_ENABLED:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',JWT_SECRET:'synthetic-voice-repair-signing-key-only-not-live',BOOKING_SLOT_TOKEN_SECRET:'synthetic-voice-repair-booking-key-only-not-live',CREDENTIAL_ENCRYPTION_KEY:'11'.repeat(32)};
  const results=[];
  function raw(command,args,cwd=checkout,timeout=120000){const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:128*1024*1024});if(r.status!==0)throw Error(command+' '+args.join(' ')+' failed: '+String(r.stderr||r.stdout||r.error).slice(-12000));return command==='git'&&args[0]==='status'?r.stdout:r.stdout.trim();}
  function run(label,command,args,cwd=work,timeout=600000){
    const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout,maxBuffer:128*1024*1024});const output=(r.stdout||'')+'\n'+(r.stderr||'');const counts={};
    for(const name of ['tests','pass','fail','cancelled','skipped','todo']){const matches=[...output.matchAll(new RegExp('^# '+name+' (\\d+)','gm'))];if(matches.length)counts[name]=Number(matches.at(-1)[1]);}
    const result={label,exit:r.status,signal:r.signal,counts};results.push(result);console.log('VOICE_REPAIR_STAGE '+JSON.stringify(result));
    if(r.status!==0){const lines=output.split('\n');for(let i=0;i<lines.length;i++)if(/^not ok /.test(lines[i]))console.log(lines.slice(i,Math.min(i+55,lines.length)).join('\n'));console.log('VOICE_REPAIR_TAIL '+output.slice(-14000));}return r.status===0;
  }
  function unchangedHead(){assert.equal(raw('git',['ls-remote','origin','refs/heads/'+BRANCH]).split(/\s+/)[0],expectedHead,'Another writer changed the authorized branch.');}
  let patched=false,published=null;
  try{
    unchangedHead();raw('git',['fetch','origin','refs/heads/'+BRANCH]);raw('git',['merge-base','--is-ancestor',BASE,expectedHead]);raw('git',['worktree','add','--detach',base,BASE]);symlinkSync(path.join(checkout,'node_modules'),path.join(base,'node_modules'),'dir');
    let baseline=raw('git',['show','e4405dc3dc97132a37b0132d0214d770a8a99cec:test/voiceQuotePath20261005.spec.mjs']);baseline=baseline.replace("new RegExp('voice/'+name+","new RegExp(name+");writeFileSync(path.join(base,'test/voiceBaselineProof20261005.spec.mjs'),baseline);
    assert.ok(run('baseline-original-source','node',['--test','test/voiceBaselineProof20261005.spec.mjs'],base),'Baseline must pass before applying repairs.');
    raw('git',['worktree','add','--detach',work,expectedHead]);applyVoiceRepairs(work);patched=true;for(const name of helpers)rmSync(path.join(work,name),{force:true});
    let okay=run('cold-npm-ci','npm',['ci','--no-audit','--no-fund']);if(okay)okay=run('cold-build','npm',['run','build']);if(okay)okay=run('browser-test-dependency','npm',['install','--no-save','--no-audit','--no-fund','playwright@1.56.0']);
    const focus=['test/voiceSecurity.spec.mjs','test/voicePersistence.spec.mjs','test/googleGenAiLiveAdapter.spec.mjs','test/voicePromptCompiler.spec.mjs','test/voiceWebSocketServer.spec.mjs','test/voiceQuotePathRegression20261005.spec.mjs'];
    if(okay)okay=run('original-nine-and-voice-acceptance','node',['--import','./test/pricebookTestEnv.mjs','--test','--test-reporter=tap',...focus]);
    if(okay){writeFileSync(path.join(work,'.github/known-test-failures.txt'),'');okay=run('full-npm-test-zero-tolerance','npm',['test']);}if(okay)okay=run('strict-quote-gate','npm',['run','test:quote']);
    for(const file of raw('git',['status','--porcelain','--untracked-files=all'],work).split('\n').filter(Boolean).map(line=>line.slice(3)))assert.ok(owned(file),'Unowned change: '+file);
    for(const file of raw('git',['diff','--name-only',BASE],work).split('\n').filter(Boolean))assert.ok(owned(file),'Unowned base difference: '+file);
    raw('git',['add','--all'],work);raw('git',['-c','user.name=Off The Clock voice repair','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-m',okay?'fix(voice): restore guarded quote path with cold synthetic acceptance':'fix(voice): repair checkpoint; acceptance failures remain','-m',JSON.stringify({base:BASE,results})],work);
    published=raw('git',['rev-parse','HEAD'],work);unchangedHead();raw('git',['push','origin','HEAD:refs/heads/'+BRANCH],work);console.log('VOICE_REPAIR_PUBLISHED '+JSON.stringify({sha:published,complete:okay,results}));assert.ok(okay,'Repair checkpoint pushed with reported acceptance failures, not approved.');
  }finally{
    console.log('VOICE_REPAIR_SUMMARY '+JSON.stringify({base:BASE,parent:expectedHead,patched,published,results}));for(const directory of [base,work])if(existsSync(directory)){try{raw('git',['worktree','remove','--force',directory]);}catch{}}rmSync(temp,{recursive:true,force:true});
  }
});
