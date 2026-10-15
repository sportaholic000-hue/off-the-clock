import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { custom, flooring } from '../verification/engine-independent/fixtures.mjs';
import { offeringFixture } from './configuredOfferingsFixtures.mjs';
import { configuredScope } from './measuredScopeFixtures.mjs';
import { confirmedFixtureInputs, freeFixture, includedFixture } from './quoteEngineVNextFixtures.mjs';
import { generateQuoteVNext, vNextServiceStatus } from '../server/quote-engine-vnext/index.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import { loadPricebook } from '../server/priceBookService.js';

// Expected amounts were calculated before executing either the baseline or the
// repaired implementation. All amounts are integer cents:
// - custom $0-$100 range: low 0, midpoint 5,000, high 10,000;
// - fence base: 100 LF * 4,000 = 400,000;
// - interior walls: 500 sqft * 600 = 300,000;
// - flooring: labor 200*300*1.10 = 66,000; material
//   200*1.12*500 = 112,000; 10% materials tax = 11,200; total 189,200.
const date = { timeZone:'UTC', quoteInstant:'2026-10-14T12:00:00.000Z' };

function zeroClassification(service) {
  const policy = service.zeroPricePolicy;
  return policy && {
    freeCompleteService:policy.freeCompleteService,
    freeTiers:structuredClone(policy.freeTiers),
    includedPrices:structuredClone(policy.includedPrices)
  };
}

function saveDraft(input, prefix) {
  const owner = prefix + '-' + randomUUID();
  const service = structuredClone(input.ownerPricing);
  const policy = zeroClassification(service);
  delete service.origin;
  delete service.approvedValues;
  delete service.quoteDoneApproval;
  delete service.zeroPricePolicy;
  const initial = bridge.readApplicationBook(owner);
  const draft = bridge.convertApplicationBook({
    services:[service],
    defaults:{ currency:'USD', quoteTimeZone:'UTC', ...input.businessDefaults }
  }, 'toDollars');
  bridge.saveApplicationBook(owner, { ...draft, revision:initial.revision }, date);
  return { owner, policy, saved:bridge.readApplicationBook(owner) };
}

function approveReloadAndQuote(input, prefix) {
  const state = saveDraft(input, prefix);
  const serviceId = state.saved.services[0].id;
  let approvalError = null;
  try {
    bridge.approveApplicationService(state.owner, serviceId, {
      revision:state.saved.revision,
      confirmConfiguration:true,
      confirmLegacySettings:true,
      ...(state.policy ? { zeroClassification:state.policy } : {})
    }, date);
  } catch (error) {
    approvalError = error;
  }
  // Read through both application and storage boundaries after the approval
  // attempt. This is deliberately not an in-memory engine-only reproduction.
  const applicationBook = bridge.readApplicationBook(state.owner);
  const storedBook = loadPricebook(state.owner);
  const service = storedBook.services[0];
  const status = bridge.bookStatuses(storedBook, date)[0];
  const quote = bridge.calculateApplicationQuote(storedBook, service, {
    customerInputs:input.customerInputs,
    customerFeeSelections:{}
  }, { preparingIntake:true, ...date });
  return { ...state, approvalError, applicationBook, storedBook, service, status, quote };
}

test('QE-003: an alternative positive custom-range endpoint cannot cover its zero endpoint', () => {
  const input = custom();
  Object.assign(input.ownerPricing.pricing, {
    customPricingMode:'range', low:0, high:10000, unit:'flat'
  });
  delete input.ownerPricing.pricing.price;
  input.ownerPricing = includedFixture(input.ownerPricing, { low:'high' });

  const observed = approveReloadAndQuote(input, 'synthetic-qe003-range');
  const scenarios = observed.quote.internalResult?.options?.[0]?.calculationRecord?.scenarios;
  console.log(JSON.stringify({
    reproduction:'QE-003',
    approvalError:observed.approvalError?.message || null,
    persistedPolicy:observed.service.zeroPricePolicy || null,
    status:observed.status.status,
    approvalCurrent:observed.status.approvalCurrent,
    resultType:observed.quote.internalResult?.resultType,
    scenarioTotals:scenarios && [scenarios.low.finalTotalCents, scenarios.mid.finalTotalCents, scenarios.high.finalTotalCents]
  }));

  assert.equal(observed.approvalError?.statusCode, 400);
  assert.match(observed.approvalError?.message || '', /classification.*invalid/i);
  assert.equal(observed.service.zeroPricePolicy, undefined);
  assert.equal(observed.status.approvalCurrent, false);
  assert.equal(observed.status.status, 'NEEDS PRICING');
  assert.equal(observed.quote.internalResult.resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

function freeInstalledFenceBase() {
  const input = offeringFixture('FENCING_INSTALL', 'installed');
  const p = input.ownerPricing.pricing;
  p.offeringDetails.gates = {};
  p.offeringRates = { installedFencePerLF:0 };
  p.installedMaterialsPercent = {};
  p.installedLaborPercent = {};
  input.customerInputs.gates = {};
  input.customerInputs.terrainSlope = 'moderate';
  input.ownerPricing = freeFixture(input.ownerPricing);
  return input;
}

function includedZeroGate() {
  const input = offeringFixture('FENCING_INSTALL', 'installed');
  const p = input.ownerPricing.pricing;
  p.offeringRates.gate_walk = 0;
  delete p.installedMaterialsPercent['offeringRates.gate_walk'];
  delete p.installedLaborPercent['offeringRates.gate_walk'];
  Object.assign(input.businessDefaults, { taxMode:'TAX_MATERIALS', taxPercent:10 });
  input.ownerPricing = includedFixture(input.ownerPricing, {
    'offeringRates.gate_walk':'offeringRates.installedFencePerLF'
  });
  return input;
}

function includedZeroTrim() {
  const input = offeringFixture('INTERIOR_PAINTING', 'installed');
  const p = input.ownerPricing.pricing;
  input.customerInputs.ceilingsIncluded = false;
  delete input.customerInputs.ceilingAreaSqft;
  p.offeringRates.installedTrimPerLF = 0;
  delete p.installedMaterialsPercent['offeringRates.installedTrimPerLF'];
  delete p.installedLaborPercent['offeringRates.installedTrimPerLF'];
  Object.assign(input.businessDefaults, { taxMode:'TAX_MATERIALS', taxPercent:10 });
  input.ownerPricing = includedFixture(input.ownerPricing, {
    'offeringRates.installedTrimPerLF':'offeringRates.installedWallPerSqft'
  });
  return input;
}

function includedZeroRemoval() {
  const input = offeringFixture('FENCING_REPLACEMENT', 'installed');
  const p = input.ownerPricing.pricing;
  input.customerInputs.gates = {};
  p.offeringRates.removalPerLF = 0;
  delete p.installedMaterialsPercent['offeringRates.removalPerLF'];
  delete p.installedLaborPercent['offeringRates.removalPerLF'];
  Object.assign(input.businessDefaults, { taxMode:'TAX_MATERIALS', taxPercent:10 });
  input.ownerPricing = includedFixture(input.ownerPricing, {
    'offeringRates.removalPerLF':'offeringRates.installedFencePerLF'
  });
  return input;
}

function includedZeroAdditionalScope() {
  const input = configuredScope(flooring('tile'), 'floor_overlay', {
    mode:'installed',
    category:'material',
    existingFloorType:'vinyl_plank',
    newFlooringType:'tile',
    basePriceExcludesPreparation:true
  }, { floor_overlay_installed:0 }, {
    existingFloorType:'vinyl_plank',
    removalNeeded:false,
    overlayScopeConfirmed:true
  });
  const p = input.ownerPricing.pricing;
  p.installedMaterialsPercent = {};
  p.installedLaborPercent = {};
  input.ownerPricing.priceBasisByCategory.material = 'sell_price';
  input.ownerPricing.taxabilityByCategory.material = true;
  Object.assign(input.businessDefaults, { taxMode:'TAX_MATERIALS', taxPercent:10 });
  input.customerInputs = confirmedFixtureInputs(input.customerInputs);
  input.ownerPricing = includedFixture(input.ownerPricing, {
    'scopeRates.floor_overlay_installed':'materialPerSqft.tile'
  });
  return input;
}

const installedZeroCases = [
  ['base with a labor adjustment', freeInstalledFenceBase, 0],
  ['gate with materials-only tax', includedZeroGate, 400000],
  ['trim with materials-only tax', includedZeroTrim, 300000],
  ['removal with materials-only tax', includedZeroRemoval, 400000],
  ['additional scope with materials-only tax', includedZeroAdditionalScope, 189200]
];

for (const [name, make, expectedCents] of installedZeroCases) {
  test('QE-006: classified zero installed '+name+' needs no meaningless allocation', () => {
    const input = make();
    const observed = approveReloadAndQuote(input, 'synthetic-qe006-'+name.replaceAll(' ', '-'));
    const total = observed.quote.internalResult?.options?.[0]?.calculationRecord?.scenarios?.mid?.finalTotalCents;
    console.log(JSON.stringify({
      reproduction:'QE-006 '+name,
      approvalError:observed.approvalError?.message || null,
      status:observed.status.status,
      approvalCurrent:observed.status.approvalCurrent,
      resultType:observed.quote.internalResult?.resultType,
      expectedCents,
      observedCents:total ?? null,
      missingOwnerFields:observed.quote.internalResult?.missingOwnerFields || []
    }));
    assert.equal(observed.approvalError, null);
    assert.equal(observed.status.approvalCurrent, true);
    assert.equal(observed.status.status, 'QUOTING LIVE', JSON.stringify(observed.status));
    assert.equal(observed.quote.internalResult.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(observed.quote.internalResult));
    assert.equal(total, expectedCents);
  });
}

test('QE-006: positive and fractional-positive installed prices retain allocation requirements', () => {
  const material = includedZeroGate();
  material.ownerPricing.pricing.offeringRates.gate_walk = 25000;
  delete material.ownerPricing.zeroPricePolicy;
  const materialQuote = generateQuoteVNext(material);
  assert.equal(materialQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(materialQuote.missingOwnerFields.includes('installedMaterialsPercent.offeringRates.gate_walk'));

  const labor = freeInstalledFenceBase();
  labor.ownerPricing.pricing.offeringRates.installedFencePerLF = 0.004;
  labor.ownerPricing.zeroPricePolicy.freeCompleteService = false;
  const laborStatus = vNextServiceStatus(labor.ownerPricing, labor.businessDefaults);
  assert.equal(laborStatus.status, 'NEEDS PRICING');
  assert.ok(JSON.stringify(laborStatus).includes('installedLaborPercent.offeringRates.installedFencePerLF'));
});

test('QE-003 neighboring inclusion rules reject self-reference, cycles, missing and unselected covering paths', () => {
  const base = includedZeroGate();
  const variants = [];

  const self = structuredClone(base);
  self.ownerPricing.zeroPricePolicy.includedPrices = {
    'offeringRates.gate_walk':'offeringRates.gate_walk'
  };
  variants.push(['self-reference', self]);

  const cycle = structuredClone(base);
  cycle.ownerPricing.zeroPricePolicy.includedPrices = {
    'offeringRates.gate_walk':'offeringRates.installedFencePerLF',
    'offeringRates.installedFencePerLF':'offeringRates.gate_walk'
  };
  variants.push(['cycle', cycle]);

  const missing = structuredClone(base);
  missing.ownerPricing.zeroPricePolicy.includedPrices = {
    'offeringRates.gate_walk':'offeringRates.not_configured'
  };
  variants.push(['missing covering path', missing]);

  const unselected = offeringFixture('FENCING_REPLACEMENT', 'installed');
  unselected.ownerPricing.pricing.offeringRates.gate_walk = 0;
  unselected.customerInputs.oldFenceRemoval = false;
  delete unselected.customerInputs.removalLengthLF;
  unselected.ownerPricing = includedFixture(unselected.ownerPricing, {
    'offeringRates.gate_walk':'offeringRates.removalPerLF'
  });
  variants.push(['unselected covering charge', unselected]);

  for (const [name, input] of variants) {
    const quote = generateQuoteVNext(input);
    assert.equal(quote.resultType, 'ESTIMATE_REQUIRES_REVIEW', name+': '+JSON.stringify(quote));
  }
});

test('QE-003 neighboring inclusion rules exclude a tier whose covering charge becomes zero', () => {
  const input = includedZeroGate();
  Object.assign(input.businessDefaults, { taxMode:'TAX_NONE', taxPercent:0 });
  input.ownerPricing.tiers = [
    { name:'Covered', overrides:{} },
    { name:'No cover', overrides:{ offeringRates:{ installedFencePerLF:0 } } }
  ];
  const quote = generateQuoteVNext(input);
  assert.equal(quote.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(quote));
  assert.deepEqual(quote.options.map(option => option.tierName), ['Covered']);
  assert.ok(quote.failedTierDiagnostics.some(row => row.tierName === 'No cover'));
});
