import crypto from 'node:crypto';
import {scopeActivationInputs,scopeDefinitions,scopeKeysForRequest,scopeRateDefinitions,scopeStructureDiagnostics} from './scopePricing.js';
import {OFFERING_TYPES, configuredOffering, offeringContract, offeringActivationScenarios, offeringRateDefinitions} from './configuredOfferings.js';
import {
  CLASS2_DEFINITIONS,
  SERVICE_TYPES,
  aiConfirmationFieldsVNext,
  hasCurrentApprovalVNext,
  freeOfferingVNext,
  validServiceIdVNext,
  canonicalServiceIdentityVNext,
  inspectionOwnerDecisionsVNext,
  allowedPricingFields,
  contractMetadata,
  validateClass2FactorsDetailed,
  validateBusinessDefaults,
  validateCustomerInputs,
  validateOwnerPricing,
  validatePricingStructuresDetailed,
  validateServiceRules,
  validateServiceRulesDetailed,
  vinylUnderlaymentApplies
} from './contracts.js';
import {
  generateQuoteVNext,
  ENGINE_VERSION,
  mergePricingForValidationVNext,
  sanitizeForCustomerVNext,
  validateTierDefinitionsVNext,
  validateTierDefinitionsDetailedVNext
} from './engine.js';
import { QuoteReviewError, calculateServiceVNext } from './templates.js';
import { denseArrayIssue, ownDataValue, snapshotPlainData } from './safeData.js';
import { ownerFieldCopy } from '../priceBookCopy.js';

const AI_SOURCES = new Set(['AI_SUGGESTED', 'AI_INTERVIEW']);
const PRICEBOOK_QUOTE_REQUEST_FIELDS = new Set([
  'pricebook', 'serviceType', 'customerInputs', 'callerType',
  'feeSelections', 'currentMonth', 'allowInactiveOwnerPreview'
]);

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

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
  offeringMode:{label:'Offering pricing',help:'Choose complete installed pricing or itemized measured components for this owner offering.'},
  offeringDetails:{label:'What this offering includes',help:'Define the covered fence or painting scope, with explicit inclusions and separately offered extras.'},
  offeringRates:{label:'Prices for this offering',help:'Owner-entered unit prices. Installed packages and gates are final selling prices. Itemized paint materials use measured-area selling prices.'},
  baggingSurchargePercent: {label:'Clipping bagging and disposal surcharge (%)',help:'Optional extra. Missing pricing keeps the main quote and explicitly excludes clipping bagging and disposal from that option. An explicit zero percentage means this optional scope is free; a positive percentage applies to mowing labor once and replaces common disposal.'},
  edgingPerLinearFoot: {label:'Landscape edging labor price per measured linear foot',help:'Mowing edging is an optional extra: missing pricing keeps the main quote and explicitly excludes lawn edging from that option. Mulch edging remains required scope. An explicit zero rate means the extra is free; a positive rate uses the confirmed edging length.'},
  pondingWaterSurcharge: {label:'Selected ponding-water treatment fixed price',help:'Optional extra. Missing pricing keeps the main quote and explicitly excludes ponding-water treatment from that option. An explicit zero price means this optional scope is free; a positive fixed price is charged once.'},

  disposalScope: {label:'Separate sod-project debris disposal',help:'Only separate_project_debris is supported. Customer separateDisposalSelected must be explicitly true or false. Old-lawn disposal stays included in ground preparation.'},
  knownOfferings: {label:'Explicitly known price-selecting offerings',help:'Register stable offering UUIDs separately from pricing. Matching price-map keys do not establish customer facts.'},
  zeroPricePolicy: {label:'Explicit free offerings and included required prices',help:'Audited service and owner approval is required. Zero core rates without this classification are incomplete; zero minima mean no minimum.'},
  origin: {label:'Immutable service creation receipt',help:'Protected persisted serviceId, serviceType, source, ownerId, operationId, and createdAt; ordinary edits cannot change origin.'},
  materialCostPerSquare: {label:'Roof base material price per square for the selected accessory method',help:'In per_square_allin mode the base includes starter, drip edge, ridge cap, flashing, and vents. In itemized mode the base must EXCLUDE separately priced starter, drip edge, and ridge cap; explicit materialAccessoryBasis confirmation is required before activation.'},
  materialAccessoryBasis: {label:'Base material excludes itemized roof accessories',help:'Confirm excludes_itemized_accessories only after checking the current base rate excludes the separately priced starter, drip edge, and ridge cap. Legacy all-in rates must be re-entered or explicitly reviewed.'},
  mowingBaseRatePerSqft: {label:'Mowing labor cents per measured square foot (fractional cents supported)',help:'Enter cents, including fractional cents: 0.5 cents per square foot is $50 per 10,000 square feet before confirmed frequency and grass-condition adjustments. Existing whole-cent rates retain their units.'},
  laborPerWallSqftPerCoat: { label: 'Wall painting labor price per measured wall square foot, per coat', help: 'Labor price multiplied by measured paintable wall area and the confirmed number of finish coats.' },
  materialPerWallSqftPerCoat: { label: 'Wall paint material price per measured wall square foot, per coat', help: 'Paint and material price multiplied by measured paintable wall area and the confirmed number of finish coats.' },
  ceilingLaborPerSqftPerCoat: { label: 'Ceiling painting labor price per measured ceiling square foot, per coat', help: 'Labor price used only when ceilings are included, multiplied by measured ceiling area and confirmed coats.' },
  ceilingMaterialPerSqftPerCoat: { label: 'Ceiling paint material price per measured ceiling square foot, per coat', help: 'Paint and material price used only when ceilings are included, multiplied by measured ceiling area and confirmed coats.' },
  exteriorLaborPerSqftPerCoat: { label: 'Exterior painting labor price per measured wall square foot, per applied coat', help: 'Labor price multiplied by measured paintable exterior wall area, confirmed finish coats, and the configured story factor. Poor surfaces remain review-only until primer pricing is approved.' },
  starterPerLF: { label: 'Starter strip material price per measured linear foot', help: 'Used only with itemized roof accessories and multiplied by the confirmed starter-strip length.' },
  dripEdgePerLF: { label: 'Drip edge material price per measured linear foot', help: 'Used only with itemized roof accessories and multiplied by the confirmed drip-edge length.' },
  ridgeCapPerLF: { label: 'Ridge cap material price per measured linear foot', help: 'Used only with itemized roof accessories and multiplied by the confirmed ridge-cap length.' },
  postPrice: { label: 'Fence post material price per derived planned post', help: 'Held for review until post quantity can be derived from measured geometry and approved spacing, end, corner, and gate-post rules.' },
  underlaymentPerSquare: { label: 'Installed-area underlayment sell price per roofing square', help: 'Used only when this underlayment rate is owner-classified as a final installed-area sell price. A cost-based underlayment rate requires product coverage and purchasable-quantity facts and is held for review.' },
  underlaymentPerSqft: { label: 'Installed-area underlayment sell price per square foot', help: 'Used only when this underlayment rate is owner-classified as a final installed-area sell price. A cost-based underlayment rate requires product coverage and purchasable-quantity facts and is held for review.' },
  underlaymentPriceBasis: { label: 'Underlayment price basis', help: 'Classifies only the underlayment field. Installed-area sell prices use measured installed area; cost prices remain review-only until package coverage and purchasable quantities are configured.' },
  concretePerPost: { label: 'Concrete + digging cost per post at your local frost/set depth.', help: 'This mixed charge cannot be quoted until separate labor and material prices or an explicit owner-confirmed allocation rule is approved.' },
  gatePrice: { label: "Installed price per gate INCLUDING gate posts' hardware; gate posts themselves are counted below.", help: 'Selected gates remain review-only until the owner approves a measured-width pricing model and rates; the existing per-gate value is not reinterpreted.' },
  trimPerLinearFoot: { label: 'Siding trim installation price per measured linear foot', help: 'Held for owner review until labor and material are separately priced or an explicit category and allocation rule is approved.' },
  subfloorAllowancePerSqft: { label: 'Subfloor repair allowance per measured affected square foot', help: 'Applied only when subfloor issues are reported and only to the measured affected area.' },
  deckingPerSheet: { label: 'Decking replacement price per confirmed sheet', help: 'Applied to confirmed replacement sheets. Only confirmed sell-price units may be disclosed; raw cost units are never customer prices.' },
  roomSizeThresholds: { label: 'Flooring average-room size thresholds', help: 'Average room area below the small threshold uses the small-room labor factor; at or above it uses medium, until the medium threshold. At or above the medium threshold uses large. Defaults: below 150, 150 to under 300, and 300 or more square feet.' },

  vinylPlankUnderlaymentRule: { label: 'Vinyl-plank underlayment rule', help: 'Choose always included, never included, subfloor-condition based, customer-selectable, or owner review.' },
  customPricingMode: { label: 'Custom service pricing structure', help: 'Choose a fixed unit price, a configured unit-price range, or inspection-first pricing.' },
  customChargeClassification: { label: 'Custom service charge category', help: 'Choose the line category for this complete service charge. Its saved price basis, taxability, markup and seasonal settings apply. A final selling price is not marked up again. No labor/material split is inferred.' },
  price: { label: 'Fixed customer price per configured unit', help: 'Final configured amount before any explicitly selected cost-basis markup.' },
  priceBasisByCategory: { label: 'Rate meaning by line category', help: 'State whether each category contains owner cost or final sell price so the engine cannot mark up a sell price twice.' },
  taxabilityByCategory: { label: 'Taxability by line category', help: 'Set the tax treatment for every line category used by this service.' },
  feeRules: { label: 'Common-fee applicability', help: 'Choose when travel, disposal, permit, and overhead charges apply to this service.' }
};

function pricingOf(service) {
  return isPlainRecord(service?.pricing)
    ? service.pricing
    : {};
}

function cloneForStatus(value, fallback = {}) {
  try {
    return structuredClone(value);
  } catch {
    return structuredClone(fallback);
  }
}


function keysOf(value, fallback) {
  return isPlainRecord(value) && Object.keys(value).length
    ? Object.keys(value)
    : [fallback];
}

function greatestConfiguredKey(value, supportedKeys, fallback) {
  if (!isPlainRecord(value)) return fallback;
  const candidates = supportedKeys.filter(key => Object.hasOwn(value, key) && typeof value[key] === 'number' && Number.isFinite(value[key]));
  if (!candidates.length) return fallback;
  return candidates.reduce((greatest, key) => value[key] > value[greatest] ? key : greatest);
}

function flooringRoomBands(pricing) {
  const thresholds = pricing.roomSizeThresholds;
  if (!isPlainRecord(thresholds) ||
      typeof thresholds.smallMaxSqft !== 'number' || !Number.isFinite(thresholds.smallMaxSqft) ||
      typeof thresholds.mediumMaxSqft !== 'number' || !Number.isFinite(thresholds.mediumMaxSqft) ||
      thresholds.smallMaxSqft <= 0 || thresholds.mediumMaxSqft <= thresholds.smallMaxSqft) {
    return [{ sqft: 1_000_000, roomCount: 1 }];
  }
  const scenarioForAverage = average => {
    const roomCount = Math.max(1, Math.min(10_000, Math.floor(1_000_000 / average)));
    return { sqft: average * roomCount, roomCount };
  };
  return [
    scenarioForAverage(thresholds.smallMaxSqft / 2),
    scenarioForAverage((thresholds.smallMaxSqft + thresholds.mediumMaxSqft) / 2),
    { sqft: 1_000_000, roomCount: 1 }
  ];
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

function baseActivationScenarios(service) {
  const serviceType = service.serviceType;
  const p = pricingOf(service);
  if(configuredOffering(serviceType,p))return offeringActivationScenarios(serviceType,p);
  if (serviceType === 'ROOFING_REPLACEMENT') {
    const replacements = keysOf(p.laborPerSquare, 'asphalt_shingle');
    const existingTypes = keysOf(p.tearOffPerSquare, 'asphalt_shingle');
    const pitch = greatestConfiguredKey(p.pitchMultiplier, ['low', 'medium', 'steep', 'very_steep'], 'medium');
    const stories = greatestConfiguredKey(p.storyMultiplier, [1, 2, 3], 2);
    const roofComplexity = greatestConfiguredKey(p.wasteFactorByComplexity, ['simple', 'moderate', 'complex'], 'moderate');
    return replacements.flatMap(replacement => existingTypes.map(existing => ({
      roofSizeMethod: 'roof_measured', roofSizeInput: 1_000_000,
      existingRoofType: existing, replacementRoofType: replacement,
      pitch, stories, existingLayers: 10,
      roofComplexity, serviceScope: 'full',
      ...(p.accessoryPricingMode === 'itemized'
        ? { starterLengthLF: 1_000_000, dripEdgeLengthLF: 1_000_000, ridgeCapLengthLF: 1_000_000 }
        : {}),
      ...(p.deckingPerSheet !== undefined ? { deckingSheets: 100_000 } : {})
    })));
  }
  if (serviceType === 'ROOFING_REPAIR') {
    const pitch = greatestConfiguredKey(p.pitchMultiplier, ['low', 'medium', 'steep', 'very_steep'], 'medium');
    const stories = greatestConfiguredKey(p.storyMultiplier, [1, 2, 3], 2);
    return repairScenarios(serviceType, p.repairHours, ['asphalt_shingle', 'patch'], (roofType, repairType, affectedArea) => ({ repairType, affectedArea, roofType, pitch, stories, leakPresent: false }));
  }
  if (serviceType === 'FLAT_ROOF_REPLACEMENT') {
    const configured = keysOf(p.laborPerSqft, 'epdm').filter(key => key !== 'average');
    const membraneTypes = configured.length ? configured : ['epdm'];
    const accessDifficulty = greatestConfiguredKey(p.accessMultiplier, ['easy', 'moderate', 'difficult'], 'moderate');
    const configuredExistingTypes = keysOf(p.tearOffPerSqft,'epdm').filter(key=>key!=='average');
    const existingTypes = configuredExistingTypes.length ? configuredExistingTypes : membraneTypes;
    const scenarios = membraneTypes.flatMap(replacementMembraneType=>existingTypes.map(membraneType=>({roofSqft:2_000_000,sqftMethod:'exact',membraneType,replacementMembraneType,existingLayers:10,accessDifficulty,serviceScope:'full',buildingType:'residential'})));

    return scenarios;
  }
  if (serviceType === 'FLAT_ROOF_REPAIR') {
    const base = repairScenarios(serviceType, p.patchRepairHours, ['epdm', 'patch'], (membraneType, repairType, affectedArea) => ({ repairType, affectedArea, membraneType, leakPresent: false, pondingWater: false }));
    // Probe optional treatment when configured; real selected requests always
    // require its price. An unpriced extra does not disable complete base repairs.
    return [undefined, null, ''].includes(p.pondingWaterSurcharge) ? base : base.flatMap(inputs => [
      inputs,
      { ...inputs, pondingWater: true }
    ]);
  }
  if (serviceType === 'INTERIOR_PAINTING') {
    const wallHeight = greatestConfiguredKey(p.wallHeightLaborMultiplier, ['standard', 'high', 'vaulted'], 'high');
    return [{ areaInputMethod: 'wall_sqft', wallAreaSqft: 2_000_000, wallHeight, wallScopeUniform: true, surfaceCondition: 'good', coats: 3, ceilingsIncluded: true, ceilingAreaSqft: 1_000_000, ceilingCoats: 3, trimIncluded: true, trimLengthLF: 1_000_000 }];
  }
  if (serviceType === 'EXTERIOR_PAINTING') {
    const stories = greatestConfiguredKey(p.storyMultiplier, [1, 2, 3], 2);
    return [{ areaInputMethod: 'wall_sqft', exteriorAreaSqft: 2_000_000, stories, surfaceCondition: 'fair', coats: 3 }];
  }
  if (serviceType === 'FLOORING_INSTALL' || serviceType === 'FLOORING_REPLACEMENT') {
    const flooringTypes = keysOf(p.laborPerSqft, 'tile');
    const removalTypes = isPlainRecord(p.removalPerSqft) ? Object.keys(p.removalPerSqft) : [];
    const replacement = serviceType === 'FLOORING_REPLACEMENT';
    const layoutPattern = greatestConfiguredKey(p.patternWasteAdder, ['straight', 'diagonal_or_pattern'], 'diagonal_or_pattern');
    const roomBands = flooringRoomBands(p);
    const scenario = (flooringType, existingFloorType, removalNeeded, roomBand) => ({
      sqft: roomBand.sqft, sqftMethod: 'exact', newFlooringType: flooringType,
      existingFloorType, removalNeeded, ...(removalNeeded?{removalAreaSqft:roomBand.sqft}:{}),
      roomCount: roomBand.roomCount, layoutPattern, stairSteps: 0,
      ...(flooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'customer_selectable_addon' ? { underlaymentSelected: true } : {}),
      ...(flooringType === 'vinyl_plank' && p.vinylPlankUnderlaymentRule === 'subfloor_condition' ? { subfloorCondition: 'requires_underlayment' } : {}),
      ...(replacement ? { subfloorIssues: p.subfloorAllowancePerSqft !== undefined, ...(p.subfloorAllowancePerSqft !== undefined ? { subfloorRepairAreaSqft: roomBand.sqft } : {}) } : {})
    });
    return flooringTypes.flatMap(flooringType => roomBands.flatMap(roomBand => [
      scenario(flooringType, 'none', false, roomBand),
      ...removalTypes.map(existingFloorType => scenario(flooringType, existingFloorType, true, roomBand))
    ]));
  }
  if (serviceType === 'FENCING_INSTALL' || serviceType === 'FENCING_REPLACEMENT') {
    const fenceTypes = keysOf(p.laborPerLinearFoot, 'wood');
    return fenceTypes.map(fenceType => ({ linearFeet: 120, lfMethod: 'exact', fenceType, fenceHeight: 6, gateCount: 0, terrainSlope: 'moderate', ...(serviceType === 'FENCING_REPLACEMENT' ? { oldFenceRemoval: p.removalPerLinearFoot !== undefined } : {}) }));
  }
  if (serviceType === 'CONCRETE_DRIVEWAY' || serviceType === 'CONCRETE_PATIO_SLAB') {
    const accessDifficulty = greatestConfiguredKey(p.accessMultiplier, ['easy', 'moderate', 'difficult'], 'moderate');
    const dimensions = [
      { dimensionMethod: 'exact', length: 10_000, width: 1_000 },
      // Measured synthetic comb: base 200000*20 plus four fingers totals
      // exactly 10,000,000 sqft; base perimeter plus twice finger heights is 1,000,000 LF.
      { dimensionMethod:'measured_outline', outlinePoints:[
        {x:-100000,y:-20},{x:100000,y:-20},{x:100000,y:0},
        {x:4020,y:0},{x:4020,y:74995},{x:4000,y:74995},{x:4000,y:0},
        {x:3020,y:0},{x:3020,y:74995},{x:3000,y:74995},{x:3000,y:0},
        {x:2019,y:0},{x:2019,y:74795},{x:2000,y:74795},{x:2000,y:0},
        {x:1021,y:0},{x:1021,y:75195},{x:1000,y:75195},{x:1000,y:0},
        {x:-100000,y:0},{x:-100000,y:-20}
      ] }
    ];
    return dimensions.flatMap(dimension => ['broom', 'smooth', 'stamped'].flatMap(finishType => ['none', 'wire_mesh', 'rebar'].map(reinforcement => ({
      ...dimension, thickness: 24, finishType,
      demolitionNeeded: false,
      reinforcement, accessDifficulty, baseNeeded: true
    }))));
  }
  if (serviceType === 'LANDSCAPING_CLEANUP') {
    const slope = greatestConfiguredKey(p.slopeMultiplier, ['flat', 'moderate', 'steep'], 'moderate');
    return ['light', 'moderate', 'heavy'].map(debrisLevel => ({ yardSqft: 10_000_000, sqftMethod: 'exact', debrisLevel, slope, haulAway: true }));
  }
  if (serviceType === 'LANDSCAPING_MULCH') return keysOf(p.mulchMaterialPerYard, 'standard').flatMap(mulchType => ['needs_weeding', 'overgrown'].flatMap(bedCondition => [
    { inputMethod: 'sqft', mulchArea: 10_000_000, mulchDepth: 24, mulchType, bedCondition, bedSqft: 10_000_000, edgingNeeded: true, edgeLF: 1_000_000 },
    { inputMethod: 'yards', mulchArea: 10_000_000, mulchType, bedCondition, bedSqft: 10_000_000, edgingNeeded: true, edgeLF: 1_000_000 }
  ]));
  if (serviceType === 'LANDSCAPING_SOD') {
    const slope = greatestConfiguredKey(p.slopeMultiplier, ['flat', 'moderate', 'steep'], 'moderate');
    const accessDifficulty = greatestConfiguredKey(p.accessMultiplier, ['easy', 'moderate', 'difficult'], 'moderate');
    const scenario = { sodSqft: 10_000_000, sqftMethod: 'exact', groundPrepNeeded: true, slope, accessDifficulty };
    return service.disposalScope === 'separate_project_debris'
      ? [false, true].map(separateDisposalSelected => ({ ...scenario, separateDisposalSelected }))
      : [scenario];
  }
  if (serviceType === 'LANDSCAPING_PLANTING') return keysOf(p.mulchMaterialPerYard, 'standard').flatMap(mulchType => ['needs_weeding', 'overgrown'].map(bedCondition => ({ plantsBySize: { small: 1_000_000, medium: 1_000_000, large: 1_000_000 }, bedCondition, bedSqft: 10_000_000, mulchNeeded: true, mulchYards: 100_000, mulchType })));
  if (serviceType === 'LANDSCAPING_MOWING') {
    const serviceFrequency = greatestConfiguredKey(p.frequencyMultipliers, ['weekly', 'biweekly', 'monthly', 'one_time'], 'weekly');
    const grassCondition = greatestConfiguredKey(p.overgrowthMultipliers, ['maintained', 'overgrown', 'severe'], 'maintained');
    const base = { yardSqft: 10_000_000, sqftMethod: 'exact', serviceFrequency, grassCondition, bagClippings: false, edgingIncluded: false };
    const bagClippings = ![undefined, null, ''].includes(p.baggingSurchargePercent);
    const edgingIncluded = ![undefined, null, ''].includes(p.edgingPerLinearFoot);
    return !bagClippings && !edgingIncluded ? [base] : [base, {
      ...base, bagClippings, edgingIncluded, ...(edgingIncluded ? { edgingLengthLF: 1_000_000 } : {})
    }];
  }
  if (serviceType === 'SIDING_REPLACEMENT') {
    const stories = greatestConfiguredKey(p.storyMultiplier, [1, 2, 3], 2);
    return keysOf(p.laborPerSqft, 'vinyl').map(sidingType => ({ areaInputMethod: 'sqft', sidingAreaSqft: 2_000_000, sidingType, stories, oldSidingRemoval: false, trimIncluded: false }));
  }
  if (serviceType === 'SIDING_REPAIR') {
    const stories = greatestConfiguredKey(p.storyMultiplier, [1, 2, 3], 2);
    return repairScenarios(serviceType, p.repairHours, ['vinyl', 'minor'], (sidingType, damageLevel, affectedArea) => ({ sidingType, damageLevel, affectedArea, stories }));
  }
  if (serviceType === 'CUSTOM') return [{ service: service.service, serviceConfirmed: true, unit: p.unit || 'flat', ...({ per_hour: { hours: 4 }, per_unit: { itemCount: 3 }, per_sqft: { areaSqft: 500 }, per_LF: { linearFeet: 120 }, per_square: { roofSquares: 20 } }[p.unit] || {}) }];
  return [];
}

function activationScenarios(service) {
 const scenarios=baseActivationScenarios(service),p=pricingOf(service),type=service.serviceType,extra=[];
 const add=changes=>{if(scenarios[0])extra.push({...scenarios[0],...changes});};
 if(type.startsWith('FLOORING_')){
  if(p.scopeDetails?.stairs){const seed=scenarios.find(c=>c.newFlooringType===p.scopeDetails.stairs.flooringType&&!c.removalNeeded);if(seed)extra.push({...seed,stairSteps:5});}
  if(p.scopeDetails?.floor_overlay){const d=p.scopeDetails.floor_overlay,seed=scenarios.find(c=>c.newFlooringType===d.newFlooringType&&!c.removalNeeded);if(seed)extra.push({...seed,existingFloorType:d.existingFloorType});}
 }
 if(type==='SIDING_REPLACEMENT'){
  if(p.scopeDetails?.siding_trim)add({trimIncluded:true,trimLengthLF:200});
  if(p.scopeDetails?.siding_removal)add({oldSidingRemoval:true});
 }
 if(type.startsWith('CONCRETE_')){
  if(p.scopeDetails?.demolition)add({demolitionNeeded:true,demolitionAreaSqft:200});
  if(p.scopeDetails?.exposed_aggregate)add({finishType:'exposed_aggregate'});
 }
 if(type==='FLAT_ROOF_REPLACEMENT'&&p.scopeDetails?.insulation)add({buildingType:'commercial'});
 return [...scenarios,...extra];
}

function uniqueStatusDiagnostics(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.type}:${item.kind || ''}:${item.path}:${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function scopeCoverageForService(service) {
  if (!service || !SERVICE_TYPES.includes(service.serviceType) || validateTierDefinitionsDetailedVNext(service, service.serviceType).length) return [];
  const type = service.serviceType, base = pricingOf(service);
  const variants = service.tiers?.length ? service.tiers.map(t => ({ name: t.name, pricing: mergePricingForValidationVNext(base, t.overrides || {}) })) : [{ name: null, pricing: base }];
  const rows = new Map();
  for (const variant of variants) {
    const p = variant.pricing, definitions = scopeDefinitions(type, p);
    for (const [key, definition] of Object.entries(definitions)) {
      const floor = key.startsWith('floor_underlayment_') ? key.slice('floor_underlayment_'.length) : undefined;
      const roof = key.startsWith('roof_underlayment_') ? key.slice('roof_underlayment_'.length) : undefined;
      const probe = { existingFloorType: 'none', ...(floor ? { newFlooringType: floor, underlaymentSelected: true, subfloorCondition: 'requires_underlayment' } : {}), ...(roof ? { replacementRoofType: roof } : {}) };
      if (key === 'stairs') Object.assign(probe, { stairSteps: 1, newFlooringType: p.scopeDetails?.stairs?.flooringType });
      if (key === 'floor_overlay') Object.assign(probe, { removalNeeded: false, existingFloorType: p.scopeDetails?.floor_overlay?.existingFloorType || 'existing_floor' });
      if (key === 'siding_removal') probe.oldSidingRemoval = true;
      if (key === 'siding_trim') probe.trimIncluded = true;
      if (key === 'demolition') probe.demolitionNeeded = true;
      if (key === 'exposed_aggregate') probe.finishType = 'exposed_aggregate';
      if (key === 'insulation') probe.buildingType = 'commercial';
      if (key === 'paint_prep') probe.prepAreaSqft = 1;
      if (key.includes('ceiling')) { if (type !== 'INTERIOR_PAINTING' || p.offeringMode && p.offeringDetails?.ceilingsOffered !== true) continue; probe.ceilingsIncluded = true; }
      if (key === 'paint_trim') { if (type !== 'INTERIOR_PAINTING') continue; probe.trimIncluded = true; }
      if (!scopeKeysForRequest(type, probe, p, service).includes(key)) continue;
      const rates = Object.entries(scopeRateDefinitions(type, p)).filter(([, field]) => field.scopeKey === key).map(([name]) => 'scopeRates.' + name);
      const related = d => d.path === 'scopeDetails' || d.path === 'scopeRates' || d.path === 'scopeDetails.' + key || d.path?.startsWith('scopeDetails.' + key + '.') || rates.includes(d.path);
      const errors = [...scopeStructureDiagnostics(type, p), ...validateOwnerPricing(type, scopeActivationInputs(type, probe, p, service), p, service, variant.name).ownerDiagnostics].filter(related);
      const complete = isPlainRecord(p.scopeDetails?.[key]) && rates.length > 0 && errors.length === 0;
      if (!rows.has(key)) rows.set(key, { key, label: definition.label, configurationComplete: false, variants: [] });
      const row = rows.get(key); row.configurationComplete ||= complete; row.variants.push({ tierName: variant.name, configurationComplete: complete, missingFields: [...new Set(errors.map(d => d.path))] });
    }
  }
  return [...rows.values()].map(row => ({ ...row, message: row.configurationComplete
    ? 'Scope configured. Matching measured requests can quote when the required pricing and saved approval are complete.' + (row.variants.some(v => !v.configurationComplete) ? ' Some price options still need scope setup.' : '')
    : row.label + ' requests arrive as leads until you configure this scope and its prices.' }));
}

function statusFromDiagnostics(service, diagnostics, failedTierDiagnostics = [], validTierNames = []) {
  const blocking = uniqueStatusDiagnostics(diagnostics);
  const live = service?.active === true && blocking.length === 0 && validTierNames.length > 0;
  const invalidTypes = new Set(['invalid', 'unsupported', 'cross_field', 'owner_decision']);
  return {
    serviceType: service?.serviceType,
    service: service?.service || SERVICE_NAMES[service?.serviceType] || 'Service',
    scopeCoverage: scopeCoverageForService(service),
    status: live ? 'QUOTING LIVE' : 'NEEDS PRICING',
    missingOwnerFields: [...new Set(blocking.filter(item => item.type === 'missing').map(item => item.path))],
    invalidOwnerFields: [...new Set(blocking.filter(item => invalidTypes.has(item.type)).map(item => item.path))],
    unsupportedOwnerFields: [...new Set(blocking.filter(item => item.type === 'unsupported').map(item => item.path))],
    crossFieldOwnerFields: [...new Set(blocking.filter(item => item.type === 'cross_field').map(item => item.path))],
    ownerDecisionRequired: blocking.filter(item => item.type === 'owner_decision').map(({ path, kind, message }) => ({ path, kind, message })),
    ownerDiagnostics: blocking,
    validationErrors: [...new Set(blocking.map(item => item.message))],
    failedTierDiagnostics,
    validTierNames,
    ...(live && failedTierDiagnostics.length ? { optionAvailabilityNotice: 'Fewer options are available because one or more configured options need owner review.' } : {})
  };
}

function activationFeeSelections(service) {
  const selections = { owner: {}, customer: {} };
  for (const fee of ['travel', 'disposal', 'permit', 'overhead']) {
    const mode = service.feeRules?.[fee];
    if (mode === 'owner_selected') selections.owner[fee] = true;
    if (mode === 'customer_selected') selections.customer[fee] = true;
  }
  return selections;
}

function appendActivationReviewDiagnostics(diagnostics, result) {
  const before = diagnostics.length;
  const message = result.reviewReason || 'Activation scenario could not complete the quote pipeline safely.';
  diagnostics.push(...(result.ownerDiagnostics || []).map(item => ({ ...item, kind: item.kind || 'activation_pipeline' })));
  for (const path of result.missingOwnerFields || []) diagnostics.push({ type: 'missing', kind: 'activation_pipeline', path, message });
  for (const path of result.invalidOwnerFields || []) diagnostics.push({ type: 'invalid', kind: 'activation_pipeline', path, message });
  for (const path of result.unsupportedOwnerFields || []) diagnostics.push({ type: 'unsupported', kind: 'activation_pipeline', path, message });
  for (const path of result.crossFieldOwnerFields || []) diagnostics.push({ type: 'cross_field', kind: 'activation_pipeline', path, message });
  for (const path of result.missingCustomerFields || []) diagnostics.push({ type: 'missing', kind: 'activation_scenario', path: `customerInputs.${path}`, message });
  for (const path of result.invalidCustomerFields || []) diagnostics.push({ type: 'invalid', kind: 'activation_scenario', path: `customerInputs.${path}`, message });
  for (const decision of result.ownerDecisionRequired || []) diagnostics.push({ type: 'owner_decision', kind: decision.kind, path: decision.path, message: decision.message });
  if (result.inspectionFirst && diagnostics.length === before) diagnostics.push({ type: 'invalid', kind: 'pricing_policy', path: 'pricingPolicy', message });
  if (diagnostics.length === before) diagnostics.push({ type: 'invalid', kind: 'activation_pipeline', path: 'pricingCalculation', message });
}

function activationMonth(service, defaults) {
  const months = service.peakMonths !== undefined ? service.peakMonths : defaults.peakMonths;
  return Array.isArray(months) && months.length ? months[0] : 1;
}

function evaluateActivationVariant(service, effectivePricing, tierName, tierIndex, businessDefaults) {
  const diagnostics = [];
  const scenarios = activationScenarios({ ...service, pricing: effectivePricing });
  if (!scenarios.length) diagnostics.push({ type: 'invalid', kind: 'activation_scenario', path: 'pricingPolicy', message: 'No activation scenario is available for this configured service.' });
  const allowed = new Set(allowedPricingFields(service.serviceType));
  for (const key of Object.keys(effectivePricing)) {
    if (!allowed.has(key)) diagnostics.push({ type: 'unsupported', kind: 'field', path: key, message: 'This pricing field is not supported for the selected service.' });
  }
  diagnostics.push(
    ...validatePricingStructuresDetailed(service.serviceType, effectivePricing),
    ...validateClass2FactorsDetailed(service.serviceType, effectivePricing)
  );
  for (const scenarioInputs of scenarios) {
    const customerInputs = { ...scopeActivationInputs(service.serviceType,scenarioInputs,effectivePricing,service), ...(service.feeRules?.permit==='when_scope_selected'?{permitRequired:true}:{}) };
    // Synthetic activation probes test only explicitly registered offerings. They
    // establish no facts about a real customer project.
    const confirmations = Object.fromEntries(Object.entries(service.knownOfferings || {}).filter(([field, values]) => Object.hasOwn(values, customerInputs[field])).map(([field, values]) => [field, { status: 'identified', field, value: customerInputs[field], offeringId: values[customerInputs[field]] }]));
    if (Object.keys(confirmations).length) customerInputs.confirmedFacts = confirmations;
    const customer = validateCustomerInputs(service.serviceType, customerInputs, effectivePricing, service);
    if (!customer.ok) {
      for (const path of customer.missingOwnerFields || []) diagnostics.push({type:'missing',kind:'known_offerings',path,message:customer.reviewReason});
      for (const path of customer.invalidOwnerFields || []) diagnostics.push({type:'invalid',kind:'known_offerings',path,message:customer.reviewReason});
      for (const path of customer.missingCustomerFields || []) diagnostics.push({ type: 'missing', kind: 'activation_scenario', path: `customerInputs.${path}`, message: customer.reviewReason });
      for (const path of customer.invalidCustomerFields || []) diagnostics.push({ type: 'invalid', kind: 'activation_scenario', path: `customerInputs.${path}`, message: customer.reviewReason });
      if (customer.inspectionFirst) diagnostics.push({ type: 'invalid', kind: 'pricing_policy', path: 'pricingPolicy', message: customer.reviewReason });
      continue;
    }
    const owner = validateOwnerPricing(service.serviceType, customerInputs, effectivePricing, service, tierName);
    diagnostics.push(...owner.ownerDiagnostics);
    if (!owner.ok) continue;
    try {
      const template = calculateServiceVNext(service.serviceType, customer.normalized, effectivePricing, { ownerPricing: service, tierName, skipAddon() {} });
      const subtotalCents = template.lineItems.reduce((sum, line) => sum + line.amountCents, 0);
      if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0) {
        throw new QuoteReviewError('Activation scenario produced an unsafe service subtotal.', { invalidOwnerFields: ['pricingCalculation'] });
      }
      if (businessDefaults) {
        const pipelineResult = generateQuoteVNext({
          serviceType: service.serviceType,
          customerInputs: customer.normalized,
          ownerPricing: { ...service, active: true, pricing: effectivePricing, tiers: [],
            ...(service.zeroPricePolicy ? {zeroPricePolicy:{...service.zeroPricePolicy,freeCompleteService:freeOfferingVNext(service,tierName),freeTiers:[]}} : {}),
            ...(service.confirmedFields ? {confirmedFields:Object.fromEntries(Object.entries(service.confirmedFields).filter(([key])=>key!=='tiers'))}:{}),
            ...(service.approvedValues ? {approvedValues:Object.fromEntries(Object.entries(service.approvedValues).filter(([key])=>key!=='tiers'))}:{}) },
          businessDefaults,
          callerType: 'owner',
          feeSelections: activationFeeSelections(service),
          currentMonth: activationMonth(service, businessDefaults),
          allowInactiveOwnerPreview: true
        });
        if (pipelineResult.resultType !== 'INSTANT_ESTIMATE_READY') appendActivationReviewDiagnostics(diagnostics, pipelineResult);
      }
    } catch (error) {
      if (!(error instanceof QuoteReviewError)) {
        diagnostics.push({ type: 'invalid', kind: 'activation_calculation', path: 'pricingCalculation', message: 'Activation scenario could not be calculated safely.' });
        continue;
      }
      const before = diagnostics.length;
      for (const path of error.missingOwnerFields || []) diagnostics.push({ type: 'missing', kind: 'activation_calculation', path, message: error.reviewReason });
      for (const path of error.invalidOwnerFields || []) diagnostics.push({ type: 'invalid', kind: 'activation_calculation', path, message: error.reviewReason });
      for (const path of [...(error.unsupportedOwnerFields || []), ...(error.unexpectedOwnerFields || [])]) diagnostics.push({ type: 'unsupported', kind: 'activation_calculation', path, message: error.reviewReason });
      for (const path of error.crossFieldOwnerFields || []) diagnostics.push({ type: 'cross_field', kind: 'activation_calculation', path, message: error.reviewReason });
      for (const path of error.invalidCustomerFields || []) diagnostics.push({ type: 'invalid', kind: 'activation_scenario', path: `customerInputs.${path}`, message: error.reviewReason });
      for (const decision of error.ownerDecisionRequired || []) diagnostics.push({ type: 'owner_decision', kind: decision.kind, path: decision.path, message: decision.message });
      if (diagnostics.length === before) diagnostics.push({ type: 'invalid', kind: 'activation_calculation', path: 'pricingCalculation', message: error.reviewReason });
    }
  }
  const unique = uniqueStatusDiagnostics(diagnostics);
  return {
    ok: unique.length === 0,
    tierName,
    tierIndex,
    diagnostics: unique,
    reviewReason: unique[0]?.message || null
  };
}

export function vNextServiceStatus(service, businessDefaults = null) {
  const snapshot = snapshotPlainData(service, 'service');
  if (!snapshot.ok) return statusFromDiagnostics(null, [{
    type: 'invalid', kind: 'service', path: snapshot.errorPath,
    message: `Service could not be read safely: ${snapshot.reason}.`
  }]);
  const blockingServicePath = snapshot.nonPlainPaths[0];
  if (blockingServicePath) {
    let path = blockingServicePath;
    if (path.startsWith('service.pricing.')) {
      path = path.slice('service.pricing.'.length);
    } else if (path.startsWith('service.')) {
      path = path.slice('service.'.length);
    }
    return statusFromDiagnostics(null, [
      { type: 'invalid', kind: 'service', path, message: `${path} must be a plain data value.` }
    ]);
  }
  service = snapshot.value;
  if (!isPlainRecord(service)) return statusFromDiagnostics(service, [{ type: 'invalid', kind: 'service', path: 'service', message: 'Service must be an object.' }]);
  service = canonicalServiceIdentityVNext(service);
  if (!SERVICE_TYPES.includes(service.serviceType)) return statusFromDiagnostics(service, [{ type: 'invalid', kind: 'service', path: 'serviceType', message: 'Service type is unsupported.' }]);
  const pricing = pricingOf(service);
  const defaultValidation = businessDefaults === null || businessDefaults === undefined
    ? {
        ok: false,
        diagnostics: [{ type: 'missing', kind: 'business_default', path: 'businessDefaults', message: 'Complete business defaults are required before quoting can be live.' }]
      }
    : validateBusinessDefaults(businessDefaults);
  const defaultDiagnostics = defaultValidation.diagnostics.map(item => ({
    ...item,
    path: item.path === 'businessDefaults' || item.path.startsWith('businessDefaults.')
      ? item.path
      : `businessDefaults.${item.path}`
  }));
  const diagnostics = [...validateServiceRulesDetailed(service, service.serviceType), ...defaultDiagnostics];
  if (service.active !== true) diagnostics.push({ type: 'invalid', kind: 'activation', path: 'active', message: 'Service is not enabled for customer quoting.' });
  if (service.serviceType === 'CUSTOM' && (typeof service.service !== 'string' || !service.service.trim() || service.service.trim() === 'CUSTOM')) diagnostics.push({ type: 'invalid', kind: 'service', path: 'service', message: 'Custom service requires a specific configured offering name.' });

  const tierDefinitionDiagnostics = validateTierDefinitionsDetailedVNext(service, service.serviceType);
  diagnostics.push(...tierDefinitionDiagnostics);
  if (AI_SOURCES.has(service.source)) {
    const confirmed = isPlainRecord(service.confirmedFields) ? service.confirmedFields : {};
    for (const field of aiConfirmationFieldsVNext(service, pricing)) {
      if (!hasCurrentApprovalVNext(service, pricing, field)) diagnostics.push({ type: 'missing', kind: 'ai_confirmation', path: `confirmedFields.${field}`, message: `${field} must be individually confirmed before customer quoting.` });
    }
  }

  if (tierDefinitionDiagnostics.length) return statusFromDiagnostics(service, diagnostics);
  const tierEntries = Array.isArray(service.tiers) && service.tiers.length
    ? service.tiers.map((tier, index) => ({ tier, index }))
    : [{ tier: { name: null, overrides: {} }, index: null }];
  const variants = tierEntries.map(({ tier, index }) => {
    try {
      return evaluateActivationVariant(service, mergePricingForValidationVNext(pricing, tier.overrides || {}), tier.name, index, defaultValidation.ok ? businessDefaults : null);
    } catch {
      const path = index === null ? 'pricing' : `tiers.${index}.overrides`;
      return {
        ok: false,
        tierName: tier.name,
        tierIndex: index,
        diagnostics: [{ type: 'invalid', kind: 'tier_pricing', path, message: 'Tier pricing contains values that cannot be validated safely.' }],
        reviewReason: 'Tier pricing contains values that cannot be validated safely.'
      };
    }
  });
  const validVariants = variants.filter(variant => variant.ok);
  const failedTierDiagnostics = variants.filter(variant => !variant.ok).map(variant => ({
    tierName: variant.tierName,
    reviewReason: variant.reviewReason,
    missingOwnerFields: [...new Set(variant.diagnostics.filter(item => item.type === 'missing').map(item => item.path))],
    invalidOwnerFields: [...new Set(variant.diagnostics.filter(item => ['invalid', 'unsupported', 'cross_field', 'owner_decision'].includes(item.type)).map(item => item.path))],
    unsupportedOwnerFields: [...new Set(variant.diagnostics.filter(item => item.type === 'unsupported').map(item => item.path))],
    crossFieldOwnerFields: [...new Set(variant.diagnostics.filter(item => item.type === 'cross_field').map(item => item.path))],
    ownerDiagnostics: variant.diagnostics,
    ownerDecisionRequired: variant.diagnostics.filter(item => item.type === 'owner_decision').map(({ path, kind, message }) => ({ path, kind, message })),
    validationMessages: variant.diagnostics.map(item => item.message)
  }));
  if (!validVariants.length) diagnostics.push(...variants.flatMap(variant => variant.diagnostics));
  return statusFromDiagnostics(service, diagnostics, failedTierDiagnostics, validVariants.map(variant => variant.tierName));
}
function serviceIdentity(service) {
  if (!isPlainRecord(service)) return null;
  if (service.serviceType === 'CUSTOM') {
    const name = typeof service.service === 'string' ? service.service.trim().toLowerCase() : '';
    return name ? `CUSTOM:${name}` : null;
  }
  return SERVICE_TYPES.includes(service.serviceType) ? `BUILTIN:${service.serviceType}` : null;
}

export function vNextPricebookStatuses(pricebook) {
  if (!isPlainRecord(pricebook)) return [];
  const snapshot = snapshotPlainData(pricebook, 'pricebook');
  if (!snapshot.ok) return [statusFromDiagnostics(null, [{
    type: 'invalid', kind: 'pricebook', path: snapshot.errorPath,
    message: `Price book could not be read safely: ${snapshot.reason}.`
  }])];
  const blockingPricebookPath = snapshot.nonPlainPaths[0];
  if (blockingPricebookPath) {
    const path = blockingPricebookPath;
    return [statusFromDiagnostics(null, [{
      type: 'invalid', kind: 'pricebook', path,
      message: `${path} must be a plain data value.`
    }])];
  }
  pricebook = snapshot.value;
  const services = isPlainRecord(pricebook) && Array.isArray(pricebook.services) ? pricebook.services : [];
  const servicesIssue = denseArrayIssue(services);
  if (servicesIssue) {
    const path = servicesIssue.path ? `pricebook.services.${servicesIssue.path}` : 'pricebook.services';
    return [statusFromDiagnostics(null, [{
      type: 'invalid', kind: 'pricebook_services', path,
      message: `Price book services are invalid at ${path}: ${servicesIssue.reason}.`
    }])];
  }
  const defaultSource = isPlainRecord(pricebook) && Object.hasOwn(pricebook, 'defaults') ? pricebook.defaults : {};
  const defaultValidation = validateBusinessDefaults(defaultSource);
  const defaultDiagnostics = defaultValidation.diagnostics.map(item => ({
    ...item,
    path: item.path === 'businessDefaults' || item.path.startsWith('businessDefaults.') ? item.path : `businessDefaults.${item.path}`
  }));
  const identities = Array.from(services, serviceIdentity);
  const counts = new Map();
  for (const identity of identities) if (identity) counts.set(identity, (counts.get(identity) || 0) + 1);

  const duplicateIds = duplicateServiceIdDiagnostics(services);
  return Array.from(services, (service, index) => {
    const status = vNextServiceStatus(service, defaultSource);
    const duplicateDiagnostics = identities[index] && counts.get(identities[index]) > 1
      ? [{ type: 'invalid', kind: 'duplicate_service', path: `services.${index}`, message: 'Price book contains an ambiguous duplicate service definition.' }]
      : [];
    const diagnostics = uniqueStatusDiagnostics([...status.ownerDiagnostics, ...defaultDiagnostics, ...duplicateDiagnostics, ...duplicateIds.filter(d=>d.path===`services.${index}.id`)]);
    const invalidTypes = new Set(['invalid', 'unsupported', 'cross_field', 'owner_decision']);
    return {
      ...status,
      status: diagnostics.length ? 'NEEDS PRICING' : status.status,
      missingOwnerFields: [...new Set([...status.missingOwnerFields, ...diagnostics.filter(item => item.type === 'missing').map(item => item.path)])],
      invalidOwnerFields: [...new Set([...status.invalidOwnerFields, ...diagnostics.filter(item => invalidTypes.has(item.type)).map(item => item.path)])],
      unsupportedOwnerFields: [...new Set([...(status.unsupportedOwnerFields || []), ...diagnostics.filter(item => item.type === 'unsupported').map(item => item.path)])],
      crossFieldOwnerFields: [...new Set([...(status.crossFieldOwnerFields || []), ...diagnostics.filter(item => item.type === 'cross_field').map(item => item.path)])],
      ownerDiagnostics: diagnostics,
      validationErrors: [...new Set(diagnostics.map(item => item.message))]
    };
  });
}

function duplicateServiceIdDiagnostics(services) {
  const groups=new Map(),out=[];
  services.forEach((service,index)=>{if(!validServiceIdVNext(service?.id))return;const id=service.id.toLowerCase();if(!groups.has(id))groups.set(id,[]);groups.get(id).push(index);});
  for(const indexes of groups.values())if(indexes.length>1)for(const index of indexes)out.push({type:'invalid',kind:'duplicate_service_id',path:'services.'+index+'.id',message:'A persisted service UUID must identify exactly one service in this price book.'});
  return out;
}

export function validateVNextPricebook(pricebook) {
  const errors = [];
  if (!isPlainRecord(pricebook)) return { ok: false, errors: ['Price book must be an object.'], statuses: [] };
  const snapshot = snapshotPlainData(pricebook, 'pricebook');
  if (!snapshot.ok) return {
    ok: false, errors: [`Price book could not be read safely at ${snapshot.errorPath}: ${snapshot.reason}.`], statuses: []
  };
  const blockingValidationPath = snapshot.nonPlainPaths[0];
  if (blockingValidationPath) {
    const path = blockingValidationPath;
    return {
      ok: false,
      errors: [`Price book contains a non-plain value at ${path}.`],
      statuses: [statusFromDiagnostics(null, [{
        type: 'invalid', kind: 'pricebook', path, message: `${path} must be a plain data value.`
      }])]
    };
  }
  pricebook = snapshot.value;
  if (!Array.isArray(pricebook.services)) return { ok: false, errors: ['Price book services must be an array.'], statuses: [] };
  const servicesIssue = denseArrayIssue(pricebook.services);
  if (servicesIssue) {
    const path = servicesIssue.path ? `pricebook.services.${servicesIssue.path}` : 'pricebook.services';
    return {
      ok: false,
      errors: [`Price book services are invalid at ${path}: ${servicesIssue.reason}.`],
      statuses: vNextPricebookStatuses(pricebook)
    };
  }
  const defaultSource = Object.hasOwn(pricebook, 'defaults') ? pricebook.defaults : {};
  const defaults = validateBusinessDefaults(defaultSource);
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

function serviceLookupReview({ serviceType, customerInputs, callerType, reviewReason, path, kind, diagnosticOwner = 'owner', diagnostics = null }) {
  const ownerDiagnostic = { type: 'invalid', kind, path, message: reviewReason };
  const result = {
    resultType: 'ESTIMATE_REQUIRES_REVIEW',
    engineVersion: ENGINE_VERSION,
    serviceId: null,
    serviceResolution: { status: kind === 'missing_service' ? 'missing' : ['duplicate_service','duplicate_service_id'].includes(kind) ? 'ambiguous' : 'invalid', serviceId: null },
    quoteId: crypto.randomUUID(),
    serviceType,
    submittedCustomerInputs: cloneForStatus(customerInputs, {}),
    normalizedScope: null,
    validatedMeasurements: [],
    reviewReason,
    missingCustomerFields: [],
    invalidCustomerFields: diagnosticOwner === 'customer' ? [path] : [],
    missingOwnerFields: [],
    invalidOwnerFields: diagnosticOwner === 'owner' ? diagnostics ? diagnostics.map(d=>d.path) : [path] : [],
    unsupportedOwnerFields: [],
    crossFieldOwnerFields: [],
    ownerDiagnostics: diagnosticOwner === 'owner' ? diagnostics || [ownerDiagnostic] : [],
    ownerDecisionRequired: [],
    failedTierDiagnostics: [],
    validationMessages: [reviewReason],
    inspectionFirst: false,
    appliedRules: [],
    urgencyFlags: ['ROOFING_REPAIR', 'FLAT_ROOF_REPAIR'].includes(serviceType) && customerInputs?.leakPresent === true ? ['Active leak reported'] : []
  };
  return callerType === 'owner' ? result : sanitizeForCustomerVNext(result);
}
function pricebookRequestDiagnosticOwner(path) {
  const relativePath = String(path || '').replace(/^quoteRequest\./, '');
  return /^(pricebook|feeSelections\.owner)(?:\.|$)/.test(relativePath) ? 'owner' : 'customer';
}


export function quoteFromVNextPricebook(input = {}) {
  const requestSnapshot = snapshotPlainData(input, 'quoteRequest');
  const requestIsPlainObject = requestSnapshot.ok;
  const callerDescriptor = ownDataValue(input, 'callerType');
  const fallbackRequest = { callerType: callerDescriptor.ok && callerDescriptor.value === 'owner' ? 'owner' : 'customer' };
  const {
    pricebook,
    serviceType,
    customerInputs,
    callerType = 'customer',
    feeSelections,
    currentMonth,
    allowInactiveOwnerPreview = false
  } = requestIsPlainObject ? requestSnapshot.value : fallbackRequest;
  if (!requestIsPlainObject) return serviceLookupReview({ serviceType, customerInputs, callerType, reviewReason: `Quote request could not be read safely: ${requestSnapshot.reason}.`, path: requestSnapshot.errorPath, kind: 'invalid_request', diagnosticOwner: pricebookRequestDiagnosticOwner(requestSnapshot.errorPath) });
  const blockingNonPlainPath = requestSnapshot.nonPlainPaths[0];
  if (blockingNonPlainPath) {
    let path = blockingNonPlainPath;
    if (path.startsWith('quoteRequest.')) path = path.slice('quoteRequest.'.length);
    return serviceLookupReview({ serviceType, customerInputs, callerType, reviewReason: 'Price-book quote request must contain only plain data objects.', path, kind: 'invalid_request', diagnosticOwner: pricebookRequestDiagnosticOwner(path) });
  }
  const unsupportedRequestField = Object.keys(requestSnapshot.value).find(field => !PRICEBOOK_QUOTE_REQUEST_FIELDS.has(field));
  if (unsupportedRequestField) return serviceLookupReview({ serviceType, customerInputs, callerType, reviewReason: 'Price-book quote request contains an unsupported field.', path: `quoteRequest.${unsupportedRequestField}`, kind: 'invalid_request', diagnosticOwner: 'customer' });
  const services = isPlainRecord(pricebook) && Array.isArray(pricebook.services) ? pricebook.services : [];
  const servicesIssue = denseArrayIssue(services);
  if (servicesIssue) {
    const path = servicesIssue.path ? `pricebook.services.${servicesIssue.path}` : 'pricebook.services';
    return serviceLookupReview({ serviceType, customerInputs, callerType, reviewReason: `Price book services are invalid at ${path}: ${servicesIssue.reason}.`, path, kind: 'pricebook_services' });
  }
  if (!SERVICE_TYPES.includes(serviceType)) return serviceLookupReview({ serviceType, customerInputs, callerType, reviewReason: `Unsupported service type: ${serviceType}.`, path: 'serviceType', kind: 'unsupported_service', diagnosticOwner: 'customer' });
  const builtIn = serviceType !== 'CUSTOM';
  const requestedCustomService = isPlainRecord(customerInputs) && typeof customerInputs.service === 'string' ? customerInputs.service : '';
  const requestedCustomName = requestedCustomService.trim().toLowerCase();
  const matches = builtIn
    ? services.filter(entry => entry?.serviceType === serviceType)
    : services.filter(entry => entry?.serviceType === 'CUSTOM' && typeof entry.service === 'string' && entry.service.trim().toLowerCase() === requestedCustomName);
  if (matches.length === 0) {
    const description = builtIn ? serviceType : `custom service "${requestedCustomService}"`;
    return serviceLookupReview({ serviceType, customerInputs, callerType, reviewReason: `No matching service is configured for ${description}.`, path: 'services', kind: 'missing_service' });
  }
  if (matches.length > 1) {
    const description = builtIn ? serviceType : `custom service "${requestedCustomService}"`;
    return serviceLookupReview({ serviceType, customerInputs, callerType, reviewReason: `Multiple matching service definitions make ${description} ambiguous.`, path: 'services', kind: 'duplicate_service' });
  }
  const duplicateIds=duplicateServiceIdDiagnostics(services);
  if(duplicateIds.length)return serviceLookupReview({serviceType,customerInputs,callerType,reviewReason:'Price book contains colliding persisted service identities.',path:duplicateIds[0].path,kind:'duplicate_service_id',diagnostics:duplicateIds});
  const service = matches[0];
  return generateQuoteVNext({
    serviceType: service.serviceType,
    customerInputs,
    ownerPricing: service,
    businessDefaults: isPlainRecord(pricebook) && Object.hasOwn(pricebook, 'defaults') ? pricebook.defaults : {},
    callerType,
    feeSelections,
    currentMonth,
    allowInactiveOwnerPreview
  });
}

function previewRequestFromSnapshot(input, snapshot) {
  if (!snapshot.nonPlainPaths.length) return snapshot.value;
  const request = {};
  for (const key of Object.keys(snapshot.value)) {
    const descriptor = ownDataValue(input, key);
    if (!descriptor.ok || !descriptor.present) return null;
    Object.defineProperty(request, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return request;
}

export function previewFromVNextPricebook(input) {
  const snapshot = snapshotPlainData(input, 'quoteRequest');
  if (!snapshot.ok) return quoteFromVNextPricebook(input);
  const request = previewRequestFromSnapshot(input, snapshot);
  if (!request) return quoteFromVNextPricebook(input);
  return quoteFromVNextPricebook({ ...request, callerType: 'owner', allowInactiveOwnerPreview: true });
}

export function reviewOnlyScopesVNext(serviceType) {
  const definitions = [];
  const add = (when, inputs, fields, always = false) => definitions.push({when, inputs, fields, always});
  if (serviceType.startsWith('FLOORING_')) add('Stairs selected', {stairSteps:1}, ['perStepPrice']);
  if (serviceType === 'SIDING_REPLACEMENT') {
    add('Existing siding removal selected', {oldSidingRemoval:true}, ['removalPerSqft','disposalPerSqft']);
    add('Trim selected', {trimIncluded:true}, ['trimPerLinearFoot']);
  }
  if (serviceType.startsWith('CONCRETE_')) {
    add('Demolition selected', {demolitionNeeded:true}, ['demolitionPerSqft','disposalPerSqft']);
    add('Exposed aggregate selected', {finishType:'exposed_aggregate'}, ['finishMultiplier']);
  }
  if (serviceType === 'FLAT_ROOF_REPLACEMENT') add('Commercial insulation scope', {buildingType:'commercial'}, ['insulationPerSqft']);
  if (serviceType.startsWith('FENCING_')) add('Every fence request', {}, [], true);
  if (serviceType === 'EXTERIOR_PAINTING') add('Every exterior painting request', {}, [], true);
  return definitions.map(({inputs, ...entry}) => ({...entry, ownerDecisions: uniqueStatusDiagnostics([
    ...inspectionOwnerDecisionsVNext(serviceType, inputs),
    ...validateOwnerPricing(serviceType, inputs, {}, {}).ownerDecisionRequired
  ])}));
}

function fieldCopy(serviceType, field) {
  if(['scopeDetails','scopeRates'].includes(field))return {label:field==='scopeDetails'?'Additional priced scope':'Additional scope prices',help:'Explicit owner-defined work, inclusions and measured prices.'};
  if(['offeringMode','offeringDetails','offeringRates'].includes(field))return NEW_FIELD_COPY[field];
  const scopes = reviewOnlyScopesVNext(serviceType).filter(scope => scope.always || scope.fields.includes(field));
  if (scopes.length) return {
    label: (NEW_FIELD_COPY[field]?.label || ownerFieldCopy(serviceType, field).title || ownerFieldCopy(serviceType, field).label || field) + ' — review only',
    help: scopes.map(scope => scope.when + ': this legacy scalar alone is incomplete. Configure the work under Additional priced scope (or Fence and painting offering). ' + scope.ownerDecisions.map(d => d.message).join(' ')).join(' '),
    reviewOnly: true,
    ownerDecisions: scopes.flatMap(scope => scope.ownerDecisions)
  };
  if (serviceType === 'FLAT_ROOF_REPLACEMENT' && ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'].includes(field)) return {
    label: {laborPerSqft:'Installation labor price per square foot by replacement membrane',membraneCostPerSqft:'Material price per square foot by replacement membrane',tearOffPerSqft:'Tear-off price per square foot by existing membrane'}[field],
    help:'Enter named, identified membrane rates. Unknown materials require verification; no fallback rate is used.'
  };
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
    ...(OFFERING_TYPES.includes(contract.serviceType)?{
      offeringCustomerFields:Object.fromEntries(['installed','itemized'].map(mode=>[mode,Object.entries(offeringContract(contract.serviceType,{offeringMode:mode}).fields).map(([name,field])=>({name,...field}))])),
      offeringRateFields:Object.fromEntries(['installed','itemized'].map(mode=>[mode,offeringRateDefinitions(contract.serviceType,{offeringMode:mode,offeringDetails:{primerCoats:1,ceilingsOffered:true,ceilingPrimerCoats:1,trimOffered:true,removalOffered:true}})]))
    }:{}),
    service: SERVICE_NAMES[contract.serviceType],
    supportsScopeConfiguration:Object.keys(scopeDefinitions(contract.serviceType,{materialCostPerSquare:{configured_roof_type:1}})).length>0,
    reviewOnlyScopes: reviewOnlyScopesVNext(contract.serviceType),
    pricingFields: contract.allowedPricingFields.filter(field => !contract.class2Fields.some(definition => definition.name === field)).map(field => ({ field, ...fieldCopy(contract.serviceType, field) })),
    ruleFields: ['priceBasisByCategory', 'taxabilityByCategory', 'feeRules', 'knownOfferings', 'origin', 'zeroPricePolicy', ...(contract.serviceType === 'LANDSCAPING_SOD' ? ['disposalScope'] : [])].map(field => ({ field, ...NEW_FIELD_COPY[field] })),
    class2Fields: contract.class2Fields.map(definition => ({
      ...definition,
      help: `Owner-editable ${definition.unit} control for ${definition.label.toLowerCase()}. The exact value used is recorded in the internal calculation evidence. ${reviewOnlyScopesVNext(contract.serviceType).map(scope => scope.when + ' requires a configured owner scope.').join(' ')}`
    }))
  }));
}

export function materializeVNextService(service) {
  const snapshot = snapshotPlainData(service, 'service');
  if (!snapshot.ok) {
    if (!isPlainRecord(service)) throw new TypeError('Service must be an object.');
    throw new TypeError(`Service could not be read safely at ${snapshot.errorPath}: ${snapshot.reason}.`);
  }
  if (snapshot.nonPlainPaths.length) {
    const path = snapshot.nonPlainPaths[0];
    throw new TypeError(`Service must contain only plain data objects; ${path} is not plain data.`);
  }
  service = snapshot.value;
  if (!isPlainRecord(service)) throw new TypeError('Service must be an object.');
  if (!SERVICE_TYPES.includes(service.serviceType)) throw new TypeError('Service type is unsupported.');
  if (service.pricing !== undefined && !isPlainRecord(service.pricing)) throw new TypeError('Service pricing must be an object.');
  const next = canonicalServiceIdentityVNext(service);
  next.pricing ||= {};
  for (const [field, definition] of Object.entries(CLASS2_DEFINITIONS[next.serviceType] || {})) {
    if (next.pricing[field] === undefined) next.pricing[field] = structuredClone(definition.defaultValue);
  }
  return next;
}
