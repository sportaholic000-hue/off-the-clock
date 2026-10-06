import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// No money is calculated. Expected: both selected files run once, with no
// overlap; the complete report contains two passes and zero failures/skips.
test('full runner isolates test files so catalog timing checks do not compete for CPU', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-full-scheduling-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (name, source) => {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), source);
  };
  for (const name of ['scripts/test-full.mjs', '.github/scripts/check-test-results.mjs']) {
    write(name, fs.readFileSync(path.join(project, name), 'utf8'));
  }
  write('.github/known-test-failures.txt', '');
  write('scripts/testSelection.mjs', "export const allSpecFiles = () => ['test/alpha.spec.mjs', 'test/beta.spec.mjs'];\n");
  write('test/pricebookTestEnv.mjs', '');
  for (const name of ['index.html', 'widget.js', 'widget-app.js']) write('client/dist/' + name, '');
  for (const name of ['alpha', 'beta']) write('test/' + name + '.spec.mjs', `
    import test from 'node:test';
    import fs from 'node:fs';
    import {setTimeout} from 'node:timers/promises';
    test('${name}', async () => {
      fs.mkdirSync('active-test');
      fs.appendFileSync('events.txt', '${name}:start\\n');
      try { await setTimeout(250); }
      finally {
        fs.appendFileSync('events.txt', '${name}:end\\n');
        fs.rmdirSync('active-test');
      }
    });
  `);
  const env = { ...process.env, TEST_RESULTS_FILE: 'test-results.tap' };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['scripts/test-full.mjs'], {
    cwd: root, env, encoding: 'utf8', timeout: 30000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(fs.readFileSync(path.join(root, 'events.txt'), 'utf8').trim().split('\n'),
    ['alpha:start', 'alpha:end', 'beta:start', 'beta:end']);
  const report = fs.readFileSync(path.join(root, 'test-results.tap'), 'utf8');
  for (const [key, value] of Object.entries({ tests: 2, pass: 2, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    assert.match(report, new RegExp('^# ' + key + ' ' + value + '$', 'm'));
  }
});
