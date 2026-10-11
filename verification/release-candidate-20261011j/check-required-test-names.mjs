import assert from 'node:assert/strict';
import fs from 'node:fs';
const text=fs.readFileSync(process.argv[2],'utf8');
const names=[...fs.readFileSync('test/lockRecoveryRace20261011.spec.mjs','utf8').matchAll(/^test\('([^']+)'/gm)].map(match=>match[1]);
assert.equal(names.length,9);
for(const name of names){assert.ok(text.split('\n').some(line=>/^ok \d+ - /.test(line)&&line.endsWith(name)),'Missing passing result: '+name);console.log('Confirmed passing: '+name);}
