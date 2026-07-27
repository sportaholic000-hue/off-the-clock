import {
  valueAtPath,
  vinylUnderlaymentApplies
} from './contracts.js';

export class QuoteReviewError extends Error {
  constructor(reviewReason, details = {}) {
    super(reviewReason);
    this.name = 'QuoteReviewError';
    this.reviewReason = reviewReason;
    Object.assign(this, details);
  }
}

const round = Math.round;

function measured(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new QuoteReviewError(`${name} is missing or invalid.`, { invalidCustomerFields: [name] });
  }
  return value;
}

function count(value, name, allowZero = false) {
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new QuoteReviewError(`${name} is missing or invalid.`, { invalidCustomerFields: [name] });
  }
  return value;
}

function money(value, path) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new QuoteReviewError('Pricing not fully configured for the measured scope.', {
      invalidOwnerFields: [path]
    });
  }
  return value;
}

function quantityFactor(value, path, { allowZero = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < (allowZero ? 0 : Number.EPSILON)) {
    throw new QuoteReviewError('A quantity factor is missing or invalid.', {
      invalidOwnerFields: [path]
    });
  }
  return value;
}

function optionalMoney(value, path) {
  if (value === undefined || value === null || value === '') return undefined;
  return money(value, path);
}

function addonMoney(value, path) {
  if (value === undefined || value === null || value === '' || value === 0) return undefined;
  return money(value, path);
}

function addonPercent(value, path) {
  if (value === undefined || value === null || value === '' || value === 0) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 500) {
    throw new QuoteReviewError(`${path} must be a finite percentage from 0 to 500.`, { invalidOwnerFields: [path] });
  }
  return value;
}

function makeLine({
  name,
  category,
  quantity,
  unit,
  rateCents,
  ratePath,
  multipliers = [],
  customerDriver,
  lowRateCents,
  highRateCents
}) {
  measured(quantity, `${name} quantity`);
  money(rateCents, ratePath);
  const checkedMultipliers = multipliers.map(multiplier => ({
    ...multiplier,
    value: quantityFactor(multiplier.value, multiplier.path, { allowZero: multiplier.allowZero })
  }));
  const multiplierProduct = checkedMultipliers.reduce((product, multiplier) => product * multiplier.value, 1);
  const unroundedCents = quantity * rateCents * multiplierProduct;
  const amountCents = round(unroundedCents);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new QuoteReviewError(`${name} did not produce a valid charge.`, { invalidOwnerFields: [ratePath] });
  }
  const result = {
    name,
    category,
    amountCents,
    ownerVisible: true,
    customerVisible: false,
    calculation: {
      quantity,
      unit,
      rateCents,
      ratePath,
      multipliers: checkedMultipliers,
      unroundedCents
    }
  };
  if (customerDriver) result.customerDriver = customerDriver;
  if (lowRateCents !== undefined || highRateCents !== undefined) {
    const low = money(lowRateCents, 'low');
    const high = money(highRateCents, 'high');
    result.rangeAmountCents = {
      low: round(quantity * low * multiplierProduct),
      high: round(quantity * high * multiplierProduct)
    };
  }
  return result;
}

function makeCompositeLine({ name, category, components, customerDriver }) {
  const normalized = components.map(component => {
    measured(component.quantity, `${name} quantity`);
    money(component.rateCents, component.ratePath);
    const multipliers = (component.multipliers || []).map(multiplier => ({
      ...multiplier,
      value: quantityFactor(multiplier.value, multiplier.path, { allowZero: multiplier.allowZero })
    }));
    const product = multipliers.reduce((total, multiplier) => total * multiplier.value, 1);
    const unroundedCents = component.quantity * component.rateCents * product;
    return {
      ...component,
      multipliers,
      unroundedCents,
      amountCents: round(unroundedCents)
    };
  });
  const amountCents = normalized.reduce((sum, component) => sum + component.amountCents, 0);
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new QuoteReviewError(`${name} did not produce a valid charge.`);
  }
  return {
    name,
    category,
    amountCents,
    ownerVisible: true,
    customerVisible: false,
    calculation: { components: normalized },
    ...(customerDriver ? { customerDriver } : {})
  };
}

function fixedLine(name, category, amountCents, ratePath, customerDriver) {
  return makeLine({ name, category, quantity: 1, unit: 'fixed charge', rateCents: amountCents, ratePath, customerDriver });
}

function baseOutput(serviceType) {
  return {
    serviceType,
    lineItems: [],
    measurements: [],
    assumptions: [],
    disclosures: [],
    priceDrivers: [],
    feeScope: {
      travel: true,
      disposal: false,
      permit: ['ROOFING_REPLACEMENT', 'FLAT_ROOF_REPLACEMENT', 'FENCING_INSTALL', 'FENCING_REPLACEMENT', 'SIDING_REPLACEMENT', 'CONCRETE_DRIVEWAY', 'CONCRETE_PATIO_SLAB'].includes(serviceType),
      overhead: true
    },
    replacedCommonFees: []
  };
}

function add(out, line) {
  out.lineItems.push(line);
}

function recordMeasurement(out, name, value, unit, source = 'customer_measured') {
  out.measurements.push({ name, value, unit, source });
}

function selectedRoofArea(c) {
  if (c.serviceScope !== 'partial') return c.roofSizeInput;
  return c.partialAreaSqft ?? c.roofSizeInput * c.partialPercent / 100;
}

function selectedFlatRoofArea(c) {
  if (c.serviceScope !== 'partial') return c.roofSqft;
  return c.partialAreaSqft ?? c.roofSqft * c.partialPercent / 100;
}

function addDisposalOverride(out, p, path, quantity, unit, label) {
  const rate = optionalMoney(p[path], path);
  if (rate === undefined) return;
  add(out, makeLine({ name: label, category: 'disposal', quantity, unit, rateCents: rate, ratePath: path }));
  out.replacedCommonFees.push('disposal');
}

function calculateRoofReplacement(c, p, ctx) {
  const out = baseOutput('ROOFING_REPLACEMENT');
  const areaSqft = measured(selectedRoofArea(c), 'roof area');
  const roofSquares = areaSqft / 100;
  const waste = quantityFactor(p.wasteFactorByComplexity[c.roofComplexity], `wasteFactorByComplexity.${c.roofComplexity}`, { allowZero: true });
  const materialSquares = roofSquares * (1 + waste);
  const pitch = quantityFactor(p.pitchMultiplier[c.pitch], `pitchMultiplier.${c.pitch}`);
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  const layers = count(c.existingLayers, 'existingLayers');

  add(out, makeLine({
    name: 'Roofing labor', category: 'labor', quantity: roofSquares, unit: 'roofing squares',
    rateCents: valueAtPath(p, `laborPerSquare.${c.replacementRoofType}`),
    ratePath: `laborPerSquare.${c.replacementRoofType}`,
    multipliers: [
      { name: 'pitch', value: pitch, path: `pitchMultiplier.${c.pitch}` },
      { name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }
    ],
    customerDriver: `Measured roof area: ${roofSquares.toFixed(2)} roofing squares`
  }));
  add(out, makeLine({
    name: 'Field materials', category: 'material', quantity: materialSquares, unit: 'waste-adjusted roofing squares',
    rateCents: valueAtPath(p, `materialCostPerSquare.${c.replacementRoofType}`),
    ratePath: `materialCostPerSquare.${c.replacementRoofType}`,
    customerDriver: `Replacement material: ${c.replacementRoofType.replaceAll('_', ' ')}`
  }));
  add(out, makeLine({
    name: 'Tear-off', category: 'removal', quantity: roofSquares * layers, unit: 'existing-layer roofing squares',
    rateCents: valueAtPath(p, `tearOffPerSquare.${c.existingRoofType}`),
    ratePath: `tearOffPerSquare.${c.existingRoofType}`,
    multipliers: [
      { name: 'pitch', value: pitch, path: `pitchMultiplier.${c.pitch}` },
      { name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }
    ],
    customerDriver: `${layers} measured existing roof layer${layers === 1 ? '' : 's'}`
  }));
  add(out, makeLine({
    name: 'Underlayment', category: 'material', quantity: materialSquares, unit: 'waste-adjusted roofing squares',
    rateCents: valueAtPath(p, `underlaymentPerSquare.${c.replacementRoofType}`),
    ratePath: `underlaymentPerSquare.${c.replacementRoofType}`
  }));

  if (p.accessoryPricingMode === 'itemized') {
    const accessoryLines = [
      ['Starter strip', 'starterLengthLF', 'starterPerLF'],
      ['Drip edge', 'dripEdgeLengthLF', 'dripEdgePerLF'],
      ['Ridge cap', 'ridgeCapLengthLF', 'ridgeCapPerLF']
    ];
    for (const [name, inputField, priceField] of accessoryLines) {
      const length = c[inputField];
      recordMeasurement(out, inputField, length, 'linear feet');
      if (length > 0) add(out, makeLine({ name, category: 'material', quantity: length, unit: 'measured linear feet', rateCents: p[priceField], ratePath: priceField }));
    }
  }
  if (c.deckingSheets > 0) {
    add(out, makeLine({ name: 'Decking replacement', category: 'material', quantity: c.deckingSheets, unit: 'confirmed sheets', rateCents: p.deckingPerSheet, ratePath: 'deckingPerSheet', customerDriver: `${c.deckingSheets} decking sheet${c.deckingSheets === 1 ? '' : 's'} included` }));
  } else if (optionalMoney(p.deckingPerSheet, 'deckingPerSheet') !== undefined) {
    out.disclosures.push('Decking replacement is not included because no replacement sheet count was confirmed.');
  }

  out.feeScope.disposal = layers > 0;
  addDisposalOverride(out, p, 'disposalPerSquare', roofSquares * layers, 'existing-layer roofing squares', 'Roofing disposal');
  recordMeasurement(out, 'roofAreaSqft', areaSqft, 'square feet');
  recordMeasurement(out, 'existingLayers', layers, 'layers');
  out.priceDrivers.push(`Measured roof area: ${roofSquares.toFixed(2)} roofing squares`, `${layers} existing layer${layers === 1 ? '' : 's'}`);
  return out;
}

function calculateRoofRepair(c, p, ctx) {
  const out = baseOutput('ROOFING_REPAIR');
  const hoursPath = `repairHours.${c.roofType}.${c.repairType}.${c.repairSize}`;
  const materialPath = `repairMaterialAllowance.${c.roofType}.${c.repairType}.${c.repairSize}`;
  const hours = quantityFactor(valueAtPath(p, hoursPath), hoursPath);
  const pitch = quantityFactor(p.pitchMultiplier[c.pitch], `pitchMultiplier.${c.pitch}`);
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  add(out, makeLine({
    name: 'Repair labor', category: 'labor', quantity: hours, unit: 'configured labor hours',
    rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate',
    multipliers: [
      { name: 'pitch', value: pitch, path: `pitchMultiplier.${c.pitch}` },
      { name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }
    ],
    customerDriver: `${c.repairSize} ${c.repairType.replaceAll('_', ' ')} repair`
  }));
  add(out, fixedLine('Repair materials', 'material', valueAtPath(p, materialPath), materialPath));
  if (c.leakPresent) ctx.urgencyFlags.push('Active leak reported');
  recordMeasurement(out, 'repairScope', { roofType: c.roofType, repairType: c.repairType, repairSize: c.repairSize }, 'selected repair category', 'customer_confirmed');
  out.priceDrivers.push(`${c.repairSize} ${c.repairType.replaceAll('_', ' ')} repair`, `${c.stories}-story access`);
  return out;
}

function calculateFlatRoofReplacement(c, p, ctx) {
  const out = baseOutput('FLAT_ROOF_REPLACEMENT');
  const areaSqft = measured(selectedFlatRoofArea(c), 'flat-roof area');
  const membraneKey = c.membraneType === 'unknown' ? 'average' : c.membraneType;
  let layers = c.existingLayers;
  if (layers === 'unknown') {
    layers = p.unknownLayerCount;
    out.assumptions.push({ name: 'existingLayers', value: layers, source: 'owner_configured' });
    out.disclosures.push(`Existing layer count was not confirmed; the estimate uses the owner's configured ${layers}-layer assumption.`);
  }
  if (c.membraneType === 'unknown') {
    out.assumptions.push({ name: 'membraneType', value: 'average', source: 'owner_configured' });
    out.disclosures.push('Membrane type was not confirmed; owner-configured average membrane pricing was used.');
  }
  layers = count(layers, 'existingLayers');
  const access = quantityFactor(p.accessMultiplier[c.accessDifficulty], `accessMultiplier.${c.accessDifficulty}`);
  add(out, makeLine({ name: 'Flat roof labor', category: 'labor', quantity: areaSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `laborPerSqft.${membraneKey}`), ratePath: `laborPerSqft.${membraneKey}`, multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }], customerDriver: `Measured flat-roof area: ${areaSqft} square feet` }));
  add(out, makeLine({ name: 'Membrane', category: 'material', quantity: areaSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `membraneCostPerSqft.${membraneKey}`), ratePath: `membraneCostPerSqft.${membraneKey}`, customerDriver: `Membrane: ${membraneKey.replaceAll('_', ' ')}` }));
  if (c.buildingType === 'commercial') add(out, makeLine({ name: 'Rigid insulation and coverboard', category: 'material', quantity: areaSqft, unit: 'measured square feet', rateCents: p.insulationPerSqft, ratePath: 'insulationPerSqft' }));
  add(out, makeLine({ name: 'Tear-off', category: 'removal', quantity: areaSqft * layers, unit: 'existing-layer square feet', rateCents: valueAtPath(p, `tearOffPerSqft.${membraneKey}`), ratePath: `tearOffPerSqft.${membraneKey}`, multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }], customerDriver: `${layers} existing membrane layer${layers === 1 ? '' : 's'}` }));
  out.feeScope.disposal = true;
  addDisposalOverride(out, p, 'disposalPerSqft', areaSqft * layers, 'existing-layer square feet', 'Flat-roof disposal');
  recordMeasurement(out, 'roofAreaSqft', areaSqft, 'square feet');
  recordMeasurement(out, 'existingLayers', layers, 'layers', c.existingLayers === 'unknown' ? 'owner_configured_assumption' : 'customer_measured');
  out.priceDrivers.push(`Measured flat-roof area: ${areaSqft} square feet`, `${layers} existing layer${layers === 1 ? '' : 's'}`);
  return out;
}

function calculateFlatRoofRepair(c, p, ctx) {
  const out = baseOutput('FLAT_ROOF_REPAIR');
  const hoursPath = `patchRepairHours.${c.membraneType}.${c.repairType}.${c.repairSize}`;
  const materialPath = `patchMaterialAllowance.${c.membraneType}.${c.repairType}.${c.repairSize}`;
  const hours = quantityFactor(valueAtPath(p, hoursPath), hoursPath);
  add(out, makeLine({ name: 'Flat roof repair labor', category: 'labor', quantity: hours, unit: 'configured labor hours', rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate', customerDriver: `${c.repairSize} ${c.repairType.replaceAll('_', ' ')} repair` }));
  add(out, fixedLine('Flat roof repair materials', 'material', valueAtPath(p, materialPath), materialPath));
  if (c.pondingWater) {
    const rate = addonMoney(p.pondingWaterSurcharge, 'pondingWaterSurcharge');
    if (rate === undefined) ctx.skipAddon('Ponding water surcharge');
    else add(out, fixedLine('Ponding water surcharge', 'addon', rate, 'pondingWaterSurcharge'));
  }
  if (c.leakPresent) ctx.urgencyFlags.push('Active leak reported');
  recordMeasurement(out, 'repairScope', { membraneType: c.membraneType, repairType: c.repairType, repairSize: c.repairSize }, 'selected repair category', 'customer_confirmed');
  out.priceDrivers.push(`${c.repairSize} ${c.repairType.replaceAll('_', ' ')} repair`, `Membrane: ${c.membraneType.replaceAll('_', ' ')}`);
  return out;
}

function calculateInteriorPainting(c, p) {
  const out = baseOutput('INTERIOR_PAINTING');
  const wallArea = measured(c.wallAreaSqft, 'wallAreaSqft');
  const coats = count(c.coats, 'coats');
  const height = quantityFactor(p.wallHeightLaborMultiplier[c.wallHeight], `wallHeightLaborMultiplier.${c.wallHeight}`);
  const wallCoatSqft = wallArea * coats;
  add(out, makeLine({ name: 'Wall labor', category: 'labor', quantity: wallCoatSqft, unit: 'measured wall square-foot coats', rateCents: p.laborPerWallSqftPerCoat, ratePath: 'laborPerWallSqftPerCoat', multipliers: [{ name: 'wall height labor', value: height, path: `wallHeightLaborMultiplier.${c.wallHeight}` }], customerDriver: `${wallArea} measured square feet of paintable wall area` }));
  add(out, makeLine({ name: 'Wall paint and materials', category: 'material', quantity: wallCoatSqft, unit: 'measured wall square-foot coats', rateCents: p.materialPerWallSqftPerCoat, ratePath: 'materialPerWallSqftPerCoat', customerDriver: `${coats} paint coat${coats === 1 ? '' : 's'}` }));
  if (c.surfaceCondition !== 'good') {
    const prepHours = wallArea * quantityFactor(p.prepHoursPerSqft[c.surfaceCondition], `prepHoursPerSqft.${c.surfaceCondition}`);
    add(out, makeLine({ name: 'Wall preparation', category: 'prep', quantity: prepHours, unit: 'configured preparation hours from measured wall area', rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate' }));
  }
  if (c.ceilingsIncluded) {
    const ceilingArea = measured(c.ceilingAreaSqft, 'ceilingAreaSqft');
    const ceilingCoatSqft = ceilingArea * coats;
    add(out, makeLine({ name: 'Ceiling labor', category: 'labor', quantity: ceilingCoatSqft, unit: 'measured ceiling square-foot coats', rateCents: p.ceilingLaborPerSqftPerCoat, ratePath: 'ceilingLaborPerSqftPerCoat', multipliers: [{ name: 'ceiling height labor', value: height, path: `wallHeightLaborMultiplier.${c.wallHeight}` }] }));
    add(out, makeLine({ name: 'Ceiling materials', category: 'material', quantity: ceilingCoatSqft, unit: 'measured ceiling square-foot coats', rateCents: p.ceilingMaterialPerSqftPerCoat, ratePath: 'ceilingMaterialPerSqftPerCoat' }));
    recordMeasurement(out, 'ceilingAreaSqft', ceilingArea, 'square feet');
  }
  if (c.trimIncluded) {
    const trim = measured(c.trimLengthLF, 'trimLengthLF');
    add(out, makeLine({ name: 'Trim labor', category: 'labor', quantity: trim, unit: 'measured linear feet', rateCents: p.trimLaborPerLF, ratePath: 'trimLaborPerLF' }));
    add(out, makeLine({ name: 'Trim materials', category: 'material', quantity: trim, unit: 'measured linear feet', rateCents: p.trimMaterialPerLF, ratePath: 'trimMaterialPerLF' }));
    recordMeasurement(out, 'trimLengthLF', trim, 'linear feet');
  }
  recordMeasurement(out, 'wallAreaSqft', wallArea, 'square feet');
  recordMeasurement(out, 'appliedFinishCoats', coats, 'coats', 'customer_confirmed');
  out.priceDrivers.push(`${wallArea} measured square feet of paintable wall area`, `${coats} coat${coats === 1 ? '' : 's'}`);
  return out;
}

function calculateExteriorPainting(c, p) {
  const out = baseOutput('EXTERIOR_PAINTING');
  const area = measured(c.exteriorAreaSqft, 'exteriorAreaSqft');
  const finishCoats = count(c.coats, 'coats');
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  const primerCoats = c.surfaceCondition === 'poor' ? quantityFactor(p.poorSurfacePrimerCoats, 'poorSurfacePrimerCoats', { allowZero: true }) : 0;
  const appliedCoats = finishCoats + primerCoats;
  add(out, makeLine({ name: 'Exterior labor', category: 'labor', quantity: area * appliedCoats, unit: 'measured wall square-foot coats', rateCents: p.exteriorLaborPerSqftPerCoat, ratePath: 'exteriorLaborPerSqftPerCoat', multipliers: [{ name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }], customerDriver: `${area} measured square feet across ${appliedCoats} applied coat${appliedCoats === 1 ? '' : 's'}` }));
  if (c.surfaceCondition !== 'good') {
    const prepHours = area * quantityFactor(p.prepHoursPerSqft[c.surfaceCondition], `prepHoursPerSqft.${c.surfaceCondition}`);
    add(out, makeLine({ name: 'Exterior preparation', category: 'prep', quantity: prepHours, unit: 'configured preparation hours from measured wall area', rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate' }));
  }
  add(out, makeLine({ name: 'Exterior materials', category: 'material', quantity: area * appliedCoats, unit: 'measured wall square-foot coats', rateCents: p.materialPerSqftPerCoat, ratePath: 'materialPerSqftPerCoat', customerDriver: `${appliedCoats} material coat${appliedCoats === 1 ? '' : 's'} included` }));
  if (c.surfaceCondition === 'poor') {
    out.assumptions.push({ name: 'poorSurfacePrimerCoats', value: primerCoats, unit: 'coats', source: 'owner_configured' });
    if (primerCoats > 0) out.disclosures.push(`${primerCoats} owner-configured primer coat${primerCoats === 1 ? '' : 's'} included for poor surface condition.`);
  }
  recordMeasurement(out, 'exteriorAreaSqft', area, 'square feet');
  recordMeasurement(out, 'finishCoats', finishCoats, 'coats', 'customer_confirmed');
  out.priceDrivers.push(`${area} measured square feet of paintable wall area`, `${appliedCoats} applied coat${appliedCoats === 1 ? '' : 's'}`);
  return out;
}

function calculateFlooring(serviceType, c, p) {
  const out = baseOutput(serviceType);
  const sqft = measured(c.sqft, 'sqft');
  const averageRoom = sqft / count(c.roomCount, 'roomCount');
  const thresholds = p.roomSizeThresholds;
  if (thresholds.smallMaxSqft >= thresholds.mediumMaxSqft) throw new QuoteReviewError('Flooring room-size thresholds are inconsistent.', { invalidOwnerFields: ['roomSizeThresholds'] });
  const roomBand = averageRoom < thresholds.smallMaxSqft ? 'small' : averageRoom < thresholds.mediumMaxSqft ? 'medium' : 'large';
  const roomMultiplier = quantityFactor(p.roomComplexityMultiplier[roomBand], `roomComplexityMultiplier.${roomBand}`);
  const waste = quantityFactor(p.wasteFactorByType[c.newFlooringType], `wasteFactorByType.${c.newFlooringType}`, { allowZero: true }) + quantityFactor(p.patternWasteAdder[c.layoutPattern], `patternWasteAdder.${c.layoutPattern}`, { allowZero: true });
  const materialSqft = sqft * (1 + waste);
  add(out, makeLine({ name: 'Flooring labor', category: 'labor', quantity: sqft, unit: 'measured square feet', rateCents: valueAtPath(p, `laborPerSqft.${c.newFlooringType}`), ratePath: `laborPerSqft.${c.newFlooringType}`, multipliers: [{ name: 'average-room complexity', value: roomMultiplier, path: `roomComplexityMultiplier.${roomBand}` }], customerDriver: `${sqft} measured square feet` }));
  add(out, makeLine({ name: 'Flooring materials', category: 'material', quantity: materialSqft, unit: 'waste-adjusted square feet', rateCents: valueAtPath(p, `materialPerSqft.${c.newFlooringType}`), ratePath: `materialPerSqft.${c.newFlooringType}`, customerDriver: `Flooring type: ${c.newFlooringType.replaceAll('_', ' ')}` }));
  if (c.removalNeeded) add(out, makeLine({ name: 'Existing flooring removal', category: 'removal', quantity: sqft, unit: 'measured square feet', rateCents: valueAtPath(p, `removalPerSqft.${c.existingFloorType}`), ratePath: `removalPerSqft.${c.existingFloorType}` }));
  if (vinylUnderlaymentApplies(c, p)) add(out, makeLine({ name: 'Underlayment', category: 'material', quantity: materialSqft, unit: 'waste-adjusted square feet', rateCents: p.underlaymentPerSqft, ratePath: 'underlaymentPerSqft' }));
  if (c.stairSteps > 0) add(out, makeLine({ name: 'Stair installation', category: 'labor', quantity: c.stairSteps, unit: 'steps', rateCents: p.perStepPrice, ratePath: 'perStepPrice', customerDriver: `${c.stairSteps} stair step${c.stairSteps === 1 ? '' : 's'}` }));
  if (serviceType === 'FLOORING_REPLACEMENT' && c.subfloorIssues) {
    add(out, makeLine({ name: 'Subfloor repair allowance', category: 'prep', quantity: c.subfloorRepairAreaSqft, unit: 'measured affected square feet', rateCents: p.subfloorAllowancePerSqft, ratePath: 'subfloorAllowancePerSqft' }));
    out.disclosures.push('Subfloor repair allowance covers only the measured affected area and is confirmed after opening the floor.');
  }
  out.feeScope.disposal = c.removalNeeded;
  if (c.removalNeeded) addDisposalOverride(out, p, 'disposalPerSqft', sqft, 'removed square feet', 'Flooring disposal');
  recordMeasurement(out, 'floorAreaSqft', sqft, 'square feet');
  recordMeasurement(out, 'averageRoomSqft', averageRoom, 'square feet', 'derived_from_measured_area_and_room_count');
  out.priceDrivers.push(`${sqft} measured square feet`, `Flooring type: ${c.newFlooringType.replaceAll('_', ' ')}`);
  return out;
}

function calculateFencing(serviceType, c, p) {
  const out = baseOutput(serviceType);
  const totalLF = measured(c.linearFeet, 'linearFeet');
  const gateCount = count(c.gateCount, 'gateCount', true);
  const gateWidth = gateCount > 0 ? measured(c.gateWidthTotalLF, 'gateWidthTotalLF') : 0;
  if (gateWidth >= totalLF) throw new QuoteReviewError('Total gate-opening width must be less than measured fence length.', { invalidCustomerFields: ['gateWidthTotalLF'] });
  const solidRunLF = totalLF - gateWidth;
  const postCount = count(c.postCount, 'postCount');
  const laborHeight = quantityFactor(p.heightMultiplierLabor[c.fenceHeight], `heightMultiplierLabor.${c.fenceHeight}`);
  const materialHeight = quantityFactor(p.heightMultiplierMaterial[c.fenceHeight], `heightMultiplierMaterial.${c.fenceHeight}`);
  const terrain = quantityFactor(p.terrainMultiplier[c.terrainSlope], `terrainMultiplier.${c.terrainSlope}`);
  add(out, makeLine({ name: 'Fence labor', category: 'labor', quantity: solidRunLF, unit: 'measured solid-run linear feet', rateCents: valueAtPath(p, `laborPerLinearFoot.${c.fenceType}`), ratePath: `laborPerLinearFoot.${c.fenceType}`, multipliers: [{ name: 'height', value: laborHeight, path: `heightMultiplierLabor.${c.fenceHeight}` }, { name: 'terrain', value: terrain, path: `terrainMultiplier.${c.terrainSlope}` }], customerDriver: `${totalLF} measured linear feet with ${gateWidth} feet of gate openings` }));
  add(out, makeLine({ name: 'Fence materials', category: 'material', quantity: solidRunLF, unit: 'measured solid-run linear feet', rateCents: valueAtPath(p, `materialPerLinearFoot.${c.fenceType}`), ratePath: `materialPerLinearFoot.${c.fenceType}`, multipliers: [{ name: 'height', value: materialHeight, path: `heightMultiplierMaterial.${c.fenceHeight}` }], customerDriver: `${c.fenceHeight}-foot ${c.fenceType.replaceAll('_', ' ')} fence` }));
  if (!valueAtPath(p, `postsIncludedInMaterial.${c.fenceType}`)) add(out, makeLine({ name: 'Fence posts', category: 'material', quantity: postCount, unit: 'confirmed planned posts', rateCents: valueAtPath(p, `postPrice.${c.fenceType}`), ratePath: `postPrice.${c.fenceType}` }));
  add(out, makeLine({ name: 'Concrete footings', category: 'material', quantity: postCount, unit: 'confirmed planned posts', rateCents: p.concretePerPost, ratePath: 'concretePerPost' }));
  if (gateCount > 0) add(out, makeLine({ name: 'Installed gates', category: 'addon', quantity: gateCount, unit: 'gates', rateCents: valueAtPath(p, `gatePrice.${c.fenceType}`), ratePath: `gatePrice.${c.fenceType}`, customerDriver: `${gateCount} installed gate${gateCount === 1 ? '' : 's'}` }));
  if (serviceType === 'FENCING_REPLACEMENT' && c.oldFenceRemoval) add(out, makeLine({ name: 'Old fence removal', category: 'removal', quantity: totalLF, unit: 'measured linear feet', rateCents: valueAtPath(p, `removalPerLinearFoot.${c.fenceType}`), ratePath: `removalPerLinearFoot.${c.fenceType}`, multipliers: [{ name: 'terrain', value: terrain, path: `terrainMultiplier.${c.terrainSlope}` }] }));
  out.feeScope.disposal = serviceType === 'FENCING_REPLACEMENT' && c.oldFenceRemoval;
  if (out.feeScope.disposal) addDisposalOverride(out, p, 'disposalPerLF', totalLF, 'removed linear feet', 'Fence disposal');
  recordMeasurement(out, 'fenceLengthLF', totalLF, 'linear feet');
  recordMeasurement(out, 'gateOpeningWidthLF', gateWidth, 'linear feet');
  recordMeasurement(out, 'postCount', postCount, 'posts', 'customer_confirmed_plan');
  recordMeasurement(out, 'cornerCount', c.cornerCount, 'corners', 'customer_confirmed_plan');
  out.priceDrivers.push(`${totalLF} measured linear feet`, `${postCount} confirmed planned posts and ${gateCount} gate${gateCount === 1 ? '' : 's'}`);
  return out;
}

function concreteMeasurements(c) {
  if (c.dimensionMethod === 'exact') return {
    areaSqft: measured(c.length, 'length') * measured(c.width, 'width'),
    perimeterLF: 2 * (c.length + c.width),
    source: 'derived_from_measured_length_and_width'
  };
  return {
    areaSqft: measured(c.areaSqft, 'areaSqft'),
    perimeterLF: measured(c.perimeterLF, 'perimeterLF'),
    source: 'customer_measured'
  };
}

function calculateConcrete(serviceType, c, p) {
  const out = baseOutput(serviceType);
  const dimensions = concreteMeasurements(c);
  const thickness = measured(c.thickness, 'thickness');
  const waste = quantityFactor(p.concreteWasteFactor, 'concreteWasteFactor', { allowZero: true });
  const yards = dimensions.areaSqft * (thickness / 12) / 27 * (1 + waste);
  const access = quantityFactor(p.accessMultiplier[c.accessDifficulty], `accessMultiplier.${c.accessDifficulty}`);
  const finish = quantityFactor(p.finishMultiplier[c.finishType], `finishMultiplier.${c.finishType}`);
  add(out, makeCompositeLine({
    name: 'Concrete labor', category: 'labor', customerDriver: `${dimensions.areaSqft} measured square feet at ${thickness} inches thick`,
    components: [
      { quantity: dimensions.areaSqft, unit: 'measured square feet', rateCents: p.laborPerSqft, ratePath: 'laborPerSqft', multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }] },
      ...(finish > 1 ? [{ quantity: dimensions.areaSqft, unit: 'measured square feet', rateCents: p.laborPerSqft, ratePath: 'laborPerSqft', multipliers: [{ name: 'finish extra', value: finish - 1, path: `finishMultiplier.${c.finishType}` }] }] : [])
    ]
  }));
  add(out, makeLine({ name: 'Ready-mix concrete', category: 'material', quantity: yards, unit: 'waste-adjusted cubic yards', rateCents: p.concreteCostPerCubicYard, ratePath: 'concreteCostPerCubicYard' }));
  add(out, makeLine({ name: 'Formwork', category: 'material', quantity: dimensions.perimeterLF, unit: 'measured linear feet', rateCents: p.formworkPerLF, ratePath: 'formworkPerLF', customerDriver: `${dimensions.perimeterLF} measured linear feet of formwork` }));
  if (c.baseNeeded) add(out, makeLine({ name: 'Base preparation', category: 'prep', quantity: dimensions.areaSqft, unit: 'measured square feet', rateCents: p.basePrepPerSqft, ratePath: 'basePrepPerSqft' }));
  if (c.demolitionNeeded) add(out, makeLine({ name: 'Concrete demolition', category: 'removal', quantity: c.demolitionAreaSqft, unit: 'measured demolition square feet', rateCents: p.demolitionPerSqft, ratePath: 'demolitionPerSqft', multipliers: [{ name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }] }));
  if (c.reinforcement === 'wire_mesh') add(out, makeLine({ name: 'Wire mesh reinforcement', category: 'material', quantity: dimensions.areaSqft, unit: 'measured square feet', rateCents: p.wireReinforcementPerSqft, ratePath: 'wireReinforcementPerSqft' }));
  if (c.reinforcement === 'rebar') add(out, makeLine({ name: 'Rebar reinforcement', category: 'material', quantity: dimensions.areaSqft, unit: 'measured square feet', rateCents: p.rebarReinforcementPerSqft, ratePath: 'rebarReinforcementPerSqft' }));
  if (c.finishType === 'stamped') add(out, makeLine({ name: 'Stamped finish materials', category: 'material', quantity: dimensions.areaSqft, unit: 'measured square feet', rateCents: p.stampedMaterialPerSqft, ratePath: 'stampedMaterialPerSqft' }));
  out.feeScope.disposal = c.demolitionNeeded;
  if (c.demolitionNeeded) addDisposalOverride(out, p, 'disposalPerSqft', c.demolitionAreaSqft, 'measured demolition square feet', 'Concrete disposal');
  recordMeasurement(out, 'areaSqft', dimensions.areaSqft, 'square feet', dimensions.source);
  recordMeasurement(out, 'perimeterLF', dimensions.perimeterLF, 'linear feet', dimensions.source);
  recordMeasurement(out, 'concreteVolume', yards, 'cubic yards', 'derived_from_measured_area_thickness_and_owner_waste');
  out.priceDrivers.push(`${dimensions.areaSqft} measured square feet at ${thickness} inches thick`, `${c.finishType.replaceAll('_', ' ')} finish`);
  return out;
}

function calculateCleanup(c, p) {
  const out = baseOutput('LANDSCAPING_CLEANUP');
  const area = measured(c.yardSqft, 'yardSqft');
  const debris = p.debrisPricing[c.debrisLevel];
  const debrisMultiplier = quantityFactor(debris.laborMultiplier, `debrisPricing.${c.debrisLevel}.laborMultiplier`);
  const slope = quantityFactor(p.slopeMultiplier[c.slope], `slopeMultiplier.${c.slope}`);
  add(out, makeLine({ name: 'Cleanup labor', category: 'labor', quantity: area, unit: 'measured square feet', rateCents: p.cleanupBaseRatePerSqft, ratePath: 'cleanupBaseRatePerSqft', multipliers: [{ name: 'debris level', value: debrisMultiplier, path: `debrisPricing.${c.debrisLevel}.laborMultiplier` }, { name: 'slope', value: slope, path: `slopeMultiplier.${c.slope}` }], customerDriver: `${area} measured square feet of ${c.debrisLevel} debris` }));
  add(out, fixedLine('Debris disposal', 'disposal', debris.disposalFlat, `debrisPricing.${c.debrisLevel}.disposalFlat`));
  if (c.haulAway) add(out, fixedLine('Additional haul-away', 'disposal', p.haulAwayFee, 'haulAwayFee'));
  out.feeScope.disposal = true;
  out.replacedCommonFees.push('disposal');
  recordMeasurement(out, 'cleanupAreaSqft', area, 'square feet');
  out.priceDrivers.push(`${area} measured square feet`, `${c.debrisLevel} debris level`);
  return out;
}

function calculateMulch(c, p) {
  const out = baseOutput('LANDSCAPING_MULCH');
  const yards = c.inputMethod === 'sqft'
    ? measured(c.mulchArea, 'mulchArea') * (measured(c.mulchDepth, 'mulchDepth') / 12) / 27
    : measured(c.mulchArea, 'mulchArea');
  const overage = quantityFactor(p.mulchOverageFactor, 'mulchOverageFactor');
  const orderYards = yards * overage;
  if (c.bedCondition !== 'clean') add(out, makeLine({ name: 'Bed preparation', category: 'prep', quantity: c.bedSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `bedPrepLaborPerSqft.${c.bedCondition}`), ratePath: `bedPrepLaborPerSqft.${c.bedCondition}`, customerDriver: `${c.bedSqft} measured square feet of ${c.bedCondition.replaceAll('_', ' ')} bed preparation` }));
  add(out, makeLine({ name: 'Mulch material', category: 'material', quantity: orderYards, unit: 'owner-adjusted cubic yards ordered', rateCents: valueAtPath(p, `mulchMaterialPerYard.${c.mulchType}`), ratePath: `mulchMaterialPerYard.${c.mulchType}`, customerDriver: `${yards.toFixed(2)} calculated cubic yards of ${c.mulchType.replaceAll('_', ' ')} mulch` }));
  add(out, makeLine({ name: 'Mulch installation labor', category: 'labor', quantity: yards, unit: 'calculated cubic yards installed', rateCents: p.mulchInstallLaborPerYard, ratePath: 'mulchInstallLaborPerYard' }));
  if (c.edgingNeeded) add(out, makeLine({ name: 'Bed edging', category: 'prep', quantity: c.edgeLF, unit: 'measured linear feet', rateCents: p.edgingPerLinearFoot, ratePath: 'edgingPerLinearFoot', customerDriver: `${c.edgeLF} measured linear feet of bed edging` }));
  out.feeScope.disposal = c.bedCondition !== 'clean';
  recordMeasurement(out, 'mulchVolume', yards, 'cubic yards', c.inputMethod === 'sqft' ? 'derived_from_measured_area_and_depth' : 'customer_measured');
  if (c.edgingNeeded) recordMeasurement(out, 'edgeLengthLF', c.edgeLF, 'linear feet');
  out.priceDrivers.push(`${yards.toFixed(2)} calculated cubic yards of mulch`, c.edgingNeeded ? `${c.edgeLF} measured linear feet of edging` : `Bed condition: ${c.bedCondition.replaceAll('_', ' ')}`);
  return out;
}

function calculateSod(c, p) {
  const out = baseOutput('LANDSCAPING_SOD');
  const sqft = measured(c.sodSqft, 'sodSqft');
  const waste = quantityFactor(p.sodWasteFactor, 'sodWasteFactor', { allowZero: true });
  const slope = quantityFactor(p.slopeMultiplier[c.slope], `slopeMultiplier.${c.slope}`);
  const access = quantityFactor(p.accessMultiplier[c.accessDifficulty], `accessMultiplier.${c.accessDifficulty}`);
  add(out, makeLine({ name: 'Sod material', category: 'material', quantity: sqft * (1 + waste), unit: 'waste-adjusted square feet', rateCents: p.sodMaterialPerSqft, ratePath: 'sodMaterialPerSqft', customerDriver: `${sqft} measured square feet of sod` }));
  add(out, makeLine({ name: 'Sod installation labor', category: 'labor', quantity: sqft, unit: 'measured square feet', rateCents: p.sodInstallLaborPerSqft, ratePath: 'sodInstallLaborPerSqft', multipliers: [{ name: 'slope', value: slope, path: `slopeMultiplier.${c.slope}` }, { name: 'access', value: access, path: `accessMultiplier.${c.accessDifficulty}` }] }));
  if (c.groundPrepNeeded) {
    add(out, makeLine({ name: 'Ground preparation', category: 'prep', quantity: sqft, unit: 'measured square feet', rateCents: p.groundPrepPerSqft, ratePath: 'groundPrepPerSqft' }));
  }
  out.feeScope.disposal = c.groundPrepNeeded;
  recordMeasurement(out, 'sodAreaSqft', sqft, 'square feet');
  out.priceDrivers.push(`${sqft} measured square feet`, c.groundPrepNeeded ? 'Existing-ground preparation included' : `Slope: ${c.slope}`);
  return out;
}

function calculatePlanting(c, p) {
  const out = baseOutput('LANDSCAPING_PLANTING');
  let totalPlants = 0;
  for (const size of ['small', 'medium', 'large']) {
    const plantCount = c.plantsBySize[size];
    totalPlants += plantCount;
    if (plantCount <= 0) continue;
    add(out, makeLine({ name: `${size[0].toUpperCase()}${size.slice(1)} plant installation labor`, category: 'labor', quantity: plantCount, unit: `${size} plants`, rateCents: valueAtPath(p, `plantingLaborPerPlant.${size}`), ratePath: `plantingLaborPerPlant.${size}` }));
    add(out, makeLine({ name: `${size[0].toUpperCase()}${size.slice(1)} plant material allowance`, category: 'material', quantity: plantCount, unit: `${size} plants`, rateCents: valueAtPath(p, `plantMaterialAllowance.${size}`), ratePath: `plantMaterialAllowance.${size}` }));
  }
  if (c.bedCondition !== 'clean') add(out, makeLine({ name: 'Bed preparation', category: 'prep', quantity: c.bedSqft, unit: 'measured square feet', rateCents: valueAtPath(p, `bedPrepLaborPerSqft.${c.bedCondition}`), ratePath: `bedPrepLaborPerSqft.${c.bedCondition}` }));
  if (c.mulchNeeded) {
    const overage = quantityFactor(p.mulchOverageFactor, 'mulchOverageFactor');
    add(out, makeLine({ name: 'Mulch material', category: 'material', quantity: c.mulchYards * overage, unit: 'owner-adjusted cubic yards ordered', rateCents: valueAtPath(p, `mulchMaterialPerYard.${c.mulchType}`), ratePath: `mulchMaterialPerYard.${c.mulchType}` }));
    add(out, makeLine({ name: 'Mulch installation labor', category: 'labor', quantity: c.mulchYards, unit: 'measured cubic yards installed', rateCents: p.mulchInstallLaborPerYard, ratePath: 'mulchInstallLaborPerYard' }));
    recordMeasurement(out, 'mulchYards', c.mulchYards, 'cubic yards');
  }
  out.feeScope.disposal = c.bedCondition !== 'clean';
  recordMeasurement(out, 'plantsBySize', structuredClone(c.plantsBySize), 'plant counts');
  out.priceDrivers.push(`${totalPlants} confirmed plant${totalPlants === 1 ? '' : 's'}`, `Bed condition: ${c.bedCondition.replaceAll('_', ' ')}`);
  return out;
}

function calculateMowing(c, p, ctx) {
  const out = baseOutput('LANDSCAPING_MOWING');
  const sqft = measured(c.yardSqft, 'yardSqft');
  const frequency = quantityFactor(p.frequencyMultipliers[c.serviceFrequency], `frequencyMultipliers.${c.serviceFrequency}`);
  const overgrowth = quantityFactor(p.overgrowthMultipliers[c.grassCondition], `overgrowthMultipliers.${c.grassCondition}`);
  const labor = makeLine({ name: 'Mowing labor', category: 'labor', quantity: sqft, unit: 'measured mowable square feet', rateCents: p.mowingBaseRatePerSqft, ratePath: 'mowingBaseRatePerSqft', multipliers: [{ name: 'frequency', value: frequency, path: `frequencyMultipliers.${c.serviceFrequency}` }, { name: 'grass condition', value: overgrowth, path: `overgrowthMultipliers.${c.grassCondition}` }], customerDriver: `${sqft} measured mowable square feet` });
  add(out, labor);
  let baggingPriced = false;
  if (c.bagClippings) {
    const percent = addonPercent(p.baggingSurchargePercent, 'baggingSurchargePercent');
    if (percent === undefined) ctx.skipAddon('Clipping bagging and disposal');
    else {
      const amount = round(labor.amountCents * percent / 100);
      if (!Number.isSafeInteger(amount) || amount <= 0) throw new QuoteReviewError('Bagging surcharge did not produce a valid charge.', { invalidOwnerFields: ['baggingSurchargePercent'] });
      out.lineItems.push({ name: 'Clipping bagging and disposal', category: 'disposal', amountCents: amount, ownerVisible: true, customerVisible: false, calculation: { basisLine: 'Mowing labor', basisAmountCents: labor.amountCents, percent, ratePath: 'baggingSurchargePercent' } });
      out.replacedCommonFees.push('disposal');
      baggingPriced = true;
    }
  }
  if (c.edgingIncluded) {
    const rate = addonMoney(p.edgingPerLinearFoot, 'edgingPerLinearFoot');
    if (rate === undefined) ctx.skipAddon('Lawn edging');
    else add(out, makeLine({ name: 'Lawn edging', category: 'addon', quantity: c.edgingLengthLF, unit: 'measured linear feet', rateCents: rate, ratePath: 'edgingPerLinearFoot', customerDriver: `${c.edgingLengthLF} measured linear feet of edging` }));
  }
  out.feeScope.disposal = baggingPriced;
  recordMeasurement(out, 'mowableAreaSqft', sqft, 'square feet');
  if (c.edgingIncluded) recordMeasurement(out, 'edgingLengthLF', c.edgingLengthLF, 'linear feet');
  out.priceDrivers.push(`${sqft} measured mowable square feet`, `${c.serviceFrequency.replaceAll('_', ' ')} service`);
  return out;
}

function calculateSidingReplacement(c, p) {
  const out = baseOutput('SIDING_REPLACEMENT');
  const area = measured(c.sidingAreaSqft, 'sidingAreaSqft');
  const waste = quantityFactor(p.wasteFactorByType[c.sidingType], `wasteFactorByType.${c.sidingType}`, { allowZero: true });
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  add(out, makeLine({ name: 'Siding labor', category: 'labor', quantity: area, unit: 'measured wall square feet', rateCents: valueAtPath(p, `laborPerSqft.${c.sidingType}`), ratePath: `laborPerSqft.${c.sidingType}`, multipliers: [{ name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }], customerDriver: `${area} measured square feet of siding wall area` }));
  add(out, makeLine({ name: 'Siding materials', category: 'material', quantity: area * (1 + waste), unit: 'waste-adjusted wall square feet', rateCents: valueAtPath(p, `materialPerSqft.${c.sidingType}`), ratePath: `materialPerSqft.${c.sidingType}`, customerDriver: `Siding type: ${c.sidingType.replaceAll('_', ' ')}` }));
  if (c.oldSidingRemoval) add(out, makeLine({ name: 'Old siding removal', category: 'removal', quantity: area, unit: 'measured wall square feet', rateCents: p.removalPerSqft, ratePath: 'removalPerSqft', multipliers: [{ name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }] }));
  if (c.trimIncluded) add(out, makeLine({ name: 'Siding trim', category: 'material', quantity: c.trimLengthLF, unit: 'measured linear feet', rateCents: p.trimPerLinearFoot, ratePath: 'trimPerLinearFoot', customerDriver: `${c.trimLengthLF} measured linear feet of siding trim` }));
  out.feeScope.disposal = c.oldSidingRemoval;
  if (c.oldSidingRemoval) addDisposalOverride(out, p, 'disposalPerSqft', area, 'removed square feet', 'Siding disposal');
  recordMeasurement(out, 'sidingAreaSqft', area, 'square feet');
  if (c.trimIncluded) recordMeasurement(out, 'trimLengthLF', c.trimLengthLF, 'linear feet');
  out.priceDrivers.push(`${area} measured square feet of siding wall area`, `Siding type: ${c.sidingType.replaceAll('_', ' ')}`);
  return out;
}

function calculateSidingRepair(c, p) {
  const out = baseOutput('SIDING_REPAIR');
  const hoursPath = `repairHours.${c.sidingType}.${c.damageLevel}.${c.repairSize}`;
  const materialPath = `materialAllowance.${c.sidingType}.${c.damageLevel}.${c.repairSize}`;
  const hours = quantityFactor(valueAtPath(p, hoursPath), hoursPath);
  const story = quantityFactor(p.storyMultiplier[c.stories], `storyMultiplier.${c.stories}`);
  add(out, makeLine({ name: 'Siding repair labor', category: 'labor', quantity: hours, unit: 'configured labor hours', rateCents: p.laborHourlyRate, ratePath: 'laborHourlyRate', multipliers: [{ name: 'stories', value: story, path: `storyMultiplier.${c.stories}` }], customerDriver: `${c.repairSize} ${c.damageLevel.replaceAll('_', ' ')} ${c.sidingType.replaceAll('_', ' ')} repair` }));
  add(out, fixedLine('Siding repair materials', 'material', valueAtPath(p, materialPath), materialPath));
  recordMeasurement(out, 'repairScope', { sidingType: c.sidingType, damageLevel: c.damageLevel, repairSize: c.repairSize }, 'selected repair category', 'customer_confirmed');
  out.priceDrivers.push(`${c.repairSize} ${c.damageLevel.replaceAll('_', ' ')} repair`, `Siding type: ${c.sidingType.replaceAll('_', ' ')}`);
  return out;
}

function customQuantity(c, unit) {
  if (unit === 'flat') return { value: 1, unit: 'project' };
  if (unit === 'per_hour') return { value: c.hours, unit: 'measured hours' };
  if (unit === 'per_unit') return { value: c.itemCount, unit: 'confirmed items' };
  if (unit === 'per_sqft') return { value: c.areaSqft, unit: 'measured square feet' };
  if (unit === 'per_LF') return { value: c.linearFeet, unit: 'measured linear feet' };
  if (unit === 'per_square') return { value: c.roofSquares, unit: 'measured roofing squares' };
  throw new QuoteReviewError('Custom service unit is invalid.', { invalidOwnerFields: ['unit'] });
}

function calculateCustom(c, p) {
  const out = baseOutput('CUSTOM');
  const quantity = customQuantity(c, p.unit);
  if (p.customPricingMode === 'fixed') {
    add(out, makeLine({ name: c.service, category: 'labor', quantity: quantity.value, unit: quantity.unit, rateCents: p.price, ratePath: 'price', customerDriver: `${quantity.value} ${quantity.unit}` }));
  } else if (p.customPricingMode === 'range') {
    const midpointRate = round((p.low + p.high) / 2);
    add(out, makeLine({ name: c.service, category: 'labor', quantity: quantity.value, unit: quantity.unit, rateCents: midpointRate, ratePath: 'configured range midpoint', lowRateCents: p.low, highRateCents: p.high, customerDriver: `${quantity.value} ${quantity.unit}` }));
  } else {
    throw new QuoteReviewError('This custom service is inspection-first.');
  }
  recordMeasurement(out, 'customQuantity', quantity.value, quantity.unit);
  out.priceDrivers.push(`${quantity.value} ${quantity.unit}`);
  return out;
}

export function calculateServiceVNext(serviceType, customerInputs, pricing, ctx) {
  if (serviceType === 'ROOFING_REPLACEMENT') return calculateRoofReplacement(customerInputs, pricing, ctx);
  if (serviceType === 'ROOFING_REPAIR') return calculateRoofRepair(customerInputs, pricing, ctx);
  if (serviceType === 'FLAT_ROOF_REPLACEMENT') return calculateFlatRoofReplacement(customerInputs, pricing, ctx);
  if (serviceType === 'FLAT_ROOF_REPAIR') return calculateFlatRoofRepair(customerInputs, pricing, ctx);
  if (serviceType === 'INTERIOR_PAINTING') return calculateInteriorPainting(customerInputs, pricing);
  if (serviceType === 'EXTERIOR_PAINTING') return calculateExteriorPainting(customerInputs, pricing);
  if (serviceType === 'FLOORING_INSTALL' || serviceType === 'FLOORING_REPLACEMENT') return calculateFlooring(serviceType, customerInputs, pricing);
  if (serviceType === 'FENCING_INSTALL' || serviceType === 'FENCING_REPLACEMENT') return calculateFencing(serviceType, customerInputs, pricing);
  if (serviceType === 'CONCRETE_DRIVEWAY' || serviceType === 'CONCRETE_PATIO_SLAB') return calculateConcrete(serviceType, customerInputs, pricing);
  if (serviceType === 'LANDSCAPING_CLEANUP') return calculateCleanup(customerInputs, pricing);
  if (serviceType === 'LANDSCAPING_MULCH') return calculateMulch(customerInputs, pricing);
  if (serviceType === 'LANDSCAPING_SOD') return calculateSod(customerInputs, pricing);
  if (serviceType === 'LANDSCAPING_PLANTING') return calculatePlanting(customerInputs, pricing);
  if (serviceType === 'LANDSCAPING_MOWING') return calculateMowing(customerInputs, pricing, ctx);
  if (serviceType === 'SIDING_REPLACEMENT') return calculateSidingReplacement(customerInputs, pricing);
  if (serviceType === 'SIDING_REPAIR') return calculateSidingRepair(customerInputs, pricing);
  if (serviceType === 'CUSTOM') return calculateCustom(customerInputs, pricing);
  throw new QuoteReviewError('Unsupported service type.');
}
