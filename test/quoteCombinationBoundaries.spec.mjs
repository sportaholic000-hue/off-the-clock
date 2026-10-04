import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { offeringFixture } from './configuredOfferingsFixtures.mjs';

// Verification coverage (not a new pricing defect): several gate types on one
// fence, painting walls + ceilings + trim together, and quantity/height/size
// boundaries. Supported jobs must quote at the exact independently computed price;
// unsafe requests must return review. Expected values use BigInt fractions here.
process.env.PRICEBOOK_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-combinations-'));
const bridge = await import('../server/src/quoteDoneBridge.js');
const store = await import('../server/priceBookService.js');
const engine = await import('../server/quote-engine-vnext/index.js');

const gcd = (a, b) => b ? gcd(b, a % b) : (a < 0n ? -a : a);
const frac = (n, d) => { const g = gcd(n, d) || 1n; return [n / g, d / g]; };
const D = text => { const [w, f = ''] = String(text).split('.'); return frac(BigInt(w + f), 10n ** BigInt(f.length)); };
const mul = (...xs) => xs.reduce(([a, b], [c, d]) => frac(a * c, b * d), [1n, 1n]);
const cents = ([n, d]) => Number((2n * n + d) / (2n * d)); // half up, once per line
const CATEGORIES = ['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all = value => Object.fromEntries(CATEGORIES.map(key => [key, value]));
const defaults = { currency:'CAD', markupPercent:0, markupMode:'markup', overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
  taxMode:'TAX_NONE', taxPercent:0, rangeBufferPercent:0, markupApplies:all(true), peakMonths:[], peakSurchargePercent:0 };
function live(service) {
  const ownerId = 'combo-' + crypto.randomUUID();
  bridge.saveApplicationBook(ownerId, { revision:bridge.readApplicationBook(ownerId).revision, services:[{ source:'MANUAL', active:true, tiers:[],
    feeRules:{ travel:'not_applicable', disposal:'not_applicable', permit:'not_applicable', overhead:'not_applicable' },
    priceBasisByCategory:{ ...all('cost'), addon:'sell_price' }, taxabilityByCategory:all(false), ...service }], defaults });
  let book = store.loadPricebook(ownerId);
  const status = bridge.applicationStatus(book.services[0], book);
  bridge.approveApplicationService(ownerId, book.services[0].id, { revision:bridge.bookRevision(book), confirmConfiguration:true, confirmLegacySettings:true, fields:status.confirmationFields });
  book = store.loadPricebook(ownerId);
  assert.equal(bridge.applicationStatus(book.services[0], book).status, 'QUOTING LIVE', JSON.stringify(bridge.applicationStatus(book.services[0], book).validationErrors));
  return inputs => bridge.calculateApplicationQuote(book, book.services[0], { serviceId:book.services[0].id, customerInputs:inputs }, { ownerId }).internalResult;
}
const lines = result => result.options[0].lineItems.map(line => line.amountCents).sort((a, b) => a - b);
const sorted = values => [...values].sort((a, b) => a - b);
const fenceId = crypto.randomUUID();
const wood = inputs => ({ ...inputs, confirmedFacts:{ fenceType:{ status:'identified', field:'fenceType', value:'wood', offeringId:fenceId } } });
const twoGates = postsIncluded => ({ walk:{ widthLF:4, description:'Walk gate', postsAndFootingsIncluded:postsIncluded },
  double:{ widthLF:12, description:'Double drive gate', postsAndFootingsIncluded:true } });

test('itemized fence with two gate types, corners and steep ground, at the priced height and at 8 ft', () => {
  const quote = live({ serviceType:'FENCING_INSTALL', service:'Wood privacy', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'itemized',
    offeringDetails:{ description:'Wood privacy', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts in concrete', gates:twoGates(false) },
    offeringRates:{ fenceLaborPerLF:9.5, fenceMaterialPerLF:14.25, postMaterialEach:28.75, footingLaborEach:22, footingMaterialEach:9.4, gate_walk:385, gate_double:1250 },
    installedLaborPercent:{ 'offeringRates.gate_walk':40, 'offeringRates.gate_double':35 } } });
  // Posts: ceil(160 / 8) + 1 end + 2 corners + 2 per walk gate (price excludes posts) x 2 gates; the double gate includes its posts.
  const posts = D(20 + 1 + 2 + 4), steep = D('1.3');
  for (const [height, f] of [[6, D(1)], [8, frac(4n, 3n)]]) {
    const result = quote(wood({ linearFeet:160, lfMethod:'exact', fenceType:'wood', fenceHeight:height, terrainSlope:'steep', gates:{ walk:2, double:1 }, cornerCount:2 }));
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', height + ' ft');
    assert.deepEqual(lines(result), sorted([cents(mul(D(160), D(950), f, steep)), cents(mul(D(160), D('1.1'), D(1425), f)), cents(mul(posts, D(2875), f)),
      cents(mul(posts, D(2200), f, steep)), cents(mul(posts, D(940), f)), cents(mul(D(2), D(38500), f, D('1.12'))), cents(mul(D(125000), f, D('1.105')))]), height + ' ft');
  }
});

test('installed fence with two gate types and moderate ground applies each labor share separately', () => {
  const quote = live({ serviceType:'FENCING_INSTALL', service:'Wood privacy', knownOfferings:{ fenceType:{ wood:fenceId } }, pricing:{ minimumJob:0, offeringMode:'installed',
    offeringDetails:{ description:'Wood privacy', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts in concrete', gates:twoGates(true) },
    offeringRates:{ installedFencePerLF:38.5, gate_walk:385, gate_double:1250 },
    installedLaborPercent:{ 'offeringRates.installedFencePerLF':50, 'offeringRates.gate_walk':40, 'offeringRates.gate_double':35 } } });
  const result = quote(wood({ linearFeet:160, lfMethod:'exact', fenceType:'wood', fenceHeight:6, terrainSlope:'moderate', gates:{ walk:2, double:1 }, cornerCount:2 }));
  // 1 + share x (1.15 - 1): 1.075, 1.06 and 1.0525; the double gate is 131,562.5 cents and rounds up.
  assert.deepEqual(lines(result), sorted([cents(mul(D(160), D(3850), D('1.075'))), cents(mul(D(2), D(38500), D('1.06'))), cents(mul(D(125000), D('1.0525')))]));
  assert.equal(result.options[0].calculationRecord.scenarios.mid.finalTotalCents, 662200 + 81620 + 131563);
});

test('interior painting with walls, ceilings, primer, fair-condition prep and trim together on vaulted walls', () => {
  const quote = live({ serviceType:'INTERIOR_PAINTING', service:'Interior repaint', priceBasisByCategory:{ ...all('cost'), material:'sell_price', addon:'sell_price' },
    pricing:{ minimumJob:0, offeringMode:'itemized', offeringDetails:{ description:'Interior repaint', substrate:'Drywall', coating:'Latex', preparation:'Patch and sand',
      primerCoats:1, wallHeight:'standard', ceilingsOffered:true, ceilingPrimerCoats:1, trimOffered:true, trimDescription:'Baseboard and casing' },
    offeringRates:{ wallLaborPerSqftPerCoat:0.92, wallMaterialPerSqftPerCoat:0.27, prepLaborPerSqft_fair:0.35, prepMaterialPerSqft_fair:0.06, primerLaborPerSqftPerCoat:0.4,
      primerMaterialPerSqftPerCoat:0.18, ceilingLaborPerSqftPerCoat:0.88, ceilingMaterialPerSqftPerCoat:0.24, ceilingPrimerLaborPerSqftPerCoat:0.36,
      ceilingPrimerMaterialPerSqftPerCoat:0.15, installedTrimPerLF:2.1 } } });
  const result = quote({ areaInputMethod:'wall_sqft', wallAreaSqft:500, coats:2, surfaceCondition:'fair', wallHeight:'vaulted', wallScopeUniform:true,
    ceilingsIncluded:true, ceilingAreaSqft:200, trimIncluded:true, trimLengthLF:100 });
  const v = D('1.25'), waste = D('1.1');
  // Labor (walls, primer, prep over walls + ceiling, ceiling, ceiling primer) uses the vaulted factor; materials carry 10% waste; trim is unchanged by wall height.
  assert.deepEqual(lines(result), sorted([cents(mul(D(1000), D(92), v)), cents(mul(D(1000), waste, D(27))), cents(mul(D(500), D(40), v)), cents(mul(D(500), waste, D(18))),
    cents(mul(D(700), D(35), v)), cents(mul(D(700), waste, D(6))), cents(mul(D(400), D(88), v)), cents(mul(D(400), waste, D(24))), cents(mul(D(200), D(36), v)),
    cents(mul(D(200), waste, D(15))), 21000]));
  assert.equal(result.options[0].calculationRecord.scenarios.mid.finalTotalCents, 302705);
});

test('interior painting installed: walls and ceilings carry their labor shares on high walls, trim does not change', () => {
  const quote = live({ serviceType:'INTERIOR_PAINTING', service:'Interior repaint', priceBasisByCategory:{ ...all('cost'), material:'sell_price', addon:'sell_price' },
    pricing:{ minimumJob:0, offeringMode:'installed', offeringDetails:{ description:'Interior repaint', substrate:'Drywall', coating:'Latex', preparation:'Patch and sand',
      finishCoats:2, surfaceCondition:'fair', primerCoats:1, wallHeight:'standard', ceilingsOffered:true, ceilingCoats:2, ceilingPrimerCoats:1, trimOffered:true, trimDescription:'Baseboard' },
    offeringRates:{ installedWallPerSqft:2.9, installedCeilingPerSqft:2.4, installedTrimPerLF:2.1 },
    installedLaborPercent:{ 'offeringRates.installedWallPerSqft':60, 'offeringRates.installedCeilingPerSqft':55, 'offeringRates.installedTrimPerLF':70 } } });
  const result = quote({ areaInputMethod:'wall_sqft', wallAreaSqft:500, coats:2, surfaceCondition:'fair', wallHeight:'high', wallScopeUniform:true,
    ceilingsIncluded:true, ceilingAreaSqft:200, trimIncluded:true, trimLengthLF:100 });
  assert.deepEqual(lines(result), sorted([cents(mul(D(500), D(290), D('1.06'))), cents(mul(D(200), D(240), D('1.055'))), 21000]));
});

const fenceInput = changes => { const input = offeringFixture('FENCING_INSTALL', 'installed'); Object.assign(input.customerInputs, changes); return input; };
const resultType = input => engine.generateQuoteVNext(input).resultType;

test('fence quantity, height, gate and corner boundaries: supported values quote, unsafe values return review', () => {
  for (const linearFeet of [1, 100, 1_000_000]) assert.equal(resultType(fenceInput({ linearFeet, gates:{} })), 'INSTANT_ESTIMATE_READY', 'length ' + linearFeet);
  for (const linearFeet of [0.99, 0, -1, '100', Infinity, undefined]) assert.equal(resultType(fenceInput({ linearFeet, gates:{} })), 'ESTIMATE_REQUIRES_REVIEW', 'length ' + String(linearFeet));
  for (const fenceHeight of [0.25, 2, 13, 100]) assert.equal(resultType(fenceInput({ fenceHeight, gates:{} })), 'INSTANT_ESTIMATE_READY', 'height ' + fenceHeight);
  for (const fenceHeight of [0, -6, '6', Infinity, undefined, 1e300]) assert.equal(resultType(fenceInput({ fenceHeight, gates:{} })), 'ESTIMATE_REQUIRES_REVIEW', 'height ' + String(fenceHeight));
  for (const gates of [{}, { walk:1 }, { walk:2 }]) assert.equal(resultType(fenceInput({ gates })), 'INSTANT_ESTIMATE_READY', JSON.stringify(gates));
  for (const gates of [{ walk:-1 }, { walk:1.5 }, { unknown_gate:1 }, { walk:'2' }, []]) assert.equal(resultType(fenceInput({ gates })), 'ESTIMATE_REQUIRES_REVIEW', JSON.stringify(gates));
  for (const cornerCount of [0, 4, 1_000_000]) assert.equal(resultType(fenceInput({ cornerCount, gates:{} })), 'INSTANT_ESTIMATE_READY', 'corners ' + cornerCount);
  for (const cornerCount of [-1, 2.5, 1_000_001, '2']) assert.equal(resultType(fenceInput({ cornerCount, gates:{} })), 'ESTIMATE_REQUIRES_REVIEW', 'corners ' + cornerCount);
});

test('painting area and coat boundaries: supported values quote, unsafe values return review', () => {
  const paint = changes => { const input = offeringFixture('INTERIOR_PAINTING', 'itemized'); Object.assign(input.customerInputs, changes); return input; };
  for (const wallAreaSqft of [1, 500, 2_000_000]) assert.equal(resultType(paint({ wallAreaSqft })), 'INSTANT_ESTIMATE_READY', 'walls ' + wallAreaSqft);
  for (const wallAreaSqft of [0, 0.5, -10, 2_000_001, '500']) assert.equal(resultType(paint({ wallAreaSqft })), 'ESTIMATE_REQUIRES_REVIEW', 'walls ' + wallAreaSqft);
  for (const coats of [1, 2, 3]) assert.equal(resultType(paint({ coats })), 'INSTANT_ESTIMATE_READY', 'coats ' + coats);
  for (const coats of [0, 4, 1.5, '2']) assert.equal(resultType(paint({ coats })), 'ESTIMATE_REQUIRES_REVIEW', 'coats ' + coats);
  assert.equal(resultType(paint({ ceilingsIncluded:false })), 'ESTIMATE_REQUIRES_REVIEW', 'ceiling area supplied while ceilings are excluded');
  assert.equal(resultType(paint({ ceilingsIncluded:true, ceilingAreaSqft:0 })), 'ESTIMATE_REQUIRES_REVIEW', 'zero ceiling area');
});

test('repair size bands switch exactly at the specified boundaries', () => {
  const roofKnown = { roofType:{ asphalt_shingle:crypto.randomUUID() }, repairType:{ shingle_patch:crypto.randomUUID() } };
  const roof = live({ serviceType:'ROOFING_REPAIR', service:'Roof repair', knownOfferings:roofKnown, pricing:{ laborHourlyRate:95.5, repairMinimum:0, largeRepairMaxSqft:500,
    repairHours:{ asphalt_shingle:{ shingle_patch:{ small:2, medium:3.5, large:6 } } }, repairMaterialAllowance:{ asphalt_shingle:{ shingle_patch:{ small:45, medium:85.25, large:160 } } } } });
  const facts = (known, inputs) => ({ ...inputs, confirmedFacts:Object.fromEntries(Object.entries(known).map(([field, map]) => [field, { status:'identified', field, value:inputs[field], offeringId:map[inputs[field]] }])) });
  const band = { small:cents(mul(D(2), D(9550), D('1.15'))) + 4500, medium:cents(mul(D('3.5'), D(9550), D('1.15'))) + 8525, large:cents(mul(D(6), D(9550), D('1.15'))) + 16000 };
  for (const [area, size] of [[49.99, 'small'], [50, 'medium'], [200, 'medium'], [200.01, 'large']]) {
    const result = roof(facts(roofKnown, { repairType:'shingle_patch', affectedArea:area, roofType:'asphalt_shingle', pitch:'medium', stories:1, leakPresent:false }));
    assert.equal(result.options[0].calculationRecord.scenarios.mid.finalTotalCents, band[size], area + ' sq ft is ' + size);
  }
  const sidingKnown = { damageLevel:{ minor:crypto.randomUUID() } };
  const siding = live({ serviceType:'SIDING_REPAIR', service:'Siding repair', knownOfferings:sidingKnown, pricing:{ laborHourlyRate:72.5, repairMinimum:0, largeRepairMaxSqft:150,
    repairHours:{ vinyl:{ minor:{ small:2.5, medium:4, large:7 } } }, materialAllowance:{ vinyl:{ minor:{ small:55, medium:90, large:150 } } } } });
  const sidingBand = { small:cents(mul(D('2.5'), D(7250), D('1.2'))) + 5500, medium:cents(mul(D(4), D(7250), D('1.2'))) + 9000, large:cents(mul(D(7), D(7250), D('1.2'))) + 15000 };
  for (const [area, size] of [[19.99, 'small'], [20, 'medium'], [80, 'medium'], [80.01, 'large']]) {
    const result = siding(facts(sidingKnown, { sidingType:'vinyl', damageLevel:'minor', affectedArea:area, stories:3 }));
    assert.equal(result.options[0].calculationRecord.scenarios.mid.finalTotalCents, sidingBand[size], area + ' sq ft is ' + size);
  }
});
