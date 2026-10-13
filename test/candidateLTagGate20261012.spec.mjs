import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validateDocuments,validateChecks,validateRemote,fetchChecks,digest,REPO,BRANCH,TAG,DIR} from '../verification/release-candidate-20261012l/check-release-gate.mjs';
const sha='a'.repeat(40),other='b'.repeat(40),manifestText=fs.readFileSync(DIR+'/ci-required-steps.json','utf8'),manifest=JSON.parse(manifestText);
const docs=()=>({reportText:'Synthetic report; not a release',manifestText,markerText:JSON.stringify({ready:true,branch:BRANCH,tag:TAG,reportSha256:digest('Synthetic report; not a release'),requiredStepsSha256:digest(manifestText)})});
const fixture=()=>({manifest,environment:{GITHUB_REPOSITORY:REPO,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/'+BRANCH,GITHUB_SHA:sha,GITHUB_RUN_ID:'42',GITHUB_RUN_ATTEMPT:'1'},run:{id:42,run_attempt:1,head_sha:sha,head_branch:BRANCH,event:'push',repository:{full_name:REPO},path:'.github/workflows/ci.yml',status:'in_progress',conclusion:null},jobs:Object.entries(manifest).map(([name,steps])=>({name,run_id:42,head_sha:sha,status:'completed',conclusion:'success',steps:steps.map(name=>({name,status:'completed',conclusion:'success'}))}))});
test('candidate l tag gate: exact run and all required successful steps allow validation without tag writes',()=>{assert.deepEqual(validateDocuments(docs()),manifest);assert.equal(validateChecks(fixture()).length,Object.values(manifest).flat().length);assert.deepEqual(validateRemote(sha+'\trefs/heads/'+BRANCH,sha),{existing:false});});
for(const [name,change]of[
  ['missing final marker',d=>d.markerText=null],['missing report',d=>d.reportText=''],['changed report',d=>d.reportText+='changed'],['changed manifest',d=>d.manifestText+=' '],['diagnostic marker',d=>d.markerText=d.markerText.replace('true','false')],['wrong marker branch',d=>d.markerText=d.markerText.replace(BRANCH,'main')]
])test('candidate l tag gate refuses '+name,()=>{const d=docs();change(d);assert.throws(()=>validateDocuments(d));});
for(const [name,change]of[
  ['pull request',f=>f.environment.GITHUB_EVENT_NAME='pull_request'],['other branch',f=>f.environment.GITHUB_REF='refs/heads/main'],['other repository',f=>f.environment.GITHUB_REPOSITORY='synthetic/other'],['other run',f=>f.run.id=43],['other attempt',f=>f.run.run_attempt=2],['other SHA',f=>f.run.head_sha=other],['other workflow',f=>f.run.path='.github/workflows/other.yml'],['completed run',f=>f.run.status='completed'],['missing job',f=>f.jobs.pop()],['duplicate job',f=>f.jobs.push(f.jobs[0])],['job from other SHA',f=>f.jobs[0].head_sha=other],['failed job',f=>f.jobs[0].conclusion='failure'],['missing steps',f=>f.jobs[0].steps=null],['missing required step',f=>f.jobs[0].steps.pop()],['duplicate required step',f=>f.jobs[0].steps.push(f.jobs[0].steps[0])],...['skipped','cancelled','failure',null].map(state=>['required step '+state,f=>f.jobs[0].steps[0].conclusion=state]),['unfinished required step',f=>f.jobs[0].steps[0].status='in_progress']
])test('candidate l tag gate refuses '+name,()=>{const f=fixture();change(f);assert.throws(()=>validateChecks(f));});
test('candidate l tag gate refuses advanced branch and existing tag on another commit',()=>{
  assert.throws(()=>validateRemote(other+'\trefs/heads/'+BRANCH,sha));
  assert.throws(()=>validateRemote(sha+'\trefs/heads/'+BRANCH+'\n'+other+'\trefs/tags/'+TAG+'\n'+other+'\trefs/tags/'+TAG+'^{}',sha));
  assert.throws(()=>validateRemote(sha+'\trefs/heads/'+BRANCH+'\n'+sha+'\trefs/tags/'+TAG,sha));
  assert.deepEqual(validateRemote(sha+'\trefs/heads/'+BRANCH+'\n'+other+'\trefs/tags/'+TAG+'\n'+sha+'\trefs/tags/'+TAG+'^{}',sha),{existing:true});
});
test('candidate l tag gate refuses unavailable or incomplete Actions evidence',async()=>{
  await assert.rejects(fetchChecks({token:'SYNTHETIC_NOT_A_KEY',runId:'42',attempt:'1',fetcher:async()=>({ok:false,status:403})}));
  await assert.rejects(fetchChecks({token:'SYNTHETIC_NOT_A_KEY',runId:'42',attempt:'1',fetcher:async()=>({ok:true,json:async()=>({jobs:[],total_count:2})})}));
  await assert.rejects(fetchChecks({token:'',runId:'42',attempt:'1',fetcher:()=>assert.fail('No network without token')}));
});
test('candidate l workflow preserves every starting required step and runs controlled browser checks early',()=>{
  const original=JSON.parse(fs.readFileSync(DIR+'/followup/starting-required-steps.json','utf8'));
  for(const [job,names]of Object.entries(original))for(const name of names)assert.ok(manifest[job].includes(name),'Removed required check: '+name);
  const source=fs.readFileSync('.github/workflows/ci.yml','utf8');
  const early=source.slice(source.indexOf('- name: Owner alerts and dashboard browser regressions'),source.indexOf('- name: Strict quote engine and price book gate'));
  assert.match(early,/node --test test\/ownerAlertRepair20261006\.browser\.spec\.mjs test\/ownerAlertsDelivery20261006\.browser\.spec\.mjs test\/ownerDashboard20261007\.browser\.spec\.mjs/);
  for(const [job,names]of Object.entries(manifest))for(const name of names)assert.ok(source.includes('- name: '+name),'Manifest step has no workflow definition: '+job+'/'+name);
  assert.match(source,/needs: \[test, voice-docker-startup\]/);
  assert.match(source,/Candidate l follow-up required passing names/);
});
