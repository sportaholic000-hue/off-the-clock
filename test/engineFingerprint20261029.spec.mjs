import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';
import {corpusInputs,engineResultCorpus,engineFingerprint} from '../verification/engine-fingerprint/fingerprint.mjs';

// Saved owner approvals name the ENGINE_VERSION that priced them. Any change in
// what the frozen corpus is charged, or in why a quote is held, must come with a
// new ENGINE_VERSION so those approvals go stale instead of silently pricing new
// formulas. To record a deliberate change: bump ENGINE_VERSION and add its
// fingerprint to verification/engine-fingerprint/history.json.
const history=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/history.json',import.meta.url),'utf8'));

test('the current engine version has a recorded fingerprint and the engine still produces it',()=>{
  assert.ok(Object.hasOwn(history,ENGINE_VERSION),`No fingerprint recorded for ${ENGINE_VERSION}.`);
  assert.equal(engineFingerprint(),history[ENGINE_VERSION],'Quote results changed without a new ENGINE_VERSION.');
});
test('each recorded version names different quote results',()=>{
  const values=Object.values(history);
  assert.equal(new Set(values).size,values.length,'Two engine versions record the same results; only one is needed.');
});
test('the frozen corpus covers every service and both outcomes, and a one-cent minimum change moves the fingerprint',()=>{
  const rows=corpusInputs(),corpus=engineResultCorpus(rows);
  assert.ok(rows.length>=700);
  assert.ok(new Set(rows.map(row=>row.input.serviceType)).size>=20);
  for(const type of ['INSTANT_ESTIMATE_READY','ESTIMATE_REQUIRES_REVIEW'])assert.ok(corpus.some(row=>row.resultType===type),type);
  const changed=structuredClone(rows),mow=changed.find(row=>row.id==='audit:minimum-tax-TAX_MATERIALS-true');
  mow.input.businessDefaults.minimumJobPrice+=1;
  assert.notEqual(engineFingerprint(engineResultCorpus(changed)),engineFingerprint(corpus));
});
