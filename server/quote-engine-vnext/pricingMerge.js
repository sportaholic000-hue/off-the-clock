// Shared exact tier merging for the engine and both measurement forms.
import {snapshotPlainData} from './safeData.js';
import {withCurrentFloatConditionNames} from './floatConditionNames.js';
import {carpetUnitOf,exactCarpetConversion} from './carpetUnitConversion.js';

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function pricingSnapshotOrThrow(value, path) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  const snapshot = snapshotPlainData(value, path);
  if (!snapshot.ok) {
    throw new TypeError(`${path} could not be read safely at ${snapshot.errorPath}: ${snapshot.reason}.`);
  }
  if (snapshot.nonPlainPaths.length) {
    throw new TypeError(`${path} must contain only plain data objects; ${snapshot.nonPlainPaths[0]} is not plain data.`);
  }
  return snapshot.value;
}

export function clonePricingForDiagnostics(value) {
  if (value === null || typeof value !== 'object') return value;
  const out = Array.isArray(value)
    ? new Array(value.length)
    : Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype);
  for (const key of Object.keys(value)) {
    Object.defineProperty(out, key, {
      value: clonePricingForDiagnostics(value[key]),
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return out;
}

function mergePricingSnapshots(base, override) {
  const out = clonePricingForDiagnostics(base);
  for (const [key, value] of Object.entries(override)) {
    const mergedValue = isPlainObject(value) && isPlainObject(out[key])
      ? mergePricingSnapshots(out[key], value)
      : clonePricingForDiagnostics(value);
    Object.defineProperty(out, key, {
      value: mergedValue,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  return out;
}

export function mergePricingForValidationVNext(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    throw new TypeError('Base pricing and tier overrides must both be objects.');
  }
  // Each level carries an earlier condition name under its current name before
  // the levels combine, so a tier's explicit value wins whichever name it uses.
  const baseSnapshot = withCurrentFloatConditionNames(pricingSnapshotOrThrow(base, 'basePricing'));
  const overrideSnapshot = withCurrentFloatConditionNames(pricingSnapshotOrThrow(override, 'tierOverrides'));
  return withInheritedCarpetInTierUnit(baseSnapshot, overrideSnapshot, mergePricingSnapshots(baseSnapshot, overrideSnapshot));
}

// A tier on its own carpet unit reads a carpet price it inherits from the base
// in that unit, whatever order the prices and the unit were saved in. A price
// with no exact equivalent in the tier's unit is never rounded: the tier has no
// carpet price there until it is given its own.
export const CARPET_PRICE_FIELDS = Object.freeze(['laborPerSqft', 'materialPerSqft']);
function withInheritedCarpetInTierUnit(base, override, merged) {
  if (!Object.hasOwn(override, 'carpetPriceUnit')) return merged;
  const before = carpetUnitOf(base.carpetPriceUnit), after = carpetUnitOf(override.carpetPriceUnit);
  if (before === after) return merged;
  for (const field of CARPET_PRICE_FIELDS) {
    if (isPlainObject(override[field]) && Object.hasOwn(override[field], 'carpet')) continue;
    const inherited = isPlainObject(base[field]) ? base[field].carpet : undefined;
    if (typeof inherited !== 'number') continue;
    const converted = exactCarpetConversion(inherited, before, after);
    const { carpet, ...others } = merged[field];
    merged[field] = converted === null ? others : { ...others, carpet: converted };
  }
  return merged;
}

export function mergePricingVNext(base, override) {
  const merged = mergePricingForValidationVNext(base, override);
  try {
    return structuredClone(merged);
  } catch {
    throw new TypeError('Merged pricing contains values that cannot be returned as plain quote data.');
  }
}

