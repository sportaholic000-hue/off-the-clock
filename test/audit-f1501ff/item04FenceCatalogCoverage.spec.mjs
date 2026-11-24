// Audit f1501ff #4 (November 24, 2026): a fence catalog (fenceOfferings) was
// checked differently from a single fence offering. Expected outcomes, written
// before the fix:
// - with no removal or gate price, the catalog stays live (plain jobs quote)
//   and its scope coverage lists removal and the gate for that fence type and
//   height, as the single offering does;
// - a height row missing its main price is listed by name in the withheld
//   options the owner screen shows;
// - a $0 gate or removal price in a catalog behaves as in a single offering
//   (live; that request held) instead of blocking every fence quote.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {fenceFixture} from '../fenceLaneB20261016Fixture.mjs';
import {fenceOfferingFromLegacy} from '../../server/quote-engine-vnext/fencePricing.js';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

function catalogReplacement(){
  const f=offeringFixture('FENCING_REPLACEMENT','installed'),p=f.ownerPricing.pricing,offer=fenceOfferingFromLegacy(p);
  const {offeringMode,offeringDetails,offeringRates,...common}=p;
  f.ownerPricing.pricing={...common,fenceOfferings:{wood:offer}};f.customerInputs.fenceRunCount=1;
  return {f,rates:offer.heightRows.saved_height.offeringRates};
}
const plain=f=>{const g=structuredClone(f);Object.assign(g.customerInputs,{oldFenceRemoval:false,gates:{}});delete g.customerInputs.removalLengthLF;return g;};
const coverage=(status,label)=>status.scopeCoverage.find(row=>row.label===label);

test('f1501ff #4: catalog replacement with no removal or gate price is live and lists both for the row',()=>{
  const {f,rates}=catalogReplacement();delete rates.removalPerLF;delete rates.gate_walk;
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'QUOTING LIVE');
  for(const [label,field] of [['Fence removal','removalPerLF'],['Installed gate: walk','gate_walk']]){
    const row=coverage(status,label);
    assert.ok(row,label+' missing from scope coverage: '+JSON.stringify(status.scopeCoverage.map(r=>r.label)));
    assert.equal(row.configurationComplete,false);
    assert.deepEqual(row.variants.map(v=>[v.tierName,v.missingFields]),[['wood · 6 ft',['fenceOfferings.wood.heightRows.saved_height.offeringRates.'+field]]]);
    assert.match(row.message,/arrive as leads/);
  }
  assert.equal(generateQuoteVNext(plain(f)).resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(generateQuoteVNext(structuredClone(f)).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('f1501ff #4: a catalog height row missing its main price is named in the withheld rows',()=>{
  const f=fenceFixture('installed');delete f.ownerPricing.pricing.fenceOfferings.wood.heightRows.six.offeringRates.installedFencePerLF;
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'QUOTING LIVE');
  assert.deepEqual(status.failedTierDiagnostics.map(row=>[row.variantLabel,row.missingOwnerFields]),[['wood · over 4 ft up to 6 ft',['offeringRates.installedFencePerLF']]]);
});

test('f1501ff #4: a $0 catalog gate or removal price matches the single offering (live; plain jobs quote $4,000)',()=>{
  for(const field of ['gate_walk','removalPerLF']){
    const {f,rates}=catalogReplacement();rates[field]=0;
    const single=offeringFixture('FENCING_REPLACEMENT','installed');single.ownerPricing.pricing.offeringRates[field]=0;
    assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,vNextServiceStatus(single.ownerPricing,single.businessDefaults).status);
    assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
    const q=generateQuoteVNext(plain(f));
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
    // 100 LF at $40.00 installed = $4,000.00; no gate, no removal.
    assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,400000);
  }
});
