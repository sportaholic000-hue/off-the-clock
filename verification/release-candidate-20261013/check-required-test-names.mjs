import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import names from './required-runner-test-names.json' with {type:'json'};

export function validateRunnerNames(tap) {
  assert.equal(names.length,47,'Pinned runner regression inventory must contain 47 names');
  assert.equal(new Set(names).size,names.length,'Duplicate expected runner name');
  const results=tap.split(/\r?\n/).map(line=>line.match(/^\s*(ok|not ok) \d+ - (.*)$/)).filter(Boolean);
  for(const name of names) {
    const matches=results.filter(result=>result[2]===name||result[2].startsWith(name+' #'));
    assert.equal(matches.length,1,'Missing or ambiguous runner regression: '+name);
    assert.equal(matches[0][1],'ok','Failed runner regression: '+name);
    assert.equal(matches[0][2],name,'Skipped or TODO runner regression: '+name);
  }
  return names;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const passed=validateRunnerNames(fs.readFileSync(process.argv[2]||'test-results.tap','utf8'));
  for(const name of passed)console.log('Confirmed passing: '+name);
  console.log('PASS: all '+passed.length+' pinned CI-runner regression names ran and passed.');
}
