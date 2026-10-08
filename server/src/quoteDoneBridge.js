import {settingError,validatePricebookReceptionistSettings} from './voice/receptionistSettings.js';
import {reviewLabel} from '../priceBookLabels.js';
import {customerQuoteFields} from '../customerQuoteFields.js';
import crypto from 'node:crypto';
import {applicationQuoteMonth,applicationQuoteDate,applicationDateContext,resolvedQuoteTimeZone} from './quoteDate.js';
import { wholeRequestIssues, pricingEnvelopeViolations } from './quoteRequestScope.js';
import { discloseQuoteScope, declaredAdditionalWork } from './quoteScopeDisclosure.js';
import { JOB_DETAILS_FLOW, createIntakeConfirmation, validIntakeConfirmation, customerJobSummary, intakeQuestions, intakeClarification, clarificationSummary, createClarificationReceipt, createHistoryReceipt, validIntakeHistory } from './quoteIntake.js';
import { hasCallbackContact, invalidCallbackFields } from './quoteContact.js';
import { scopeOverlapDiagnostics } from '../scopeConfiguration.js';
import {voiceConfigurationIssues} from './voice/voiceQuotePresentation.js';
import {
  ENGINE_VERSION, generateQuoteVNext, previewQuoteVNext, sanitizeForCustomerVNext,
  buildInternalLeadVNext, vNextServiceStatus, getVNextPriceBookMetadata,
  materializeVNextService, approveVNextValues, validateServiceRulesDetailed, CLASS2_DEFINITIONS,
  PRICE_BASIS_CATEGORIES, FEE_NAMES, FEE_RULE_MODES, SERVICE_TYPES, MEASUREMENT_CONTRACTS,
  configuredOffering, mergePricingVNext
} from '../quote-engine-vnext/index.js';
import { allowedPricingFields, aiConfirmationFieldsVNext, pricingMapDomainVNext, validServiceIdVNext } from '../quote-engine-vnext/contracts.js';
import { loadPricebook, savePricebook, pricebookSaveUnconfirmed, withPricebookLock } from '../priceBookService.js';
import { missingPricebookServiceId } from '../priceBookStructure.js';
import { convertPricebookMoney, moneyKindForField, wholeCentsForPricingField, validatePricebookNumericDraft, pricingMapField } from '../priceBookMoney.js';
import { getServiceMetadata, ALL_OWNER_FIELDS, CLASS2_DEFAULTS_BY_SERVICE } from '../priceBookMetadata.js';

// The only application bridge to the quote engine. Transport and persistence
// remain separate; this module never invents measurements or pricing formulas.
export { ENGINE_VERSION, sanitizeForCustomerVNext, buildInternalLeadVNext };
export const DEFAULT_FIELDS = ['quoteTimeZone','currency','markupPercent','markupMode','overheadFixed','minimumJobPrice','travelFee','disposalFee','permitFee','taxMode','taxPercent','rangeBufferPercent','markupApplies','peakMonths','peakSurchargePercent'];
const ROOT_FIELDS = ['id','serviceType','service','source','origin','active','confirmedFields','approvedValues','tiers','feeRules','priceBasisByCategory','taxabilityByCategory','peakMonths','peakSurchargePercent','disclaimer','disposalScope','knownOfferings','zeroPricePolicy'];
const has = (v,k) => Object.hasOwn(v,k);
const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const clone = v => structuredClone(v);
export function problem(message,statusCode=400,details) { const e=new Error(message);e.statusCode=statusCode;if(details)e.details=details;return e; }
export function requireApplicationPricingEnvelope(submission) {
  const fields=pricingEnvelopeViolations(submission);
  if(fields.length)throw problem('Customer name and project address are collected after the quote or review outcome. Remove them from this pricing request.',400,{code:'INVALID_REQUEST',fields});
}
export function canonical(value) { if(Array.isArray(value))return value.map(canonical);if(record(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value; }
export const digest = value => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const pick = (v,keys) => Object.fromEntries(keys.filter(k=>has(v,k)).map(k=>[k,clone(v[k])]));

export function quoteDoneMoneyKind(type,field,pricing={}) {
  return moneyKindForField(type,field,pricing);
}
export function quoteDoneWholeCents(type,field,pricing={}) {
  return wholeCentsForPricingField(type,field,pricing);
}
export function convertApplicationBook(input,direction) {
  if(!record(input)||!Array.isArray(input.services)||!record(input.defaults))throw problem('A price book with services and business defaults is required.');
  for(const service of input.services)if(!record(service))throw problem('Each service must be an object.');
  return convertPricebookMoney(input,direction);
}
function projection(raw) {
  if(!record(raw)||!SERVICE_TYPES.includes(raw.serviceType))throw problem('Choose a supported service type.');
  if(has(raw,'pricing')&&!record(raw.pricing))throw problem('Service pricing must be an object.');
  const fields=allowedPricingFields(raw.serviceType),nested=raw.pricing||{};
  const legacy=new Set([...(ALL_OWNER_FIELDS[raw.serviceType]||[]),...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[raw.serviceType]||{})]);
  const pricing=Object.fromEntries(Object.entries(nested).filter(([field])=>fields.includes(field)||!legacy.has(field)).map(([field,value])=>[field,clone(value)]));
  for(const field of new Set([...fields,...legacy])) {
    if(has(raw,field)&&has(nested,field)&&!same(raw[field],nested[field]))throw problem('Conflicting root and nested values require an explicit resolving edit.',409,{field});
    if(fields.includes(field)) {if(has(nested,field))pricing[field]=clone(nested[field]);else if(has(raw,field))pricing[field]=clone(raw[field]);}
  }
  const out={...pick(raw,ROOT_FIELDS),pricing};
  const applicationFields=new Set(['pricing','validationInputs','quoteDoneApproval','ownerFeeSelections','starterSuggestion','createdAt','updatedAt']);
  for(const field of Object.keys(raw))if(!ROOT_FIELDS.includes(field)&&!fields.includes(field)&&!legacy.has(field)&&!applicationFields.has(field))out[field]=clone(raw[field]);
  // Never translate a floor-area price into a wall-area price or derive a new
  // category. Legacy settings remain on the saved record and are disclosed.
  out.tiers=(raw.tiers||[]).map(tier=>({...clone(tier),overrides:clone(tier.overrides||{})}));
  // Known legacy pricing fields and their historic confirmations stay in the
  // saved record. They cannot masquerade as confirmations of the new measured
  // contract, and must not block an explicit approval of its actual fields.
  for(const field of legacy)if(!fields.includes(field))for(const receipts of ['confirmedFields','approvedValues'])if(record(out[receipts]))delete out[receipts][field];
  return materializeVNextService(out);
}
function defaultsProjection(book) { const out=clone(book.defaults);delete out.laborHourlyRate;return out; }
const retiredPriceFields=type=>type.startsWith('FLOORING_')?['perStepPrice']:type.startsWith('CONCRETE_')?['demolitionPerSqft']:type==='SIDING_REPLACEMENT'?['removalPerSqft']:type==='FLAT_ROOF_REPLACEMENT'?['insulationPerSqft']:[];
function legacySettings(raw,book,includeRetired=false) {
  const fields=new Set(allowedPricingFields(raw.serviceType));
  const prior=new Set([...(ALL_OWNER_FIELDS[raw.serviceType]||[]),...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[raw.serviceType]||{})]);
  const discarded=[];
  for(const field of new Set([...prior,...retiredPriceFields(raw.serviceType)]))if(!fields.has(field)||includeRetired&&retiredPriceFields(raw.serviceType).includes(field)) {
    if(has(raw,field))discarded.push({path:field,value:clone(raw[field])});
    if(record(raw.pricing)&&has(raw.pricing,field))discarded.push({path:'pricing.'+field,value:clone(raw.pricing[field])});
    for(const receipts of ['confirmedFields','approvedValues'])if(record(raw[receipts])&&has(raw[receipts],field))discarded.push({path:receipts+'.'+field,value:clone(raw[receipts][field])});
  }
  for(const field of Object.keys(book.defaults))if(!DEFAULT_FIELDS.includes(field))discarded.push({path:'defaults.'+field,value:clone(book.defaults[field])});
  return discarded;
}
function approvalContent(raw,book) {
  const service=projection(raw);delete service.active;delete service.confirmedFields;delete service.approvedValues;
  return {service,businessDefaults:defaultsProjection(book),legacySettings:legacySettings(raw,book),ownerFeeSelections:raw.ownerFeeSelections||{}};
}
const ROOF_MINIMUM_MONEY_VERSION='roof-minimum-cents-v1';
function roofMinimumNeedsConfirmation(raw) {
  if(raw.serviceType!=='ROOFING_REPLACEMENT')return false;
  const amounts=[raw.minimumJob,raw.pricing?.minimumJob,...(raw.tiers||[]).map(t=>t.overrides?.minimumJob)];
  return amounts.some(value=>typeof value==='number'&&value>0)&&raw.quoteDoneApproval?.moneyUnitVersion!==ROOF_MINIMUM_MONEY_VERSION;
}
function approvalCurrent(raw,book) {
  const receipt=raw.quoteDoneApproval;
  return !roofMinimumNeedsConfirmation(raw)&&record(receipt)&&receipt.ownerId===book.ownerId&&receipt.serviceId===raw.id&&receipt.engineVersion===ENGINE_VERSION&&receipt.contentDigest===digest(approvalContent(raw,book));
}
function seasonalDecision(raw,book) {
  const months=raw.peakMonths??book.defaults.peakMonths,percent=raw.peakSurchargePercent??book.defaults.peakSurchargePercent;
  return Array.isArray(months)&&months.length>0&&typeof percent==='number'&&percent>0;
}
function applicationPresentationIssues(raw) {
  try{return voiceConfigurationIssues(raw,applicationServiceDefinition(raw));}
  catch{return ['Correct the invalid service configuration before presenting it on the call or in a saved quote.'];}
}
export function applicationServiceMatches(book,serviceId) {
  if(typeof serviceId!=='string')return [];
  return book.services.filter(service=>typeof service.id==='string'&&service.id.toLowerCase()===serviceId.toLowerCase());
}
function uniqueApplicationService(book,serviceId) {
  const matches=applicationServiceMatches(book,serviceId);
  if(matches.length>1)throw problem('Duplicate saved service IDs require owner correction before approval or preview.',409);
  return matches[0]||null;
}
// Owner diagnostics and the editor share one label source. Keep engine paths
// intact for navigation and validation; attach a parallel presentation array.
let ownerLabelMetadata;
function withOwnerLabels(result,service) {
 ownerLabelMetadata??=new Map(applicationMetadata().services.map(meta=>[meta.serviceType,meta]));
 const meta=ownerLabelMetadata.get(service.serviceType)||{};
 const annotate=(row,pricing=service.pricing||service)=>{
  const tier=service.tiers?.find(t=>t.name===row.tierName);
  const effective=tier?mergePricingVNext(pricing,tier.overrides||{}):pricing;
  const label=path=>reviewLabel(path,service,meta,effective);
  const ownerFields=[...new Set([...(row.missingOwnerFields||[]),...(row.invalidOwnerFields||[]),...(row.unsupportedOwnerFields||[]),...(row.crossFieldOwnerFields||[]),...(row.ownerDiagnostics||[]).map(d=>d.path).filter(Boolean)])];
  const out={...row,missingOwnerLabels:(row.missingOwnerFields||[]).map(label),ownerFieldLabels:ownerFields.map(path=>label(path.replace(/^zeroPricePolicy\.includedPrices\./,'')))};
  for(const key of ['failedTierDiagnostics','productCoverage','scopeCoverage'])if(Array.isArray(row[key]))out[key]=row[key].map(child=>{
   const fields=child.missingOwnerFields||[...new Set((child.ownerDiagnostics||[]).filter(d=>d.type==='missing').map(d=>d.path))];
   return annotate({...child,missingOwnerFields:fields},pricing);
  });
  return out;
 };
 return annotate(result);
}
export function applicationStatus(raw,book,{firstLiveProduct=false,...dateContext}={}) {
  dateContext=applicationDateContext(book.ownerId,dateContext);
  if(applicationServiceMatches(book,raw.id).length>1)return {serviceId:raw.id,serviceType:raw.serviceType,status:'NEEDS PRICING',missingOwnerFields:[],missingOwnerLabels:[],validationErrors:['Duplicate saved service IDs require owner correction.'],applicationIssues:['Duplicate saved service IDs require owner correction.'],ownerDiagnostics:[{type:'invalid',path:'id',message:'Duplicate saved service IDs require owner correction.'}],approvalCurrent:false};
  let service;try{service=projection(raw);}catch(error){return {serviceId:raw.id,serviceType:raw.serviceType,status:'NEEDS PRICING',missingOwnerFields:[],missingOwnerLabels:[],validationErrors:[error.message],applicationIssues:[error.message],ownerDiagnostics:[{type:'invalid',path:error.details?.field||'service',message:error.message}]};}
  const status=vNextServiceStatus(service,defaultsProjection(book),{ownerFeeSelections:has(raw,'ownerFeeSelections')?raw.ownerFeeSelections:{},firstLiveProduct,dateContext});
  const issues=[];
  issues.push(...applicationPresentationIssues(raw));
  if(typeof book.ownerId==='string'&&pricebookSaveUnconfirmed(book.ownerId))issues.push('Your last price-book save could not be confirmed on disk. Save again before quoting resumes.');
  if(!['CAD','USD'].includes(book.defaults?.currency))issues.push('Choose the currency of your prices (CAD or USD) in the price book.');
  const staleEngineApproval=record(raw.quoteDoneApproval)&&raw.quoteDoneApproval.engineVersion!==ENGINE_VERSION;
  if(staleEngineApproval)issues.push('Pricing rules changed — review and re-approve this service before customer quotes resume.');
  if(roofMinimumNeedsConfirmation(raw))issues.push('Recheck your roof replacement minimum in dollars, including price options. Earlier saves could store this minimum 100 times too small. Enter the intended amount and confirm the saved configuration; no stored amount has been guessed or changed.');
  else if(!approvalCurrent(raw,book)&&!staleEngineApproval)issues.push('Confirm this exact saved configuration before enabling customer quotes.');
  return {...withOwnerLabels(status,service),serviceId:raw.id,status:raw.active===false?'DISABLED':issues.length?'NEEDS PRICING':status.status,applicationIssues:issues,legacySettings:legacySettings(raw,book,true),approvalCurrent:approvalCurrent(raw,book),confirmationFields:aiConfirmationFieldsVNext(service,service.pricing),validationErrors:[...(status.validationErrors||[]),...issues]};
}
export function bookRevision(book) { return digest(book); }
export function readApplicationBook(ownerId) {
  const book=loadPricebook(ownerId);
  return {...convertApplicationBook(book,'toDollars'),revision:bookRevision(book),quoteDoneVersion:ENGINE_VERSION};
}
// Readiness also depends on the current profile zone when the book zone is
// missing or invalid. Include the effective zone in its cache key; profile
// changes must take effect without requiring a price-book save.
const statusCache=new Map(),statusCacheCounts={hits:0,misses:0};
// quick: customer-facing checks only need to know whether the service quotes at
// all, so readiness stops at the first live product (same live/not-live answer).
function statusCacheIdentity(raw,book) {
  if(typeof raw?.id==='string'&&raw.id.trim())return 'id:'+raw.id.toLowerCase();
  const index=(book.services||[]).indexOf(raw);
  return 'draft:'+(index>=0?index:'detached')+':'+digest(raw);
}
function cachedStatus(raw,book,{quick=false,...dateContext},revision) {
  dateContext=applicationDateContext(book.ownerId,dateContext);
  const key=ENGINE_VERSION+'|'+(quick?'quick':'full')+'|'+resolvedQuoteTimeZone(book.defaults,dateContext.timeZone)+'|'+revision+'|'+statusCacheIdentity(raw,book)+'|'+(typeof book.ownerId==='string'&&pricebookSaveUnconfirmed(book.ownerId)?'unconfirmed':'confirmed');
  if(statusCache.has(key)){statusCacheCounts.hits++;return clone(statusCache.get(key));}
  statusCacheCounts.misses++;
  const status=applicationStatus(raw,book,{...dateContext,firstLiveProduct:quick});
  statusCache.set(key,clone(status));
  if(statusCache.size>500)statusCache.delete(statusCache.keys().next().value);
  return status;
}
export function cachedApplicationStatus(raw,book,options={}) { return cachedStatus(raw,book,options,bookRevision(book)); }
export function applicationStatusCacheCounts() { return {...statusCacheCounts}; }
export function bookStatuses(book,dateContext={}) { const context=applicationDateContext(book.ownerId,dateContext),revision=bookRevision(book);return (book.services||[]).map(service=>cachedStatus(service,book,context,revision)); }
// Customer-facing catalog and scheduling: live/not-live only.
export function bookQuoteStatuses(book,dateContext={}) { const context=applicationDateContext(book.ownerId,dateContext),revision=bookRevision(book);return (book.services||[]).map(service=>cachedStatus(service,book,{...context,quick:true},revision)); }
function requireDraftBook(input) {if(!record(input)||!Array.isArray(input.services)||!record(input.defaults)||input.services.some(s=>!record(s)||(s.tiers!==undefined&&(!Array.isArray(s.tiers)||s.tiers.some(t=>!record(t))))))throw problem('Supply a price book with object services, object tiers and business defaults.');}
function requireRevision(book,revision) { if(typeof revision!=='string'||revision!==bookRevision(book))throw problem('This price book changed. Reload it before saving or approving.',409,{code:'REVISION_CONFLICT'}); }
function validateApplicationNumericDraft(book) { validatePricebookNumericDraft(book); }
export function validateApplicationDraft(ownerId,input,dateContext={}) {
  requireDraftBook(input);
  const saved=loadPricebook(ownerId);requireRevision(saved,input.revision);
  validateApplicationNumericDraft(input);
  const incoming=convertApplicationBook(input,'toCents');
  for(const service of incoming.services) {
    const id=typeof service.id==='string'?service.id.toLowerCase():null;
    const old=id?saved.services.find(s=>typeof s.id==='string'&&s.id.toLowerCase()===id):undefined;
    for(const field of ['origin','source','approvedValues','confirmedFields','quoteDoneApproval','zeroPricePolicy']) {
      if(old&&has(old,field))service[field]=clone(old[field]);else if(field!=='source')delete service[field];
    }
    if(old)service.serviceType=old.serviceType;
  }
  const statuses=bookStatuses({...saved,...incoming,ownerId},dateContext);
  return {statuses,validationErrors:statuses.flatMap(s=>s.validationErrors||[]),revision:bookRevision(saved)};
}
function validateLiveServiceLimit(book,dateContext){
  const candidates=book.services.filter(service=>service.active!==false);
  if(candidates.length<=1000)return;
  let live=0;
  for(const service of candidates)if(applicationStatus(service,book,{...dateContext,firstLiveProduct:true}).status==='QUOTING LIVE'&&++live>1000)throw settingError('Live services','At most 1,000 services can be live. Disable a service before enabling another.');
}
export function saveApplicationBook(ownerId,input,dateContext={}) {
  return withPricebookLock(ownerId,()=>{
    requireDraftBook(input);
    const previous=loadPricebook(ownerId);requireRevision(previous,input.revision);
    validatePricebookReceptionistSettings(input);
    validateApplicationNumericDraft(input);
    const incoming=convertApplicationBook(input,'toCents');
    const ids=new Set();
    for(const service of incoming.services) {
      if(missingPricebookServiceId(service.id))service.id=crypto.randomUUID();
      if(!validServiceIdVNext(service.id)||ids.has(service.id.toLowerCase()))throw problem('Every service must have its own valid UUID.');
      ids.add(service.id.toLowerCase());
      const old=previous.services.find(s=>s.id?.toLowerCase()===service.id.toLowerCase());
      if(old) {
        if(old.serviceType!==service.serviceType||old.source!==service.source)throw problem('Service type and source cannot change on an existing service ID.',409);
        for(const field of ['origin','approvedValues','quoteDoneApproval','zeroPricePolicy']) {
          if(has(service,field)&&!same(service[field],old[field]))throw problem('Use the explicit owner confirmation operation to change protected '+field+'.',409);
          if(has(old,field))service[field]=clone(old[field]);else delete service[field];
        }
        service.confirmedFields=clone(old.confirmedFields||{});
      } else {
        if(!['MANUAL','AI_SUGGESTED','AI_INTERVIEW'].includes(service.source))throw problem('Declare whether this new service was entered manually or originated from an AI draft.');
        for(const field of ['origin','approvedValues','quoteDoneApproval','zeroPricePolicy'])if(has(service,field))throw problem('Creation and approval receipts are generated by the server.');
        service.confirmedFields={};
        // Creation identifies this saved service; customer quoting still needs
        // a separate, explicit approval of the saved configuration.
        service.origin={serviceId:service.id,serviceType:service.serviceType,source:service.source,ownerId,operationId:crypto.randomUUID(),createdAt:new Date().toISOString()};
      }
      const effective=projection(service);
      const presentationIssues=applicationPresentationIssues(service);
      if(presentationIssues.length)throw problem(presentationIssues.join(' '),422,{code:'INVALID_QUOTE_PRESENTATION',issues:presentationIssues});
      for(const [tierName,pricing] of [[null,effective.pricing],...(service.tiers||[]).map(t=>[t.name,mergePricingVNext(effective.pricing,t.overrides||{})])]){
        const issues=scopeOverlapDiagnostics(service.serviceType,pricing);
        if(issues.length)throw problem('Resolve overlapping scope entries before saving'+(tierName?' in '+tierName:'')+'.',400,{issues,tierName});
      }
      if(!service.pricing||typeof service.pricing!=='object'||Array.isArray(service.pricing))service.pricing={};
      for(const field of Object.keys(CLASS2_DEFINITIONS[service.serviceType]||{}))
        if(!has(service.pricing,field)&&!has(service,field)&&has(effective.pricing||{},field))service.pricing[field]=clone(effective.pricing[field]);
    }
    const next={...previous,...incoming,ownerId};delete next.revision;delete next.quoteDoneVersion;
    validateLiveServiceLimit(next,dateContext);
    const result=savePricebook(ownerId,next).pricebook;
    return {success:true,statuses:bookStatuses(result,dateContext),revision:bookRevision(result)};
  });
}
export function approveApplicationService(ownerId,serviceId,input,dateContext={}) {
  return withPricebookLock(ownerId,()=>{
    if(!record(input))throw problem('Explicit saved-configuration approval is required.');
    const book=loadPricebook(ownerId);requireRevision(book,input.revision);
    const selected=uniqueApplicationService(book,serviceId),index=book.services.indexOf(selected);if(index<0)throw problem('Service not found.',404);
    const raw=clone(book.services[index]);
    const presentationIssues=applicationPresentationIssues(raw);
    if(presentationIssues.length)throw problem(presentationIssues.join(' '),422,{code:'INVALID_QUOTE_PRESENTATION',issues:presentationIssues});
    if(input.confirmConfiguration!==true)throw problem('Explicit confirmation of the displayed saved configuration is required.');
    if(raw.serviceType==='ROOFING_REPLACEMENT'&&[raw.minimumJob,raw.pricing?.minimumJob,...(Array.isArray(raw.tiers)?raw.tiers:[]).map(t=>t.overrides?.minimumJob)].some(value=>typeof value==='number'&&!Number.isSafeInteger(value)))throw problem('Correct the roof replacement minimum, including price options, to an exact dollar-and-cent amount before confirming it. The stored value has not been rounded.',422);
    if(legacySettings(raw,book,true).length&&input.confirmLegacySettings!==true)throw problem('Confirm the listed retained legacy settings are not used by the measured contract.');
    const now=new Date().toISOString(),operationId=crypto.randomUUID();
    if(raw.origin&&raw.origin.ownerId!==ownerId)throw problem('This service origin belongs to another owner.',409);
    if(!raw.source) {if(!['MANUAL','AI_SUGGESTED','AI_INTERVIEW'].includes(input.source))throw problem('Confirm the original source of this legacy service.');raw.source=input.source;}
    if(!raw.origin)raw.origin={serviceId:raw.id,serviceType:raw.serviceType,source:raw.source,ownerId,operationId,createdAt:now};
    if(has(input,'zeroClassification')) {
      const z=input.zeroClassification;
      if(!record(z)||Object.keys(z).length!==3||typeof z.freeCompleteService!=='boolean'||!Array.isArray(z.freeTiers)||!record(z.includedPrices))throw problem('Explicit free service, free tier and included-price choices are required.');
      raw.zeroPricePolicy={serviceId:raw.id,ownerId,operationId,approvedAt:now,...clone(z)};
    }
    let service=projection(raw);
    if(['AI_SUGGESTED','AI_INTERVIEW'].includes(raw.source)) {
      const fields=aiConfirmationFieldsVNext(service,service.pricing);
      if(!Array.isArray(input.fields)||fields.some(field=>!input.fields.includes(field))||input.fields.some(field=>!fields.includes(field)))throw problem('Explicitly confirm every current AI field and tier before approval.',400,{fields});
      service=approveVNextValues(service,{fields:input.fields,ownerId,operationId,approvedAt:now});
      const legacy=new Set([...(ALL_OWNER_FIELDS[raw.serviceType]||[]),...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[raw.serviceType]||{})].filter(field=>!allowedPricingFields(raw.serviceType).includes(field)));
      for(const key of ['confirmedFields','approvedValues'])raw[key]={...Object.fromEntries(Object.entries(raw[key]||{}).filter(([field])=>legacy.has(field))),...service[key]};
    }
    if(has(input,'zeroClassification')) {const issues=validateServiceRulesDetailed(service,raw.serviceType);if(issues.some(d=>d.path?.startsWith('zeroPricePolicy')))throw problem('The free/included classification is invalid.',400,{issues});}
    raw.quoteDoneApproval={ownerId,serviceId:raw.id,operationId,approvedAt:now,engineVersion:ENGINE_VERSION,moneyUnitVersion:ROOF_MINIMUM_MONEY_VERSION,contentDigest:digest(approvalContent(raw,book)),operation:'owner_confirmed_quotedone_registration'};
    book.services[index]=raw;validateLiveServiceLimit(book,dateContext);const saved=savePricebook(ownerId,book).pricebook;
    return {success:true,revision:bookRevision(saved),statuses:bookStatuses(saved,dateContext)};
  });
}
export function previewApplicationQuote(ownerId,input,dateContext={}) {
  dateContext=applicationDateContext(ownerId,dateContext);
  if(!record(input))throw problem('Select a saved service and revision for preview.');
  requireApplicationPricingEnvelope(input);
  const contactFields=invalidCallbackFields(input.contact);
  if(contactFields.length)throw problem('Correct the '+contactFields.join(' and ')+' field, or leave an unused contact channel blank. Keep any work instructions in Additional project details.',422,{fields:contactFields});
  const saved=loadPricebook(ownerId);requireRevision(saved,input.revision);
  const raw=uniqueApplicationService(saved,input.serviceId);if(!raw)throw problem('Save this service before previewing it.',409);
  const draft=input.service?convertApplicationBook({services:[input.service],defaults:input.defaults||readApplicationBook(ownerId).defaults},'toCents'):{services:[raw],defaults:saved.defaults};
  const draftRaw={...draft.services[0],id:raw.id,serviceType:raw.serviceType,source:raw.source,origin:raw.origin,confirmedFields:raw.confirmedFields,approvedValues:raw.approvedValues,zeroPricePolicy:raw.zeroPricePolicy};
  const guidedIntake=validIntakeConfirmation(ownerId,bookRevision(saved),input,{preview:true});
  const clarification=intakeClarification(ownerId,bookRevision(saved),input,applicationServiceName(draftRaw));
  if(!clarification.valid||!validIntakeHistory(ownerId,input))throw problem('The earlier answers or clarification changed. Check the current job details again.',409);
  const scopeReview=applicationScopeReview(draftRaw,input,{preview:true,guidedIntake,clarifiedFields:clarification.fields});
  if(scopeReview)return {...scopeReview.customerResult,reviewReason:scopeReview.applicationReview.reason,applicationReview:scopeReview.applicationReview,bookRevision:bookRevision(saved),selectedServiceId:raw.id};
  const service=projection(draftRaw),defaults=defaultsProjection({...saved,defaults:draft.defaults});
  service.active=applicationStatus(raw,saved,dateContext).status==='QUOTING LIVE'&&draftRaw.active===true&&same(approvalContent(draftRaw,{...saved,defaults}),approvalContent(raw,saved));
  const result=previewQuoteVNext({serviceType:raw.serviceType,ownerPricing:service,businessDefaults:defaults,currentMonth:applicationQuoteMonth(service,defaults,dateContext),quoteDate:applicationQuoteDate(service,defaults,dateContext),customerInputs:input.customerInputs||{},feeSelections:{owner:has(draftRaw,'ownerFeeSelections')?draftRaw.ownerFeeSelections:{},customer:input.customerFeeSelections||{}}});
  const definition=applicationServiceDefinition(draftRaw);
  return {...withOwnerLabels(discloseQuoteScope(result,draftRaw,definition,input,bookRevision(saved),clarification.fields),service),bookRevision:bookRevision(saved),selectedServiceId:raw.id};
}
export function calculateApplicationQuote(book,raw,submission,{ownerId,preparingIntake=false,...dateContext}={}) {
  dateContext=applicationDateContext(ownerId??book.ownerId,dateContext);
  requireApplicationPricingEnvelope(submission);
  const guidedIntake=preparingIntake||!!ownerId&&validIntakeConfirmation(ownerId,bookRevision(book),submission);
  const clarification=intakeClarification(ownerId,bookRevision(book),submission,applicationServiceName(raw));
  if(!clarification.valid||!validIntakeHistory(ownerId,submission))throw problem('The earlier answers or clarification changed. Check the current job details again.',409);
  const scopeReview=applicationScopeReview(raw,submission,{guidedIntake,clarifiedFields:clarification.fields});
  if(scopeReview)return {...scopeReview,customerClarifications:clarificationSummary(submission,applicationServiceName(raw))};
  const service=projection(raw);
  const eligibility=cachedApplicationStatus(raw,book,{...dateContext,quick:true}),current=eligibility.approvalCurrent;
  const ready=eligibility.status==='QUOTING LIVE';
  service.active=raw.active===true&&ready;
  const request={serviceType:raw.serviceType,ownerPricing:service,businessDefaults:defaultsProjection(book),currentMonth:applicationQuoteMonth(service,defaultsProjection(book),dateContext),quoteDate:applicationQuoteDate(service,defaultsProjection(book),dateContext),customerInputs:submission.customerInputs??{},callerType:'owner',feeSelections:{owner:raw.ownerFeeSelections||{},customer:submission.customerFeeSelections||{}}};
  const internalResult=generateQuoteVNext(request);
  const definition=applicationServiceDefinition(raw);
  const customerResult=discloseQuoteScope(sanitizeForCustomerVNext(internalResult),raw,definition,submission,bookRevision(book),clarification.fields);
  let leadEnvelope=null;
  if(internalResult.resultType==='ESTIMATE_REQUIRES_REVIEW'&&record(request.customerInputs))leadEnvelope=buildInternalLeadVNext({request:{...submission,serviceId:raw.id,serviceType:raw.serviceType,customerInputs:request.customerInputs,ownerPricing:service},internalResult});
  return {request,internalResult,customerResult,leadEnvelope,customerClarifications:clarificationSummary(submission,applicationServiceName(raw)),applicationEligibility:{ownerRequestedActive:raw.active===true,approvalCurrent:current,issues:eligibility.validationErrors}};
}
export function prepareApplicationIntake(ownerId,submission,dateContext={}) {
  if(!record(submission))throw problem('Use the job-details form to check this request.',422);
  requireApplicationPricingEnvelope(submission);
  if(submission.intakeFlow!==JOB_DETAILS_FLOW)throw problem('Use the job-details form to check this request.',422);
  if(!validServiceIdVNext(submission.requestId))throw problem('A stable request UUID is required.');
  if(submission.intakeConfirmation!==undefined||submission.reviewRequested!==undefined)throw problem('Check the editable job details again before submitting.',409);
  if(!hasCallbackContact(submission.contact))throw problem('Enter a valid email address or phone number before submitting an estimate request.',422);
  const contactFields=invalidCallbackFields(submission.contact);
  if(contactFields.length)throw problem('Correct the '+contactFields.join(' and ')+' field, or leave an unused contact channel blank. Keep any work instructions in Additional project details.',422,{fields:contactFields});
  const book=loadPricebook(ownerId),raw=uniqueApplicationService(book,submission.serviceId);
  if(!raw)throw problem('Choose a current saved service before checking the job details.',409);
  const revision=bookRevision(book),definition=applicationServiceDefinition(raw);
  const outcome=calculateApplicationQuote(book,raw,submission,{...dateContext,ownerId,preparingIntake:true});
  const ready=['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(outcome.customerResult.resultType);
  const fields=new Map((definition?.customerFields||[]).map(field=>[field.name,field.label]));
  const missing=[...(outcome.internalResult?.missingCustomerFields||[]),...(outcome.internalResult?.invalidCustomerFields||[])];
  const followUps=[...new Set(missing.map(key=>fields.get(key)||fields.get(key.split('.')[0])).filter(Boolean))].map(label=>'Check '+label+'.');
  if(outcome.applicationReview)followUps.push(...outcome.applicationReview.issues);
  if(!ready&&!followUps.length)followUps.push('The business needs to check the selected work or pricing before an estimate can be provided.');
  return {
    status:ready?'ready':'needs_details',
    summary:{...customerJobSummary(raw,definition,submission,revision),separateAdditionalWork:declaredAdditionalWork(submission,intakeClarification(ownerId,revision,submission,applicationServiceName(raw)).fields)},
    followUps,
    historyReceipt:createHistoryReceipt(ownerId,revision,submission),
    ...(intakeQuestions(submission,applicationServiceName(raw)).length?{clarification:{questions:intakeQuestions(submission,applicationServiceName(raw)),receipt:createClarificationReceipt(ownerId,revision,submission)}}:{}),
    ...(ready?{confirmation:createIntakeConfirmation(ownerId,revision,submission)}:{})
  };
}
export function applicationServiceName(raw) {
  const definition=getVNextPriceBookMetadata().find(row=>row.serviceType===raw.serviceType);
  return typeof raw.service==='string'&&raw.service.trim()?raw.service:definition?.service||'Service';
}
export function applicationServiceDefinition(raw) {
  const definition=getVNextPriceBookMetadata().find(row=>row.serviceType===raw.serviceType);
  const p={...pick(raw,allowedPricingFields(raw.serviceType)),...(raw.pricing||{})};
  const customerFields=customerQuoteFields(raw,p);
  if(!configuredOffering(raw.serviceType,p))return {...definition,customerFields};
  const d=p.offeringDetails||{};
  const summary=[d.description];
  if(raw.serviceType.startsWith('FENCING_'))summary.push('Standard posts and footings: '+(d.postFootingDescription||''),'Fence length excludes gate openings.');
  else summary.push('Surface and coating: '+(d.substrate||'')+'; '+(d.coating||''),(p.offeringMode==='itemized'?'One to three requested finish coats':String(d.finishCoats??'Unconfigured')+' finish coat(s)')+'; '+String(d.primerCoats??'Unconfigured')+' primer coat(s).','Preparation: '+(d.preparation||''));
  return {...definition,customerFields,offeringSummary:summary.filter(value=>typeof value==='string'&&value.trim()),offeringMode:p.offeringMode};
}
function applicationScopeReview(raw,submission,options) {
  const issues=wholeRequestIssues(submission,applicationServiceName(raw),options);
  if(!issues.length)return null;
  const quoteId=crypto.randomUUID();
  return {customerResult:sanitizeForCustomerVNext({resultType:'ESTIMATE_REQUIRES_REVIEW',quoteId}),applicationReview:{reason:issues.join(' '),issues,quoteId,stage:'whole_request_scope'},request:null,internalResult:null,leadEnvelope:null};
}
export function applicationMetadata() {
  const legacy=getServiceMetadata();
  return {engineVersion:ENGINE_VERSION,categories:PRICE_BASIS_CATEGORIES,feeNames:FEE_NAMES,feeModes:FEE_RULE_MODES,defaultFields:DEFAULT_FIELDS,services:getVNextPriceBookMetadata().map(meta=>{
    const old=legacy.find(row=>row.serviceType===meta.serviceType);
    const requiresOffering=['EXTERIOR_PAINTING','FENCING_INSTALL','FENCING_REPLACEMENT'].includes(meta.serviceType);
    const setupFields=meta.pricingFields.filter(field=>!retiredPriceFields(meta.serviceType).includes(field.field)).filter(field=>!requiresOffering||['minimumJob','offeringMode','offeringDetails','offeringRates','scopeDetails','scopeRates'].includes(field.field));
    const optionalFields={
      INTERIOR_PAINTING:['ceilingLaborPerSqftPerCoat','ceilingMaterialPerSqftPerCoat','trimLaborPerLF','trimMaterialPerLF'],
      CONCRETE_DRIVEWAY:['basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft','stampedMaterialPerSqft'],
      CONCRETE_PATIO_SLAB:['basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft','stampedMaterialPerSqft'],
      LANDSCAPING_MULCH:['bedPrepLaborPerSqft','edgingPerLinearFoot'],
      LANDSCAPING_CLEANUP:['haulAwayFee'],
      LANDSCAPING_SOD:['groundPrepPerSqft'],
      LANDSCAPING_PLANTING:['bedPrepLaborPerSqft','mulchMaterialPerYard','mulchInstallLaborPerYard']
    };
    const fields=setupFields.map(field=>{
      const prior=old?.fields.find(row=>row.field===field.field),kind=quoteDoneMoneyKind(meta.serviceType,field.field);
      const info={...prior,...field,type:prior?.type||'number',requiredAtBase:prior?.requiredAtBase??true,moneyKind:kind,money:!!kind};
      if(['installedMaterialsPercent','installedLaborPercent'].includes(field.field))Object.assign(info,{type:'json',tree:{depth:1},requiredAtBase:false});
      if(optionalFields[meta.serviceType]?.includes(field.field))info.requiredAtBase=false;
      if(requiresOffering&&field.field==='minimumJob')Object.assign(info,{label:'Minimum job price',title:'Minimum job price',help:'Minimum for this offering; enter zero when there is no service minimum.',reviewOnly:false});
      if(quoteDoneWholeCents(meta.serviceType,field.field))info.wholeCents=true;
      if(['offeringMode','offeringDetails','offeringRates'].includes(field.field))Object.assign(info,{type:'offering_configuration',requiredAtBase:false});
      if(['scopeDetails','scopeRates'].includes(field.field))Object.assign(info,{type:'scope_configuration',requiredAtBase:false});
      if(pricingMapField(meta.serviceType,field.field))Object.assign(info,{type:'json',tree:{depth:1}});
      if(field.field==='mowingBaseRatePerSqft')Object.assign(info,{label:prior.label,title:prior.title,help:prior.help,engineLabel:field.label});
      const enums={accessoryPricingMode:['per_square_allin','itemized'],materialAccessoryBasis:['excludes_itemized_accessories'],vinylPlankUnderlaymentRule:['always_included','never_included','subfloor_condition','customer_selectable_addon','owner_review'],customPricingMode:['fixed','range','inspection_first'],customChargeClassification:PRICE_BASIS_CATEGORIES};
      if(enums[field.field])Object.assign(info,{type:'select',options:enums[field.field],optionLabels:Object.fromEntries(enums[field.field].map(v=>[v,v.replaceAll('_',' ')]))});
      if(field.field==='underlaymentPriceBasis')Object.assign(info,meta.serviceType==='ROOFING_REPLACEMENT'?{type:'json',tree:{leafType:'enum',options:['installed_area_sell_price','cost']}}:{type:'select',options:['installed_area_sell_price','cost'],optionLabels:{installed_area_sell_price:'Installed-area sell price',cost:'Cost'}});
      if(['repairHours','repairMaterialAllowance','patchRepairHours','patchMaterialAllowance'].includes(field.field)||meta.serviceType==='SIDING_REPAIR'&&field.field==='materialAllowance')Object.assign(info,{type:'json',tree:{depth:3,leafKeys:['small','medium','large']}});
      if(field.field==='postsIncludedInMaterial')Object.assign(info,{type:'json',tree:{leafType:'boolean'}});
      if(info.tree){
        Object.assign(info.tree,pricingMapDomainVNext(meta.serviceType,field.field));
        if(info.tree.rootKeys)info.shapedKeys={...info.shapedKeys,keys:info.tree.rootKeys,ownerSelectable:!info.tree.requiredRootKeys};
      }
      if(meta.serviceType==='LANDSCAPING_CLEANUP'&&field.field==='debrisPricing')info.tree={depth:2,rootKeys:['light','moderate','heavy'],requiredRootKeys:['light','moderate','heavy'],leafKeys:['laborMultiplier','disposalFlat'],leafMoneyKinds:{disposalFlat:'fixed_amount'},positiveLeafKeys:['laborMultiplier']};
      return info;
    });
    return {...old,...meta,name:meta.service,requiresOffering,fields,interviewFields:Object.values(MEASUREMENT_CONTRACTS[meta.serviceType].fields).some(f=>f.type==='slug')?[{field:'knownOfferings',label:'Products you explicitly offer',type:'offering_registry'}]:[],legacyClass2Fields:(old?.class2Fields||[]).filter(field=>!meta.class2Fields.some(current=>current.name===field.field)),class2Fields:meta.class2Fields.map(field=>({...field,field:field.name})),class2Defaults:Object.fromEntries(meta.class2Fields.map(field=>[field.name,field.defaultValue])),sampleInputs:{}};
  })};
}
