import {fixedPriceField} from './pricePrecision.js';
import {ALL_OWNER_FIELDS,MONEY_FIELD_NAMES,CLASS2_DEFAULTS_BY_SERVICE,getServiceMetadata} from './priceBookMetadata.js';
import {allowedPricingFields,CLASS2_DEFINITIONS} from './quote-engine-vnext/contracts.js';
import {offeringMoneyKind,offeringRateDefinitions} from './quote-engine-vnext/configuredOfferings.js';
import {scopeRateDefinitions} from './scopeConfiguration.js';
import {mergePricingForValidationVNext} from './quote-engine-vnext/pricingMerge.js';

// Monetary semantics are declared once here and consumed by every dollar/cent
// boundary. A field that the active pricing metadata exposes cannot silently
// fall through without either an explicit non-money classification or a money
// conversion path.
const UNIT_RATE_FIELDS = new Set([
  'laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare',
  'starterPerLF','dripEdgePerLF','ridgeCapPerLF','deckingPerSheet','disposalPerSquare',
  'laborHourlyRate','laborPerFloorSqft','materialPerFloorSqft2Coats',
  'ceilingLaborPerFloorSqft','trimLaborPerLF','trimMaterialPerLF',
  'exteriorLaborPerSqft','materialPerSqftPerCoat','laborPerSqft','materialPerSqft',
  'removalPerSqft','perStepPrice','underlaymentPerSqft','subfloorAllowancePerSqft',
  'laborPerLinearFoot','materialPerLinearFoot','postPrice','concretePerPost',
  'gatePrice','removalPerLinearFoot','disposalPerLF','concreteCostPerCubicYard',
  'formworkPerLF','basePrepPerSqft','wireReinforcementPerSqft',
  'rebarReinforcementPerSqft','stampedMaterialPerSqft','cleanupBaseRatePerSqft',
  'mulchMaterialPerYard','mulchInstallLaborPerYard','bedPrepLaborPerSqft',
  'edgingPerLinearFoot','sodMaterialPerSqft','sodInstallLaborPerSqft',
  'groundPrepPerSqft','plantingLaborPerPlant','plantMaterialAllowance',
  'mowingBaseRatePerSqft','membraneCostPerSqft','tearOffPerSqft','insulationPerSqft',
  'disposalPerSqft','demolitionPerSqft','trimPerLinearFoot',
  'laborPerWallSqftPerCoat','materialPerWallSqftPerCoat',
  'ceilingLaborPerSqftPerCoat','ceilingMaterialPerSqftPerCoat',
  'exteriorLaborPerSqftPerCoat'
]);
const FIXED_AMOUNT_FIELDS = new Set([
  'repairMinimum','repairMaterialAllowance','minimumJob','minimumServiceCharge',
  'disposalFlat','haulAwayFee','materialAllowance','patchMaterialAllowance',
  'pondingWaterSurcharge','travelFee','disposalFee','permitFee','overheadFixed',
  'minimumJobPrice'
]);
const DEFAULT_MONEY_FIELDS = new Set([
  'travelFee','disposalFee','permitFee','overheadFixed','minimumJobPrice','laborHourlyRate'
]);
const NON_MONEY_PRICING_FIELDS = new Set([
  'allowAssumptionBasedQuotes','postsIncludedInMaterial','accessoryPricingMode','unit',
  'postSpacing','trimLinearFeetPerRoom','repairHours','patchRepairHours',
  'frequencyMultipliers','overgrowthMultipliers','baggingSurchargePercent','debrisPricing',
  'largeRepairMaxSqft','installedMaterialsPercent','installedLaborPercent',
  'underlaymentPriceBasis','materialAccessoryBasis','vinylPlankUnderlaymentRule',
  'customPricingMode','customChargeClassification','offeringMode','offeringDetails',
  'scopeDetails','roomSizeThresholds'
]);
const DYNAMIC_MONEY_MAPS = new Set(['offeringRates','scopeRates']);
const CUSTOM_RATE_UNITS = new Set(['per_sqft','per_hour','per_LF','per_square']);
// Current product-price maps supplement the retained legacy field definitions.
// The editor and draft validator must use the same shapes.
const PRICING_MAP_FIELDS = {
  ROOFING_REPLACEMENT:['laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare'],
  FLAT_ROOF_REPLACEMENT:['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'],
  FLOORING_INSTALL:['laborPerSqft','materialPerSqft','removalPerSqft'],
  FLOORING_REPLACEMENT:['laborPerSqft','materialPerSqft','removalPerSqft'],
  FENCING_INSTALL:['laborPerLinearFoot','materialPerLinearFoot','postPrice','gatePrice'],
  FENCING_REPLACEMENT:['laborPerLinearFoot','materialPerLinearFoot','postPrice','gatePrice','removalPerLinearFoot'],
  SIDING_REPLACEMENT:['laborPerSqft','materialPerSqft'],
  LANDSCAPING_MULCH:['mulchMaterialPerYard','bedPrepLaborPerSqft'],
  LANDSCAPING_PLANTING:['mulchMaterialPerYard','bedPrepLaborPerSqft','plantingLaborPerPlant','plantMaterialAllowance']
};
export function pricingMapField(serviceType, field) {
  return PRICING_MAP_FIELDS[serviceType]?.includes(field) === true;
}
const NUMBER_DECIMAL = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i;
const MONEY_KINDS = new Set(['unit_rate','fixed_amount','unresolved_unit']);

let ownerErrorLabels;
function ownerErrorLocation(path) {
  if (!path) return '';
  if (!ownerErrorLabels) {
    const options = new Map();
    for (const service of getServiceMetadata()) for (const field of service.fields) {
      if (!options.has(field.field)) options.set(field.field, new Set());
      options.get(field.field).add(field.title || field.label);
    }
    ownerErrorLabels = new Map([...options].map(([field, labels]) => [
      field, labels.size === 1 ? [...labels][0] : 'Price-book value'
    ]));
  }
  const parts = [];
  const serviceIndex = /^services\[(\d+)\]/.exec(path);
  if (serviceIndex) parts.push('Service ' + (Number(serviceIndex[1]) + 1));
  const tierIndex = /\.tiers\[(\d+)\]/.exec(path);
  if (tierIndex) parts.push('Tier ' + (Number(tierIndex[1]) + 1));
  const field = path
    .replace(/^(?:services\[\d+\]|service|defaults)\./, '')
    .replace(/^pricing\./, '')
    .replace(/^tiers\[\d+\]\.(?:overrides|effectivePricing)\./, '')
    .split(/[.\[]/, 1)[0];
  const label = ownerErrorLabels.get(field);
  if (label) parts.push(label);
  return parts.join(' — ');
}

export class PricebookMoneyError extends Error {
  constructor(path, reason) {
    const label = ownerErrorLocation(path);
    super((label ? label + ': ' : '') + reason);
    this.name = 'PricebookMoneyError';
    this.path = path || '';
    this.statusCode = 400;
  }
}

function failure(path, reason) { throw new PricebookMoneyError(path, reason); }
function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function absentValue(value) { return value === undefined || value === null || value === ''; }
function cloneData(value) {
  if (Array.isArray(value)) return value.map(cloneData);
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneData(child)]));
  return value;
}
function samePricingValue(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== right.length) return false;
  const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every(key => samePricingValue(left[key], right[key]));
}
function pricingFields(serviceType) {
  return new Set([
    ...(ALL_OWNER_FIELDS[serviceType] || []),
    ...allowedPricingFields(serviceType),
    ...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[serviceType] || {})
  ]);
}
function assertUnambiguousPricing(service, location) {
  if (!isRecord(service.pricing)) return;
  for (const field of pricingFields(service.serviceType)) {
    if (Object.hasOwn(service, field) && Object.hasOwn(service.pricing, field) && !samePricingValue(service[field], service.pricing[field])) {
      failure(location + '.pricing.' + field, 'This price-book setting has conflicting duplicate values. Choose the intended value before saving; neither value was changed.');
    }
  }
}

function decimal(text, path) {
  const match = NUMBER_DECIMAL.exec(text);
  if (!match) failure(path, 'Enter a finite decimal number.');
  const fraction = match[4] ?? match[3] ?? '';
  let digits = ((match[2] || '0') + fraction).replace(/^0+/, '');
  if (!digits) return { negative: false, digits: '0', exponent: 0n };
  let exponent = BigInt(match[5] || '0') - BigInt(fraction.length);
  const trailing = /0+$/.exec(digits);
  if (trailing) {
    digits = digits.slice(0, -trailing[0].length);
    exponent += BigInt(trailing[0].length);
  }
  return { negative: match[1] === '-', digits, exponent };
}
function sameDecimal(left, right) {
  return left.negative === right.negative && left.digits === right.digits && left.exponent === right.exponent;
}
function numberDecimal(value, path) {
  if (typeof value !== 'number' || !Number.isFinite(value)) failure(path, 'The price must be a finite number.');
  return decimal(JSON.stringify(value), path);
}
function shifted(value, places) {
  return value.digits === '0' ? value : { ...value, exponent: value.exponent + BigInt(places) };
}
function decimalNumber(intended, path) {
  const text = (intended.negative ? '-' : '') + intended.digits + 'e' + intended.exponent.toString();
  const result = Number(text);
  if (!Number.isFinite(result) || !sameDecimal(numberDecimal(result, path), intended)) {
    failure(path, 'This value cannot be preserved exactly in the supported numeric price representation. Enter a representable value before saving.');
  }
  return result;
}
function assertKind(kind, path) {
  if (!MONEY_KINDS.has(kind)) failure(path, 'The monetary field needs a supported price-unit classification.');
}
function assertCentDomain(value, kind, path) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    failure(path, 'The price is outside the supported non-negative cent range.');
  }
  if (kind !== 'unit_rate' && !Number.isSafeInteger(value)) {
    failure(path, kind === 'unresolved_unit'
      ? 'Choose the custom service unit before entering a fractional-cent unit rate.'
      : 'A fixed charge or minimum must be an exact whole-cent amount; it cannot be rounded during save.');
  }
}

export function dollarAmountToCents(value, { kind = 'fixed_amount', path = '' } = {}) {
  if (absentValue(value)) return value;
  assertKind(kind, path);
  const original = numberDecimal(value, path);
  if (original.negative) failure(path, 'The price cannot be negative.');
  const cents = decimalNumber(shifted(original, 2), path);
  assertCentDomain(cents, kind, path);
  const reloaded = decimalNumber(shifted(numberDecimal(cents, path), -2), path);
  if (!sameDecimal(numberDecimal(reloaded, path), original)) failure(path, 'The price cannot survive save and reload without changing.');
  return cents;
}

export function centAmountToDollars(value, { kind = 'fixed_amount', path = '' } = {}) {
  if (absentValue(value)) return value;
  assertKind(kind, path);
  assertCentDomain(value, kind, path);
  const original = numberDecimal(value, path);
  const dollars = decimalNumber(shifted(original, -2), path);
  const restored = decimalNumber(shifted(numberDecimal(dollars, path), 2), path);
  if (!sameDecimal(numberDecimal(restored, path), original)) failure(path, 'The stored price cannot be displayed and saved without changing.');
  return dollars;
}

export function parseOwnerNumericInput(raw, { kind = null, path = '', wholeCents = false } = {}) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string' && typeof raw !== 'number') failure(path, 'Enter a finite decimal number.');
  const text = String(raw).trim();
  if (!text) return undefined;
  const intended = decimal(text, path);
  if (intended.negative) failure(path, 'The value cannot be negative.');
  const value = decimalNumber(intended, path);
  if (kind !== null) {
    const cents = dollarAmountToCents(value, { kind, path });
    if (wholeCents && !Number.isSafeInteger(cents)) failure(path, 'This rate requires whole-cent precision (for example, 2.55). Enter your intended rate; it will not be rounded.');
  }
  return value;
}

export function scaleOwnerDecimal(value, places) {
  if (value === undefined || value === null || typeof value === 'string') return value;
  const original = numberDecimal(value, '');
  const scaled = decimalNumber(shifted(original, places), '');
  const restored = decimalNumber(shifted(numberDecimal(scaled, ''), -places), '');
  if (!sameDecimal(numberDecimal(restored, ''), original)) failure('', 'This percentage cannot be saved without changing.');
  return scaled;
}

export function assertJsonNumberPreserved(raw) {
  return decimalNumber(decimal(raw, ''), '');
}

export function canonicalPeakMonths(value, path = 'peakMonths') {
  if (value === undefined) return value;
  if (!Array.isArray(value)) failure(path, 'Peak months must be an array of unique month numbers from 1 through 12.');
  const seen = new Set();
  for (let index = 0; index < value.length; index += 1) {
    const month = value[index];
    if (!Number.isInteger(month) || month < 1 || month > 12) failure(`${path}[${index}]`, 'Each peak month must be an integer from 1 through 12.');
    if (seen.has(month)) failure(`${path}[${index}]`, 'Peak months must be unique.');
    seen.add(month);
  }
  return [...seen].sort((left, right) => left - right);
}

export function moneyKindForField(serviceType, field, pricing = {}) {
  if (serviceType === 'CUSTOM' && ['price', 'low', 'high'].includes(field)) {
    if (CUSTOM_RATE_UNITS.has(pricing.unit)) return 'unit_rate';
    return ['flat','per_unit'].includes(pricing.unit) ? 'fixed_amount' : 'unresolved_unit';
  }
  if (DYNAMIC_MONEY_MAPS.has(field) || field === 'debrisPricing') return null;
  const known = pricingFields(serviceType);
  if (fixedPriceField(field, pricing)) return 'fixed_amount';
  if (UNIT_RATE_FIELDS.has(field)) return 'unit_rate';
  if (FIXED_AMOUNT_FIELDS.has(field)) return 'fixed_amount';
  if (MONEY_FIELD_NAMES.has(field)) failure(field, 'This monetary field has no supported price-unit classification.');
  if (known.has(field) && !NON_MONEY_PRICING_FIELDS.has(field)
      && !Object.hasOwn(CLASS2_DEFINITIONS[serviceType] || {}, field)
      && !Object.hasOwn(CLASS2_DEFAULTS_BY_SERVICE[serviceType] || {}, field)) {
    failure(field, 'This price-book field is exposed by pricing metadata but has no money conversion path.');
  }
  return null;
}

export function wholeCentsForPricingField(serviceType, field, pricing = {}) {
  return allowedPricingFields(serviceType).includes(field) && moneyKindForField(serviceType, field, pricing) === 'fixed_amount';
}

function convertedLeaf(value, kind, direction, path) {
  const convert = direction === 'toCents' ? dollarAmountToCents : centAmountToDollars;
  const displayKind = direction === 'toDollars' && kind === 'fixed_amount' ? 'unit_rate' : kind;
  return convert(value, { kind: displayKind, path });
}
function convertMoneyTree(value, kind, direction, path) {
  if (absentValue(value)) return value;
  if (Array.isArray(value)) failure(path, 'Money maps must use named pricing keys, not arrays.');
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key, convertMoneyTree(child, kind, direction, `${path}.${key}`)
  ]));
  return convertedLeaf(value, kind, direction, path);
}
function offeringDefinitions(serviceType, pricing) {
  const details = {
    ...(isRecord(pricing.offeringDetails) ? pricing.offeringDetails : {}),
    primerCoats:1,ceilingsOffered:true,ceilingPrimerCoats:1,trimOffered:true,removalOffered:true
  };
  return {
    ...offeringRateDefinitions(serviceType,{...pricing,offeringMode:'installed',offeringDetails:details}),
    ...offeringRateDefinitions(serviceType,{...pricing,offeringMode:'itemized',offeringDetails:details})
  };
}
function convertDynamicMoneyMap(value, serviceType, field, effectivePricing, direction, path) {
  if (absentValue(value)) return value;
  if (!isRecord(value)) failure(path, `${field} must be a map of named prices.`);
  const definitions = field === 'offeringRates'
    ? offeringDefinitions(serviceType, effectivePricing)
    : scopeRateDefinitions(serviceType, effectivePricing, true);
  return Object.fromEntries(Object.entries(value).map(([key, amount]) => {
    const definition = definitions[key];
    if (!definition) failure(`${path}.${key}`, 'This money field has no supported conversion path for the configured pricing metadata.');
    if (isRecord(amount) || Array.isArray(amount)) failure(`${path}.${key}`, 'A configured unit price must be one numeric amount.');
    const kind = field === 'offeringRates' ? definition.moneyKind || offeringMoneyKind(key) : definition.moneyKind || 'unit_rate';
    return [key, convertedLeaf(amount, kind, direction, `${path}.${key}`)];
  }));
}
function convertDebrisPricing(value, direction, path) {
  if (absentValue(value)) return value;
  if (!isRecord(value)) failure(path, 'Debris pricing must be a map.');
  return Object.fromEntries(Object.entries(value).map(([level, row]) => {
    if (!isRecord(row)) return [level, cloneData(row)];
    const converted = cloneData(row);
    if (Object.hasOwn(row, 'disposalFlat')) converted.disposalFlat = convertedLeaf(row.disposalFlat, 'fixed_amount', direction, `${path}.${level}.disposalFlat`);
    return [level, converted];
  }));
}
function convertPricingContainer(container, serviceType, effectivePricing, direction, location) {
  if (!isRecord(container)) return cloneData(container);
  const output = cloneData(container);
  for (const [field, value] of Object.entries(container)) {
    const fieldPath = `${location}.${field}`;
    if (DYNAMIC_MONEY_MAPS.has(field)) output[field] = convertDynamicMoneyMap(value, serviceType, field, effectivePricing, direction, fieldPath);
    else if (field === 'debrisPricing') output[field] = convertDebrisPricing(value, direction, fieldPath);
    else {
      const kind = moneyKindForField(serviceType, field, effectivePricing);
      if (kind) output[field] = convertMoneyTree(value, kind, direction, fieldPath);
    }
  }
  return output;
}
function rootPricing(service) {
  const output = {};
  for (const field of pricingFields(service.serviceType)) if (Object.hasOwn(service, field)) output[field] = cloneData(service[field]);
  return output;
}
function effectiveServicePricing(service) {
  const root = rootPricing(service);
  return isRecord(service.pricing) ? mergePricingForValidationVNext(root, service.pricing) : root;
}
function convertService(service, direction, location) {
  if (!isRecord(service)) return cloneData(service);
  if (direction === 'toCents') assertUnambiguousPricing(service, location);
  const serviceType = service.serviceType;
  const effective = effectiveServicePricing(service);
  const output = convertPricingContainer(service, serviceType, effective, direction, location);
  if (Object.hasOwn(service, 'peakMonths')) output.peakMonths = canonicalPeakMonths(service.peakMonths, `${location}.peakMonths`);
  if (Object.hasOwn(service, 'pricing')) output.pricing = convertPricingContainer(service.pricing, serviceType, effective, direction, `${location}.pricing`);
  if (Array.isArray(service.tiers)) {
    output.tiers = service.tiers.map((tier, index) => {
      if (!isRecord(tier)) return cloneData(tier);
      const result = cloneData(tier);
      if (Object.hasOwn(tier, 'overrides')) {
        const overrides = isRecord(tier.overrides) ? tier.overrides : {};
        const tierPricing = mergePricingForValidationVNext(effective, overrides);
        // A tier can change the unit or price basis of inherited amounts. Check
        // its effective prices without copying inherited values into overrides.
        if (direction === 'toCents') convertPricingContainer(tierPricing, serviceType, tierPricing, direction, `${location}.tiers[${index}].effectivePricing`);
        result.overrides = convertPricingContainer(tier.overrides, serviceType, tierPricing, direction, `${location}.tiers[${index}].overrides`);
        if (Object.hasOwn(tier.overrides || {}, 'peakMonths')) result.overrides.peakMonths = canonicalPeakMonths(tier.overrides.peakMonths, `${location}.tiers[${index}].overrides.peakMonths`);
      }
      return result;
    });
  }
  return output;
}
function convertDefaults(defaults, direction, location) {
  if (!isRecord(defaults)) return cloneData(defaults);
  const output = cloneData(defaults);
  for (const field of DEFAULT_MONEY_FIELDS) if (Object.hasOwn(defaults, field)) {
    output[field] = convertedLeaf(defaults[field], UNIT_RATE_FIELDS.has(field) ? 'unit_rate' : 'fixed_amount', direction, `${location}.${field}`);
  }
  if (Object.hasOwn(defaults, 'peakMonths')) output.peakMonths = canonicalPeakMonths(defaults.peakMonths, `${location}.peakMonths`);
  return output;
}

export function convertPricebookMoney(data, direction) {
  if (!['toCents', 'toDollars'].includes(direction)) failure('', 'Unknown price conversion direction.');
  if (!isRecord(data)) return cloneData(data);
  if (Object.hasOwn(data, 'serviceType')) return convertService(data, direction, 'service');
  const output = cloneData(data);
  if (Array.isArray(data.services)) output.services = data.services.map((service, index) => convertService(service, direction, `services[${index}]`));
  if (isRecord(data.service)) output.service = convertService(data.service, direction, 'service');
  if (Object.hasOwn(data, 'defaults')) output.defaults = convertDefaults(data.defaults, direction, 'defaults');
  return output;
}

const DEFAULT_NUMERIC_FIELDS = new Set([
  'markupPercent','taxPercent','rangeBufferPercent','peakSurchargePercent',...DEFAULT_MONEY_FIELDS
]);
const NULLABLE_DEFAULT_NUMERIC_FIELDS = new Set([
  'travelFee','disposalFee','permitFee','overheadFixed','minimumJobPrice',
  'rangeBufferPercent','peakSurchargePercent','laborHourlyRate'
]);
let numericDefinitions;
function definitionsFor(serviceType) {
  numericDefinitions ??= new Map(getServiceMetadata().map(service => [
    service.serviceType, new Map(service.fields.map(field => [field.field, field]))
  ]));
  return numericDefinitions.get(serviceType);
}
function assertDraftNumber(value, location, nullable = false) {
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) failure(location, 'Enter a finite numeric value before saving. Invalid text cannot be saved as a previous value.');
  if (value < 0) failure(location, 'The value cannot be negative.');
}
function assertDraftNumericLeaves(value, location) {
  if (typeof value === 'number' || value === undefined) { assertDraftNumber(value, location); return; }
  if (Array.isArray(value)) { value.forEach((child, index) => assertDraftNumericLeaves(child, `${location}[${index}]`)); return; }
  if (!isRecord(value)) failure(location, 'Enter numeric values for this rate or factor map before saving.');
  for (const [key, child] of Object.entries(value)) assertDraftNumericLeaves(child, `${location}.${key}`);
}
function validateDraftPricing(container, serviceType, location) {
  if (!isRecord(container)) return;
  for (const [field, definition] of definitionsFor(serviceType) || []) {
    if (!Object.hasOwn(container, field) || container[field] === undefined) continue;
    if (definition.type === 'number' && pricingMapField(serviceType, field) && isRecord(container[field])) {
      assertDraftNumericLeaves(container[field], `${location}.${field}`);
    } else if (definition.type === 'number') assertDraftNumber(container[field], `${location}.${field}`);
    else if (definition.type === 'json') {
      if (!isRecord(container[field])) failure(`${location}.${field}`, 'Enter a supported numeric pricing map before saving.');
      assertDraftNumericLeaves(container[field], `${location}.${field}`);
    }
  }
  for (const field of new Set([...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[serviceType] || {}), ...Object.keys(CLASS2_DEFINITIONS[serviceType] || {})])) if (Object.hasOwn(container, field) && container[field] !== undefined) {
    assertDraftNumericLeaves(container[field], `${location}.${field}`);
  }
}
function validateDraftService(service, location) {
  if (!isRecord(service)) return;
  assertUnambiguousPricing(service, location);
  validateDraftPricing(service, service.serviceType, location);
  if (Object.hasOwn(service, 'pricing')) validateDraftPricing(service.pricing, service.serviceType, `${location}.pricing`);
  if (Object.hasOwn(service, 'peakMonths')) canonicalPeakMonths(service.peakMonths, `${location}.peakMonths`);
  if (Array.isArray(service.tiers)) service.tiers.forEach((tier, index) => {
    if (isRecord(tier)) validateDraftPricing(tier.overrides, service.serviceType, `${location}.tiers[${index}].overrides`);
  });
}
export function validatePricebookNumericDraft(data) {
  if (!isRecord(data)) failure('', 'A price-book object is required before saving.');
  if (Object.hasOwn(data, 'serviceType')) validateDraftService(data, 'service');
  else {
    if (Array.isArray(data.services)) data.services.forEach((service, index) => validateDraftService(service, `services[${index}]`));
    if (isRecord(data.service)) validateDraftService(data.service, 'service');
    if (isRecord(data.defaults)) {
      for (const field of DEFAULT_NUMERIC_FIELDS) if (Object.hasOwn(data.defaults, field)) {
        assertDraftNumber(data.defaults[field], `defaults.${field}`, NULLABLE_DEFAULT_NUMERIC_FIELDS.has(field));
      }
      if (Object.hasOwn(data.defaults, 'peakMonths')) canonicalPeakMonths(data.defaults.peakMonths, 'defaults.peakMonths');
    }
  }
  convertPricebookMoney(data, 'toCents');
  return true;
}
