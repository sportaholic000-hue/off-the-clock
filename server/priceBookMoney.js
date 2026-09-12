import { ALL_OWNER_FIELDS, MONEY_FIELD_NAMES, CLASS2_DEFAULTS_BY_SERVICE, getServiceMetadata, shapedFieldKeys } from './priceBookMetadata.js';

// Existing application fields only. These declarations describe price units;
// they do not change either quote engine's formulas or supported rate domains.
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
  'disposalPerSqft','demolitionPerSqft','trimPerLinearFoot'
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
const CUSTOM_RATE_UNITS = new Set(['per_sqft','per_hour','per_unit','per_LF','per_square']);
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
    // A shared identifier can have different trade-specific labels. Do not
    // attach another service's meaning when the path alone cannot identify it.
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

// Duplicate representations remain intact. A conflicting owner field cannot
// be silently resolved by the converter or an unrelated save. Object-key order
// does not change a value, but absence/null/empty/numeric values stay distinct.
function samePricingValue(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && left.length !== right.length) return false;
  const leftKeys = Object.keys(left).sort(), rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length || leftKeys.some((key, index) => key !== rightKeys[index])) return false;
  return leftKeys.every(key => samePricingValue(left[key], right[key]));
}
function assertUnambiguousPricing(service, location) {
  if (!isRecord(service.pricing)) return;
  const fields = new Set([...(ALL_OWNER_FIELDS[service.serviceType] || []), ...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[service.serviceType] || {})]);
  for (const field of fields) {
    if (Object.hasOwn(service, field) && Object.hasOwn(service.pricing, field) && !samePricingValue(service[field], service.pricing[field])) {
      failure(location + '.pricing.' + field, 'This price-book setting has conflicting duplicate values. Choose the intended value before saving; neither value was changed.');
    }
  }
}

// Canonical decimal coefficient and exponent avoid binary multiplication and
// avoid constructing enormous powers of ten for an unrepresentable input.
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
  // Check the inverse boundary as well: a successful save must reload as the
  // same dollar value, without cumulative drift or a hidden replacement price.
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

// Call this with the raw editor text BEFORE Number(raw) loses typed precision.
// Empty input remains absent. Non-money values receive only decimal fidelity
// validation, never dollars/cents conversion or monetary magnitude limits.
export function parseOwnerNumericInput(raw, { kind = null, path = '' } = {}) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string' && typeof raw !== 'number') failure(path, 'Enter a finite decimal number.');
  const text = String(raw).trim();
  if (!text) return undefined;
  const intended = decimal(text, path);
  if (intended.negative) failure(path, 'The value cannot be negative.');
  const value = decimalNumber(intended, path);
  if (kind !== null) dollarAmountToCents(value, { kind, path });
  return value;
}

// A custom amount with no confirmed unit may still use ordinary whole cents.
// Fractional cents cannot be classified as a unit rate until the unit is known.
export function moneyKindForField(serviceType, field, pricing = {}) {
  if (!(ALL_OWNER_FIELDS[serviceType] || []).includes(field)) return null;
  if (serviceType === 'CUSTOM' && (field === 'low' || field === 'high')) {
    if (CUSTOM_RATE_UNITS.has(pricing.unit)) return 'unit_rate';
    return pricing.unit === 'flat' ? 'fixed_amount' : 'unresolved_unit';
  }
  if (UNIT_RATE_FIELDS.has(field)) return 'unit_rate';
  if (FIXED_AMOUNT_FIELDS.has(field)) return 'fixed_amount';
  if (MONEY_FIELD_NAMES.has(field)) failure(field, 'This monetary field has no supported price-unit classification.');
  return null;
}

function convertMoneyField(value, serviceType, field, kind, direction, location) {
  const convert = direction === 'toCents' ? dollarAmountToCents : centAmountToDollars;
  if (absentValue(value)) return value;
  const shape = shapedFieldKeys(serviceType, field);
  if (!shape) return convert(value, { kind, path: location });
  if (!isRecord(value)) failure(location, 'The price map must retain its supported product keys and numeric prices.');
  return Object.fromEntries(Object.entries(value).map(([key, row]) => {
    const rowPath = location + '.' + key;
    if (!shape.nested) return [key, convert(row, { kind, path: rowPath })];
    if (!isRecord(row)) failure(rowPath, 'The price row must retain its supported size keys and numeric prices.');
    return [key, Object.fromEntries(Object.entries(row).map(([nestedKey, amount]) => [
      nestedKey, convert(amount, { kind, path: rowPath + '.' + nestedKey })
    ]))];
  }));
}

function convertPricingContainer(container, serviceType, effectivePricing, direction, location) {
  if (!isRecord(container)) return cloneData(container);
  const output = cloneData(container);
  for (const field of ALL_OWNER_FIELDS[serviceType] || []) {
    if (!Object.hasOwn(container, field)) continue;
    const value = container[field];
    const fieldPath = location + '.' + field;
    const kind = moneyKindForField(serviceType, field, effectivePricing);
    if (kind) {
      output[field] = convertMoneyField(value, serviceType, field, kind, direction, fieldPath);
    } else if (serviceType === 'LANDSCAPING_CLEANUP' && field === 'debrisPricing' && isRecord(value)) {
      const convert = direction === 'toCents' ? dollarAmountToCents : centAmountToDollars;
      output[field] = Object.fromEntries(Object.entries(value).map(([level, row]) => {
        if (!isRecord(row) || !Object.hasOwn(row, 'disposalFlat')) return [level, cloneData(row)];
        return [level, {
          ...cloneData(row),
          disposalFlat: convert(row.disposalFlat, { kind: 'fixed_amount', path: fieldPath + '.' + level + '.disposalFlat' })
        }];
      }));
    }
  }
  return output;
}

function convertService(service, direction, location) {
  if (!isRecord(service)) return cloneData(service);
  if (direction === 'toCents') assertUnambiguousPricing(service, location);
  const serviceType = service.serviceType;
  const effective = { ...service, ...(isRecord(service.pricing) ? service.pricing : {}) };
  const output = convertPricingContainer(service, serviceType, effective, direction, location);
  if (Object.hasOwn(service, 'pricing')) {
    output.pricing = convertPricingContainer(service.pricing, serviceType, effective, direction, location + '.pricing');
  }
  if (Array.isArray(service.tiers)) {
    output.tiers = service.tiers.map((tier, index) => {
      if (!isRecord(tier)) return cloneData(tier);
      const result = cloneData(tier);
      if (Object.hasOwn(tier, 'overrides')) {
        const tierPricing = { ...effective, ...(isRecord(tier.overrides) ? tier.overrides : {}) };
        // A custom unit override changes the interpretation of inherited prices
        // as well as explicit overrides. Validate those inherited values without
        // changing or copying them into the stored overrides.
        if (serviceType === 'CUSTOM' && isRecord(tier.overrides) && Object.hasOwn(tier.overrides, 'unit')) {
          convertPricingContainer(tierPricing, serviceType, tierPricing, direction, location + '.tiers[' + index + '].effectivePricing');
        }
        result.overrides = convertPricingContainer(tier.overrides, serviceType, tierPricing, direction, location + '.tiers[' + index + '].overrides');
      }
      return result;
    });
  }
  return output;
}
function convertDefaults(defaults, direction, location) {
  if (!isRecord(defaults)) return cloneData(defaults);
  const output = cloneData(defaults);
  const convert = direction === 'toCents' ? dollarAmountToCents : centAmountToDollars;
  for (const field of DEFAULT_MONEY_FIELDS) {
    if (Object.hasOwn(defaults, field)) {
      output[field] = convert(defaults[field], {
        kind: UNIT_RATE_FIELDS.has(field) ? 'unit_rate' : 'fixed_amount',
        path: location + '.' + field
      });
    }
  }
  return output;
}

// The recognized public conversion envelopes are a book, the existing preview
// {service, defaults}, and a direct service. Unrelated nested metadata is copied
// unchanged; incidental keys such as low/high never become money on their own.
export function convertPricebookMoney(data, direction) {
  if (!['toCents', 'toDollars'].includes(direction)) failure('', 'Unknown price conversion direction.');
  if (!isRecord(data)) return cloneData(data);
  if (Object.hasOwn(data, 'serviceType')) return convertService(data, direction, 'service');
  const output = cloneData(data);
  if (Array.isArray(data.services)) {
    output.services = data.services.map((service, index) => convertService(service, direction, 'services[' + index + ']'));
  }
  if (isRecord(data.service)) output.service = convertService(data.service, direction, 'service');
  if (Object.hasOwn(data, 'defaults')) output.defaults = convertDefaults(data.defaults, direction, 'defaults');
  return output;
}


const DEFAULT_NUMERIC_FIELDS = new Set([
  'markupPercent','taxPercent','rangeBufferPercent','peakSurchargePercent',
  ...DEFAULT_MONEY_FIELDS
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
  if (typeof value === 'number' || value === undefined) {
    assertDraftNumber(value, location);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertDraftNumericLeaves(child, location + '[' + index + ']'));
    return;
  }
  if (!isRecord(value)) failure(location, 'Enter numeric values for this rate or factor map before saving.');
  for (const [key, child] of Object.entries(value)) assertDraftNumericLeaves(child, location + '.' + key);
}
function validateDraftPricing(container, serviceType, location) {
  if (!isRecord(container)) return;
  for (const [field, definition] of definitionsFor(serviceType) || []) {
    if (!Object.hasOwn(container, field) || container[field] === undefined) continue;
    if (definition.type === 'number') assertDraftNumber(container[field], location + '.' + field);
    else if (definition.type === 'json') {
      if (!isRecord(container[field])) failure(location + '.' + field, 'Enter a supported numeric pricing map before saving.');
      assertDraftNumericLeaves(container[field], location + '.' + field);
    }
  }
  for (const field of Object.keys(CLASS2_DEFAULTS_BY_SERVICE[serviceType] || {})) {
    if (Object.hasOwn(container, field) && container[field] !== undefined) {
      assertDraftNumericLeaves(container[field], location + '.' + field);
    }
  }
}
function validateDraftService(service, location) {
  if (!isRecord(service)) return;
  assertUnambiguousPricing(service, location);
  validateDraftPricing(service, service.serviceType, location);
  if (Object.hasOwn(service, 'pricing')) validateDraftPricing(service.pricing, service.serviceType, location + '.pricing');
  if (Array.isArray(service.tiers)) service.tiers.forEach((tier, index) => {
    if (isRecord(tier)) validateDraftPricing(tier.overrides, service.serviceType, location + '.tiers[' + index + '].overrides');
  });
}
export function validatePricebookNumericDraft(data) {
  if (!isRecord(data)) failure('', 'A price-book object is required before saving.');
  if (Object.hasOwn(data, 'serviceType')) validateDraftService(data, 'service');
  else {
    if (Array.isArray(data.services)) data.services.forEach((service, index) => validateDraftService(service, 'services[' + index + ']'));
    if (isRecord(data.service)) validateDraftService(data.service, 'service');
    if (isRecord(data.defaults)) {
      for (const field of DEFAULT_NUMERIC_FIELDS) {
        if (Object.hasOwn(data.defaults, field)) {
          assertDraftNumber(data.defaults[field], 'defaults.' + field, NULLABLE_DEFAULT_NUMERIC_FIELDS.has(field));
        }
      }
      if (Object.hasOwn(data.defaults, 'peakMonths')) {
        if (!Array.isArray(data.defaults.peakMonths)) failure('defaults.peakMonths', 'Enter the configured month numbers before saving.');
        data.defaults.peakMonths.forEach((month, index) => assertDraftNumber(month, 'defaults.peakMonths[' + index + ']'));
      }
    }
  }
  convertPricebookMoney(data, 'toCents');
  return true;
}
