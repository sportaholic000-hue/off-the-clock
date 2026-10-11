// Owner-authorized, one-shot annotated tag. Both final CI jobs must pass first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const folder='verification/release-candidate-20261011i/';
const gate=JSON.parse(fs.readFileSync(folder+'RELEASE_GATE.json','utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(process.env.GITHUB_REF,'refs/heads/claude/release-candidate-20261011i');
assert.equal(git('rev-parse','HEAD'),process.env.GITHUB_SHA);
assert.equal(gate.tag,'rc-20261011i');
const pins=['c5487b1eab00d4944dd3a53a7264898adb758cde','c3c760345a24d58a303ac989ca8ed518f7cb0134','01710054c08e0f87924328f0406e3a1b9135e08b'];
assert.deepEqual(gate.inputs,pins);
for(const pin of pins)git('merge-base','--is-ancestor',pin,'HEAD');
assert.deepEqual(git('show','-s','--format=%P',gate.mergeCommits[0]).split(' '),[pins[0],pins[1]]);
assert.deepEqual(git('show','-s','--format=%P',gate.mergeCommits[1]).split(' '),[gate.mergeCommits[0],pins[2]]);
git('merge-base','--is-ancestor',gate.mergeCommits[1],'HEAD');
assert.match(gate.verifiedSourceCommit,/^[a-f0-9]{40}$/);
git('merge-base','--is-ancestor',gate.verifiedSourceCommit,'HEAD');
for(const file of git('diff','--name-only',gate.verifiedSourceCommit,'HEAD').split('\n').filter(Boolean)){
  assert.ok(file.startsWith(folder),'Source changed after checkpoint verification: '+file);
}
for(const field of ['localNonBrowserFailures','localStandaloneFailures','ownerQueryUnlisted','ownerQueryUnusedExceptions','ownerQueryForbiddenExtractions','routeSourceMismatches'])assert.equal(gate[field],0,field);
assert.equal(gate.checkpointHostedConclusion,'success');
assert.equal(gate.checkpointRailwayDockerSmoke,'pass');
assert.equal(gate.finalReportApprovedForTag,true);
assert.ok(fs.readFileSync(folder+'REPORT.md','utf8').includes('Release candidate i'));
console.log('Final report gate verified; final test and both Docker proofs already succeeded.');
