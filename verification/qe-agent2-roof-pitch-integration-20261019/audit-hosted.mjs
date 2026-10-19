// Extend the existing integration checks; keep their implementation unchanged.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditHostedParserLogs } from '../qe-agent2-pi00-integration-20261019/audit-hosted.mjs';

export function auditRoofPitchHosted(raw, data, expectedSha, priorAudit = auditHostedParserLogs) {
  const result = priorAudit(raw, data.required, data.additional, data.punctuation, data.retained, data.mapping);
  const lines = raw.split('\n').map(s => s.replace(/\uFEFF/g, '')
    .replace(/^\d{4}-\d{2}-\d{2}T\S+\s/, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r$/, ''));
  const records = {};
  for (const [gate, command] of Object.entries({ strict: 'npm run test:quote', full: 'npm test' })) {
    const start = lines.findIndex(s => s === `##[group]Run ${command}`);
    const end = lines.findIndex((s, i) => i > start && s.startsWith('##[group]Run '));
    records[gate] = lines.slice(start, end < 0 ? undefined : end)
      .map(s => s.match(/^\s*ok (\d+) - (.*)$/)).filter(Boolean)
      .map(m => ({ number: Number(m[1]), name: m[2] }));
  }
  if (data.a1.length !== 113 || new Set(data.a1).size !== 113) {
    result.problems.push({ type: 'a1_expected_name_inventory', count: data.a1.length, unique: new Set(data.a1).size });
  }
  const rows = data.a1.map(name => {
    const gates = {};
    for (const gate of ['strict', 'full']) {
      const numbers = records[gate].filter(r => r.name === name).map(r => r.number);
      gates[gate] = { expected: 1, observed_name: name, numbers, literal: true };
      if (numbers.length !== 1) result.problems.push({ type: 'a1_name_occurrences', name, gate, expected: 1, numbers });
    }
    return { source_name: name, gates };
  });
  result.groups.a1_roof_pitch = {
    required: data.a1.length, expectations: { strict: 1, full: 1 }, rows,
    passed: rows.every(r => Object.values(r.gates).every(g => g.numbers.length === 1))
  };
  for (const [gate, expected] of Object.entries({ strict: 6040, full: 7671, browser: 12 })) {
    const actual = result.gates[gate]?.summary?.tests;
    if (actual !== expected) result.problems.push({ type: 'combined_gate_total', gate, expected, actual });
  }
  const strictReceipt = result.gates.strict.receipt;
  if (strictReceipt.length !== 1 || strictReceipt[0] !== 'PASS: quote engine and price book gate (289 files, 6040/6040 tests, zero skips).') {
    result.problems.push({ type: 'strict_selection_receipt', observed: strictReceipt });
  }
  result.expected_sha = expectedSha;
  result.log_contains_expected_head = /^[a-f0-9]{40}$/.test(expectedSha || '') && raw.includes(expectedSha);
  if (!result.log_contains_expected_head) result.problems.push({ type: 'missing_expected_head', expectedSha });
  result.passed = result.problems.length === 0;
  return result;
}

export function requiredNameData() {
  const json = relative => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));
  const names = relative => [...readFileSync(new URL(relative, import.meta.url), 'utf8')
    .matchAll(/^\s*ok \d+ - (.*)$/gm)].map(m => m[1]);
  const punctuation = names('../qe-agent4-import-punctuation-20261019/after-new.tap');
  const retained = names('../qe-agent4-import-punctuation-20261019/retained-758.tap');
  if (punctuation.length !== 116 || new Set(punctuation).size !== 116 || retained.length !== 758 || new Set(retained).size !== 758) {
    throw Error('Frozen parser name inventories do not match their independently recorded counts');
  }
  return {
    required: json('../qe-agent2-pi00-integration-20261019/required-test-names.json'),
    additional: json('../qe-agent2-pi00-integration-20261019/additional-test-names.json'),
    punctuation, retained,
    mapping: json('../qe-agent2-parser-integration-20261019/hosted-log-name-mapping.json'),
    a1: json('./a1-required-test-names.json').names
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4) throw Error('Usage: node audit-hosted.mjs TEST_JOB_LOG EXACT_MERGE_SHA');
  const result = auditRoofPitchHosted(readFileSync(process.argv[2], 'utf8'), requiredNameData(), process.argv[3]);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
