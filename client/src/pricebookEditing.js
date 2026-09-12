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

export function editServiceField(service, field, value) {
  const pricing = servicePricing(service);
  const next = pricing === service ? { ...service, [field]: value }
    : { ...service, ...(Object.hasOwn(service, field) ? { [field]:value } : {}), pricing: { ...pricing, [field]: value } };
  if (['AI_SUGGESTED', 'AI_INTERVIEW'].includes(service.source) && service.confirmedFields?.[field] === true
      && !sameValue(pricing?.[field], value)) {
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
      services.push({ serviceType:service.serviceType, service:service.name, tiers:[], validationInputs:structuredClone(service.sampleInputs) });
    }
  }
  return services;
}
