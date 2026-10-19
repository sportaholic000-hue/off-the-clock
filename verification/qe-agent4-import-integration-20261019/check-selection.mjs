import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {allSpecFiles,quotePricebookSpecFiles} from '../../scripts/testSelection.mjs';

const root=process.cwd(),parent=process.argv[2];
assert.ok(parent,'Provide the combined parent source snapshot');
const before={strict:quotePricebookSpecFiles(parent),full:allSpecFiles(parent)};
const after={strict:quotePricebookSpecFiles(root),full:allSpecFiles(root)};
const added=[
  'test/voiceAgent4ConditionExtensions20261019.spec.mjs',
  'test/voiceAgent4ImportConditionBoundaries20261019.spec.mjs',
  'test/voiceAgent4ImportConditionR1R2Followup20261019.spec.mjs',
  'test/voiceAgent4ImportNineVariants20261019.spec.mjs'
];
assert.deepEqual(after.strict,before.strict);
assert.deepEqual(after.full,[...before.full,...added].sort());
for(const file of added){assert.ok(after.full.includes(file));assert.ok(!after.strict.includes(file));}
for(const file of ['test/qeAgent3WidgetDependencies20261019.spec.mjs','test/qeAgent3WidgetDependencies20261019.browser.spec.mjs','test/qeAgent3RepresentativePublicIntake20261019.browser.spec.mjs']){
  assert.ok(after.strict.includes(file),file+' must remain in strict');
  assert.ok(after.full.includes(file),file+' must remain in full');
}
writeFileSync(path.join(root,'verification/qe-agent4-import-integration-20261019/selection.json'),JSON.stringify({before,after,addedFullOnly:added},null,2)+'\n');
console.log(JSON.stringify({before:{strict:before.strict.length,full:before.full.length},after:{strict:after.strict.length,full:after.full.length},addedFullOnly:added}));
