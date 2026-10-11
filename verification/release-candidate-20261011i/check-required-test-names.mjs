// CI checks the final commit's actual full-suite TAP before the tag job is eligible.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const expected=JSON.parse(fs.readFileSync(new URL('./expected-test-names.json',import.meta.url),'utf8'));
const tap=fs.readFileSync(process.argv[2]||'test-results.tap','utf8');
const passed=new Set([...tap.matchAll(/^ok \d+ - (.*)$/gm)].map(match=>match[1]));
for(const [group,count] of Object.entries({retentionHardening:26,demoFacts:15,scannerDestructuring:68})){
  assert.equal(expected[group].length,count,group+' expected inventory changed');
  assert.equal(new Set(expected[group]).size,count,group+' duplicate name');
  for(const name of expected[group])assert.ok(passed.has(name),'Required passing test missing from final log: '+name);
  console.log('PASS: '+group+' '+count+'/'+count+' expected names found in the full-suite log.');
}
