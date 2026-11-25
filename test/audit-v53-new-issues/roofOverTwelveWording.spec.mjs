// New-issues audit of v53: with the over-12/12 installation addition entered
// and only the removal addition blank, the owner screen said every roof over
// 12/12 goes to review, but such a roof with no old roofing to remove quotes.
// Expected, written before the change:
// - both blank: "...until you enter the installation and removal additions...";
// - removal only blank: "Roofs steeper than 12/12 that need old roofing removed
//   go to review until you enter the removal addition for pitch over 12/12.";
// - installation only blank: "...until you enter the installation addition...".
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {baseServices} from '../invariants/harness.mjs';
import {vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

const message=extra=>{const f=structuredClone(baseServices().find(b=>b.id==='roof-steep-7-9').f);Object.assign(f.ownerPricing.pricing,extra);
  return vNextServiceStatus(f.ownerPricing,f.businessDefaults).scopeCoverage.find(r=>r.key==='pitch_over_twelve')?.message;};
test('the over-12/12 row names only the roofs that go to review',()=>{
  assert.equal(message({}),'Roofs steeper than 12/12 go to review until you enter the installation and removal additions for pitch over 12/12.');
  assert.equal(message({pitchInstallationAdderOverTwelve:0.5}),'Roofs steeper than 12/12 that need old roofing removed go to review until you enter the removal addition for pitch over 12/12.');
  assert.equal(message({pitchRemovalAdderOverTwelve:0.6}),'Roofs steeper than 12/12 go to review until you enter the installation addition for pitch over 12/12.');
});
