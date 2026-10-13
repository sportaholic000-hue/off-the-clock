import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
export const REPO='sportaholic000-hue/off-the-clock';
export const BRANCH='claude/release-candidate-20261012l';
export const TAG='rc-20261012l';
export const DIR='verification/release-candidate-20261012l';
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function validateDocuments({markerText,reportText,manifestText}){
  assert.ok(markerText,'Explicit committed final-candidate marker missing');
  assert.ok(reportText?.trim(),'Committed REPORT.md missing or empty');
  const marker=JSON.parse(markerText),manifest=JSON.parse(manifestText);
  assert.equal(marker.ready,true,'Diagnostic checkpoint is not eligible');
  assert.equal(marker.branch,BRANCH);assert.equal(marker.tag,TAG);
  assert.equal(marker.reportSha256,digest(reportText),'Report changed after final-candidate authorization');
  assert.equal(marker.requiredStepsSha256,digest(manifestText),'Required manifest changed after final-candidate authorization');
  assert.deepEqual(Object.keys(manifest).sort(),['test','voice-docker-startup']);
  for(const [job,names]of Object.entries(manifest)){
    assert.ok(Array.isArray(names)&&names.length>0,'Empty required job: '+job);
    assert.ok(names.every(n=>typeof n==='string'&&n.trim()),'Invalid required step name');
    assert.equal(new Set(names).size,names.length,'Duplicate manifest names');
  }
  for(const name of ['Owner alerts and dashboard browser regressions','Candidate l controlled owner-alert browser reproduction','Candidate l harness and CI safety regressions','Candidate l shared HTTP fixture consumers and alert worker regressions','Strict quote engine and price book gate','Full test suite','Candidate l expiry regressions and required passing names','No failures beyond the known list','Publish test summary to claude/ci-results (push events only)','Production dependency audit'])assert.ok(manifest.test.includes(name),'Missing mandatory anchor: '+name);
  assert.equal(manifest['voice-docker-startup'].length,4,'All four Docker proofs are required');
  return manifest;
}
export function validateChecks({environment,run,jobs,manifest}){
  const e=environment;
  assert.equal(e.GITHUB_REPOSITORY,REPO);assert.equal(e.GITHUB_EVENT_NAME,'push');assert.equal(e.GITHUB_REF,'refs/heads/'+BRANCH);
  assert.match(e.GITHUB_SHA,/^[0-9a-f]{40}$/);
  assert.equal(String(run.id),e.GITHUB_RUN_ID);assert.equal(String(run.run_attempt),e.GITHUB_RUN_ATTEMPT);
  assert.equal(run.head_sha,e.GITHUB_SHA);assert.equal(run.head_branch,BRANCH);assert.equal(run.event,'push');
  assert.equal(run.repository?.full_name,REPO);assert.equal(run.path,'.github/workflows/ci.yml');
  assert.equal(run.status,'in_progress','Current tagging run must still be in progress');
  assert.equal(run.conclusion,null);assert.ok(Array.isArray(jobs));
  const results=[];
  for(const [name,required]of Object.entries(manifest)){
    const matches=jobs.filter(j=>j.name===name);assert.equal(matches.length,1,'Missing or ambiguous job: '+name);
    const job=matches[0];assert.equal(String(job.run_id),e.GITHUB_RUN_ID);assert.equal(job.head_sha,e.GITHUB_SHA);
    assert.equal(job.status,'completed',name+' incomplete');assert.equal(job.conclusion,'success',name+' did not succeed');
    assert.ok(Array.isArray(job.steps),'Unavailable steps: '+name);
    for(const stepName of required){
      const steps=job.steps.filter(s=>s.name===stepName);assert.equal(steps.length,1,'Missing or ambiguous required step: '+stepName);
      assert.equal(steps[0].status,'completed','Incomplete: '+stepName);assert.equal(steps[0].conclusion,'success','Not successful: '+stepName);
      results.push({job:name,step:stepName,status:'completed',conclusion:'success'});
    }
  }
  return results;
}
export function validateRemote(text,sha){
  const refs=new Map();
  for(const line of text.trim().split('\n').filter(Boolean)){
    const [value,ref,...extra]=line.split(/\s+/);assert.equal(extra.length,0);assert.match(value,/^[0-9a-f]{40}$/);
    assert.ok(['refs/heads/'+BRANCH,'refs/tags/'+TAG,'refs/tags/'+TAG+'^{}'].includes(ref),'Unexpected remote ref');assert.ok(!refs.has(ref),'Duplicate remote ref');refs.set(ref,value);
  }
  assert.equal(refs.get('refs/heads/'+BRANCH),sha,'Remote candidate advanced or is unavailable');
  if(refs.has('refs/tags/'+TAG)||refs.has('refs/tags/'+TAG+'^{}')){
    assert.ok(refs.has('refs/tags/'+TAG),'Missing tag object');assert.equal(refs.get('refs/tags/'+TAG+'^{}'),sha,'Existing tag is different or not annotated; never replace it');
    return {existing:true};
  }
  return {existing:false};
}
export async function fetchChecks({token,runId,attempt,fetcher=fetch}){
  assert.ok(token,'Actions authentication unavailable');assert.match(runId,/^\d+$/);assert.match(attempt,/^\d+$/);
  async function get(suffix){
    const response=await fetcher('https://api.github.com/repos/'+REPO+suffix,{headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(30000)});
    assert.ok(response.ok,'Required Actions evidence unavailable: HTTP '+response.status);return response.json();
  }
  const run=await get('/actions/runs/'+runId),jobs=[];
  for(let page=1;;page++){
    assert.ok(page<=100,'Actions jobs pagination exceeded bound');
    const result=await get('/actions/runs/'+runId+'/attempts/'+attempt+'/jobs?per_page=100&page='+page);
    assert.ok(Array.isArray(result.jobs),'Actions jobs unavailable');jobs.push(...result.jobs);
    if(result.jobs.length<100){assert.equal(jobs.length,result.total_count,'Incomplete Actions job inventory');break;}
  }
  return {run,jobs};
}
async function main(){
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
  const committed=path=>execFileSync('git',['show','HEAD:'+DIR+'/'+path],{encoding:'utf8'});
  assert.equal(git('rev-parse','HEAD'),process.env.GITHUB_SHA,'Checkout is not tested SHA');
  const manifest=validateDocuments({markerText:committed('FINAL_CANDIDATE.json'),reportText:committed('REPORT.md'),manifestText:committed('ci-required-steps.json')});
  const evidence=await fetchChecks({token:process.env.GH_TOKEN,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT});
  const results=validateChecks({environment:process.env,...evidence,manifest});
  for(const result of results)console.log('Required success: '+result.job+' / '+result.step);
  const remote=()=>git('ls-remote','origin','refs/heads/'+BRANCH,'refs/tags/'+TAG,'refs/tags/'+TAG+'^{}');
  const before=validateRemote(remote(),process.env.GITHUB_SHA);
  if(before.existing){console.log('Existing immutable annotated tag already verified on exact tested SHA; no mutation.');return;}
  git('config','user.name','github-actions[bot]');git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
  git('tag','-a',TAG,process.env.GITHUB_SHA,'-m',`Candidate l; exact SHA ${process.env.GITHUB_SHA}; required checks passed in run ${process.env.GITHUB_RUN_ID}. Independent audits remain required.`);
  assert.equal(validateRemote(remote(),process.env.GITHUB_SHA).existing,false,'Tag appeared during validation; refuse publication');
  git('push','origin','refs/tags/'+TAG); // No force, deletion or replacement path.
  const after=remote();assert.equal(validateRemote(after,process.env.GITHUB_SHA).existing,true,'Published tag not verified');
  console.log(after);console.log('Immutable candidate-l tag verified; no merge or deployment performed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
