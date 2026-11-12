import {exactCarpetConversion} from '../../server/quote-engine-vnext/carpetUnitConversion.js';
// UI identities never cross an API boundary. Persisted identities come only
// from the server; a restored deletion is a new service, not a revived receipt.
export const RECEIPT_FIELDS = ['origin', 'quoteDoneApproval', 'confirmedFields', 'approvedValues', 'zeroPricePolicy', 'startingValueState', 'startingValueAdoptions', 'dependentLineState'];
const immutable = new Set(['id', 'serviceType', 'source', ...RECEIPT_FIELDS, '__clientTempId', 'createdAt', 'updatedAt']);
const absent = Symbol('absent');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => value === absent ? absent : structuredClone(value);
// The carpet price unit and the carpet prices are one setting: a unit from one
// session read with prices entered in the other session's unit misprices
// carpet nine times over or under. They merge, and conflict, as one value.
const CARPET_PRICE_FIELDS = ['laborPerSqft', 'materialPerSqft'];
export const CARPET_GROUP_LABEL = 'Carpet price unit and carpet prices';
function carpetGroup(pricing) {
  if (!record(pricing)) return {};
  const group = {};
  if (Object.hasOwn(pricing, 'carpetPriceUnit')) group.carpetPriceUnit = pricing.carpetPriceUnit;
  for (const field of CARPET_PRICE_FIELDS) if (record(pricing[field]) && Object.hasOwn(pricing[field], 'carpet')) group[field] = {carpet:pricing[field].carpet};
  return group;
}
function withoutCarpetGroup(pricing) {
  if (!record(pricing)) return pricing;
  const rest = {...pricing};
  delete rest.carpetPriceUnit;
  for (const field of CARPET_PRICE_FIELDS) if (record(rest[field]) && Object.hasOwn(rest[field], 'carpet')) {
    const {carpet, ...others} = rest[field];
    rest[field] = others;
  }
  return rest;
}
function withCarpetGroup(pricing, group, source) {
  const result = {...pricing};
  delete result.carpetPriceUnit;
  if (Object.hasOwn(group, 'carpetPriceUnit')) result.carpetPriceUnit = group.carpetPriceUnit;
  for (const field of CARPET_PRICE_FIELDS) {
    const others = record(result[field]) ? Object.fromEntries(Object.entries(result[field]).filter(([key]) => key !== 'carpet')) : undefined;
    if (group[field]) result[field] = {...(others || {}), carpet:group[field].carpet};
    else if (others && Object.keys(others).length) result[field] = others;
    else if (record(source) && record(source[field])) result[field] = {};
    else delete result[field];
  }
  return result;
}
const carpetUnit = pricing => record(pricing) && pricing.carpetPriceUnit === 'square_yard' ? 'square_yard' : 'square_foot';
export function sameConflictValue(a, b) {
  if (Object.is(a, b)) return true;
  if (!record(a) || !record(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => sameConflictValue(v, b[i]));
  }
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameConflictValue(a[key], b[key]));
}
export function withClientServiceIds(services) {
  return services.map(service => service.id || service.__clientTempId ? service : {...service, __clientTempId:crypto.randomUUID()});
}
export function pricebookPayload(value) {
  if (Array.isArray(value)) return value.map(pricebookPayload);
  if (!record(value)) return value;
  // Strip only identities attached to service objects. Unknown pricing or
  // customer-input keys must reach validation rather than disappear silently.
  const service = Object.hasOwn(value, 'serviceType');
  return Object.fromEntries(Object.entries(value).filter(([key]) => !service || key !== '__clientTempId').map(([key, item]) => [key, pricebookPayload(item)]));
}
export function isRevisionConflict(error) {
  return error?.status === 409 && error.details?.code === 'REVISION_CONFLICT';
}
function editable(service) {
  return Object.fromEntries(Object.entries(service).filter(([key]) => !immutable.has(key)));
}
function remoteMetadata(draft, remote) {
  const result = {...draft};
  for (const field of immutable) {
    delete result[field];
    if (Object.hasOwn(remote, field)) result[field] = copy(remote[field]);
  }
  return result;
}
function newService(service, identity) {
  const result = {...copy(service), __clientTempId:identity};
  delete result.id;
  delete result.createdAt;
  delete result.updatedAt;
  for (const field of RECEIPT_FIELDS) delete result[field];
  return result;
}
function serviceKey(service) {
  if (service.id) return service.id.toLowerCase();
  if (service.__clientTempId) return 'local:' + service.__clientTempId;
  throw Error('A draft service is missing its editing identity. Reopen conflict recovery.');
}
function indexServices(services) {
  const map = new Map();
  for (const service of services) {
    const key = serviceKey(service);
    if (map.has(key)) throw Error('Duplicate service identities must be corrected before reconciling this price book.');
    map.set(key, service);
  }
  return map;
}

// Objects merge field by field. Arrays (including tiers without stable IDs)
// are one value: concurrent changes require an explicit choice, never an
// index-based guess. Missing fields are distinct from null, false and zero.
// Price options merge as one list. When the kept list comes from the session
// whose service-wide carpet unit was not kept, an option that inherits that
// unit has its own carpet prices restated exactly in the kept unit, as the
// editor does when the unit changes; an inexact one stops recovery.
function alignTierCarpet(merged, local, remote) {
  if (!record(merged) || !Array.isArray(merged.tiers)) return merged;
  const from = [local, remote].find(side => Array.isArray(side?.tiers) && sameConflictValue(side.tiers, merged.tiers));
  if (!from) return merged;
  const before = carpetUnit(from.pricing), after = carpetUnit(merged.pricing);
  if (before === after) return merged;
  const tiers = merged.tiers.map(tier => {
    const overrides = record(tier?.overrides) ? {...tier.overrides} : tier?.overrides;
    if (!record(overrides) || Object.hasOwn(overrides, 'carpetPriceUnit')) return tier;
    for (const field of CARPET_PRICE_FIELDS) {
      if (!record(overrides[field]) || typeof overrides[field].carpet !== 'number') continue;
      const converted = exactCarpetConversion(overrides[field].carpet, before, after);
      if (converted === null) throw Error(`The carpet prices in price option "${tier.name || 'Unnamed option'}" cannot be converted exactly to the carpet unit kept for this service. Edit that option's carpet prices, then reopen conflict recovery.`);
      overrides[field] = {...overrides[field], carpet:converted};
    }
    return {...tier, overrides};
  });
  return {...merged, tiers};
}
export function reconcilePricebook(base, local, remote, choices = {}) {
  const conflicts = [];
  function conflict(path, b, l, r, kind = 'value', service) {
    const key = JSON.stringify(path);
    const choice = choices[key];
    const row = {key, path, kind, service, baseMissing:b === absent, localMissing:l === absent, remoteMissing:r === absent,
      base:b === absent ? undefined : copy(b), local:l === absent ? undefined : copy(l), remote:r === absent ? undefined : copy(r), choice};
    conflicts.push(row);
    return copy(choice === 'local' ? l : r);
  }
  function mergeCarpet(b, l, r, path, service) {
    const gb = b === absent ? {} : carpetGroup(b), gl = carpetGroup(l), gr = carpetGroup(r);
    let group, source;
    if (sameConflictValue(gl, gb)) { group = gr; source = r; }
    else if (sameConflictValue(gr, gb) || sameConflictValue(gl, gr)) { group = gl; source = l; }
    else {
      const key = JSON.stringify([...path, 'carpet']);
      const choice = choices[key];
      conflicts.push({key, path, kind:'carpet', label:CARPET_GROUP_LABEL, service, baseMissing:b === absent, localMissing:false, remoteMissing:false,
        // Shown with the unit each side actually uses (blank is square foot).
        base:b === absent ? undefined : {...copy(gb), carpetPriceUnit:carpetUnit(b)}, local:{...copy(gl), carpetPriceUnit:carpetUnit(l)}, remote:{...copy(gr), carpetPriceUnit:carpetUnit(r)}, choice});
      if (choice === 'local') { group = gl; source = l; } else { group = gr; source = r; }
    }
    const rest = mergeValue(b === absent ? absent : withoutCarpetGroup(b), withoutCarpetGroup(l), withoutCarpetGroup(r), path, service);
    return {pricing:withCarpetGroup(rest, copy(group), source), source};
  }
  function merge(b, l, r, path, service) {
    // A service's pricing: the carpet unit and prices as one value.
    if (path.length === 3 && path[0] === 'services' && record(l) && record(r) && (record(b) || b === absent) && path[2] === 'pricing') return mergeCarpet(b, l, r, path, service).pricing;
    return mergeValue(b, l, r, path, service);
  }
  function mergeValue(b, l, r, path, service) {
    if (sameConflictValue(l, b)) return copy(r);
    if (sameConflictValue(r, b) || sameConflictValue(l, r)) return copy(l);
    // Two sessions registering the same new catalog name mint different UI
    // UUIDs. Keep the identity already saved remotely; it is not a price or
    // an owner decision. All actual offering/pricing differences still merge.
    const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    if (b === absent && path[0] === 'services' && path[2] === 'knownOfferings' && uuid(l) && uuid(r)) return copy(r);
    if (record(l) && record(r) && (record(b) || b === absent)) {
      const keys = new Set([...Object.keys(b === absent ? {} : b), ...Object.keys(r), ...Object.keys(l)]);
      const entries = [];
      for (const key of keys) {
        const value = merge(b !== absent && Object.hasOwn(b, key) ? b[key] : absent,
          Object.hasOwn(l, key) ? l[key] : absent, Object.hasOwn(r, key) ? r[key] : absent, [...path, key], service);
        if (value !== absent) entries.push([key, value]);
      }
      return Object.fromEntries(entries);
    }
    return conflict(path, b, l, r, 'value', service);
  }
  const bases = indexServices(base.services || []), locals = indexServices(local.services || []), remotes = indexServices(remote.services || []);
  const services = [];
  // Remote ordering is authoritative; append local additions/restorations.
  for (const key of new Set([...remotes.keys(), ...locals.keys(), ...bases.keys()])) {
    const b = bases.get(key), l = locals.get(key), r = remotes.get(key);
    if (!b) {
      if (l && r) services.push(remoteMetadata(alignTierCarpet(merge(absent, editable(l), editable(r), ['services', key], r), l, r), r));
      else if (r) services.push(copy(r));
      else if (l) services.push(newService(l, l.__clientTempId || key));
    } else if (!l || !r) {
      if (!l && !r) continue;
      const survivor = l || r;
      if (sameConflictValue(editable(survivor), editable(b))) continue;
      const result = conflict(['services', key], b, l || absent, r || absent, l ? 'remote_deleted' : 'local_deleted', survivor);
      if (result !== absent) services.push(r ? copy(r) : newService(result, l.__clientTempId || 'restored:' + key));
    } else services.push(remoteMetadata(alignTierCarpet(merge(editable(b), editable(l), editable(r), ['services', key], r), l, r), r));
  }
  const draft = {...copy(remote), defaults:merge(base.defaults, local.defaults, remote.defaults, ['defaults']), services, revision:remote.revision};
  return {draft, conflicts, unresolved:conflicts.filter(row => !['local', 'remote'].includes(row.choice))};
}

// NEEDS PRICING also contains owner decisions and pending approvals. Those
// must remain saveable. Only typed malformed/incompatible diagnostics block
// reconciliation, including diagnostics on unavailable tiers and scope.
export function reconciliationErrors(validation) {
  if (!Array.isArray(validation?.statuses)) throw Error('The merged draft could not be validated. Try again.');
  const errors = [];
  function visit(value) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!record(value)) return;
    for (const diagnostic of value.ownerDiagnostics || []) {
      if (['invalid', 'unsupported', 'cross_field'].includes(diagnostic.type)) errors.push(diagnostic.message || diagnostic.path);
    }
    for (const [key, child] of Object.entries(value)) if (key !== 'ownerDiagnostics') visit(child);
  }
  visit(validation.statuses);
  return [...new Set(errors)];
}
