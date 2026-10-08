// UI identities never cross an API boundary. Persisted identities come only
// from the server; a restored deletion is a new service, not a revived receipt.
export const RECEIPT_FIELDS = ['origin', 'quoteDoneApproval', 'confirmedFields', 'approvedValues', 'zeroPricePolicy'];
const immutable = new Set(['id', 'serviceType', 'source', ...RECEIPT_FIELDS, '__clientTempId', 'createdAt', 'updatedAt']);
const absent = Symbol('absent');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const copy = value => value === absent ? absent : structuredClone(value);
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
  function merge(b, l, r, path, service) {
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
      if (l && r) services.push(remoteMetadata(merge(absent, editable(l), editable(r), ['services', key], r), r));
      else if (r) services.push(copy(r));
      else if (l) services.push(newService(l, l.__clientTempId || key));
    } else if (!l || !r) {
      if (!l && !r) continue;
      const survivor = l || r;
      if (sameConflictValue(editable(survivor), editable(b))) continue;
      const result = conflict(['services', key], b, l || absent, r || absent, l ? 'remote_deleted' : 'local_deleted', survivor);
      if (result !== absent) services.push(r ? copy(r) : newService(result, l.__clientTempId || 'restored:' + key));
    } else services.push(remoteMetadata(merge(editable(b), editable(l), editable(r), ['services', key], r), r));
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
