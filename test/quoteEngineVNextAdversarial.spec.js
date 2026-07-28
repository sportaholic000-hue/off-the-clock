import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRICE_BASIS_CATEGORIES,
  TAXABILITY_CATEGORIES,
  generateQuoteVNext,
  getVNextPriceBookMetadata,
  quoteFromVNextPricebook,
  sanitizeForCustomerVNext,
  validateCustomerInputs,
  validateOwnerPricing,
  validateVNextPricebook,
  vNextPricebookStatuses,
  vNextServiceStatus,
  withClass2Defaults
} from '../server/quote-engine-vnext/index.js';

const feeRules = {
  travel: 'not_applicable',
  disposal: 'not_applicable',
  permit: 'not_applicable',
  overhead: 'not_applicable'
};

const costBasis = Object.fromEntries(PRICE_BASIS_CATEGORIES.map(category => [category, 'cost']));
const taxability = Object.fromEntries(TAXABILITY_CATEGORIES.map(category => [category, false]));
const markupApplies = Object.fromEntries(PRICE_BASIS_CATEGORIES.map(category => [category, true]));

const defaults = {
  markupPercent: 0,
  markupMode: 'markup',
  overheadFixed: 0,
  minimumJobPrice: 0,
  travelFee: 0,
  disposalFee: 0,
  permitFee: 0,
  taxMode: 'TAX_NONE',
  taxPercent: 0,
  rangeBufferPercent: 10,
  markupApplies,
  peakMonths: [],
  peakSurchargePercent: 0
};

function service(serviceType, pricing, overrides = {}) {
  return {
    active: true,
    serviceType,
    service: serviceType,
    pricing: withClass2Defaults(serviceType, pricing),
    feeRules: structuredClone(feeRules),
    priceBasisByCategory: structuredClone(costBasis),
    taxabilityByCategory: structuredClone(taxability),
    peakMonths: [],
    peakSurchargePercent: 0,
    ...overrides
  };
}

function run(serviceType, customerInputs, ownerPricing, overrides = {}) {
  return generateQuoteVNext({
    serviceType,
    customerInputs,
    ownerPricing,
    businessDefaults: defaults,
    currentMonth: 1,
    ...overrides
  });
}

function lineMap(result) {
  return Object.fromEntries((result.lineItems || []).map(line => [line.name, line.amountCents]));
}

function roofService(pricing = {}, overrides = {}) {
  return service('ROOFING_REPLACEMENT', {
    laborPerSquare: { asphalt_shingle: 5000 },
    materialCostPerSquare: { asphalt_shingle: 10000 },
    tearOffPerSquare: { asphalt_shingle: 2000 },
    underlaymentPerSquare: { asphalt_shingle: 1500 },
    accessoryPricingMode: 'per_square_allin',
    minimumJob: 0,
    ...pricing
  }, {
    priceBasisByCategory: { ...costBasis, material: 'sell_price' },
    ...overrides
  });
}

function roofInputs(overrides = {}) {
  return {
    roofSizeMethod: 'roof_measured',
    roofSizeInput: 1000,
    existingRoofType: 'asphalt_shingle',
    replacementRoofType: 'asphalt_shingle',
    pitch: 'low',
    stories: 1,
    existingLayers: 1,
    roofComplexity: 'simple',
    serviceScope: 'full',
    ...overrides
  };
}

function flatService(pricing = {}, overrides = {}) {
  return service('FLAT_ROOF_REPLACEMENT', {
    laborPerSqft: { epdm: 500, average: 550 },
    membraneCostPerSqft: { epdm: 700, average: 750 },
    tearOffPerSqft: { epdm: 200, average: 225 },
    minimumJob: 0,
    insulationPerSqft: 250,
    ...pricing
  }, overrides);
}

function flatInputs(overrides = {}) {
  return {
    roofSqft: 1000,
    sqftMethod: 'exact',
    membraneType: 'epdm',
    existingLayers: 1,
    accessDifficulty: 'easy',
    serviceScope: 'full',
    buildingType: 'residential',
    ...overrides
  };
}

function interiorService(pricing = {}, overrides = {}) {
  return service('INTERIOR_PAINTING', {
    laborPerWallSqftPerCoat: 100,
    materialPerWallSqftPerCoat: 50,
    minimumJob: 0,
    ceilingLaborPerSqftPerCoat: 100,
    ceilingMaterialPerSqftPerCoat: 50,
    trimLaborPerLF: 100,
    trimMaterialPerLF: 50,
    ...pricing
  }, overrides);
}

function interiorInputs(overrides = {}) {
  return {
    areaInputMethod: 'wall_sqft',
    wallAreaSqft: 100,
    wallHeight: 'standard',
    surfaceCondition: 'good',
    coats: 2,
    ceilingsIncluded: false,
    trimIncluded: false,
    ...overrides
  };
}

function flooringService(pricing = {}, overrides = {}) {
  return service('FLOORING_INSTALL', {
    laborPerSqft: { vinyl_plank: 300 },
    materialPerSqft: { vinyl_plank: 500 },
    minimumJob: 0,
    vinylPlankUnderlaymentRule: 'never_included',
    ...pricing
  }, overrides);
}

function flooringInputs(overrides = {}) {
  return {
    sqft: 300,
    sqftMethod: 'exact',
    newFlooringType: 'vinyl_plank',
    existingFloorType: 'none',
    removalNeeded: false,
    roomCount: 1,
    layoutPattern: 'straight',
    stairSteps: 0,
    ...overrides
  };
}

function fencingService(pricing = {}, overrides = {}) {
  return service('FENCING_INSTALL', {
    laborPerLinearFoot: { wood: 1000 },
    materialPerLinearFoot: { wood: 2000 },
    postPrice: { wood: 2500 },
    concretePerPost: 700,
    postsIncludedInMaterial: { wood: false },
    gatePrice: { wood: 25000 },
    minimumJob: 0,
    ...pricing
  }, overrides);
}

function fencingInputs(overrides = {}) {
  return {
    linearFeet: 100,
    lfMethod: 'exact',
    fenceType: 'wood',
    fenceHeight: 6,
    gateCount: 0,
    postCount: 10,
    terrainSlope: 'flat',
    ...overrides
  };
}

function sidingService(pricing = {}, overrides = {}) {
  return service('SIDING_REPLACEMENT', {
    laborPerSqft: { vinyl: 400 },
    materialPerSqft: { vinyl: 700 },
    minimumJob: 0,
    removalPerSqft: 100,
    trimPerLinearFoot: 100,
    ...pricing
  }, overrides);
}

function sidingInputs(overrides = {}) {
  return {
    areaInputMethod: 'sqft',
    sidingAreaSqft: 1000,
    sidingType: 'vinyl',
    stories: 1,
    oldSidingRemoval: true,
    trimIncluded: true,
    trimLengthLF: 200,
    ...overrides
  };
}

test('activation validates every configured offering, not only the first map key', () => {
  const ownerPricing = flooringService({
    laborPerSqft: { vinyl_plank: 300, tile: { misspelled: 450 } },
    materialPerSqft: { vinyl_plank: 500, tile: { misspelled: 700 } }
  });
  const status = vNextServiceStatus(ownerPricing);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.invalidOwnerFields.includes('laborPerSqft.tile'), true);
  assert.equal(status.invalidOwnerFields.includes('materialPerSqft.tile'), true);
});

test('quote-time requests for an unconfigured offering require review', () => {
  const result = run('FLOORING_INSTALL', flooringInputs({ newFlooringType: 'tile' }), flooringService());
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.missingOwnerFields.includes('laborPerSqft.tile'), true);
  assert.equal(result.missingOwnerFields.includes('materialPerSqft.tile'), true);
});

test('flat-roof activation requires an actual configured membrane and never relies on Average', () => {
  const actualOffering = flatService({
    laborPerSqft: { epdm: 500 },
    membraneCostPerSqft: { epdm: 700 },
    tearOffPerSqft: { epdm: 200 }
  });
  const onlyAverage = flatService({
    laborPerSqft: { average: 500 },
    membraneCostPerSqft: { average: 700 },
    tearOffPerSqft: { average: 200 }
  });
  assert.equal(vNextServiceStatus(actualOffering).status, 'QUOTING LIVE');
  assert.equal(vNextServiceStatus(onlyAverage).status, 'NEEDS PRICING');
});

test('a medium repair cannot quote from a nested map containing only small', () => {
  const ownerPricing = service('ROOFING_REPAIR', {
    laborHourlyRate: 10000,
    repairMinimum: 0,
    repairHours: { asphalt_shingle: { patch: { small: 2 } } },
    repairMaterialAllowance: { asphalt_shingle: { patch: { small: 5000 } } }
  });
  const result = run('ROOFING_REPAIR', {
    repairType: 'patch', affectedArea: 100, roofType: 'asphalt_shingle',
    pitch: 'low', stories: 1, leakPresent: false
  }, ownerPricing);
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.missingOwnerFields.includes('repairHours.asphalt_shingle.patch.medium'), true);
});

test('misspelled Class 2 map keys fail closed', () => {
  const ownerPricing = roofService({
    pitchMultiplier: { low: 1, medum: 1.15, steep: 1.25, very_steep: 1.4 }
  });
  const result = run('ROOFING_REPLACEMENT', roofInputs(), ownerPricing);
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(result.validationMessages.join(' '), /pitchMultiplier must contain exactly/);
});

test('reversed flooring room-size thresholds fail shared validation', () => {
  const ownerPricing = flooringService({ roomSizeThresholds: { smallMaxSqft: 400, mediumMaxSqft: 200 } });
  const owner = validateOwnerPricing('FLOORING_INSTALL', flooringInputs(), ownerPricing.pricing);
  assert.equal(owner.ok, false);
  assert.match(owner.validationMessages.join(' '), /smallMaxSqft must be less/);
  assert.equal(vNextServiceStatus(ownerPricing).status, 'NEEDS PRICING');
});

test('itemized roofing cannot activate or quote with an accessory price missing', () => {
  const ownerPricing = roofService({
    accessoryPricingMode: 'itemized',
    starterPerLF: 100,
    dripEdgePerLF: 200
  });
  const inputs = roofInputs({ starterLengthLF: 100, dripEdgeLengthLF: 100, ridgeCapLengthLF: 20 });
  const status = vNextServiceStatus(ownerPricing);
  const result = run('ROOFING_REPLACEMENT', inputs, ownerPricing);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.missingOwnerFields.includes('ridgeCapPerLF'), true);
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

test('an explicitly confirmed zero accessory length is recorded as no physical scope', () => {
  const ownerPricing = roofService({
    accessoryPricingMode: 'itemized', starterPerLF: 100,
    dripEdgePerLF: 200, ridgeCapPerLF: 300
  });
  const inputs = roofInputs({ starterLengthLF: 100, dripEdgeLengthLF: 100, ridgeCapLengthLF: 0 });
  const result = run('ROOFING_REPLACEMENT', inputs, ownerPricing);
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(Object.hasOwn(lineMap(result), 'Ridge cap'), false);
  const measurement = result.calculationRecord.options[0].measurements.find(item => item.name === 'ridgeCapLengthLF');
  assert.equal(measurement.value, 0);
});

test('fractional cents and unsupported pricing controls are rejected', () => {
  const fractional = flooringService({ laborPerSqft: { vinyl_plank: 300.5 } });
  assert.equal(vNextServiceStatus(fractional).status, 'NEEDS PRICING');
  const unsupported = roofService({ repairMinimum: 10000 });
  const result = run('ROOFING_REPLACEMENT', roofInputs(), unsupported);
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.unsupportedOwnerFields.includes('repairMinimum'), true);
});

test('unexpected customer fields never influence a quote', () => {
  const validation = validateCustomerInputs('ROOFING_REPLACEMENT', roofInputs({ hiddenAreaOverride: 5000 }), roofService().pricing);
  assert.equal(validation.ok, false);
  assert.equal(validation.invalidCustomerFields.includes('hiddenAreaOverride'), true);
});

test('AI-suggested pricing and optional disposal overrides cannot quote before confirmation', () => {
  const ownerPricing = flooringService({ disposalPerSqft: 25 }, { source: 'AI_SUGGESTED' });
  ownerPricing.confirmedFields = Object.fromEntries(Object.keys(ownerPricing.pricing).map(field => [field, true]));
  ownerPricing.confirmedFields.disposalPerSqft = false;
  const result = run('FLOORING_INSTALL', flooringInputs(), ownerPricing);
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.missingOwnerFields.includes('disposalPerSqft'), true);
});

test('customer review responses are sanitized at early and late gates', () => {
  const early = run('ROOFING_REPLACEMENT', roofInputs(), { ...roofService(), active: false }, { callerType: 'customer' });
  const late = run('ROOFING_REPLACEMENT', roofInputs(), roofService({ laborPerSquare: { asphalt_shingle: 0 } }), { callerType: 'customer' });
  for (const result of [early, late]) {
    assert.deepEqual(Object.keys(result).sort(), ['customerMessage', 'quoteId', 'resultType']);
    assert.equal(JSON.stringify(result).includes('invalidOwnerFields'), false);
    assert.equal(JSON.stringify(result).includes('reviewReason'), false);
  }
});

test('partial flat-roof area and percentage must agree', () => {
  const inputs = flatInputs({ serviceScope: 'partial', partialPercent: 25, partialAreaSqft: 400 });
  const result = run('FLAT_ROOF_REPLACEMENT', inputs, flatService());
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.invalidCustomerFields.includes('partialAreaSqft'), true);
});

test('interior floor-area and room-count shortcuts are inspection-first', () => {
  for (const areaInputMethod of ['floor_sqft', 'rooms']) {
    const result = run('INTERIOR_PAINTING', interiorInputs({ areaInputMethod }), interiorService());
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.inspectionFirst, true);
  }
});

test('painting labor and material respond exactly to measured wall area and coat count', () => {
  const one = run('INTERIOR_PAINTING', interiorInputs({ coats: 1 }), interiorService());
  const three = run('INTERIOR_PAINTING', interiorInputs({ coats: 3 }), interiorService());
  assert.equal(lineMap(one)['Wall labor'], 10000);
  assert.equal(lineMap(one)['Wall paint and materials'], 5000);
  assert.equal(lineMap(three)['Wall labor'], 30000);
  assert.equal(lineMap(three)['Wall paint and materials'], 15000);
});

test('fencing accepts confirmed post counts but fails closed on the mixed concrete-and-digging charge', () => {
  const ten = run('FENCING_INSTALL', fencingInputs({ postCount: 10 }), fencingService());
  const eleven = run('FENCING_INSTALL', fencingInputs({ postCount: 11 }), fencingService());
  for (const result of [ten, eleven]) {
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.lineItems, undefined);
    assert.equal(result.ownerDecisionRequired.some(item => item.kind === 'mixed_charge_allocation'), true);
    assert.match(result.validationMessages.join(' '), /needs separate labor and material prices, or an explicit owner-confirmed allocation rule/);
  }
  assert.equal(validateCustomerInputs('FENCING_INSTALL', fencingInputs({ postCount: 11 }), fencingService().pricing).ok, true);
  const source = readFileSync('server/quote-engine-vnext/templates.js', 'utf8');
  assert.equal(source.includes('postSpacing'), false);
  assert.equal(source.includes('Math.sqrt'), false);
});

test('common disposal applies only to physical scope and is not triggered by skipped mowing add-ons', () => {
  const feeDefaults = { ...defaults, disposalFee: 10000 };
  const sod = service('LANDSCAPING_SOD', {
    sodMaterialPerSqft: 75,
    sodInstallLaborPerSqft: 125,
    minimumServiceCharge: 0,
    groundPrepPerSqft: 50
  }, { feeRules: { ...feeRules, disposal: 'when_scope_selected' } });
  const sodResult = run('LANDSCAPING_SOD', {
    sodSqft: 1000, sqftMethod: 'exact', groundPrepNeeded: true,
    slope: 'flat', accessDifficulty: 'easy'
  }, sod, { businessDefaults: feeDefaults });
  assert.equal(lineMap(sodResult).Disposal, 10000);

  const mowing = service('LANDSCAPING_MOWING', {
    mowingBaseRatePerSqft: 2,
    minimumServiceCharge: 0,
    frequencyMultipliers: { weekly: 1, biweekly: 1.2, monthly: 1.5, one_time: 1.8 },
    overgrowthMultipliers: { maintained: 1, overgrown: 1.5, severe: 2 }
  }, { feeRules: { ...feeRules, disposal: 'when_scope_selected' } });
  const mowingResult = run('LANDSCAPING_MOWING', {
    yardSqft: 5000, sqftMethod: 'exact', serviceFrequency: 'weekly',
    grassCondition: 'maintained', bagClippings: true, edgingIncluded: false
  }, mowing, { businessDefaults: feeDefaults });
  assert.equal(Object.hasOwn(lineMap(mowingResult), 'Disposal'), false);
  assert.deepEqual(mowingResult.options[0].skippedAddons, ['Clipping bagging and disposal']);
});

test('mulch disposal scope follows measured bed preparation scope', () => {
  const ownerPricing = service('LANDSCAPING_MULCH', {
    mulchMaterialPerYard: { brown: 5000 },
    mulchInstallLaborPerYard: 3000,
    minimumServiceCharge: 0,
    bedPrepLaborPerSqft: { needs_weeding: 20, overgrown: 40 },
    edgingPerLinearFoot: 50
  }, { feeRules: { ...feeRules, disposal: 'when_scope_selected' } });
  const feeDefaults = { ...defaults, disposalFee: 10000 };
  const base = { inputMethod: 'sqft', mulchArea: 270, mulchDepth: 3, mulchType: 'brown', edgingNeeded: false };
  const clean = run('LANDSCAPING_MULCH', { ...base, bedCondition: 'clean' }, ownerPricing, { businessDefaults: feeDefaults });
  const prepared = run('LANDSCAPING_MULCH', { ...base, bedCondition: 'needs_weeding', bedSqft: 270 }, ownerPricing, { businessDefaults: feeDefaults });
  assert.equal(Object.hasOwn(lineMap(clean), 'Disposal'), false);
  assert.equal(lineMap(prepared).Disposal, 10000);
});

test('TAX_ALL taxes the full pre-tax subtotal regardless of category taxability flags', () => {
  const ownerPricing = interiorService();
  const result = run('INTERIOR_PAINTING', interiorInputs({ coats: 1 }), ownerPricing, {
    businessDefaults: { ...defaults, taxMode: 'TAX_ALL', taxPercent: 10 }
  });
  assert.equal(lineMap(result).Tax, 1500);
  assert.equal(result.calculationRecord.options[0].scenarios.mid.tax.taxableSubtotalCents, 15000);
});

test('service status validates every tier using effective merged pricing', () => {
  const ownerPricing = sidingService({}, {
    tiers: [
      { name: 'Good', overrides: {} },
      { name: 'Broken', overrides: { materialPerSqft: { vinyl: 0 } } }
    ]
  });
  const status = vNextServiceStatus(ownerPricing);
  assert.equal(status.status, 'NEEDS PRICING');
  assert.equal(status.invalidOwnerFields.includes('Broken.materialPerSqft.vinyl'), true);
  const result = run('SIDING_REPLACEMENT', sidingInputs(), ownerPricing);
  assert.equal(result.options.length, 1);
  assert.equal(result.appliedRules.some(rule => rule.startsWith('Broken tier skipped:')), true);
});

test('duplicate tier names fail before calculation', () => {
  const ownerPricing = sidingService({}, {
    tiers: [
      { name: 'Good', overrides: {} },
      { name: ' good ', overrides: {} }
    ]
  });
  assert.equal(vNextServiceStatus(ownerPricing).status, 'NEEDS PRICING');
  const result = run('SIDING_REPLACEMENT', sidingInputs(), ownerPricing);
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.match(result.validationMessages.join(' '), /duplicates another tier name/);
});

test('custom ranges reject negative values and exact service-name mismatches', () => {
  const negative = service('CUSTOM', {
    customPricingMode: 'range', low: -1, high: 10000, unit: 'flat', minimumJob: 0
  }, { service: 'Cabinet adjustment' });
  assert.equal(vNextServiceStatus(negative).status, 'NEEDS PRICING');
  const valid = service('CUSTOM', {
    customPricingMode: 'fixed', price: 10000, unit: 'flat', minimumJob: 0
  }, { service: 'Cabinet adjustment' });
  const mismatch = run('CUSTOM', {
    service: 'Cabinet installation', serviceConfirmed: true, unit: 'flat'
  }, valid);
  assert.equal(mismatch.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(mismatch.invalidCustomerFields.includes('service'), true);
});

test('every custom pricing unit consumes only its matching confirmed quantity', () => {
  const cases = [
    ['flat', {}, 100],
    ['per_hour', { hours: 2 }, 200],
    ['per_unit', { itemCount: 3 }, 300],
    ['per_sqft', { areaSqft: 4 }, 400],
    ['per_LF', { linearFeet: 5 }, 500],
    ['per_square', { roofSquares: 6 }, 600]
  ];
  for (const [unit, quantity, amountCents] of cases) {
    const ownerPricing = service('CUSTOM', {
      customPricingMode: 'fixed', price: 100, unit, minimumJob: 0
    }, { service: 'Measured custom scope' });
    const result = run('CUSTOM', {
      service: 'Measured custom scope', serviceConfirmed: true, unit, ...quantity
    }, ownerPricing);
    assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY', unit);
    assert.equal(result.lineItems[0].amountCents, amountCents, unit);
  }
});

test('unknown flat-roof facts require inspection and obsolete assumption controls are rejected', () => {
  for (const inputs of [
    flatInputs({ membraneType: 'unknown' }),
    flatInputs({ existingLayers: 'unknown' })
  ]) {
    const result = run('FLAT_ROOF_REPLACEMENT', inputs, flatService());
    assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(result.inspectionFirst, true);
  }
  const obsolete = run(
    'FLAT_ROOF_REPLACEMENT',
    flatInputs(),
    flatService({ unknownMembraneRule: 'average_with_disclosure', unknownLayerCount: 2 })
  );
  assert.equal(obsolete.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(obsolete.unsupportedOwnerFields.includes('unknownMembraneRule'), true);
  assert.equal(obsolete.unsupportedOwnerFields.includes('unknownLayerCount'), true);
});

test('customer sanitizer never exposes calculation records, rates, or owner rules', () => {
  const ownerResult = run('SIDING_REPLACEMENT', sidingInputs(), sidingService());
  const customer = sanitizeForCustomerVNext(ownerResult);
  const serialized = JSON.stringify(customer);
  for (const forbidden of ['lineItems', 'calculationRecord', 'rateCents', 'priceBasisByCategory', 'taxabilityByCategory', 'appliedRules']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});

test('candidate formulas contain none of the removed geometry and hidden-factor shortcuts', () => {
  const source = readFileSync('server/quote-engine-vnext/templates.js', 'utf8');
  for (const forbidden of ['Math.sqrt', 'postSpacing', 'trimRatio', 'paintableAreaMap', 'sidingAreaMap', 'assumedDrivewayWidthFt']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});

test('candidate price-book metadata has specific labels instead of generic raw-key fallbacks', () => {
  const metadata = getVNextPriceBookMetadata();
  for (const serviceMetadata of metadata) {
    for (const field of serviceMetadata.pricingFields) {
      assert.notEqual(field.label, 'Required pricing information', `${serviceMetadata.serviceType}.${field.field}`);
      assert.notEqual(field.help, 'Complete this pricing value before the service can quote.', `${serviceMetadata.serviceType}.${field.field}`);
      assert.equal(/[a-z][A-Z]|_/.test(field.label), false, `${serviceMetadata.serviceType}.${field.field}: ${field.label}`);
    }
  }
  const fencing = metadata.find(serviceMetadata => serviceMetadata.serviceType === 'FENCING_INSTALL');
  const fencingFields = Object.fromEntries(fencing.pricingFields.map(field => [field.field, field]));
  assert.equal(fencingFields.concretePerPost.label, 'Concrete + digging cost per post at your local frost/set depth.');
  assert.equal(fencingFields.gatePrice.label, "Installed price per gate INCLUDING gate posts' hardware; gate posts themselves are counted below.");
});

test('owner-selected common fees require an explicit owner decision', () => {
  const ownerPricing = interiorService({}, { feeRules: { ...feeRules, travel: 'owner_selected' } });
  const result = run('INTERIOR_PAINTING', interiorInputs(), ownerPricing, {
    businessDefaults: { ...defaults, travelFee: 1000 }
  });
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(result.invalidOwnerFields.includes('feeSelections.owner.travel'), true);
});

test('installation services reject replacement-only scope instead of silently deleting it', () => {
  const flooring = run(
    'FLOORING_INSTALL',
    flooringInputs({ subfloorIssues: true, subfloorRepairAreaSqft: 40 }),
    flooringService()
  );
  assert.equal(flooring.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(flooring.invalidCustomerFields.includes('subfloorIssues'), true);
  assert.equal(flooring.invalidCustomerFields.includes('subfloorRepairAreaSqft'), true);

  const fencing = run(
    'FENCING_INSTALL',
    fencingInputs({ oldFenceRemoval: true }),
    fencingService()
  );
  assert.equal(fencing.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(fencing.invalidCustomerFields.includes('oldFenceRemoval'), true);
});

test('underlayment and gate measurements reject contradictory selected scope', () => {
  const underlayment = run(
    'FLOORING_INSTALL',
    flooringInputs({ underlaymentSelected: true }),
    flooringService()
  );
  assert.equal(underlayment.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(underlayment.invalidCustomerFields.includes('underlaymentSelected'), true);

  const gate = run(
    'FENCING_INSTALL',
    fencingInputs({ gateWidthTotalLF: 4 }),
    fencingService()
  );
  assert.equal(gate.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(gate.invalidCustomerFields.includes('gateWidthTotalLF'), true);
});

test('supported concrete finishes round the base and finish-extra components independently', () => {
  const ownerPricing = service('CONCRETE_DRIVEWAY', {
    laborPerSqft: 101,
    concreteCostPerCubicYard: 10000,
    formworkPerLF: 100,
    minimumJob: 0
  });
  const result = run('CONCRETE_DRIVEWAY', {
    dimensionMethod: 'measured_area_perimeter',
    areaSqft: 1.01,
    perimeterLF: 4.1,
    thickness: 2,
    finishType: 'smooth',
    demolitionNeeded: false,
    reinforcement: 'none',
    accessDifficulty: 'moderate',
    baseNeeded: false
  }, ownerPricing);
  assert.equal(result.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(lineMap(result)['Concrete labor'], 117);
  const labor = result.lineItems.find(line => line.name === 'Concrete labor');
  assert.deepEqual(labor.calculation.components.map(component => component.amountCents), [112, 5]);
});

test('buffered ranges cannot use remitted tax to satisfy a pre-tax minimum', () => {
  const ownerPricing = interiorService({ minimumJob: 25000 });
  ownerPricing.taxabilityByCategory.material = true;
  const result = run('INTERIOR_PAINTING', interiorInputs(), ownerPricing, {
    businessDefaults: {
      ...defaults,
      taxMode: 'TAX_ALL',
      taxPercent: 10,
      rangeBufferPercent: 25
    }
  });
  const scenario = result.calculationRecord.options[0].scenarios.mid;
  assert.equal(scenario.tax.preTaxSubtotalCents, 30000);
  assert.equal(scenario.tax.taxCents, 3000);
  assert.equal(result.calculationRecord.options[0].range.minimumCustomerFloorCents, 27500);
  assert.equal(result.lowEstimate, 275);
});

test('price-book statuses fail closed when business-wide defaults are invalid', () => {
  const ownerPricing = interiorService();
  const pricebook = {
    defaults: { ...defaults, travelFee: -1 },
    services: [ownerPricing]
  };
  const statuses = vNextPricebookStatuses(pricebook);
  assert.equal(statuses[0].status, 'NEEDS PRICING');
  assert.equal(statuses[0].validationErrors.some(error => error.includes('travelFee')), true);
  const result = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

test('duplicate built-in services are invalid and cannot be quoted ambiguously', () => {
  const first = interiorService();
  const pricebook = {
    defaults,
    services: [first, structuredClone(first)]
  };
  const statuses = vNextPricebookStatuses(pricebook);
  assert.deepEqual(statuses.map(status => status.status), ['NEEDS PRICING', 'NEEDS PRICING']);
  assert.equal(statuses.every(status => status.validationErrors.some(error => error.includes('ambiguous duplicate service'))), true);
  assert.equal(validateVNextPricebook(pricebook).ok, false);
  const result = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'INTERIOR_PAINTING',
    customerInputs: interiorInputs(),
    currentMonth: 1
  });
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

test('case-insensitive duplicate custom service names cannot activate or quote ambiguously', () => {
  const first = service('CUSTOM', {
    customPricingMode: 'fixed',
    price: 10000,
    unit: 'flat',
    minimumJob: 0
  }, { service: 'Cabinet adjustment' });
  const second = { ...structuredClone(first), service: 'CABINET ADJUSTMENT' };
  const pricebook = { defaults, services: [first, second] };
  const statuses = vNextPricebookStatuses(pricebook);
  assert.deepEqual(statuses.map(status => status.status), ['NEEDS PRICING', 'NEEDS PRICING']);
  assert.equal(statuses.every(status => status.validationErrors.some(error => error.includes('ambiguous duplicate service'))), true);
  assert.equal(validateVNextPricebook(pricebook).ok, false);
  const result = quoteFromVNextPricebook({
    pricebook,
    serviceType: 'Cabinet adjustment',
    customerInputs: {
      service: 'Cabinet adjustment',
      serviceConfirmed: true,
      unit: 'flat'
    },
    currentMonth: 1
  });
  assert.equal(result.resultType, 'ESTIMATE_REQUIRES_REVIEW');
});

test('custom ranges record the taxed customer floor for a pre-tax minimum', () => {
  const ownerPricing = service('CUSTOM', {
    customPricingMode: 'range',
    low: 10000,
    high: 20000,
    unit: 'flat',
    minimumJob: 15000
  }, { service: 'Cabinet adjustment' });
  ownerPricing.taxabilityByCategory.labor = true;
  const result = run('CUSTOM', {
    service: 'Cabinet adjustment',
    serviceConfirmed: true,
    unit: 'flat'
  }, ownerPricing, {
    businessDefaults: {
      ...defaults,
      taxMode: 'TAX_ALL',
      taxPercent: 10
    }
  });
  assert.equal(result.lowEstimate, 165);
  assert.equal(result.calculationRecord.options[0].range.minimumCustomerFloorCents, 16500);
});
