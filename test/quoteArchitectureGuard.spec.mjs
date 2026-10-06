import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ENGINE_VERSION} from '../server/src/quoteDoneBridge.js';

// No money is calculated. A version literal passes architecture validation;
// every forbidden engine path/call must fail before the test-selection step.
const gate=fileURLToPath(new URL('../server/scripts/quote-vnext-gate.js',import.meta.url));
function check(t,source) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'otc-architecture-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'server/src'),{recursive:true});
  fs.writeFileSync(path.join(root,'server/src/quoteDoneBridge.js'),'generateQuoteVNext sanitizeForCustomerVNext');
  fs.writeFileSync(path.join(root,'server/src/customerSummary.js'),'');
  fs.writeFileSync(path.join(root,'server/src/runtimeConfig.js'),source);
  return spawnSync(process.execPath,[gate],{cwd:root,encoding:'utf8'});
}
test('architecture guard accepts a pinned engine version without a module path',t=>{
  const result=check(t,`export const EXPECTED_QUOTE_ENGINE_VERSION = '${ENGINE_VERSION}';`);
  assert.match(result.stdout,/PASS: quotes reach the engine only through quoteDoneBridge/);
  assert.doesNotMatch(result.stderr,/FAIL: quote engine architecture checks/);
  assert.match(result.stderr,/no quote-engine or price-book test files were selected/);
  assert.equal(result.status,1,'the separate empty-test guard must still reject this fixture');
});
for(const source of [
  "import {ENGINE_VERSION} from '../quote-engine-vnext/engine.js';",
  "export {ENGINE_VERSION} from '../quote-engine-vnext/engine.js';",
  "await import('../quote-engine-vnext/engine.js');",
  "require('../quote-engine-vnext/engine.js');",
  'generateQuoteVNext({});',
  "import legacy from '../quoteEngine.js';"
]) test('architecture guard rejects '+source,t=>{
  const result=check(t,source);
  assert.equal(result.status,1);
  assert.match(result.stderr,/FAIL: quote engine architecture checks/);
  assert.doesNotMatch(result.stdout,/PASS: quotes reach the engine/);
});
