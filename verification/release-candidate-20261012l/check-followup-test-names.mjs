import assert from 'node:assert/strict';
import fs from 'node:fs';
const names=[
  'owner alert retry: paused worker renders PENDING, accepts once and never resends',
  'owner alert retry: worker before refresh renders BLOCKED, accepts once and never resends',
  'owner alert scheduling: opt-in paused worker preserves PENDING until explicit real-worker dispatch',
  'CI summary: complete passing inputs',
  'CI summary: failed TAP with checker absent',
  'CI summary: inputs absent after earlier failure',
  'candidate l tag gate: exact run and all required successful steps allow validation without tag writes',
  'candidate l tag gate refuses missing final marker',
  'candidate l tag gate refuses advanced branch and existing tag on another commit',
  'candidate l tag gate refuses unavailable or incomplete Actions evidence',
  'candidate l workflow preserves every starting required step and runs controlled browser checks early'
];
const lines=fs.readFileSync(process.argv[2]||'test-results.tap','utf8').split('\n');
for(const name of names){assert.ok(lines.some(line=>/^\s*ok \d+ - /.test(line)&&line.endsWith(name)),'Missing passing follow-up regression: '+name);console.log('Confirmed passing: '+name);}
console.log('PASS: all '+names.length+' required follow-up names ran and passed.');
