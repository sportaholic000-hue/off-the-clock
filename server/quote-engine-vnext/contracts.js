export const SERVICE_TYPES = [
  'ROOFING_REPLACEMENT', 'ROOFING_REPAIR',
  'FLAT_ROOF_REPLACEMENT', 'FLAT_ROOF_REPAIR',
  'INTERIOR_PAINTING', 'EXTERIOR_PAINTING',
  'FLOORING_INSTALL', 'FLOORING_REPLACEMENT',
  'FENCING_INSTALL', 'FENCING_REPLACEMENT',
  'SIDING_REPLACEMENT', 'SIDING_REPAIR',
  'CONCRETE_DRIVEWAY', 'CONCRETE_PATIO_SLAB',
  'LANDSCAPING_CLEANUP', 'LANDSCAPING_MULCH',
  'LANDSCAPING_SOD', 'LANDSCAPING_PLANTING',
  'LANDSCAPING_MOWING', 'CUSTOM'
];

export const FEE_NAMES = ['travel', 'disposal', 'permit', 'overhead'];
export const FEE_RULE_MODES = [
  'not_applicable',
  'included_in_rates',
  'always',
  'when_scope_selected',
  'owner_selected',
  'customer_selected'
];
export const PRICE_BASIS_CATEGORIES = [
  'labor', 'material', 'removal', 'prep', 'addon', 'equipment',
  'travel', 'disposal', 'permit', 'overhead', 'surcharge'
];
export const TAXABILITY_CATEGORIES = [
  ...PRICE_BASIS_CATEGORIES,
  'minimum_adjustment'
];

export function repairSizeFromAffectedArea(serviceType, affectedArea) {
  if (typeof affectedArea !== 'number' || !Number.isFinite(affectedArea) || affectedArea <= 0) return null;
  const boundaries = serviceType === 'ROOFING_REPAIR' ? [50, 200] : [20, 80];
  if (!['ROOFING_REPAIR', 'FLAT_ROOF_REPAIR', 'SIDING_REPAIR'].includes(serviceType)) return null;
  if (affectedArea < boundaries[0]) return 'small';
  if (affectedArea <= boundaries[1]) return 'medium';
  return 'large';
}

const FLOORING_TYPES = ['hardwood', 'laminate', 'vinyl_plank', 'carpet', 'tile'];
const SIDING_TYPES = ['vinyl', 'fiber_cement', 'wood', 'metal'];
const SIZE_KEYS = ['small', 'medium', 'large'];
const PITCHES = ['low', 'medium', 'steep', 'very_steep'];
const STORIES = [1, 2, 3];
const ACCESS = ['easy', 'moderate', 'difficult'];
const SLOPES = ['flat', 'moderate', 'steep'];

const field = (label, unit, type, extra = {}) => ({ label, unit, type, ...extra });
const numberField = (label, unit, min, max, extra = {}) => field(label, unit, 'number', { min, max, ...extra });
const enumField = (label, values) => field(label, null, 'enum', { values });
const booleanField = label => field(label, null, 'boolean');
const slugField = label => field(label, null, 'slug');

const measuredArea = numberField('Measured area', 'square feet', 1, 1_000_000);
const measuredLength = numberField('Confirmed measured length', 'linear feet', 0, 1_000_000);

function commonContract({ fields, required, inspection, crossValidate }) {
  return { fields, required, inspection, crossValidate };
}

export const MEASUREMENT_CONTRACTS = {
  ROOFING_REPLACEMENT: commonContract({
    fields: {
      roofSizeMethod: enumField('Roof measurement method', ['roof_measured', 'home_floor_area', 'assumption']),
      roofSizeInput: numberField('Measured roof surface area', 'square feet', 50, 1_000_000),
      existingRoofType: slugField('Existing roofing material'),
      replacementRoofType: slugField('Replacement roofing material'),
      pitch: enumField('Roof pitch', PITCHES),
      stories: enumField('Building stories', STORIES),
      existingLayers: numberField('Measured existing roof layers', 'layers', 1, 10, { integer: true }),
      roofComplexity: enumField('Roof complexity', ['simple', 'moderate', 'complex']),
      serviceScope: enumField('Replacement scope', ['full', 'partial']),
      partialPercent: numberField('Confirmed affected portion', 'percent', 0.1, 100),
      partialAreaSqft: numberField('Measured affected roof area', 'square feet', 1, 1_000_000),
      starterLengthLF: measuredLength,
      dripEdgeLengthLF: measuredLength,
      ridgeCapLengthLF: measuredLength,
      deckingSheets: numberField('Confirmed decking sheets to replace', 'sheets', 0, 100_000, { integer: true })
    },
    required(c, p) {
      const out = ['roofSizeMethod', 'roofSizeInput', 'existingRoofType', 'replacementRoofType', 'pitch', 'stories', 'existingLayers', 'roofComplexity', 'serviceScope'];
      if (c.serviceScope === 'partial' && c.partialPercent === undefined && c.partialAreaSqft === undefined) out.push('partialAreaSqft');
      if (p.accessoryPricingMode === 'itemized') out.push('starterLengthLF', 'dripEdgeLengthLF', 'ridgeCapLengthLF');
      return out;
    },
    inspection(c) {
      if (c.roofSizeMethod && c.roofSizeMethod !== 'roof_measured') {
        return 'Measured roof surface area is required; home-size and size-category geometry is not sufficient for a customer-ready quote.';
      }
      return null;
    },
    crossValidate(c) {
      const errors = [];
      if (c.serviceScope === 'partial' && c.partialPercent !== undefined && c.partialAreaSqft !== undefined) {
        const expected = c.roofSizeInput * c.partialPercent / 100;
        if (Number.isFinite(expected) && Math.abs(expected - c.partialAreaSqft) > Math.max(1, expected * 0.01)) {
          errors.push({ field: 'partialAreaSqft', message: 'Measured partial area and affected percentage do not agree.' });
        }
      }
      if (c.partialAreaSqft !== undefined && c.roofSizeInput !== undefined && c.partialAreaSqft > c.roofSizeInput) {
        errors.push({ field: 'partialAreaSqft', message: 'Affected roof area cannot exceed the measured roof area.' });
      }
      return errors;
    }
  }),

  ROOFING_REPAIR: commonContract({
    fields: {
      repairType: slugField('Roof repair type'),
      affectedArea: numberField('Measured affected roof area', 'square feet', 0.01, 1_000_000),
      roofType: slugField('Roofing material'),
      pitch: enumField('Roof pitch', PITCHES),
      stories: enumField('Building stories', STORIES),
      leakPresent: booleanField('Active leak reported')
    },
    required: () => ['repairType', 'affectedArea', 'roofType', 'pitch', 'stories', 'leakPresent'],
    inspection: c => c.repairType === 'unknown'
      ? 'Leak source is unknown. An in-person inspection is required before pricing this repair.'
      : null
  }),

  FLAT_ROOF_REPLACEMENT: commonContract({
    fields: {
      roofSqft: numberField('Measured flat-roof area', 'square feet', 25, 2_000_000),
      sqftMethod: enumField('Roof measurement method', ['exact', 'assumption']),
      membraneType: slugField('Existing membrane type'),
      existingLayers: field('Measured existing membrane layers', 'layers', 'integer_or_unknown', { min: 1, max: 10 }),
      accessDifficulty: enumField('Roof access', ACCESS),
      serviceScope: enumField('Replacement scope', ['full', 'partial']),
      buildingType: enumField('Building type', ['residential', 'commercial']),
      partialPercent: numberField('Confirmed affected portion', 'percent', 0.1, 100),
      partialAreaSqft: numberField('Measured affected roof area', 'square feet', 1, 2_000_000)
    },
    required(c) {
      const out = ['roofSqft', 'sqftMethod', 'membraneType', 'existingLayers', 'accessDifficulty', 'serviceScope', 'buildingType'];
      if (c.serviceScope === 'partial' && c.partialPercent === undefined && c.partialAreaSqft === undefined) out.push('partialAreaSqft');
      return out;
    },
    inspection(c) {
      if (c.sqftMethod && c.sqftMethod !== 'exact') return 'Measured flat-roof area is required for a customer-ready quote.';
      if (c.membraneType === 'unknown') return 'The membrane type must be confirmed before this flat-roof replacement can be priced.';
      if (c.existingLayers === 'unknown') return 'The existing layer count must be measured before this flat-roof replacement can be priced.';
      return null;
    },
    crossValidate(c) {
      const errors = [];
      if (c.serviceScope === 'partial' && c.partialPercent !== undefined && c.partialAreaSqft !== undefined) {
        const expected = c.roofSqft * c.partialPercent / 100;
        if (Number.isFinite(expected) && Math.abs(expected - c.partialAreaSqft) > Math.max(1, expected * 0.01)) {
          errors.push({ field: 'partialAreaSqft', message: 'Measured flat-roof partial area and affected percentage do not agree.' });
        }
      }
      if (c.partialAreaSqft !== undefined && c.roofSqft !== undefined && c.partialAreaSqft > c.roofSqft) {
        errors.push({ field: 'partialAreaSqft', message: 'Affected flat-roof area cannot exceed total measured roof area.' });
      }
      return errors;
    }
  }),

  FLAT_ROOF_REPAIR: commonContract({
    fields: {
      repairType: slugField('Flat-roof repair type'),
      affectedArea: numberField('Measured affected flat-roof area', 'square feet', 0.01, 1_000_000),
      membraneType: slugField('Membrane type'),
      leakPresent: booleanField('Active leak reported'),
      pondingWater: booleanField('Ponding water reported')
    },
    required: () => ['repairType', 'affectedArea', 'membraneType', 'leakPresent', 'pondingWater'],
    inspection(c) {
      if (c.repairType === 'unknown_leak') return 'Flat-roof leak source requires inspection before pricing.';
      if (c.membraneType === 'unknown') return 'The flat-roof membrane type must be confirmed before repair pricing.';
      return null;
    }
  }),

  INTERIOR_PAINTING: commonContract({
    fields: {
      areaInputMethod: enumField('Wall area measurement method', ['wall_sqft', 'floor_sqft', 'rooms']),
      wallAreaSqft: numberField('Measured paintable wall area', 'square feet', 1, 2_000_000),
      wallHeight: enumField('Wall height', ['standard', 'high', 'vaulted']),
      surfaceCondition: enumField('Wall condition', ['good', 'fair', 'poor']),
      coats: numberField('Paint coats', 'coats', 1, 3, { integer: true }),
      ceilingsIncluded: booleanField('Ceilings included'),
      ceilingAreaSqft: numberField('Measured ceiling area', 'square feet', 1, 1_000_000),
      trimIncluded: booleanField('Trim included'),
      trimLengthLF: numberField('Measured trim length', 'linear feet', 0.1, 1_000_000)
    },
    required(c) {
      const out = ['areaInputMethod', 'wallAreaSqft', 'wallHeight', 'surfaceCondition', 'coats', 'ceilingsIncluded', 'trimIncluded'];
      if (c.ceilingsIncluded) out.push('ceilingAreaSqft');
      if (c.trimIncluded) out.push('trimLengthLF');
      return out;
    },
    inspection(c) {
      if (c.areaInputMethod !== 'wall_sqft') return 'Measured paintable wall area is required; floor-area and room-count geometry are not used by the audit engine.';
      if (c.surfaceCondition !== 'good') return 'Wall preparation requires a confirmed measured preparation scope before pricing.';
      return null;
    }
  }),

  EXTERIOR_PAINTING: commonContract({
    fields: {
      areaInputMethod: enumField('Wall area measurement method', ['wall_sqft', 'homesize']),
      exteriorAreaSqft: numberField('Measured paintable wall area', 'square feet', 1, 2_000_000),
      stories: enumField('Building stories', STORIES),
      surfaceCondition: enumField('Exterior surface condition', ['good', 'fair', 'poor']),
      coats: numberField('Paint coats', 'coats', 1, 3, { integer: true })
    },
    required: () => ['areaInputMethod', 'exteriorAreaSqft', 'stories', 'surfaceCondition', 'coats'],
    inspection(c) {
      if (c.areaInputMethod !== 'wall_sqft') return 'Measured paintable wall area is required; home-size maps are not sufficient for a customer-ready quote.';
      if (c.surfaceCondition === 'poor') return 'Poor exterior surfaces require an explicitly confirmed primer pricing rule before pricing.';
      return null;
    }
  }),

  FLOORING_INSTALL: null,
  FLOORING_REPLACEMENT: null,
  FENCING_INSTALL: null,
  FENCING_REPLACEMENT: null,
  CONCRETE_DRIVEWAY: null,
  CONCRETE_PATIO_SLAB: null,
  LANDSCAPING_CLEANUP: null,
  LANDSCAPING_MULCH: null,
  LANDSCAPING_SOD: null,
  LANDSCAPING_PLANTING: null,
  LANDSCAPING_MOWING: null,
  SIDING_REPLACEMENT: null,
  SIDING_REPAIR: null,
  CUSTOM: null
};

function flooringContract(replacement) {
  return commonContract({
    fields: {
      sqft: numberField('Measured flooring area', 'square feet', 1, 1_000_000),
      sqftMethod: enumField('Floor measurement method', ['exact', 'assumption']),
      newFlooringType: enumField('New flooring type', FLOORING_TYPES),
      existingFloorType: slugField('Existing floor type'),
      removalNeeded: booleanField('Existing floor removal included'),
      roomCount: numberField('Rooms in scope', 'rooms', 1, 10_000, { integer: true }),
      layoutPattern: enumField('Flooring layout', ['straight', 'diagonal_or_pattern']),
      stairSteps: numberField('Stair steps in scope', 'steps', 0, 10_000, { integer: true }),
      underlaymentSelected: booleanField('Vinyl-plank underlayment selected'),
      subfloorCondition: enumField('Subfloor underlayment condition', ['requires_underlayment', 'does_not_require_underlayment', 'unknown']),
      ...(replacement ? {
        subfloorIssues: booleanField('Subfloor issues reported'),
        subfloorRepairAreaSqft: numberField('Measured subfloor repair area', 'square feet', 0.1, 1_000_000)
      } : {})
    },
    required(c, p) {
      const out = ['sqft', 'sqftMethod', 'newFlooringType', 'existingFloorType', 'removalNeeded', 'roomCount', 'layoutPattern', 'stairSteps'];
      if (c.newFlooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'customer_selectable_addon') out.push('underlaymentSelected');
      if (c.newFlooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'subfloor_condition') out.push('subfloorCondition');
      if (replacement) {
        out.push('subfloorIssues');
        if (c.subfloorIssues) out.push('subfloorRepairAreaSqft');
      }
      return out;
    },
    inspection(c, p) {
      if (c.sqftMethod && c.sqftMethod !== 'exact') return 'Measured flooring area is required for a customer-ready quote.';
      if (c.newFlooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'owner_review') {
        return 'Vinyl-plank underlayment is configured for owner review.';
      }
      if (c.newFlooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'subfloor_condition' && c.subfloorCondition === 'unknown') {
        return 'The subfloor condition must be confirmed before applying the vinyl-plank underlayment rule.';
      }
      return null;
    },
    crossValidate(c, p) {
      const errors = [];
      if (c.removalNeeded && c.existingFloorType === 'none') errors.push({ field: 'existingFloorType', message: 'Removal cannot be selected when no existing floor is present.' });
      if (c.underlaymentSelected !== undefined && !(c.newFlooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'customer_selectable_addon')) {
        errors.push({ field: 'underlaymentSelected', message: 'Underlayment selection is only valid for customer-selectable vinyl-plank underlayment.' });
      }
      if (c.subfloorCondition !== undefined && !(c.newFlooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'subfloor_condition')) {
        errors.push({ field: 'subfloorCondition', message: 'Subfloor condition is only valid for the vinyl-plank subfloor-condition rule.' });
      }
      if (c.subfloorRepairAreaSqft !== undefined && c.sqft !== undefined && c.subfloorRepairAreaSqft > c.sqft) {
        errors.push({ field: 'subfloorRepairAreaSqft', message: 'Subfloor repair area cannot exceed the measured flooring area.' });
      }
      return errors;
    }
  });
}

function fencingContract(replacement) {
  return commonContract({
    fields: {
      linearFeet: numberField('Measured fence length', 'linear feet', 1, 1_000_000),
      lfMethod: enumField('Fence measurement method', ['exact', 'assumption']),
      fenceType: slugField('Fence type'),
      fenceHeight: enumField('Fence height', [4, 6, 8]),
      gateCount: numberField('Gate count', 'gates', 0, 10_000, { integer: true }),
      gateWidthTotalLF: numberField('Measured total gate-opening width', 'linear feet', 0, 100_000),
      postCount: numberField('Confirmed planned post count', 'posts', 2, 100_000, { integer: true }),
      terrainSlope: enumField('Terrain slope', SLOPES),
      ...(replacement ? { oldFenceRemoval: booleanField('Old fence removal included') } : {})
    },
    required: c => [
      'linearFeet', 'lfMethod', 'fenceType', 'fenceHeight',
      'gateCount', 'postCount', 'terrainSlope',
      ...(c.gateCount > 0 ? ['gateWidthTotalLF'] : []),
      ...(replacement ? ['oldFenceRemoval'] : [])
    ],
    inspection: c => c.lfMethod === 'assumption'
      ? 'Measured fence length is required for a customer-ready quote.'
      : null,
    crossValidate(c) {
      const errors = [];
      if (c.gateCount === 0 && c.gateWidthTotalLF !== undefined && c.gateWidthTotalLF !== 0) {
        errors.push({ field: 'gateWidthTotalLF', message: 'Gate-opening width cannot be supplied when no gates are selected.' });
      }
      if (c.gateCount > 0 && c.gateWidthTotalLF !== undefined && c.gateWidthTotalLF <= 0) {
        errors.push({ field: 'gateWidthTotalLF', message: 'A positive measured gate-opening width is required when gates are selected.' });
      }
      if (c.gateCount > 0 && c.gateWidthTotalLF !== undefined && c.linearFeet !== undefined && c.gateWidthTotalLF >= c.linearFeet) {
        errors.push({ field: 'gateWidthTotalLF', message: 'Gate-opening width must be less than the measured fence length.' });
      }
      return errors;
    }
  });
}

function concreteContract() {
  return commonContract({
    fields: {
      dimensionMethod: enumField('Slab measurement method', ['exact', 'measured_area_perimeter', 'area_only', 'assumption']),
      length: numberField('Measured slab length', 'feet', 0.1, 100_000),
      width: numberField('Measured slab width', 'feet', 0.1, 100_000),
      areaSqft: numberField('Measured slab area', 'square feet', 1, 10_000_000),
      perimeterLF: numberField('Measured slab perimeter', 'linear feet', 0.1, 1_000_000),
      thickness: numberField('Concrete thickness', 'inches', 2, 24),
      finishType: enumField('Concrete finish', ['broom', 'smooth', 'exposed_aggregate', 'stamped']),
      demolitionNeeded: booleanField('Existing concrete demolition included'),
      demolitionAreaSqft: numberField('Measured demolition area', 'square feet', 0.1, 10_000_000),
      reinforcement: enumField('Reinforcement', ['none', 'wire_mesh', 'rebar']),
      accessDifficulty: enumField('Project access', ACCESS),
      baseNeeded: booleanField('Base preparation included')
    },
    required(c) {
      const out = ['dimensionMethod', 'thickness', 'finishType', 'demolitionNeeded', 'reinforcement', 'accessDifficulty', 'baseNeeded'];
      if (c.dimensionMethod === 'exact') out.push('length', 'width');
      if (c.dimensionMethod === 'measured_area_perimeter') out.push('areaSqft', 'perimeterLF');
      if (c.demolitionNeeded) out.push('demolitionAreaSqft');
      return out;
    },
    inspection(c) {
      if (['area_only', 'assumption'].includes(c.dimensionMethod)) {
        return 'Measured slab dimensions or measured area and perimeter are required; perimeter is not inferred from area.';
      }
      if (c.finishType === 'exposed_aggregate') {
        return 'Exposed-aggregate material pricing requires an approved owner pricing rule before quoting.';
      }
      return null;
    }
  });
}

MEASUREMENT_CONTRACTS.FLOORING_INSTALL = flooringContract(false);
MEASUREMENT_CONTRACTS.FLOORING_REPLACEMENT = flooringContract(true);
MEASUREMENT_CONTRACTS.FENCING_INSTALL = fencingContract(false);
MEASUREMENT_CONTRACTS.FENCING_REPLACEMENT = fencingContract(true);
MEASUREMENT_CONTRACTS.CONCRETE_DRIVEWAY = concreteContract();
MEASUREMENT_CONTRACTS.CONCRETE_PATIO_SLAB = concreteContract();

MEASUREMENT_CONTRACTS.LANDSCAPING_CLEANUP = commonContract({
  fields: {
    yardSqft: numberField('Measured cleanup area', 'square feet', 1, 10_000_000),
    sqftMethod: enumField('Cleanup area method', ['exact', 'assumption']),
    debrisLevel: enumField('Debris level', ['light', 'moderate', 'heavy']),
    slope: enumField('Terrain slope', SLOPES),
    haulAway: booleanField('Additional haul-away selected')
  },
  required: () => ['yardSqft', 'sqftMethod', 'debrisLevel', 'slope', 'haulAway'],
  inspection: c => c.sqftMethod === 'assumption' ? 'Measured cleanup area is required for a customer-ready quote.' : null
});

MEASUREMENT_CONTRACTS.LANDSCAPING_MULCH = commonContract({
  fields: {
    inputMethod: enumField('Mulch quantity method', ['sqft', 'yards']),
    mulchArea: numberField('Measured bed area or mulch volume', 'square feet or cubic yards', 0.01, 10_000_000),
    mulchDepth: numberField('Mulch depth', 'inches', 0.5, 24),
    mulchType: slugField('Mulch type'),
    bedCondition: enumField('Planting-bed condition', ['clean', 'needs_weeding', 'overgrown']),
    bedSqft: numberField('Measured preparation area', 'square feet', 0.1, 10_000_000),
    edgingNeeded: booleanField('Bed edging included'),
    edgeLF: numberField('Measured bed-edge length', 'linear feet', 0.1, 1_000_000)
  },
  required(c) {
    const out = ['inputMethod', 'mulchArea', 'mulchType', 'bedCondition', 'edgingNeeded'];
    if (c.inputMethod === 'sqft') out.push('mulchDepth');
    if (c.bedCondition !== 'clean') out.push('bedSqft');
    if (c.edgingNeeded) out.push('edgeLF');
    return out;
  }
});

MEASUREMENT_CONTRACTS.LANDSCAPING_SOD = commonContract({
  fields: {
    sodSqft: numberField('Measured sod area', 'square feet', 1, 10_000_000),
    sqftMethod: enumField('Sod area method', ['exact', 'assumption']),
    groundPrepNeeded: booleanField('Ground preparation included'),
    slope: enumField('Terrain slope', SLOPES),
    accessDifficulty: enumField('Project access', ACCESS)
  },
  required: () => ['sodSqft', 'sqftMethod', 'groundPrepNeeded', 'slope', 'accessDifficulty'],
  inspection: c => c.sqftMethod === 'assumption' ? 'Measured sod area is required for a customer-ready quote.' : null
});

MEASUREMENT_CONTRACTS.LANDSCAPING_PLANTING = commonContract({
  fields: {
    plantsBySize: field('Measured plant count by size', 'plants', 'plant_counts'),
    bedCondition: enumField('Planting-bed condition', ['clean', 'needs_weeding', 'overgrown']),
    bedSqft: numberField('Measured preparation area', 'square feet', 0.1, 10_000_000),
    mulchNeeded: booleanField('Mulch included'),
    mulchYards: numberField('Measured mulch quantity', 'cubic yards', 0.01, 100_000),
    mulchType: slugField('Mulch type')
  },
  required(c) {
    const out = ['plantsBySize', 'bedCondition', 'mulchNeeded'];
    if (c.bedCondition !== 'clean') out.push('bedSqft');
    if (c.mulchNeeded) out.push('mulchYards', 'mulchType');
    return out;
  }
});

MEASUREMENT_CONTRACTS.LANDSCAPING_MOWING = commonContract({
  fields: {
    yardSqft: numberField('Measured mowable lawn area', 'square feet', 1, 10_000_000),
    sqftMethod: enumField('Lawn area method', ['exact', 'assumption']),
    serviceFrequency: enumField('Service frequency', ['weekly', 'biweekly', 'monthly', 'one_time']),
    grassCondition: enumField('Grass condition', ['maintained', 'overgrown', 'severe']),
    bagClippings: booleanField('Clipping bagging selected'),
    edgingIncluded: booleanField('Lawn edging selected'),
    edgingLengthLF: numberField('Measured edging length', 'linear feet', 0.1, 1_000_000)
  },
  required(c) {
    const out = ['yardSqft', 'sqftMethod', 'serviceFrequency', 'grassCondition', 'bagClippings', 'edgingIncluded'];
    if (c.edgingIncluded) out.push('edgingLengthLF');
    return out;
  },
  inspection: c => c.sqftMethod === 'assumption' ? 'Measured mowable lawn area is required for a customer-ready quote.' : null
});

MEASUREMENT_CONTRACTS.SIDING_REPLACEMENT = commonContract({
  fields: {
    areaInputMethod: enumField('Siding area method', ['sqft', 'homesize']),
    sidingAreaSqft: numberField('Measured siding wall area', 'square feet', 1, 2_000_000),
    sidingType: enumField('Siding type', SIDING_TYPES),
    stories: enumField('Building stories', STORIES),
    oldSidingRemoval: booleanField('Old siding removal included'),
    trimIncluded: booleanField('Siding trim included'),
    trimLengthLF: numberField('Measured siding trim length', 'linear feet', 0.1, 1_000_000)
  },
  required(c) {
    const out = ['areaInputMethod', 'sidingAreaSqft', 'sidingType', 'stories', 'oldSidingRemoval', 'trimIncluded'];
    if (c.trimIncluded) out.push('trimLengthLF');
    return out;
  },
  inspection: c => c.areaInputMethod === 'homesize'
    ? 'Measured siding wall area is required; home-size area maps are not used by the audit engine.'
    : null
});

MEASUREMENT_CONTRACTS.SIDING_REPAIR = commonContract({
  fields: {
    sidingType: enumField('Siding type', SIDING_TYPES),
    damageLevel: slugField('Siding damage type'),
    affectedArea: numberField('Measured affected siding area', 'square feet', 0.01, 1_000_000),
    stories: enumField('Building stories', STORIES)
  },
  required: () => ['sidingType', 'damageLevel', 'affectedArea', 'stories']
});

MEASUREMENT_CONTRACTS.CUSTOM = commonContract({
  fields: {
    service: field('Confirmed custom service', null, 'string', { minLength: 1, maxLength: 80 }),
    serviceConfirmed: booleanField('Customer confirmed the matched service'),
    unit: enumField('Customer quantity unit', ['flat', 'per_sqft', 'per_hour', 'per_unit', 'per_LF', 'per_square']),
    hours: numberField('Measured labor time', 'hours', 0.01, 100_000),
    itemCount: numberField('Confirmed item count', 'items', 1, 10_000_000, { integer: true }),
    areaSqft: numberField('Measured service area', 'square feet', 0.01, 10_000_000),
    linearFeet: numberField('Measured service length', 'linear feet', 0.01, 10_000_000),
    roofSquares: numberField('Measured roofing area', 'roofing squares', 0.01, 100_000)
  },
  required(c, p) {
    const out = ['service', 'serviceConfirmed', 'unit'];
    const quantityField = {
      per_hour: 'hours', per_unit: 'itemCount', per_sqft: 'areaSqft',
      per_LF: 'linearFeet', per_square: 'roofSquares'
    }[p.unit || c.unit];
    if (quantityField) out.push(quantityField);
    return out;
  },
  inspection(c, p) {
    if (p.customPricingMode === 'inspection_first') return 'This custom service is configured as inspection-first.';
    if (c.serviceConfirmed === false) return 'The matched custom service must be confirmed before quoting.';
    return null;
  },
  crossValidate(c, p) {
    const errors = [];
    if (c.unit !== undefined && p.unit !== undefined && c.unit !== p.unit) {
      errors.push({ field: 'unit', message: 'Customer quantity unit does not match the configured custom-service unit.' });
    }
    return errors;
  }
});

const factor = (defaultValue, label, unit, min, max) => ({ defaultValue, label, unit, min, max });
const factorMap = (defaultValue, label, unit, min, max) => ({ defaultValue, label, unit, min, max });

export const CLASS2_DEFINITIONS = {
  ROOFING_REPLACEMENT: {
    wasteFactorByComplexity: factorMap({ simple: 0.10, moderate: 0.13, complex: 0.18 }, 'Roofing material waste by roof complexity', 'decimal fraction', 0, 0.5),
    pitchMultiplier: factorMap({ low: 1, medium: 1.15, steep: 1.25, very_steep: 1.40 }, 'Roof pitch labor multiplier', 'multiplier', 0.1, 5),
    storyMultiplier: factorMap({ 1: 1, 2: 1.10, 3: 1.20 }, 'Story-count labor multiplier', 'multiplier', 0.1, 5)
  },
  ROOFING_REPAIR: {
    pitchMultiplier: factorMap({ low: 1, medium: 1.15, steep: 1.25, very_steep: 1.40 }, 'Roof pitch labor multiplier', 'multiplier', 0.1, 5),
    storyMultiplier: factorMap({ 1: 1, 2: 1.10, 3: 1.20 }, 'Story-count labor multiplier', 'multiplier', 0.1, 5)
  },
  FLAT_ROOF_REPLACEMENT: {
    accessMultiplier: factorMap({ easy: 1, moderate: 1.15, difficult: 1.30 }, 'Flat-roof access labor multiplier', 'multiplier', 0.1, 5)
  },
  FLAT_ROOF_REPAIR: {},
  INTERIOR_PAINTING: {
    wallHeightLaborMultiplier: factorMap({ standard: 1, high: 1.10, vaulted: 1.25 }, 'Wall-height labor multiplier', 'multiplier', 0.1, 5)
  },
  EXTERIOR_PAINTING: {
    storyMultiplier: factorMap({ 1: 1, 2: 1.10, 3: 1.20 }, 'Exterior story labor multiplier', 'multiplier', 0.1, 5),
    prepHoursPerSqft: factorMap({ fair: 0.008, poor: 0.02 }, 'Exterior preparation labor hours by condition', 'hours per square foot', 0.000001, 2)
  },
  FLOORING_INSTALL: {
    wasteFactorByType: factorMap({ hardwood: 0.10, laminate: 0.08, vinyl_plank: 0.08, carpet: 0.10, tile: 0.12 }, 'Flooring material waste by type', 'decimal fraction', 0, 0.5),
    patternWasteAdder: factorMap({ straight: 0, diagonal_or_pattern: 0.07 }, 'Pattern material waste addition', 'decimal fraction', 0, 0.5),
    roomComplexityMultiplier: factorMap({ large: 1, medium: 1.10, small: 1.20 }, 'Average-room labor multiplier', 'multiplier', 0.1, 5),
    roomSizeThresholds: factorMap({ smallMaxSqft: 150, mediumMaxSqft: 300 }, 'Average-room size thresholds', 'square feet', 1, 10_000)
  },
  FLOORING_REPLACEMENT: {},
  FENCING_INSTALL: {
    heightMultiplierLabor: factorMap({ 4: 0.85, 6: 1, 8: 1.20 }, 'Fence-height labor multiplier', 'multiplier', 0.1, 5),
    heightMultiplierMaterial: factorMap({ 4: 0.80, 6: 1, 8: 1.35 }, 'Fence-height material multiplier', 'multiplier', 0.1, 5),
    terrainMultiplier: factorMap({ flat: 1, moderate: 1.15, steep: 1.30 }, 'Fence terrain labor multiplier', 'multiplier', 0.1, 5)
  },
  FENCING_REPLACEMENT: {},
  CONCRETE_DRIVEWAY: {
    concreteWasteFactor: factor(0.10, 'Concrete ordering waste allowance', 'decimal fraction', 0, 0.5),
    finishMultiplier: factorMap({ broom: 1, smooth: 1.05, exposed_aggregate: 1.20, stamped: 1.50 }, 'Concrete finish labor multiplier', 'multiplier', 0.1, 5),
    accessMultiplier: factorMap({ easy: 1, moderate: 1.10, difficult: 1.25 }, 'Concrete access labor multiplier', 'multiplier', 0.1, 5)
  },
  CONCRETE_PATIO_SLAB: {},
  LANDSCAPING_CLEANUP: {
    slopeMultiplier: factorMap({ flat: 1, moderate: 1.15, steep: 1.35 }, 'Cleanup slope labor multiplier', 'multiplier', 0.1, 5)
  },
  LANDSCAPING_MULCH: {
    mulchOverageFactor: factor(1.15, 'Mulch ordering overage factor', 'quantity multiplier', 1, 2)
  },
  LANDSCAPING_SOD: {
    sodWasteFactor: factor(0.05, 'Sod material waste allowance', 'decimal fraction', 0, 0.5),
    slopeMultiplier: factorMap({ flat: 1, moderate: 1.15, steep: 1.35 }, 'Sod slope labor multiplier', 'multiplier', 0.1, 5),
    accessMultiplier: factorMap({ easy: 1, moderate: 1.10, difficult: 1.25 }, 'Sod access labor multiplier', 'multiplier', 0.1, 5)
  },
  LANDSCAPING_PLANTING: {
    mulchOverageFactor: factor(1.15, 'Mulch ordering overage factor', 'quantity multiplier', 1, 2)
  },
  LANDSCAPING_MOWING: {},
  SIDING_REPLACEMENT: {
    wasteFactorByType: factorMap({ vinyl: 0.10, fiber_cement: 0.12, wood: 0.12, metal: 0.10 }, 'Siding material waste by type', 'decimal fraction', 0, 0.5),
    storyMultiplier: factorMap({ 1: 1, 2: 1.10, 3: 1.20 }, 'Siding story labor and removal multiplier', 'multiplier', 0.1, 5)
  },
  SIDING_REPAIR: {
    storyMultiplier: factorMap({ 1: 1, 2: 1.10, 3: 1.20 }, 'Siding repair story labor multiplier', 'multiplier', 0.1, 5)
  },
  CUSTOM: {}
};

CLASS2_DEFINITIONS.FLOORING_REPLACEMENT = structuredClone(CLASS2_DEFINITIONS.FLOORING_INSTALL);
CLASS2_DEFINITIONS.FENCING_REPLACEMENT = structuredClone(CLASS2_DEFINITIONS.FENCING_INSTALL);
CLASS2_DEFINITIONS.CONCRETE_PATIO_SLAB = structuredClone(CLASS2_DEFINITIONS.CONCRETE_DRIVEWAY);

export function withClass2Defaults(serviceType, pricing = {}) {
  const next = structuredClone(pricing);
  for (const [name, definition] of Object.entries(CLASS2_DEFINITIONS[serviceType] || {})) {
    if (next[name] === undefined) next[name] = structuredClone(definition.defaultValue);
  }
  return next;
}

function missing(value) {
  return value === undefined || value === null || value === '' || value === 'unsure';
}

function validateFieldValue(definition, value) {
  if (definition.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'must be a finite number';
    if (value < definition.min || value > definition.max) return `must be between ${definition.min} and ${definition.max} ${definition.unit || ''}`.trim();
    if (definition.integer && !Number.isInteger(value)) return 'must be a whole number';
    return null;
  }
  if (definition.type === 'integer_or_unknown') {
    if (value === 'unknown') return null;
    if (!Number.isInteger(value) || value < definition.min || value > definition.max) return `must be unknown or a whole number from ${definition.min} to ${definition.max}`;
    return null;
  }
  if (definition.type === 'enum') return definition.values.includes(value) ? null : `must be one of: ${definition.values.join(', ')}`;
  if (definition.type === 'boolean') return typeof value === 'boolean' ? null : 'must be true or false';
  if (definition.type === 'slug') return typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value) ? null : 'must be a canonical lowercase value';
  if (definition.type === 'string') {
    if (typeof value !== 'string') return 'must be text';
    const length = value.trim().length;
    if (length < definition.minLength || length > definition.maxLength) return `must contain ${definition.minLength}-${definition.maxLength} characters`;
    return null;
  }
  if (definition.type === 'plant_counts') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'must be an object keyed by small, medium, and large';
    const keys = Object.keys(value);
    if (keys.some(key => !SIZE_KEYS.includes(key)) || SIZE_KEYS.some(key => !keys.includes(key))) return 'must contain exactly small, medium, and large';
    if (SIZE_KEYS.some(key => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 1_000_000)) return 'must contain finite non-negative whole-number plant counts';
    if (SIZE_KEYS.every(key => value[key] === 0)) return 'must include at least one plant';
    return null;
  }
  return 'uses an unsupported contract type';
}

export function validateCustomerInputs(serviceType, customerInputs = {}, pricing = {}) {
  const contract = MEASUREMENT_CONTRACTS[serviceType];
  if (!contract) return { ok: false, missingCustomerFields: [], invalidCustomerFields: ['serviceType'], reviewReason: 'Unsupported service type.' };
  if (!customerInputs || typeof customerInputs !== 'object' || Array.isArray(customerInputs)) {
    return { ok: false, missingCustomerFields: [], invalidCustomerFields: ['customerInputs'], reviewReason: 'Customer inputs must be an object.' };
  }
  const allowed = new Set(Object.keys(contract.fields));
  const unexpected = Object.keys(customerInputs).filter(key => !allowed.has(key));
  const required = [...new Set(contract.required?.(customerInputs, pricing) || [])];
  const missingCustomerFields = required.filter(name => missing(customerInputs[name]));
  const invalidCustomerFields = [];
  const validationMessages = [];

  for (const [name, value] of Object.entries(customerInputs)) {
    if (!allowed.has(name)) continue;
    if (missing(value)) continue;
    const message = validateFieldValue(contract.fields[name], value);
    if (message) {
      invalidCustomerFields.push(name);
      validationMessages.push(`${contract.fields[name].label} ${message}.`);
    }
  }
  if (unexpected.length) {
    invalidCustomerFields.push(...unexpected);
    validationMessages.push('The quote contains unsupported customer input fields.');
  }
  for (const error of contract.crossValidate?.(customerInputs, pricing) || []) {
    invalidCustomerFields.push(error.field);
    validationMessages.push(error.message);
  }
  if (missingCustomerFields.length || invalidCustomerFields.length) {
    return {
      ok: false,
      missingCustomerFields,
      invalidCustomerFields: [...new Set(invalidCustomerFields)],
      validationMessages,
      reviewReason: missingCustomerFields.length
        ? 'Required measured project details were not provided.'
        : 'Project details were invalid or internally inconsistent.'
    };
  }
  const inspectionReason = contract.inspection?.(customerInputs, pricing);
  if (inspectionReason) {
    return {
      ok: false,
      missingCustomerFields: [],
      invalidCustomerFields: [],
      inspectionFirst: true,
      reviewReason: inspectionReason
    };
  }
  return { ok: true, normalized: structuredClone(customerInputs) };
}

function exactKeys(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  return JSON.stringify(keys) === JSON.stringify([...expectedKeys].map(String).sort());
}

function validateFactorValue(value, definition, path, errors) {
  const expected = definition.defaultValue;
  if (typeof expected === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < definition.min || value > definition.max) {
      errors.push(`${path} must be a finite number from ${definition.min} to ${definition.max}.`);
    }
    return;
  }
  if (!exactKeys(value, Object.keys(expected))) {
    errors.push(`${path} must contain exactly: ${Object.keys(expected).join(', ')}.`);
    return;
  }
  for (const key of Object.keys(expected)) {
    const leaf = value[key];
    if (typeof leaf !== 'number' || !Number.isFinite(leaf) || leaf < definition.min || leaf > definition.max) {
      errors.push(`${path}.${key} must be a finite number from ${definition.min} to ${definition.max}.`);
    }
  }
}

export function validateClass2Factors(serviceType, pricing = {}) {
  const errors = [];
  for (const [name, definition] of Object.entries(CLASS2_DEFINITIONS[serviceType] || {})) {
    if (pricing[name] === undefined) {
      errors.push(`${name} must be stored in the service price book.`);
      continue;
    }
    validateFactorValue(pricing[name], definition, name, errors);
  }
  if (serviceType.startsWith('FLOORING_') && pricing.roomSizeThresholds &&
      pricing.roomSizeThresholds.smallMaxSqft >= pricing.roomSizeThresholds.mediumMaxSqft) {
    errors.push('roomSizeThresholds.smallMaxSqft must be less than roomSizeThresholds.mediumMaxSqft.');
  }
  return errors;
}

const ALLOWED_PRICING_FIELDS = {
  ROOFING_REPLACEMENT: ['laborPerSquare', 'materialCostPerSquare', 'tearOffPerSquare', 'underlaymentPerSquare', 'accessoryPricingMode', 'starterPerLF', 'dripEdgePerLF', 'ridgeCapPerLF', 'deckingPerSheet', 'disposalPerSquare', 'minimumJob'],
  ROOFING_REPAIR: ['laborHourlyRate', 'repairMinimum', 'repairHours', 'repairMaterialAllowance'],
  FLAT_ROOF_REPLACEMENT: ['laborPerSqft', 'membraneCostPerSqft', 'tearOffPerSqft', 'minimumJob', 'insulationPerSqft', 'disposalPerSqft'],
  FLAT_ROOF_REPAIR: ['laborHourlyRate', 'repairMinimum', 'patchRepairHours', 'patchMaterialAllowance', 'pondingWaterSurcharge'],
  INTERIOR_PAINTING: ['laborPerWallSqftPerCoat', 'materialPerWallSqftPerCoat', 'minimumJob', 'ceilingLaborPerSqftPerCoat', 'ceilingMaterialPerSqftPerCoat', 'trimLaborPerLF', 'trimMaterialPerLF'],
  EXTERIOR_PAINTING: ['exteriorLaborPerSqftPerCoat', 'materialPerSqftPerCoat', 'minimumJob', 'laborHourlyRate'],
  FLOORING_INSTALL: ['laborPerSqft', 'materialPerSqft', 'minimumJob', 'removalPerSqft', 'disposalPerSqft', 'perStepPrice', 'underlaymentPerSqft', 'vinylPlankUnderlaymentRule'],
  FLOORING_REPLACEMENT: ['laborPerSqft', 'materialPerSqft', 'minimumJob', 'removalPerSqft', 'disposalPerSqft', 'perStepPrice', 'underlaymentPerSqft', 'vinylPlankUnderlaymentRule', 'subfloorAllowancePerSqft'],
  FENCING_INSTALL: ['laborPerLinearFoot', 'materialPerLinearFoot', 'postPrice', 'concretePerPost', 'postsIncludedInMaterial', 'gatePrice', 'minimumJob'],
  FENCING_REPLACEMENT: ['laborPerLinearFoot', 'materialPerLinearFoot', 'postPrice', 'concretePerPost', 'postsIncludedInMaterial', 'gatePrice', 'minimumJob', 'removalPerLinearFoot', 'disposalPerLF'],
  CONCRETE_DRIVEWAY: ['laborPerSqft', 'concreteCostPerCubicYard', 'formworkPerLF', 'minimumJob', 'demolitionPerSqft', 'basePrepPerSqft', 'wireReinforcementPerSqft', 'rebarReinforcementPerSqft', 'stampedMaterialPerSqft', 'disposalPerSqft'],
  CONCRETE_PATIO_SLAB: ['laborPerSqft', 'concreteCostPerCubicYard', 'formworkPerLF', 'minimumJob', 'demolitionPerSqft', 'basePrepPerSqft', 'wireReinforcementPerSqft', 'rebarReinforcementPerSqft', 'stampedMaterialPerSqft', 'disposalPerSqft'],
  LANDSCAPING_CLEANUP: ['cleanupBaseRatePerSqft', 'debrisPricing', 'minimumServiceCharge', 'haulAwayFee'],
  LANDSCAPING_MULCH: ['mulchMaterialPerYard', 'mulchInstallLaborPerYard', 'minimumServiceCharge', 'bedPrepLaborPerSqft', 'edgingPerLinearFoot'],
  LANDSCAPING_SOD: ['sodMaterialPerSqft', 'sodInstallLaborPerSqft', 'minimumServiceCharge', 'groundPrepPerSqft'],
  LANDSCAPING_PLANTING: ['plantingLaborPerPlant', 'plantMaterialAllowance', 'minimumServiceCharge', 'bedPrepLaborPerSqft', 'mulchMaterialPerYard', 'mulchInstallLaborPerYard'],
  LANDSCAPING_MOWING: ['mowingBaseRatePerSqft', 'minimumServiceCharge', 'frequencyMultipliers', 'overgrowthMultipliers', 'baggingSurchargePercent', 'edgingPerLinearFoot'],
  SIDING_REPLACEMENT: ['laborPerSqft', 'materialPerSqft', 'minimumJob', 'removalPerSqft', 'disposalPerSqft', 'trimPerLinearFoot'],
  SIDING_REPAIR: ['laborHourlyRate', 'repairMinimum', 'repairHours', 'materialAllowance'],
  CUSTOM: ['customPricingMode', 'price', 'low', 'high', 'unit', 'minimumJob']
};

export function allowedPricingFields(serviceType) {
  return [...(ALLOWED_PRICING_FIELDS[serviceType] || []), ...Object.keys(CLASS2_DEFINITIONS[serviceType] || {})];
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const nonNegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positiveMoney = value => Number.isSafeInteger(value) && value > 0;
const nonNegativeMoney = value => Number.isSafeInteger(value) && value >= 0;

const SCALAR_MONEY_FIELDS = {
  ROOFING_REPLACEMENT: ['starterPerLF', 'dripEdgePerLF', 'ridgeCapPerLF', 'deckingPerSheet', 'disposalPerSquare', 'minimumJob'],
  ROOFING_REPAIR: ['laborHourlyRate', 'repairMinimum'],
  FLAT_ROOF_REPLACEMENT: ['minimumJob', 'insulationPerSqft', 'disposalPerSqft'],
  FLAT_ROOF_REPAIR: ['laborHourlyRate', 'repairMinimum', 'pondingWaterSurcharge'],
  INTERIOR_PAINTING: ['laborPerWallSqftPerCoat', 'materialPerWallSqftPerCoat', 'minimumJob', 'ceilingLaborPerSqftPerCoat', 'ceilingMaterialPerSqftPerCoat', 'trimLaborPerLF', 'trimMaterialPerLF'],
  EXTERIOR_PAINTING: ['exteriorLaborPerSqftPerCoat', 'materialPerSqftPerCoat', 'minimumJob', 'laborHourlyRate'],
  FLOORING_INSTALL: ['minimumJob', 'disposalPerSqft', 'perStepPrice', 'underlaymentPerSqft'],
  FLOORING_REPLACEMENT: ['minimumJob', 'disposalPerSqft', 'perStepPrice', 'underlaymentPerSqft', 'subfloorAllowancePerSqft'],
  FENCING_INSTALL: ['concretePerPost', 'minimumJob'],
  FENCING_REPLACEMENT: ['concretePerPost', 'minimumJob', 'disposalPerLF'],
  CONCRETE_DRIVEWAY: ['laborPerSqft', 'concreteCostPerCubicYard', 'formworkPerLF', 'minimumJob', 'demolitionPerSqft', 'basePrepPerSqft', 'wireReinforcementPerSqft', 'rebarReinforcementPerSqft', 'stampedMaterialPerSqft', 'disposalPerSqft'],
  CONCRETE_PATIO_SLAB: ['laborPerSqft', 'concreteCostPerCubicYard', 'formworkPerLF', 'minimumJob', 'demolitionPerSqft', 'basePrepPerSqft', 'wireReinforcementPerSqft', 'rebarReinforcementPerSqft', 'stampedMaterialPerSqft', 'disposalPerSqft'],
  LANDSCAPING_CLEANUP: ['cleanupBaseRatePerSqft', 'minimumServiceCharge', 'haulAwayFee'],
  LANDSCAPING_MULCH: ['mulchInstallLaborPerYard', 'minimumServiceCharge', 'edgingPerLinearFoot'],
  LANDSCAPING_SOD: ['sodMaterialPerSqft', 'sodInstallLaborPerSqft', 'minimumServiceCharge', 'groundPrepPerSqft'],
  LANDSCAPING_PLANTING: ['minimumServiceCharge', 'mulchInstallLaborPerYard'],
  LANDSCAPING_MOWING: ['mowingBaseRatePerSqft', 'minimumServiceCharge', 'edgingPerLinearFoot'],
  SIDING_REPLACEMENT: ['minimumJob', 'removalPerSqft', 'disposalPerSqft', 'trimPerLinearFoot'],
  SIDING_REPAIR: ['laborHourlyRate', 'repairMinimum'],
  CUSTOM: ['price', 'low', 'high', 'minimumJob']
};

const ZERO_ALLOWED_MONEY_FIELDS = new Set(['minimumJob', 'repairMinimum', 'minimumServiceCharge']);
const ZERO_ALLOWED_MONEY_KEYS = new Set([
  'ROOFING_REPLACEMENT.deckingPerSheet',
  'FLAT_ROOF_REPAIR.pondingWaterSurcharge',
  'FLOORING_INSTALL.disposalPerSqft',
  'FLOORING_INSTALL.perStepPrice',
  'FLOORING_REPLACEMENT.disposalPerSqft',
  'FLOORING_REPLACEMENT.perStepPrice',
  'LANDSCAPING_MOWING.edgingPerLinearFoot',
  'SIDING_REPLACEMENT.disposalPerSqft'
]);

function zeroAllowedMoney(serviceType, fieldName) {
  return ZERO_ALLOWED_MONEY_FIELDS.has(fieldName) || ZERO_ALLOWED_MONEY_KEYS.has(`${serviceType}.${fieldName}`);
}

function scalarMoneyFields(serviceType) {
  return SCALAR_MONEY_FIELDS[serviceType] || [];
}

export function valueAtPath(source, path) {
  return String(path).split('.').reduce((value, key) => value?.[key], source);
}

const requirement = (path, label, options = {}) => ({ path, label, kind: 'positive_money', ...options });

export function vinylUnderlaymentApplies(customerInputs, pricing) {
  const type = customerInputs.newFlooringType;
  if (['hardwood', 'laminate', 'carpet'].includes(type)) return true;
  if (type === 'tile') return false;
  if (type !== 'vinyl_plank') return false;
  const rule = pricing.vinylPlankUnderlaymentRule;
  if (rule === 'always_included') return true;
  if (rule === 'never_included') return false;
  if (rule === 'customer_selectable_addon') return customerInputs.underlaymentSelected === true;
  if (rule === 'subfloor_condition') return customerInputs.subfloorCondition === 'requires_underlayment';
  return false;
}

export function ownerRequirements(serviceType, c = {}, p = {}) {
  const out = [];
  const add = (path, label, options) => out.push(requirement(path, label, options));
  if (serviceType === 'ROOFING_REPLACEMENT') {
    add(`laborPerSquare.${c.replacementRoofType}`, 'Roof installation labor price for the selected replacement material');
    add(`materialCostPerSquare.${c.replacementRoofType}`, 'Roof material price for the selected replacement material');
    add(`underlaymentPerSquare.${c.replacementRoofType}`, 'Installed-area underlayment sell price per roofing square');
    add(`tearOffPerSquare.${c.existingRoofType}`, 'Tear-off price for the existing roof material');
    add('minimumJob', 'Minimum roof replacement job price', { kind: 'minimum' });
    out.push({ path: 'accessoryPricingMode', label: 'Roof accessory pricing method', kind: 'enum', values: ['per_square_allin', 'itemized'] });
    if (p.accessoryPricingMode === 'itemized') {
      if (c.starterLengthLF > 0) add('starterPerLF', 'Starter strip price per linear foot');
      if (c.dripEdgeLengthLF > 0) add('dripEdgePerLF', 'Drip edge price per linear foot');
      if (c.ridgeCapLengthLF > 0) add('ridgeCapPerLF', 'Ridge cap price per linear foot');
    }
    if (c.deckingSheets > 0) add('deckingPerSheet', 'Decking replacement price per sheet');
  } else if (serviceType === 'ROOFING_REPAIR') {
    add('laborHourlyRate', 'Roof repair labor rate per hour');
    add('repairMinimum', 'Minimum repair visit price', { kind: 'minimum' });
    const repairSize = repairSizeFromAffectedArea(serviceType, c.affectedArea);
    add(`repairHours.${c.roofType}.${c.repairType}.${repairSize}`, 'Repair labor hours for the measured affected-area category', { kind: 'positive_number' });
    add(`repairMaterialAllowance.${c.roofType}.${c.repairType}.${repairSize}`, 'Repair material allowance for the measured affected-area category');
  } else if (serviceType === 'FLAT_ROOF_REPLACEMENT') {
    const membrane = c.membraneType;
    add(`laborPerSqft.${membrane}`, 'Flat-roof labor price for the selected membrane');
    add(`membraneCostPerSqft.${membrane}`, 'Flat-roof membrane price for the selected membrane');
    add(`tearOffPerSqft.${membrane}`, 'Flat-roof tear-off price for the selected membrane');
    add('minimumJob', 'Minimum flat-roof job price', { kind: 'minimum' });
    if (c.buildingType === 'commercial') add('insulationPerSqft', 'Commercial insulation and coverboard price per square foot');
  } else if (serviceType === 'FLAT_ROOF_REPAIR') {
    add('laborHourlyRate', 'Flat-roof repair labor rate per hour');
    add('repairMinimum', 'Minimum flat-roof repair visit price', { kind: 'minimum' });
    const repairSize = repairSizeFromAffectedArea(serviceType, c.affectedArea);
    add(`patchRepairHours.${c.membraneType}.${c.repairType}.${repairSize}`, 'Flat-roof repair hours for the measured affected-area category', { kind: 'positive_number' });
    add(`patchMaterialAllowance.${c.membraneType}.${c.repairType}.${repairSize}`, 'Flat-roof material allowance for the measured affected-area category');
  } else if (serviceType === 'INTERIOR_PAINTING') {
    add('laborPerWallSqftPerCoat', 'Wall painting labor price per measured wall square foot per coat');
    add('materialPerWallSqftPerCoat', 'Wall paint material price per measured wall square foot per coat');
    add('minimumJob', 'Minimum interior-painting job price', { kind: 'minimum' });

    if (c.ceilingsIncluded) {
      add('ceilingLaborPerSqftPerCoat', 'Ceiling labor price per measured ceiling square foot per coat');
      add('ceilingMaterialPerSqftPerCoat', 'Ceiling material price per measured ceiling square foot per coat');
    }
    if (c.trimIncluded) {
      add('trimLaborPerLF', 'Trim painting labor price per measured linear foot');
      add('trimMaterialPerLF', 'Trim paint material price per measured linear foot');
    }
  } else if (serviceType === 'EXTERIOR_PAINTING') {
    add('exteriorLaborPerSqftPerCoat', 'Exterior labor price per measured paintable square foot per applied coat');
    add('materialPerSqftPerCoat', 'Exterior material price per measured square foot per coat');
    add('minimumJob', 'Minimum exterior-painting job price', { kind: 'minimum' });
    if (c.surfaceCondition !== 'good') add('laborHourlyRate', 'Exterior preparation labor rate per hour');
  } else if (serviceType.startsWith('FLOORING_')) {
    add(`laborPerSqft.${c.newFlooringType}`, 'Flooring labor price for the selected flooring type');
    add(`materialPerSqft.${c.newFlooringType}`, 'Flooring material price for the selected flooring type');
    add('minimumJob', 'Minimum flooring job price', { kind: 'minimum' });
    out.push({ path: 'vinylPlankUnderlaymentRule', label: 'Vinyl-plank underlayment rule', kind: 'enum', values: ['always_included', 'never_included', 'subfloor_condition', 'customer_selectable_addon', 'owner_review'] });
    if (c.removalNeeded) add(`removalPerSqft.${c.existingFloorType}`, 'Removal price for the selected existing floor type');
    if (c.stairSteps > 0) add('perStepPrice', 'Stair installation price per step');
    if (vinylUnderlaymentApplies(c, p)) add('underlaymentPerSqft', 'Installed-area underlayment sell price per square foot');
    if (serviceType === 'FLOORING_REPLACEMENT' && c.subfloorIssues) add('subfloorAllowancePerSqft', 'Subfloor repair allowance per affected square foot');
  } else if (serviceType.startsWith('FENCING_')) {
    add(`laborPerLinearFoot.${c.fenceType}`, 'Fence labor price for the selected fence type');
    add(`materialPerLinearFoot.${c.fenceType}`, 'Fence material price for the selected fence type');
    out.push({ path: `postsIncludedInMaterial.${c.fenceType}`, label: 'Posts included in material rate for selected fence type', kind: 'boolean' });
    if (p.postsIncludedInMaterial?.[c.fenceType] === false) add(`postPrice.${c.fenceType}`, 'Fence post price for the selected fence type');
    if (c.gateCount > 0) add(`gatePrice.${c.fenceType}`, "Installed price per gate INCLUDING gate posts' hardware; gate posts themselves are counted below.");
    add('minimumJob', 'Minimum fence job price', { kind: 'minimum' });
    if (serviceType === 'FENCING_REPLACEMENT' && c.oldFenceRemoval) add(`removalPerLinearFoot.${c.fenceType}`, 'Fence removal price for the selected fence type');
  } else if (serviceType.startsWith('CONCRETE_')) {
    add('laborPerSqft', 'Concrete labor price per square foot');
    add('concreteCostPerCubicYard', 'Ready-mix concrete price per cubic yard');
    add('formworkPerLF', 'Formwork price per measured linear foot');
    add('minimumJob', 'Minimum concrete job price', { kind: 'minimum' });
    if (c.demolitionNeeded) add('demolitionPerSqft', 'Concrete demolition price per measured square foot');
    if (c.baseNeeded) add('basePrepPerSqft', 'Base preparation price per square foot');
    if (c.reinforcement === 'wire_mesh') add('wireReinforcementPerSqft', 'Wire mesh price per square foot');
    if (c.reinforcement === 'rebar') add('rebarReinforcementPerSqft', 'Rebar price per square foot');
    if (c.finishType === 'stamped') add('stampedMaterialPerSqft', 'Stamped finish material price per square foot');
  } else if (serviceType === 'LANDSCAPING_CLEANUP') {
    add('cleanupBaseRatePerSqft', 'Cleanup labor price per measured square foot');
    add(`debrisPricing.${c.debrisLevel}.laborMultiplier`, 'Cleanup labor multiplier for selected debris level', { kind: 'positive_number' });
    add(`debrisPricing.${c.debrisLevel}.disposalFlat`, 'Cleanup disposal charge for selected debris level', { kind: 'non_negative_money' });
    add('minimumServiceCharge', 'Minimum cleanup service charge', { kind: 'minimum' });
    if (c.haulAway) add('haulAwayFee', 'Additional haul-away charge');
  } else if (serviceType === 'LANDSCAPING_MULCH') {
    add(`mulchMaterialPerYard.${c.mulchType}`, 'Mulch material price for the selected mulch type');
    add('mulchInstallLaborPerYard', 'Mulch installation labor price per cubic yard');
    add('minimumServiceCharge', 'Minimum mulch service charge', { kind: 'minimum' });
    if (c.bedCondition !== 'clean') add(`bedPrepLaborPerSqft.${c.bedCondition}`, 'Bed preparation price for the selected bed condition');
    if (c.edgingNeeded) add('edgingPerLinearFoot', 'Bed edging labor price per measured linear foot');
  } else if (serviceType === 'LANDSCAPING_SOD') {
    add('sodMaterialPerSqft', 'Sod material price per square foot');
    add('sodInstallLaborPerSqft', 'Sod installation labor price per square foot');
    add('minimumServiceCharge', 'Minimum sod service charge', { kind: 'minimum' });
    if (c.groundPrepNeeded) add('groundPrepPerSqft', 'Ground preparation price per square foot');
  } else if (serviceType === 'LANDSCAPING_PLANTING') {
    for (const size of SIZE_KEYS.filter(size => c.plantsBySize?.[size] > 0)) {
      add(`plantingLaborPerPlant.${size}`, `Planting labor price for ${size} plants`);
      add(`plantMaterialAllowance.${size}`, `Material allowance for ${size} plants`);
    }
    add('minimumServiceCharge', 'Minimum planting service charge', { kind: 'minimum' });
    if (c.bedCondition !== 'clean') add(`bedPrepLaborPerSqft.${c.bedCondition}`, 'Bed preparation price for the selected bed condition');
    if (c.mulchNeeded) {
      add(`mulchMaterialPerYard.${c.mulchType}`, 'Mulch material price for the selected mulch type');
      add('mulchInstallLaborPerYard', 'Mulch installation labor price per cubic yard');
    }
  } else if (serviceType === 'LANDSCAPING_MOWING') {
    add('mowingBaseRatePerSqft', 'Mowing labor price per measured square foot');
    add('minimumServiceCharge', 'Minimum mowing service charge', { kind: 'minimum' });
    add(`frequencyMultipliers.${c.serviceFrequency}`, 'Mowing frequency multiplier', { kind: 'positive_number' });
    add(`overgrowthMultipliers.${c.grassCondition}`, 'Grass condition multiplier', { kind: 'positive_number' });
  } else if (serviceType === 'SIDING_REPLACEMENT') {
    add(`laborPerSqft.${c.sidingType}`, 'Siding labor price for the selected siding type');
    add(`materialPerSqft.${c.sidingType}`, 'Siding material price for the selected siding type');
    add('minimumJob', 'Minimum siding job price', { kind: 'minimum' });
    if (c.oldSidingRemoval) add('removalPerSqft', 'Existing siding removal price per square foot');
    if (c.trimIncluded) add('trimPerLinearFoot', 'Siding trim price per measured linear foot');
  } else if (serviceType === 'SIDING_REPAIR') {
    add('laborHourlyRate', 'Siding repair labor rate per hour');
    add('repairMinimum', 'Minimum siding repair visit price', { kind: 'minimum' });
    const repairSize = repairSizeFromAffectedArea(serviceType, c.affectedArea);
    add(`repairHours.${c.sidingType}.${c.damageLevel}.${repairSize}`, 'Siding repair hours for the measured affected-area category', { kind: 'positive_number' });
    add(`materialAllowance.${c.sidingType}.${c.damageLevel}.${repairSize}`, 'Siding material allowance for the measured affected-area category');
  } else if (serviceType === 'CUSTOM') {
    out.push({ path: 'customPricingMode', label: 'Custom service pricing mode', kind: 'enum', values: ['fixed', 'range', 'inspection_first'] });
    out.push({ path: 'unit', label: 'Custom service unit', kind: 'enum', values: ['flat', 'per_sqft', 'per_hour', 'per_unit', 'per_LF', 'per_square'] });
    add('minimumJob', 'Minimum custom-service price', { kind: 'minimum' });
    if (p.customPricingMode === 'fixed') add('price', 'Fixed price per configured unit');
    if (p.customPricingMode === 'range') {
      add('low', 'Low price per configured unit');
      add('high', 'High price per configured unit');
    }
  }
  return out;
}

function validateRequirementValue(requirementDefinition, value) {
  if (requirementDefinition.kind === 'minimum') return nonNegativeMoney(value);
  if (requirementDefinition.kind === 'positive_money') return positiveMoney(value);
  if (requirementDefinition.kind === 'positive_number') return positive(value);
  if (requirementDefinition.kind === 'non_negative_money') return nonNegativeMoney(value);
  if (requirementDefinition.kind === 'boolean') return typeof value === 'boolean';
  if (requirementDefinition.kind === 'enum') return requirementDefinition.values.includes(value);
  if (requirementDefinition.kind === 'integer') return Number.isInteger(value) && value >= requirementDefinition.min && value <= requirementDefinition.max;
  return false;
}

function allNumericLeaves(value, predicate) {
  if (typeof value === 'number') return predicate(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const values = Object.values(value);
  return values.length > 0 && values.every(child => allNumericLeaves(child, predicate));
}

function mapUsesAllowedKeys(value, allowed, requireAll = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length || keys.some(key => !allowed.includes(key))) return false;
  return !requireAll || allowed.every(key => keys.includes(key));
}

function leafPaths(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.keys(value).sort().flatMap(key => leafPaths(value[key], prefix ? `${prefix}.${key}` : key));
}

function sameShape(...values) {
  if (values.some(value => value === undefined)) return true;
  const shapes = values.map(value => JSON.stringify(leafPaths(value)));
  return shapes.every(shape => shape === shapes[0]);
}

const hasOwn = (value, key) => Boolean(value) && typeof value === 'object' && Object.hasOwn(value, key);

function validateRepairCube(value, firstLevelAllowed = null, leafPredicate = positive) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Object.keys(value).length) return false;
  if (firstLevelAllowed && Object.keys(value).some(key => !firstLevelAllowed.includes(key))) return false;
  return Object.values(value).every(second => {
    if (!second || typeof second !== 'object' || Array.isArray(second) || !Object.keys(second).length) return false;
    return Object.values(second).every(row => exactKeys(row, SIZE_KEYS) && SIZE_KEYS.every(size => leafPredicate(row[size])));
  });
}

function validatePricingStructures(serviceType, p) {
  const errors = [];
  for (const name of scalarMoneyFields(serviceType)) {
    if (p[name] === undefined) continue;
    const zeroAllowed = zeroAllowedMoney(serviceType, name);
    const valid = zeroAllowed ? nonNegativeMoney(p[name]) : positiveMoney(p[name]);
    if (!valid) errors.push(`${name} must be ${zeroAllowed ? 'a non-negative' : 'a positive'} integer-cent amount.`);
  }

  if (p.baggingSurchargePercent !== undefined && (!nonNegative(p.baggingSurchargePercent) || p.baggingSurchargePercent > 500)) errors.push('baggingSurchargePercent must be from 0 to 500.');
  const positiveMap = (name, allowed = null, requireAll = false, predicate = positiveMoney) => {
    if (p[name] === undefined) return;
    if ((allowed && !mapUsesAllowedKeys(p[name], allowed, requireAll)) || !allNumericLeaves(p[name], predicate)) errors.push(`${name} contains an unsupported, missing, zero, or invalid price.`);
  };
  if (serviceType === 'ROOFING_REPLACEMENT') {
    for (const name of ['laborPerSquare', 'materialCostPerSquare', 'tearOffPerSquare', 'underlaymentPerSquare']) positiveMap(name);
    if (!sameShape(p.laborPerSquare, p.materialCostPerSquare, p.underlaymentPerSquare)) errors.push('Roof replacement labor, material, and underlayment offerings must use identical replacement-material keys.');
  }
  if (serviceType === 'ROOFING_REPAIR') {
    if (p.repairHours !== undefined && !validateRepairCube(p.repairHours)) errors.push('repairHours must contain complete small, medium, and large rows.');
    if (p.repairMaterialAllowance !== undefined && !validateRepairCube(p.repairMaterialAllowance, null, positiveMoney)) errors.push('repairMaterialAllowance must contain complete positive integer-cent rows.');
    if (!sameShape(p.repairHours, p.repairMaterialAllowance)) errors.push('Roof repair hour and material maps must contain identical roof, repair, and size paths.');
  }
  if (serviceType === 'FLAT_ROOF_REPLACEMENT') {
    for (const name of ['laborPerSqft', 'membraneCostPerSqft', 'tearOffPerSqft']) positiveMap(name);
    if (!sameShape(p.laborPerSqft, p.membraneCostPerSqft, p.tearOffPerSqft)) errors.push('Flat-roof labor, membrane, and tear-off maps must use identical membrane keys.');
  }
  if (serviceType === 'FLAT_ROOF_REPAIR') {
    if (p.patchRepairHours !== undefined && !validateRepairCube(p.patchRepairHours)) errors.push('patchRepairHours must contain complete membrane, repair, and size rows.');
    if (p.patchMaterialAllowance !== undefined && !validateRepairCube(p.patchMaterialAllowance, null, positiveMoney)) errors.push('patchMaterialAllowance must contain complete positive integer-cent rows.');
    if (!sameShape(p.patchRepairHours, p.patchMaterialAllowance)) errors.push('Flat-roof repair hour and material maps must contain identical membrane, repair, and size paths.');
  }
  if (serviceType.startsWith('FLOORING_')) {
    positiveMap('laborPerSqft', FLOORING_TYPES);
    positiveMap('materialPerSqft', FLOORING_TYPES);
    positiveMap('removalPerSqft', null, false, nonNegativeMoney);
    if (!sameShape(p.laborPerSqft, p.materialPerSqft)) errors.push('Flooring labor and material maps must use identical offered flooring-type keys.');
  }
  if (serviceType.startsWith('FENCING_')) {
    for (const name of ['laborPerLinearFoot', 'materialPerLinearFoot']) positiveMap(name);
    for (const name of ['postPrice', 'gatePrice', 'removalPerLinearFoot']) positiveMap(name, null, false, nonNegativeMoney);
    if (p.postsIncludedInMaterial !== undefined) {
      if (!p.postsIncludedInMaterial || typeof p.postsIncludedInMaterial !== 'object' || Array.isArray(p.postsIncludedInMaterial) || !Object.values(p.postsIncludedInMaterial).every(value => typeof value === 'boolean')) errors.push('postsIncludedInMaterial must contain boolean values by fence type.');
    }
    if (!sameShape(p.laborPerLinearFoot, p.materialPerLinearFoot, p.postsIncludedInMaterial)) errors.push('Fence labor, material, and post-inclusion maps must use identical offered fence-type keys.');
    const offeredFenceTypes = Object.keys(p.laborPerLinearFoot || {});
    for (const name of ['postPrice', 'gatePrice', 'removalPerLinearFoot']) {
      if (p[name] && Object.keys(p[name]).some(key => !offeredFenceTypes.includes(key))) errors.push(`${name} contains a fence type that is not offered.`);
    }
  }
  if (serviceType === 'LANDSCAPING_CLEANUP' && p.debrisPricing !== undefined) {
    if (!exactKeys(p.debrisPricing, ['light', 'moderate', 'heavy']) || Object.values(p.debrisPricing).some(row => !exactKeys(row, ['laborMultiplier', 'disposalFlat']) || !positive(row.laborMultiplier) || !nonNegativeMoney(row.disposalFlat))) errors.push('debrisPricing must contain complete light, moderate, and heavy laborMultiplier/disposalFlat rows with non-negative integer-cent disposal charges.');
  }
  if (['LANDSCAPING_MULCH', 'LANDSCAPING_PLANTING'].includes(serviceType)) positiveMap('mulchMaterialPerYard');
  if (['LANDSCAPING_MULCH', 'LANDSCAPING_PLANTING'].includes(serviceType) && p.bedPrepLaborPerSqft !== undefined) positiveMap('bedPrepLaborPerSqft', ['needs_weeding', 'overgrown'], true);
  if (serviceType === 'LANDSCAPING_PLANTING') {
    positiveMap('plantingLaborPerPlant', SIZE_KEYS, true);
    positiveMap('plantMaterialAllowance', SIZE_KEYS, true);
  }
  if (serviceType === 'LANDSCAPING_MOWING') {
    positiveMap('frequencyMultipliers', ['weekly', 'biweekly', 'monthly', 'one_time'], true, positive);
    positiveMap('overgrowthMultipliers', ['maintained', 'overgrown', 'severe'], true, positive);
    if (p.baggingSurchargePercent !== undefined && (!nonNegative(p.baggingSurchargePercent) || p.baggingSurchargePercent > 500)) errors.push('baggingSurchargePercent must be from 0 to 500.');
  }
  if (serviceType === 'SIDING_REPLACEMENT') {
    positiveMap('laborPerSqft', SIDING_TYPES);
    positiveMap('materialPerSqft', SIDING_TYPES);
    if (!sameShape(p.laborPerSqft, p.materialPerSqft)) errors.push('Siding labor and material maps must use identical offered siding-type keys.');
  }
  if (serviceType === 'SIDING_REPAIR') {
    if (p.repairHours !== undefined && !validateRepairCube(p.repairHours, SIDING_TYPES)) errors.push('repairHours must contain complete siding, damage, and size rows.');
    if (p.materialAllowance !== undefined && !validateRepairCube(p.materialAllowance, SIDING_TYPES, positiveMoney)) errors.push('materialAllowance must contain complete positive integer-cent rows.');
    if (!sameShape(p.repairHours, p.materialAllowance)) errors.push('Siding repair hour and material maps must contain identical siding, damage, and size paths.');
  }
  return errors;
}

const CROSS_FIELD_VALIDATION_PATHS = [
  ['Roof replacement labor, material, and underlayment', ['laborPerSquare', 'materialCostPerSquare', 'underlaymentPerSquare']],
  ['Roof repair hour and material', ['repairHours', 'repairMaterialAllowance']],
  ['Flat-roof labor, membrane, and tear-off', ['laborPerSqft', 'membraneCostPerSqft', 'tearOffPerSqft']],
  ['Flat-roof repair hour and material', ['patchRepairHours', 'patchMaterialAllowance']],
  ['Flooring labor and material', ['laborPerSqft', 'materialPerSqft']],
  ['Fence labor, material, and post-inclusion', ['laborPerLinearFoot', 'materialPerLinearFoot', 'postsIncludedInMaterial']],
  ['Siding labor and material', ['laborPerSqft', 'materialPerSqft']],
  ['Siding repair hour and material', ['repairHours', 'materialAllowance']],
  ['roomSizeThresholds.smallMaxSqft', ['roomSizeThresholds.smallMaxSqft', 'roomSizeThresholds.mediumMaxSqft']]
];

function validationPaths(message, allowedFields) {
  const cross = CROSS_FIELD_VALIDATION_PATHS.find(([prefix]) => message.startsWith(prefix));
  if (cross) return { paths: cross[1], crossField: true };
  const token = message.match(/^([A-Za-z][A-Za-z0-9_]*)/)?.[1];
  return { paths: token && allowedFields.has(token) ? [token] : [], crossField: false };
}

function uniqueDiagnostics(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.type}:${item.path}:${item.kind || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function validateOwnerPricing(serviceType, customerInputs, pricing = {}) {
  const allowed = new Set(allowedPricingFields(serviceType));
  const unsupportedOwnerFields = Object.keys(pricing).filter(key => !allowed.has(key));
  const structuralErrors = validatePricingStructures(serviceType, pricing);
  const class2Errors = validateClass2Factors(serviceType, pricing);
  const missingOwnerFields = [];
  const invalidOwnerFields = [];
  const crossFieldOwnerFields = [];
  const ownerDiagnostics = [];

  for (const item of ownerRequirements(serviceType, customerInputs, pricing)) {
    const value = valueAtPath(pricing, item.path);
    if (missing(value)) {
      missingOwnerFields.push(item.path);
      ownerDiagnostics.push({ type: 'missing', kind: item.kind, path: item.path, message: `${item.label} is required.` });
    } else if (!validateRequirementValue(item, value)) {
      invalidOwnerFields.push(item.path);
      ownerDiagnostics.push({ type: 'invalid', kind: item.kind, path: item.path, message: `${item.label} is invalid.` });
    }
  }

  for (const message of [...structuralErrors, ...class2Errors]) {
    const details = validationPaths(message, allowed);
    for (const path of details.paths) {
      if (details.crossField) crossFieldOwnerFields.push(path);
      else invalidOwnerFields.push(path);
      ownerDiagnostics.push({ type: details.crossField ? 'cross_field' : 'invalid', kind: details.crossField ? 'relationship' : 'structure', path, message });
    }
  }

  if (serviceType === 'CUSTOM' && pricing.customPricingMode === 'range' && positive(pricing.low) && positive(pricing.high) && pricing.high <= pricing.low) {
    invalidOwnerFields.push('high');
    crossFieldOwnerFields.push('low', 'high');
    ownerDiagnostics.push({ type: 'cross_field', kind: 'range_order', path: 'high', message: 'Custom range high price must be greater than low price.' });
  }

  const ownerDecisionRequired = [];
  if (serviceType.startsWith('FENCING_')) {
    const decisions = [{
      path: 'concretePerPost',
      kind: 'mixed_charge_allocation',
      message: 'Concrete and digging per post needs separate labor and material prices, or an explicit owner-confirmed allocation rule.'
    }];
    if (customerInputs.gateCount > 0) {
      decisions.push({
        path: `gatePrice.${customerInputs.fenceType}`,
        kind: 'gate_width_pricing_contract',
        message: 'Selected gates need an owner-confirmed measured-width pricing model; the existing per-gate price cannot distinguish opening widths.'
      });
    }
    ownerDecisionRequired.push(...decisions);
    ownerDiagnostics.push(...decisions.map(decision => ({ type: 'owner_decision', ...decision })));
  }

  for (const path of unsupportedOwnerFields) ownerDiagnostics.push({ type: 'unsupported', kind: 'field', path, message: 'This pricing field is not supported for the selected service.' });

  const uniqueMissingOwnerFields = [...new Set(missingOwnerFields)];
  const invalid = [...new Set(invalidOwnerFields)];
  const cross = [...new Set(crossFieldOwnerFields)];
  return {
    ok: !unsupportedOwnerFields.length && !structuralErrors.length && !class2Errors.length && !uniqueMissingOwnerFields.length && !invalid.length && !ownerDecisionRequired.length,
    missingOwnerFields: uniqueMissingOwnerFields,
    invalidOwnerFields: invalid,
    crossFieldOwnerFields: cross,
    unsupportedOwnerFields,
    unexpectedOwnerFields: unsupportedOwnerFields,
    ownerDecisionRequired,
    ownerDiagnostics: uniqueDiagnostics(ownerDiagnostics),
    validationMessages: [...structuralErrors, ...class2Errors, ...ownerDecisionRequired.map(item => item.message)]
  };
}

function exactObject(value, keys, validator) {
  return exactKeys(value, keys) && keys.every(key => validator(value[key], key));
}

export function validateServiceRules(ownerPricing = {}) {
  const errors = [];
  if (!exactObject(ownerPricing.feeRules, FEE_NAMES, value => FEE_RULE_MODES.includes(value))) {
    errors.push(`feeRules must contain exactly ${FEE_NAMES.join(', ')} using supported applicability modes.`);
  }
  if (!exactObject(ownerPricing.priceBasisByCategory, PRICE_BASIS_CATEGORIES, value => ['cost', 'sell_price'].includes(value))) {
    errors.push(`priceBasisByCategory must explicitly classify exactly: ${PRICE_BASIS_CATEGORIES.join(', ')}.`);
  }
  if (!exactObject(ownerPricing.taxabilityByCategory, TAXABILITY_CATEGORIES, value => typeof value === 'boolean')) {
    errors.push(`taxabilityByCategory must contain an explicit boolean for exactly: ${TAXABILITY_CATEGORIES.join(', ')}.`);
  }
  if (ownerPricing.peakMonths !== undefined && (!Array.isArray(ownerPricing.peakMonths) || ownerPricing.peakMonths.some(month => !Number.isInteger(month) || month < 1 || month > 12))) errors.push('peakMonths must contain month numbers 1 through 12.');
  if (ownerPricing.peakSurchargePercent !== undefined && (!nonNegative(ownerPricing.peakSurchargePercent) || ownerPricing.peakSurchargePercent > 500)) errors.push('peakSurchargePercent must be from 0 to 500.');
  return errors;
}

export function validateBusinessDefaults(defaults = {}) {
  const required = ['markupPercent', 'markupMode', 'overheadFixed', 'minimumJobPrice', 'travelFee', 'disposalFee', 'permitFee', 'taxMode', 'taxPercent', 'rangeBufferPercent', 'markupApplies', 'peakMonths', 'peakSurchargePercent'];
  const missingFields = required.filter(name => missing(defaults[name]));
  const errors = [];
  const allowed = new Set(required);
  const unexpected = Object.keys(defaults).filter(key => !allowed.has(key));
  if (unexpected.length) errors.push(`Unsupported business defaults: ${unexpected.join(', ')}.`);
  if (!['markup', 'margin'].includes(defaults.markupMode)) errors.push('markupMode must be markup or margin.');
  if (!nonNegative(defaults.markupPercent) || (defaults.markupMode === 'margin' && defaults.markupPercent >= 100) || defaults.markupPercent > 1000) errors.push('markupPercent is outside its supported range.');
  for (const name of ['overheadFixed', 'minimumJobPrice', 'travelFee', 'disposalFee', 'permitFee']) if (!nonNegativeMoney(defaults[name])) errors.push(`${name} must be a non-negative integer-cent amount.`);
  if (!['TAX_NONE', 'TAX_MATERIALS', 'TAX_ALL'].includes(defaults.taxMode)) errors.push('taxMode is invalid.');
  if (!nonNegative(defaults.taxPercent) || defaults.taxPercent > 100) errors.push('taxPercent must be from 0 to 100.');
  if (defaults.taxMode === 'TAX_NONE' && defaults.taxPercent !== 0) errors.push('TAX_NONE requires a zero taxPercent.');
  if (defaults.taxMode !== 'TAX_NONE' && defaults.taxPercent <= 0) errors.push('A taxable mode requires a positive taxPercent.');
  if (!nonNegative(defaults.rangeBufferPercent) || defaults.rangeBufferPercent > 25) errors.push('rangeBufferPercent must be from 0 to 25.');
  if (!exactObject(defaults.markupApplies, PRICE_BASIS_CATEGORIES, value => typeof value === 'boolean')) errors.push(`markupApplies must contain explicit booleans for exactly: ${PRICE_BASIS_CATEGORIES.join(', ')}.`);
  if (!Array.isArray(defaults.peakMonths) || defaults.peakMonths.some(month => !Number.isInteger(month) || month < 1 || month > 12)) errors.push('peakMonths must contain month numbers 1 through 12.');
  if (!nonNegative(defaults.peakSurchargePercent) || defaults.peakSurchargePercent > 500) errors.push('peakSurchargePercent must be from 0 to 500.');
  return { ok: !missingFields.length && !errors.length, missingFields, errors };
}

export function contractMetadata() {
  return SERVICE_TYPES.map(serviceType => ({
    serviceType,
    customerFields: Object.entries(MEASUREMENT_CONTRACTS[serviceType].fields).map(([name, definition]) => ({ name, ...definition })),
    class2Fields: Object.entries(CLASS2_DEFINITIONS[serviceType] || {}).map(([name, definition]) => ({ name, ...structuredClone(definition) })),
    allowedPricingFields: allowedPricingFields(serviceType)
  }));
}
