// Quote engine + price book gate (npm run test:quote).
//
// 1. Architecture: customer quotes reach the engine only through the application
//    bridge. Only the files listed below may import the engine, only the bridge
//    may call generateQuoteVNext, the bridge must sanitize what customers see,
//    and no production file may use the retired legacy quote engine.
// 2. Runs every quote-engine and price-book test file (selected by what the file
//    imports, so new regression files are included automatically) and requires
//    zero failures. Voice tests are outside this gate.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { run } from 'node:test';
import { tap } from 'node:test/reporters';
import { pipeline } from 'node:stream/promises';
import { quotePricebookSpecFiles } from '../../scripts/testSelection.mjs';

const filesUnder = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const path = join(directory, entry.name);
  return entry.isDirectory() ? filesUnder(path) : [path];
});
const failures = [];
const ENGINE_IMPORTERS = new Map([
  ['server/src/quoteDoneBridge.js', 'the application bridge'],
  ['server/src/customerSummary.js', 'fence-height display formatting only']
]);
for (const path of filesUnder('server/src').filter(file => /\.[cm]?js$/.test(file))) {
  const source = readFileSync(path, 'utf8');
  if (/quote-engine-vnext/.test(source) && !ENGINE_IMPORTERS.has(path)) failures.push(`${path} imports the quote engine directly; route it through quoteDoneBridge.js`);
  if (/generateQuoteVNext\s*\(/.test(source) && path !== 'server/src/quoteDoneBridge.js') failures.push(`${path} calls generateQuoteVNext outside the bridge`);
  if (/from\s+['"]\.\.\/quoteEngine\.js['"]/.test(source)) failures.push(`${path} imports the retired legacy quote engine`);
}
const bridge = readFileSync('server/src/quoteDoneBridge.js', 'utf8');
for (const name of ['generateQuoteVNext', 'sanitizeForCustomerVNext']) if (!bridge.includes(name)) failures.push(`quoteDoneBridge.js no longer uses ${name}`);
if (readFileSync('server/src/customerSummary.js', 'utf8').match(/quote-engine-vnext\/(?!configuredOfferings\.js)/)) failures.push('customerSummary.js may only use the fence-height formatter');
if (failures.length) {
  console.error('FAIL: quote engine architecture checks');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}
console.log('PASS: quotes reach the engine only through quoteDoneBridge.js; customers receive sanitized results; no legacy engine in production.');

const files = quotePricebookSpecFiles(process.cwd());
if(!files.length){console.error('FAIL: no quote-engine or price-book test files were selected.');process.exit(1);}
console.log(`Running ${files.length} quote-engine and price-book test files; failures, skips, TODOs and missing tests fail the gate.`);
const expected=new Set(files.map(file=>resolve(file))),completed=new Set(),gateFailures=[];
let summary;
async function* inspect(events){
  for await(const event of events){
    if(event.type==='test:summary'){
      const data=event.data,c=data.counts;
      if(data.file){
        completed.add(resolve(data.file));
        if(!data.success||!c.tests||c.failed||c.cancelled||c.skipped||c.todo)gateFailures.push(data.file+' did not complete every test successfully.');
      }else summary=data;
    }
    yield event;
  }
}
try{
  await pipeline(run({files,execArgv:['--import',resolve('test/pricebookTestEnv.mjs')]}),inspect,tap,process.stdout,{end:false});
}catch(error){gateFailures.push('Unable to complete the test runner: '+error.message);}
for(const file of expected)if(!completed.has(file))gateFailures.push('Missing test results: '+file);
if(!summary||!summary.success||!summary.counts.tests||summary.counts.failed||summary.counts.cancelled||summary.counts.skipped||summary.counts.todo)gateFailures.push('The complete test summary is missing or contains unsuccessful tests.');
if(gateFailures.length){for(const message of gateFailures)console.error('FAIL: '+message);process.exitCode=1;}
else console.log(`PASS: quote engine and price book gate (${completed.size} files, ${summary.counts.passed}/${summary.counts.tests} tests, zero skips).`);
