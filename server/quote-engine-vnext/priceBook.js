import {
  CLASS2_DEFINITIONS,
  SERVICE_TYPES,
  allowedPricingFields,
  contractMetadata,
  validateBusinessDefaults,
  validateCustomerInputs,
  validateOwnerPricing,
  validateServiceRules,
  vinylUnderlaymentApplies
} from './contracts.js';
import {
  generateQuoteVNext,
  mergePricingVNext,
  validateTierDefinitionsVNext
} from './engine.js';
import { ownerFieldCopy } from '../priceBookCopy.js';

const AI_SOURCES = new Set(['AI_SUGGESTED', 'AI_INTERVIEW']);

const SERVICE_NAMES = {
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

const NEW_FIELD_COPY = {
  laborPerWallSqftPerCoat: { label: 'Wall painting labor price per measured wall square foot, per coat', help: 'Labor price multiplied by measured paintable wall area and the confirmed number of finish coats.' },
  materialPerWallSqftPerCoat: { label: 'Wall paint material price per measured wall square foot, per coat', help: 'Paint and material price multiplied by measured paintable wall area and the confirmed number of finish coats.' },
  ceilingLaborPerSqftPerCoat: { label: 'Ceiling painting labor price per measured ceiling square foot, per coat', help: 'Labor price used only when ceilings are included, multiplied by measured ceiling area and confirmed coats.' },
  ceilingMaterialPerSqftPerCoat: { label: 'Ceiling paint material price per measured ceiling square foot, per coat', help: 'Paint and material price used only when ceilings are included, multiplied by measured ceiling area and confirmed coats.' },
  exteriorLaborPerSqftPerCoat: { label: 'Exterior painting labor price per measured wall square foot, per applied coat', help: 'Labor price multiplied by measured paintable exterior wall area, finish coats, and any owner-configured primer coats.' },
  starterPerLF: { label: 'Starter strip material price per measured linear foot', help: 'Used only with itemized roof accessories and multiplied by the confirmed starter-strip length.' },
  dripEdgePerLF: { label: 'Drip edge material price per measured linear foot', help: 'Used only with itemized roof accessories and multiplied by the confirmed drip-edge length.' },
  ridgeCapPerLF: { label: 'Ridge cap material price per measured linear foot', help: 'Used only with itemized roof accessories and multiplied by the confirmed ridge-cap length.' },
  postPrice: { label: 'Fence post material price per confirmed planned post', help: 'Applied to the confirmed post count when posts are not included in the per-foot fence material price.' },
  underlaymentPerSquare: { label: 'Installed-area underlayment sell price per roofing square', help: 'Used only when material rates are owner-classified as final sell prices. Cost-based underlayment requires product coverage and purchasable-quantity facts and is held for review.' },
  underlaymentPerSqft: { label: 'Installed-area underlayment sell price per square foot', help: 'Used only when material rates are owner-classified as final sell prices. Cost-based underlayment requires product coverage and purchasable-quantity facts and is held for review.' },
  concretePerPost: { label: 'Concrete + digging cost per post at your local frost/set depth.', help: 'This mixed charge cannot be quoted until separate labor and material prices or an explicit owner-confirmed allocation rule is approved.' },
  gatePrice: { label: "Installed price per gate INCLUDING gate posts' hardware; gate posts themselves are counted below.", help: 'Selected gates remain review-only until the owner approves a measured-width pricing model and rates; the existing per-gate value is not reinterpreted.' },
  trimPerLinearFoot: { label: 'Siding trim installation price per measured linear foot', help: 'Applied only when siding trim is included and multiplied by the confirmed trim length.' },
  subfloorAllowancePerSqft: { label: 'Subfloor repair allowance per measured affected square foot', help: 'Applied only when subfloor issues are reported and only to the measured affected area.' },
  deckingPerSheet: { label: 'Decking replacement price per confirmed sheet', help: 'Applied only when a replacement sheet count is confirmed; an unmeasured decking scope is disclosed rather than fabricated.' },
  roomSizeThresholds: { label: 'Flooring average-room size thresholds', help: 'Defines small and medium average-room area boundaries used by the visible room-complexity labor factor.' },

  vinylPlankUnderlaymentRule: { label: 'Vinyl-plank underlayment rule', help: 'Choose always included, never included, subfloor-condition based, customer-selectable, or owner review.' },
  customPricingMode: { label: 'Custom service pricing structure', help: 'Choose a fixed unit price, a configured unit-price range, or inspection-first pricing.' },
  price: { label: 'Fixed customer price per configured unit', help: 'Final configured amount before any explicitly selected cost-basis markup.' },
  priceBasisByCategory: { label: 'Rate meaning by line category', help: 'State whether each category contains owner cost or final sell price so the engine cannot mark up a sell price twice.' },
  taxabilityByCategory: { label: 'Taxability by line category', help: 'Set the tax treatment for every line category used by this service.' },
  feeRules: { label: 'Common-fee applicability', help: 'Choose when travel, disposal, permit, and overhead charges apply to this service.' }
};

function pricingOf(service) {
  return service?.pricing && typeof service.pricing === 'object' && !Array.isArray(service.pricing)
    ? service.pricing
    : {};
}


function keysOf(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length
    ? Object.keys(value)
    : [fallback];
}

function repairScenarios(serviceType, cube, fallbacks, makeScenario) {
  const affectedAreas = serviceType === 'ROOFING_REPAIR'
    ? { small: 25, medium: 100, large: 250 }
    : { small: 10, medium: 50, large: 100 };
  const out = [];
  for (const first of keysOf(cube, fallbacks[0])) {
    for (const second of keysOf(cube?.[first], fallbacks[1])) {
      for (const size of ['small', 'medium', 'large']) out.push(makeScenario(first, second, affectedAreas[size]));
    }
  }
  return out;
}

function activationScenarios(service) {
  const serviceType = service.serviceType;
  const p = pricingOf(service);
  if (serviceType === 'ROOFING_REPLACEMENT') {
    const replacements = keysOf(p.laborPerSquare, 'asphalt_shingle');
    const existingTypes = keysOf(p.tearOffPerSquare, 'asphalt_shingle');
    return replacements.flatMap(replacement => existingTypes.map(existing => ({
      roofSizeMethod: 'roof_measured', roofSizeInput: 2000,
      existingRoofType: existing, replacementRoofType: replacement,
      pitch: 'medium', stories: 2, existingLayers: 1,
      roofComplexity: 'moderate', serviceScope: 'full',
      ...(p.accessoryPricingMode === 'itemized'
        ? { starterLengthLF: 180, dripEdgeLengthLF: 180, ridgeCapLengthLF: 40 }
        : {}),
      ...(p.deckingPerSheet !== undefined ? { deckingSheets: 1 } : {})
    })));
  }
  if (serviceType === 'ROOFING_REPAIR') {
    return repairScenarios(serviceType, p.repairHours, ['asphalt_shingle', 'patch'], (roofType, repairType, affectedArea) => ({ repairType, affectedArea, roofType, pitch: 'medium', stories: 2, leakPresent: false }));
  }
  if (serviceType === 'FLAT_ROOF_REPLACEMENT') {
    const configured = keysOf(p.laborPerSqft, 'epdm').filter(key => key !== 'average');
    const membraneTypes = configured.length ? configured : ['epdm'];
    const scenarios = membraneTypes.flatMap(membraneType => [
        { roofSqft: 1200, sqftMethod: 'exact', membraneType, existingLayers: 1, accessDifficulty: 'moderate', serviceScope: 'full', buildingType: 'residential' },
        { roofSqft: 1200, sqftMethod: 'exact', membraneType, existingLayers: 1, accessDifficulty: 'moderate', serviceScope: 'full', buildingType: 'commercial' }
      ]);

    return scenarios;
  }
  if (serviceType === 'FLAT_ROOF_REPAIR') {
    return repairScenarios(serviceType, p.patchRepairHours, ['epdm', 'patch'], (membraneType, repairType, affectedArea) => ({ repairType, affectedArea, membraneType, leakPresent: false, pondingWater: false }));
  }
  if (serviceType === 'INTERIOR_PAINTING') return [{ areaInputMethod: 'wall_sqft', wallAreaSqft: 3600, wallHeight: 'high', surfaceCondition: 'good', coats: 2, ceilingsIncluded: true, ceilingAreaSqft: 1200, trimIncluded: true, trimLengthLF: 300 }];
  if (serviceType === 'EXTERIOR_PAINTING') return [{ areaInputMethod: 'wall_sqft', exteriorAreaSqft: 1800, stories: 2, surfaceCondition: 'fair', coats: 2 }];
  if (serviceType === 'FLOORING_INSTALL' || serviceType === 'FLOORING_REPLACEMENT') {
    const flooringTypes = keysOf(p.laborPerSqft, 'tile');
    const removalTypes = p.removalPerSqft && typeof p.removalPerSqft === 'object' ? Object.keys(p.removalPerSqft) : [];
    const replacement = serviceType === 'FLOORING_REPLACEMENT';
    const scenario = (flooringType, existingFloorType, removalNeeded) => ({
      sqft: 600, sqftMethod: 'exact', newFlooringType: flooringType,
      existingFloorType, removalNeeded,
      roomCount: 3, layoutPattern: 'straight', stairSteps: p.perStepPrice !== undefined ? 1 : 0,
      ...(flooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'customer_selectable_addon' ? { underlaymentSelected: true } : {}),
      ...(flooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'subfloor_condition' ? { subfloorCondition: 'requires_underlayment' } : {}),
      ...(replacement ? { subfloorIssues: p.subfloorAllowancePerSqft !== undefined, ...(p.subfloorAllowancePerSqft !== undefined ? { subfloorRepairAreaSqft: 60 } : {}) } : {})
    });
    return [
      ...flooringTypes.map(flooringType => scenario(flooringType, 'none', false)),
      ...removalTypes.map(existingFloorType => scenario(flooringTypes[0], existingFloorType, true))
    ];
  }
  if (serviceType === 'FENCING_INSTALL' || serviceType === 'FENCING_REPLACEMENT') {
    const fenceTypes = keysOf(p.laborPerLinearFoot, 'wood');
    return fenceTypes.map(fenceType => ({ linearFeet: 120, lfMethod: 'exact', fenceType, fenceHeight: 6, gateCount: 1, gateWidthTotalLF: 4, postCount: 20, terrainSlope: 'moderate', ...(serviceType === 'FENCING_REPLACEMENT' ? { oldFenceRemoval: p.removalPerLinearFoot !== undefined } : {}) }));
  }
  if (serviceType === 'CONCRETE_DRIVEWAY' || serviceType === 'CONCRETE_PATIO_SLAB') {
    return [
      { dimensionMethod: 'exact', length: 30, width: 20, thickness: 4, finishType: 'stamped', demolitionNeeded: true, demolitionAreaSqft: 500, reinforcement: 'wire_mesh', accessDifficulty: 'moderate', baseNeeded: true },
      { dimensionMethod: 'measured_area_perimeter', areaSqft: 600, perimeterLF: 110, thickness: 4, finishType: 'broom', demolitionNeeded: false, reinforcement: 'rebar', accessDifficulty: 'easy', baseNeeded: true }
    ];
  }
  if (serviceType === 'LANDSCAPING_CLEANUP') return [{ yardSqft: 3500, sqftMethod: 'exact', debrisLevel: 'moderate', slope: 'moderate', haulAway: true }];
  if (serviceType === 'LANDSCAPING_MULCH') return keysOf(p.mulchMaterialPerYard, 'standard').map(mulchType => ({ inputMethod: 'sqft', mulchArea: 900, mulchDepth: 3, mulchType, bedCondition: 'needs_weeding', bedSqft: 900, edgingNeeded: true, edgeLF: 240 }));
  if (serviceType === 'LANDSCAPING_SOD') return [{ sodSqft: 1200, sqftMethod: 'exact', groundPrepNeeded: true, slope: 'moderate', accessDifficulty: 'moderate' }];
  if (serviceType === 'LANDSCAPING_PLANTING') return keysOf(p.mulchMaterialPerYard, 'standard').map(mulchType => ({ plantsBySize: { small: 4, medium: 4, large: 4 }, bedCondition: 'needs_weeding', bedSqft: 500, mulchNeeded: true, mulchYards: 4, mulchType }));
  if (serviceType === 'LANDSCAPING_MOWING') return [{ yardSqft: 5000, sqftMethod: 'exact', serviceFrequency: 'weekly', grassCondition: 'maintained', bagClippings: false, edgingIncluded: false }];
  if (serviceType === 'SIDING_REPLACEMENT') return keysOf(p.laborPerSqft, 'vinyl').map(sidingType => ({ areaInputMethod: 'sqft', sidingAreaSqft: 1800, sidingType, stories: 2, oldSidingRemoval: true, trimIncluded: true, trimLengthLF: 300 }));
  if (serviceType === 'SIDING_REPAIR') {
    return repairScenarios(serviceType, p.repairHours, ['vinyl', 'minor'], (sidingType, damageLevel, affectedArea) => ({ sidingType, damageLevel, affectedArea, stories: 2 }));
  }
  if (serviceType === 'CUSTOM') return [{ service: service.service, serviceConfirmed: true, unit: p.unit || 'flat', ...({ per_hour: { hours: 4 }, per_unit: { itemCount: 3 }, per_sqft: { areaSqft: 500 }, per_LF: { linearFeet: 120 }, per_square: { roofSquares: 20 } }[p.unit] || {}) }];
  return [];
}

function statusFromErrors(service, errors, missingOwnerFields, invalidOwnerFields) {
  const active = errors.length === 0 && missingOwnerFields.length === 0 && invalidOwnerFields.length === 0;
  return {
    serviceType: service?.serviceType,
    service: service?.service || SERVICE_NAMES[service?.serviceType] || 'Service',
    status: active ? 'QUOTING LIVE' : 'NEEDS PRICING',
    missingOwnerFields: [...new Set(missingOwnerFields)],
    invalidOwnerFields: [...new Set(invalidOwnerFields)],
    validationErrors: [...new Set(errors)]
  };
}

export function vNextServiceStatus(service) {
  if (!service || typeof service !== 'object' || Array.isArray(service)) return statusFromErrors(service, ['Service must be an object.'], [], []);
  if (!SERVICE_TYPES.includes(service.serviceType)) return statusFromErrors(service, ['Service type is unsupported.'], [], ['serviceType']);
  const pricing = pricingOf(service);
  const allowed = new Set(allowedPricingFields(service.serviceType));
  const errors = validateServiceRules(service);
  if (service.active !== true) {
    errors.push('Service is not enabled for customer quoting.');
  }
  const missingOwnerFields = [];
  const invalidOwnerFields = Object.keys(pricing).filter(field => !allowed.has(field));
  if (service.serviceType === 'CUSTOM' && (typeof service.service !== 'string' || !service.service.trim() || service.service.trim() === 'CUSTOM')) {
    errors.push('Custom service requires a specific configured offering name.');
    invalidOwnerFields.push('service');
  }
  const validateEffectivePricing = (effectivePricing, tierName = null) => {
    const prefix = tierName ? `${tierName} tier: ` : '';
    const probeService = { ...service, pricing: effectivePricing };
    for (const customerInputs of activationScenarios(probeService)) {
      const customer = validateCustomerInputs(service.serviceType, customerInputs, effectivePricing);
      if (!customer.ok) {
        errors.push(`${prefix}${customer.reviewReason}`, ...(customer.validationMessages || []).map(message => `${prefix}${message}`));
        if (customer.inspectionFirst) invalidOwnerFields.push(tierName ? `${tierName}.pricing policy` : 'pricing policy');
        continue;
      }
      const owner = validateOwnerPricing(service.serviceType, customerInputs, effectivePricing);
      missingOwnerFields.push(...owner.missingOwnerFields.map(field => tierName ? `${tierName}.${field}` : field));
      invalidOwnerFields.push(...[...owner.invalidOwnerFields, ...owner.unsupportedOwnerFields].map(field => tierName ? `${tierName}.${field}` : field));
      errors.push(...owner.validationMessages.map(message => `${prefix}${message}`));

      const underlaymentPath = service.serviceType === 'ROOFING_REPLACEMENT'
        ? `underlaymentPerSquare.${customerInputs.replacementRoofType}`
        : (service.serviceType.startsWith('FLOORING_') && vinylUnderlaymentApplies(customerInputs, effectivePricing) ? 'underlaymentPerSqft' : null);
      if (underlaymentPath && service.priceBasisByCategory?.material === 'cost') {
        invalidOwnerFields.push(tierName ? `${tierName}.${underlaymentPath}` : underlaymentPath);
        errors.push(`${prefix}Cost-based underlayment requires product-specific coverage and purchasable-quantity information.`);
      }
    }
  };
  validateEffectivePricing(pricing);
  const tierErrors = validateTierDefinitionsVNext(service, service.serviceType);
  errors.push(...tierErrors);
  if (!tierErrors.length && Array.isArray(service.tiers)) {
    for (const tier of service.tiers) {
      validateEffectivePricing(mergePricingVNext(pricing, tier.overrides), tier.name.trim());
    }
  }
  if (AI_SOURCES.has(service.source)) {
    const confirmed = service.confirmedFields && typeof service.confirmedFields === 'object' ? service.confirmedFields : {};
    for (const field of Object.keys(pricing)) if (confirmed[field] !== true) missingOwnerFields.push(field);
    if (Array.isArray(service.tiers) && service.tiers.length && confirmed.tiers !== true) missingOwnerFields.push('tiers');
  }
  return statusFromErrors(service, errors.filter(Boolean), missingOwnerFields, invalidOwnerFields);
}

function serviceIdentity(service) {
  if (!service || typeof service !== 'object' || Array.isArray(service)) return null;
  if (service.serviceType === 'CUSTOM') {
    const name = typeof service.service === 'string' ? service.service.trim().toLowerCase() : '';
    return name ? `CUSTOM:${name}` : null;
  }
  return SERVICE_TYPES.includes(service.serviceType) ? `BUILTIN:${service.serviceType}` : null;
}

export function vNextPricebookStatuses(pricebook) {
  const services = Array.isArray(pricebook?.services) ? pricebook.services : [];
  const defaultValidation = validateBusinessDefaults(pricebook?.defaults || {});
  const globalErrors = [
    ...defaultValidation.missingFields.map(field => `businessDefaults.${field} is required.`),
    ...defaultValidation.errors
  ];
  const identities = services.map(serviceIdentity);
  const counts = new Map();
  for (const identity of identities) if (identity) counts.set(identity, (counts.get(identity) || 0) + 1);

  return services.map((service, index) => {
    const status = vNextServiceStatus(service);
    const duplicateError = identities[index] && counts.get(identities[index]) > 1
      ? 'Price book contains an ambiguous duplicate service definition.'
      : null;
    const validationErrors = [...new Set([
      ...status.validationErrors,
      ...globalErrors,
      duplicateError
    ].filter(Boolean))];
    return validationErrors.length
      ? { ...status, status: 'NEEDS PRICING', validationErrors }
      : status;
  });
}

export function validateVNextPricebook(pricebook) {
  const errors = [];
  if (!pricebook || typeof pricebook !== 'object' || Array.isArray(pricebook)) return { ok: false, errors: ['Price book must be an object.'], statuses: [] };
  if (!Array.isArray(pricebook.services)) return { ok: false, errors: ['Price book services must be an array.'], statuses: [] };
  const defaults = validateBusinessDefaults(pricebook.defaults || {});
  errors.push(...defaults.missingFields.map(field => `businessDefaults.${field} is required.`), ...defaults.errors);
  const statuses = vNextPricebookStatuses(pricebook);
  for (const status of statuses) {
    const prefix = status.serviceType || 'UNKNOWN_SERVICE';
    errors.push(
      ...status.validationErrors.map(error => `${prefix}: ${error}`),
      ...status.missingOwnerFields.map(field => `${prefix}.${field} is required.`),
      ...status.invalidOwnerFields.map(field => `${prefix}.${field} is invalid.`)
    );
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)], statuses };
}

export function quoteFromVNextPricebook({ pricebook, serviceType, customerInputs, callerType = 'owner', feeSelections, currentMonth, allowInactiveOwnerPreview = false }) {
  const services = Array.isArray(pricebook?.services) ? pricebook.services : [];
  const builtIn = SERVICE_TYPES.includes(serviceType) && serviceType !== 'CUSTOM';
  const requestedCustomName = String(serviceType === 'CUSTOM' ? (customerInputs?.service || '') : (serviceType || '')).trim().toLowerCase();
  const matches = builtIn
    ? services.filter(entry => entry?.serviceType === serviceType)
    : services.filter(entry => entry?.serviceType === 'CUSTOM' && typeof entry.service === 'string' && entry.service.trim().toLowerCase() === requestedCustomName);
  const resolvedType = builtIn ? serviceType : 'CUSTOM';
  if (matches.length !== 1) {
    return generateQuoteVNext({
      serviceType: resolvedType,
      customerInputs,
      ownerPricing: { active: false },
      businessDefaults: pricebook?.defaults || {},
      callerType,
      feeSelections,
      currentMonth
    });
  }
  const service = matches[0];
  const status = vNextPricebookStatuses(pricebook)[services.indexOf(service)] || vNextServiceStatus(service);
  return generateQuoteVNext({
    serviceType: service.serviceType,
    customerInputs,
    ownerPricing: { ...service, active: status.status === 'QUOTING LIVE' },
    businessDefaults: pricebook?.defaults || {},
    callerType,
    feeSelections,
    currentMonth,
    allowInactiveOwnerPreview
  });
}

export function previewFromVNextPricebook(input) {
  return quoteFromVNextPricebook({ ...input, callerType: 'owner', allowInactiveOwnerPreview: true });
}

function fieldCopy(serviceType, field) {
  if (NEW_FIELD_COPY[field]) return NEW_FIELD_COPY[field];
  const current = ownerFieldCopy(serviceType, field);
  return {
    label: current.title || current.label,
    help: current.help,
    ...(current.definition ? { definition: current.definition } : {})
  };
}

export function getVNextPriceBookMetadata() {
  return contractMetadata().map(contract => ({
    ...contract,
    service: SERVICE_NAMES[contract.serviceType],
    pricingFields: contract.allowedPricingFields.filter(field => !contract.class2Fields.some(definition => definition.name === field)).map(field => ({ field, ...fieldCopy(contract.serviceType, field) })),
    ruleFields: ['priceBasisByCategory', 'taxabilityByCategory', 'feeRules'].map(field => ({ field, ...NEW_FIELD_COPY[field] })),
    class2Fields: contract.class2Fields.map(definition => ({
      ...definition,
      help: 'This physical quantity assumption is stored per service, editable by the owner, and recorded whenever it affects a quote.'
    }))
  }));
}

export function materializeVNextService(service) {
  const next = structuredClone(service);
  next.pricing ||= {};
  for (const [field, definition] of Object.entries(CLASS2_DEFINITIONS[next.serviceType] || {})) {
    if (next.pricing[field] === undefined) next.pricing[field] = structuredClone(definition.defaultValue);
  }
  return next;
}
