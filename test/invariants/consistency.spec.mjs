// Consistency gate (owner strategy, November 24, 2026). See harness.mjs.
// 1. Every harness finding must already be in knownFindings.json. A new
//    disagreement between readiness and the real quote fails the gate.
// 2. A known finding that no longer occurs must be removed from the list, so
//    the list can only shrink as fixes land.
// 3. Every frozen outcome (status, ready/held, cents) must be unchanged.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runAll,findingKey} from './harness.mjs';

const read=name=>JSON.parse(readFileSync(new URL(name,import.meta.url),'utf8'));
const frozen=read('frozenOutcomes.json'),known=read('knownFindings.json');
const result=runAll();

test('harness covers every service it is meant to start from',()=>{
  assert.ok(result.bases.length>=40,'only '+result.bases.length+' base services are live and ready: '+result.bases.join(', '));
  assert.ok(Object.keys(result.outcomes).length>=1000);
});
test('no NEW readiness/quote disagreement or crash (NO_THROW, SILENT_LIVE, BLOCKED_QUOTES)',()=>{
  const allowed=new Set(known.map(findingKey));
  const fresh=result.findings.filter(f=>!allowed.has(findingKey(f)));
  assert.deepEqual(fresh.map(f=>findingKey(f)+' — '+f.detail),[],'New findings. Fix the code; do not add them to knownFindings.json without an owner ruling.');
});
test('fixed findings are removed from knownFindings.json (the list only shrinks)',()=>{
  const now=new Set(result.findings.map(findingKey));
  assert.deepEqual(known.map(findingKey).filter(k=>!now.has(k)),[],'These findings no longer occur: run update-snapshot.mjs with the audit item as the reason.');
});
test('every frozen outcome is unchanged',()=>{
  const keys=[...new Set([...Object.keys(frozen),...Object.keys(result.outcomes)])].sort();
  const changed=keys.filter(k=>JSON.stringify(frozen[k])!==JSON.stringify(result.outcomes[k]));
  assert.deepEqual(changed.slice(0,40).map(k=>k+': '+JSON.stringify(frozen[k]??null)+' → '+JSON.stringify(result.outcomes[k]??null)),[],changed.length+' outcomes changed. Read every one; if each is intended, record why with update-snapshot.mjs.');
});
