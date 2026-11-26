// Starting factors are copied into a service when it is saved, so a changed
// starting value never reaches a saved service by itself. A saved value that
// still equals the old starting value is offered the new value in one action
// (the owner may have kept or typed that value; equality is all that is known).
// Values that differ from the old starting value are left alone.
export const STARTING_FACTOR_UPDATES = Object.freeze({
  ROOFING_REPLACEMENT: Object.freeze([
    Object.freeze({path: 'wasteFactorByComplexity.moderate', previous: 0.13, current: 0.15, label: 'Hip roof (moderate) material waste', from: '13%', to: '15%'}),
    // Only services still on the earlier roofing rules use this multiplier.
    Object.freeze({path: 'pitchMultiplier.medium', previous: 1.15, current: 1, label: 'Walkable (medium) pitch labor', from: '1.15', to: '1.00', earlierRoofRulesOnly: true})
  ]),
  ROOFING_REPAIR: Object.freeze([
    Object.freeze({path: 'pitchMultiplier.medium', previous: 1.15, current: 1, label: 'Walkable (medium) pitch labor', from: '1.15', to: '1.00'})
  ]),
  LANDSCAPING_MULCH: Object.freeze([
    Object.freeze({path: 'mulchOverageFactor', previous: 1.15, current: 1.10, label: 'Mulch ordering overage', from: '15%', to: '10%'})
  ]),
  LANDSCAPING_PLANTING: Object.freeze([
    Object.freeze({path: 'mulchOverageFactor', previous: 1.15, current: 1.10, label: 'Mulch ordering overage', from: '15%', to: '10%'})
  ]),
  // The sod waste starting value changed on November 25, 2026 (second audit of
  // v51) without this offer, so services saved at 5% were never told.
  LANDSCAPING_SOD: Object.freeze([
    Object.freeze({path: 'sodWasteFactor', previous: 0.05, current: 0.10, label: 'Sod material waste allowance', from: '5%', to: '10%'})
  ])
});

const rootOf = path => path.split('.')[0];
const leafOf = path => path.split('.').slice(1);
function valueAt(root, keys) {
  let value = root;
  for (const key of keys) value = value && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
  return value;
}

// readRoot(field) returns the saved value of a top-level pricing field.
export function pendingStartingFactorUpdates(serviceType, readRoot, {earlierRoofRules = true} = {}) {
  return (STARTING_FACTOR_UPDATES[serviceType] || []).filter(update =>
    (!update.earlierRoofRulesOnly || earlierRoofRules) &&
    Object.is(valueAt(readRoot(rootOf(update.path)), leafOf(update.path)), update.previous));
}

// The new top-level values to save for the given updates, keyed by field.
export function startingFactorUpdateValues(updates, readRoot) {
  const out = {};
  for (const update of updates) {
    const root = rootOf(update.path), keys = leafOf(update.path);
    if (!keys.length) { out[root] = update.current; continue; }
    const value = structuredClone(out[root] ?? readRoot(root) ?? {});
    let target = value;
    for (const key of keys.slice(0, -1)) target = target[key] ??= {};
    target[keys.at(-1)] = update.current;
    out[root] = value;
  }
  return out;
}
