// Fails CI on any failure, skip, cancellation, TODO or missing summary.
// Historical known failures are reported but never exempt a failed test.
import { readFileSync } from 'node:fs';
const tap = readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const known = new Set(readFileSync('.github/known-test-failures.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean));
const failed = new Set(tap.filter(l => /^\s*not ok \d+ - /.test(l)).map(l => l.replace(/^\s*not ok \d+ - /, '').replace(/ # .*$/, '').trim()));
const counts = ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
const summary = {}, invalid = [];
let summaryStart = -1;
for (const [index, line] of tap.entries()) {
  const key = line.match(/^# (tests|suites|pass|fail|cancelled|skipped|todo)(?:\s|$)/)?.[1];
  if (!key) continue;
  if (summaryStart === -1) summaryStart = index;
  if (Object.hasOwn(summary, key)) invalid.push(`Duplicate final summary count: ${key}`);
  const value = line.match(/^# \w+ ([0-9]+)$/)?.[1];
  summary[key] = value === undefined ? null : Number(value);
  if (value === undefined || !Number.isSafeInteger(summary[key])) invalid.push(`Invalid final summary count: ${key}`);
}
for (const key of counts) if (!Object.hasOwn(summary, key)) invalid.push(`Missing final summary count: ${key}`);
// A prior completed report cannot qualify a later, unfinished test run.
if (summaryStart !== -1 && tap.slice(summaryStart + 1).some(line => /^\s*(?:TAP version\b|(?:not )?ok \d+\b|\d+\.\.\d+\b|# Subtest:)/.test(line))) {
  invalid.push('Test output continues after the final summary began');
}
const unexpected = [...failed].filter(n => !known.has(n));
const fixed = [...known].filter(n => !failed.has(n));
console.log('Summary:', JSON.stringify(summary));
console.log(`Known failures still failing: ${[...known].filter(n => failed.has(n)).length}/${known.size}`);
for (const n of fixed) console.log(`::notice::Known failure now passes, remove it from the list: ${n}`);
for (const n of unexpected) console.log(`::error::New test failure: ${n}`);
if (invalid.length) {
  for (const message of invalid) console.log('::error::' + message);
  process.exit(1);
}
if (!(summary.tests > 0)) { console.log('::error::No positive completed test count; the test run did not complete'); process.exit(1); }
if (summary.tests !== summary.pass + summary.fail + summary.cancelled + summary.skipped + summary.todo) {
  console.log('::error::Contradictory final summary: outcome counts do not equal tests'); process.exit(1);
}
if (summary.pass !== summary.tests || ['fail','skipped','cancelled','todo'].some(key => summary[key] !== 0) || failed.size) {
  console.log('::error::The full suite requires matching passes and zero failures, skips, cancellations and TODOs'); process.exit(1);
}
process.exit(0);
