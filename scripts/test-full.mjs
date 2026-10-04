// `npm test`: the same full suite and the same known-failure check as CI.
//
// 1. Runs `node --test` over every test/*.spec.js and test/*.spec.mjs file
//    (CI's command), writing stdout and stderr to test-results.tap while
//    echoing them.
// 2. Runs .github/scripts/check-test-results.mjs on that file. It fails on any
//    failure not listed in .github/known-test-failures.txt, on cancelled tests,
//    and when the run produced no test summary.
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tapFile = path.join(root, process.env.TEST_RESULTS_FILE || 'test-results.tap');
const files = allSpecFiles(root);

const missing = [];
// Production start-up (and its tests) requires these three build outputs.
if (['index.html', 'widget.js', 'widget-app.js'].some(name => !existsSync(path.join(root, 'client', 'dist', name)))) missing.push('client build (run: npm --prefix client run build)');
try { createRequire(path.join(root, 'package.json')).resolve('playwright'); }
catch { missing.push('Playwright for the browser specs (run: npm install --no-save playwright@1.56.0 && npx playwright install chromium)'); }
for (const item of missing) console.error(`[npm test] Missing prerequisite: ${item}. Tests that need it will fail.`);

const out = createWriteStream(tapFile);
const run = spawn(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
for (const stream of [run.stdout, run.stderr]) stream.on('data', chunk => { out.write(chunk); process.stdout.write(chunk); });
run.on('close', () => out.end(() => {
  const check = spawnSync(process.execPath, ['.github/scripts/check-test-results.mjs', tapFile], { cwd: root, stdio: 'inherit' });
  process.exit(check.status === null ? 1 : check.status);
}));
