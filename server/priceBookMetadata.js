import { getRequiredOwnerFields, SERVICE_TYPES } from './quoteTemplates.js';

export const SERVICE_NAMES = {
  ROOFING_REPLACEMENT: 'Roof replacement',
  ROOFING_REPAIR: 'Roof repair',
  FLAT_ROOF_REPLACEMENT: 'Flat roof replacement',
  FLAT_ROOF_REPAIR: 'Flat roof repair',
  INTERIOR_PAINTING: 'Interior painting',
  EXTERIOR_PAINTING: 'Exterior painting',
  FLOORING_INSTALL: 'Flooring installation',
  FLOORING_REPLACEMENT: 'Flooring replacement',
  FENCING_INSTALL: 'Fencing installation',
  FENCING_REPLACEMENT: 'Fencing replacement',
  SIDING_REPLACEMENT: 'Siding replacement',
  SIDING_REPAIR: 'Siding repair',
  CONCRETE_DRIVEWAY: 'Concrete driveway',
  CONCRETE_PATIO_SLAB: 'Concrete patio slab',
  LANDSCAPING_CLEANUP: 'Landscaping cleanup',
  LANDSCAPING_MULCH: 'Mulch installation',
  LANDSCAPING_SOD: 'Sod installation',
  LANDSCAPING_PLANTING: 'Planting',
  LANDSCAPING_MOWING: 'Mowing',
  CUSTOM: 'Custom service'
};

const FIELD_LABELS = {
  materialCostPerSquare: 'Your all-in installed material price per square, INCLUDING starter, drip edge, ridge cap, flashing, and vents.',
  laborPerFloorSqft: 'Your labor price per square foot of FLOOR area — walls only, two coats, standard 8-ft ceilings.',
  materialPerFloorSqft2Coats: 'Your paint/material cost per square foot of FLOOR area for two coats on walls.',
  concretePerPost: 'Concrete + digging cost per post at your local frost/set depth.',
  gatePrice: "Installed price per gate INCLUDING gate posts' hardware; gate posts themselves are counted below.",
  basePrepPerSqft: 'Excavation + compacted gravel base + grading, per square foot.',
  groundPrepPerSqft: 'Per sqft to remove existing grass, haul it away, grade/compact, and add topsoil as needed. Prep is often the majority of a sod job — make sure this number covers disposal of the old lawn.',
  materialPerSqft_SIDING_REPLACEMENT: 'All-in installed material per sqft for this siding type, INCLUDING house wrap, J-channel, corner posts, and starter strip — accessories run 20–30% of vinyl material cost.',
  laborPerSqft_FLOORING_INSTALL: 'Labor price per square foot by flooring type.',
  laborPerSqft_FLOORING_REPLACEMENT: 'Labor price per square foot by flooring type.',
  materialPerSqft_FLOORING_INSTALL: 'Material price per square foot by flooring type.',
  materialPerSqft_FLOORING_REPLACEMENT: 'Material price per square foot by flooring type.',
  disposalPerSqft_FLOORING_INSTALL: 'Optional disposal price per square foot when removal is included.',
  disposalPerSqft_FLOORING_REPLACEMENT: 'Optional disposal price per square foot when removal is included.',
  disposalPerSqft_SIDING_REPLACEMENT: 'Optional disposal price per square foot when removal is included.',
  laborPerSqft_CONCRETE_DRIVEWAY: 'Include forming labor, expansion joints, cure & seal in your per-sqft labor rate.',
  laborPerSqft_CONCRETE_PATIO_SLAB: 'Include forming labor, expansion joints, cure & seal in your per-sqft labor rate.',
  laborPerLinearFoot: 'Labor cost per linear foot',
  materialPerLinearFoot: 'Material cost per linear foot',
  postSpacing: 'Post spacing (ft)',
  postPrice: 'Price per post',
  postsIncludedInMaterial: 'Posts already included in material cost?',
  minimumJob: 'Minimum job price',
  allowAssumptionBasedQuotes: 'Allow size estimates (small/medium/large) when exact measurements are unavailable.'
};

export const ALL_OWNER_FIELDS = {
  ROOFING_REPLACEMENT: ['laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare','accessoryPricingMode','starterPerLF','dripEdgePerLF','ridgeCapPerLF','deckingPerSheet','disposalPerSquare','allowAssumptionBasedQuotes'],
  ROOFING_REPAIR: ['laborHourlyRate','repairMinimum','repairHours','repairMaterialAllowance'],
  INTERIOR_PAINTING: ['laborPerFloorSqft','materialPerFloorSqft2Coats','minimumJob','laborHourlyRate','ceilingLaborPerFloorSqft','trimLaborPerLF','trimMaterialPerLF','trimLinearFeetPerRoom','allowAssumptionBasedQuotes'],
  EXTERIOR_PAINTING: ['exteriorLaborPerSqft','materialPerSqftPerCoat','minimumJob','laborHourlyRate','allowAssumptionBasedQuotes'],
  FLOORING_INSTALL: ['laborPerSqft','materialPerSqft','minimumJob','removalPerSqft','disposalPerSqft','perStepPrice','underlaymentPerSqft','allowAssumptionBasedQuotes'],
  FLOORING_REPLACEMENT: ['laborPerSqft','materialPerSqft','minimumJob','removalPerSqft','disposalPerSqft','perStepPrice','underlaymentPerSqft','subfloorAllowancePerSqft','allowAssumptionBasedQuotes'],
  FENCING_INSTALL: ['laborPerLinearFoot','materialPerLinearFoot','postSpacing','postPrice','concretePerPost','postsIncludedInMaterial','gatePrice','minimumJob','allowAssumptionBasedQuotes'],
  FENCING_REPLACEMENT: ['laborPerLinearFoot','materialPerLinearFoot','postSpacing','postPrice','concretePerPost','postsIncludedInMaterial','gatePrice','minimumJob','removalPerLinearFoot','disposalPerLF','allowAssumptionBasedQuotes'],
  CONCRETE_DRIVEWAY: ['laborPerSqft','concreteCostPerCubicYard','formworkPerLF','minimumJob','demolitionPerSqft','basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft','stampedMaterialPerSqft','disposalPerSqft','allowAssumptionBasedQuotes'],
  CONCRETE_PATIO_SLAB: ['laborPerSqft','concreteCostPerCubicYard','formworkPerLF','minimumJob','demolitionPerSqft','basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft','stampedMaterialPerSqft','disposalPerSqft','allowAssumptionBasedQuotes'],
  LANDSCAPING_CLEANUP: ['cleanupBaseRatePerSqft','debrisPricing','minimumServiceCharge','haulAwayFee','allowAssumptionBasedQuotes'],
  LANDSCAPING_MULCH: ['mulchMaterialPerYard','mulchInstallLaborPerYard','minimumServiceCharge','bedPrepLaborPerSqft','edgingPerLinearFoot'],
  LANDSCAPING_SOD: ['sodMaterialPerSqft','sodInstallLaborPerSqft','minimumServiceCharge','groundPrepPerSqft','allowAssumptionBasedQuotes'],
  LANDSCAPING_PLANTING: ['plantingLaborPerPlant','plantMaterialAllowance','minimumServiceCharge','bedPrepLaborPerSqft','mulchMaterialPerYard','mulchInstallLaborPerYard'],
  LANDSCAPING_MOWING: ['mowingBaseRatePerSqft','minimumServiceCharge','frequencyMultipliers','overgrowthMultipliers','baggingSurchargePercent','edgingPerLinearFoot','allowAssumptionBasedQuotes'],
  SIDING_REPLACEMENT: ['laborPerSqft','materialPerSqft','minimumJob','removalPerSqft','disposalPerSqft','trimPerLinearFoot','allowAssumptionBasedQuotes'],
  SIDING_REPAIR: ['laborHourlyRate','repairMinimum','repairHours','materialAllowance'],
  FLAT_ROOF_REPLACEMENT: ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft','minimumJob','insulationPerSqft','disposalPerSqft','allowAssumptionBasedQuotes'],
  FLAT_ROOF_REPAIR: ['laborHourlyRate','repairMinimum','patchRepairHours','patchMaterialAllowance','pondingWaterSurcharge'],
  CUSTOM: ['low','high','unit','allowAssumptionBasedQuotes','minimumJob']
};

export const MONEY_FIELD_NAMES = new Set([
  'laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare',
  'starterPerLF','dripEdgePerLF','ridgeCapPerLF','deckingPerSheet','disposalPerSquare',
  'laborHourlyRate','repairMinimum','repairMaterialAllowance','laborPerFloorSqft',
  'materialPerFloorSqft2Coats','minimumJob','ceilingLaborPerFloorSqft','trimLaborPerLF',
  'trimMaterialPerLF','exteriorLaborPerSqft','materialPerSqftPerCoat','laborPerSqft',
  'materialPerSqft','removalPerSqft','perStepPrice','underlaymentPerSqft',
  'subfloorAllowancePerSqft','laborPerLinearFoot','materialPerLinearFoot','postPrice','concretePerPost','gatePrice',
  'removalPerLinearFoot','disposalPerLF','concreteCostPerCubicYard','formworkPerLF',
  'basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft',
  'stampedMaterialPerSqft','cleanupBaseRatePerSqft','disposalFlat','minimumServiceCharge',
  'haulAwayFee','mulchMaterialPerYard','mulchInstallLaborPerYard','bedPrepLaborPerSqft',
  'edgingPerLinearFoot','sodMaterialPerSqft','sodInstallLaborPerSqft','groundPrepPerSqft',
  'plantingLaborPerPlant','plantMaterialAllowance','mowingBaseRatePerSqft',
  'materialAllowance','membraneCostPerSqft','tearOffPerSqft','insulationPerSqft',
  'patchMaterialAllowance','pondingWaterSurcharge','low','high','travelFee','disposalFee',
  'permitFee','overheadFixed','minimumJobPrice',
  'disposalPerSqft','demolitionPerSqft','trimPerLinearFoot'
]);

// Owner fields that are legitimately NOT money. Every other field in
// ALL_OWNER_FIELDS must appear in MONEY_FIELD_NAMES — enforced by a
// regression test so a new field can never silently skip cents conversion.
export const NON_MONEY_OWNER_FIELDS = new Set([
  'allowAssumptionBasedQuotes','postsIncludedInMaterial','accessoryPricingMode','unit',
  'postSpacing','trimLinearFeetPerRoom','repairHours','patchRepairHours',
  'frequencyMultipliers','overgrowthMultipliers','baggingSurchargePercent','debrisPricing'
]);

const SHAPED_FIELDS = new Set([
  'repairHours','repairMaterialAllowance','debrisPricing','mulchMaterialPerYard',
  'plantingLaborPerPlant','plantMaterialAllowance','frequencyMultipliers',
  'overgrowthMultipliers','materialAllowance','patchRepairHours',
  'patchMaterialAllowance','membraneCostPerSqft'
]);
const SERVICE_SHAPED_FIELDS = new Set([
  'FLOORING_INSTALL.laborPerSqft',
  'FLOORING_INSTALL.materialPerSqft',
  'FLOORING_REPLACEMENT.laborPerSqft',
  'FLOORING_REPLACEMENT.materialPerSqft',
  'SIDING_REPLACEMENT.materialPerSqft',
  'SIDING_REPLACEMENT.laborPerSqft',
  'FLAT_ROOF_REPLACEMENT.laborPerSqft',
  'FLAT_ROOF_REPLACEMENT.tearOffPerSqft'
]);

const BOOLEAN_FIELDS = new Set(['postsIncludedInMaterial','allowAssumptionBasedQuotes']);
const SELECT_FIELDS = {
  accessoryPricingMode: ['per_square_allin','itemized'],
  unit: ['flat','per_sqft','per_hour','per_unit','per_LF','per_square']
};

export const CLASS2_DEFAULTS_BY_SERVICE = {
  ROOFING_REPLACEMENT: {
    wasteSimple: 0.10, wasteModerate: 0.13, wasteComplex: 0.18,
    pitchAreaFactor: { low: 1.05, medium: 1.12, steep: 1.23, very_steep: 1.40 },
    overhangFactor: 1.08,
    pitchMultiplier: { low: 1, medium: 1.15, steep: 1.25, very_steep: 1.40 },
    storyMultiplier: { 1: 1, 2: 1.10, 3: 1.20 }
  },
  ROOFING_REPAIR: {
    pitchMultiplier: { low: 1, medium: 1.15, steep: 1.25, very_steep: 1.40 },
    storyMultiplier: { 1: 1, 2: 1.10, 3: 1.20 }
  },
  INTERIOR_PAINTING: {
    roomFloorSqft: { small: 120, medium: 200, large: 320 },
    coatLaborFactor: { 1: 0.70, 2: 1, 3: 1.30 },
    coatMaterialFactor: { 1: 0.50, 2: 1, 3: 1.50 },
    wallHeightMultiplier: { standard: 1, high: 1.10, vaulted: 1.25 },
    prepHoursPerSqft: { fair: 0.015, poor: 0.035 },
    ceilingMaterialFactor: 0.5
  },
  EXTERIOR_PAINTING: {
    paintableAreaMap: { 1: { small: 900, medium: 1400, large: 2000, xlarge: 2800 }, 2: { small: 1400, medium: 2200, large: 3100, xlarge: 4200 }, 3: { small: 1960, medium: 3080, large: 4340, xlarge: 5880 } },
    storyMultiplier: { 1: 1, 2: 1.10, 3: 1.20 },
    prepHoursPerSqft: { fair: 0.008, poor: 0.02 }
  },
  FLOORING_INSTALL: {
    wasteFactorByType: { hardwood: 0.10, laminate: 0.08, vinyl_plank: 0.08, carpet: 0.10, tile: 0.12 },
    patternWasteAdder: { straight: 0, diagonal_or_pattern: 0.07 },
    roomComplexityMultiplier: { large: 1, medium: 1.10, small: 1.20 }
  },
  FLOORING_REPLACEMENT: {
    wasteFactorByType: { hardwood: 0.10, laminate: 0.08, vinyl_plank: 0.08, carpet: 0.10, tile: 0.12 },
    patternWasteAdder: { straight: 0, diagonal_or_pattern: 0.07 },
    roomComplexityMultiplier: { large: 1, medium: 1.10, small: 1.20 }
  },
  FENCING_INSTALL: {
    heightMultiplierLabor: { 4: 0.85, 6: 1, 8: 1.20 },
    heightMultiplierMaterial: { 4: 0.80, 6: 1, 8: 1.35 },
    terrainMultiplier: { flat: 1, moderate: 1.15, steep: 1.30 }
  },
  FENCING_REPLACEMENT: {
    heightMultiplierLabor: { 4: 0.85, 6: 1, 8: 1.20 },
    heightMultiplierMaterial: { 4: 0.80, 6: 1, 8: 1.35 },
    terrainMultiplier: { flat: 1, moderate: 1.15, steep: 1.30 }
  },
  CONCRETE_DRIVEWAY: {
    concreteWasteFactor: 0.10, assumedDrivewayWidthFt: 11,
    finishMultiplier: { broom: 1, smooth: 1.05, exposed_aggregate: 1.20, stamped: 1.50 },
    accessMultiplier: { easy: 1, moderate: 1.10, difficult: 1.25 }
  },
  CONCRETE_PATIO_SLAB: {
    concreteWasteFactor: 0.10,
    finishMultiplier: { broom: 1, smooth: 1.05, exposed_aggregate: 1.20, stamped: 1.50 },
    accessMultiplier: { easy: 1, moderate: 1.10, difficult: 1.25 }
  },
  LANDSCAPING_CLEANUP: { slopeMultiplier: { flat: 1, moderate: 1.15, steep: 1.35 } },
  LANDSCAPING_MULCH: { mulchOverageFactor: 1.15 },
  LANDSCAPING_SOD: {
    sodWasteFactor: 0.05,
    slopeMultiplier: { flat: 1, moderate: 1.15, steep: 1.35 },
    accessMultiplier: { easy: 1, moderate: 1.10, difficult: 1.25 }
  },
  LANDSCAPING_PLANTING: { mulchOverageFactor: 1.15 },
  LANDSCAPING_MOWING: {},
  SIDING_REPLACEMENT: {
    wasteFactorByType: { vinyl: 0.10, fiber_cement: 0.12, wood: 0.12, metal: 0.10 },
    sidingAreaMap: { 1: { small: 900, medium: 1400, large: 2000, xlarge: 2800 }, 2: { small: 1400, medium: 2200, large: 3100, xlarge: 4200 }, 3: { small: 1960, medium: 3080, large: 4340, xlarge: 5880 } },
    trimRatio: 0.15,
    storyMultiplier: { 1: 1, 2: 1.10, 3: 1.20 }
  },
  SIDING_REPAIR: { storyMultiplier: { 1: 1, 2: 1.10, 3: 1.20 } },
  FLAT_ROOF_REPLACEMENT: { accessMultiplier: { easy: 1, moderate: 1.15, difficult: 1.30 } },
  FLAT_ROOF_REPAIR: {},
  CUSTOM: {}
};

export const SAMPLE_INPUTS = {
  ROOFING_REPLACEMENT: { roofSizeInput: 2000, roofSizeMethod: 'roof_measured', roofType: 'architectural', pitch: 'medium', stories: 1, existingLayers: '1', roofComplexity: 'simple', serviceScope: 'full' },
  ROOFING_REPAIR: { repairType: 'flashing', affectedArea: 80, roofType: 'architectural', pitch: 'medium', stories: 1, leakPresent: false },
  FLAT_ROOF_REPLACEMENT: { roofSqft: 1000, sqftMethod: 'exact', membraneType: 'average', existingLayers: '1', accessDifficulty: 'easy', serviceScope: 'full', buildingType: 'residential' },
  FLAT_ROOF_REPAIR: { repairType: 'patch', affectedArea: 40, membraneType: 'unknown', leakPresent: false, pondingWater: false },
  INTERIOR_PAINTING: { areaInputMethod: 'sqft', floorAreaSqft: 1200, wallHeight: 'standard', surfaceCondition: 'good', coats: 2, ceilingsIncluded: false, trimIncluded: false },
  EXTERIOR_PAINTING: { areaInputMethod: 'sqft', exteriorAreaSqft: 1600, stories: 1, surfaceCondition: 'good', coats: 2 },
  FLOORING_INSTALL: { sqft: 600, sqftMethod: 'exact', newFlooringType: 'tile', existingFloorType: 'none', removalNeeded: false, roomCount: 3, layoutPattern: 'straight', stairSteps: 0 },
  FLOORING_REPLACEMENT: { sqft: 600, sqftMethod: 'exact', newFlooringType: 'tile', existingFloorType: 'vinyl', removalNeeded: false, roomCount: 3, layoutPattern: 'straight', stairSteps: 0, subfloorIssues: false },
  FENCING_INSTALL: { linearFeet: 120, lfMethod: 'exact', fenceType: 'cedar', fenceHeight: 6, gateCount: 1, cornerCount: 2, terrainSlope: 'moderate' },
  FENCING_REPLACEMENT: { linearFeet: 120, lfMethod: 'exact', fenceType: 'cedar', fenceHeight: 6, gateCount: 1, cornerCount: 2, terrainSlope: 'moderate', oldFenceRemoval: false },
  SIDING_REPLACEMENT: { areaInputMethod: 'sqft', sidingAreaSqft: 1800, sidingType: 'vinyl', stories: 1, oldSidingRemoval: false, trimIncluded: false },
  SIDING_REPAIR: { affectedArea: 40, sidingType: 'vinyl', damageLevel: 'moderate', stories: 1 },
  CONCRETE_DRIVEWAY: { dimensionMethod: 'exact', length: 40, width: 20, thickness: 4, finishType: 'broom', demolitionNeeded: false, reinforcement: 'none', accessDifficulty: 'easy', baseNeeded: false },
  CONCRETE_PATIO_SLAB: { dimensionMethod: 'exact', length: 20, width: 20, thickness: 4, finishType: 'broom', reinforcement: 'none', accessDifficulty: 'easy', baseNeeded: false },
  LANDSCAPING_CLEANUP: { yardSize: 3500, debrisLevel: 'moderate', slope: 'flat', haulAway: false },
  LANDSCAPING_MULCH: { inputMethod: 'sqft', mulchArea: 900, mulchDepth: 3, mulchType: 'standard', bedCondition: 'clean', edgingNeeded: false },
  LANDSCAPING_SOD: { sodSqft: 1200, sqftMethod: 'exact', groundPrepNeeded: false, slope: 'flat', accessDifficulty: 'easy' },
  LANDSCAPING_PLANTING: { plantCount: 12, plantSize: 'medium', bedCondition: 'clean', mulchNeeded: false },
  LANDSCAPING_MOWING: { yardSqft: 5000, sqftMethod: 'exact', serviceFrequency: 'weekly', grassCondition: 'maintained', bagClippings: false, edgingIncluded: false },
  CUSTOM: { service: 'Sample service', unit: 'flat', quantity: 1 }
};

const ACTIVATION_SCENARIOS = {
  INTERIOR_PAINTING: [{ surfaceCondition:'fair', ceilingsIncluded:true, trimIncluded:true }],
  EXTERIOR_PAINTING: [{ surfaceCondition:'fair' }],
  FLOORING_INSTALL: [{ removalNeeded:true, stairSteps:1, newFlooringType:'hardwood', underlaymentApplies:true }],
  FLOORING_REPLACEMENT: [{ removalNeeded:true, stairSteps:1, newFlooringType:'hardwood', underlaymentApplies:true, subfloorIssues:true }],
  FENCING_REPLACEMENT: [{ oldFenceRemoval:true }],
  CONCRETE_DRIVEWAY: [
    { demolitionNeeded:true, baseNeeded:true, reinforcement:'wire_mesh', finishType:'stamped' },
    { reinforcement:'rebar' }
  ],
  CONCRETE_PATIO_SLAB: [
    { demolitionNeeded:true, baseNeeded:true, reinforcement:'wire_mesh', finishType:'stamped' },
    { reinforcement:'rebar' }
  ],
  LANDSCAPING_CLEANUP: [{ haulAway:true }],
  LANDSCAPING_MULCH: [{ bedCondition:'needs_weeding', edgingNeeded:true }],
  LANDSCAPING_SOD: [{ groundPrepNeeded:true }],
  LANDSCAPING_PLANTING: [{ bedCondition:'needs_weeding', mulchNeeded:true }],
  SIDING_REPLACEMENT: [{ oldSidingRemoval:true, trimIncluded:true }],
  FLAT_ROOF_REPLACEMENT: [{ buildingType:'commercial' }]
};

export function getActivationOwnerFields(serviceType, pricing = {}) {
  const scenarios = [{}, ...(ACTIVATION_SCENARIOS[serviceType] || [])];
  if (serviceType === 'ROOFING_REPLACEMENT' && pricing.accessoryPricingMode === 'itemized') {
    scenarios.push({ accessoryPricingMode:'itemized' });
  }
  return [...new Set(scenarios.flatMap(inputs => getRequiredOwnerFields(serviceType, inputs)))];
}


// Key domains for shaped (map) owner fields, extracted from
// quote_engine_v2.md. keys:null marks an OPEN domain: the spec keys the
// field by an owner-defined customer answer, so the first-level domain
// remains extensible. nested lists are CLOSED second-level keys.
// customerField names the customer input whose answer selects the key at
// quote time; unknownKey maps the customer's 'unknown' to a mandated key.
export const SHAPED_FIELD_KEYS = {
  'FLOORING_INSTALL.laborPerSqft': { keys:['hardwood','laminate','vinyl_plank','carpet','tile'], customerField:'newFlooringType' },
  'FLOORING_INSTALL.materialPerSqft': { keys:['hardwood','laminate','vinyl_plank','carpet','tile'], customerField:'newFlooringType' },
  'FLOORING_REPLACEMENT.laborPerSqft': { keys:['hardwood','laminate','vinyl_plank','carpet','tile'], customerField:'newFlooringType' },
  'FLOORING_REPLACEMENT.materialPerSqft': { keys:['hardwood','laminate','vinyl_plank','carpet','tile'], customerField:'newFlooringType' },
  'SIDING_REPLACEMENT.laborPerSqft': { keys:['vinyl','fiber_cement','wood','metal'], customerField:'sidingType' },
  'SIDING_REPLACEMENT.materialPerSqft': { keys:['vinyl','fiber_cement','wood','metal'], customerField:'sidingType' },
  'FLAT_ROOF_REPLACEMENT.laborPerSqft': { keys:null, requiredKeys:['average'], customerField:'membraneType', unknownKey:'average' },
  'FLAT_ROOF_REPLACEMENT.membraneCostPerSqft': { keys:null, requiredKeys:['average'], customerField:'membraneType', unknownKey:'average' },
  'FLAT_ROOF_REPLACEMENT.tearOffPerSqft': { keys:null, requiredKeys:['average'], customerField:'membraneType', unknownKey:'average' },
  'ROOFING_REPAIR.repairHours': { keys:null, nested:['small','medium','large'], customerField:'repairType', sizeBreakpoints:[50,200] },
  'ROOFING_REPAIR.repairMaterialAllowance': { keys:null, customerField:'repairType' },
  'SIDING_REPAIR.repairHours': { keys:null, nested:['small','medium','large'], customerField:'damageLevel', sizeBreakpoints:[20,80] },
  'SIDING_REPAIR.materialAllowance': { keys:null, nested:['small','medium','large'], customerField:'damageLevel', sizeBreakpoints:[20,80] },
  'FLAT_ROOF_REPAIR.patchRepairHours': { keys:null, nested:['small','medium','large'], customerField:'repairType', sizeBreakpoints:[20,80] },
  'FLAT_ROOF_REPAIR.patchMaterialAllowance': { keys:null, nested:['small','medium','large'], customerField:'repairType', sizeBreakpoints:[20,80] },
  'LANDSCAPING_CLEANUP.debrisPricing': { keys:['light','moderate','heavy'], nested:['laborMultiplier','disposalFlat'], customerField:'debrisLevel', consumeAllNested:true },
  'LANDSCAPING_MULCH.mulchMaterialPerYard': { keys:null, customerField:'mulchType' },
  'LANDSCAPING_PLANTING.plantingLaborPerPlant': { keys:['small','medium','large','mixed'], customerField:'plantSize' },
  'LANDSCAPING_PLANTING.plantMaterialAllowance': { keys:['small','medium','large','mixed'], customerField:'plantSize' },
  'LANDSCAPING_MOWING.frequencyMultipliers': { keys:['weekly','biweekly','monthly','one_time'], customerField:'serviceFrequency' },
  'LANDSCAPING_MOWING.overgrowthMultipliers': { keys:['maintained','overgrown','severe'], customerField:'grassCondition' }
};

export function shapedFieldKeys(serviceType, field) {
  return SHAPED_FIELD_KEYS[`${serviceType}.${field}`] || null;
}

const CLASS2_UNIT_OVERRIDES = {
  roomFloorSqft:'sq ft',
  paintableAreaMap:'sq ft',
  sidingAreaMap:'sq ft',
  assumedDrivewayWidthFt:'ft'
};

function humanizeFactorName(field) {
  const words = String(field)
    .replace(/_/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function class2Unit(field) {
  if (CLASS2_UNIT_OVERRIDES[field]) return CLASS2_UNIT_OVERRIDES[field];
  if (/multiplier|factor|adder|ratio|waste/i.test(field)) return 'decimal';
  return 'number';
}

function class2Definitions(serviceType) {
  return Object.entries(CLASS2_DEFAULTS_BY_SERVICE[serviceType] || {}).map(([field, defaultValue]) => ({
    field,
    label: humanizeFactorName(field),
    unit: class2Unit(field),
    defaultValue
  }));
}

export const ZERO_ALLOWED_OWNER_FIELDS = ['minimumJob', 'repairMinimum', 'minimumServiceCharge'];

export function ownerFieldLabel(serviceType, field) {
  return FIELD_LABELS[`${field}_${serviceType}`] || FIELD_LABELS[field] || field;
}

function labelFor(serviceType, field) {
  return ownerFieldLabel(serviceType, field);
}

function fieldType(serviceType, field) {
  if (BOOLEAN_FIELDS.has(field)) return 'boolean';
  if (SELECT_FIELDS[field]) return 'select';
  if (SHAPED_FIELDS.has(field) || SERVICE_SHAPED_FIELDS.has(`${serviceType}.${field}`)) return 'json';
  return 'number';
}

export function getServiceMetadata() {
  return SERVICE_TYPES.map(serviceType => {
    const baseRequired = getActivationOwnerFields(serviceType, {});
    return {
      serviceType,
      name: SERVICE_NAMES[serviceType],
      fields: (ALL_OWNER_FIELDS[serviceType] || []).map(field => ({
        field,
        label: labelFor(serviceType, field),
        type: fieldType(serviceType, field),
        options: SELECT_FIELDS[field] || null,
        money: MONEY_FIELD_NAMES.has(field),
        shapedKeys: SHAPED_FIELD_KEYS[`${serviceType}.${field}`] || null,
        zeroAllowed: ZERO_ALLOWED_OWNER_FIELDS.includes(field),
        requiredAtBase: baseRequired.includes(field),
        minimumAllowsZero: ['minimumJob','repairMinimum','minimumServiceCharge'].includes(field)
      })),
      class2Defaults: CLASS2_DEFAULTS_BY_SERVICE[serviceType] || {},
      class2Fields: class2Definitions(serviceType),
      sampleInputs: SAMPLE_INPUTS[serviceType] || {}
    };
  });
}
