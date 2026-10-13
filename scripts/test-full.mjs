// `npm test`: the same full suite and the same known-failure check as CI.
//
// 1. Runs `node --test` over every test/*.spec.js and test/*.spec.mjs file
//    (CI's command), writing stdout and stderr to test-results.tap while
//    echoing them.
// 2. Runs .github/scripts/check-test-results.mjs on that file. It fails on any
//    failure, skip, cancelled test or TODO, and when the run produced no
//    test summary. Historical known failures are diagnostic only.
//
// Like CI, the full suite needs the client build (npm --prefix client run build)
// and Playwright with Chromium for the browser specs:
//   npm install --no-save playwright@1.56.0 && npx playwright install chromium
// Missing prerequisites are reported up front; the affected tests then fail and
// the check fails, exactly as they would in CI.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { allSpecFiles } from './testSelection.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { finished } from 'node:stream/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tapFile = path.join(root, process.env.TEST_RESULTS_FILE || 'test-results.tap');
const files = allSpecFiles(root);

const missing = [];
// Production start-up (and its tests) requires these three build outputs.
if (['index.html', 'widget.js', 'widget-app.js'].some(name => !existsSync(path.join(root, 'client', 'dist', name)))) missing.push('client build (run: npm --prefix client run build)');
try { createRequire(path.join(root, 'package.json')).resolve('playwright'); }
catch { missing.push('Playwright for the browser specs (run: npm install --no-save playwright@1.56.0 && npx playwright install chromium)'); }
for (const item of missing) console.error(`[npm test] Missing prerequisite: ${item}. Tests that need it will fail.`);

async function main() {
  let run;
  const out = createWriteStream(tapFile);
  // Observe errors immediately, including open/write/close failures. Never accept
  // an old or partially written report as evidence of this invocation's success.
  const outputDone = finished(out).then(() => null, error => error);
  out.on('error', error => {
    console.error(`[npm test] TAP output failure (${error.code || error.name}): ${error.message}`);
    if (run && run.exitCode === null && run.signalCode === null) run.kill('SIGTERM');
  });
  await new Promise(resolve => { out.once('open', resolve); out.once('error', resolve); });
  if (out.errored) { await outputDone; return 1; }
  // Node 22 requires this flag for the existing calendar/service-area module mocks.
  // Running those tests is preferable to their fallback skipped placeholders.
  // Match the strict gate's sequential files: synchronous catalog timing assertions
  // must not compete with unrelated CPU-heavy tests in other worker processes.
  let childError, result;
  try {
    run = spawn(process.execPath, ['--experimental-test-module-mocks', '--import', './test/pricebookTestEnv.mjs', '--test-concurrency=1', '--test', '--test-reporter=tap', ...files], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    run.on('error', error => { childError = error; });
    for (const stream of [run.stdout, run.stderr]) stream.on('data', chunk => {
      if (!out.destroyed) out.write(chunk);
      process.stdout.write(chunk);
    });
    result = await new Promise(resolve => run.once('close', (code, signal) => resolve({code, signal})));
  } catch (error) {
    childError = error;
    result = {code: null, signal: null};
  }
  out.end();
  const outputError = await outputDone;
  const childFailed = Boolean(childError) || result.code !== 0 || result.signal !== null;
  const failureCode = Number.isInteger(result.code) && result.code > 0 ? result.code : 1;
  if (childError) console.error(`[npm test] Test child spawn failure (${childError.code || childError.name}): ${childError.message}`);
  if (result.signal) console.error(`[npm test] Test child terminated by signal ${result.signal}`);
  else if (result.code !== 0) console.error(`[npm test] Test child exited with code ${result.code}`);
  if (outputError) return failureCode;
  // Still show checker diagnostics after an unsuccessful child, but a passing
  // checker can never override that child's exit code or termination signal.
  const check = spawnSync(process.execPath, ['.github/scripts/check-test-results.mjs', tapFile], { cwd: root, stdio: 'inherit' });
  if (check.error) console.error(`[npm test] Checker spawn failure (${check.error.code || check.error.name}): ${check.error.message}`);
  if (check.signal) console.error(`[npm test] Checker terminated by signal ${check.signal}`);
  if (childFailed) return failureCode;
  if (check.error || check.signal || check.status === null) return 1;
  return check.status;
}
try { process.exitCode = await main(); }
catch (error) { console.error(`[npm test] Runner failure (${error.code || error.name}): ${error.message}`); process.exitCode = 1; }
