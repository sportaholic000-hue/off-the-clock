import './pricebookTestEnv.mjs';
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
const defaults = (o = {}) => ({ currency:'CAD', markupPercent:0, markupMode:'markup', overheadFixed:0, minimumJobPrice:0, travelFee:0, disposalFee:0, permitFee:0,
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
  const labor = live(fenceSvc(shares(0, 100)), defaults({ quoteTimeZone:'UTC', peakMonths:ALL_MONTHS, peakSurchargePercent:5 }));
  const result = labor.quote(job()), lines = result.options[0].lineItems;
  assert.equal(lines.find(l => /Peak/.test(l.name)).amountCents, cents(mul([BigInt(billed), 1n], D('0.05'))), '100% labor surcharge is 5% of the billed line');
  assert.equal(total(result), 394055, '$3,752.90 + $187.65 peak; handwritten in DATE_CONTEXT_FIX_20261006.md');
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
  const svc = live(fenceSvc({ ...shares(0, 60), offeringRates:{ installedFencePerLF:100 } }), defaults({ quoteTimeZone:'UTC', markupPercent:30, peakMonths:ALL_MONTHS, peakSurchargePercent:10 }));
  const result = svc.quote(job({ linearFeet:1 }));
  assert.equal(total(result), 10600, '$100 + 10% of $60 labor, no markup on either');
  const surcharge = result.options[0].lineItems.find(l => /Peak/.test(l.name));
  assert.equal(surcharge.priceBasis, 'sell_price');
  const itemized = live({ serviceType:'FENCING_INSTALL', service:'Fence', knownOfferings:{ fenceType:{ wood:fid } }, pricing:{ minimumJob:0, offeringMode:'itemized',
    offeringDetails:{ description:'Fence', fenceType:'wood', fenceHeight:6, postFootingDescription:'Posts', gates:{} },
    offeringRates:{ fenceLaborPerLF:10, fenceMaterialPerLF:20, postMaterialEach:20, footingLaborEach:4, footingMaterialEach:6 } } }, defaults({ quoteTimeZone:'UTC', markupPercent:30, peakMonths:ALL_MONTHS, peakSurchargePercent:10 }));
  const r = itemized.quote(job({ linearFeet:100 }));
  const peak = r.options[0].lineItems.find(l => /Peak/.test(l.name));
  assert.equal(peak.priceBasis, undefined, 'cost-labor surcharge follows the owner category setting');
  assert.equal(peak.calculation.markupEligible, true);
  assert.equal(peak.amountCents, 10560, '10% of $1,056 regular labor');
  assert.equal(total(r), 484328, '$3,725.60 including peak + $1,117.68 markup; handwritten in DATE_CONTEXT_FIX_20261006.md');
});

test('D04: an incomplete second flat-roof membrane does not block a complete one', () => {
  const known = { membraneType:{ epdm:crypto.randomUUID() }, replacementMembraneType:{ epdm:crypto.randomUUID(), tpo:crypto.randomUUID() } };
  const roof = live({ serviceType:'FLAT_ROOF_REPLACEMENT', service:'Flat roof', knownOfferings:known,
    pricing:{ minimumJob:0, laborPerSqft:{ epdm:3.15, tpo:3.4 }, membraneCostPerSqft:{ epdm:2.85 }, tearOffPerSqft:{ epdm:1.05 } } });
  assert.equal(roof.status.status, 'QUOTING LIVE');
  const facts = replacement => ({ membraneType:{ status:'identified', field:'membraneType', value:'epdm', offeringId:known.membraneType.epdm },
    replacementMembraneType:{ status:'identified', field:'replacementMembraneType', value:replacement, offeringId:known.replacementMembraneType[replacement] } });
  const request = replacement => ({ roofSqft:1850, sqftMethod:'exact', membraneType:'epdm', replacementMembraneType:replacement, existingLayers:1, accessDifficulty:'moderate', serviceScope:'full', buildingType:'residential',insulationNeeded:false,coverboardNeeded:false, confirmedFacts:facts(replacement) });
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

test('D10: inches are accepted to two decimal places; finer values are refused, never silently rounded; exact parts never show 12 inches', () => {
  const svc = live(fenceSvc({ offeringRates:{ installedFencePerLF:36 } }));
  const tooFine = svc.quote(job({ linearFeet:100000, fenceHeight:5 + 3.0000001 / 12 }));
  assert.equal(tooFine.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(JSON.stringify(tooFine).includes(offer.FENCE_HEIGHT_PRECISION_MESSAGE));
  const threeDecimals = svc.quote(job({ linearFeet:100, fenceHeight:5 + 3.001 / 12 }));
  assert.equal(threeDecimals.resultType, 'ESTIMATE_REQUIRES_REVIEW', 'three decimal places of an inch are refused');
  const fine = svc.quote(job({ linearFeet:100000, fenceHeight:5 + 3.65 / 12 }));
  assert.equal(total(fine), cents(mul(D(100000), D(3600), div(div(D('63.65'), D(12)), D(6)))));
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

const { sameAssistTarget, STALE_ASSIST_NOTICE } = await import('../client/src/interviewAssist.js');
test('Audit 2 #1 (D02): an AI reading applies only to the unchanged question and value it was asked about', () => {
  const asked = { serviceType:'LANDSCAPING_MOWING', field:'mowingBaseRatePerSqft', rawValue:'100' };
  assert.equal(sameAssistTarget(asked, { ...asked }), true);
  assert.equal(sameAssistTarget(asked, { ...asked, rawValue:'150' }), false, 'owner corrected the value while waiting');
  assert.equal(sameAssistTarget(asked, { ...asked, field:'edgingPerLinearFoot' }), false, 'owner moved to another question');
  assert.equal(sameAssistTarget(asked, { ...asked, serviceType:'LANDSCAPING_SOD' }), false);
  const structured = { a:1 };
  assert.equal(sameAssistTarget({ ...asked, rawValue:structured }, { ...asked, rawValue:structured }), true);
  assert.equal(sameAssistTarget({ ...asked, rawValue:structured }, { ...asked, rawValue:{ a:1 } }), false, 'an edited structured answer is a new value');
  const step = fs.readFileSync(new URL('../client/src/onboarding.jsx', import.meta.url), 'utf8'), body = step.slice(step.indexOf('async function assistAnswer'), step.indexOf('async function startInterview'));
  assert.ok(body.indexOf('sameAssistTarget(asked,assistTarget.current)') > 0 && body.indexOf('sameAssistTarget(asked,assistTarget.current)') < body.indexOf('setRawValue('), 'the check runs before the value is replaced');
  assert.match(STALE_ASSIST_NOTICE, /newer entry was kept/);
});

test('Audit 2 #2 (D07): readiness is computed once per saved revision, not on every quote', () => {
  const svc = live(fenceSvc());
  const book = store.loadPricebook(svc.ownerId), raw = book.services[0];
  const before = bridge.applicationStatusCacheCounts();
  const first = bridge.calculateApplicationQuote(book, raw, { serviceId:raw.id, customerInputs:job() }, { ownerId:svc.ownerId });
  const second = bridge.calculateApplicationQuote(book, raw, { serviceId:raw.id, customerInputs:job() }, { ownerId:svc.ownerId });
  const after = bridge.applicationStatusCacheCounts();
  assert.equal(after.hits - before.hits >= 1, true, 'the second quote reuses readiness');
  assert.equal(total(first.internalResult), total(second.internalResult));
  const changed = structuredClone(book); changed.services[0].active = false;
  assert.equal(bridge.calculateApplicationQuote(changed, changed.services[0], { serviceId:raw.id, customerInputs:job() }, { ownerId:svc.ownerId }).internalResult.resultType, 'ESTIMATE_REQUIRES_REVIEW', 'a changed book is re-checked, not served from the cache');
});

test('Audit 2 #3 and #6 (C03): currency is an active, required setting and is never shown as retained legacy data', () => {
  const svc = live(fenceSvc(), defaults({ currency:'USD' }));
  assert.equal(svc.status.status, 'QUOTING LIVE');
  assert.ok(!svc.status.legacySettings.some(row => row.path === 'defaults.currency'), 'currency is not a retained legacy setting');
  assert.ok(bridge.DEFAULT_FIELDS.includes('currency'));
  const saved = bridge.readApplicationBook(svc.ownerId);
  const rows = reviewRows(saved.services[0], saved.defaults, bridge.applicationMetadata().services.find(s => s.serviceType === 'FENCING_INSTALL'), svc.status.legacySettings.map(r => r.path));
  assert.ok(rows.some(row => /Business settings · Currency/i.test(row.label)), 'currency is reviewed as an active business setting');
  const none = live(fenceSvc(), { ...defaults(), currency:undefined });
  assert.equal(none.status.status, 'NEEDS PRICING', 'a book without a currency cannot quote');
  assert.ok(none.status.validationErrors.includes('Choose the currency of your prices (CAD or USD) in the price book.'));
  assert.equal(none.quote(job()).resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

test('Audit 2 #4 and #5: the runner asks for the report format its checker reads; the quote gate follows imports through helpers', async () => {
  const runner = fs.readFileSync(new URL('../scripts/test-full.mjs', import.meta.url), 'utf8');
  assert.match(runner, /'--test', '--test-reporter=tap'/);
  assert.match(fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'), /name: Full test suite\s+run: npm test/);
  assert.equal(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).scripts.test, 'node scripts/test-full.mjs');
  const { quotePricebookSpecFiles } = await import('../scripts/testSelection.mjs');
  const files = quotePricebookSpecFiles(path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'));
  for (const name of ['opusQuoteRepairs', 'customerExplanation', 'quotePresentation', 'fenceAnyHeight', 'auditFixes20261003']) assert.ok(files.includes('test/' + name + '.spec.mjs'), name);
  assert.ok(!files.some(file => /voice/i.test(file)));
});

// ---- Third audit (October 4): F01-F06 and G01 ----
const { syncBuiltinESMExports } = await import('node:module');
const { spawnSync } = await import('node:child_process');
const { interpretInterviewAnswer } = await import('../server/src/priceBookAI.js');
const engineIndex = await import('../server/quote-engine-vnext/index.js');

test('F01: a save whose durability cannot be confirmed pauses quoting until a confirmed save', () => {
  const svc = live(fenceSvc());
  assert.equal(svc.status.status, 'QUOTING LIVE');
  const book = store.loadPricebook(svc.ownerId);
  const realFsync = fs.fsyncSync;
  // Fail only the directory flush that follows the replacement (the first flush confirms the pause marker).
  let directoryFlushes = 0;
  fs.fsyncSync = fd => { if (fs.fstatSync(fd).isDirectory() && ++directoryFlushes === 2) throw Object.assign(new Error('injected directory flush failure'), { code:'EIO' }); return realFsync(fd); };
  syncBuiltinESMExports();
  let failure;
  try { bridge.saveApplicationBook(svc.ownerId, { revision:bridge.bookRevision(book), services:bridge.readApplicationBook(svc.ownerId).services, defaults:bridge.readApplicationBook(svc.ownerId).defaults }); }
  catch (error) { failure = error; }
  finally { fs.fsyncSync = realFsync; syncBuiltinESMExports(); }
  assert.ok(failure, 'the save reports a failure');
  assert.equal(store.pricebookSaveUnconfirmed(svc.ownerId), true, 'the unconfirmed marker survives the failed request');
  const after = store.loadPricebook(svc.ownerId), raw = after.services[0];
  const status = bridge.applicationStatus(raw, after);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.ok(status.applicationIssues.includes('Your last price-book save could not be confirmed on disk. Save again before quoting resumes.'));
  assert.equal(bridge.calculateApplicationQuote(after, raw, { serviceId:raw.id, customerInputs:job() }, { ownerId:svc.ownerId }).internalResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  const current = bridge.readApplicationBook(svc.ownerId);
  bridge.saveApplicationBook(svc.ownerId, { revision:current.revision, services:current.services, defaults:current.defaults });
  assert.equal(store.pricebookSaveUnconfirmed(svc.ownerId), false, 'a confirmed save clears the pause');
});

test('F01: if anything fails before the saved book is replaced, the previous book stays current and quoting is not paused', () => {
  const dirPath = fs.mkdtempSync(path.join(process.env.PRICEBOOK_PATH, 'f01-')), ownerId = 'o-' + crypto.randomUUID(), target = path.join(dirPath, ownerId + '.json');
  fs.writeFileSync(target, '{"ownerId":"x","services":[]}');
  const real = { writeFileSync:fs.writeFileSync, renameSync:fs.renameSync, unlinkSync:fs.unlinkSync, openSync:fs.openSync, fsyncSync:fs.fsyncSync, closeSync:fs.closeSync, platform:'linux' };
  assert.throws(() => store.writePricebookFile(dirPath, ownerId, '{}', { ...real, renameSync:() => { throw Object.assign(new Error('rename'), { code:'EIO' }); } }), { code:'EIO' });
  assert.deepEqual(fs.readdirSync(dirPath), [ownerId + '.json'], 'no marker or temporary file is left');
  assert.throws(() => store.writePricebookFile(dirPath, ownerId, '{}', { ...real, writeFileSync:(file, data, options) => { if (String(file).endsWith('.unconfirmed')) throw Object.assign(new Error('marker'), { code:'ENOSPC' }); return real.writeFileSync(file, data, options); } }), { code:'ENOSPC' });
  assert.deepEqual(fs.readdirSync(dirPath), [ownerId + '.json']);
  assert.equal(fs.readFileSync(target, 'utf8'), '{"ownerId":"x","services":[]}');
});

test('F02: two processes saving against the same revision cannot both succeed', () => {
  const svc = live(fenceSvc());
  const a = bridge.readApplicationBook(svc.ownerId), b = structuredClone(a);
  a.services[0].pricing.offeringRates.installedFencePerLF = 41; b.defaults.travelFee = 9;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'f02-')), input = path.join(work, 'b.json'), child = path.join(work, 'b.mjs');
  fs.writeFileSync(input, JSON.stringify(b));
  fs.writeFileSync(child, `const bridge=await import(${JSON.stringify(new URL('../server/src/quoteDoneBridge.js', import.meta.url).href)});const fs=await import('node:fs');try{console.log(JSON.stringify(bridge.saveApplicationBook(${JSON.stringify(svc.ownerId)},JSON.parse(fs.readFileSync(process.argv[2],'utf8')))));}catch(e){console.log(JSON.stringify({error:e.code,status:e.statusCode}));}`);
  const realWrite = fs.writeFileSync; let other;
  fs.writeFileSync = (file, ...rest) => { if (!other && String(file).includes(svc.ownerId + '.') && String(file).endsWith('.tmp')) other = spawnSync(process.execPath, [child, input], { encoding:'utf8', env:process.env }); return realWrite(file, ...rest); };
  syncBuiltinESMExports();
  let saved; try { saved = bridge.saveApplicationBook(svc.ownerId, a); } finally { fs.writeFileSync = realWrite; syncBuiltinESMExports(); }
  assert.equal(saved.success, true);
  const otherResult = JSON.parse(other.stdout.trim().split('\n').pop());
  assert.equal(otherResult.error, 'PRICEBOOK_BUSY', 'the second writer gets a conflict instead of a silent overwrite');
  assert.equal(otherResult.status, 409);
  const final = bridge.readApplicationBook(svc.ownerId);
  assert.equal(final.services[0].pricing.offeringRates.installedFencePerLF, 41);
  assert.equal(final.defaults.travelFee, 0, 'the rejected edit was not applied and was never reported as saved');
});

test('F03 + audit defects 6 and 7: a pending confirmation keeps a newer entry, blocks a second confirmation and blocks review', async () => {
  const source = fs.readFileSync(new URL('../client/src/onboarding.jsx', import.meta.url), 'utf8');
  const edit = source.slice(source.indexOf('  function editValue(value) {'), source.indexOf('  function positionFor(loaded) {'));
  const confirm = source.slice(source.indexOf('  async function confirmField() {'), source.indexOf('  async function reviewDraft() {'));
  const review = source.slice(source.indexOf('  async function reviewDraft() {'), source.indexOf('  async function suggest() {'));
  const state = { rawValue:'25', position:0, readBack:{ value:25, spoken:'25' }, aiNotice:'' };
  const target = { current:{ draftId:'d', serviceType:'CUSTOM', field:'price', rawValue:'25' } };
  const requests = []; let complete;
  const api = (url, options = {}) => { requests.push({ url, ...options }); return new Promise(resolve => { complete = resolve; }); };
  const set = key => value => { state[key] = value; if (key === 'rawValue') target.current = { ...target.current, rawValue:value }; };
  const handlers = new Function('api', 'setRawValue', 'setReadBack', 'setDraft', 'setAnswer', 'setAiNotice', 'setPosition', 'setError', 'sameAssistTarget', 'STALE_CONFIRM_NOTICE', 'assistTarget', 'state', 'confirmFlight', 'setConfirmBusy', 'writePricebookTransfer', 'go',
    "const draft={id:'d',confirmedFields:{CUSTOM:[]}};const current={serviceType:'CUSTOM',field:'price',type:'number'};const interviewFields=[current,{serviceType:'CUSTOM',field:'minimumJob',type:'number'}];const position=0;const readBack=state.readBack;const rawValue=state.rawValue;"
    + edit + confirm + review + 'return {editValue,confirmField,reviewDraft};')(api, set('rawValue'), set('readBack'), () => {}, () => {}, set('aiNotice'), set('position'), () => {}, sameAssistTarget,
      (await import('../client/src/interviewAssist.js')).STALE_CONFIRM_NOTICE, target, state, { current:false }, () => {}, () => { throw new Error('review must not transfer while saving'); }, () => {});
  const saving = handlers.confirmField();
  handlers.editValue('50');
  await handlers.confirmField();   // a second confirmation while the first is pending does nothing
  await handlers.reviewDraft();    // review while a confirmation is pending does nothing
  assert.equal(requests.length, 1, 'one save request only; no second confirmation and no review request');
  complete({ draft:{ id:'d', fields:requests[0].body.fields, confirmedFields:requests[0].body.confirmedFields } });
  await saving;
  assert.equal(requests[0].body.fields.CUSTOM.price, 25);
  assert.equal(state.rawValue, '50', 'the newer typed value is kept');
  assert.equal(state.position, 0, 'the interview does not move on');
  assert.match(state.aiNotice, /new entry is still here/);
});

test('F05: the sanitizer binds currency to the reproduced quote', () => {
  const svc = live(fenceSvc(), defaults({ currency:'CAD' }));
  const book = store.loadPricebook(svc.ownerId), raw = book.services[0];
  const internal = bridge.calculateApplicationQuote(book, raw, { serviceId:raw.id, customerInputs:job() }, { ownerId:svc.ownerId }).internalResult;
  assert.equal(engineIndex.sanitizeForCustomerVNext(internal).resultType, 'INSTANT_ESTIMATE_READY');
  for (const change of [r => { r.currency = 'USD'; }, r => { r.currency = 'EUR'; }, r => { delete r.currency; }]) {
    const tampered = structuredClone(internal); change(tampered);
    assert.equal(engineIndex.sanitizeForCustomerVNext(tampered).resultType, 'ESTIMATE_REQUIRES_REVIEW');
  }
});

test('F06: an AI answer with no clear price asks the owner to clarify, with one provider call and no retry', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok:true, json:async () => ({ candidates:[{ finishReason:'STOP', content:{ parts:[{ text:'{"value":null}' }] } }] }) }; };
  await assert.rejects(interpretInterviewAnswer({ serviceType:'CUSTOM', field:'price', answer:'not sure what to charge', pricing:{ unit:'flat' } }, { env:{ GEMINI_API_KEY:'synthetic' }, fetchImpl }),
    error => error.code === 'PRICEBOOK_AI_CLARIFICATION_REQUIRED' && error.statusCode === 422 && error.retryable === false);
  assert.equal(calls, 1);
});

test('F04 and G01: readiness for a 10 x 10 flat-roof catalog stays correct and bounded; CI runs the strict quote gate', async () => {
  const { flatRoof } = await import('../verification/engine-independent/fixtures.mjs');
  const f = flatRoof(), p = f.ownerPricing.pricing;
  for (const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft']) p[field] = {};
  f.ownerPricing.knownOfferings = { membraneType:{}, replacementMembraneType:{} };
  for (let i = 0; i < 10; i++) { const key = 'membrane_' + i; p.laborPerSqft[key] = 500; p.membraneCostPerSqft[key] = 700; p.tearOffPerSqft[key] = 200; f.ownerPricing.knownOfferings.membraneType[key] = crypto.randomUUID(); f.ownerPricing.knownOfferings.replacementMembraneType[key] = crypto.randomUUID(); }
  const started = performance.now(), status = engineIndex.vNextServiceStatus(f.ownerPricing, { ...f.businessDefaults, currency:'CAD' }), ms = performance.now() - started;
  assert.equal(status.status, 'QUOTING LIVE');
  assert.equal(status.productCoverage.length, 100, 'every product pair is still covered');
  assert.ok(ms < 3000, `10 x 10 readiness took ${Math.round(ms)} ms`);
  p.tearOffPerSqft.membrane_3 = -1;   // malformed data anywhere still fails closed
  assert.equal(engineIndex.vNextServiceStatus(f.ownerPricing, { ...f.businessDefaults, currency:'CAD' }).status, 'NEEDS PRICING');
  assert.match(fs.readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'), /run: npm run test:quote/);
});

// ---- Fourth review (October 4): the nine remaining defects ----
const readiness = await import('../server/quote-engine-vnext/priceBook.js');
const scratchStore = () => { const d = fs.mkdtempSync(path.join(process.env.PRICEBOOK_PATH, 'r4-')), id = 'o-' + crypto.randomUUID(); fs.writeFileSync(path.join(d, id + '.json'), '{"ownerId":"x","services":[],"v":"old"}'); return { d, id }; };
const realOps = () => ({ writeFileSync:fs.writeFileSync, renameSync:fs.renameSync, unlinkSync:fs.unlinkSync, openSync:fs.openSync, fsyncSync:fs.fsyncSync, closeSync:fs.closeSync, existsSync:fs.existsSync, platform:'linux' });

test('Defect 1: a failed recovery save never clears the pause left by an earlier unconfirmed save', () => {
  const { d, id } = scratchStore();
  fs.writeFileSync(path.join(d, id + '.unconfirmed'), 'earlier unconfirmed save\n');
  for (const failing of [{ renameSync:() => { throw Object.assign(new Error('rename'), { code:'EIO' }); } }, { fsyncSync:() => { throw Object.assign(new Error('flush'), { code:'EIO' }); } }]) {
    assert.throws(() => store.writePricebookFile(d, id, '{"v":"new"}', { ...realOps(), ...failing }));
    assert.equal(fs.existsSync(path.join(d, id + '.unconfirmed')), true, 'quoting stays paused');
  }
});

test('Defect 2: when only the flush after clearing the pause fails, the save succeeds and nothing claims quoting is paused', () => {
  const { d, id } = scratchStore();
  let flushes = 0;
  store.writePricebookFile(d, id, '{"v":"new"}', { ...realOps(), fsyncSync:fd => { if (++flushes === 3) throw Object.assign(new Error('flush'), { code:'EIO' }); return fs.fsyncSync(fd); } });
  assert.equal(fs.existsSync(path.join(d, id + '.unconfirmed')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, id + '.json'), 'utf8')).v, 'new');
  let unlinks = 0;
  assert.throws(() => store.writePricebookFile(d, id, '{"v":"newer"}', { ...realOps(), unlinkSync:file => { if (String(file).endsWith('.unconfirmed') && ++unlinks === 1) throw Object.assign(new Error('unlink'), { code:'EIO' }); return fs.unlinkSync(file); } }),
    error => error.code === 'PRICEBOOK_PAUSE_NOT_CLEARED' && /stays paused/.test(error.message));
  assert.equal(fs.existsSync(path.join(d, id + '.unconfirmed')), true, 'the message matches reality: still paused');
});

const { spawn } = await import('node:child_process');
const holdSaveLock = (ownerId, mode) => new Promise((resolve, reject) => {
  // A separate process takes the save lock exactly as the app does, then either keeps it (alive) or crashes holding it.
  const storeUrl = new URL('../server/priceBookService.js', import.meta.url).href;
  const script = `const store=await import(${JSON.stringify(storeUrl)});store.withPricebookLock(${JSON.stringify(ownerId)},()=>{console.log('locked');${mode === 'crash' ? "process.kill(process.pid,'SIGKILL');" : "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,3500);"}});`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], { cwd:path.dirname(new URL(import.meta.url).pathname) + '/..', stdio:['ignore', 'pipe', 'inherit'] });
  child.stdout.on('data', chunk => { if (String(chunk).includes('locked')) resolve(child); });
  child.on('error', reject);
  child.on('exit', (code, signal) => { if (code !== 0 || signal) reject(new Error('Save-lock holder exited: ' + (signal || code))); });
});
const exited = child => new Promise(resolve => { if (child.exitCode !== null || child.signalCode) resolve(); else child.on('exit', () => resolve()); });

test('Save lock: a living holder is never overridden, a crashed holder releases at once, old lock files are ignored, no lock files are created', async () => {
  const svc = live(fenceSvc());
  const holder = await holdSaveLock(svc.ownerId, 'alive');
  const current = bridge.readApplicationBook(svc.ownerId), started = Date.now();
  assert.throws(() => bridge.saveApplicationBook(svc.ownerId, { revision:current.revision, services:current.services, defaults:{ ...current.defaults, travelFee:9 } }), { code:'PRICEBOOK_BUSY' });
  assert.ok(Date.now() - started < 3000, 'waiting is bounded');
  await exited(holder);
  const crashed = await holdSaveLock(svc.ownerId, 'crash');
  await exited(crashed);
  fs.writeFileSync(path.join(process.env.PRICEBOOK_PATH, svc.ownerId + '.lock'), '12345');   // lock file from the previous version
  const afterCrash = bridge.readApplicationBook(svc.ownerId), quick = Date.now();
  bridge.saveApplicationBook(svc.ownerId, { revision:afterCrash.revision, services:afterCrash.services, defaults:{ ...afterCrash.defaults, travelFee:9 } });
  assert.ok(Date.now() - quick < 1500, 'a crashed holder does not block saves');
  assert.equal(bridge.readApplicationBook(svc.ownerId).defaults.travelFee, 9);
  assert.deepEqual(fs.readdirSync(process.env.PRICEBOOK_PATH).filter(name => name.startsWith(svc.ownerId) && name.endsWith('.lock')), [svc.ownerId + '.lock'], 'saves create no lock files');
});

test('Save lock: two processes saving the same revision produce one saved edit and one refusal, never a silent overwrite', async () => {
  const svc = live(fenceSvc()), base = bridge.readApplicationBook(svc.ownerId);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'pair-')), bridgeUrl = new URL('../server/src/quoteDoneBridge.js', import.meta.url).href;
  const run = (label, change) => new Promise(resolve => {
    const file = path.join(work, label + '.json'), book = structuredClone(base); change(book); fs.writeFileSync(file, JSON.stringify(book));
    const child = spawn(process.execPath, ['--input-type=module', '-e', `const b=await import(${JSON.stringify(bridgeUrl)});const fs=await import('node:fs');try{b.saveApplicationBook(${JSON.stringify(svc.ownerId)},JSON.parse(fs.readFileSync(${JSON.stringify(file)},'utf8')));console.log('saved');}catch(e){console.log('refused:'+e.statusCode);}`], { env:process.env, stdio:['ignore', 'pipe', 'inherit'] });
    let out = ''; child.stdout.on('data', c => { out += c; }); child.on('exit', () => resolve(out.trim()));
  });
  const results = await Promise.all([run('a', b => { b.services[0].pricing.offeringRates.installedFencePerLF = 41; }), run('b', b => { b.defaults.travelFee = 9; })]);
  assert.equal(results.filter(r => r === 'saved').length, 1, JSON.stringify(results));
  assert.equal(results.filter(r => r.startsWith('refused:409')).length, 1, JSON.stringify(results));
  const final = bridge.readApplicationBook(svc.ownerId);
  const priceSaved = final.services[0].pricing.offeringRates.installedFencePerLF === 41, feeSaved = final.defaults.travelFee === 9;
  assert.equal(priceSaved !== feeSaved, true, 'exactly the accepted edit is in the book');
});

const { flatRoof:flatRoofFixture } = await import('../verification/engine-independent/fixtures.mjs');
function flatCatalog(replacements, existing, tweak = () => {}) {
  // A valid persisted flat-roof service (identity, source and approval-ready fields from the shared fixture) with N x M products.
  const f = flatRoofFixture(), service = f.ownerPricing, p = service.pricing;
  for (const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft']) p[field] = {};
  service.knownOfferings = { membraneType:{}, replacementMembraneType:{} };
  for (let i = 0; i < replacements; i++) { const k = 'r' + i; p.laborPerSqft[k] = 500; p.membraneCostPerSqft[k] = 700; service.knownOfferings.replacementMembraneType[k] = crypto.randomUUID(); }
  for (let i = 0; i < existing; i++) { const k = 'e' + i; p.tearOffPerSqft[k] = 200; service.knownOfferings.membraneType[k] = crypto.randomUUID(); }
  tweak(service);
  return { service, defaults:{ ...f.businessDefaults, currency:'CAD' } };
}
const coverage = status => JSON.stringify({ status:status.status, errors:[...status.validationErrors].sort(), pairs:(status.productCoverage || []).map(p => [JSON.stringify(p.selection), p.ok ?? p.status ?? p.configurationComplete]).sort() });

test('Readiness: every pair is checked exactly; the customer-facing check stops at the first live product with the same answer and stays fast', () => {
  const cases = {
    complete:flatCatalog(4, 4),
    'first product incomplete':flatCatalog(4, 4, s => { delete s.pricing.membraneCostPerSqft.r0; }),
    'only the last product complete':flatCatalog(3, 3, s => { delete s.pricing.membraneCostPerSqft.r0; delete s.pricing.membraneCostPerSqft.r1; }),
    'nothing complete':flatCatalog(3, 3, s => { for (const k of Object.keys(s.pricing.membraneCostPerSqft)) delete s.pricing.membraneCostPerSqft[k]; }),
    'malformed sibling':flatCatalog(4, 4, s => { s.pricing.tearOffPerSqft.e3 = -1; })
  };
  for (const [name, { service, defaults }] of Object.entries(cases)) {
    const full = readiness.vNextServiceStatus(structuredClone(service), defaults), quick = readiness.vNextServiceStatus(structuredClone(service), defaults, { firstLiveProduct:true });
    assert.equal(quick.status, full.status, name);
    if (full.status !== 'QUOTING LIVE') assert.deepEqual([...quick.validationErrors].sort(), [...full.validationErrors].sort(), name + ': same reasons when not live');
  }
  assert.equal(readiness.vNextServiceStatus(cases.complete.service, cases.complete.defaults).productCoverage.length, 16, 'owner view covers every pair');
  assert.equal(/derivedPairProducts|pruneToSelection/.test(fs.readFileSync(new URL('../server/quote-engine-vnext/priceBook.js', import.meta.url), 'utf8')), false, 'no shortcut or pruning remains');
  const big = flatCatalog(40, 40), started = performance.now(), quick = readiness.vNextServiceStatus(big.service, big.defaults, { firstLiveProduct:true }), ms = performance.now() - started;
  assert.equal(quick.status, 'QUOTING LIVE');
  assert.ok(ms < 500, `customer-facing 40 x 40 check took ${Math.round(ms)} ms`);
  console.log('customer-facing 40 x 40 readiness ms:', Math.round(ms));
});

test('Readiness for large pair catalogs: per-product owner coverage is exact, never misses a live pair, and stays under a second', () => {
  const statusOf = (service, defaults, quick) => readiness.vNextServiceStatus(structuredClone(service), defaults, quick ? { firstLiveProduct:true } : {});
  const variants = {
    complete:flatCatalog(12, 12),
    'first replacement and first existing unusable':flatCatalog(12, 12, s => { delete s.pricing.membraneCostPerSqft.r0; delete s.pricing.tearOffPerSqft.e0; }),
    'one replacement and one existing missing':flatCatalog(12, 12, s => { delete s.pricing.membraneCostPerSqft.r5; delete s.knownOfferings.membraneType.e7; }),
    'nothing complete':flatCatalog(11, 11, s => { for (const k of Object.keys(s.pricing.membraneCostPerSqft)) delete s.pricing.membraneCostPerSqft[k]; })
  };
  for (const [name, { service, defaults }] of Object.entries(variants)) {
    const owner = statusOf(service, defaults, false), customer = statusOf(service, defaults, true);
    assert.equal(owner.status, customer.status, name + ': owner and customer views agree on live/not live');
  }
  const partial = statusOf(variants['one replacement and one existing missing'].service, variants['one replacement and one existing missing'].defaults, false);
  const flaggedProducts = [...new Set(partial.productCoverage.filter(p => !p.configurationComplete).flatMap(p => Object.entries(p.selection).filter(([field,value]) => (field === 'replacementMembraneType' && value === 'r5') || (field === 'membraneType' && value === 'e7')).map(([,value]) => value)))].sort();
  assert.deepEqual(flaggedProducts, ['e7', 'r5'], 'exactly the incomplete products are flagged in their checked pair');
  assert.equal(partial.productCoverage.filter(p => !p.configurationComplete).length, 2, 'no unrelated checked pair is falsely flagged');
  const big = flatCatalog(40, 40), started = performance.now(), owner = statusOf(big.service, big.defaults, false), ms = performance.now() - started;
  assert.equal(owner.status, 'QUOTING LIVE');
  assert.equal(owner.productCoverage.length, 79, 'distinct reference pairs for a 1,600-pair catalog');
  assert.ok(ms < 2000, `owner-facing 40 x 40 readiness took ${Math.round(ms)} ms`);
  console.log('owner-facing 40 x 40 readiness ms:', Math.round(ms));
});
