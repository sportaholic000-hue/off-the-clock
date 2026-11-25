// New-issues audit of v53 (major): every ENGINE_VERSION change paused every
// approved service at every business until its owner re-approved, including
// changes that move no price. Approvals now carry a per-service-type approval
// version. Expected, written before the change:
// - a service approved now stays live when only the engine version changes;
// - it pauses ("Pricing rules changed ...") when its approval version changes;
// - a receipt from before approval versions is current only on its own engine
//   version (it pauses once, at the next engine change);
// - the gate: every service type has an approval version, every frozen job is
//   recorded under it, and no recorded result changed without a bump.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {SERVICE_TYPES, ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {APPROVAL_VERSIONS, approvalVersionFor, approvalReceiptCurrent} from '../server/quote-engine-vnext/approvalVersions.js';
import {approvalHistoryProblems, loadApprovalHistory, currentApprovalResults} from '../verification/engine-fingerprint/approval-history.mjs';

test('approval receipts follow the service type approval version, not the engine version',()=>{
  const type='FENCING_INSTALL',version=approvalVersionFor(type);
  assert.equal(approvalReceiptCurrent({engineVersion:'some-older-engine',approvalVersion:version},type,ENGINE_VERSION),true);
  assert.equal(approvalReceiptCurrent({engineVersion:ENGINE_VERSION,approvalVersion:version+1},type,ENGINE_VERSION),false);
  assert.equal(approvalReceiptCurrent({engineVersion:ENGINE_VERSION,approvalVersion:version},'NOT_A_TYPE',ENGINE_VERSION),false);
  // Receipts from before approval versions.
  assert.equal(approvalReceiptCurrent({engineVersion:ENGINE_VERSION},type,ENGINE_VERSION),true);
  assert.equal(approvalReceiptCurrent({engineVersion:'some-older-engine'},type,ENGINE_VERSION),false);
  assert.equal(approvalReceiptCurrent(null,type,ENGINE_VERSION),false);
});
test('every service type has an approval version and its frozen jobs are recorded unchanged',()=>{
  assert.deepEqual(Object.keys(APPROVAL_VERSIONS).sort(),[...SERVICE_TYPES].sort());
  for(const type of SERVICE_TYPES)assert.ok(Number.isSafeInteger(APPROVAL_VERSIONS[type])&&APPROVAL_VERSIONS[type]>0,type);
  const current=currentApprovalResults();
  for(const type of SERVICE_TYPES)assert.ok(Object.keys(current[type]||{}).length>0,'no frozen jobs for '+type);
  const {changed,unrecorded}=approvalHistoryProblems(loadApprovalHistory(),current);
  assert.deepEqual(changed,[],'Results changed without an approval-version bump for: '+[...new Set(changed.map(item=>item.split(' ')[0]))].join(', '));
  assert.deepEqual(unrecorded,[],'Frozen jobs not recorded; run node verification/engine-fingerprint/approval-history.mjs --record');
});
test('a changed result under an unchanged approval version is caught',()=>{
  const history=structuredClone(loadApprovalHistory()),type='LANDSCAPING_MOWING',version=String(APPROVAL_VERSIONS[type]);
  const id=Object.keys(history[type][version])[0];history[type][version][id]='0'.repeat(24);
  assert.deepEqual(approvalHistoryProblems(history).changed,[type+' '+id]);
});
