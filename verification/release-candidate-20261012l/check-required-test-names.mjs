import assert from 'node:assert/strict';
import fs from 'node:fs';

const names=[
  'retention expiry: deadline and restart remove live secrets despite injected staging failure',
  'retention expiry: deadline and restart remove live secrets despite held SQLite retention lock',
  'retention expiry: disabled providers do not extend either retry deadline',
  'retention expiry: phone day-30 origin expires at day 60 without advancing calendar or data erasure',
  'retention expiry: WAL reader leaves durable flush work after live deletion and terminal provider failure',
  'retention expiry: local preparation discards expired values before external cleanup and resumes after restart',
  'retention expiry: unusable calendar material is discarded without expiring the still-valid phone retry',
  'retention expiry: preparation cannot reactivate away unfinished physical cleanup'
];
assert.equal(names.length,8);
const lines=fs.readFileSync(process.argv[2]||'test-results.tap','utf8').split('\n');
for(const name of names){
  assert.ok(lines.some(line=>/^ok \d+ - /.test(line)&&line.endsWith(name)),'Missing passing expiry regression: '+name);
  console.log('Confirmed passing: '+name);
}
console.log('PASS: all 8 required expiry regressions ran and passed.');
