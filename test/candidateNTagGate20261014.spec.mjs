import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateBookingNames} from '../verification/release-candidate-20261014n/check-required-test-names.mjs';
import bookingNames from '../verification/release-candidate-20261014n/required-booking-test-names.json' with {type:'json'};
import {validateDocuments,validateChecks,validateRemote,fetchChecks,digest,REPO,BRANCH,TAG,DIR} from '../verification/release-candidate-20261014n/check-release-gate.mjs';
const sha='a'.repeat(40),other='b'.repeat(40),manifestText=fs.readFileSync(DIR+'/ci-required-steps.json','utf8'),manifest=JSON.parse(manifestText);
const docs=()=>({reportText:'Synthetic report; not a release',manifestText,markerText:JSON.stringify({ready:true,branch:BRANCH,tag:TAG,reportSha256:digest('Synthetic report; not a release'),requiredStepsSha256:digest(manifestText)})});
const fixture=()=>({manifest,environment:{GITHUB_REPOSITORY:REPO,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_SHA:sha,GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'1'},run:{name:'CI',id:42,run_attempt:1,head_sha:sha,head_branch:BRANCH,event:'push',repository:{full_name:REPO},path:'.github/workflows/ci.yml',status:'in_progress',conclusion:null},jobs:Object.entries(manifest).map(([name,steps])=>({name,run_id:42,head_sha:sha,status:'completed',conclusion:'success',steps:steps.map(name=>({name,status:'completed',conclusion:'success'}))}))});
test('candidate n tag gate: exact run and all required successful steps allow validation without tag writes',()=>{assert.deepEqual(validateDocuments(docs()),manifest);assert.equal(validateChecks(fixture()).length,Object.values(manifest).flat().length);assert.deepEqual(validateRemote(sha+'\trefs/heads/'+BRANCH,sha),{existing:false});});
for(const [name,change]of[
  ['missing final marker',d=>d.markerText=null],['missing report',d=>d.reportText=''],['changed report',d=>d.reportText+='changed'],['changed manifest',d=>d.manifestText+=' '],['diagnostic marker',d=>d.markerText=d.markerText.replace('true','false')],['wrong marker branch',d=>d.markerText=d.markerText.replace(BRANCH,'main')]
])test('candidate n tag gate refuses '+name,()=>{const d=docs();change(d);assert.throws(()=>validateDocuments(d));});
for(const [name,change]of[
  ['pull request',f=>f.environment.GITHUB_EVENT_NAME='pull_request'],['other branch',f=>f.environment.GITHUB_REF='refs/heads/main'],['other repository',f=>f.environment.GITHUB_REPOSITORY='synthetic/other'],['other run',f=>f.run.id=43],['other attempt',f=>f.run.run_attempt=2],['other SHA',f=>f.run.head_sha=other],['other workflow',f=>f.run.path='.github/workflows/other.yml'],['completed run',f=>f.run.status='completed'],['missing job',f=>f.jobs.pop()],['duplicate job',f=>f.jobs.push(f.jobs[0])],['job from other SHA',f=>f.jobs[0].head_sha=other],['failed job',f=>f.jobs[0].conclusion='failure'],['missing steps',f=>f.jobs[0].steps=null],['missing required step',f=>f.jobs[0].steps.pop()],['duplicate required step',f=>f.jobs[0].steps.push(f.jobs[0].steps[0])],...['skipped','cancelled','failure',null].map(state=>['required step '+state,f=>f.jobs[0].steps[0].conclusion=state]),['unfinished required step',f=>f.jobs[0].steps[0].status='in_progress']
])test('candidate n tag gate refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>validateChecks(f));});
test('candidate n tag gate refuses advanced branch and existing tag on another commit',()=>{
  assert.throws(()=>validateRemote(other+'\trefs/heads/'+BRANCH,sha));
  assert.throws(()=>validateRemote(sha+'\trefs/heads/'+BRANCH+'\n'+other+'\trefs/tags/'+TAG+'\n'+other+'\trefs/tags/'+TAG+'^{}',sha));
  assert.throws(()=>validateRemote(sha+'\trefs/heads/'+BRANCH+'\n'+sha+'\trefs/tags/'+TAG,sha));
  assert.deepEqual(validateRemote(sha+'\trefs/heads/'+BRANCH+'\n'+other+'\trefs/tags/'+TAG+'\n'+sha+'\trefs/tags/'+TAG+'^{}',sha),{existing:true});
});
test('candidate n tag gate refuses unavailable or incomplete Actions evidence',async()=>{
  await assert.rejects(fetchChecks({token:'SYNTHETIC_NOT_A_KEY',runId:'42',attempt:'1',fetcher:async()=>({ok:false,status:403})}));
  await assert.rejects(fetchChecks({token:'SYNTHETIC_NOT_A_KEY',runId:'42',attempt:'1',fetcher:async()=>({ok:true,json:async()=>({jobs:[],total_count:2})})}));
  await assert.rejects(fetchChecks({token:'',runId:'42',attempt:'1',fetcher:()=>assert.fail('No network without token')}));
});

// Even a rehashed marker cannot authorize removal of an inherited or new requirement.
for(const [job,names] of Object.entries(manifest))for(const name of names) {
  test('candidate n tag gate refuses manifest omission: '+name,()=>{
    const d=docs(),changed=JSON.parse(d.manifestText);
    changed[job]=changed[job].filter(n=>n!==name);
    d.manifestText=JSON.stringify(changed);
    const marker=JSON.parse(d.markerText);marker.requiredStepsSha256=digest(d.manifestText);
    d.markerText=JSON.stringify(marker);
    assert.throws(()=>validateDocuments(d),/Missing .*requirement/);
  });
}
for(const name of ['Candidate n booking repair and tag qualification regressions','Candidate n confirms every booking service-end regression passed']) {
  for(const state of ['missing','failure','skipped','cancelled',null])test('candidate n tag gate refuses '+state+' evidence for '+name,()=>{
    const f=fixture(),job=f.jobs.find(j=>j.name==='test');
    if(state==='missing')job.steps=job.steps.filter(s=>s.name!==name);
    else job.steps.find(s=>s.name===name).conclusion=state;
    assert.throws(()=>validateChecks(f));
  });
}
test('candidate n tag gate binds workflow name and job run identity',()=>{
  const wrongName=fixture();wrongName.run.name='Other';assert.throws(()=>validateChecks(wrongName));
  const wrongJob=fixture();wrongJob.jobs[0].run_id=43;assert.throws(()=>validateChecks(wrongJob));
});
test('candidate n manifest preserves all 27 inherited requirements and adds both new checks',()=>{
  const inherited=JSON.parse(fs.readFileSync('verification/release-candidate-20261013/ci-required-steps.json','utf8'));
  assert.equal(Object.values(inherited).flat().length,27);
  for(const [job,names] of Object.entries(inherited))for(const name of names)assert.ok(manifest[job].includes(name));
  assert.equal(Object.values(manifest).flat().length,29);
});
test('candidate n workflow preserves all 27 complete inherited blocks with only the authorized branch extension',()=>{
  const source=fs.readFileSync('.github/workflows/ci.yml','utf8');
  const contracts=JSON.parse(fs.readFileSync(DIR+'/inherited-step-contracts.json','utf8'));
  const inherited=JSON.parse(fs.readFileSync('verification/release-candidate-20261013/ci-required-steps.json','utf8'));
  assert.deepEqual(Object.keys(contracts).sort(),Object.values(inherited).flat().sort());
  const blocks=new Map();
  for(const part of source.split(/(?=^      - (?:name:|uses:))/m)) {
    const match=part.match(/^      - name: (.+)\n/);if(!match)continue;
    const block=[];
    for(const line of part.split('\n')) {if(line&&!line.startsWith('      '))break;block.push(line);}
    assert.ok(!blocks.has(match[1])||!Object.values(manifest).flat().includes(match[1]),'Ambiguous required step');
    blocks.set(match[1],block.join('\n').trimEnd()+'\n');
  }
  for(const [name,original] of Object.entries(contracts)) {
    const expected=original.replace(/^(        if: .*refs\/heads\/.*)$/m,"$1 || github.ref == 'refs/heads/"+BRANCH+"'");
    assert.equal(blocks.get(name),expected,'Changed inherited command/condition: '+name);
  }
  const early=blocks.get('Candidate n booking repair and tag qualification regressions');
  assert.equal(early,"      - name: Candidate n booking repair and tag qualification regressions\n        if: github.ref == 'refs/heads/"+BRANCH+"'\n        run: node --experimental-test-module-mocks --import ./test/pricebookTestEnv.mjs --test --test-reporter=tap test/bookingServiceEnd20261014.spec.mjs test/candidateNTagGate20261014.spec.mjs\n");
  assert.ok(source.indexOf(early)<source.indexOf('- name: Strict quote engine and price book gate'));
  assert.equal(blocks.get('Candidate n confirms every booking service-end regression passed'),"      - name: Candidate n confirms every booking service-end regression passed\n        if: github.ref == 'refs/heads/"+BRANCH+"'\n        run: node verification/release-candidate-20261014n/check-required-test-names.mjs test-results.tap\n");
  assert.ok(source.indexOf('- name: Candidate n confirms every booking service-end regression passed')>source.indexOf('- name: Full test suite'));
  const job=source.slice(source.indexOf('  tag-candidate-n:'));
  assert.match(job,/github.event_name == 'push' && github.ref == 'refs\/heads\/claude\/release-candidate-20261014n'/);
  assert.match(job,/needs\.test\.result == 'success' && needs\.voice-docker-startup\.result == 'success'/);
  assert.match(job,/needs: \[test, voice-docker-startup\]/);
  assert.match(job,/contents: write\s+actions: read/);
  assert.match(job,/if \[ ! -f verification\/release-candidate-20261014n\/FINAL_CANDIDATE.json \]/);
  assert.match(job,/node verification\/release-candidate-20261014n\/check-release-gate.mjs/);
  assert.doesNotMatch(job,/continue-on-error|--force|git tag/);
});

const passingNames=()=>bookingNames.map((name,i)=>'ok '+(i+1)+' - '+name).join('\n');
test('candidate n booking-name guard accepts all 17 unique successful names without imposing a full-suite total',()=>{
  assert.deepEqual(validateBookingNames(passingNames()+'\nok 99999 - unrelated new tag regression\n'),bookingNames);
});
for(const [label,change]of[
  ['missing',tap=>tap.split('\n').slice(1).join('\n')],
  ['failed',tap=>tap.replace(/^ok /,'not ok ')],
  ['skipped',tap=>tap.replace(/\n/,' # SKIP\n')],
  ['TODO',tap=>tap.replace(/\n/,' # TODO\n')],
  ['duplicate',tap=>tap+'\n'+tap.split('\n')[0]],
  ['unavailable',()=> '']
])test('candidate n booking-name guard refuses '+label+' regression evidence',()=>assert.throws(()=>validateBookingNames(change(passingNames()))));

test('candidate n keeps the completed booking repair and its 17-case source byte-identical',()=>{
  const pinned=JSON.parse(fs.readFileSync(DIR+'/repair-source-hashes.json','utf8'));
  assert.equal(pinned.commit,'64e2229c8ee4819eba7a641c5c5ac04438fc4916');
  for(const [path,hash] of Object.entries(pinned.sha256))assert.equal(digest(fs.readFileSync(path)),hash,path);
  assert.equal(bookingNames.length,17);assert.equal(new Set(bookingNames).size,17);
});
test('candidate n validates committed final-candidate document hashes',()=>{
  assert.deepEqual(validateDocuments({markerText:fs.readFileSync(DIR+'/FINAL_CANDIDATE.json','utf8'),reportText:fs.readFileSync(DIR+'/REPORT.md','utf8'),manifestText}),manifest);
});
for(const [name,change] of [
  ['run repository mismatch',f=>f.run.repository.full_name='synthetic/other'],
  ['run branch mismatch',f=>f.run.head_branch='main'],
  ['run event mismatch',f=>f.run.event='workflow_dispatch'],
  ['run already concluded',f=>f.run.conclusion='success'],
  ['invalid commit identity',f=>f.environment.GITHUB_SHA='short'],
  ['unfinished job',f=>f.jobs[0].status='in_progress'],
  ...['skipped','cancelled',null].map(state=>['job '+state,f=>f.jobs[0].conclusion=state])
])test('candidate n tag gate refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>validateChecks(f));});
test('candidate n tag gate refuses duplicate or unexpected remote refs',()=>{
  const branch=sha+'\trefs/heads/'+BRANCH;
  assert.throws(()=>validateRemote(branch+'\n'+branch,sha));
  assert.throws(()=>validateRemote(branch+'\n'+sha+'\trefs/heads/main',sha));
});
test('candidate n fetches the requested attempt and complete paginated job inventory',async()=>{
  const f=fixture(),urls=[],first=Array.from({length:100},(_,id)=>({id}));
  const result=await fetchChecks({token:'SYNTHETIC_NOT_A_KEY',runId:'42',attempt:'3',fetcher:async url=>{
    urls.push(url);
    return {ok:true,json:async()=>url.includes('/jobs?')?{jobs:url.endsWith('page=1')?first:[{id:100}],total_count:101}:f.run};
  }});
  assert.equal(result.jobs.length,101);
  assert.deepEqual(urls,['https://api.github.com/repos/'+REPO+'/actions/runs/42',
    'https://api.github.com/repos/'+REPO+'/actions/runs/42/attempts/3/jobs?per_page=100&page=1',
    'https://api.github.com/repos/'+REPO+'/actions/runs/42/attempts/3/jobs?per_page=100&page=2']);
});
