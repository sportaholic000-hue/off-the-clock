const MAX_SNAPSHOT_DEPTH = 100;
const MAX_SNAPSHOT_VALUES = 100_000;

function fail(path, reason) {
  return { ok: false, value: undefined, errorPath: path, reason };
}

function joinPath(path, key) {
  return path ? `${path}.${String(key)}` : String(key);
}

function clonePlainData(value, path, ancestors, nonPlainPaths, state, depth = 0, isRoot = false) {
  state.values += 1;
  if (state.values > MAX_SNAPSHOT_VALUES) return fail(path, `quote data exceeds ${MAX_SNAPSHOT_VALUES} inspected values`);
  if (depth > MAX_SNAPSHOT_DEPTH) return fail(path, `quote data nesting exceeds ${MAX_SNAPSHOT_DEPTH} levels`);
  if (value === null || typeof value !== 'object') return { ok: true, value };

  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return fail(path, 'properties could not be inspected safely');
  }

  const array = Array.isArray(value);
  if (!array && prototype !== Object.prototype && prototype !== null) {
    if (isRoot) return fail(path, 'value is not a plain data object');
    nonPlainPaths.push(path);
  }
  if (ancestors.has(value)) return fail(path, 'circular data is not supported');
  ancestors.add(value);

  const output = array ? new Array(value.length) : Object.create(prototype === null ? null : Object.prototype);
  for (const key of Reflect.ownKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable) continue;
    const propertyPath = joinPath(path, typeof key === 'symbol' ? key.description || 'symbol' : key);
    if (typeof key === 'symbol') {
      ancestors.delete(value);
      return fail(propertyPath, 'enumerable symbol keys are not supported');
    }
    if (!Object.hasOwn(descriptor, 'value')) {
      ancestors.delete(value);
      return fail(propertyPath, 'accessor properties are not accepted as quote data');
    }
    const cloned = clonePlainData(descriptor.value, propertyPath, ancestors, nonPlainPaths, state, depth + 1);
    if (!cloned.ok) {
      ancestors.delete(value);
      return cloned;
    }
    Object.defineProperty(output, key, {
      value: cloned.value,
      enumerable: true,
      configurable: true,
      writable: true
    });
  }
  ancestors.delete(value);
  return { ok: true, value: output };
}

export function snapshotPlainData(value, rootPath = 'value') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fail(rootPath, 'value must be a plain data object');
  }
  const nonPlainPaths = [];
  const snapshot = clonePlainData(value, rootPath, new Set(), nonPlainPaths, { values: 0 }, 0, true);
  return snapshot.ok ? { ...snapshot, nonPlainPaths } : snapshot;
}

export function denseArrayIssue(value) {
  if (!Array.isArray(value)) return { path: '', reason: 'must be an array' };
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return { path: String(index), reason: 'array entry is missing' };
  }
  const extraKey = Object.keys(value).find(key => !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length);
  return extraKey === undefined ? null : { path: extraKey, reason: 'named array properties are not supported' };
}

export function ownDataValue(source, key) {
  if (!source || typeof source !== 'object') return { ok: false, present: false, value: undefined };
  try {
    const descriptor = Object.getOwnPropertyDescriptor(source, key);
    if (!descriptor) return { ok: true, present: false, value: undefined };
    if (!Object.hasOwn(descriptor, 'value')) return { ok: false, present: true, value: undefined };
    return { ok: true, present: true, value: descriptor.value };
  } catch {
    return { ok: false, present: false, value: undefined };
  }
}
