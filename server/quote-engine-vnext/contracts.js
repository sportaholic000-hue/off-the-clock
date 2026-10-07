import {BASIC_PAINT_PREPARATION_NOTICE} from '../scopeConfiguration.js';
import {validPricebookServiceId} from '../priceBookStructure.js';
import {productIdentityRequired} from '../productNames.js';
import {mergePricingForValidationVNext} from './pricingMerge.js';
import {fixedPriceField} from '../pricePrecision.js';
import {scopeEntriesFor,scopeBaseKey,scopeMatchesRequest} from '../scopeConfiguration.js';
import { measuredOutlineVNext } from './geometry.js';
import {SCOPE_TYPES,SCOPE_FIELDS,scopeCustomerFields,scopeRequiredCustomer,scopeCustomerErrors,scopeStructureDiagnostics,scopeRequirements,scopesSuppressPrice,scopeKeysForRequest,scopeDefinitions,scopeRateDefinitions} from './scopePricing.js';
import {OFFERING_FIELDS, OFFERING_TYPES, configuredOffering, offeringContract, offeringRequirements, offeringStructureDiagnostics, offeringRateDefinitions, offeringBaselineConfirmation} from './configuredOfferings.js';
import { denseArrayIssue, snapshotPlainData } from './safeData.js';
import { exactAdd, exactCompare, exactMultiply, exactDivide, exactToNumber, exactEvidence, exactFromEvidence } from './exactMath.js';

// Readiness validates many selections against one immutable tier. Only private,
// fully snapshotted and deeply frozen copies are eligible for this reuse. Caller
// objects and customer answers always pass the ordinary snapshot boundary.
const activationSnapshots = new WeakSet();
const activationPricingChecks = new WeakMap();
const activationRegistryChecks = new WeakMap();
const activationZeroPolicyChecks = new WeakMap();
const activationIncludedPriceChecks = new WeakMap();
export function validationSnapshotVNext(value, root) {
  return activationSnapshots.has(value)
    ? { ok: true, value, nonPlainPaths: [] }
    : snapshotPlainData(value, root);
}

export function createActivationValidationVNext(serviceType, pricing, serviceRules, tierName = null) {
  const price = snapshotPlainData(pricing, 'pricing');
  const rules = snapshotPlainData(serviceRules, 'serviceRules');
  if (price.ok && !price.nonPlainPaths.length && rules.ok && !rules.nonPlainPaths.length) {
    pricing = deepFreeze(price.value);
    serviceRules = deepFreeze(rules.value);
    activationSnapshots.add(pricing);
    activationSnapshots.add(serviceRules);
    const structures = deepFreeze(validatePricingStructuresDetailed(serviceType, pricing));
    const factors = deepFreeze(validateClass2FactorsDetailed(serviceType, pricing));
    activationPricingChecks.set(pricing, { serviceType, structures, factors });
    for (const [field, registry] of Object.entries(serviceRules.knownOfferings || {})) {
      if (isRecord(registry)) activationRegistryChecks.set(registry, {
        field, diagnostics: deepFreeze(offeringRegistryDiagnosticsVNext(field, registry))
      });
    }
  }
  return Object.freeze({
    pricing, serviceRules,
    customer: inputs => validateCustomerInputs(serviceType, inputs, pricing, serviceRules),
    owner: inputs => validateOwnerPricing(serviceType, inputs, pricing, serviceRules, tierName)
  });
}

function relativeSnapshotPath(snapshot, root) {
  const prefix = `${root}.`;
  return snapshot.errorPath.startsWith(prefix)
    ? snapshot.errorPath.slice(prefix.length)
    : snapshot.errorPath;
}

function firstNonPlainPath(snapshot, root) {
  const path = snapshot.nonPlainPaths?.[0];
  if (!path) return null;
  const prefix = `${root}.`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
export const SERVICE_TYPES = Object.freeze([
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
]);

export const FEE_NAMES = Object.freeze(['travel', 'disposal', 'permit', 'overhead']);
export const FEE_RULE_MODES = Object.freeze([
  'not_applicable',
  'included_in_rates',
  'always',
  'when_scope_selected',
  'owner_selected',
  'customer_selected'
]);
export const PRICE_BASIS_CATEGORIES = Object.freeze([
  'labor', 'material', 'removal', 'prep', 'addon', 'equipment',
  'travel', 'disposal', 'permit', 'overhead', 'surcharge'
]);
export const TAXABILITY_CATEGORIES = Object.freeze([...PRICE_BASIS_CATEGORIES]);

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
const CANONICAL_SLUG = /^[a-z][a-z0-9_]*$/;

const field = (label, unit, type, extra = {}) => ({ label, unit, type, ...extra });
const numberField = (label, unit, min, max, extra = {}) => field(label, unit, 'number', { min, max, ...extra });
const enumField = (label, values) => field(label, null, 'enum', { values });
const booleanField = label => field(label, null, 'boolean');
const slugField = label => field(label, null, 'slug');

const measuredArea = numberField('Measured area', 'square feet', 1, 1_000_000);
const measuredLength = numberField('Confirmed measured length', 'linear feet', 0, 1_000_000);

function commonContract({ fields, required, inspection, crossValidate }) {
  return { fields: { ...fields, permitRequired: booleanField('Permit required for this measured project') }, required, inspection, crossValidate };
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
    crossValidate(c, p) {
      const errors = [];
      if (p.accessoryPricingMode !== 'itemized') {
        for (const fieldName of ['starterLengthLF', 'dripEdgeLengthLF', 'ridgeCapLengthLF']) {
          if (c[fieldName] !== undefined) errors.push({ field: fieldName, message: `${fieldName} is only valid with itemized roof accessory pricing.` });
        }
      }
      if (c.serviceScope === 'full') {
        if (c.partialPercent !== undefined) errors.push({ field: 'partialPercent', message: 'Affected percentage is only valid for a partial roof replacement.' });
        if (c.partialAreaSqft !== undefined) errors.push({ field: 'partialAreaSqft', message: 'Affected roof area is only valid for a partial roof replacement.' });
      }
      if (c.serviceScope === 'partial' && c.partialPercent !== undefined && c.partialAreaSqft !== undefined) {
        if ([c.roofSizeInput,c.partialPercent,c.partialAreaSqft].every(Number.isFinite) && exactCompare(exactMultiply(c.roofSizeInput,c.partialPercent),exactMultiply(c.partialAreaSqft,100))!==0) {
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
      insulationNeeded:booleanField('New insulation needed'),
      coverboardNeeded:booleanField('New coverboard needed'),
      partialPercent: numberField('Confirmed affected portion', 'percent', 0.1, 100),
      partialAreaSqft: numberField('Measured affected roof area', 'square feet', 1, 2_000_000)
    },
    required(c) {
      const out = ['roofSqft', 'sqftMethod', 'membraneType', 'existingLayers', 'accessDifficulty', 'serviceScope', 'insulationNeeded', 'coverboardNeeded'];
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
      if (c.serviceScope === 'full') {
        if (c.partialPercent !== undefined) errors.push({ field: 'partialPercent', message: 'Affected percentage is only valid for a partial flat-roof replacement.' });
        if (c.partialAreaSqft !== undefined) errors.push({ field: 'partialAreaSqft', message: 'Affected roof area is only valid for a partial flat-roof replacement.' });
      }
      if (c.serviceScope === 'partial' && c.partialPercent !== undefined && c.partialAreaSqft !== undefined) {
        if ([c.roofSqft,c.partialPercent,c.partialAreaSqft].every(Number.isFinite) && exactCompare(exactMultiply(c.roofSqft,c.partialPercent),exactMultiply(c.partialAreaSqft,100))!==0) {
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
      if (c.surfaceCondition !== 'good') return BASIC_PAINT_PREPARATION_NOTICE;
      return null;
    },
    crossValidate(c) {
      const errors = [];
      if (c.ceilingsIncluded === false && c.ceilingAreaSqft !== undefined) errors.push({ field: 'ceilingAreaSqft', message: 'Ceiling area cannot be supplied when ceilings are not included.' });
      if (c.trimIncluded === false && c.trimLengthLF !== undefined) errors.push({ field: 'trimLengthLF', message: 'Trim length cannot be supplied when trim is not included.' });
      return errors;
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
      if (replacement && c.subfloorIssues === false && c.subfloorRepairAreaSqft !== undefined) {
        errors.push({ field: 'subfloorRepairAreaSqft', message: 'Subfloor repair area cannot be supplied when no subfloor issues are reported.' });
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
      fenceHeight: numberField('Fence height', 'feet', Number.MIN_VALUE, Number.MAX_VALUE),
      gateCount: numberField('Gate count', 'gates', 0, 10_000, { integer: true }),
      gateWidthTotalLF: numberField('Measured total gate-opening width', 'linear feet', 0, 100_000),
      terrainSlope: enumField('Terrain slope', SLOPES),
      ...(replacement ? { oldFenceRemoval: booleanField('Old fence removal included') } : {})
    },
    required: c => [
      'linearFeet', 'lfMethod', 'fenceType', 'fenceHeight',
      'gateCount', 'terrainSlope',
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
      dimensionMethod: enumField('Slab measurement method', ['exact', 'measured_area_perimeter', 'measured_outline', 'area_only', 'assumption']),
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
      baseNeeded: booleanField('Base preparation included'),
      adjoinsExistingConcrete:{...booleanField('Does any edge touch a house foundation, garage foundation, or existing concrete?'),summaryLabel:'Edges against foundation or existing concrete'},
      adjoiningEdgeLF:numberField('Total measured length of those adjoining edges','linear feet',0.1,1_000_000,{visibleWhen:[[['adjoinsExistingConcrete','eq',true]]]})
    },
    required(c) {
      const out = ['dimensionMethod', 'thickness', 'finishType', 'demolitionNeeded', 'reinforcement', 'accessDifficulty', 'baseNeeded', 'adjoinsExistingConcrete'];
      if(c.adjoinsExistingConcrete===true)out.push('adjoiningEdgeLF');
      if (c.dimensionMethod === 'exact') out.push('length', 'width');
      if (c.dimensionMethod === 'measured_area_perimeter') out.push('areaSqft', 'perimeterLF');
      if (c.demolitionNeeded) out.push('demolitionAreaSqft');
      return out;
    },
    inspection(c, p) {
      if (['area_only', 'assumption'].includes(c.dimensionMethod)) {
        return 'Measured slab dimensions or measured area and perimeter are required; perimeter is not inferred from area.';
      }
      if (c.finishType === 'exposed_aggregate' && !p.scopeDetails?.exposed_aggregate) {
        return 'Exposed-aggregate material pricing requires an approved owner pricing rule before quoting.';
      }
      return null;
    },
    crossValidate(c) {
      const errors = [];
      if (c.dimensionMethod === 'exact') {
        if (c.areaSqft !== undefined) errors.push({ field: 'areaSqft', message: 'Measured area cannot be supplied when length and width are the selected slab measurement method.' });
        if (c.perimeterLF !== undefined) errors.push({ field: 'perimeterLF', message: 'Measured perimeter cannot be supplied when length and width are the selected slab measurement method.' });
        if (Number.isFinite(c.length) && Number.isFinite(c.width) && exactCompare(exactMultiply(c.length, c.width), 10_000_000) > 0) {
          const message = 'Measured slab length and width produce an area above the supported 10,000,000 square-foot limit.';
          errors.push({ field: 'length', message });
          errors.push({ field: 'width', message });
        }
      }
      if (c.dimensionMethod === 'measured_area_perimeter') {
        if (c.length !== undefined) errors.push({ field: 'length', message: 'Slab length cannot be supplied when measured area and perimeter are the selected method.' });
        if (c.width !== undefined) errors.push({ field: 'width', message: 'Slab width cannot be supplied when measured area and perimeter are the selected method.' });
      }
      if(c.adjoinsExistingConcrete===false&&c.adjoiningEdgeLF!==undefined)errors.push({field:'adjoiningEdgeLF',message:'Adjoining edge length is only supplied when an edge touches foundation or existing concrete.'});
      if(c.adjoinsExistingConcrete===true&&Number.isFinite(c.adjoiningEdgeLF)){
        let perimeter;
        if(c.dimensionMethod==='exact'&&Number.isFinite(c.length)&&Number.isFinite(c.width))perimeter=exactMultiply(2,exactAdd(c.length,c.width));
        if(c.dimensionMethod==='measured_area_perimeter'&&Number.isFinite(c.perimeterLF))perimeter=c.perimeterLF;
        if(c.dimensionMethod==='measured_outline')try{perimeter=measuredOutlineVNext(c.outlinePoints).exactPerimeterLF;}catch{}
        if(perimeter!==undefined&&exactCompare(c.adjoiningEdgeLF,perimeter)>0)errors.push({field:'adjoiningEdgeLF',message:'Adjoining edges cannot exceed the measured slab perimeter.'});
      }
      if (c.demolitionNeeded === false && c.demolitionAreaSqft !== undefined) errors.push({ field: 'demolitionAreaSqft', message: 'Demolition area cannot be supplied when demolition is not included.' });
      return errors;
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
  },
  crossValidate(c) {
    const errors = [];
    if (c.inputMethod === 'yards' && c.mulchDepth !== undefined) errors.push({ field: 'mulchDepth', message: 'Mulch depth cannot be supplied when cubic yards are entered directly.' });
    if (c.bedCondition === 'clean' && c.bedSqft !== undefined) errors.push({ field: 'bedSqft', message: 'Bed preparation area cannot be supplied for a clean bed.' });
    if (c.edgingNeeded === false && c.edgeLF !== undefined) errors.push({ field: 'edgeLF', message: 'Bed-edge length cannot be supplied when edging is not included.' });
    return errors;
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
  },
  crossValidate(c) {
    const errors = [];
    if (c.bedCondition === 'clean' && c.bedSqft !== undefined) errors.push({ field: 'bedSqft', message: 'Bed preparation area cannot be supplied for a clean planting bed.' });
    if (c.mulchNeeded === false && c.mulchYards !== undefined) errors.push({ field: 'mulchYards', message: 'Mulch quantity cannot be supplied when mulch is not included.' });
    if (c.mulchNeeded === false && c.mulchType !== undefined) errors.push({ field: 'mulchType', message: 'Mulch type cannot be supplied when mulch is not included.' });
    return errors;
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
  inspection: c => c.sqftMethod === 'assumption' ? 'Measured mowable lawn area is required for a customer-ready quote.' : null,
  crossValidate(c) {
    if (c.edgingIncluded === false && c.edgingLengthLF !== undefined) return [{ field: 'edgingLengthLF', message: 'Edging length cannot be supplied when lawn edging is not included.' }];
    return [];
  }
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
    : null,
  crossValidate(c) {
    if (c.trimIncluded === false && c.trimLengthLF !== undefined) return [{ field: 'trimLengthLF', message: 'Siding trim length cannot be supplied when trim is not included.' }];
    return [];
  }
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
    const quantityFieldByUnit = {
      per_hour: 'hours',
      per_unit: 'itemCount',
      per_sqft: 'areaSqft',
      per_LF: 'linearFeet',
      per_square: 'roofSquares'
    };
    const selectedQuantityField = quantityFieldByUnit[p.unit || c.unit];
    for (const quantityField of Object.values(quantityFieldByUnit)) {
      if (quantityField !== selectedQuantityField && c[quantityField] !== undefined) errors.push({ field: quantityField, message: `${quantityField} does not apply to the configured custom-service unit.` });
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
    prepHoursPerSqft: factorMap({ fair: 0.008 }, 'Exterior fair-condition preparation labor hours', 'hours per square foot', 0.000001, 2)
  },
  FLOORING_INSTALL: {
    wasteFactorByType: factorMap({ hardwood: 0.10, laminate: 0.08, vinyl_plank: 0.08, carpet: 0.10, tile: 0.12 }, 'Flooring material waste by type', 'decimal fraction', 0, 0.5),
    patternWasteAdder: factorMap({ straight: 0, diagonal_or_pattern: 0.07 }, 'Pattern material waste addition', 'decimal fraction', 0, 0.5),
    roomComplexityMultiplier: factorMap({ large: 1, medium: 1.10, small: 1.20 }, 'Average-room labor multiplier', 'multiplier', 0.1, 5),
    roomSizeThresholds: factorMap({ smallMaxSqft: 150, mediumMaxSqft: 300 }, 'Average-room size thresholds', 'square feet', 1, 10_000)
  },
  FLOORING_REPLACEMENT: {},
  FENCING_INSTALL: {},
  FENCING_REPLACEMENT: {},
  CONCRETE_DRIVEWAY: {
    concreteWasteFactor: factor(0.10, 'Concrete ordering waste allowance', 'decimal fraction', 0, 0.5),
    finishMultiplier: factorMap({ broom: 1, smooth: 1.05, stamped: 1.50 }, 'Concrete finish extra-labor multiplier', 'multiplier', 1, 5),
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

// October 3 owner-approved material quantities and labor adjustments.
const waste = label => factor(0.10,label,'decimal fraction',0,0.5);
CLASS2_DEFINITIONS.ROOFING_REPLACEMENT.accessoryWasteFactor=factorMap({starterPerLF:0.10,dripEdgePerLF:0.10,ridgeCapPerLF:0.10},'Starter strip, drip edge and ridge cap waste','decimal fraction',0,0.5);
CLASS2_DEFINITIONS.FLAT_ROOF_REPLACEMENT.membraneWasteFactor=waste('Membrane material waste');
CLASS2_DEFINITIONS.FLAT_ROOF_REPAIR.accessMultiplier=structuredClone(CLASS2_DEFINITIONS.FLAT_ROOF_REPLACEMENT.accessMultiplier);
for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING']){
 CLASS2_DEFINITIONS[type].paintWasteFactor=waste('Finish paint material waste');
 CLASS2_DEFINITIONS[type].primerWasteFactor=waste('Primer material waste');
 CLASS2_DEFINITIONS[type].prepMaterialWasteFactor=waste('Preparation material waste');
}
CLASS2_DEFINITIONS.FLOORING_INSTALL.layoutLaborMultiplier=factorMap({straight:1,diagonal_or_pattern:1.20},'Flooring layout labor adjustment','multiplier',0.1,5);
CLASS2_DEFINITIONS.FENCING_INSTALL={postSpacingLF:factor(8,'Distance between fence posts','feet',0.1,100),fenceWasteFactor:waste('Fence infill material waste'),terrainLaborMultiplier:factorMap({flat:1,moderate:1.15,steep:1.30},'Fence terrain labor adjustment','multiplier',0.1,5)};
CLASS2_DEFINITIONS.CONCRETE_DRIVEWAY.reinforcementWasteFactor=factorMap({wire_mesh:0.10,rebar:0.10},'Wire mesh and rebar material waste','decimal fraction',0,0.5);
CLASS2_DEFINITIONS.CONCRETE_DRIVEWAY.stampedMaterialWasteFactor=waste('Stamped finish material waste');
for(const type of ['LANDSCAPING_MULCH','LANDSCAPING_PLANTING'])CLASS2_DEFINITIONS[type].accessMultiplier=structuredClone(CLASS2_DEFINITIONS.LANDSCAPING_SOD.accessMultiplier);

CLASS2_DEFINITIONS.FLOORING_REPLACEMENT = structuredClone(CLASS2_DEFINITIONS.FLOORING_INSTALL);
CLASS2_DEFINITIONS.FENCING_REPLACEMENT = structuredClone(CLASS2_DEFINITIONS.FENCING_INSTALL);
CLASS2_DEFINITIONS.CONCRETE_PATIO_SLAB = structuredClone(CLASS2_DEFINITIONS.CONCRETE_DRIVEWAY);

// Repairs 107, 110, 112, 120-127: explicit facts or review, never inferred scope.
function extendMeasuredContract(type, fields, requiredFacts, inspect, cross) {
  const contract = MEASUREMENT_CONTRACTS[type];
  Object.assign(contract.fields, fields);
  const previousRequired = contract.required, previousInspection = contract.inspection, previousCross = contract.crossValidate;
  contract.required = (c,p) => [...(previousRequired?.(c,p) || []), ...requiredFacts(c,p)];
  contract.inspection = (c,p) => previousInspection?.(c,p) || inspect?.(c,p) || null;
  contract.crossValidate = (c,p) => [...(previousCross?.(c,p) || []), ...(cross?.(c,p) || [])];
}
for(const type of ['FLAT_ROOF_REPAIR','LANDSCAPING_MULCH','LANDSCAPING_PLANTING'])extendMeasuredContract(type,{accessDifficulty:enumField('Project access',ACCESS)},()=>['accessDifficulty']);
for(const type of ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB'])extendMeasuredContract(type,
 {outlinePoints:field('Closed measured orthogonal outline coordinates','feet','orthogonal_outline')},c=>c.dimensionMethod==='measured_outline'?['outlinePoints']:[],null,
 c=>c.dimensionMethod==='measured_outline'?['length','width','areaSqft','perimeterLF'].filter(k=>c[k]!==undefined).map(field=>({field,message:'Measured outline derives area and perimeter; duplicate geometry inputs are not accepted.'})):c.outlinePoints!==undefined?[{field:'outlinePoints',message:'Outline points require the measured_outline method.'}]:[]);
const uncertainRepair = c => ['unknown','unknown_leak','unsure','unidentified','unidentified_leak','unknown_source','unknown_leak_source','other','average'].includes(c.repairType) || (c.leakPresent && c.leakSourceIdentified !== true);
for (const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR']) extendMeasuredContract(type,
  { leakSourceIdentified: booleanField('Leak source specifically identified') }, () => [],
  c => uncertainRepair(c) ? 'The leak source must be specifically identified by inspection before pricing.' : null);
// Owner ruling area (audit M03): a repair larger than the area the owner prices as a
// large repair is not quoted from the fixed large-repair hours and allowance.
export const LARGE_REPAIR_LIMIT_MESSAGE = 'This repair is larger than the area this business prices as a repair. The business will follow up to assess it.';
export function largeRepairLimitProblem(serviceType, value) {
  if (value === undefined) return null;
  const mediumMax = serviceType === 'ROOFING_REPAIR' ? 200 : 80;
  return typeof value === 'number' && Number.isFinite(value) && value > mediumMax && value <= 1_000_000 ? null
    : `Enter the largest affected area priced as a repair: more than ${mediumMax} sq ft (the medium-repair limit) and at most 1,000,000.`;
}
for (const type of ['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR']) extendMeasuredContract(type, {}, () => [],
  (c, p) => repairSizeFromAffectedArea(type, c.affectedArea) === 'large' && typeof p?.largeRepairMaxSqft === 'number' && c.affectedArea > p.largeRepairMaxSqft ? LARGE_REPAIR_LIMIT_MESSAGE : null);
for (const type of ['ROOFING_REPLACEMENT','FLAT_ROOF_REPLACEMENT']) extendMeasuredContract(type, {}, () => [], null, c => {
  if(c.serviceScope !== 'partial') return [];
  const total = type === 'ROOFING_REPLACEMENT' ? c.roofSizeInput : c.roofSqft;
  if(typeof total !== 'number' || !Number.isFinite(total)) return [];
  const errors=[];
  for(const name of ['partialAreaSqft','partialPercent']) {
    if(typeof c[name] !== 'number' || !Number.isFinite(c[name])) continue;
    const area = name === 'partialPercent' ? exactDivide(exactMultiply(total,c[name]),100) : c[name];
    const domain=MEASUREMENT_CONTRACTS[type].fields.partialAreaSqft;
    if(exactCompare(area,domain.min)<0 || exactCompare(area,domain.max)>0 || exactCompare(area,total)>=0)
      errors.push({field:name,message:'Partial area must satisfy the measured-area bounds and be strictly smaller than the total roof area.'});
  }
  return errors;
});
extendMeasuredContract('FLAT_ROOF_REPLACEMENT', {replacementMembraneType:slugField('Replacement membrane type')}, () => ['replacementMembraneType'],
 (c,p) => ['unknown','average'].includes(c.membraneType) || ['unknown','average'].includes(c.replacementMembraneType)
  ? 'Both existing and replacement membrane systems must be identified.'
  : (c.insulationNeeded===true||c.coverboardNeeded===true)&&!p.scopeDetails?.insulation
    ? 'New roof insulation or coverboard was requested, but this business has not set up insulation and coverboard pricing.'
    : null);
for(const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT']) extendMeasuredContract(type,
 {removalAreaSqft:numberField('Measured existing flooring removal area','square feet',1,1000000)}, c=>c.removalNeeded?['removalAreaSqft']:[],
 (c,p)=>c.stairSteps>0&&!scopeEntriesFor(p,'stairs').length?'Stair scope requires an explicitly all-inclusive owner price or separate labor, material, underlayment, removal, and disposal pricing.':null,
 c=>c.removalNeeded===false && c.removalAreaSqft!==undefined?[{field:'removalAreaSqft',message:'Removal area cannot be supplied when removal is not selected.'}]:[]);
extendMeasuredContract('SIDING_REPLACEMENT',{},()=>[],(c,p)=>c.oldSidingRemoval&&!scopeEntriesFor(p,'siding_removal').length?'Existing siding type and measured removal area require a separate owner-priced removal contract.':null);
for(const type of ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB']) extendMeasuredContract(type,{},()=>[],
 (c,p)=>c.demolitionNeeded&&!scopeEntriesFor(p,'demolition').length?'Existing slab thickness, reinforcement, access, and demolition scope require an owner-priced contract; new slab facts cannot price the existing slab.'
 :null,
 c=>{
   const errors=[];
   if(c.dimensionMethod==='exact' && Number.isFinite(c.length) && Number.isFinite(c.width)){
     const area=exactMultiply(c.length,c.width),domain=MEASUREMENT_CONTRACTS[type].fields.areaSqft;
     if(exactCompare(area,domain.min)<0 || exactCompare(area,domain.max)>0)errors.push({field:'length',message:'Derived concrete area must satisfy the direct measured-area bounds.'});
   }
   // Isoperimetric bound: no planar slab can have less perimeter than an equal-area circle.
   if(c.dimensionMethod==='measured_area_perimeter' && Number.isFinite(c.areaSqft) && Number.isFinite(c.perimeterLF) && exactCompare(exactMultiply(c.perimeterLF,c.perimeterLF),exactMultiply(4*Math.PI,c.areaSqft))<0)
     errors.push({field:'perimeterLF',message:'The supplied area and perimeter are physically impossible for a simple planar slab.'});
   return errors;
 });
extendMeasuredContract('INTERIOR_PAINTING',{
 wallScopeUniform:booleanField('All wall area shares the confirmed height, access, and finish-coat count'),
 ceilingCoats:numberField('Independently confirmed ceiling finish coats','coats',1,3,{integer:true})
},c=>['wallScopeUniform',...(c.ceilingsIncluded?['ceilingCoats']:[])],
 c=>c.wallScopeUniform!==true?'Mixed wall height, access, or coat zones require separate measured scope or inspection.':null,
 c=>c.ceilingsIncluded===false && c.ceilingCoats!==undefined?[{field:'ceilingCoats',message:'Ceiling coats cannot be supplied when ceilings are excluded.'}]:[]);
extendMeasuredContract('EXTERIOR_PAINTING',{},()=>[],()=> 'Set up an exterior painting offering with the surface, coating, coats, preparation and primer it includes, then enter its installed or itemized prices.');
extendMeasuredContract('LANDSCAPING_SOD',{separateDisposalSelected:booleanField('Separate project debris disposal selected')},()=>[]);

for (const [type, contract] of Object.entries(MEASUREMENT_CONTRACTS)) {
  if (Object.values(contract.fields).some(f => f.type === 'slug')) extendMeasuredContract(type, {
    confirmedFacts: { label: 'Affirmatively identified owner offerings', unit: null, type: 'confirmed_facts' }
  }, () => []);
}
deepFreeze(MEASUREMENT_CONTRACTS);
deepFreeze(CLASS2_DEFINITIONS);

export function withClass2Defaults(serviceType, pricing = {}) {
  if (!SERVICE_TYPES.includes(serviceType)) throw new TypeError('Service type is unsupported.');
  const snapshot = snapshotPlainData(pricing, 'pricing');
  if (!snapshot.ok) {
    if (!isRecord(pricing)) throw new TypeError('Pricing must be an object before Class 2 defaults can be applied.');
    throw new TypeError(
      `Pricing could not be read safely at ${snapshot.errorPath}: ${snapshot.reason}.`
    );
  }
  const nonPlainPath = firstNonPlainPath(snapshot, 'pricing');
  if (nonPlainPath) {
    throw new TypeError(`Pricing must contain only plain data objects; ${nonPlainPath} is not plain data.`);
  }
  const next = snapshot.value;
  for (const [name, definition] of Object.entries(CLASS2_DEFINITIONS[serviceType] || {})) {
    if (next[name] === undefined) next[name] = structuredClone(definition.defaultValue);
  }
  // Snapshot trust is request-local. Never expose a mutable trusted object that
  // could be changed after inspection and then supplied to another public API.
  return structuredClone(next);
}

function missing(value) {
  return value === undefined || value === null || value === '' || value === 'unsure';
}

function validateFieldValue(definition, value) {
  if(definition.type==='offering_counts') {
    if(!isRecord(value)||Object.keys(value).some(key=>!definition.values.includes(key)))return 'must contain only offered gate selections';
    if(Object.values(value).some(count=>!Number.isInteger(count)||count<0||count>10_000))return 'must contain whole gate counts from zero to 10,000';
    return null;
  }
  if (definition.type === 'orthogonal_outline') { try { measuredOutlineVNext(value); return null; } catch(error) { return error.message; } }
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
  if (definition.type === 'confirmed_facts') return isRecord(value) ? null : 'must be a structured fact-confirmation map';
  if (definition.type === 'slug') return typeof value === 'string' && CANONICAL_SLUG.test(value) ? null : 'must be a canonical lowercase value';
  if (definition.type === 'string') {
    if (typeof value !== 'string') return 'must be text';
    const length = value.trim().length;
    if (length < definition.minLength || length > definition.maxLength) return `must contain ${definition.minLength}-${definition.maxLength} characters`;
    return null;
  }
  if (definition.type === 'plant_counts') {
    if (!isRecord(value)) return 'must be an object keyed by small, medium, and large';
    const keys = Object.keys(value);
    if (keys.some(key => !SIZE_KEYS.includes(key)) || SIZE_KEYS.some(key => !keys.includes(key))) return 'must contain exactly small, medium, and large';
    if (SIZE_KEYS.some(key => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 1_000_000)) return 'must contain finite non-negative whole-number plant counts';
    if (SIZE_KEYS.every(key => value[key] === 0)) return 'must include at least one plant';
    return null;
  }
  return 'uses an unsupported contract type';
}

export function validateCustomerInputs(serviceType, customerInputs = {}, pricing = {}, serviceRules = {}) {
  let contract = MEASUREMENT_CONTRACTS[serviceType];
  if (!contract) return { ok: false, missingCustomerFields: [], invalidCustomerFields: ['serviceType'], reviewReason: 'Unsupported service type.' };
  const customerSnapshot = snapshotPlainData(customerInputs, 'customerInputs');
  if (!customerSnapshot.ok) {
    return {
      ok: false, missingCustomerFields: [],
      invalidCustomerFields: [relativeSnapshotPath(customerSnapshot, 'customerInputs')],
      reviewReason: `Customer inputs could not be read safely: ${customerSnapshot.reason}.`
    };
  }
  const customerNonPlainPath = firstNonPlainPath(customerSnapshot, 'customerInputs');
  if (customerNonPlainPath) return {
    ok: false,
    missingCustomerFields: [],
    invalidCustomerFields: [customerNonPlainPath],
    reviewReason: `Customer inputs must contain only plain data objects; ${customerNonPlainPath} is not plain data.`
  };
  customerInputs = customerSnapshot.value;
  const pricingSnapshot = validationSnapshotVNext(pricing, 'pricing');
  if (!pricingSnapshot.ok) {
    return {
      ok: false, missingCustomerFields: [], invalidCustomerFields: [],
      invalidOwnerFields: [relativeSnapshotPath(pricingSnapshot, 'pricing')],
      reviewReason: `Pricing context could not be read safely: ${pricingSnapshot.reason}.`
    };
  }
  const pricingNonPlainPath = firstNonPlainPath(pricingSnapshot, 'pricing');
  if (pricingNonPlainPath) return {
    ok: false,
    missingCustomerFields: [],
    invalidCustomerFields: [],
    invalidOwnerFields: [pricingNonPlainPath],
    reviewReason: `Pricing context must contain only plain data objects; ${pricingNonPlainPath} is not plain data.`
  };
  pricing = pricingSnapshot.value;
  if(configuredOffering(serviceType,pricing))contract=offeringContract(serviceType,pricing);
  const rules = validationSnapshotVNext(serviceRules, 'serviceRules');
  if (!rules.ok || rules.nonPlainPaths.length) return { ok: false, missingCustomerFields: [], invalidCustomerFields: [], invalidOwnerFields: ['serviceRules'], reviewReason: 'Service rules must be plain data.' };
  serviceRules = rules.value;
  contract=customerContractForVNext(serviceType,pricing,serviceRules);
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
  const selectors = Object.entries(contract.fields).filter(([name, def]) => def.type === 'slug' && !missing(customerInputs[name]) && productIdentityRequired(name, customerInputs[name])).map(([name]) => name);
  const facts = customerInputs.confirmedFacts;
  const missingOfferingMaps = [], offeringOwnerDiagnostics = [], unsupportedOfferingFields = [];
  if (facts !== undefined && isRecord(facts)) for (const name of Object.keys(facts)) {
    if (!selectors.includes(name)) invalidCustomerFields.push('confirmedFacts.' + name);
  }
  for (const name of selectors) {
    // Diagnose the unavailable owner contract before assessing a customer's fact
    // against it. One absent registry must not manufacture two responsible parties.
    const registry = serviceRules.knownOfferings?.[name], selected = customerInputs[name];
    if (!isRecord(registry)) {
      missingOfferingMaps.push(name);
      offeringOwnerDiagnostics.push(ownerDiagnostic('missing','known_offerings','knownOfferings.'+name,'Register the products you offer for this selection in the price book.'));
      continue;
    }
    const registryErrors = offeringRegistryDiagnosticsVNext(name, registry);
    if (registryErrors.length) { offeringOwnerDiagnostics.push(...registryErrors); continue; }
    const offeringId = Object.hasOwn(registry, selected) ? registry[selected] : undefined;
    if (!validServiceIdVNext(offeringId)) {
      if (hasSelectedOfferingPriceVNext(serviceType, customerInputs, pricing, name)) {
        offeringOwnerDiagnostics.push(ownerDiagnostic('invalid','offering_registry_inconsistency','knownOfferings.'+name+'.'+selected,'Register this priced product under Registered products before quoting it.'));
      } else {
        unsupportedOfferingFields.push(name);
        invalidCustomerFields.push(name);
        validationMessages.push(name+' is not an offered service option.');
      }
      continue;
    }
    const fact = facts?.[name];
    if (!isRecord(fact)) missingCustomerFields.push('confirmedFacts.' + name);
    else if (Object.keys(fact).length !== 4 || fact.status !== 'identified' || fact.field !== name || fact.value !== selected ||
        !validServiceIdVNext(fact.offeringId) || !sameServiceIdVNext(fact.offeringId, offeringId)) {
      invalidCustomerFields.push('confirmedFacts.' + name);
      validationMessages.push(name + ' requires confirmation of this exact selector, value, and known offering UUID.');
    }
  }
  if (serviceType === 'LANDSCAPING_SOD') {
    if (serviceRules.disposalScope === 'separate_project_debris') {
      if (customerInputs.separateDisposalSelected === undefined) missingCustomerFields.push('separateDisposalSelected');
    } else if (Object.hasOwn(customerInputs, 'separateDisposalSelected')) {
      invalidCustomerFields.push('separateDisposalSelected');
      validationMessages.push('Separate disposal can be selected only when the owner explicitly configures separate_project_debris.');
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
  const explicitInspection = contract.inspection?.(customerInputs, pricing);
  const factVerificationNeeded = [...missingCustomerFields, ...invalidCustomerFields].some(path => path.startsWith('confirmedFacts.') || (selectors.includes(path) && !unsupportedOfferingFields.includes(path)));
  if (offeringOwnerDiagnostics.length || missingCustomerFields.length || invalidCustomerFields.length) {
    return {
      ok: false,
      missingCustomerFields,
      ...(offeringOwnerDiagnostics.length ? { ownerDiagnostics:offeringOwnerDiagnostics, missingOwnerFields:offeringOwnerDiagnostics.filter(d=>d.type==='missing').map(d=>d.path), invalidOwnerFields:offeringOwnerDiagnostics.filter(d=>d.type!=='missing').map(d=>d.path) } : {}),
      invalidCustomerFields: [...new Set(invalidCustomerFields)],
      validationMessages,
      ...((explicitInspection || factVerificationNeeded) ? { inspectionFirst: true } : {}),
      reviewReason: explicitInspection || (offeringOwnerDiagnostics.length ? 'Register the products you offer and check that their names match your priced products.' : null) || (unsupportedOfferingFields.length ? 'The selected value is not an offered service option.' : null) || (factVerificationNeeded ? 'Price-selecting project facts require affirmative confirmation of known offerings before pricing.' : null) || (missingCustomerFields.length
        ? 'Required measured project details were not provided.'
        : 'Project details were invalid or internally inconsistent.')
    };
  }
  const inspectionReason = contract.inspection?.(customerInputs, pricing);
  if (inspectionReason) {
    return {
      ok: false,
      normalized: structuredClone(customerInputs),
      missingCustomerFields: [],
      invalidCustomerFields: [],
      inspectionFirst: true,
      reviewReason: inspectionReason
    };
  }
  return { ok: true, normalized: canonicalCustomerIdentityVNext(customerInputs) };
}


function previousInspectionOwnerDecisionsVNext(serviceType, customerInputs = {}) {
  if (serviceType === 'INTERIOR_PAINTING' && ['fair', 'poor'].includes(customerInputs.surfaceCondition)) {
    return [{
      path: 'interiorPrepPricing',
      kind: 'measured_prep_pricing_contract',
      message: 'Approve a measured interior preparation scope and pricing contract.'
    }];
  }
  if (serviceType === 'EXTERIOR_PAINTING' && customerInputs.surfaceCondition === 'poor') {
    return [{
      path: 'exteriorPrimerPricing',
      kind: 'primer_pricing_contract',
      message: 'Approve separate primer pricing or an explicit all-inclusive exterior rate rule.'
    }];
  }
  if (serviceType.startsWith('CONCRETE_') && customerInputs.finishType === 'exposed_aggregate') {
    return [{
      path: 'exposedAggregateMaterialPricing',
      kind: 'finish_material_pricing_contract',
      message: 'Approve an exposed-aggregate material price or an explicit all-inclusive finish rule.'
    }];
  }
  return [];
}

function ownerDiagnostic(type, kind, path, message) {
  return { type, kind, path, message };
}

function validFactorLeaf(value, definition) {
  return typeof value === 'number' && Number.isFinite(value) && value >= definition.min && value <= definition.max;
}

export function validateClass2FactorsDetailed(serviceType, pricing = {}) {
  const prepared = activationPricingChecks.get(pricing);
  if (prepared?.serviceType === serviceType) return [...prepared.factors];
  const diagnostics = [];
  if (!SERVICE_TYPES.includes(serviceType)) {
    return [ownerDiagnostic('invalid', 'service', 'serviceType', 'Unsupported service type.')];
  }
  const snapshot = snapshotPlainData(pricing, 'pricing');
  if (!snapshot.ok) return [ownerDiagnostic(
    'invalid', 'class2', relativeSnapshotPath(snapshot, 'pricing'),
    `Pricing could not be read safely: ${snapshot.reason}.`
  )];
  const nonPlainPath = firstNonPlainPath(snapshot, 'pricing');
  if (nonPlainPath) return [ownerDiagnostic(
    'invalid', 'class2', nonPlainPath,
    `Pricing must contain only plain data objects; ${nonPlainPath} is not plain data.`
  )];
  pricing = snapshot.value;

  for (const [name, definition] of Object.entries(CLASS2_DEFINITIONS[serviceType] || {})) {
    const expected = definition.defaultValue;
    const value = pricing[name];
    if (value === undefined) {
      diagnostics.push(ownerDiagnostic('missing', 'class2', name, `${name} must be stored in the service price book.`));
      continue;
    }
    if (typeof expected === 'number') {
      if (!validFactorLeaf(value, definition)) diagnostics.push(ownerDiagnostic('invalid', 'class2', name, `${name} must be a finite number from ${definition.min} to ${definition.max}.`));
      continue;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      diagnostics.push(ownerDiagnostic('invalid', 'class2', name, `${name} must be an object with the exact supported keys.`));
      continue;
    }
    const expectedKeys = Object.keys(expected).map(String);
    for (const key of Object.keys(value)) {
      if (!expectedKeys.includes(String(key))) diagnostics.push(ownerDiagnostic('unsupported', 'class2', `${name}.${key}`, `${name}.${key} is not a supported Class 2 factor.`));
    }
    for (const key of expectedKeys) {
      const path = `${name}.${key}`;
      if (!Object.hasOwn(value, key)) diagnostics.push(ownerDiagnostic('missing', 'class2', path, `${path} is required.`));
      else if (!validFactorLeaf(value[key], definition)) diagnostics.push(ownerDiagnostic('invalid', 'class2', path, `${path} must be a finite number from ${definition.min} to ${definition.max}.`));
    }
  }
  const thresholds = pricing.roomSizeThresholds;
  if (serviceType.startsWith('FLOORING_') && thresholds &&
      Number.isFinite(thresholds.smallMaxSqft) && Number.isFinite(thresholds.mediumMaxSqft) &&
      thresholds.smallMaxSqft >= thresholds.mediumMaxSqft) {
    const message = 'roomSizeThresholds.smallMaxSqft must be less than roomSizeThresholds.mediumMaxSqft.';
    diagnostics.push(ownerDiagnostic('cross_field', 'relationship', 'roomSizeThresholds.smallMaxSqft', message));
    diagnostics.push(ownerDiagnostic('cross_field', 'relationship', 'roomSizeThresholds.mediumMaxSqft', message));
  }
  return diagnostics;
}

export function validateClass2Factors(serviceType, pricing = {}) {
  return [...new Set(validateClass2FactorsDetailed(serviceType, pricing).map(item => item.message))];
}

const ALLOWED_PRICING_FIELDS = {
  ROOFING_REPLACEMENT: ['laborPerSquare', 'materialCostPerSquare', 'tearOffPerSquare', 'underlaymentPerSquare', 'underlaymentPriceBasis', 'accessoryPricingMode', 'materialAccessoryBasis', 'starterPerLF', 'dripEdgePerLF', 'ridgeCapPerLF', 'deckingPerSheet', 'disposalPerSquare', 'minimumJob'],
  ROOFING_REPAIR: ['laborHourlyRate', 'repairMinimum', 'repairHours', 'repairMaterialAllowance', 'largeRepairMaxSqft'],
  FLAT_ROOF_REPLACEMENT: ['laborPerSqft', 'membraneCostPerSqft', 'tearOffPerSqft', 'minimumJob', 'insulationPerSqft', 'disposalPerSqft'],
  FLAT_ROOF_REPAIR: ['laborHourlyRate', 'repairMinimum', 'patchRepairHours', 'patchMaterialAllowance', 'pondingWaterSurcharge', 'largeRepairMaxSqft'],
  INTERIOR_PAINTING: ['laborPerWallSqftPerCoat', 'materialPerWallSqftPerCoat', 'minimumJob', 'ceilingLaborPerSqftPerCoat', 'ceilingMaterialPerSqftPerCoat', 'trimLaborPerLF', 'trimMaterialPerLF'],
  EXTERIOR_PAINTING: ['exteriorLaborPerSqftPerCoat', 'materialPerSqftPerCoat', 'minimumJob', 'laborHourlyRate'],
  FLOORING_INSTALL: ['laborPerSqft', 'materialPerSqft', 'minimumJob', 'removalPerSqft', 'disposalPerSqft', 'perStepPrice', 'underlaymentPerSqft', 'underlaymentPriceBasis', 'vinylPlankUnderlaymentRule'],
  FLOORING_REPLACEMENT: ['laborPerSqft', 'materialPerSqft', 'minimumJob', 'removalPerSqft', 'disposalPerSqft', 'perStepPrice', 'underlaymentPerSqft', 'underlaymentPriceBasis', 'vinylPlankUnderlaymentRule', 'subfloorAllowancePerSqft'],
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
  SIDING_REPAIR: ['laborHourlyRate', 'repairMinimum', 'repairHours', 'materialAllowance', 'largeRepairMaxSqft'],
  CUSTOM: ['customPricingMode', 'customChargeClassification', 'price', 'low', 'high', 'unit', 'minimumJob']
};

export function customerContractForVNext(type,p={},rules={}) {
 const base=configuredOffering(type,p)?offeringContract(type,p,rules):MEASUREMENT_CONTRACTS[type];
 // A confirmation for another offered option is evidence, not extra measured
 // work. Accept only its registered confirmation boolean here. All quantities,
 // selections and scope checks remain specific to the option being priced.
 const optionConfirmations={};
 for(const tier of Array.isArray(rules.tiers)?rules.tiers:[]){
  const effective={...(rules.pricing||{}),...(tier.overrides||{})},definitions=scopeDefinitions(type,effective);
  for(const key of Object.keys(tier.overrides?.scopeDetails||{}))if(definitions[key])optionConfirmations[definitions[key].confirmation]={...booleanField('Confirmed '+definitions[key].label.toLowerCase()),evidenceOnly:true};
 }
 return {...base,fields:{...base.fields,...optionConfirmations,...scopeCustomerFields(type,p,rules)},required:c=>[...(base.required?.(c,p)||[]),...scopeRequiredCustomer(type,c,p,rules)],crossValidate:c=>[...(base.crossValidate?.(c,p)||[]),...scopeCustomerErrors(type,c,p,rules)],inspection:c=>base.inspection?.(c,p)};
}

export function allowedPricingFields(serviceType) {
  return ['installedMaterialsPercent','installedLaborPercent',...(ALLOWED_PRICING_FIELDS[serviceType] || []), ...Object.keys(CLASS2_DEFINITIONS[serviceType] || {}), ...(OFFERING_TYPES.includes(serviceType)?OFFERING_FIELDS:[]),...(SCOPE_TYPES.includes(serviceType)?SCOPE_FIELDS:[])];
}

const AI_CONFIRMABLE_SERVICE_FIELDS = [
  'feeRules',
  'priceBasisByCategory',
  'taxabilityByCategory',
  'peakMonths',
  'peakSurchargePercent',
  'disclaimer', 'disposalScope', 'knownOfferings', 'zeroPricePolicy'
];

export function pricingMapDomainVNext(type, field) {
  if(type.startsWith('FLOORING_')&&['laborPerSqft','materialPerSqft'].includes(field))return {rootKeys:[...FLOORING_TYPES]};
  if(type==='SIDING_REPLACEMENT'&&['laborPerSqft','materialPerSqft'].includes(field)||type==='SIDING_REPAIR'&&['repairHours','materialAllowance'].includes(field))return {rootKeys:[...SIDING_TYPES]};
  if(['LANDSCAPING_MULCH','LANDSCAPING_PLANTING'].includes(type)&&field==='bedPrepLaborPerSqft')return {rootKeys:['needs_weeding','overgrown'],requiredRootKeys:['needs_weeding','overgrown']};
  if(type==='LANDSCAPING_PLANTING'&&['plantingLaborPerPlant','plantMaterialAllowance'].includes(field))return {rootKeys:[...SIZE_KEYS],requiredRootKeys:[...SIZE_KEYS]};
  return {};
}

export function aiConfirmationFieldsVNext(service = {}, pricing = {}) {
  const fields = isRecord(pricing) ? Object.keys(pricing) : [];
  if (!isRecord(service)) return fields;
  for (const fieldName of AI_CONFIRMABLE_SERVICE_FIELDS) {
    if (Object.hasOwn(service, fieldName)) fields.push(fieldName);
  }
  if (service.serviceType === 'CUSTOM' && Object.hasOwn(service, 'service')) fields.push('service');
  if (Array.isArray(service.tiers) && service.tiers.length) fields.push('tiers');
  return [...new Set(fields)];
}

const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
const ALL_PRICING_FIELDS = new Set(SERVICE_TYPES.flatMap(serviceType => allowedPricingFields(serviceType)));
const BUSINESS_DEFAULT_FIELDS = ['quoteTimeZone', 'currency',
  'markupPercent', 'markupMode', 'overheadFixed', 'minimumJobPrice',
  'travelFee', 'disposalFee', 'permitFee', 'taxMode', 'taxPercent',
  'rangeBufferPercent', 'markupApplies', 'peakMonths', 'peakSurchargePercent'
];

const nonNegative = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
function monthListIssue(value) {
  if (!Array.isArray(value)) return { path: '', message: 'must be an array of month numbers from 1 through 12' };
  const arrayIssue = denseArrayIssue(value);
  if (arrayIssue) return {
    path: arrayIssue.path,
    message: arrayIssue.reason
  };
  for (let index = 0; index < value.length; index += 1) {
    const month = value[index];
    if (!Number.isInteger(month) || month < 1 || month > 12) return { path: String(index), message: 'must be a whole month number from 1 through 12' };
  }
  return null;
}

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
  LANDSCAPING_MOWING: ['minimumServiceCharge', 'edgingPerLinearFoot'],
  SIDING_REPLACEMENT: ['minimumJob', 'removalPerSqft', 'disposalPerSqft', 'trimPerLinearFoot'],
  SIDING_REPAIR: ['laborHourlyRate', 'repairMinimum'],
  CUSTOM: ['price', 'low', 'high', 'minimumJob']
};

function scalarMoneyFields(serviceType) {
  return SCALAR_MONEY_FIELDS[serviceType] || [];
}

export function valueAtPath(source, path) {
  let value = source;
  for (const key of String(path).split('.')) {
    if (!isRecord(value) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

export function ownerRequirements(type,c={},p={},rules={}) { return [...baseOwnerRequirements(type,c,p).filter(item=>!scopesSuppressPrice(type,c,p,rules,item.path)),...scopeRequirements(type,c,p,rules)]; }

const requirement = (path, label, options = {}) => ({ path, label, kind: fixedPriceField(path.split('.')[0])?'non_negative_money':'non_negative_number', ...options });

export function vinylUnderlaymentApplies(customerInputs, pricing) {
  const type = customerInputs.newFlooringType;
  if (type !== 'vinyl_plank') return false;
  const rule = pricing.vinylPlankUnderlaymentRule;
  if (rule === 'always_included') return true;
  if (rule === 'never_included') return false;
  if (rule === 'customer_selectable_addon') return customerInputs.underlaymentSelected === true;
  if (rule === 'subfloor_condition') return customerInputs.subfloorCondition === 'requires_underlayment';
  return false;
}

function baseOwnerRequirements(serviceType, c = {}, p = {}) {
  if(configuredOffering(serviceType,p))return offeringRequirements(serviceType,c,p);
  const out = [];
  const add = (path, label, options) => out.push(requirement(path, label, options));
  if (serviceType === 'ROOFING_REPLACEMENT') {
    add(`laborPerSquare.${c.replacementRoofType}`, 'Roof installation labor price for the selected replacement material');
    add(`materialCostPerSquare.${c.replacementRoofType}`, 'Roof material price for the selected replacement material');
    add(`underlaymentPerSquare.${c.replacementRoofType}`, 'Installed-area underlayment sell price per roofing square');
    out.push({ path: `underlaymentPriceBasis.${c.replacementRoofType}`, label: 'Underlayment price basis for the selected replacement material', kind: 'enum', values: ['installed_area_sell_price', 'cost'] });
    add(`tearOffPerSquare.${c.existingRoofType}`, 'Tear-off price for the existing roof material');
    add('minimumJob', 'Minimum roof replacement job price', { kind: 'minimum' });
    out.push({ path: 'accessoryPricingMode', label: 'Roof accessory pricing method', kind: 'enum', values: ['per_square_allin', 'itemized'] });
    if (p.accessoryPricingMode === 'itemized') {
      out.push({path:'materialAccessoryBasis',label:'Base material excludes separately itemized starter, drip edge, and ridge cap',kind:'enum',values:['excludes_itemized_accessories']});
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
    // A large repair is priced only up to the area the owner says it covers.
    if (repairSize === 'large') add('largeRepairMaxSqft', 'Largest affected area priced as a repair', { kind: 'positive_number' });
  } else if (serviceType === 'FLAT_ROOF_REPLACEMENT') {
    const membrane = c.replacementMembraneType;
    add(`laborPerSqft.${membrane}`, 'Flat-roof labor price for the selected membrane');
    add(`membraneCostPerSqft.${membrane}`, 'Flat-roof membrane price for the selected membrane');
    add(`tearOffPerSqft.${c.membraneType}`, 'Flat-roof tear-off price for the selected membrane');
    add('minimumJob', 'Minimum flat-roof job price', { kind: 'minimum' });

  } else if (serviceType === 'FLAT_ROOF_REPAIR') {
    add('laborHourlyRate', 'Flat-roof repair labor rate per hour');
    add('repairMinimum', 'Minimum flat-roof repair visit price', { kind: 'minimum' });
    const repairSize = repairSizeFromAffectedArea(serviceType, c.affectedArea);
    add(`patchRepairHours.${c.membraneType}.${c.repairType}.${repairSize}`, 'Flat-roof repair hours for the measured affected-area category', { kind: 'positive_number' });
    add(`patchMaterialAllowance.${c.membraneType}.${c.repairType}.${repairSize}`, 'Flat-roof material allowance for the measured affected-area category');
    // A large repair is priced only up to the area the owner says it covers.
    if (repairSize === 'large') add('largeRepairMaxSqft', 'Largest affected area priced as a repair', { kind: 'positive_number' });
    // Optional ponding treatment is disclosed as excluded when unpriced.
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
    if (c.newFlooringType === 'vinyl_plank') out.push({ path: 'vinylPlankUnderlaymentRule', label: 'Vinyl-plank underlayment rule', kind: 'enum', values: ['always_included', 'never_included', 'subfloor_condition', 'customer_selectable_addon', 'owner_review'] });
    if (c.removalNeeded) add(`removalPerSqft.${c.existingFloorType}`, 'Removal price for the selected existing floor type');
    if (c.stairSteps > 0) add('perStepPrice', 'Stair installation price per step');
    if (vinylUnderlaymentApplies(c, p)) {
      add('underlaymentPerSqft', 'Installed-area underlayment sell price per square foot');
      out.push({ path: 'underlaymentPriceBasis', label: 'Flooring underlayment price basis', kind: 'enum', values: ['installed_area_sell_price', 'cost'] });
    }
    if (serviceType === 'FLOORING_REPLACEMENT' && c.subfloorIssues) add('subfloorAllowancePerSqft', 'Subfloor repair allowance per affected square foot');
  } else if (serviceType.startsWith('FENCING_')) {
    add(`laborPerLinearFoot.${c.fenceType}`, 'Fence labor price for the selected fence type');
    add(`materialPerLinearFoot.${c.fenceType}`, 'Fence material price for the selected fence type');
    out.push({ path: `postsIncludedInMaterial.${c.fenceType}`, label: 'Posts included in material rate for selected fence type', kind: 'boolean' });
    if (p.postsIncludedInMaterial?.[c.fenceType] === false) add(`postPrice.${c.fenceType}`, 'Fence post price for the selected fence type');
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
    add('mowingBaseRatePerSqft', 'Mowing labor cents per measured square foot (fractional cents supported)', {kind:'non_negative_number'});
    add('minimumServiceCharge', 'Minimum mowing service charge', { kind: 'minimum' });
    add(`frequencyMultipliers.${c.serviceFrequency}`, 'Mowing frequency multiplier', { kind: 'positive_number' });
    add(`overgrowthMultipliers.${c.grassCondition}`, 'Grass condition multiplier', { kind: 'positive_number' });
    // Bagging and mowing edging are ADDONs under spec STEP 2b.
  } else if (serviceType === 'SIDING_REPLACEMENT') {
    add(`laborPerSqft.${c.sidingType}`, 'Siding labor price for the selected siding type');
    add(`materialPerSqft.${c.sidingType}`, 'Siding material price for the selected siding type');
    add('minimumJob', 'Minimum siding job price', { kind: 'minimum' });
    if (c.oldSidingRemoval) add('removalPerSqft', 'Existing siding removal price per square foot');
  } else if (serviceType === 'SIDING_REPAIR') {
    add('laborHourlyRate', 'Siding repair labor rate per hour');
    add('repairMinimum', 'Minimum siding repair visit price', { kind: 'minimum' });
    const repairSize = repairSizeFromAffectedArea(serviceType, c.affectedArea);
    add(`repairHours.${c.sidingType}.${c.damageLevel}.${repairSize}`, 'Siding repair hours for the measured affected-area category', { kind: 'positive_number' });
    add(`materialAllowance.${c.sidingType}.${c.damageLevel}.${repairSize}`, 'Siding material allowance for the measured affected-area category');
    // A large repair is priced only up to the area the owner says it covers.
    if (repairSize === 'large') add('largeRepairMaxSqft', 'Largest affected area priced as a repair', { kind: 'positive_number' });
  } else if (serviceType === 'CUSTOM') {
    out.push({ path: 'customPricingMode', label: 'Custom service pricing mode', kind: 'enum', values: ['fixed', 'range', 'inspection_first'] });
    out.push({ path: 'unit', label: 'Custom service unit', kind: 'enum', values: ['flat', 'per_sqft', 'per_hour', 'per_unit', 'per_LF', 'per_square'] });
    add('minimumJob', 'Minimum custom-service price', { kind: 'minimum' });
    const rateKind = ['flat','per_unit'].includes(p.unit) ? 'non_negative_money' : 'non_negative_number';
    if (p.customPricingMode === 'fixed') add('price', 'Fixed price per configured unit', {kind:rateKind});
    if (p.customPricingMode === 'range') {
      add('low', 'Low price per configured unit', {kind:rateKind});
      add('high', 'High price per configured unit', {kind:rateKind});
    }
  }
  return out;
}

function validateRequirementValue(requirementDefinition, value) {
  if (requirementDefinition.kind === 'minimum') return nonNegativeMoney(value);
  if (requirementDefinition.kind === 'non_negative_number') return nonNegative(value) && value <= Number.MAX_SAFE_INTEGER;
  if (requirementDefinition.kind === 'positive_number') return positive(value);
  if (requirementDefinition.kind === 'non_negative_money') return nonNegativeMoney(value);
  if (requirementDefinition.kind === 'boolean') return typeof value === 'boolean';
  if (requirementDefinition.kind === 'enum') return requirementDefinition.values.includes(value);
  if (requirementDefinition.kind === 'integer') return Number.isInteger(value) && value >= requirementDefinition.min && value <= requirementDefinition.max;
  return false;
}


function leafPaths(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.keys(value).sort().flatMap(key => leafPaths(value[key], prefix ? `${prefix}.${key}` : key));
}

function isRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}


function structureDiagnostic(diagnostics, type, path, message, kind = 'structure') {
  diagnostics.push(ownerDiagnostic(type, kind, path, message));
}

function inspectPriceMap(diagnostics, pricing, name, { allowedKeys = null, requireAll = false, predicate = value=>fixedPriceField(name)?nonNegativeMoney(value):nonNegative(value)&&value<=Number.MAX_SAFE_INTEGER, canonicalKeys = false } = {}) {
  const value = pricing[name];
  if (value === undefined) return;
  if (!isRecord(value) || !Object.keys(value).length) {
    structureDiagnostic(diagnostics, 'invalid', name, `${name} must be a non-empty price map.`);
    return;
  }
  const keys = Object.keys(value);
  if (allowedKeys) {
    for (const key of keys) if (!allowedKeys.includes(key)) structureDiagnostic(diagnostics, 'unsupported', `${name}.${key}`, `${name}.${key} is not supported.`);
    if (requireAll) for (const key of allowedKeys) if (!Object.hasOwn(value, key)) structureDiagnostic(diagnostics, 'missing', `${name}.${key}`, `${name}.${key} is required.`);
  }
  if (canonicalKeys) for (const key of keys) if (!CANONICAL_SLUG.test(key)) structureDiagnostic(diagnostics, 'invalid', `${name}.${key}`, `${name}.${key} must use a canonical lowercase key.`);
  for (const key of keys) {
    if ((allowedKeys && !allowedKeys.includes(key)) || (canonicalKeys && !CANONICAL_SLUG.test(key))) continue;
    if (!predicate(value[key])) structureDiagnostic(diagnostics, 'invalid', `${name}.${key}`, `${name}.${key} contains an invalid value.`);
  }
}

function inspectMatchingFirstLevelKeys(diagnostics, pricing, names, relationship, ignoredKeys = []) {
  const union = new Set(names.flatMap(name => isRecord(pricing[name]) ? Object.keys(pricing[name]) : []).filter(key => !ignoredKeys.includes(key)));
  for (const key of union) {
    for (const name of names) {
      if (!isRecord(pricing[name]) || !Object.hasOwn(pricing[name], key)) {
        structureDiagnostic(diagnostics, 'missing', `${name}.${key}`, `${relationship} must contain matching keys.`, 'relationship');
      }
    }
  }
}

function inspectRepairCube(diagnostics, value, name, { firstLevelAllowed = null, leafPredicate = positive } = {}) {
  if (value === undefined) return;
  if (!isRecord(value) || !Object.keys(value).length) {
    structureDiagnostic(diagnostics, 'invalid', name, `${name} must be a non-empty three-level pricing map.`);
    return;
  }
  for (const [firstKey, secondLevel] of Object.entries(value)) {
    const firstPath = `${name}.${firstKey}`;
    if (firstLevelAllowed && !firstLevelAllowed.includes(firstKey)) {
      structureDiagnostic(diagnostics, 'unsupported', firstPath, `${firstPath} is not supported.`);
      continue;
    }
    if (!firstLevelAllowed && !CANONICAL_SLUG.test(firstKey)) {
      structureDiagnostic(diagnostics, 'invalid', firstPath, `${firstPath} must use a canonical lowercase key.`);
      continue;
    }
    if (!isRecord(secondLevel) || !Object.keys(secondLevel).length) {
      structureDiagnostic(diagnostics, 'invalid', firstPath, `${firstPath} must contain at least one repair type.`);
      continue;
    }
    for (const [secondKey, row] of Object.entries(secondLevel)) {
      const rowPath = `${firstPath}.${secondKey}`;
      if (!CANONICAL_SLUG.test(secondKey)) {
        structureDiagnostic(diagnostics, 'invalid', rowPath, `${rowPath} must use a canonical lowercase key.`);
        continue;
      }
      if (!isRecord(row)) {
        structureDiagnostic(diagnostics, 'invalid', rowPath, `${rowPath} must contain small, medium, and large values.`);
        continue;
      }
      for (const key of Object.keys(row)) if (!SIZE_KEYS.includes(key)) structureDiagnostic(diagnostics, 'unsupported', `${rowPath}.${key}`, `${rowPath}.${key} is not a supported repair-size key.`);
      for (const size of SIZE_KEYS) {
        const path = `${rowPath}.${size}`;
        if (!Object.hasOwn(row, size)) structureDiagnostic(diagnostics, 'missing', path, `${path} is required.`);
        else if (!leafPredicate(row[size])) structureDiagnostic(diagnostics, 'invalid', path, `${path} contains an invalid value.`);
      }
    }
  }
}

function inspectMatchingLeafPaths(diagnostics, pricing, names, relationship) {
  const pathsByName = new Map(names.map(name => [name, new Set(isRecord(pricing[name]) ? leafPaths(pricing[name]) : [])]));
  const union = new Set([...pathsByName.values()].flatMap(paths => [...paths]));
  for (const suffix of union) {
    for (const name of names) {
      if (!pathsByName.get(name).has(suffix)) structureDiagnostic(diagnostics, 'missing', `${name}.${suffix}`, `${relationship} must contain matching nested paths.`, 'relationship');
    }
  }
}

export function validatePricingStructuresDetailed(serviceType, p = {}) {
  const prepared = activationPricingChecks.get(p);
  if (prepared?.serviceType === serviceType) return [...prepared.structures];
  const diagnostics = [];
  if (!SERVICE_TYPES.includes(serviceType)) {
    return [ownerDiagnostic('invalid', 'service', 'serviceType', 'Unsupported service type.')];
  }
  const snapshot = snapshotPlainData(p, 'pricing');
  if (!snapshot.ok) return [ownerDiagnostic(
    'invalid', 'pricing_structure', relativeSnapshotPath(snapshot, 'pricing'),
    `Pricing could not be read safely: ${snapshot.reason}.`
  )];
  const nonPlainPath = firstNonPlainPath(snapshot, 'pricing');
  if (nonPlainPath) return [ownerDiagnostic(
    'invalid', 'pricing_structure', nonPlainPath,
    `Pricing must contain only plain data objects; ${nonPlainPath} is not plain data.`
  )];
  p = snapshot.value;
  for(const field of ['installedMaterialsPercent','installedLaborPercent'])if(p[field]!==undefined){
    if(!isRecord(p[field]))structureDiagnostic(diagnostics,'invalid',field,'Installed-price portions must be maps.');
    else for(const [key,value] of Object.entries(p[field])){
      if(!/^(?:(?:offeringRates|scopeRates|underlaymentPerSquare)\.[a-zA-Z][a-zA-Z0-9_]*|underlaymentPerSqft)$/.test(key)||typeof value!=='number'||!Number.isFinite(value)||value<0||value>100)structureDiagnostic(diagnostics,'invalid',field+'.'+key,'Enter a percentage from 0 to 100 for a named installed price.');
      else if(field==='installedMaterialsPercent'&&typeof p.installedLaborPercent?.[key]==='number'&&Number.isFinite(p.installedLaborPercent[key])&&p.installedLaborPercent[key]>=0&&p.installedLaborPercent[key]<=100&&exactCompare(exactAdd(value,p.installedLaborPercent[key]),100)>0)structureDiagnostic(diagnostics,'invalid',field+'.'+key,'Materials and labor portions cannot total more than 100%.');
    }
  }

  if(configuredOffering(serviceType,p))return [...diagnostics,...offeringStructureDiagnostics(serviceType,p),...scopeStructureDiagnostics(serviceType,p)];
  diagnostics.push(...scopeStructureDiagnostics(serviceType,p));

  for (const name of scalarMoneyFields(serviceType)) {
    if (!fixedPriceField(name,p)) {
      if (p[name] !== undefined && (!nonNegative(p[name]) || p[name] > Number.MAX_SAFE_INTEGER)) structureDiagnostic(diagnostics, 'invalid', name, `${name} must be a finite non-negative unit rate in cents.`);
      continue;
    }
    if (p[name] !== undefined && !nonNegativeMoney(p[name])) structureDiagnostic(diagnostics, 'invalid', name, `${name} must be a non-negative integer-cent amount.`);
  }
  if (p.baggingSurchargePercent !== undefined && (!nonNegative(p.baggingSurchargePercent) || p.baggingSurchargePercent > 500)) structureDiagnostic(diagnostics, 'invalid', 'baggingSurchargePercent', 'baggingSurchargePercent must be from 0 to 500.');
  if (serviceType === 'CUSTOM' && p.customChargeClassification !== undefined && !PRICE_BASIS_CATEGORIES.includes(p.customChargeClassification)) structureDiagnostic(diagnostics, 'invalid', 'customChargeClassification', 'Choose the configured line category for this custom service.');

  if (serviceType === 'ROOFING_REPLACEMENT') {
    if(p.materialAccessoryBasis!==undefined && (p.materialAccessoryBasis!=='excludes_itemized_accessories'||p.accessoryPricingMode!=='itemized'))structureDiagnostic(diagnostics,'invalid','materialAccessoryBasis','Accessory exclusion declaration requires itemized mode and the exact excludes_itemized_accessories value.');
    for (const name of ['laborPerSquare', 'materialCostPerSquare', 'tearOffPerSquare', 'underlaymentPerSquare']) inspectPriceMap(diagnostics, p, name, { canonicalKeys: true });
    inspectPriceMap(diagnostics, p, 'underlaymentPriceBasis', { predicate: value => ['installed_area_sell_price', 'cost'].includes(value), canonicalKeys: true });
    const replacementKeys=new Set(['laborPerSquare','materialCostPerSquare','underlaymentPerSquare','underlaymentPriceBasis'].flatMap(name=>isRecord(p[name])?Object.keys(p[name]):[]));
    for(const key of replacementKeys)for(const name of ['laborPerSquare','materialCostPerSquare','underlaymentPerSquare','underlaymentPriceBasis']){
      if(name==='underlaymentPerSquare'&&p.underlaymentPriceBasis?.[key]==='cost'&&p.scopeDetails?.['roof_underlayment_'+key])continue;
      if(!isRecord(p[name])||!Object.hasOwn(p[name],key))structureDiagnostic(diagnostics,'missing',name+'.'+key,'Roof replacement labor, material and selected underlayment pricing must cover the same replacement types.','relationship');
    }
  }
  if (['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR'].includes(serviceType)) {
    const limitProblem = largeRepairLimitProblem(serviceType, p.largeRepairMaxSqft);
    if (limitProblem) structureDiagnostic(diagnostics, 'invalid', 'largeRepairMaxSqft', limitProblem);
  }
  if (serviceType === 'ROOFING_REPAIR') {
    inspectRepairCube(diagnostics, p.repairHours, 'repairHours');
    inspectRepairCube(diagnostics, p.repairMaterialAllowance, 'repairMaterialAllowance', { leafPredicate: nonNegativeMoney });
    inspectMatchingLeafPaths(diagnostics, p, ['repairHours', 'repairMaterialAllowance'], 'Roof repair hour and material maps');
  }
  if (serviceType === 'FLAT_ROOF_REPLACEMENT') {
    for (const name of ['laborPerSqft', 'membraneCostPerSqft', 'tearOffPerSqft']) {
      inspectPriceMap(diagnostics, p, name, { canonicalKeys: true });
    }
    // A retained historical average is validated as data, but never offered or required in another map.
    inspectMatchingFirstLevelKeys(diagnostics, p, ['laborPerSqft', 'membraneCostPerSqft'], 'Replacement membrane labor and material maps', ['average']);
  }
  if (serviceType === 'FLAT_ROOF_REPAIR') {
    inspectRepairCube(diagnostics, p.patchRepairHours, 'patchRepairHours');
    inspectRepairCube(diagnostics, p.patchMaterialAllowance, 'patchMaterialAllowance', { leafPredicate: nonNegativeMoney });
    inspectMatchingLeafPaths(diagnostics, p, ['patchRepairHours', 'patchMaterialAllowance'], 'Flat-roof repair hour and material maps');
  }
  if (serviceType.startsWith('FLOORING_')) {
    inspectPriceMap(diagnostics, p, 'laborPerSqft', { allowedKeys: FLOORING_TYPES });
    inspectPriceMap(diagnostics, p, 'materialPerSqft', { allowedKeys: FLOORING_TYPES });
    inspectPriceMap(diagnostics, p, 'removalPerSqft', { canonicalKeys: true });
    inspectMatchingFirstLevelKeys(diagnostics, p, ['laborPerSqft', 'materialPerSqft'], 'Flooring labor and material maps');
    if(p.vinylPlankUnderlaymentRule!==undefined&&!['always_included','never_included','customer_selectable_addon','subfloor_condition','owner_review'].includes(p.vinylPlankUnderlaymentRule))structureDiagnostic(diagnostics,'invalid','vinylPlankUnderlaymentRule','Vinyl-plank underlayment rule is invalid.');
    if (p.underlaymentPriceBasis !== undefined && !['installed_area_sell_price', 'cost'].includes(p.underlaymentPriceBasis)) structureDiagnostic(diagnostics, 'invalid', 'underlaymentPriceBasis', 'underlaymentPriceBasis must be installed_area_sell_price or cost.');
  }
  if (serviceType.startsWith('FENCING_')) {
    for (const name of ['laborPerLinearFoot', 'materialPerLinearFoot', 'postPrice', 'gatePrice', 'removalPerLinearFoot']) inspectPriceMap(diagnostics, p, name, { canonicalKeys: true });
    if (p.postsIncludedInMaterial !== undefined) {
      if (!isRecord(p.postsIncludedInMaterial) || !Object.keys(p.postsIncludedInMaterial).length) structureDiagnostic(diagnostics, 'invalid', 'postsIncludedInMaterial', 'postsIncludedInMaterial must be a non-empty boolean map.');
      else {
        for (const [key, value] of Object.entries(p.postsIncludedInMaterial)) {
          if (!CANONICAL_SLUG.test(key)) structureDiagnostic(diagnostics, 'invalid', `postsIncludedInMaterial.${key}`, `postsIncludedInMaterial.${key} must use a canonical lowercase key.`);
          if (typeof value !== 'boolean') structureDiagnostic(diagnostics, 'invalid', `postsIncludedInMaterial.${key}`, `postsIncludedInMaterial.${key} must be true or false.`);
        }
      }
    }
    inspectMatchingFirstLevelKeys(diagnostics, p, ['laborPerLinearFoot', 'materialPerLinearFoot', 'postsIncludedInMaterial'], 'Fence labor, material, and post-inclusion maps');
    const offered = new Set(isRecord(p.laborPerLinearFoot) ? Object.keys(p.laborPerLinearFoot) : []);
    for (const name of ['postPrice', 'gatePrice', 'removalPerLinearFoot']) if (isRecord(p[name])) for (const key of Object.keys(p[name])) if (!offered.has(key)) structureDiagnostic(diagnostics, 'unsupported', `${name}.${key}`, `${name}.${key} is not an offered fence type.`);
  }
  if (serviceType === 'LANDSCAPING_CLEANUP' && p.debrisPricing !== undefined) {
    if (!isRecord(p.debrisPricing)) structureDiagnostic(diagnostics, 'invalid', 'debrisPricing', 'debrisPricing must contain complete debris-level rows.');
    else {
      for (const key of Object.keys(p.debrisPricing)) if (!['light', 'moderate', 'heavy'].includes(key)) structureDiagnostic(diagnostics, 'unsupported', `debrisPricing.${key}`, `debrisPricing.${key} is not supported.`);
      for (const level of ['light', 'moderate', 'heavy']) {
        const row = p.debrisPricing[level];
        if (!isRecord(row)) {
          structureDiagnostic(diagnostics, 'missing', `debrisPricing.${level}`, `debrisPricing.${level} is required.`);
          continue;
        }
        for (const key of Object.keys(row)) if (!['laborMultiplier', 'disposalFlat'].includes(key)) structureDiagnostic(diagnostics, 'unsupported', `debrisPricing.${level}.${key}`, `debrisPricing.${level}.${key} is not supported.`);
        if (!Object.hasOwn(row, 'laborMultiplier')) structureDiagnostic(diagnostics, 'missing', `debrisPricing.${level}.laborMultiplier`, `debrisPricing.${level}.laborMultiplier is required.`);
        else if (!positive(row.laborMultiplier)) structureDiagnostic(diagnostics, 'invalid', `debrisPricing.${level}.laborMultiplier`, `debrisPricing.${level}.laborMultiplier must be positive.`);
        if (!Object.hasOwn(row, 'disposalFlat')) structureDiagnostic(diagnostics, 'missing', `debrisPricing.${level}.disposalFlat`, `debrisPricing.${level}.disposalFlat is required.`);
        else if (!nonNegativeMoney(row.disposalFlat)) structureDiagnostic(diagnostics, 'invalid', `debrisPricing.${level}.disposalFlat`, `debrisPricing.${level}.disposalFlat must be a non-negative integer-cent amount.`);
      }
    }
  }
  if (['LANDSCAPING_MULCH', 'LANDSCAPING_PLANTING'].includes(serviceType)) inspectPriceMap(diagnostics, p, 'mulchMaterialPerYard', { canonicalKeys: true });
  if (['LANDSCAPING_MULCH', 'LANDSCAPING_PLANTING'].includes(serviceType)) inspectPriceMap(diagnostics, p, 'bedPrepLaborPerSqft', { allowedKeys: ['needs_weeding', 'overgrown'], requireAll: p.bedPrepLaborPerSqft !== undefined });
  if (serviceType === 'LANDSCAPING_PLANTING') {
    inspectPriceMap(diagnostics, p, 'plantingLaborPerPlant', { allowedKeys: SIZE_KEYS, requireAll: true });
    inspectPriceMap(diagnostics, p, 'plantMaterialAllowance', { allowedKeys: SIZE_KEYS, requireAll: true });
  }
  if (serviceType === 'LANDSCAPING_MOWING') {
    if (p.mowingBaseRatePerSqft !== undefined && (!nonNegative(p.mowingBaseRatePerSqft) || p.mowingBaseRatePerSqft > Number.MAX_SAFE_INTEGER)) structureDiagnostic(diagnostics,'invalid','mowingBaseRatePerSqft','Mowing rate must be finite nonnegative cents per square foot, up to MAX_SAFE_INTEGER; fractional cents are supported.');
    for(const [f,factor] of Object.entries(isRecord(p.frequencyMultipliers)?p.frequencyMultipliers:{})) for(const [g,growth] of Object.entries(isRecord(p.overgrowthMultipliers)?p.overgrowthMultipliers:{})) {
      if(!positive(factor)||!positive(growth))continue;
      try {const product=exactMultiply(factor,growth);exactToNumber(product);exactFromEvidence(exactEvidence(product));}
      catch {for(const path of [`frequencyMultipliers.${f}`,`overgrowthMultipliers.${g}`])structureDiagnostic(diagnostics,'invalid',path,'The selected factor combination exceeds the supported exact-evidence domain.');}
    }
    inspectPriceMap(diagnostics, p, 'frequencyMultipliers', { allowedKeys: ['weekly', 'biweekly', 'monthly', 'one_time'], requireAll: true, predicate: positive });
    inspectPriceMap(diagnostics, p, 'overgrowthMultipliers', { allowedKeys: ['maintained', 'overgrown', 'severe'], requireAll: true, predicate: positive });
  }
  if (serviceType === 'SIDING_REPLACEMENT') {
    inspectPriceMap(diagnostics, p, 'laborPerSqft', { allowedKeys: SIDING_TYPES });
    inspectPriceMap(diagnostics, p, 'materialPerSqft', { allowedKeys: SIDING_TYPES });
    inspectMatchingFirstLevelKeys(diagnostics, p, ['laborPerSqft', 'materialPerSqft'], 'Siding labor and material maps');
  }
  if (serviceType === 'SIDING_REPAIR') {
    inspectRepairCube(diagnostics, p.repairHours, 'repairHours', { firstLevelAllowed: SIDING_TYPES });
    inspectRepairCube(diagnostics, p.materialAllowance, 'materialAllowance', { firstLevelAllowed: SIDING_TYPES, leafPredicate: nonNegativeMoney });
    inspectMatchingLeafPaths(diagnostics, p, ['repairHours', 'materialAllowance'], 'Siding repair hour and material maps');
  }
  return uniqueDiagnostics(diagnostics);
}

export function pricingDiagnosticsForSelection(type,diagnostics,c,pricing={},serviceRules={}) {
  const activeScopes = new Set(scopeKeysForRequest(type,c,pricing,serviceRules));
  let scopeRates;
  return diagnostics.filter(item=>{
    if(item.type!=='missing')return true; // Malformed or unsupported saved data still fails closed.
    // An unfinished additional scope must not disable independently priced
    // work. Keep every missing field for a selected scope; global malformed
    // data was retained above, and unknown/root diagnostics remain blocking.
    if(item.kind==='scope_configuration'){
      if(item.path.startsWith('scopeDetails.')){
        if(item.path==='scopeDetails.insulation.insulationSystem')return c.insulationNeeded===true;
        if(item.path==='scopeDetails.insulation.coverboardSystem')return c.coverboardNeeded===true;
        return activeScopes.has(item.path.split('.')[1]);
      }
      if(item.path.startsWith('scopeRates.')){
        scopeRates ||= scopeRateDefinitions(type,pricing,true);
        const definition=scopeRates[item.path.split('.')[1]],key=definition?.scopeKey;
        if(key)return activeScopes.has(key)&&(!definition.layer||c[definition.layer+'Needed']===true);
      }
    }
    const selected=type==='ROOFING_REPLACEMENT'?c.replacementRoofType:type.startsWith('FLOORING_')?c.newFlooringType:type==='FLAT_ROOF_REPLACEMENT'?c.replacementMembraneType:null;
    if(!selected)return true;
    // Flat roofs: tear-off prices belong to the existing membrane, so only the requested one matters.
    if(type==='FLAT_ROOF_REPLACEMENT'&&item.kind==='relationship'&&item.path.startsWith('tearOffPerSqft.'))return item.path.split('.')[1]===c.membraneType;
    const roots=type==='ROOFING_REPLACEMENT'?['laborPerSquare','materialCostPerSquare','underlaymentPerSquare','underlaymentPriceBasis']:type==='FLAT_ROOF_REPLACEMENT'?['laborPerSqft','membraneCostPerSqft']:['laborPerSqft','materialPerSqft'];
    if(item.kind==='relationship'&&roots.some(root=>item.path.startsWith(root+'.')))return item.path.split('.')[1]===selected;
    const scope=type==='ROOFING_REPLACEMENT'?'roof_underlayment_':'floor_underlayment_';
    if(['scopeDetails.','scopeRates.'].some(root=>item.path.startsWith(root+scope)))return item.path.split('.')[1]===scope+selected;
    return true;
  });
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

function blockedOwnerValidation(path, message) {
  const diagnostic = ownerDiagnostic('invalid', 'owner_pricing', path, message);
  return {
    ok: false,
    missingOwnerFields: [],
    invalidOwnerFields: [path],
    crossFieldOwnerFields: [],
    unsupportedOwnerFields: [],
    unexpectedOwnerFields: [],
    ownerDecisionRequired: [],
    ownerDiagnostics: [diagnostic],
    validationMessages: [message]
  };
}

export function validateOwnerPricing(serviceType, customerInputs, pricing = {}, serviceRules = {}, tierName = null) {
  if (!SERVICE_TYPES.includes(serviceType)) {
    return blockedOwnerValidation('serviceType', 'Unsupported service type.');
  }
  const pricingSnapshot = validationSnapshotVNext(pricing, 'pricing');
  if (!pricingSnapshot.ok) return blockedOwnerValidation(
    relativeSnapshotPath(pricingSnapshot, 'pricing'),
    `Owner pricing could not be read safely: ${pricingSnapshot.reason}.`
  );
  const pricingNonPlainPath = firstNonPlainPath(pricingSnapshot, 'pricing');
  if (pricingNonPlainPath) return blockedOwnerValidation(pricingNonPlainPath, `Owner pricing must contain only plain data objects; ${pricingNonPlainPath} is not plain data.`);
  pricing = pricingSnapshot.value;
  const customerSnapshot = snapshotPlainData(customerInputs, 'customerInputs');
  if (!customerSnapshot.ok) return blockedOwnerValidation(customerSnapshot.errorPath, `Customer inputs could not be read safely: ${customerSnapshot.reason}.`);
  const customerNonPlainPath = firstNonPlainPath(customerSnapshot, 'customerInputs');
  if (customerNonPlainPath) return blockedOwnerValidation(customerNonPlainPath, `Customer inputs must contain only plain data objects; ${customerNonPlainPath} is not plain data.`);
  customerInputs = customerSnapshot.value;
  const rulesSnapshot = validationSnapshotVNext(serviceRules, 'serviceRules');
  if (!rulesSnapshot.ok) return blockedOwnerValidation(rulesSnapshot.errorPath, `Service rules could not be read safely: ${rulesSnapshot.reason}.`);
  const rulesNonPlainPath = firstNonPlainPath(rulesSnapshot, 'serviceRules');
  if (rulesNonPlainPath) return blockedOwnerValidation(rulesNonPlainPath, `Service rules must contain only plain data objects; ${rulesNonPlainPath} is not plain data.`);
  serviceRules = rulesSnapshot.value;
  const allowed = new Set(allowedPricingFields(serviceType));
  const unsupportedOwnerFields = Object.keys(pricing).filter(key => !allowed.has(key));
  const structureDiagnostics = pricingDiagnosticsForSelection(serviceType,validatePricingStructuresDetailed(serviceType, pricing),customerInputs,pricing,serviceRules);
  const class2Diagnostics = validateClass2FactorsDetailed(serviceType, pricing);
  const missingOwnerFields = [];
  const invalidOwnerFields = [];
  const crossFieldOwnerFields = [];
  const ownerDiagnostics = [...structureDiagnostics, ...class2Diagnostics, ...includedPathDiagnosticsVNext(serviceRules, pricing)];

  for (const diagnostic of ownerDiagnostics) {
    if (diagnostic.type === 'missing') missingOwnerFields.push(diagnostic.path);
    else if (diagnostic.type === 'unsupported') unsupportedOwnerFields.push(diagnostic.path);
    else if (diagnostic.type === 'cross_field') crossFieldOwnerFields.push(diagnostic.path);
    else invalidOwnerFields.push(diagnostic.path);
  }

  const requiredPrices = ownerRequirements(serviceType, customerInputs, pricing, serviceRules);
  for (const item of requiredPrices) {
    const value = valueAtPath(pricing, item.path);
    if (missing(value)) {
      missingOwnerFields.push(item.path);
      ownerDiagnostics.push(ownerDiagnostic('missing', item.kind, item.path, `${item.label} is required.`));
    } else if (value === 0 && corePriceRequirementVNext(item) && !freeOfferingVNext(serviceRules, tierName) &&
        !includedCorePriceVNext(serviceRules, pricing, requiredPrices, item.path)) {
      missingOwnerFields.push(item.path);
      ownerDiagnostics.push(ownerDiagnostic('missing', 'unclassified_zero_core_price', item.path, item.label + ' is zero without an explicit free offering or included-price classification.'));
    } else if (!validateRequirementValue(item, value)) {
      invalidOwnerFields.push(item.path);
      ownerDiagnostics.push(ownerDiagnostic('invalid', item.kind, item.path, `${item.label} is invalid.`));
    }
  }

  if (serviceType === 'CUSTOM' && pricing.customPricingMode === 'range' && nonNegative(pricing.low) && nonNegative(pricing.high) && pricing.high <= pricing.low) {
    invalidOwnerFields.push('high');
    crossFieldOwnerFields.push('low', 'high');
    ownerDiagnostics.push(ownerDiagnostic('cross_field', 'range_order', 'high', 'Custom range high price must be greater than low price.'));
  }

  const ownerDecisionRequired = [];
  const requireDecision = (path, kind, message) => ownerDecisionRequired.push({ path, kind, message });
  const baselineConfirmation=offeringBaselineConfirmation(serviceType,pricing);
  if(baselineConfirmation)ownerDecisionRequired.push(baselineConfirmation);
  if (serviceType.startsWith('FENCING_') && !configuredOffering(serviceType,pricing)) {
    requireDecision('postDerivationRule', 'post_geometry_contract', 'Set up a fence offering with its type, height, terrain and included posts and footings. Choose an installed price or measured component prices.');
    requireDecision('concretePerPost', 'mixed_charge_allocation', 'In the fence offering, define the posts, footings and digging included in the installed price, or enter their separate labor and material prices.');
    if (customerInputs.gateCount > 0) requireDecision(`gatePrice.${customerInputs.fenceType}`, 'gate_width_pricing_contract', 'Selected gates need an owner-confirmed measured-width pricing model; the existing per-gate price cannot distinguish opening widths.');
  }
  if (serviceType === 'ROOFING_REPLACEMENT') {
    const basisPath = `underlaymentPriceBasis.${customerInputs.replacementRoofType}`;
    if (valueAtPath(pricing, basisPath) === 'cost' && !pricing.scopeDetails?.['roof_underlayment_'+customerInputs.replacementRoofType]) requireDecision(basisPath, 'purchasable_underlayment_contract', 'Cost-based roof underlayment needs product-specific package coverage, waste, and purchasable-quantity rounding before it can be calculated.');
  }
  if (serviceType.startsWith('FLOORING_')) {
    if (['hardwood', 'laminate', 'carpet'].includes(customerInputs.newFlooringType) && !pricing.scopeDetails?.['floor_underlayment_'+customerInputs.newFlooringType]) requireDecision(`underlaymentPricing.${customerInputs.newFlooringType}`, 'product_specific_underlayment_contract', 'Approve product-specific underlayment scope, coverage, purchasable quantity, and pricing for this flooring type. The vinyl-plank scalar is not reused.');
    if (vinylUnderlaymentApplies(customerInputs, pricing) && pricing.underlaymentPriceBasis === 'cost' && !pricing.scopeDetails?.floor_underlayment_vinyl_plank) requireDecision('underlaymentPriceBasis', 'purchasable_underlayment_contract', 'Cost-based flooring underlayment needs product-specific package coverage, waste, and purchasable-quantity rounding before it can be calculated.');
    if (customerInputs.removalNeeded === false && customerInputs.existingFloorType !== 'none' && !scopeEntriesFor(pricing,'floor_overlay').some(([key,d])=>scopeMatchesRequest(key,d,customerInputs))) requireDecision('floorOverlayPricing', 'floor_overlay_contract', 'Approve preparation, compatibility, and pricing rules for installing over the confirmed existing floor without removal.');
  }
  if (['INTERIOR_PAINTING', 'EXTERIOR_PAINTING'].includes(serviceType) && serviceRules.priceBasisByCategory?.material === 'cost' && !(configuredOffering(serviceType,pricing)&&pricing.offeringMode==='installed')) {
    const labels={paint_wall:'Wall paint product',paint_ceiling:'Ceiling paint product',paint_trim:'Trim paint product',paint_primer:'Wall primer product',paint_ceiling_primer:'Ceiling primer product',paint_prep:'Preparation product'};
    for(const key of scopeKeysForRequest(serviceType,customerInputs,pricing,serviceRules).filter(k=>!pricing.scopeDetails?.[k])) requireDecision('scopeDetails.'+key,'purchasable_paint_contract',(labels[key]||scopeDefinitions(serviceType,pricing)[key]?.label||'Selected paint product')+' is not configured. Enter its coverage, waste allowance and package price in Additional priced scope.');
  }
  if (serviceType === 'SIDING_REPLACEMENT' && customerInputs.trimIncluded && !pricing.scopeDetails?.siding_trim) requireDecision('trimPerLinearFoot', 'mixed_charge_classification', 'Siding trim installation needs separate labor and material rates, or an explicit owner-confirmed category and allocation rule.');
  if (serviceType === 'CUSTOM' && pricing.customChargeClassification === undefined) requireDecision('customChargeClassification', 'custom_charge_classification', 'Choose the custom service charge category in the owner price book. The category selects the existing owner-configured price basis, taxability and markup settings; no labor/material split is inferred.');

  ownerDiagnostics.push(...ownerDecisionRequired.map(decision => ownerDiagnostic('owner_decision', decision.kind, decision.path, decision.message)));
  for (const path of unsupportedOwnerFields) ownerDiagnostics.push(ownerDiagnostic('unsupported', 'field', path, 'This pricing field is not supported for the selected service.'));

  const missingFields = [...new Set(missingOwnerFields)];
  const invalidFields = [...new Set(invalidOwnerFields)];
  const unsupportedFields = [...new Set(unsupportedOwnerFields)];
  const crossFields = [...new Set(crossFieldOwnerFields)];
  const diagnostics = uniqueDiagnostics(ownerDiagnostics);
  const validationMessages = [...new Set([...diagnostics.map(item => item.message), ...ownerDecisionRequired.map(item => item.message)])];
  return {
    ok: !missingFields.length && !invalidFields.length && !unsupportedFields.length && !crossFields.length && !ownerDecisionRequired.length,
    missingOwnerFields: missingFields,
    invalidOwnerFields: invalidFields,
    crossFieldOwnerFields: crossFields,
    unsupportedOwnerFields: unsupportedFields,
    unexpectedOwnerFields: unsupportedFields,
    ownerDecisionRequired,
    ownerDiagnostics: diagnostics,
    validationMessages
  };
}

function inspectRuleMap(diagnostics, source, name, keys, validator, expectedCopy) {
  const value = source[name];
  if (!isRecord(value)) {
    if (missing(value)) for (const key of keys) diagnostics.push(ownerDiagnostic('missing', 'service_rule', `${name}.${key}`, `${name}.${key} is required.`));
    else diagnostics.push(ownerDiagnostic('invalid', 'service_rule', name, `${name} must be an object.`));
    return;
  }
  for (const key of Object.keys(value)) if (!keys.includes(key)) diagnostics.push(ownerDiagnostic('unsupported', 'service_rule', `${name}.${key}`, `${name}.${key} is not supported.`));
  for (const key of keys) {
    const path = `${name}.${key}`;
    if (!Object.hasOwn(value, key)) diagnostics.push(ownerDiagnostic('missing', 'service_rule', path, `${path} is required.`));
    else if (!validator(value[key])) diagnostics.push(ownerDiagnostic('invalid', 'service_rule', path, `${path} ${expectedCopy}.`));
  }
}

export function validateServiceRulesDetailed(ownerPricing = {}, serviceType) {
  const snapshot = snapshotPlainData(ownerPricing, 'ownerPricing');
  if (!snapshot.ok) return [ownerDiagnostic(
    'invalid', 'service_rule', relativeSnapshotPath(snapshot, 'ownerPricing'),
    `Owner pricing rules could not be read safely: ${snapshot.reason}.`
  )];
  const nonPlainPath = firstNonPlainPath(snapshot, 'ownerPricing');
  if (nonPlainPath) return [ownerDiagnostic(
    'invalid', 'service_rule', nonPlainPath,
    `Owner pricing rules must contain only plain data objects; ${nonPlainPath} is not plain data.`
  )];
  ownerPricing = canonicalServiceIdentityVNext(snapshot.value);
  serviceType ||= ownerPricing.serviceType;
  const diagnostics = [];
  const supportedRoot = new Set(['active','serviceType','service','pricing','source','confirmedFields','approvedValues','tiers','feeRules','priceBasisByCategory','taxabilityByCategory','peakMonths','peakSurchargePercent','disclaimer','disposalScope','id','origin','zeroPricePolicy','knownOfferings']);
  for(const key of Object.keys(ownerPricing)) if(!supportedRoot.has(key) && !ALL_PRICING_FIELDS.has(key) && !BUSINESS_DEFAULT_FIELDS.includes(key)) diagnostics.push(ownerDiagnostic('unsupported','service_root',key,'Unsupported service setting; migrate or explicitly configure its VNext contract before quoting.'));
  if(ownerPricing.disposalScope!==undefined && (serviceType!=='LANDSCAPING_SOD'||ownerPricing.disposalScope!=='separate_project_debris')) diagnostics.push(ownerDiagnostic('invalid','service_rule','disposalScope','Only explicitly separate sod-project debris is supported.'));
  const nestedPricing = ownerPricing.pricing;
  const hasNestedPricing = isRecord(nestedPricing);
  if (nestedPricing === undefined) {
    diagnostics.push(ownerDiagnostic('missing', 'service_rule', 'pricing', 'pricing must be stored as an object on the service.'));
  } else if (!hasNestedPricing) {
    diagnostics.push(ownerDiagnostic('invalid', 'service_rule', 'pricing', 'pricing must be an object.'));
  }
  for (const key of Object.keys(ownerPricing)) {
    if (!ALL_PRICING_FIELDS.has(key)) continue;
    diagnostics.push(ownerDiagnostic('unsupported', 'misplaced_pricing', key, `${key} must be stored inside pricing, not at the service root.`));
  }
  for (const key of BUSINESS_DEFAULT_FIELDS.filter(name => !['peakMonths', 'peakSurchargePercent'].includes(name))) {
    if (Object.hasOwn(ownerPricing, key)) diagnostics.push(ownerDiagnostic('unsupported', 'misplaced_business_default', key, `${key} is a business-wide default and cannot be stored on a service.`));
  }
  diagnostics.push(...identityDiagnosticsVNext(ownerPricing, serviceType));
  diagnostics.push(...zeroPolicyDiagnosticsVNext(ownerPricing));
  if (ownerPricing.knownOfferings !== undefined) {
    const maps = ownerPricing.knownOfferings;
    if (!isRecord(maps)) diagnostics.push(ownerDiagnostic('invalid','known_offerings','knownOfferings','Use Registered products to identify the products you offer.'));
    else for (const [field, values] of Object.entries(maps)) {
      if (MEASUREMENT_CONTRACTS[serviceType]?.fields[field]?.type !== 'slug') diagnostics.push(ownerDiagnostic('invalid','known_offerings','knownOfferings.'+field,'This is not an open offering selector.'));
      else diagnostics.push(...offeringRegistryDiagnosticsVNext(field,values));
    }
  }
  if (ownerPricing.disclaimer !== undefined && (typeof ownerPricing.disclaimer !== 'string' || !ownerPricing.disclaimer.trim())) diagnostics.push(ownerDiagnostic('invalid', 'service_rule', 'disclaimer', 'disclaimer must be non-empty text when it is present.'));
  if (ownerPricing.confirmedFields !== undefined) {
    if (!isRecord(ownerPricing.confirmedFields)) {
      diagnostics.push(ownerDiagnostic('invalid', 'ai_confirmation', 'confirmedFields', 'confirmedFields must be an object of explicit boolean approvals.'));
    } else {
      const confirmableFields = new Set(
        ['AI_SUGGESTED', 'AI_INTERVIEW'].includes(ownerPricing.source)
          ? aiConfirmationFieldsVNext(ownerPricing, hasNestedPricing ? nestedPricing : {})
          : []
      );
      for (const [field, value] of Object.entries(ownerPricing.confirmedFields)) {
        const path = `confirmedFields.${field}`;
        if (!confirmableFields.has(field)) {
          diagnostics.push(ownerDiagnostic('unsupported', 'ai_confirmation', path, `${path} does not match a confirmable field on this service.`));
        } else if (typeof value !== 'boolean') {
          diagnostics.push(ownerDiagnostic('invalid', 'ai_confirmation', path, `${path} must be true or false.`));
        }
      }
    }
  }
  if(ownerPricing.approvedValues!==undefined){
    const fields=['AI_SUGGESTED','AI_INTERVIEW'].includes(ownerPricing.source)?aiConfirmationFieldsVNext(ownerPricing,nestedPricing||{}):[];
    if(!isRecord(ownerPricing.approvedValues))diagnostics.push(ownerDiagnostic('invalid','ai_confirmation','approvedValues','Approved values must be a plain field-to-approval map.'));
    else for(const [field,record] of Object.entries(ownerPricing.approvedValues)){
      if(!fields.includes(field))diagnostics.push(ownerDiagnostic('unsupported','ai_confirmation','approvedValues.'+field,'Approval does not match a confirmable service field.'));
      else if(!isRecord(record)||Object.keys(record).length!==6||!Object.hasOwn(record,'value')||record.serviceType!==serviceType||!sameServiceIdVNext(record.serviceId,ownerPricing.id)||record.ownerId!==ownerPricing.origin?.ownerId||['ownerId','operationId','approvedAt'].some(key=>typeof record[key]!=='string'||!record[key].trim())||!/^\d{4}-\d{2}-\d{2}T/.test(record.approvedAt)||!Number.isFinite(Date.parse(record.approvedAt)))diagnostics.push(ownerDiagnostic('invalid','ai_confirmation','approvedValues.'+field,'Approval must retain the exact value, service identity, owner, operation, and timestamp.'));
    }
  }
  inspectRuleMap(diagnostics, ownerPricing, 'feeRules', FEE_NAMES, value => FEE_RULE_MODES.includes(value), 'must use a supported applicability mode');
  if(['when_scope_selected','customer_selected'].includes(ownerPricing.feeRules?.permit))diagnostics.push(ownerDiagnostic('owner_decision','service_rule','feeRules.permit','Choose whether the permit fee always applies, is included, does not apply, or is selected by you. Customers do not decide permit charges.'));
  inspectRuleMap(diagnostics, ownerPricing, 'priceBasisByCategory', PRICE_BASIS_CATEGORIES, value => ['cost', 'sell_price'].includes(value), 'must be cost or sell_price');
  inspectRuleMap(diagnostics, ownerPricing, 'taxabilityByCategory', TAXABILITY_CATEGORIES, value => typeof value === 'boolean', 'must be true or false');
  if (ownerPricing.peakMonths !== undefined) {
    const issue = monthListIssue(ownerPricing.peakMonths);
    const path = issue?.path ? `peakMonths.${issue.path}` : 'peakMonths';
    if (issue) diagnostics.push(ownerDiagnostic('invalid', 'service_rule', path, `${path} ${issue.message}.`));
  }
  if (ownerPricing.peakSurchargePercent !== undefined && (!nonNegative(ownerPricing.peakSurchargePercent) || ownerPricing.peakSurchargePercent > 500)) diagnostics.push(ownerDiagnostic('invalid', 'service_rule', 'peakSurchargePercent', 'peakSurchargePercent must be from 0 to 500.'));
  return uniqueDiagnostics(diagnostics);
}

export function validateServiceRules(ownerPricing = {}, serviceType) {
  return [...new Set(validateServiceRulesDetailed(ownerPricing, serviceType).map(item => item.message))];
}

export function validateBusinessDefaults(defaults = {}) {
  const required = BUSINESS_DEFAULT_FIELDS.filter(field=>!['quoteTimeZone','currency'].includes(field));
  const snapshot = snapshotPlainData(defaults, 'businessDefaults');
  if (!snapshot.ok) {
    const message = isRecord(defaults) ? `Business defaults could not be read safely: ${snapshot.reason}.` : 'Business defaults must be an object.';
    const diagnostic = ownerDiagnostic('invalid', 'business_default', snapshot.errorPath, message);
    return {
      ok: false,
      missingFields: [],
      invalidFields: [snapshot.errorPath],
      unsupportedFields: [],
      diagnostics: [diagnostic],
      errors: [diagnostic.message]
    };
  }
  const nonPlainPath = firstNonPlainPath(snapshot, 'businessDefaults');
  if (nonPlainPath) {
    const message = `Business defaults must contain only plain data objects; ${nonPlainPath} is not plain data.`;
    const diagnostic = ownerDiagnostic('invalid', 'business_default', nonPlainPath, message);
    return {
      ok: false,
      missingFields: [],
      invalidFields: [nonPlainPath],
      unsupportedFields: [],
      diagnostics: [diagnostic],
      errors: [message]
    };
  }
  defaults = snapshot.value;
  const missingFields = required.filter(name => !Object.hasOwn(defaults, name) || missing(defaults[name]));
  const invalidFields = [];
  const unsupportedFields = Object.keys(defaults).filter(key => !BUSINESS_DEFAULT_FIELDS.includes(key));
  const diagnostics = [
    ...missingFields.map(path => ownerDiagnostic('missing', 'business_default', path, `${path} is required.`)),
    ...unsupportedFields.map(path => ownerDiagnostic('unsupported', 'business_default', path, `${path} is not a supported business default.`))
  ];
  const invalid = (path, message) => {
    invalidFields.push(path);
    diagnostics.push(ownerDiagnostic('invalid', 'business_default', path, message));
  };
  // Prices are in one stated currency (set from the business country at onboarding).
  if(defaults.currency!==undefined&&!['CAD','USD'].includes(defaults.currency))invalid('currency','Choose CAD or USD as the currency of your prices.');
  if(defaults.quoteTimeZone!==undefined){try{if(typeof defaults.quoteTimeZone!=='string'||!defaults.quoteTimeZone.trim())throw new Error();new Intl.DateTimeFormat('en-US',{timeZone:defaults.quoteTimeZone}).format(new Date(0));}catch{invalid('quoteTimeZone','Choose a valid business time zone for quote-date pricing.');}}
  if (!missing(defaults.markupMode) && !['markup', 'margin'].includes(defaults.markupMode)) invalid('markupMode', 'markupMode must be markup or margin.');
  if (!missing(defaults.markupPercent) && (!nonNegative(defaults.markupPercent) || (defaults.markupMode === 'margin' && defaults.markupPercent >= 100))) invalid('markupPercent', 'markupPercent is outside its supported range.');
  for (const name of ['overheadFixed', 'minimumJobPrice', 'travelFee', 'disposalFee', 'permitFee']) if (!missing(defaults[name]) && !nonNegativeMoney(defaults[name])) invalid(name, `${name} must be a non-negative integer-cent amount.`);
  if (!missing(defaults.taxMode) && !['TAX_NONE', 'TAX_MATERIALS', 'TAX_ALL'].includes(defaults.taxMode)) invalid('taxMode', 'taxMode is invalid.');
  if (!missing(defaults.taxPercent) && (!nonNegative(defaults.taxPercent) || defaults.taxPercent > 100)) invalid('taxPercent', 'taxPercent must be from 0 to 100.');
  if (defaults.taxMode === 'TAX_NONE' && defaults.taxPercent !== 0) invalid('taxPercent', 'TAX_NONE requires a zero taxPercent.');
  if (['TAX_MATERIALS', 'TAX_ALL'].includes(defaults.taxMode) && defaults.taxPercent <= 0) invalid('taxPercent', 'A taxable mode requires a positive taxPercent.');
  if (!missing(defaults.rangeBufferPercent) && (!nonNegative(defaults.rangeBufferPercent) || defaults.rangeBufferPercent > 25)) invalid('rangeBufferPercent', 'rangeBufferPercent must be from 0 to 25.');
  const markupDiagnostics = [];
  inspectRuleMap(markupDiagnostics, defaults, 'markupApplies', PRICE_BASIS_CATEGORIES, value => typeof value === 'boolean', 'must be true or false');
  for (const item of markupDiagnostics) {
    diagnostics.push({ ...item, kind: 'business_default' });
    if (item.type === 'missing') missingFields.push(item.path);
    else if (item.type === 'unsupported') unsupportedFields.push(item.path);
    else invalidFields.push(item.path);
  }
  if (!missing(defaults.peakMonths)) {
    const issue = monthListIssue(defaults.peakMonths);
    const path = issue?.path ? `peakMonths.${issue.path}` : 'peakMonths';
    if (issue) invalid(path, `${path} ${issue.message}.`);
  }
  if (!missing(defaults.peakSurchargePercent) && (!nonNegative(defaults.peakSurchargePercent) || defaults.peakSurchargePercent > 500)) invalid('peakSurchargePercent', 'peakSurchargePercent must be from 0 to 500.');
  const finalDiagnostics = uniqueDiagnostics(diagnostics);
  const errors = [...new Set(finalDiagnostics.filter(item => item.type !== 'missing').map(item => item.message))];
  const finalMissing = [...new Set(missingFields)];
  const finalInvalid = [...new Set(invalidFields)];
  const finalUnsupported = [...new Set(unsupportedFields)];
  return {
    ok: !finalMissing.length && !finalInvalid.length && !finalUnsupported.length,
    missingFields: finalMissing,
    invalidFields: finalInvalid,
    unsupportedFields: finalUnsupported,
    diagnostics: finalDiagnostics,
    errors
  };
}

export function contractMetadata() {
  return SERVICE_TYPES.map(serviceType => ({
    serviceType,
    customerFields: Object.entries(MEASUREMENT_CONTRACTS[serviceType].fields).map(([name, definition]) => ({ name, ...structuredClone(definition) })),
    class2Fields: Object.entries(CLASS2_DEFINITIONS[serviceType] || {}).map(([name, definition]) => ({ name, ...structuredClone(definition) })),
    allowedPricingFields: allowedPricingFields(serviceType)
  }));
}

// A pure approval operation. An owner-only adapter must authenticate/authorize ownerId
// before calling and persist its returned snapshot atomically. This is not authentication.
export function equalApprovalDataVNext(left,right) {
  const canonical = value => Array.isArray(value) ? value.map(canonical) : isRecord(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])) : value;
  return JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
}
export function hasCurrentApprovalVNext(service,pricing,field) {
  try { service = canonicalServiceIdentityVNext(service); } catch { return false; }
  const approval=service.approvedValues?.[field];
  const value=Object.hasOwn(pricing,field)?pricing[field]:service[field];
  return service.confirmedFields?.[field]===true && isRecord(approval) && approval.serviceType===service.serviceType && sameServiceIdVNext(approval.serviceId,service.id) && approval.ownerId===service.origin?.ownerId && identityDiagnosticsVNext(service).length===0 &&
    ['ownerId','operationId','approvedAt'].every(key=>typeof approval[key]==='string'&&approval[key].trim()) &&
    /^\d{4}-\d{2}-\d{2}T/.test(approval.approvedAt) && Number.isFinite(Date.parse(approval.approvedAt)) &&
    Object.keys(approval).length===6 && Object.hasOwn(approval,'value') && equalApprovalDataVNext(value,approval.value);
}
export function approveVNextValues(input,operation) {
  const serviceSnapshot=snapshotPlainData(input,'service'), opSnapshot=snapshotPlainData(operation,'approval');
  if(!serviceSnapshot.ok||serviceSnapshot.nonPlainPaths.length||!opSnapshot.ok||opSnapshot.nonPlainPaths.length)throw new TypeError('Approval requires plain data.');
  const service=canonicalServiceIdentityVNext(serviceSnapshot.value), op=opSnapshot.value;
  if(!isRecord(service)||!isRecord(op)||!['AI_SUGGESTED','AI_INTERVIEW'].includes(service.source)||!SERVICE_TYPES.includes(service.serviceType))throw new TypeError('Approval requires an AI-originated service.');
  if (identityDiagnosticsVNext(service).length || op.ownerId !== service.origin.ownerId) throw new TypeError('Approval must match the persisted service and its authenticated owner context.');
  const allowed=aiConfirmationFieldsVNext(service,service.pricing);
  if(Object.keys(op).some(k=>!['fields','ownerId','operationId','approvedAt'].includes(k))||!Array.isArray(op.fields)||denseArrayIssue(op.fields)||!op.fields.length||new Set(op.fields).size!==op.fields.length||op.fields.some(k=>!allowed.includes(k))||['ownerId','operationId','approvedAt'].some(k=>typeof op[k]!=='string'||!op[k].trim())||!/^\d{4}-\d{2}-\d{2}T/.test(op.approvedAt)||!Number.isFinite(Date.parse(op.approvedAt)))throw new TypeError('Explicit fields and auditable owner, operation, and timestamp are required.');
  // Explicit approval retires receipts for fields no longer in this contract.
  // Current fields not selected in a partial approval retain their old receipts.
  for(const key of ['confirmedFields','approvedValues'])service[key]=Object.fromEntries(
    Object.entries(isRecord(service[key])?service[key]:{}).filter(([field])=>allowed.includes(field))
  );
  for(const field of op.fields){service.confirmedFields[field]=true;service.approvedValues[field]={value:structuredClone(Object.hasOwn(service.pricing,field)?service.pricing[field]:service[field]),serviceType:service.serviceType,serviceId:service.id,ownerId:op.ownerId,operationId:op.operationId,approvedAt:op.approvedAt};}
  return service;
}

export function inspectionOwnerDecisionsVNext(type,c={},p={}) {
 if(configuredOffering(type,p))return [];
 const decisions=previousInspectionOwnerDecisionsVNext(type,c);
 const add=(path,kind,message)=>decisions.push({path,kind,message});
 for(const key of scopeKeysForRequest(type,c,p))if(!p.scopeDetails?.[key]&&scopeEntriesFor(p,scopeBaseKey(key)).length)add('scopeDetails.'+key,'scope_matching','No configured scope entry matches these measured job facts.');
 if(type.startsWith('FLOORING_')&&c.stairSteps>0&&!scopeEntriesFor(p,'stairs').length)add('perStepPrice','stair_scope_contract','Confirm an all-inclusive stair package or separately price every included stair component.');
 if(type==='SIDING_REPLACEMENT'&&c.oldSidingRemoval&&!scopeEntriesFor(p,'siding_removal').length)add('removalPerSqft','existing_siding_removal_contract','Confirm existing siding type, measured removal area, and the supported removal-price scope.');
 if(type==='SIDING_REPLACEMENT'&&c.trimIncluded&&!p.scopeDetails?.siding_trim)add('trimPerLinearFoot','mixed_charge_classification','Confirm trim labor/material allocation.');
 if(type.startsWith('CONCRETE_')&&c.demolitionNeeded&&!scopeEntriesFor(p,'demolition').length)add('demolitionPerSqft','existing_slab_demolition_contract','Define the existing slab facts or explicit bounded package covered by the demolition price.');
 if(type==='FLAT_ROOF_REPLACEMENT'&&(c.insulationNeeded===true||c.coverboardNeeded===true)&&!p.scopeDetails?.insulation)add('insulationPerSqft','insulation_scope_contract','Confirm insulation and coverboard scope, systems, and measured areas before pricing.');
 if(type==='EXTERIOR_PAINTING')add('exteriorCoatingScope','exterior_coating_scope_contract','Define supported substrate/coating systems and measured preparation scope or a bounded all-area package.');
 return decisions;
}


export function validServiceIdVNext(value) {
  return validPricebookServiceId(value);
}
const auditText = value => typeof value === 'string' && value.trim().length > 0;
const auditTime = value => auditText(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

export function sameServiceIdVNext(left, right) {
  return validServiceIdVNext(left) && validServiceIdVNext(right) && left.toLowerCase() === right.toLowerCase();
}
function canonicalUuid(value) { return validServiceIdVNext(value) ? value.toLowerCase() : value; }
function canonicalOfferingRegistry(registries) {
  if (!isRecord(registries)) return;
  for (const values of Object.values(registries)) if (isRecord(values)) {
    for (const key of Object.keys(values)) values[key] = canonicalUuid(values[key]);
  }
}
export function canonicalServiceIdentityVNext(input) {
  const snapshot = snapshotPlainData(input, 'service');
  if (!snapshot.ok || snapshot.nonPlainPaths.length || !isRecord(snapshot.value)) throw new TypeError('Service identity requires plain data.');
  const service = snapshot.value;
  if (Object.hasOwn(service, 'id')) service.id = canonicalUuid(service.id);
  if (isRecord(service.origin) && Object.hasOwn(service.origin, 'serviceId')) service.origin.serviceId = canonicalUuid(service.origin.serviceId);
  if (isRecord(service.zeroPricePolicy) && Object.hasOwn(service.zeroPricePolicy, 'serviceId')) service.zeroPricePolicy.serviceId = canonicalUuid(service.zeroPricePolicy.serviceId);
  canonicalOfferingRegistry(service.knownOfferings);
  if (isRecord(service.approvedValues)) for (const [field, approval] of Object.entries(service.approvedValues)) if (isRecord(approval)) {
    if (Object.hasOwn(approval, 'serviceId')) approval.serviceId = canonicalUuid(approval.serviceId);
    if (field === 'knownOfferings') canonicalOfferingRegistry(approval.value);
    if (field === 'zeroPricePolicy' && isRecord(approval.value) && Object.hasOwn(approval.value, 'serviceId')) approval.value.serviceId = canonicalUuid(approval.value.serviceId);
  }
  return service;
}
export function canonicalCustomerIdentityVNext(input) {
  const snapshot = snapshotPlainData(input, 'customerInputs');
  if (!snapshot.ok || snapshot.nonPlainPaths.length || !isRecord(snapshot.value)) throw new TypeError('Customer identity requires plain data.');
  const customer = snapshot.value;
  if (isRecord(customer.confirmedFacts)) for (const fact of Object.values(customer.confirmedFacts)) {
    if (isRecord(fact) && Object.hasOwn(fact, 'offeringId')) fact.offeringId = canonicalUuid(fact.offeringId);
  }
  return customer;
}

export function identityDiagnosticsVNext(service, requestedType = service?.serviceType) {
  if (!isRecord(service)) return [ownerDiagnostic('invalid', 'service_identity', 'service', 'A persisted service object is required.')];
  const out = [];
  const add = (path, message) => out.push(ownerDiagnostic(service[path] === undefined ? 'missing' : 'invalid', 'service_identity', path, message));
  if (!validServiceIdVNext(service.id)) add('id', 'A valid persisted service UUID is required.');
  if (!SERVICE_TYPES.includes(service.serviceType)) add('serviceType', 'A supported persisted serviceType is required.');
  else if (service.serviceType !== requestedType) add('serviceType', 'Requested serviceType must equal the persisted serviceType.');
  if (!['MANUAL', 'AI_SUGGESTED', 'AI_INTERVIEW'].includes(service.source)) add('source', 'Explicit MANUAL, AI_SUGGESTED, or AI_INTERVIEW source is required; deleting origin does not create a manual service.');
  const o = service.origin;
  if (!isRecord(o) || Object.keys(o).length !== 6 || !sameServiceIdVNext(o.serviceId, service.id) || o.source !== service.source ||
      !auditText(o.ownerId) || !auditText(o.operationId) || !auditTime(o.createdAt)) {
    add('origin', 'Retain the immutable creation receipt: serviceId, serviceType, source, ownerId, operationId, and createdAt.');
  }
  if (isRecord(o) && (!SERVICE_TYPES.includes(o.serviceType) || o.serviceType !== service.serviceType)) {
    out.push(ownerDiagnostic(o.serviceType === undefined ? 'missing' : 'invalid', 'service_identity', 'origin.serviceType', 'Creation-receipt serviceType must equal the persisted serviceType; changing type requires a new identity and creation receipt.'));
  }
  return out;
}


function supportedIncludedPricePath(serviceType, path, pricing = {}) {
  if (typeof path !== 'string' || !SERVICE_TYPES.includes(serviceType)) return false;
  const parts = path.split('.'), [root, key, leaf, size] = parts;
  if (!allowedPricingFields(serviceType).includes(root)) return false;
  if (parts.length === 1) return (
    scalarMoneyFields(serviceType).includes(root) && !['minimumJob','repairMinimum','minimumServiceCharge'].includes(root)
  ) || (serviceType === 'LANDSCAPING_MOWING' && root === 'mowingBaseRatePerSqft');
  const openMaps = {
    ROOFING_REPLACEMENT:['laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare'],
    FLAT_ROOF_REPLACEMENT:['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'],
    FLOORING_INSTALL:['removalPerSqft'], FLOORING_REPLACEMENT:['removalPerSqft'],
    FENCING_INSTALL:['laborPerLinearFoot','materialPerLinearFoot','postPrice','gatePrice'],
    FENCING_REPLACEMENT:['laborPerLinearFoot','materialPerLinearFoot','postPrice','gatePrice','removalPerLinearFoot'],
    LANDSCAPING_MULCH:['mulchMaterialPerYard'], LANDSCAPING_PLANTING:['mulchMaterialPerYard']
  };
  if (parts.length === 2) {
    if(root==='scopeRates'&&SCOPE_TYPES.includes(serviceType))return Object.hasOwn(scopeRateDefinitions(serviceType,pricing),key);
    if(root==='offeringRates'&&configuredOffering(serviceType,pricing))return Object.hasOwn(offeringRateDefinitions(serviceType,pricing),key);
    if (openMaps[serviceType]?.includes(root)) return CANONICAL_SLUG.test(key);
    if (serviceType.startsWith('FLOORING_') && ['laborPerSqft','materialPerSqft'].includes(root)) return FLOORING_TYPES.includes(key);
    if (serviceType === 'SIDING_REPLACEMENT' && ['laborPerSqft','materialPerSqft'].includes(root)) return SIDING_TYPES.includes(key);
    if (['LANDSCAPING_MULCH','LANDSCAPING_PLANTING'].includes(serviceType) && root === 'bedPrepLaborPerSqft') return ['needs_weeding','overgrown'].includes(key);
    if (serviceType === 'LANDSCAPING_PLANTING' && ['plantingLaborPerPlant','plantMaterialAllowance'].includes(root)) return SIZE_KEYS.includes(key);
  }
  if (parts.length === 3) return serviceType === 'LANDSCAPING_CLEANUP' && root === 'debrisPricing' && ['light','moderate','heavy'].includes(key) && leaf === 'disposalFlat';
  if (parts.length === 4) {
    const materialMap = {ROOFING_REPAIR:'repairMaterialAllowance',FLAT_ROOF_REPAIR:'patchMaterialAllowance',SIDING_REPAIR:'materialAllowance'}[serviceType];
    return root === materialMap && (serviceType === 'SIDING_REPAIR' ? SIDING_TYPES.includes(key) : CANONICAL_SLUG.test(key)) && CANONICAL_SLUG.test(leaf) && SIZE_KEYS.includes(size);
  }
  return false;
}
function includedPathDiagnosticsVNext(service, pricing) {
  if(!activationSnapshots.has(service)||(pricing!==undefined&&!activationSnapshots.has(pricing)))return computeIncludedPathDiagnostics(service,pricing);
  let checks=activationIncludedPriceChecks.get(service);
  if(!checks){checks=new Map();activationIncludedPriceChecks.set(service,checks);}
  if(!checks.has(pricing))checks.set(pricing,deepFreeze(computeIncludedPathDiagnostics(service,pricing)));
  return structuredClone(checks.get(pricing));
}
function computeIncludedPathDiagnostics(service, pricing) {
  const mappings = service.zeroPricePolicy?.includedPrices;
  if (!isRecord(mappings)) return [];
  const variants=[service.pricing,...(Array.isArray(service.tiers)?service.tiers:[]).map(t=>mergePricingForValidationVNext(service.pricing||{},t?.overrides||{}))];
  const supported=(path,p)=>supportedIncludedPricePath(service.serviceType,path,p);
  const out = [], configured = path => variants.some(p=>supported(path,p)&&valueAtPath(p,path)!==undefined);
  const validPrice = (path, value) => {
    const [root,key]=path.split('.');
    const fractional=root==='offeringRates'?offeringRateDefinitions(service.serviceType,pricing)[key]?.moneyKind==='unit_rate':root==='scopeRates'?scopeRateDefinitions(service.serviceType,pricing)[key]?.moneyKind==='unit_rate':!fixedPriceField(root,pricing);
    return fractional ? nonNegative(value)&&value<=Number.MAX_SAFE_INTEGER : nonNegativeMoney(value);
  };
  for (const [source, covering] of Object.entries(mappings)) {
    const path = 'zeroPricePolicy.includedPrices.' + source;
    for (const [role, pricePath] of [['source',source],['covering',covering]]) {
      if (!configured(pricePath)) {
        out.push(ownerDiagnostic('invalid','included_price_path',path,'The '+role+' path '+String(pricePath)+' must name an explicitly configured price in this exact service contract or one of its tiers.'));
      }
    }
    if (pricing !== undefined && supported(source,pricing)) {
      const value = valueAtPath(pricing, source);
      // A source absent from this variant belongs to another configured tier.
      // A present source is checked even when it is not selected by this request.
      if (value !== undefined) {
        const coveringValue = valueAtPath(pricing, covering);
        if (!validPrice(source, value) || !supported(covering,pricing) ||
            !validPrice(covering, coveringValue) || (value === 0 && coveringValue === 0)) {
          out.push(ownerDiagnostic('invalid','included_price_path',path,'The effective tier must retain valid source and covering prices; an included zero needs a positive covering price.'));
        }
      }
    }
  }
  return uniqueDiagnostics(out);
}

function zeroPolicyDiagnosticsVNext(service) {
  if(!activationSnapshots.has(service))return computeZeroPolicyDiagnostics(service);
  if(!activationZeroPolicyChecks.has(service))activationZeroPolicyChecks.set(service,deepFreeze(computeZeroPolicyDiagnostics(service)));
  return structuredClone(activationZeroPolicyChecks.get(service));
}
function computeZeroPolicyDiagnostics(service) {
  const p = service.zeroPricePolicy;
  if (p === undefined) return [];
  const valid = isRecord(p) && Object.keys(p).length === 7 && validServiceIdVNext(p.serviceId) && sameServiceIdVNext(p.serviceId, service.id) &&
    auditText(p.ownerId) && p.ownerId === service.origin?.ownerId && auditText(p.operationId) && auditTime(p.approvedAt) &&
    typeof p.freeCompleteService === 'boolean' && Array.isArray(p.freeTiers) && !denseArrayIssue(p.freeTiers) &&
    p.freeTiers.every(name => auditText(name) && name === name.trim() && Array.isArray(service.tiers) && service.tiers.some(t => t?.name === name)) &&
    new Set(p.freeTiers).size === p.freeTiers.length && isRecord(p.includedPrices) &&
    Object.entries(p.includedPrices).every(([path, includedIn]) => auditText(path) && auditText(includedIn) && path !== includedIn);
  return valid ? includedPathDiagnosticsVNext(service) : [ownerDiagnostic('invalid', 'zero_price_policy', 'zeroPricePolicy', 'Zero-price policy must explicitly bind the persisted service, owner approval, free offerings, and included-price paths.')];
}
export function freeOfferingVNext(service, tierName = null) {
  const p = service.zeroPricePolicy;
  return p !== undefined && zeroPolicyDiagnosticsVNext(service).length === 0 &&
    (tierName === null ? p.freeCompleteService : p.freeTiers.includes(tierName));
}
function corePriceRequirementVNext(item) {
  return ['non_negative_money', 'non_negative_number'].includes(item.kind) &&
    !['haulAwayFee', 'edgingPerLinearFoot', 'baggingSurchargePercent', 'pondingWaterSurcharge'].includes(item.path) && !item.path.endsWith('.disposalFlat');
}
function includedCorePriceVNext(service, pricing, required, path) {
  if (zeroPolicyDiagnosticsVNext(service).length) return false;
  const includedIn = service.zeroPricePolicy?.includedPrices?.[path];
  return typeof includedIn === 'string' && required.some(item => item.path === includedIn && corePriceRequirementVNext(item)) &&
    valueAtPath(pricing, includedIn) > 0;
}

// The caller must load origin from protected persistence and authenticate its owner.
// This helper implements ordinary edits only; it cannot mint a manual replacement.
export function editVNextService(input, changes) {
  const current = snapshotPlainData(input, 'service'), patch = snapshotPlainData(changes, 'changes');
  if (!current.ok || current.nonPlainPaths.length || !patch.ok || patch.nonPlainPaths.length ||
      identityDiagnosticsVNext(current.value).length) throw new TypeError('Ordinary edits require a valid persisted service and plain changes.');
  if (['id', 'serviceType', 'source', 'origin', 'confirmedFields', 'approvedValues'].some(key => Object.hasOwn(patch.value, key))) throw new TypeError('Ordinary edits cannot change persisted identity, origin, or approval receipts.');
  return canonicalServiceIdentityVNext({ ...current.value, ...patch.value });
}

// IDs are one-to-one within a selector. Different selectors may have their own
// registries, but a customer fact must also name its exact field and value.
function offeringRegistryDiagnosticsVNext(field, values) {
  const prepared = activationRegistryChecks.get(values);
  if (prepared?.field === field) return [...prepared.diagnostics];
  const root='knownOfferings.'+field;
  if(!isRecord(values))return [ownerDiagnostic('invalid','known_offerings',root,'Known offerings must be a plain value-to-UUID map.')];
  const out=[],groups=new Map();
  for(const [value,id] of Object.entries(values)){
    if(!CANONICAL_SLUG.test(value)||!validServiceIdVNext(id)){out.push(ownerDiagnostic('invalid','known_offerings',root+'.'+value,'Each offered value requires a canonical slug and valid UUID.'));continue;}
    const key=id.toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push(value);
  }
  for(const values of groups.values())if(values.length>1)for(const value of values)out.push(ownerDiagnostic('invalid','duplicate_offering_id',root+'.'+value,'An offering UUID must identify exactly one value within this selector.'));
  return out;
}
function hasSelectedOfferingPriceVNext(type,c,p,field) {
  const value=c[field], present=(root,...parents)=>{let map=p[root];for(const key of parents)map=isRecord(map)?map[key]:undefined;return isRecord(map)&&Object.hasOwn(map,value);};
  if(type==='ROOFING_REPLACEMENT')return (field==='existingRoofType'?['tearOffPerSquare']:['laborPerSquare','materialCostPerSquare','underlaymentPerSquare']).some(root=>present(root));
  if(type==='ROOFING_REPAIR')return ['repairHours','repairMaterialAllowance'].some(root=>field==='roofType'?present(root):present(root,c.roofType));
  if(type==='FLAT_ROOF_REPLACEMENT')return (field==='membraneType'?['tearOffPerSqft']:['laborPerSqft','membraneCostPerSqft']).some(root=>present(root));
  if(type==='FLAT_ROOF_REPAIR')return ['patchRepairHours','patchMaterialAllowance'].some(root=>field==='membraneType'?present(root):present(root,c.membraneType));
  if(type==='SIDING_REPAIR')return ['repairHours','materialAllowance'].some(root=>present(root,c.sidingType));
  if(type.startsWith('FLOORING_'))return ['removalPerSqft','disposalPerSqft'].some(root=>present(root));
  if(type.startsWith('FENCING_'))return ['laborPerLinearFoot','materialPerLinearFoot','postPrice','gatePrice'].some(root=>present(root));
  if(field==='mulchType')return present('mulchMaterialPerYard');
  return false;
}
