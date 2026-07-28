import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const productionSources = filesUnder('server/src').filter(path => /\.[cm]?js$/.test(path));
const forbiddenImports = [];
for (const path of productionSources) {
  const source = readFileSync(path, 'utf8');
  if (source.includes('quote-engine-vnext') || source.includes('generateQuoteVNext')) {
    forbiddenImports.push(path);
  }
}

if (forbiddenImports.length) {
  console.error('FAIL: production source imports the isolated vNext candidate:');
  for (const path of forbiddenImports) console.error(`- ${path}`);
  process.exit(1);
}

console.log('PASS: quote-engine-vnext remains isolated from production server/src.');
console.log('Running candidate formula, contract, price-book, and adversarial suites...');

const child = spawn(process.execPath, [
  '--test',
  'test/quoteEngineVNext.spec.js',
  'test/quoteEngineVNextAdversarial.spec.js',
  'test/quoteEngineVNextRepairs.spec.js'
], { stdio: 'inherit' });

child.on('error', error => {
  console.error(`FAIL: unable to start candidate tests: ${error.message}`);
  process.exit(1);
});

child.on('exit', code => {
  if (code !== 0) {
    console.error(`FAIL: quote-engine-vnext audit suite exited ${code}.`);
    process.exit(code || 1);
  }
  console.log('PASS: quote-engine-vnext audit candidate gate completed.');
  console.log('NOTICE: this proves the isolated candidate only; it is not a production cutover approval.');
});
