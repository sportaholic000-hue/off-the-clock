import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { custom, flooring, fixture, mowing, flatRepair, siding, concrete, flatRoof } from '../verification/engine-independent/fixtures.mjs';
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

  const directStatus = vNextServiceStatus(input.ownerPricing, input.businessDefaults);
  assert.ok(directStatus.ownerDiagnostics.some(item => item.kind === 'included_price_scenario'));

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
  p.installedMaterialsPercent['offeringRates.installedFencePerLF'] = 0;
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
  p.installedMaterialsPercent['offeringRates.installedWallPerSqft'] = 0;
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
  p.installedMaterialsPercent['offeringRates.installedFencePerLF'] = 0;
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

  // 125 LF * 0.004 cent/LF = exactly 0.5 cent, which rounds half-up to one
  // billed cent. At 124 LF the positive 0.496-cent quote is held for review;
  // neither configuration is reclassified as an explicitly free zero.
  labor.ownerPricing.pricing.installedLaborPercent = { 'offeringRates.installedFencePerLF':60 };
  labor.ownerPricing.pricing.installedMaterialsPercent = { 'offeringRates.installedFencePerLF':40 };
  delete labor.ownerPricing.zeroPricePolicy;
  labor.customerInputs.terrainSlope = 'flat';
  labor.customerInputs.linearFeet = 125;
  let boundary = generateQuoteVNext(labor);
  assert.equal(boundary.resultType, 'INSTANT_ESTIMATE_READY', JSON.stringify(boundary));
  assert.equal(boundary.options[0].calculationRecord.scenarios.mid.finalTotalCents, 1);
  assert.notEqual(boundary.options[0].lineItems[0].noChargeReason, 'explicitly_free');
  labor.customerInputs.linearFeet = 124;
  boundary = generateQuoteVNext(labor);
  assert.equal(boundary.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(boundary.reviewReason, /positive configured pricing.*below one cent/i);
});

test('QE-006: classified zero preserves season, tax, minimum, range, and installed no-double-markup rules', () => {
  const input = includedZeroGate();
  Object.assign(input.ownerPricing, { peakMonths:[10], peakSurchargePercent:10 });
  Object.assign(input.businessDefaults, {
    markupPercent:25,
    minimumJobPrice:500000,
    rangeBufferPercent:10
  });

  // Independent expected cents:
  // 400,000 base + (400,000 * 60% labor * 10% peak) = 424,000.
  // Installed sell-price lines receive no 25% markup; zero material share
  // produces zero materials tax. The 500,000 minimum adds 76,000 and also
  // floors both sides of the 10% displayed range at 500,000.
  const observed = approveReloadAndQuote(input, 'synthetic-qe006-financial-interactions');
  assert.equal(observed.approvalError, null);
  assert.equal(observed.status.status, 'QUOTING LIVE');
  const option = observed.quote.internalResult.options[0];
  const scenario = option.calculationRecord.scenarios.mid;
  assert.equal(scenario.seasonal.amountCents, 24000);
  assert.equal(scenario.markup.baseCents, 0);
  assert.equal(scenario.markup.amountCents, 0);
  assert.equal(scenario.minimum.subtotalBeforeMinimumCents, 424000);
  assert.equal(scenario.minimum.adjustmentCents, 76000);
  assert.equal(scenario.tax.taxCents, 0);
  assert.equal(scenario.finalTotalCents, 500000);
  assert.deepEqual([
    option.calculationRecord.range.lowCents,
    option.calculationRecord.range.midCents,
    option.calculationRecord.range.highCents
  ], [500000, 500000, 500000]);
  const included = option.lineItems.find(line => line.calculation?.ratePath === 'offeringRates.gate_walk');
  assert.equal(included.noChargeReason, 'included_in_another_price');
  assert.equal(included.includedInPricePath, 'offeringRates.installedFencePerLF');
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
    if (name === 'cycle') {
      const status = vNextServiceStatus(input.ownerPricing, input.businessDefaults);
      assert.ok(status.ownerDiagnostics.some(item => item.kind === 'included_price_cycle'), JSON.stringify(status));
    }
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

function allTradeControls() {
  const roofReplacement = fixture('ROOFING_REPLACEMENT', {
    laborPerSquare:{ asphalt_shingle:5000 },
    materialCostPerSquare:{ asphalt_shingle:10000 },
    tearOffPerSquare:{ asphalt_shingle:2000 },
    underlaymentPerSquare:{ asphalt_shingle:1500 },
    underlaymentPriceBasis:{ asphalt_shingle:'installed_area_sell_price' },
    accessoryPricingMode:'itemized',
    materialAccessoryBasis:'excludes_itemized_accessories',
    starterPerLF:100,
    dripEdgePerLF:200,
    ridgeCapPerLF:300,
    deckingPerSheet:5000,
    minimumJob:0
  }, {
    roofSizeMethod:'roof_measured', roofSizeInput:1000,
    existingRoofType:'asphalt_shingle', replacementRoofType:'asphalt_shingle',
    pitch:'low', stories:1, existingLayers:1, roofComplexity:'simple', serviceScope:'full',
    starterLengthLF:100, dripEdgeLengthLF:100, ridgeCapLengthLF:20, deckingSheets:2
  });
  roofReplacement.ownerPricing.priceBasisByCategory.material = 'sell_price';

  const roofRepair = fixture('ROOFING_REPAIR', {
    laborHourlyRate:10000, repairMinimum:0,
    repairHours:{ asphalt_shingle:{ shingle_patch:{ small:2, medium:4, large:8 } } },
    repairMaterialAllowance:{ asphalt_shingle:{ shingle_patch:{ small:4000, medium:8000, large:16000 } } }
  }, { repairType:'shingle_patch', affectedArea:100, roofType:'asphalt_shingle', pitch:'medium', stories:2, leakPresent:false });

  const flatRoofReplacement = flatRoof();
  // Keep this control's arithmetic explicit instead of inheriting the normal
  // five-percent membrane ordering allowance from the fixture defaults.
  flatRoofReplacement.ownerPricing.pricing.membraneWasteFactor = 0;
  const interior = offeringFixture('INTERIOR_PAINTING', 'installed');
  const exterior = offeringFixture('EXTERIOR_PAINTING', 'installed');
  exterior.customerInputs.stories = 1;
  const floorReplacementBase = flooring('tile');
  const floorReplacement = fixture('FLOORING_REPLACEMENT', {
    ...floorReplacementBase.ownerPricing.pricing,
    subfloorAllowancePerSqft:100
  }, { ...floorReplacementBase.customerInputs, subfloorIssues:false });
  const fenceInstall = offeringFixture('FENCING_INSTALL', 'installed');
  const fenceReplacement = offeringFixture('FENCING_REPLACEMENT', 'installed');
  const sidingRepair = fixture('SIDING_REPAIR', {
    laborHourlyRate:10000, repairMinimum:0,
    repairHours:{ vinyl:{ minor:{ small:2, medium:4, large:8 } } },
    materialAllowance:{ vinyl:{ minor:{ small:5000, medium:10000, large:20000 } } }
  }, { sidingType:'vinyl', damageLevel:'minor', affectedArea:50, stories:2 });
  const driveway = fixture('CONCRETE_DRIVEWAY', {
    laborPerSqft:600, concreteCostPerCubicYard:18000, formworkPerLF:2500,
    minimumJob:0, basePrepPerSqft:175, wireReinforcementPerSqft:150
  }, { dimensionMethod:'exact', length:50, width:10, thickness:4, finishType:'broom', demolitionNeeded:false, reinforcement:'wire_mesh', accessDifficulty:'easy', baseNeeded:true });
  const cleanup = fixture('LANDSCAPING_CLEANUP', {
    cleanupBaseRatePerSqft:10,
    debrisPricing:{
      light:{ laborMultiplier:1, disposalFlat:5000 },
      moderate:{ laborMultiplier:1.5, disposalFlat:10000 },
      heavy:{ laborMultiplier:2, disposalFlat:15000 }
    },
    minimumServiceCharge:0, haulAwayFee:5000
  }, { yardSqft:1000, sqftMethod:'exact', debrisLevel:'heavy', slope:'flat', haulAway:true });
  const mulch = fixture('LANDSCAPING_MULCH', {
    mulchMaterialPerYard:{ brown:5000 }, mulchInstallLaborPerYard:3000,
    minimumServiceCharge:0, bedPrepLaborPerSqft:{ needs_weeding:20, overgrown:40 }, edgingPerLinearFoot:50
  }, { inputMethod:'sqft', mulchArea:270, mulchDepth:3, mulchType:'brown', bedCondition:'needs_weeding', bedSqft:270, edgingNeeded:true, edgeLF:100 });
  const sod = fixture('LANDSCAPING_SOD', {
    sodMaterialPerSqft:75, sodInstallLaborPerSqft:125, minimumServiceCharge:0, groundPrepPerSqft:50
  }, { sodSqft:1000, sqftMethod:'exact', groundPrepNeeded:true, slope:'flat', accessDifficulty:'easy' });
  const planting = fixture('LANDSCAPING_PLANTING', {
    plantingLaborPerPlant:{ small:1000, medium:2000, large:3000 },
    plantMaterialAllowance:{ small:500, medium:1000, large:1500 },
    minimumServiceCharge:0, bedPrepLaborPerSqft:{ needs_weeding:20, overgrown:40 },
    mulchMaterialPerYard:{ brown:5000 }, mulchInstallLaborPerYard:3000
  }, { plantsBySize:{ small:2, medium:1, large:1 }, bedCondition:'needs_weeding', bedSqft:100, mulchNeeded:true, mulchYards:2, mulchType:'brown' });

  return [
    ['ROOFING_REPLACEMENT', roofReplacement, 244600, '50,000 labor + 110,000 field material + 20,000 tear-off + 15,000 underlayment + 11,000 starter + 22,000 drip edge + 6,600 ridge + 10,000 decking'],
    ['ROOFING_REPAIR', roofRepair, 58600, '40,000 labor * 1.15 pitch * 1.10 stories = 50,600; + 8,000 material'],
    ['FLAT_ROOF_REPLACEMENT', flatRoofReplacement, 1400000, '1,000 sqft * (500 labor + 700 membrane + 200 tear-off), with explicit zero membrane waste'],
    ['FLAT_ROOF_REPAIR', flatRepair(), 36000, '3 hours * 10,000 + 6,000 material'],
    ['INTERIOR_PAINTING', interior, 380000, '500*600 walls + 200*300 ceiling + 100*200 trim'],
    ['EXTERIOR_PAINTING', exterior, 300000, '500*600 installed exterior wall price at the one-story baseline'],
    ['FLOORING_INSTALL', flooring('tile'), 178000, '200*300*1.10 labor + 200*500*1.12 material'],
    ['FLOORING_REPLACEMENT', floorReplacement, 178000, 'same 200 sqft base with no selected removal or subfloor repair'],
    ['FENCING_INSTALL', fenceInstall, 450000, '100*4,000 installed fence + two gates at 25,000'],
    ['FENCING_REPLACEMENT', fenceReplacement, 490000, '450,000 install + 50*800 selected removal'],
    ['SIDING_REPLACEMENT', siding(), 1170000, '1,000*400 labor + 1,000*700*1.10 material'],
    ['SIDING_REPAIR', sidingRepair, 54000, '4*10,000*1.10 stories + 10,000 material'],
    ['CONCRETE_DRIVEWAY', driveway, 892222, '300,000 labor + 122,222 concrete + 300,000 formwork + 87,500 prep + 82,500 wire'],
    ['CONCRETE_PATIO_SLAB', concrete(), 353889, '120,000 labor + 48,889 concrete + 150,000 formwork + 35,000 prep'],
    ['LANDSCAPING_CLEANUP', cleanup, 40000, '20,000 labor + 15,000 disposal + 5,000 haul-away'],
    ['LANDSCAPING_MULCH', mulch, 32275, '5,400 prep + 14,375 material + 7,500 install + 5,000 edging'],
    ['LANDSCAPING_SOD', sod, 253750, '78,750 material + 125,000 install + 50,000 prep'],
    ['LANDSCAPING_PLANTING', planting, 28500, '7,000 plant labor + 3,500 plant material + 2,000 prep + 10,000 mulch material + 6,000 mulch labor'],
    ['LANDSCAPING_MOWING', mowing(), 10000, '5,000 sqft * 2 cents'],
    ['CUSTOM', custom(), 12500, 'one confirmed flat service * 12,500']
  ];
}

for (const [serviceType, input, expectedCents, arithmetic] of allTradeControls()) {
  test('zero-pricing repair independent all-trade control: '+serviceType, () => {
    const result = generateQuoteVNext(input);
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', arithmetic+'; '+JSON.stringify(result));
    assert.equal(result.options[0].calculationRecord.scenarios.mid.finalTotalCents, expectedCents, arithmetic);
  });
}
