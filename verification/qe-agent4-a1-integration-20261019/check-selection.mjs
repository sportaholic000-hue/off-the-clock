import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {allSpecFiles,quotePricebookSpecFiles} from '../../scripts/testSelection.mjs';
const before=JSON.parse(readFileSync('verification/qe-agent4-import-integration-20261019/selection.json','utf8')).after;
const after={strict:quotePricebookSpecFiles(process.cwd()),full:allSpecFiles(process.cwd())};
const added=['test/qeAgent1RemainingDependenciesReproduction20261019.browser.spec.mjs','test/qeAgent1RemainingPublicIntake20261019.browser.spec.mjs'];
for(const gate of ['strict','full'])assert.deepEqual(after[gate],[...before[gate],...added].sort());
for(const file of ['test/qeAgent3RepresentativePublicIntake20261019.browser.spec.mjs','test/qeAgent3WidgetDependencies20261019.browser.spec.mjs']){
  assert.ok(after.strict.includes(file));assert.ok(after.full.includes(file));
}
assert.equal(after.strict.length,294);assert.equal(after.full.length,368);
writeFileSync('verification/qe-agent4-a1-integration-20261019/selection.json',JSON.stringify({before,after,addedBoth:added},null,2)+'\n');
console.log(JSON.stringify({strict:after.strict.length,full:after.full.length,addedBoth:added}));
