import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import names from './required-booking-test-names.json' with {type:'json'};

export function validateBookingNames(tap) {
  assert.equal(names.length,17,'Pinned booking service-end regression inventory must contain 17 names');
  assert.equal(new Set(names).size,names.length,'Duplicate expected booking service-end name');
  const results=tap.split(/\r?\n/).map(line=>line.match(/^\s*(ok|not ok) \d+ - (.*)$/)).filter(Boolean);
  for(const name of names) {
    const matches=results.filter(result=>result[2]===name||result[2].startsWith(name+' #'));
    assert.equal(matches.length,1,'Missing or ambiguous booking service-end regression: '+name);
    assert.equal(matches[0][1],'ok','Failed booking service-end regression: '+name);
    assert.equal(matches[0][2],name,'Skipped or TODO booking service-end regression: '+name);
  }
  return names;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const passed=validateBookingNames(fs.readFileSync(process.argv[2]||'test-results.tap','utf8'));
  for(const name of passed)console.log('Confirmed passing: '+name);
  console.log('PASS: all '+passed.length+' pinned booking service-end regression names ran and passed.');
}
