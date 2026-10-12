import assert from 'node:assert/strict';
import fs from 'node:fs';

const lines=fs.readFileSync(process.argv[2],'utf8').split('\n');
const contracts=[
  'rejects late admission without changing its pending retry',
  'holds worker exclusion through verification and publication',
  'snapshot contention drains and shuts down without deadlock'
];
for(const stream of ['daily','continuous'])for(const contract of contracts){
  const name='backup coordination: '+stream+' '+contract;
  assert.ok(lines.some(line=>/^ok \d+ - /.test(line)&&line.endsWith(name)),'Missing passing result: '+name);
  console.log('Confirmed passing: '+name);
}
