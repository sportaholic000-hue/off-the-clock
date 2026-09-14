import { ALL_OWNER_FIELDS } from '../../server/priceBookMetadata.js';

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys=Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right,key) && sameValue(left[key],right[key]));
}

export function servicePricing(service) {
  return service?.pricing && typeof service.pricing === 'object' && !Array.isArray(service.pricing)
    ? service.pricing : service;
}

// Resolve an unambiguous root-only field for display without moving it. If both
// copies exist, the displayed nested candidate does not resolve their conflict:
// draft/save validation still checks both, and only an explicit edit can agree them.
export function serviceFieldValue(service, field) {
  const pricing = servicePricing(service);
  return pricing && Object.hasOwn(pricing, field) ? pricing[field] : service?.[field];
}

export function editServiceField(service, field, value) {
  const pricing = servicePricing(service);
  const nested = pricing !== service;
  const hasRoot = Object.hasOwn(service, field);
  const hasNested = nested && Object.hasOwn(pricing, field);
  const changed = (hasRoot && !sameValue(service[field], value))
    || (hasNested && !sameValue(pricing[field], value))
    || (!hasRoot && !hasNested && value !== undefined);
  if (!changed) return service;

  // Keep existing placement. An explicit resolving edit updates both copies;
  // a new field uses the service's existing pricing container.
  const next = { ...service };
  if (!nested || hasRoot) next[field] = value;
  if (nested && (hasNested || !hasRoot)) next.pricing = { ...pricing, [field]: value };
  if (['AI_SUGGESTED', 'AI_INTERVIEW'].includes(service.source) && service.confirmedFields?.[field] === true) {
    next.confirmedFields = { ...service.confirmedFields, [field]: false };
  }
  return next;
}

export function editServiceTiers(service, tiers) {
  const next = { ...service, tiers };
  if (!['AI_SUGGESTED', 'AI_INTERVIEW'].includes(service.source)) return next;
  const fields = ALL_OWNER_FIELDS[service.serviceType] || [];
  for (const field of fields) {
    const values = options => (options || []).map(tier => tier.overrides?.[field]);
    if (!sameValue(values(service.tiers), values(tiers)) && service.confirmedFields?.[field] === true) {
      next.confirmedFields = { ...(next.confirmedFields || service.confirmedFields), [field]: false };
    }
  }
  return next;
}

export function editorServiceKey(service, index) {
  return service.id || (service.serviceType + ':' + index);
}

export function editorServices(saved, metadata, businessTypes) {
  const services = [...(saved || [])];
  for (const service of metadata) {
    if (businessTypes.includes(service.serviceType) && !services.some(existing => existing.serviceType === service.serviceType)) {
      services.push({ serviceType:service.serviceType, service:service.name, source:'MANUAL', active:false, tiers:[], validationInputs:structuredClone(service.sampleInputs) });
    }
  }
  return services;
}
