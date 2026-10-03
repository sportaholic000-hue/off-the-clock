import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Owner ruling (October 3): a fence quote must work for any height the customer
// asks for (2 ft, 9 ft, 13 ft, fractional inches). Prices are entered for one
// height; other heights scale every height-dependent price by
// requested height / priced height. Removal of an old fence is not scaled.
// Expected values are computed here with exact fractions, independently of the engine.
process.env.PRICEBOOK_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-fence-height-'));
const bridge = await import('../server/src/quoteDoneBridge.js');
const store = await import('../server/priceBookService.js');
const { getVNextPriceBookMetadata } = await import('../server/quote-engine-vnext/index.js');
const { exactFenceHeight, formatFenceHeight } = await import('../server/quote-engine-vnext/configuredOfferings.js');

const CATEGORIES = ['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all = value => Object.fromEntries(CATEGORIES.map(key => [key, value]));
const defaults = { markupPercent:0, markupMode:'markup', overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
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

test('a 6 ft itemized wood fence quotes 2, 5 ft 3.65 in, 9 and 13 ft requests in exact proportion', () => {
  const quote = live({ serviceType:'FENCING_INSTALL', service:'Wood privacy', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'itemized',
    offeringDetails:{ description:'Wood privacy fence', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts set in concrete',
      gates:{ walk:{ widthLF:4, description:'Walk gate', postsAndFootingsIncluded:false } } },
    offeringRates:{ fenceLaborPerLF:9.5, fenceMaterialPerLF:14.25, postMaterialEach:28.75, footingLaborEach:22, footingMaterialEach:9.4, gate_walk:385 },
    installedLaborPercent:{ 'offeringRates.gate_walk':40 } } });
  const posts = 30n; // ceil(187 / 8) + 1 end + 3 corners + 2 walk-gate posts
  const exactHeights = { '5 ft 3.65 in': div(dec('63.65'), dec(12)) };
  for (const [height, label] of [[2, '2 ft'], [5 + 3.65 / 12, '5 ft 3.65 in'], [6, '6 ft'], [9, '9 ft'], [13, '13 ft']]) {
    const result = quote(confirm({ linearFeet:187, lfMethod:'exact', fenceType:'wood', fenceHeight:height, terrainSlope:'moderate', gates:{ walk:1 }, cornerCount:3 }));
    assert.equal(result.internalResult.resultType, 'INSTANT_ESTIMATE_READY', label);
    const f = div(exactHeights[label] || dec(height), dec(6)), terrain = dec('1.15');
    const expected = [cents(mul(dec(187), dec(950), f, terrain)), cents(mul(dec(187), dec('1.1'), dec(1425), f)), cents(mul([posts, 1n], dec(2875), f)),
      cents(mul([posts, 1n], dec(2200), f, terrain)), cents(mul([posts, 1n], dec(940), f)),
      // Installed gate: 40% labor share with the 1.15 terrain factor: 1 + 0.40 x 0.15 = 1.06.
      cents(mul(dec(38500), f, dec('1.06')))];
    const lines = result.internalResult.options[0].lineItems.map(line => line.amountCents);
    assert.deepEqual([...lines].sort((a, b) => a - b), [...expected].sort((a, b) => a - b), label);
    assert.ok(result.customerResult.priceDrivers.some(text => text.includes(label + ' wood fencing')), label + ' driver');
    if (height !== 6) assert.match(result.customerResult.disclaimer, new RegExp("Priced from this business's 6 ft fence prices, scaled to the requested " + label + ' height'));
    else assert.doesNotMatch(result.customerResult.disclaimer, /scaled to the requested/);
  }
});

test('a 4 ft installed fence quotes 2 and 13 ft; removal of the old fence is not scaled', () => {
  const quote = live({ serviceType:'FENCING_REPLACEMENT', service:'Chain link', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'installed',
    offeringDetails:{ description:'Chain link', fenceType:'wood', fenceHeight:4, postFootingDescription:'Line posts in concrete', gates:{},
      removalOffered:true, removalDescription:'Remove old fence', removalIncludesDisposal:true },
    offeringRates:{ installedFencePerLF:38.5, removalPerLF:3.2 } } });
  for (const height of [2, 4, 13]) {
    const result = quote(confirm({ linearFeet:140, lfMethod:'exact', fenceType:'wood', fenceHeight:height, terrainSlope:'flat', gates:{}, cornerCount:2, oldFenceRemoval:true, removalLengthLF:150 }));
    const total = result.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents;
    assert.equal(total, cents(mul(dec(140), dec(3850), div(dec(height), dec(4)))) + 150 * 320, height + ' ft');
  }
});

test('the fence type must still match; height never limits the quote; the metadata offers no fixed height list', () => {
  const quote = live({ serviceType:'FENCING_INSTALL', service:'Wood privacy', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'installed',
    offeringDetails:{ description:'Wood privacy fence', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts set in concrete', gates:{} },
    offeringRates:{ installedFencePerLF:40 } } });
  const ok = quote(confirm({ linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:0.75, terrainSlope:'flat', gates:{}, cornerCount:0 }));
  assert.equal(ok.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents, 50000, '9 in fence at $40 per foot for 6 ft');
  const wrongType = quote({ linearFeet:100, lfMethod:'exact', fenceType:'vinyl', fenceHeight:6, terrainSlope:'flat', gates:{}, cornerCount:0 });
  assert.equal(wrongType.internalResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  for (const type of ['FENCING_INSTALL', 'FENCING_REPLACEMENT']) {
    const field = getVNextPriceBookMetadata().find(row => row.serviceType === type).customerFields.find(row => row.name === 'fenceHeight');
    assert.equal(field.type, 'number');
    assert.equal(field.values, undefined, 'no 4/6/8 option list');
  }
});

test('a feet-and-inches height is priced exactly as entered and shown as entered (Astra reproduction)', () => {
  // 100 ft at $45 per foot priced for 6 ft; request 5 ft 3.65 in = 63.65/12 ft.
  // Exact: 100 x 4500 x (63.65/12) / 6 = 397,812.5 cents, which rounds half up to $3,978.13.
  const quote = live({ serviceType:'FENCING_INSTALL', service:'Wood privacy', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'installed',
    offeringDetails:{ description:'Wood privacy fence', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts set in concrete', gates:{} },
    offeringRates:{ installedFencePerLF:45 } } });
  const sent = 5 + 3.65 / 12; // exactly what the shared feet-and-inches control sends
  const result = quote(confirm({ linearFeet:100, lfMethod:'exact', fenceType:'wood', fenceHeight:sent, terrainSlope:'flat', gates:{}, cornerCount:0 }));
  assert.equal(cents(mul(dec(100), dec(4500), div(div(dec('63.65'), dec(12)), dec(6)))), 397813);
  assert.equal(result.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents, 397813);
  assert.equal(result.customerResult.midEstimate, 3978.13);
  assert.deepEqual(result.customerResult.pricedScope.facts.find(fact => fact.label === 'Fence height'), { label:'Fence height', value:'5 ft 3.65 in' });
  assert.ok(result.customerResult.priceDrivers.includes('100 measured linear feet of 5 ft 3.65 in wood fencing'));
  assert.match(result.customerResult.disclaimer, /scaled to the requested 5 ft 3\.65 in height\./);
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

