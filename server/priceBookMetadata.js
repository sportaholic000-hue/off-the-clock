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
  laborPerSqft_CONCRETE_DRIVEWAY: 'Include forming labor, expansion joints, cure & seal in your per-sqft labor rate.',
  laborPerSqft_CONCRETE_PATIO_SLAB: 'Include forming labor, expansion joints, cure & seal in your per-sqft labor rate.',
  laborPerLinearFoot: 'Labor cost per linear foot',
  materialPerLinearFoot: 'Material cost per linear foot',
  postSpacing: 'Post spacing (ft)',
  postPrice: 'Price per post',
  postsIncludedInMaterial: 'Posts already included in material cost?',
  minimumJob: 'Minimum job price',
  repairMinimum: 'Repair minimum',
  minimumServiceCharge: 'Minimum service charge',
  allowAssumptionBasedQuotes: 'Allow size estimates (small/medium/large) when exact measurements are unavailable.'
};

export const ALL_OWNER_FIELDS = {
  ROOFING_REPLACEMENT: ['laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare','accessoryPricingMode','starterPerLF','dripEdgePerLF','ridgeCapPerLF','deckingPerSheet','disposalPerSquare'],
  ROOFING_REPAIR: ['laborHourlyRate','repairMinimum','repairHours','repairMaterialAllowance'],
  INTERIOR_PAINTING: ['laborPerFloorSqft','materialPerFloorSqft2Coats','minimumJob','laborHourlyRate','ceilingLaborPerFloorSqft','trimLaborPerLF','trimMaterialPerLF','trimLinearFeetPerRoom'],
  EXTERIOR_PAINTING: ['exteriorLaborPerSqft','materialPerSqftPerCoat','minimumJob','laborHourlyRate'],
  FLOORING_INSTALL: ['laborPerSqft','materialPerSqft','minimumJob','removalPerSqft','perStepPrice','underlaymentPerSqft','baseboardPerLF','transitionsEach','furnitureMovingFlat'],
  FLOORING_REPLACEMENT: ['laborPerSqft','materialPerSqft','minimumJob','removalPerSqft','perStepPrice','underlaymentPerSqft','subfloorAllowancePerSqft','baseboardPerLF','transitionsEach','furnitureMovingFlat'],
  FENCING_INSTALL: ['laborPerLinearFoot','materialPerLinearFoot','postSpacing','postPrice','concretePerPost','postsIncludedInMaterial','gatePrice','minimumJob'],
  FENCING_REPLACEMENT: ['laborPerLinearFoot','materialPerLinearFoot','postSpacing','postPrice','concretePerPost','postsIncludedInMaterial','gatePrice','minimumJob','removalPerLinearFoot','disposalPerLF'],
  CONCRETE_DRIVEWAY: ['laborPerSqft','concreteCostPerCubicYard','formworkPerLF','minimumJob','demolitionPerSqft','basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft','stampedMaterialPerSqft','disposalPerSqft'],
  CONCRETE_PATIO_SLAB: ['laborPerSqft','concreteCostPerCubicYard','formworkPerLF','minimumJob','demolitionPerSqft','basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft','stampedMaterialPerSqft','disposalPerSqft'],
  LANDSCAPING_CLEANUP: ['cleanupBaseRatePerSqft','debrisPricing','minimumServiceCharge','haulAwayFee'],
  LANDSCAPING_MULCH: ['mulchMaterialPerYard','mulchInstallLaborPerYard','minimumServiceCharge','bedPrepLaborPerSqft','edgingPerLinearFoot'],
  LANDSCAPING_SOD: ['sodMaterialPerSqft','sodInstallLaborPerSqft','minimumServiceCharge','groundPrepPerSqft'],
  LANDSCAPING_PLANTING: ['plantingLaborPerPlant','plantMaterialAllowance','minimumServiceCharge','bedPrepLaborPerSqft','mulchMaterialPerYard','mulchInstallLaborPerYard'],
  LANDSCAPING_MOWING: ['mowingBaseRatePerSqft','minimumServiceCharge','frequencyMultipliers','overgrowthMultipliers','baggingSurchargePercent','edgingPerLinearFoot'],
  SIDING_REPLACEMENT: ['laborPerSqft','materialPerSqft','minimumJob','removalPerSqft','trimPerLinearFoot','houseWrapPerSqft'],
  SIDING_REPAIR: ['laborHourlyRate','repairMinimum','repairHours','materialAllowance'],
  FLAT_ROOF_REPLACEMENT: ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft','minimumJob','insulationPerSqft','disposalPerSqft'],
  FLAT_ROOF_REPAIR: ['laborHourlyRate','repairMinimum','patchRepairHours','patchMaterialAllowance','pondingWaterSurcharge'],
  CUSTOM: ['low','high','unit']
};

export const MONEY_FIELD_NAMES = new Set([
  'laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare',
  'starterPerLF','dripEdgePerLF','ridgeCapPerLF','deckingPerSheet','disposalPerSquare',
  'laborHourlyRate','repairMinimum','repairMaterialAllowance','laborPerFloorSqft',
  'materialPerFloorSqft2Coats','minimumJob','ceilingLaborPerFloorSqft','trimLaborPerLF',
  'trimMaterialPerLF','exteriorLaborPerSqft','materialPerSqftPerCoat','laborPerSqft',
  'materialPerSqft','removalPerSqft','perStepPrice','underlaymentPerSqft',
  'subfloorAllowancePerSqft','baseboardPerLF','transitionsEach','furnitureMovingFlat',
  'laborPerLinearFoot','materialPerLinearFoot','postPrice','concretePerPost','gatePrice',
  'removalPerLinearFoot','disposalPerLF','concreteCostPerCubicYard','formworkPerLF',
  'basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft',
  'stampedMaterialPerSqft','cleanupBaseRatePerSqft','disposalFlat','minimumServiceCharge',
  'haulAwayFee','mulchMaterialPerYard','mulchInstallLaborPerYard','bedPrepLaborPerSqft',
  'edgingPerLinearFoot','sodMaterialPerSqft','sodInstallLaborPerSqft','groundPrepPerSqft',
  'plantingLaborPerPlant','plantMaterialAllowance','mowingBaseRatePerSqft',
  'materialAllowance','membraneCostPerSqft','tearOffPerSqft','insulationPerSqft',
  'patchMaterialAllowance','pondingWaterSurcharge','low','high','travelFee','disposalFee',
  'permitFee','overheadFixed','minimumJobPrice'
]);

const SHAPED_FIELDS = new Set([
  'repairHours','repairMaterialAllowance','debrisPricing','mulchMaterialPerYard',
  'plantingLaborPerPlant','plantMaterialAllowance','frequencyMultipliers',
  'overgrowthMultipliers','materialAllowance','patchRepairHours',
  'patchMaterialAllowance','membraneCostPerSqft'
]);
const SERVICE_SHAPED_FIELDS = new Set([
  'SIDING_REPLACEMENT.materialPerSqft',
  'SIDING_REPLACEMENT.laborPerSqft',
  'FLAT_ROOF_REPLACEMENT.laborPerSqft',
  'FLAT_ROOF_REPLACEMENT.tearOffPerSqft'
]);

const BOOLEAN_FIELDS = new Set(['postsIncludedInMaterial']);
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

function labelFor(serviceType, field) {
  return FIELD_LABELS[`${field}_${serviceType}`] || FIELD_LABELS[field] || field;
}

function fieldType(serviceType, field) {
  if (BOOLEAN_FIELDS.has(field)) return 'boolean';
  if (SELECT_FIELDS[field]) return 'select';
  if (SHAPED_FIELDS.has(field) || SERVICE_SHAPED_FIELDS.has(`${serviceType}.${field}`)) return 'json';
  return 'number';
}

export function getServiceMetadata() {
  return SERVICE_TYPES.map(serviceType => {
    const baseRequired = getRequiredOwnerFields(serviceType, {});
    return {
      serviceType,
      name: SERVICE_NAMES[serviceType],
      fields: (ALL_OWNER_FIELDS[serviceType] || []).map(field => ({
        field,
        label: labelFor(serviceType, field),
        type: fieldType(serviceType, field),
        options: SELECT_FIELDS[field] || null,
        money: MONEY_FIELD_NAMES.has(field),
        requiredAtBase: baseRequired.includes(field),
        minimumAllowsZero: ['minimumJob','repairMinimum','minimumServiceCharge'].includes(field)
      })),
      class2Defaults: CLASS2_DEFAULTS_BY_SERVICE[serviceType] || {},
      sampleInputs: SAMPLE_INPUTS[serviceType] || {}
    };
  });
}
