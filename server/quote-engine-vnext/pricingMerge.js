// Shared exact tier merging for the engine and both measurement forms.
import {snapshotPlainData} from './safeData.js';

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
  return mergePricingSnapshots(
    pricingSnapshotOrThrow(base, 'basePricing'),
    pricingSnapshotOrThrow(override, 'tierOverrides')
  );
}

export function mergePricingVNext(base, override) {
  const merged = mergePricingForValidationVNext(base, override);
  try {
    return structuredClone(merged);
  } catch {
    throw new TypeError('Merged pricing contains values that cannot be returned as plain quote data.');
  }
}

