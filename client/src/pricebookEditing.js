import { productKeyFromName } from './pricebookFormatting.js';
import { ALL_OWNER_FIELDS, CLASS2_DEFAULTS_BY_SERVICE } from '../../server/priceBookMetadata.js';
import { allowedPricingFields, CLASS2_DEFINITIONS } from '../../server/quote-engine-vnext/contracts.js';
import {scopeRateDefinitions} from '../../server/scopeConfiguration.js';
import {scopeStructureDiagnostics} from '../../server/quote-engine-vnext/scopePricing.js';
import {mergePricingForValidationVNext} from '../../server/quote-engine-vnext/pricingMerge.js';
import {convertCarpetPrice,CarpetUnitError} from '../../server/carpetPriceUnits.js';
import {exactCarpetConversion} from '../../server/quote-engine-vnext/carpetUnitConversion.js';
export {convertCarpetPrice};

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
  if (value === undefined) {
    delete next[field];
    if (next.pricing && Object.hasOwn(next.pricing, field)) {
      next.pricing = { ...next.pricing };
      delete next.pricing[field];
    }
  }
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
  return service.id || service.__clientTempId || (service.serviceType + ':' + index);
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
    throw Object.assign(Error('The saved price book changed during approval. Your unsaved edits are still here. Review the newer saved version before saving again.'),{status:409, details:{code:'REVISION_CONFLICT'}, remoteBook:after});
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

// A gate definition, its price and its allocations form one editable offering.
// Remove the same gate from tier overrides so recursive merging cannot restore
// an orphan rate. Owner approval receipts remain untouched and become stale in
// the normal save/re-approval flow.
export function removeGateOffering(service, key) {
  const rate='gate_'+key, ratePath='offeringRates.'+rate;
  const without=(map,entry)=>Object.fromEntries(Object.entries(map).filter(([name])=>name!==entry));
  const clean=p=>{
    const next={...p};
    if(p.offeringDetails?.gates&&Object.hasOwn(p.offeringDetails.gates,key))next.offeringDetails={...p.offeringDetails,gates:without(p.offeringDetails.gates,key)};
    if(p.offeringRates&&Object.hasOwn(p.offeringRates,rate))next.offeringRates=without(p.offeringRates,rate);
    for(const field of ['installedLaborPercent','installedMaterialsPercent'])if(p[field]&&Object.hasOwn(p[field],ratePath))next[field]=without(p[field],ratePath);
    return next;
  };
  let next=service;
  // Clean each stored placement independently; unrelated retained root values
  // must not be overwritten with their effective nested counterparts.
  const root=clean(service),nested=service.pricing?clean(service.pricing):null;
  for(const field of ['offeringDetails','offeringRates','installedLaborPercent','installedMaterialsPercent']){
    const changedRoot=root[field]!==service[field],changedNested=nested&&nested[field]!==service.pricing[field];
    if(!changedRoot&&!changedNested)continue;
    next={...next,...(changedRoot?{[field]:root[field]}:{}),...(changedNested?{pricing:{...next.pricing,[field]:nested[field]}}:{})};
    if(['AI_SUGGESTED','AI_INTERVIEW'].includes(service.source)&&service.confirmedFields?.[field]===true)next.confirmedFields={...next.confirmedFields,[field]:false};
  }
  if(service.tiers)next=editServiceTiers(next,service.tiers.map(tier=>({...tier,overrides:clean(tier.overrides||{})})));
  return next;
}

function scopeRateNames(type,pricing,key,includeInactive=false) {
  return Object.entries(scopeRateDefinitions(type,pricing,includeInactive)).filter(([,definition])=>definition.scopeKey===key).map(([name])=>name);
}
function tierOwnsCompleteScope(service,key,tier) {
  const overrides=tier?.overrides||{},detail=overrides.scopeDetails?.[key];
  if(!detail||typeof detail!=='object'||Array.isArray(detail))return false;
  const base=servicePricing(service),support=Object.fromEntries(Object.entries(base).filter(([field])=>!['scopeDetails','scopeRates','installedLaborPercent','installedMaterialsPercent'].includes(field)));
  const candidate={...support,scopeDetails:{[key]:structuredClone(detail)},scopeRates:{...(overrides.scopeRates||{})}};
  const rates=scopeRateNames(service.serviceType,candidate,key);
  if(!rates.length||rates.some(name=>!Object.hasOwn(overrides.scopeRates||{},name)))return false;
  return !scopeStructureDiagnostics(service.serviceType,candidate).some(diagnostic=>diagnostic.path===`scopeDetails.${key}`||diagnostic.path.startsWith(`scopeDetails.${key}.`)||rates.some(name=>diagnostic.path===`scopeRates.${name}`));
}
export function independentScopeTierNames(service,key) {
  return (service.tiers||[]).filter(tier=>tierOwnsCompleteScope(service,key,tier)).map(tier=>tier.name).filter(Boolean);
}
export function removeScopeConfiguration(service,key) {
  const effective=servicePricing(service),baseRates=scopeRateNames(service.serviceType,effective,key,true);
  const without=(map,entry)=>Object.fromEntries(Object.entries(map||{}).filter(([name])=>name!==entry));
  const clean=(pricing,rateNames)=>{
    const next={...pricing};
    if(pricing.scopeDetails&&Object.hasOwn(pricing.scopeDetails,key))next.scopeDetails=without(pricing.scopeDetails,key);
    if(pricing.scopeRates)next.scopeRates=Object.fromEntries(Object.entries(pricing.scopeRates).filter(([name])=>!rateNames.includes(name)));
    for(const field of ['installedLaborPercent','installedMaterialsPercent'])if(pricing[field])next[field]=Object.fromEntries(Object.entries(pricing[field]).filter(([path])=>!rateNames.some(name=>path===`scopeRates.${name}`)));
    return next;
  };
  let next=service;
  const root=clean(service,baseRates),nested=service.pricing?clean(service.pricing,baseRates):null;
  for(const field of ['scopeDetails','scopeRates','installedLaborPercent','installedMaterialsPercent']){
    const changedRoot=root[field]!==service[field],changedNested=nested&&nested[field]!==service.pricing[field];
    if(!changedRoot&&!changedNested)continue;
    next={...next,...(changedRoot?{[field]:root[field]}:{}),...(changedNested?{pricing:{...next.pricing,[field]:nested[field]}}:{})};
    if(['AI_SUGGESTED','AI_INTERVIEW'].includes(service.source)&&service.confirmedFields?.[field]===true)next.confirmedFields={...next.confirmedFields,[field]:false};
  }
  if(service.tiers)next=editServiceTiers(next,service.tiers.map(tier=>{
    if(tierOwnsCompleteScope(service,key,tier)){
      // A complete tier can inherit allocations from the removed base scope.
      // Preserve only those effective values on that tier; never manufacture
      // a missing percentage or overwrite an explicit tier value (even zero).
      const tierEffective=mergePricingForValidationVNext(effective,tier.overrides||{});
      const retainedRates=scopeRateNames(service.serviceType,tierEffective,key);
      let overrides=tier.overrides;
      for(const field of ['installedLaborPercent','installedMaterialsPercent'])for(const name of retainedRates){
        const path=`scopeRates.${name}`;
        if(!Object.hasOwn(overrides[field]||{},path)&&Object.hasOwn(tierEffective[field]||{},path))overrides={...overrides,[field]:{...overrides[field],[path]:tierEffective[field][path]}};
      }
      return overrides===tier.overrides?tier:{...tier,overrides};
    }
    const tierEffective=mergePricingForValidationVNext(effective,tier.overrides||{});
    const rates=[...new Set([...baseRates,...scopeRateNames(service.serviceType,tierEffective,key,true)])];
    return {...tier,overrides:clean(tier.overrides||{},rates)};
  }));
  return next;
}

// Switching carpet between square-foot and square-yard prices converts the
// saved carpet labor and material prices exactly (9 sq ft = 1 sq yd). Carpet
// prices are measured rates, so fractional cents are kept when they survive
// save and reload (the same check every saved price passes). If any price
// cannot be stated exactly in the new unit, the whole change is refused and
// the draft is left as it was; nothing is rounded or cleared.
const CARPET_FIELDS = ['laborPerSqft', 'materialPerSqft'];
const carpetUnit = value => value === 'square_yard' ? 'square_yard' : 'square_foot';
const ownCarpetUnit = overrides => Object.hasOwn(overrides || {}, 'carpetPriceUnit') && overrides.carpetPriceUnit !== undefined;
const hasCarpet = map => map && typeof map === 'object' && !Array.isArray(map) && Object.hasOwn(map, 'carpet');
const convertCarpetMap = (map, before, after) => hasCarpet(map) ? { ...map, carpet: convertCarpetPrice(map.carpet, before, after) } : map;
const refused = edit => { try { return edit(); } catch (error) { if (error instanceof CarpetUnitError) return null; throw error; } };

// The editor never copies a base carpet price into a tier: a tier with no carpet
// price of its own reads the base price, and the engine states it in the tier's
// carpet unit (pricingMerge.js). So a later base price change reaches the tier.
//
// Returns the edited service, or null when a price cannot be converted exactly.
// The base's own carpet prices, and the own carpet prices of a tier that uses
// the base unit, are restated exactly in the new unit. A tier on its own carpet
// unit is left as it is: what it inherits it reads from the restated base, in
// its own unit, which is the same price.
export function editCarpetPriceUnit(service, unit) {
  return refused(() => {
    const before = carpetUnit(serviceFieldValue(service, 'carpetPriceUnit'));
    const after = carpetUnit(unit);
    let next = editServiceField(service, 'carpetPriceUnit', unit);
    if (before === after) return next;
    for (const field of CARPET_FIELDS) {
      const map = serviceFieldValue(service, field);
      if (hasCarpet(map)) next = editServiceField(next, field, convertCarpetMap(map, before, after));
    }
    if (Array.isArray(next.tiers)) next = { ...next, tiers: next.tiers.map(tier => {
      if (ownCarpetUnit(tier.overrides) || !CARPET_FIELDS.some(field => hasCarpet(tier.overrides?.[field]))) return tier;
      const overrides = { ...tier.overrides };
      for (const field of CARPET_FIELDS) if (hasCarpet(overrides[field])) overrides[field] = convertCarpetMap(overrides[field], before, after);
      return { ...tier, overrides };
    }) };
    return next;
  });
}
// Tier edits never copy a base carpet price into a tier. Returns the tiers, or
// null to refuse the edit when a tier on a different carpet unit than the base
// would read a base carpet price with no exact value in its unit.
export function keepTierCarpetRatesInUnit(service, tiers) {
  const base = carpetUnit(serviceFieldValue(service, 'carpetPriceUnit'));
  for (const tier of tiers) {
    if (!ownCarpetUnit(tier.overrides) || carpetUnit(tier.overrides.carpetPriceUnit) === base) continue;
    for (const field of CARPET_FIELDS) {
      const inherited = serviceFieldValue(service, field);
      if (hasCarpet(tier.overrides[field]) || !hasCarpet(inherited) || typeof inherited.carpet !== 'number') continue;
      if (exactCarpetConversion(inherited.carpet, base, carpetUnit(tier.overrides.carpetPriceUnit)) === null) return null;
    }
  }
  return tiers;
}
// Setting or removing a tier's own carpet unit keeps what that tier quotes. Its
// own carpet prices are restated exactly in the new unit; a price it inherits
// stays inherited (the tier reads the base price in whatever unit it is on).
// Returns null, changing nothing, when a price the tier holds itself has no
// exact value in the new unit, or when an inherited price it can read today
// would have none (a $28 per square yard base price read per square foot).
export function editTierCarpetPriceUnit(service, index, unit) {
  const tier = service.tiers?.[index];
  if (!tier) return null;
  return refused(() => {
    const base = carpetUnit(serviceFieldValue(service, 'carpetPriceUnit'));
    const before = ownCarpetUnit(tier.overrides) ? carpetUnit(tier.overrides.carpetPriceUnit) : base;
    const after = unit === undefined ? base : carpetUnit(unit);
    const overrides = { ...(tier.overrides || {}) };
    if (unit === undefined) delete overrides.carpetPriceUnit; else overrides.carpetPriceUnit = unit;
    if (before !== after) for (const field of CARPET_FIELDS) {
      if (hasCarpet(overrides[field])) { overrides[field] = convertCarpetMap(overrides[field], before, after); continue; }
      const inherited = serviceFieldValue(service, field);
      if (!hasCarpet(inherited) || typeof inherited.carpet !== 'number') continue;
      if (exactCarpetConversion(inherited.carpet, base, before) !== null && exactCarpetConversion(inherited.carpet, base, after) === null) throw new CarpetUnitError();
    }
    return { ...service, tiers: service.tiers.map((item, i) => i === index ? { ...item, overrides } : item) };
  });
}

// Starter suggestions are priced for one business in one currency. Adding them
// is refused when the business or the draft's currency no longer matches.
export function starterSuggestionProblem(suggestions, ownerId, draftCurrency) {
  if (!suggestions) return 'Request starter suggestions first.';
  if (suggestions.forOwnerId !== undefined && suggestions.forOwnerId !== ownerId) return 'These suggestions were made for a different business. Request new suggestions.';
  if (suggestions.currency !== undefined && draftCurrency && draftCurrency !== suggestions.currency) return `These suggestions are priced in ${suggestions.currency}, but this price book is now in ${draftCurrency}. Request new suggestions.`;
  return null;
}

// The waste allowance a price book applies for a Quantity assumptions setting,
// as a percent: the saved value (including zero), else the starting value.
export function wasteAllowancePercent(serviceType,pricing,field,key){
  const pick=v=>key===undefined?v:v?.[key];
  const stored=pick(pricing?.[field]),fallback=pick(CLASS2_DEFINITIONS[serviceType]?.[field]?.defaultValue);
  const value=typeof stored==='number'?stored:fallback;
  return typeof value==='number'?Number((value*100).toFixed(10)):undefined;
}

// Which Quantity assumptions allowance a painting offering or component
// material rate uses (the engine's tradeAdjustment mapping), or null.
export function paintingRateWasteField(root,key){
  if(typeof key!=='string')return null;
  if(root==='offeringRates'){
    if(/^(wallMaterial|ceilingMaterial)/.test(key))return 'paintWasteFactor';
    if(/^(primerMaterial|ceilingPrimerMaterial)/.test(key))return 'primerWasteFactor';
    if(/^prepMaterial/.test(key))return 'prepMaterialWasteFactor';
  }
  if(root==='paintingRates'){
    if(/^trimMaterial/.test(key))return 'paintWasteFactor';
    if(/^(primerMaterial|ceilingPrimerMaterial|trimPrimerMaterial)/.test(key))return 'primerWasteFactor';
    if(/^trimPrepMaterial/.test(key))return 'prepMaterialWasteFactor';
  }
  return null;
}
const PAINT_ALLOWANCE_LABELS={paintWasteFactor:'Finish paint material waste',primerWasteFactor:'Primer material waste',prepMaterialWasteFactor:'Preparation material waste'};
// The sentence shown beside a painting material rate: the general allowance
// for measured material rates, or the package rule when materials are bought
// by the package (cost basis), where the general allowance does not apply.
export function paintingMaterialNote(service,pricing,root,key,tierName){
  const field=paintingRateWasteField(root,key);
  if(!field||!['INTERIOR_PAINTING','EXTERIOR_PAINTING'].includes(service?.serviceType))return null;
  if(service.priceBasisByCategory?.material==='cost')return 'Not used for materials bought by the package: each package line under Additional priced scope uses its own coverage, waste percent and whole-package rounding.';
  return `Waste allowance applied to this price${tierName?' in the '+tierName+' tier':''}: ${wasteAllowancePercent(service.serviceType,pricing,field)}% (${PAINT_ALLOWANCE_LABELS[field]}, under Quantity assumptions).`;
}
// The painting notice for the whole offering, by pricing method.
export function paintingMaterialNotice(service,pricing){
  if(service?.priceBasisByCategory?.material==='cost')return 'Materials are bought by the package under Additional priced scope: each package line uses its own coverage, waste percent and whole-package rounding. The general paint, primer and preparation allowances under Quantity assumptions do not change those quantities.';
  return `Material quantities include the waste allowances under Quantity assumptions: finish paint ${wasteAllowancePercent(service.serviceType,pricing,'paintWasteFactor')}%, primer ${wasteAllowancePercent(service.serviceType,pricing,'primerWasteFactor')}%, preparation ${wasteAllowancePercent(service.serviceType,pricing,'prepMaterialWasteFactor')}%. If a price already includes waste, set that allowance to 0.`;
}
