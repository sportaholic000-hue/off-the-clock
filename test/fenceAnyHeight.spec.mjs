import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Owner ruling (October 16): prices belong to explicit height rows; height
// never multiplies a rate. Preserve open height intake and exact inches.
// The expected line cents below are written independently before execution.
process.env.PRICEBOOK_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-fence-height-'));
const bridge = await import('../server/src/quoteDoneBridge.js');
const store = await import('../server/priceBookService.js');
const { getVNextPriceBookMetadata } = await import('../server/quote-engine-vnext/index.js');
const { exactFenceHeight, formatFenceHeight } = await import('../server/quote-engine-vnext/configuredOfferings.js');

const CATEGORIES = ['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all = value => Object.fromEntries(CATEGORIES.map(key => [key, value]));
const defaults = { currency:'CAD', markupPercent:0, markupMode:'markup', overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
  taxMode:'TAX_NONE', taxPercent:0, rangeBufferPercent:0, markupApplies:all(true), peakMonths:[], peakSurchargePercent:0 };
// Exact fractions with BigInt; cents round half up, once per line, like the engine's rule.
const frac = (n, d = 1n) => { const g = (a, b) => b ? g(b, a % b) : a; const k = g(n < 0n ? -n : n, d) || 1n; return [n / k, d / k]; };
const dec = text => { const [w, f = ''] = String(text).split('.'); return frac(BigInt(w + f), 10n ** BigInt(f.length)); };
const mul = (...xs) => xs.reduce(([a, b], [c, d]) => frac(a * c, b * d), [1n, 1n]);
const div = ([a, b], [c, d]) => frac(a * d, b * c);
const cents = ([n, d]) => Number((2n * n + d) / (2n * d));

function live(service) {
  const ownerId = 'fence-height-' + crypto.randomUUID();
  bridge.saveApplicationBook(ownerId, { revision:bridge.readApplicationBook(ownerId).revision, services:[{ source:'MANUAL', active:true, tiers:[],
    feeRules:{ travel:'not_applicable', disposal:'not_applicable', permit:'not_applicable', overhead:'not_applicable' },
    priceBasisByCategory:{ ...all('cost'), addon:'sell_price' }, taxabilityByCategory:all(false), ...service }], defaults });
  let book = store.loadPricebook(ownerId);
  const status = bridge.applicationStatus(book.services[0], book);
  bridge.approveApplicationService(ownerId, book.services[0].id, { revision:bridge.bookRevision(book), confirmConfiguration:true, confirmLegacySettings:true, fields:status.confirmationFields });
  book = store.loadPricebook(ownerId);
  assert.equal(bridge.applicationStatus(book.services[0], book).status, 'QUOTING LIVE');
  return inputs => bridge.calculateApplicationQuote(book, book.services[0], { serviceId:book.services[0].id, customerInputs:inputs }, { ownerId });
}
const fenceId = crypto.randomUUID();
const confirm = inputs => ({ ...inputs, confirmedFacts:{ fenceType:{ status:'identified', field:'fenceType', value:'wood', offeringId:fenceId } } });

test('explicit itemized height rows quote 2, 5 ft 3.65 in, 6, 9 and 13 ft without scaling any component', () => {
  const quote = live({ serviceType:'FENCING_INSTALL', service:'Wood privacy', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'itemized',
    offeringDetails:{ description:'Wood privacy fence', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts set in concrete',
      gates:{ walk:{ widthLF:4, description:'Walk gate', postsAndFootingsIncluded:false } } },
    offeringRates:{ fenceLaborPerLF:9.5, fenceMaterialPerLF:14.25, postMaterialEach:28.75, footingLaborEach:22, footingMaterialEach:9.4, gate_walk:385 },
    installedLaborPercent:{ 'offeringRates.gate_walk':40 },heightRows:Object.fromEntries([2,5+3.65/12,6,9,13].map((height,i)=>['height_'+i,{exactHeight:height,postSpacingLF:8,offeringRates:{fenceLaborPerLF:9.5,fenceMaterialPerLF:14.25,postMaterialEach:28.75,footingLaborEach:22,footingMaterialEach:9.4,gate_walk:385}}])) } });
  const posts = 30n; // ceil(187 / 8) + 1 end + 3 corners + 2 walk-gate posts
  const exactHeights = { '5 ft 3.65 in': div(dec('63.65'), dec(12)) };
  for (const [height, label] of [[2, '2 ft'], [5 + 3.65 / 12, '5 ft 3.65 in'], [6, '6 ft'], [9, '9 ft'], [13, '13 ft']]) {
    const result = quote(confirm({ linearFeet:187, lfMethod:'exact', fenceType:'wood', fenceHeight:height, terrainSlope:'moderate', gates:{ walk:1 }, cornerCount:3 }));
    assert.equal(result.internalResult.resultType, 'INSTANT_ESTIMATE_READY', label);
    // 187 LF; 30 posts; terrain 1.15 on labor and 40% of the installed gate.
    const expected = [204298,293123,86250,75900,28200,40810];
    const lines = result.internalResult.options[0].lineItems.map(line => line.amountCents);
    assert.deepEqual([...lines].sort((a, b) => a - b), [...expected].sort((a, b) => a - b), label);
    assert.ok(result.customerResult.priceDrivers.some(text => text.includes(label + ' wood fencing')), label + ' driver');
    assert.doesNotMatch(result.customerResult.disclaimer, /scaled to the requested/);
  }
});

test('installed rows have independent 2, 4 and 13 ft prices; removal stays per measured foot', () => {
  const quote = live({ serviceType:'FENCING_REPLACEMENT', service:'Chain link', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'installed',
    offeringDetails:{ description:'Chain link', fenceType:'wood', fenceHeight:4, postFootingDescription:'Line posts in concrete', gates:{},
      removalOffered:true, removalDescription:'Remove old fence', removalIncludesDisposal:true },
    offeringRates:{ installedFencePerLF:38.5, removalPerLF:3.2 },heightRows:Object.fromEntries([[2,43],[4,38.5],[13,51]].map(([h,rate],i)=>['height_'+i,{exactHeight:h,postSpacingLF:8,offeringRates:{installedFencePerLF:rate,removalPerLF:3.2}}])) } });
  for (const [height,expected] of [[2,650000],[4,587000],[13,762000]]) {
    const result = quote(confirm({ linearFeet:140, lfMethod:'exact', fenceType:'wood', fenceHeight:height, terrainSlope:'flat', gates:{}, cornerCount:2, oldFenceRemoval:true, removalLengthLF:150 }));
    const total = result.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents;
    assert.equal(total, expected, height + ' ft');
  }
});

test('type and explicit height coverage both matter; metadata still offers no fixed height list', () => {
  const quote = live({ serviceType:'FENCING_INSTALL', service:'Wood privacy', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'installed',
    offeringDetails:{ description:'Wood privacy fence', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts set in concrete', gates:{} },
    offeringRates:{ installedFencePerLF:40 } } });
  const ok = quote(confirm({ linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:0.75, terrainSlope:'flat', gates:{}, cornerCount:0 }));
  assert.equal(ok.internalResult.resultType,'ESTIMATE_REQUIRES_REVIEW','9 in has no saved height row');
  const covered=quote(confirm({linearFeet:100,lfMethod:'exact',fenceType:'wood',fenceHeight:6,terrainSlope:'flat',gates:{},cornerCount:0}));
  assert.equal(covered.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,400000);
  const wrongType = quote({ linearFeet:100, lfMethod:'exact', fenceType:'vinyl', fenceHeight:6, terrainSlope:'flat', gates:{}, cornerCount:0 });
  assert.equal(wrongType.internalResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  for (const type of ['FENCING_INSTALL', 'FENCING_REPLACEMENT']) {
    const field = getVNextPriceBookMetadata().find(row => row.serviceType === type).customerFields.find(row => row.name === 'fenceHeight');
    assert.equal(field.type, 'number');
    assert.equal(field.values, undefined, 'no 4/6/8 option list');
  }
});

test('an exact feet-and-inches row retains its own fractional unit price and exact display', () => {
  // $45.00005/LF * 100 LF = 450000.5 cents -> 450001 cents.
  // Height is exactly 5 ft 3.65 in; no height multiplier participates.
  const sent=5+3.65/12;
  const quote = live({ serviceType:'FENCING_INSTALL', service:'Wood privacy', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'installed',
    offeringDetails:{ description:'Wood privacy fence', fenceType:'wood', fenceHeight:sent, postFootingDescription:'Posts set in concrete', gates:{} },
    offeringRates:{ installedFencePerLF:45.00005 } } });
  const result = quote(confirm({ linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:sent, terrainSlope:'flat', gates:{}, cornerCount:0 }));
  assert.equal(cents(mul(dec(100),dec('4500.005'))),450001);
  assert.equal(result.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents, 450001);
  assert.equal(result.customerResult.midEstimate, 4500.01);
  assert.deepEqual(result.customerResult.pricedScope.facts.find(fact => fact.label === 'Fence height'), { label:'Fence height', value:'5 ft 3.65 in' });
  assert.ok(result.customerResult.priceDrivers.includes('100 measured linear feet of 5 ft 3.65 in wood fencing'));
  assert.doesNotMatch(result.customerResult.disclaimer,/scaled to the requested/);
});

test('entered heights are recovered exactly; arbitrary numbers are used as given; wording no longer limits height', () => {
  const exact = value => { const r = exactFenceHeight(value); return String(r.numerator) + '/' + String(r.denominator); };
  assert.equal(exact(5 + 3.65 / 12), '1273/240');   // 63.65 in / 12
  assert.equal(exact(4 + 8 / 12), '14/3');          // 4 ft 8 in
  assert.equal(exact(5.3), '53/10');                // decimal feet unchanged
  assert.equal(exact(13), '13/1');
  assert.equal(exact(Math.PI), '3141592653589793/1000000000000000');
  for (const [value, text] of [[6, '6 ft'], [0.75, '9 in'], [5 + 3.65 / 12, '5 ft 3.65 in'], [4 + 8 / 12, '4 ft 8 in'], [5.5, '5 ft 6 in'], [13, '13 ft']]) assert.equal(formatFenceHeight(value), text);
  const input = fs.readFileSync(new URL('../client/src/pricebookInputs.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(input, /must match the offered height/);
  assert.match(input, /Any positive height, including fractional inches\./);
});

