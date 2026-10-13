// Fails CI on any failure, skip, cancellation, TODO or missing summary.
// Historical known failures are reported but never exempt a failed test.
import { readFileSync } from 'node:fs';
const tap = readFileSync(process.argv[2], 'utf8').split('\n');
const known = new Set(readFileSync('.github/known-test-failures.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
const failed = new Set(tap.filter(l => /^not ok \d+ - /.test(l)).map(l => l.replace(/^not ok \d+ - /, '').replace(/ # .*$/, '').trim()));
const summary = Object.fromEntries(tap.filter(l => /^# (tests|pass|fail|skipped|cancelled|todo) /.test(l)).map(l => l.slice(2).split(' ')));
const unexpected = [...failed].filter(n => !known.has(n));
const fixed = [...known].filter(n => !failed.has(n));
console.log('Summary:', JSON.stringify(summary));
console.log(`Known failures still failing: ${[...known].filter(n => failed.has(n)).length}/${known.size}`);
for (const n of fixed) console.log(`::notice::Known failure now passes, remove it from the list: ${n}`);
for (const n of unexpected) console.log(`::error::New test failure: ${n}`);
if (Number(summary.cancelled || 0) > 0) { console.log('::error::Tests were cancelled'); process.exit(1); }
// A run that crashed or never started has no summary; that must fail, not pass.
if (!(Number(summary.tests) > 0)) { console.log('::error::No test summary found; the test run did not complete'); process.exit(1); }
if (['fail','skipped','cancelled','todo'].some(key => Number(summary[key] || 0) > 0)) { console.log('::error::The full suite requires zero failures, skips, cancellations and TODOs'); process.exit(1); }
process.exit(unexpected.length ? 1 : 0);
