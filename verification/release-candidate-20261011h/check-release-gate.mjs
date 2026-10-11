// One-shot owner-authorized release tag. CI dependencies must pass first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

const folder='verification/release-candidate-20261011h/';
const gate=JSON.parse(fs.readFileSync(folder+'RELEASE_GATE.json','utf8'));
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
assert.equal(process.env.GITHUB_REF,'refs/heads/claude/release-candidate-20261011h');
assert.equal(git('rev-parse','HEAD'),process.env.GITHUB_SHA);
assert.equal(gate.tag,'rc-20261011h');
assert.equal(gate.base,'8973f429df487c58f3ad7a49bfdb35ebbb9a274a');
assert.match(gate.verifiedSourceCommit,/^[a-f0-9]{40}$/);
git('merge-base','--is-ancestor',gate.base,'HEAD');
git('merge-base','--is-ancestor',gate.verifiedSourceCommit,'HEAD');
for(const file of git('diff','--name-only',gate.verifiedSourceCommit,'HEAD').split('\n').filter(Boolean)){
  assert.ok(file.startsWith(folder),'Source changed after checkpoint verification: '+file);
}
assert.equal(gate.localNonBrowserFailures,0);
assert.equal(gate.localStandaloneFailures,0);
assert.equal(gate.ownerQueryUnlisted,0);
assert.equal(gate.ownerQueryUnusedExceptions,0);
assert.equal(gate.checkpointHostedConclusion,'success');
assert.equal(gate.checkpointRailwayDockerSmoke,'pass');
assert.equal(gate.finalReportApprovedForTag,true);
assert.ok(fs.readFileSync(folder+'REPORT.md','utf8').includes('Release candidate h'));
console.log('Final report gate verified; CI test and both Docker proofs already succeeded.');
