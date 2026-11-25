// Per service type, the frozen-job results each approval version authorizes
// (see server/quote-engine-vnext/approvalVersions.js). approval-history.json
// maps type -> approval version -> frozen-job id -> result hash.
//
//   node verification/engine-fingerprint/approval-history.mjs --record
//
// records frozen jobs added since the last run under each type's current
// approval version. It refuses to overwrite a recorded result: a changed result
// needs a new approval version for that service type, which pauses that type's
// approved services until each owner re-approves.
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {corpusInputs, engineResultCorpus} from './fingerprint.mjs';
import {APPROVAL_VERSIONS} from '../../server/quote-engine-vnext/approvalVersions.js';

export const APPROVAL_HISTORY_FILE = new URL('./approval-history.json', import.meta.url);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 24);

export function currentApprovalResults() {
  const rows = corpusInputs(), results = engineResultCorpus(rows), byType = {};
  rows.forEach((row, index) => {
    const type = row.input.serviceType;
    (byType[type] ||= {})[row.id] = hash(results[index]);
  });
  return byType;
}
export function loadApprovalHistory() {
  return existsSync(APPROVAL_HISTORY_FILE) ? JSON.parse(readFileSync(APPROVAL_HISTORY_FILE, 'utf8')) : {};
}
// Problems with the recorded history for the current code: changed results
// under an unchanged approval version, and frozen jobs not yet recorded.
export function approvalHistoryProblems(history = loadApprovalHistory(), current = currentApprovalResults()) {
  const changed = [], unrecorded = [];
  for (const [type, version] of Object.entries(APPROVAL_VERSIONS)) {
    const recorded = history[type]?.[String(version)] || {};
    for (const [id, result] of Object.entries(current[type] || {})) {
      if (!Object.hasOwn(recorded, id)) unrecorded.push(type + ' ' + id);
      else if (recorded[id] !== result) changed.push(type + ' ' + id);
    }
  }
  return {changed, unrecorded};
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1] && process.argv.includes('--record')) {
  const history = loadApprovalHistory(), current = currentApprovalResults();
  const {changed} = approvalHistoryProblems(history, current);
  if (changed.length) {
    console.error('Results changed under an unchanged approval version. Bump these service types in APPROVAL_VERSIONS:\n' +
      [...new Set(changed.map(item => item.split(' ')[0]))].join('\n'));
    process.exit(1);
  }
  for (const [type, version] of Object.entries(APPROVAL_VERSIONS)) {
    const recorded = ((history[type] ||= {})[String(version)] ||= {});
    for (const [id, result] of Object.entries(current[type] || {})) if (!Object.hasOwn(recorded, id)) recorded[id] = result;
  }
  writeFileSync(APPROVAL_HISTORY_FILE, JSON.stringify(history, null, 1) + '\n');
  console.log('Recorded approval history for', Object.keys(APPROVAL_VERSIONS).length, 'service types.');
}
