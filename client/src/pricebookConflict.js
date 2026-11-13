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
// A service keeps them under `pricing` or directly on the service (a starter
// suggestion used as a draft); a value under `pricing` wins, as when quoting.
const CARPET_PRICE_FIELDS = ['laborPerSqft', 'materialPerSqft'];
const CARPET_KEYS = ['carpetPriceUnit', ...CARPET_PRICE_FIELDS];
export const CARPET_GROUP_LABEL = 'Carpet price unit and carpet prices';
const nestedOf = service => record(service) && record(service.pricing) ? service.pricing : null;
function placement(service, key) {
  if (nestedOf(service) && Object.hasOwn(service.pricing, key)) return 'pricing';
  return record(service) && Object.hasOwn(service, key) ? 'root' : null;
}
const placedValue = (service, key) => placement(service, key) === 'pricing' ? service.pricing[key] : service[key];
function carpetGroup(service) {
  const group = {};
  if (placement(service, 'carpetPriceUnit')) group.carpetPriceUnit = placedValue(service, 'carpetPriceUnit');
  for (const field of CARPET_PRICE_FIELDS) {
    const map = placement(service, field) ? placedValue(service, field) : undefined;
    if (record(map) && Object.hasOwn(map, 'carpet')) group[field] = {carpet:map.carpet};
  }
  return group;
}
function withoutCarpetKeys(container) {
  if (!record(container)) return container;
  const rest = {...container};
  delete rest.carpetPriceUnit;
  for (const field of CARPET_PRICE_FIELDS) if (record(rest[field]) && Object.hasOwn(rest[field], 'carpet')) {
    const {carpet, ...others} = rest[field];
    rest[field] = others;
  }
  return rest;
}
function withoutCarpetGroup(service) {
  if (!record(service)) return service;
  const rest = withoutCarpetKeys(service);
  if (nestedOf(service)) rest.pricing = withoutCarpetKeys(service.pricing);
  return rest;
}
// Puts the kept carpet group back where the merged service keeps that setting,
// else where the session it came from kept it.
function withCarpetGroup(merged, group, source) {
  const result = {...merged};
  if (record(result.pricing)) result.pricing = {...result.pricing};
  for (const key of CARPET_KEYS) {
    const where = record(result.pricing) && Object.hasOwn(result.pricing, key) ? 'pricing'
      : Object.hasOwn(result, key) ? 'root' : placement(source, key) || (record(result.pricing) ? 'pricing' : 'root');
    const target = where === 'pricing' ? result.pricing : result;
    if (key === 'carpetPriceUnit') {
      if (Object.hasOwn(group, key)) target[key] = group[key]; else delete target[key];
      continue;
    }
    const others = record(target[key]) ? Object.fromEntries(Object.entries(target[key]).filter(([name]) => name !== 'carpet')) : undefined;
    if (group[key]) target[key] = {...(others || {}), carpet:group[key].carpet};
    else if (others && Object.keys(others).length) target[key] = others;
    else if (placement(source, key) === where && record(placedValue(source, key))) target[key] = {};
    else delete target[key];
  }
  return result;
}
const unitOf = value => value === 'square_yard' ? 'square_yard' : 'square_foot';
const carpetUnit = service => unitOf(carpetGroup(service).carpetPriceUnit);
// What a carpet price means, stated per square yard (always exact), so the same
// number entered in different units never reads as the same price.
const perYard = (value, unit) => typeof value === 'number' && unit === 'square_foot' ? exactCarpetConversion(value, 'square_foot', 'square_yard') : value;
function carpetMeaning(service) {
  const group = carpetGroup(service), unit = unitOf(group.carpetPriceUnit);
  return [unit, ...CARPET_PRICE_FIELDS.map(field => group[field] ? perYard(group[field].carpet, unit) : null)];
}
// A price option's carpet prices stated per square yard, in the unit each one
// is read in: the option's own unit, else the service's.
function tiersMeaning(tiers, unit) {
  if (!Array.isArray(tiers)) return tiers;
  return tiers.map(tier => {
    if (!record(tier?.overrides)) return tier;
    const own = Object.hasOwn(tier.overrides, 'carpetPriceUnit') && tier.overrides.carpetPriceUnit !== undefined;
    const overrides = {...tier.overrides};
    for (const field of CARPET_PRICE_FIELDS) if (record(overrides[field]) && Object.hasOwn(overrides[field], 'carpet')) overrides[field] = {...overrides[field], carpet:perYard(overrides[field].carpet, own ? unitOf(overrides.carpetPriceUnit) : unit)};
    return {...tier, overrides};
  });
}
// Price options kept from one session, read on the service's merged carpet
// unit: an option that uses the service's unit has its own carpet prices
// restated exactly in that unit, as the editor does when the unit changes; an
// inexact one stops recovery.
function alignTierCarpet(tiers, before, after) {
  if (!Array.isArray(tiers) || before === after) return tiers;
  return tiers.map(tier => {
    if (!record(tier?.overrides) || Object.hasOwn(tier.overrides, 'carpetPriceUnit')) return tier;
    const overrides = {...tier.overrides};
    for (const field of CARPET_PRICE_FIELDS) {
      if (!record(overrides[field]) || typeof overrides[field].carpet !== 'number') continue;
      const converted = exactCarpetConversion(overrides[field].carpet, before, after);
      if (converted === null) throw Error(`The carpet prices in price option "${tier.name || 'Unnamed option'}" cannot be converted exactly to the carpet unit kept for this service. Edit that option's carpet prices, then reopen conflict recovery.`);
      overrides[field] = {...overrides[field], carpet:converted};
    }
    return {...tier, overrides};
  });
}
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
  // The carpet unit and prices of a service, wherever they are stored, merge as
  // one value whenever the sessions' carpet units differ (from each other or
  // from the opened version): a price is then compared by what it means, and
  // only one session's unit with that session's prices can be kept.
  function mergeService(b, l, r, key, service) {
    const path = ['services', key];
    const units = {base:b === absent ? null : carpetUnit(b), local:carpetUnit(l), remote:carpetUnit(r)};
    const grouped = units.local !== units.remote || (b !== absent && (units.base !== units.local || units.base !== units.remote));
    let source = null;
    if (grouped) {
      const mb = b === absent ? null : carpetMeaning(b), ml = carpetMeaning(l), mr = carpetMeaning(r);
      if (b !== absent && sameConflictValue(ml, mb)) source = r;
      else if ((b !== absent && sameConflictValue(mr, mb)) || sameConflictValue(ml, mr)) source = l;
      else {
        const conflictKey = JSON.stringify([...path, 'pricing', 'carpet']);
        const choice = choices[conflictKey];
        conflicts.push({key:conflictKey, path:[...path, 'pricing'], kind:'carpet', label:CARPET_GROUP_LABEL, service, sides:{base:b === absent ? undefined : copy(b), local:copy(l), remote:copy(r)}, baseMissing:b === absent, localMissing:false, remoteMissing:false,
          // Shown with the unit each side actually uses (blank is square foot).
          base:b === absent ? undefined : {...copy(carpetGroup(b)), carpetPriceUnit:units.base}, local:{...copy(carpetGroup(l)), carpetPriceUnit:units.local}, remote:{...copy(carpetGroup(r)), carpetPriceUnit:units.remote}, choice});
        source = choice === 'local' ? l : r;
      }
    }
    const merged = grouped ? carpetUnit(source) : units.local;
    const strip = value => {
      if (value === absent) return absent;
      const {tiers, ...rest} = value;
      return grouped ? withoutCarpetGroup(rest) : rest;
    };
    let rest = mergeValue(strip(b), strip(l), strip(r), path, service);
    if (grouped) rest = withCarpetGroup(rest, copy(carpetGroup(source)), source);
    const tiersOf = value => value !== absent && Object.hasOwn(value, 'tiers') ? value.tiers : absent;
    const tiers = mergeTiers(tiersOf(b), tiersOf(l), tiersOf(r), [...path, 'tiers'], service, units, merged, {base:b, local:l, remote:r});
    // Keep the saved field order.
    const order = [...new Set([...(b === absent ? [] : Object.keys(b)), ...Object.keys(r), ...Object.keys(l), ...Object.keys(rest)])];
    return Object.fromEntries(order.flatMap(name => name === 'tiers' ? (tiers === absent ? [] : [[name, tiers]]) : Object.hasOwn(rest, name) ? [[name, rest[name]]] : []));
  }
  // Price options merge as one list, compared by what their carpet prices mean
  // in each session's unit; the kept list is read on the merged carpet unit.
  function mergeTiers(b, l, r, path, service, units, merged, sides) {
    const nb = b === absent ? absent : tiersMeaning(b, units.base), nl = l === absent ? absent : tiersMeaning(l, units.local), nr = r === absent ? absent : tiersMeaning(r, units.remote);
    let side;
    if (sameConflictValue(nl, nb)) side = 'remote';
    else if (sameConflictValue(nr, nb) || sameConflictValue(nl, nr)) side = 'local';
    else {
      conflict(path, b, l, r, 'value', service);
      const row = conflicts[conflicts.length - 1];
      row.sides = {base:sides.base === absent ? undefined : copy(sides.base), local:copy(sides.local), remote:copy(sides.remote)};
      side = row.choice === 'local' ? 'local' : 'remote';
    }
    const value = side === 'local' ? l : r;
    return value === absent ? absent : alignTierCarpet(copy(value), units[side], merged);
  }
  const merge = (b, l, r, path, service) => mergeValue(b, l, r, path, service);
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
      if (l && r) services.push(remoteMetadata(mergeService(absent, editable(l), editable(r), key, r), r));
      else if (r) services.push(copy(r));
      else if (l) services.push(newService(l, l.__clientTempId || key));
    } else if (!l || !r) {
      if (!l && !r) continue;
      const survivor = l || r;
      if (sameConflictValue(editable(survivor), editable(b))) continue;
      const result = conflict(['services', key], b, l || absent, r || absent, l ? 'remote_deleted' : 'local_deleted', survivor);
      if (result !== absent) services.push(r ? copy(r) : newService(result, l.__clientTempId || 'restored:' + key));
    } else services.push(remoteMetadata(mergeService(editable(b), editable(l), editable(r), key, r), r));
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
