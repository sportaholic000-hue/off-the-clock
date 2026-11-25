// Owner ruling (November 26, 2026): disclose, do not ask. Roofs steeper than
// 12/12 go to review while the optional over-12/12 installation and removal
// additions are blank, and the owner screen did not say so (two known harness
// findings). Expected, written before the change: the owner coverage lists
// "Roofs steeper than 12/12" with both additions missing; with both entered
// there is no row; the service stays QUOTING LIVE either way.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {baseServices} from '../invariants/harness.mjs';
import {vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

const roof=()=>structuredClone(baseServices().find(b=>b.id==='roof-steep-7-9').f);
test('roofs over 12/12 are listed while their additions are blank',()=>{
  const f=roof(),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(s.status,'QUOTING LIVE');
  const row=s.scopeCoverage.find(r=>r.key==='pitch_over_twelve');assert.ok(row,JSON.stringify(s.scopeCoverage.map(r=>r.key)));
  assert.equal(row.label,'Roofs steeper than 12/12');
  assert.deepEqual(row.variants[0].missingFields.sort(),['pitchInstallationAdderOverTwelve','pitchRemovalAdderOverTwelve']);
  Object.assign(f.ownerPricing.pricing,{pitchInstallationAdderOverTwelve:0.5,pitchRemovalAdderOverTwelve:0.6});
  const t=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(t.status,'QUOTING LIVE');assert.equal(t.scopeCoverage.find(r=>r.key==='pitch_over_twelve'),undefined);
});
