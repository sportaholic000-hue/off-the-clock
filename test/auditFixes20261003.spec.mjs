import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// Regression tests for the October 3 engine audit findings repaired on
// claude/audit-fixes-20261003. Expected amounts are computed here with BigInt
// fractions, independently of the engine.
process.env.PRICEBOOK_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'otc-audit-fixes-'));
const bridge = await import('../server/src/quoteDoneBridge.js');
const store = await import('../server/priceBookService.js');
const offer = await import('../server/quote-engine-vnext/configuredOfferings.js');
const { priceChoices, reviewRows } = await import('../client/src/pricebookReview.js');
const { chooseFenceType } = await import('../client/src/pricebookEditing.js');

const gcd = (a, b) => b ? gcd(b, a % b) : (a < 0n ? -a : a);
const frac = (n, d) => { const g = gcd(n, d) || 1n; return [n / g, d / g]; };
const D = t => { const [w, f = ''] = String(t).split('.'); return frac(BigInt(w + f), 10n ** BigInt(f.length)); };
const mul = (...xs) => xs.reduce(([a, b], [c, d]) => frac(a * c, b * d), [1n, 1n]);
const div = ([a, b], [c, d]) => frac(a * d, b * c);
const cents = ([n, d]) => Number((2n * n + d) / (2n * d));
const CATS = ['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all = v => Object.fromEntries(CATS.map(k => [k, v]));
const ALL_MONTHS = [1,2,3,4,5,6,7,8,9,10,11,12];
const defaults = (o = {}) => ({ markupPercent:0, markupMode:'markup', overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
  taxMode:'TAX_NONE', taxPercent:0, rangeBufferPercent:0, markupApplies:all(true), peakMonths:[], peakSurchargePercent:0, ...o });
function live(service, bookDefaults = defaults()) {
  const ownerId = 'audit-' + crypto.randomUUID();
  bridge.saveApplicationBook(ownerId, { revision:bridge.readApplicationBook(ownerId).revision, services:[{ source:'MANUAL', active:true, tiers:[],
    feeRules:{ travel:'not_applicable', disposal:'not_applicable', permit:'not_applicable', overhead:'not_applicable' },
    priceBasisByCategory:{ ...all('cost'), addon:'sell_price' }, taxabilityByCategory:all(false), ...service }], defaults:bookDefaults });
  let book = store.loadPricebook(ownerId);
  const status = bridge.applicationStatus(book.services[0], book);
  try { bridge.approveApplicationService(ownerId, book.services[0].id, { revision:bridge.bookRevision(book), confirmConfiguration:true, confirmLegacySettings:true, fields:status.confirmationFields }); } catch {}
  book = store.loadPricebook(ownerId);
  const raw = book.services[0];
  return { ownerId, raw, status:bridge.applicationStatus(raw, book), quote:inputs => bridge.calculateApplicationQuote(book, raw, { serviceId:raw.id, customerInputs:inputs }, { ownerId }).internalResult };
}
const total = r => r.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const fid = crypto.randomUUID();
const fenceSvc = (extra = {}, details = {}) => ({ serviceType:'FENCING_INSTALL', service:'Fence', knownOfferings:{ fenceType:{ wood:fid } }, pricing:{ minimumJob:0, offeringMode:'installed',
  offeringDetails:{ description:'Fence', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts', gates:{}, ...details }, offeringRates:{ installedFencePerLF:39.5 }, ...extra } });
const job = (o = {}) => ({ linearFeet:95.01, lfMethod:'exact', fenceType:'wood', fenceHeight:6, terrainSlope:'flat', gates:{}, cornerCount:0,
  confirmedFacts:{ fenceType:{ status:'identified', field:'fenceType', value:'wood', offeringId:fid } }, ...o });
const shares = (materials, labor) => ({ installedMaterialsPercent:{ 'offeringRates.installedFencePerLF':materials }, installedLaborPercent:{ 'offeringRates.installedFencePerLF':labor } });

test('D01: shares split the billed line, so a 100% materials share taxes exactly like tax-entire-job', () => {
  const billed = cents(mul(D('95.01'), D(3950)));   // 375,289.5 -> 375,290 cents
  assert.equal(billed, 375290);
  const all5 = live(fenceSvc(shares(100, 0)), defaults({ taxMode:'TAX_ALL', taxPercent:5 }));
  const mat5 = live(fenceSvc(shares(100, 0)), defaults({ taxMode:'TAX_MATERIALS', taxPercent:5 }));
  assert.equal(total(all5.quote(job())), billed + cents(mul([BigInt(billed), 1n], D('0.05'))));
  assert.equal(total(mat5.quote(job())), total(all5.quote(job())), 'equivalent configurations give the same cents');
  const forty = live(fenceSvc(shares(40, 60)), defaults({ taxMode:'TAX_MATERIALS', taxPercent:5 }));
  assert.equal(total(forty.quote(job())), billed + cents(mul([BigInt(billed), 1n], D('0.4'), D('0.05'))));
  const labor = live(fenceSvc(shares(0, 100)), defaults({ peakMonths:ALL_MONTHS, peakSurchargePercent:5 }));
  const lines = labor.quote(job()).options[0].lineItems;
  assert.equal(lines.find(l => /Peak/.test(l.name)).amountCents, cents(mul([BigInt(billed), 1n], D('0.05'))), '100% labor surcharge is 5% of the billed line');
});

test('D01: with a terrain factor, the labor and materials portions still add back to the billed line', () => {
  const svc = live(fenceSvc(shares(40, 60)), defaults({ taxMode:'TAX_MATERIALS', taxPercent:13 }));
  const result = svc.quote(job({ terrainSlope:'moderate' }));
  const scale = D('1.09'); // 1 + 0.60 x (1.15 - 1)
  const billed = cents(mul(D('95.01'), D(3950), scale));
  const line = result.options[0].lineItems[0];
  assert.equal(line.amountCents, billed);
  const materials = div(mul([BigInt(billed), 1n], D('0.4')), scale);
  assert.equal(result.calculationRecord.options?.[0]?.tax?.taxCents ?? total(result) - billed, cents(mul(materials, D('0.13'))));
});

test('M04: the surcharge on installed selling-price labor is never marked up; ordinary cost labor keeps the owner setting', () => {
  const svc = live(fenceSvc({ ...shares(0, 60), offeringRates:{ installedFencePerLF:100 } }), defaults({ markupPercent:30, peakMonths:ALL_MONTHS, peakSurchargePercent:10 }));
  const result = svc.quote(job({ linearFeet:1 }));
  assert.equal(total(result), 10600, '$100 + 10% of $60 labor, no markup on either');
  const surcharge = result.options[0].lineItems.find(l => /Peak/.test(l.name));
  assert.equal(surcharge.priceBasis, 'sell_price');
  const itemized = live({ serviceType:'FENCING_INSTALL', service:'Fence', knownOfferings:{ fenceType:{ wood:fid } }, pricing:{ minimumJob:0, offeringMode:'itemized',
    offeringDetails:{ description:'Fence', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts', gates:{} },
    offeringRates:{ fenceLaborPerLF:10, fenceMaterialPerLF:20, postMaterialEach:20, footingLaborEach:4, footingMaterialEach:6 } } }, defaults({ markupPercent:30, peakMonths:ALL_MONTHS, peakSurchargePercent:10 }));
  const r = itemized.quote(job({ linearFeet:100 }));
  const peak = r.options[0].lineItems.find(l => /Peak/.test(l.name));
  assert.equal(peak.priceBasis, undefined, 'cost-labor surcharge follows the owner category setting');
  assert.equal(peak.calculation.markupEligible, true);
});

test('D04: an incomplete second flat-roof membrane does not block a complete one', () => {
  const known = { membraneType:{ epdm:crypto.randomUUID() }, replacementMembraneType:{ epdm:crypto.randomUUID(), tpo:crypto.randomUUID() } };
  const roof = live({ serviceType:'FLAT_ROOF_REPLACEMENT', service:'Flat roof', knownOfferings:known,
    pricing:{ minimumJob:0, laborPerSqft:{ epdm:3.15, tpo:3.4 }, membraneCostPerSqft:{ epdm:2.85 }, tearOffPerSqft:{ epdm:1.05 } } });
  assert.equal(roof.status.status, 'QUOTING LIVE');
  const facts = replacement => ({ membraneType:{ status:'identified', field:'membraneType', value:'epdm', offeringId:known.membraneType.epdm },
    replacementMembraneType:{ status:'identified', field:'replacementMembraneType', value:replacement, offeringId:known.replacementMembraneType[replacement] } });
  const request = replacement => ({ roofSqft:1850, sqftMethod:'exact', membraneType:'epdm', replacementMembraneType:replacement, existingLayers:1, accessDifficulty:'moderate', serviceScope:'full', buildingType:'residential', confirmedFacts:facts(replacement) });
  const epdm = roof.quote(request('epdm'));
  assert.equal(epdm.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(total(epdm), cents(mul(D(1850), D(315), D('1.15'))) + cents(mul(D(1850), D('1.1'), D(285))) + cents(mul(D(1850), D(105), D('1.15'))));
  assert.equal(roof.quote(request('tpo')).resultType, 'ESTIMATE_REQUIRES_REVIEW', 'the incomplete membrane still goes to review');
});

test('D05: a fence type typed as "Wood Privacy" is stored and registered under one key and quotes', () => {
  const base = { serviceType:'FENCING_INSTALL', service:'Fence', pricing:{ minimumJob:0, offeringMode:'installed',
    offeringDetails:{ description:'Fence', fenceHeight:6, postFootingDescription:'Posts', gates:{} }, offeringRates:{ installedFencePerLF:40 } } };
  const chosen = chooseFenceType(base, 'Wood Privacy');
  assert.equal(chosen.service.pricing.offeringDetails.fenceType, 'wood_privacy');
  assert.ok(chosen.service.knownOfferings.fenceType.wood_privacy);
  assert.equal(chooseFenceType(chosen.service, '  wood   privacy ').service.knownOfferings.fenceType.wood_privacy, chosen.service.knownOfferings.fenceType.wood_privacy, 'same name reuses the registration');
  assert.match(chooseFenceType(base, '6-foot cedar').error, /Start the name with a letter/);
  const svc = live(chosen.service);
  assert.equal(svc.status.status, 'QUOTING LIVE');
  const id = chosen.service.knownOfferings.fenceType.wood_privacy;
  const r = svc.quote({ linearFeet:100, lfMethod:'exact', fenceType:'wood_privacy', fenceHeight:6, terrainSlope:'flat', gates:{}, cornerCount:0,
    confirmedFacts:{ fenceType:{ status:'identified', field:'fenceType', value:'wood_privacy', offeringId:id } } });
  assert.equal(total(r), 400000);
});

test('D06: included-price choices list option overrides by name and never offer minimums', () => {
  const service = { serviceType:'INTERIOR_PAINTING', pricing:{ minimumJob:0, repairMinimum:5, offeringMode:'installed', offeringRates:{ installedWallPerSqft:290, installedTrimPerLF:200 } },
    tiers:[{ name:'Included trim', overrides:{ offeringRates:{ installedTrimPerLF:0 } } }] };
  const meta = bridge.applicationMetadata().services.find(s => s.serviceType === 'INTERIOR_PAINTING');
  const choices = priceChoices(service, meta);
  assert.ok(!choices.some(c => /minimum/i.test(c.path)), 'minimums are never inclusion sources or covers');
  assert.ok(choices.some(c => c.path === 'offeringRates.installedTrimPerLF' && c.value === 0 && c.option === 'Included trim' && /Included trim option/.test(c.label)));
  assert.ok(choices.some(c => c.path === 'offeringRates.installedWallPerSqft' && c.value === 290 && c.option === null));
});

test('D03: the default settings a quote uses are saved with the service and shown for approval', () => {
  const svc = live(fenceSvc({ postSpacingLF:6 }));
  const saved = JSON.parse(fs.readFileSync(path.join(process.env.PRICEBOOK_PATH, svc.ownerId + '.json'), 'utf8')).services[0].pricing;
  assert.equal(saved.postSpacingLF, 6, 'an entered value is kept');
  assert.equal(saved.fenceWasteFactor, 0.1);
  assert.deepEqual(saved.terrainLaborMultiplier, { flat:1, moderate:1.15, steep:1.3 });
  const meta = bridge.applicationMetadata().services.find(s => s.serviceType === 'FENCING_INSTALL');
  const rows = reviewRows(bridge.readApplicationBook(svc.ownerId).services[0], {}, meta);
  for (const label of [/post/i, /waste/i, /terrain|ground/i]) assert.ok(rows.some(r => label.test(r.label)), String(label));
  const unsaved = reviewRows({ serviceType:'FENCING_INSTALL', pricing:{ offeringMode:'installed', offeringRates:{ installedFencePerLF:40 } } }, {}, meta);
  assert.ok(unsaved.some(r => /\(default\)/.test(r.label) && /post/i.test(r.label)), 'older records show applied defaults as defaults');
});

test('D10: heights finer than 1/10,000 inch are refused, never silently rounded; exact parts never show 12 inches', () => {
  const svc = live(fenceSvc({ offeringRates:{ installedFencePerLF:36 } }));
  const tooFine = svc.quote(job({ linearFeet:100000, fenceHeight:5 + 3.0000001 / 12 }));
  assert.equal(tooFine.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(JSON.stringify(tooFine).includes(offer.FENCE_HEIGHT_PRECISION_MESSAGE));
  const fine = svc.quote(job({ linearFeet:100000, fenceHeight:5 + 3.0001 / 12 }));
  assert.equal(total(fine), cents(mul(D(100000), D(3600), div(div(D('63.0001'), D(12)), D(6)))));
  assert.deepEqual(offer.fenceHeightParts(5 + 3.65 / 12), { feet:'5', inches:'3.65' });
  assert.deepEqual(offer.fenceHeightParts(5.999999999), { feet:'6', inches:'0' });
  const owner = live(fenceSvc({}, { fenceHeight:5 + 3.0000001 / 12 }));
  assert.equal(owner.status.status, 'NEEDS PRICING');
  assert.ok(owner.status.validationErrors.includes(offer.FENCE_HEIGHT_PRECISION_MESSAGE));
});

test('D08/D09: tax note states the installed-share rule; no accessible name exposes an internal key', () => {
  const src = f => fs.readFileSync(new URL('../client/src/' + f, import.meta.url), 'utf8');
  assert.match(src('pricebook.jsx'), /except installed prices with a materials share: their materials share is taxed whatever their category/);
  for (const file of ['offeringEditor.jsx', 'installedMaterialsEditor.jsx', 'scopeEditor.jsx'])
    assert.doesNotMatch(src(file), /aria-label=\{'(Offering price|Scope price) '\+|aria-label=\{title\+' '\+path\}/, file);
});

const contracts = await import('../server/quote-engine-vnext/contracts.js');
test('M03: a large repair is priced only up to the area the owner says it covers', () => {
  const known = { roofType:{ asphalt_shingle:crypto.randomUUID() }, repairType:{ shingle_patch:crypto.randomUUID() } };
  const roof = limit => live({ serviceType:'ROOFING_REPAIR', service:'Roof repair', knownOfferings:known, pricing:{ laborHourlyRate:100, repairMinimum:0,
    repairHours:{ asphalt_shingle:{ shingle_patch:{ small:2, medium:4, large:8 } } }, repairMaterialAllowance:{ asphalt_shingle:{ shingle_patch:{ small:50, medium:100, large:160 } } },
    ...(limit === undefined ? {} : { largeRepairMaxSqft:limit }) } });
  const request = area => ({ repairType:'shingle_patch', affectedArea:area, roofType:'asphalt_shingle', pitch:'low', stories:1, leakPresent:false,
    confirmedFacts:Object.fromEntries(Object.entries(known).map(([field, map]) => [field, { status:'identified', field, value:Object.keys(map)[0], offeringId:Object.values(map)[0] }])) });
  const unset = roof(undefined);
  assert.equal(unset.status.status, 'NEEDS PRICING', 'the large band needs its limit before going live');
  const tooSmall = roof(150);
  assert.equal(tooSmall.status.status, 'NEEDS PRICING');
  assert.ok(tooSmall.status.validationErrors.some(message => /more than 200 sq ft/.test(message)));
  const set = roof(500);
  assert.equal(set.status.status, 'QUOTING LIVE');
  assert.equal(total(set.quote(request(201))), 96000);
  assert.equal(total(set.quote(request(500))), 96000, 'the limit itself is covered');
  const over = set.quote(request(20000));
  assert.equal(over.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(over.reviewReason, contracts.LARGE_REPAIR_LIMIT_MESSAGE);
  assert.equal(total(set.quote(request(100))), 50000, 'small and medium repairs are unaffected');
  for (const type of ['FLAT_ROOF_REPAIR', 'SIDING_REPAIR']) assert.match(contracts.largeRepairLimitProblem(type, 80), /more than 80 sq ft/);
  assert.equal(contracts.allowedPricingFields('FLAT_ROOF_REPAIR').includes('largeRepairMaxSqft'), true);
});

test('C03: the price-book currency is validated, stated on every quote and carried in the customer result', () => {
  for (const [currency, sentence] of [['CAD', 'Prices are in Canadian dollars (CAD).'], ['USD', 'Prices are in US dollars (USD).']]) {
    const svc = live(fenceSvc(), defaults({ currency }));
    assert.equal(svc.status.status, 'QUOTING LIVE');
    const ownerId = svc.ownerId, book = store.loadPricebook(ownerId), raw = book.services[0];
    const quoted = bridge.calculateApplicationQuote(book, raw, { serviceId:raw.id, customerInputs:job() }, { ownerId });
    assert.equal(quoted.internalResult.currency, currency);
    assert.equal(quoted.customerResult.currency, currency);
    assert.ok(quoted.customerResult.disclaimer.includes(sentence));
  }
  const wrong = live(fenceSvc(), defaults({ currency:'EUR' }));
  assert.equal(wrong.status.status, 'NEEDS PRICING');
  assert.ok(wrong.status.validationErrors.includes('Choose CAD or USD as the currency of your prices.'));
  const server = fs.readFileSync(new URL('../server/src/server.js', import.meta.url), 'utf8');
  assert.match(server, /\{ CA: 'CAD', US: 'USD' \}\[country\]/, 'onboarding sets the currency from the business country');
});
