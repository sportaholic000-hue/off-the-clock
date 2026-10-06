import { productKeyFromName } from './pricebookFormatting.js';
import { ALL_OWNER_FIELDS, CLASS2_DEFAULTS_BY_SERVICE } from '../../server/priceBookMetadata.js';
import { allowedPricingFields } from '../../server/quote-engine-vnext/contracts.js';

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  const keys=Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right,key) && sameValue(left[key],right[key]));
}
function nestedPricing(service) {
  return service?.pricing && typeof service.pricing === 'object' && !Array.isArray(service.pricing)
    ? service.pricing : null;
}

// Editors always receive the complete effective pricing view. Nested values win
// only for fields actually stored there; untouched root-only offering/scope
// settings remain visible and are never discarded merely because pricing exists.
export function servicePricing(service) {
  const nested = nestedPricing(service);
  if (!nested) return service;
  const fields = new Set([...(ALL_OWNER_FIELDS[service.serviceType] || []),
    ...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[service.serviceType] || {}),
    ...allowedPricingFields(service.serviceType),
    'offeringMode','offeringDetails','offeringRates','scopeDetails','scopeRates']);
  const inherited = Object.fromEntries([...fields]
    .filter(field => Object.hasOwn(service, field) && !Object.hasOwn(nested, field))
    .map(field => [field, service[field]]));
  return Object.keys(inherited).length ? { ...inherited, ...nested } : nested;
}

export function serviceFieldValue(service, field) {
  return servicePricing(service)?.[field];
}

export function editServiceField(service, field, value) {
  const nested = nestedPricing(service);
  const hasRoot = Object.hasOwn(service, field);
  const hasNested = Boolean(nested && Object.hasOwn(nested, field));
  const changed = (hasRoot && !sameValue(service[field], value))
    || (hasNested && !sameValue(nested[field], value))
    || (!hasRoot && !hasNested && value !== undefined);
  if (!changed) return service;

  // Keep existing placement. An explicit resolving edit updates both copies;
  // a new field uses the service's existing pricing container.
  const next = { ...service };
  if (!nested || hasRoot) next[field] = value;
  if (nested && (hasNested || !hasRoot)) next.pricing = { ...nested, [field]: value };
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

export function removeOwnerFeeSelection(service, fee) {
  const selections = {...service.ownerFeeSelections};
  delete selections[fee];
  return {...service, ownerFeeSelections:selections};
}
export function changeFeeRule(service, fee, mode) {
  const next = {...service, feeRules:{...service.feeRules, [fee]:mode}};
  return mode === 'owner_selected' ? next : removeOwnerFeeSelection(next, fee);
}
export function outdatedOwnerFeeSelections(service) {
  return Object.keys(service.ownerFeeSelections || {}).filter(fee => service.feeRules?.[fee] !== 'owner_selected');
}
export function previewFeeContext(serviceKey, rules = {}) {
  return JSON.stringify([serviceKey, Object.keys(rules).sort().map(fee => [fee, rules[fee]])]);
}

export function reconcilePreviewFees(previous, serviceKey, rules = {}) {
  const context=previewFeeContext(serviceKey,rules);
  if(previous.context===context)return previous;
  const values=previous.serviceKey===serviceKey
    ? Object.fromEntries(Object.entries(previous.values||{}).filter(([fee,value])=>rules[fee]==='customer_selected'&&previous.rules?.[fee]==='customer_selected'&&typeof value==='boolean'))
    : {};
  return {context,serviceKey,rules:{...rules},values};
}

function canonicalEditorValue(value) {
  return Array.isArray(value) ? value.map(canonicalEditorValue)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalEditorValue(value[key])]))
      : value;
}
const sameEditorValue = (a,b) => JSON.stringify(canonicalEditorValue(a)) === JSON.stringify(canonicalEditorValue(b));
export function approvalMatchesDraft(draft, review) {
  return !!review && draft?.revision === review.book.revision &&
    sameEditorValue(draft.defaults, review.book.defaults) &&
    sameEditorValue(draft.services.find(service => service.id === review.service.id), review.service);
}

export function mergeSavedApproval(draft, before, after, serviceId, approvedRevision) {
  const savedService = after.services?.find(service => service.id === serviceId);
  const reviewed = before.services.find(service => service.id === serviceId);
  if (!savedService || !reviewed || draft.revision !== before.revision || after.revision !== approvedRevision ||
      !sameEditorValue(before.defaults, after.defaults) ||
      !sameEditorValue(before.services.filter(s => s.id !== serviceId), after.services.filter(s => s.id !== serviceId))) {
    throw Object.assign(Error('The saved price book changed during approval. Your unsaved edits are still here. Review the newer saved version before saving again.'),{status:409});
  }
  return {...draft, revision:after.revision, updatedAt:after.updatedAt,
    services:draft.services.map(service => {
      if (service.id !== serviceId) return service;
      if (sameEditorValue(service, reviewed) && sameEditorValue(draft.defaults, before.defaults)) return savedService;
      const edited = {...service};
      delete edited.quoteDoneApproval;
      return edited;
    })};
}

export function editBusinessDefault(defaults, field, value) {
  return {...defaults,[field]:value,...(field==='taxMode'&&value==='TAX_NONE'?{taxPercent:0}:{})};
}
export function addPriceTier(tiers) {
  if(tiers.length>=3)return tiers;
  const name=['Good','Better','Best'].find(candidate=>!tiers.some(tier=>String(tier.name||'').trim().toLowerCase()===candidate.toLowerCase()));
  return [...tiers,{name,overrides:{}}];
}
export function renameTierOverride(overrides, oldField, nextField) {
  if(oldField===nextField||!Object.hasOwn(overrides,oldField)||Object.hasOwn(overrides,nextField))return overrides;
  const next={...overrides,[nextField]:overrides[oldField]};
  delete next[oldField];
  return next;
}

export function chooseFenceType(service, name) {
  const { key, error } = productKeyFromName(name);
  if (error) return { error };
  const pricing = servicePricing(service), details = pricing.offeringDetails || {}, known = service.knownOfferings?.fenceType || {};
  const next = editServiceField(service, 'offeringDetails', { terrainSlope:'flat', ...details, fenceType:key });
  return { service:{ ...next, knownOfferings:{ ...(service.knownOfferings || {}), fenceType:{ ...known, ...(Object.hasOwn(known, key) ? {} : { [key]:crypto.randomUUID() }) } } } };
}
