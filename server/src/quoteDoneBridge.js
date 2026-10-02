import crypto from 'node:crypto';
import { wholeRequestIssues, pricingEnvelopeViolations } from './quoteRequestScope.js';
import { discloseQuoteScope, declaredAdditionalWork } from './quoteScopeDisclosure.js';
import { JOB_DETAILS_FLOW, createIntakeConfirmation, validIntakeConfirmation, customerJobSummary, intakeQuestions, intakeClarification, clarificationSummary, createClarificationReceipt, createHistoryReceipt, validIntakeHistory } from './quoteIntake.js';
import { hasCallbackContact, invalidCallbackFields } from './quoteContact.js';
import {
  ENGINE_VERSION, generateQuoteVNext, previewQuoteVNext, sanitizeForCustomerVNext,
  buildInternalLeadVNext, vNextServiceStatus, getVNextPriceBookMetadata,
  materializeVNextService, approveVNextValues, validateServiceRulesDetailed, CLASS2_DEFINITIONS,
  PRICE_BASIS_CATEGORIES, FEE_NAMES, FEE_RULE_MODES, SERVICE_TYPES,
  configuredOffering, offeringContract, customerContractForVNext, scopeRateDefinitions
} from '../quote-engine-vnext/index.js';
import { allowedPricingFields, aiConfirmationFieldsVNext, validServiceIdVNext } from '../quote-engine-vnext/contracts.js';
import { loadPricebook, savePricebook } from '../priceBookService.js';
import { dollarAmountToCents, centAmountToDollars, moneyKindForField } from '../priceBookMoney.js';
import { getServiceMetadata, ALL_OWNER_FIELDS, CLASS2_DEFAULTS_BY_SERVICE } from '../priceBookMetadata.js';

// The only application bridge to the quote engine. Transport and persistence
// remain separate; this module never invents measurements or pricing formulas.
export { ENGINE_VERSION, sanitizeForCustomerVNext, buildInternalLeadVNext };
export const DEFAULT_FIELDS = ['markupPercent','markupMode','overheadFixed','minimumJobPrice','travelFee','disposalFee','permitFee','taxMode','taxPercent','rangeBufferPercent','markupApplies','peakMonths','peakSurchargePercent'];
const DEFAULT_MONEY = new Set(['overheadFixed','minimumJobPrice','travelFee','disposalFee','permitFee','laborHourlyRate']);
const ROOT_FIELDS = ['id','serviceType','service','source','origin','active','confirmedFields','approvedValues','tiers','feeRules','priceBasisByCategory','taxabilityByCategory','peakMonths','peakSurchargePercent','disclaimer','disposalScope','knownOfferings','zeroPricePolicy'];
const NEW_RATES = new Set(['laborPerWallSqftPerCoat','materialPerWallSqftPerCoat','ceilingLaborPerSqftPerCoat','ceilingMaterialPerSqftPerCoat','exteriorLaborPerSqftPerCoat','offeringRates','scopeRates']);
const NOT_MONEY = new Set(['underlaymentPriceBasis','accessoryPricingMode','materialAccessoryBasis','vinylPlankUnderlaymentRule','postsIncludedInMaterial','customPricingMode','customChargeClassification','unit','repairHours','patchRepairHours','frequencyMultipliers','overgrowthMultipliers','baggingSurchargePercent','debrisPricing','offeringMode','offeringDetails']);
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
  if(field==='minimumJob'&&allowedPricingFields(type).includes(field))return 'fixed_amount';
  if(field==='scopeDetails')return null;
  if(NEW_RATES.has(field))return 'unit_rate';
  if(type==='CUSTOM'&&field==='price')return pricing.unit==='flat'?'fixed_amount':pricing.unit?'unit_rate':'unresolved_unit';
  if(NOT_MONEY.has(field)||has(CLASS2_DEFINITIONS[type]||{},field))return null;
  return moneyKindForField(type,field,pricing);
}
function moneyTree(value,kind,convert,location) {
  if(record(value))return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,moneyTree(item,kind,convert,location+'.'+key)]));
  return convert(value,{kind,path:location});
}
function convertedPricing(source,type,direction,location,effective=source) {
  if(!record(source))return clone(source);
  const convert=direction==='toCents'?dollarAmountToCents:centAmountToDollars;
  const result=clone(source);
  const fields=new Set([...(ALL_OWNER_FIELDS[type]||[]),...allowedPricingFields(type)]);
  for(const field of fields) {
    if(!has(source,field))continue;
    if(field==='scopeRates'&&record(source[field])){
      const definitions=scopeRateDefinitions(type,effective,true);
      result[field]=Object.fromEntries(Object.entries(source[field]).map(([key,value])=>[key,convert(value,{kind:definitions[key]?.moneyKind||'unit_rate',path:location+'.'+field+'.'+key})]));
      continue;
    }
    const kind=quoteDoneMoneyKind(type,field,effective);
    if(kind){
      // An old roof minimum can contain fractional cents because that field
      // previously bypassed conversion. Display its stored value exactly so
      // the owner can correct it. Saving and quoting still require whole cents.
      const legacyDisplay=direction==='toDollars'&&type==='ROOFING_REPLACEMENT'&&field==='minimumJob'&&typeof source[field]==='number'&&!Number.isInteger(source[field]);
      result[field]=moneyTree(source[field],legacyDisplay?'unit_rate':kind,convert,location+'.'+field);
    }
    else if(field==='debrisPricing'&&record(source[field]))for(const [level,row] of Object.entries(source[field])) {
      if(record(row)&&has(row,'disposalFlat'))result[field][level].disposalFlat=convert(row.disposalFlat,{kind:'fixed_amount',path:location+'.debrisPricing.'+level+'.disposalFlat'});
    }
  }
  return result;
}
export function convertApplicationBook(input,direction) {
  if(!record(input)||!Array.isArray(input.services)||!record(input.defaults))throw problem('A price book with services and business defaults is required.');
  const out=clone(input),convert=direction==='toCents'?dollarAmountToCents:centAmountToDollars;
  out.services=input.services.map((service,index)=>{
    if(!record(service))throw problem('Each service must be an object.');
    const effective={...service,...(record(service.pricing)?service.pricing:{})};
    const next=convertedPricing(service,service.serviceType,direction,'services.'+index,effective);
    if(has(service,'pricing'))next.pricing=convertedPricing(service.pricing,service.serviceType,direction,'services.'+index+'.pricing',effective);
    if(Array.isArray(service.tiers))next.tiers=service.tiers.map((tier,i)=>({...clone(tier),...(has(tier,'overrides')?{overrides:convertedPricing(tier.overrides,service.serviceType,direction,'services.'+index+'.tiers.'+i+'.overrides',{...effective,...tier.overrides})}:{})}));
    return next;
  });
  for(const field of DEFAULT_MONEY)if(has(out.defaults,field))out.defaults[field]=convert(out.defaults[field],{kind:field==='laborHourlyRate'?'unit_rate':'fixed_amount',path:'defaults.'+field});
  return out;
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
function legacySettings(raw,book) {
  const fields=new Set(allowedPricingFields(raw.serviceType));
  const prior=new Set([...(ALL_OWNER_FIELDS[raw.serviceType]||[]),...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[raw.serviceType]||{})]);
  const discarded=[];
  for(const field of prior)if(!fields.has(field)) {
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
export function applicationServiceMatches(book,serviceId) {
  if(typeof serviceId!=='string')return [];
  return book.services.filter(service=>typeof service.id==='string'&&service.id.toLowerCase()===serviceId.toLowerCase());
}
function uniqueApplicationService(book,serviceId) {
  const matches=applicationServiceMatches(book,serviceId);
  if(matches.length>1)throw problem('Duplicate saved service IDs require owner correction before approval or preview.',409);
  return matches[0]||null;
}
export function applicationStatus(raw,book) {
  if(applicationServiceMatches(book,raw.id).length>1)return {serviceId:raw.id,serviceType:raw.serviceType,status:'NEEDS PRICING',missingOwnerFields:[],missingOwnerLabels:[],validationErrors:['Duplicate saved service IDs require owner correction.'],applicationIssues:['Duplicate saved service IDs require owner correction.'],approvalCurrent:false};
  let service;try{service=projection(raw);}catch(error){return {serviceId:raw.id,serviceType:raw.serviceType,status:'NEEDS PRICING',missingOwnerFields:[],missingOwnerLabels:[],validationErrors:[error.message],applicationIssues:[error.message]};}
  const status=vNextServiceStatus(service,defaultsProjection(book));
  const issues=[];
  if(roofMinimumNeedsConfirmation(raw))issues.push('Recheck your roof replacement minimum in dollars, including price options. Earlier saves could store this minimum 100 times too small. Enter the intended amount and confirm the saved configuration; no stored amount has been guessed or changed.');
  else if(!approvalCurrent(raw,book))issues.push('Confirm this exact saved configuration before enabling customer quotes.');
  if(seasonalDecision(raw,book))issues.push('Seasonal date policy remains an owner decision; seasonal requests require review.');
  return {...status,serviceId:raw.id,status:raw.active===false?'DISABLED':issues.length?'NEEDS PRICING':status.status,applicationIssues:issues,legacySettings:legacySettings(raw,book),approvalCurrent:approvalCurrent(raw,book),confirmationFields:aiConfirmationFieldsVNext(service,service.pricing),validationErrors:[...(status.validationErrors||[]),...issues]};
}
export function bookRevision(book) { return digest(book); }
export function readApplicationBook(ownerId) {
  const book=loadPricebook(ownerId);
  return {...convertApplicationBook(book,'toDollars'),revision:bookRevision(book),quoteDoneVersion:ENGINE_VERSION};
}
export function bookStatuses(book) { return (book.services||[]).map(service=>applicationStatus(service,book)); }
function requireDraftBook(input) {if(!record(input)||!Array.isArray(input.services)||!record(input.defaults)||input.services.some(s=>!record(s)||(s.tiers!==undefined&&(!Array.isArray(s.tiers)||s.tiers.some(t=>!record(t))))))throw problem('Supply a price book with object services, object tiers and business defaults.');}
function requireRevision(book,revision) { if(typeof revision!=='string'||revision!==bookRevision(book))throw problem('This price book changed. Reload it before saving or approving.',409); }
function validateApplicationNumericDraft(book) {
 const numericTree=(value,path)=>{if(value===undefined||value===null||value==='')return;if(record(value)){for(const [key,child] of Object.entries(value))numericTree(child,path+'.'+key);}else if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw problem('Invalid numeric value at '+path+'. Enter the intended value before saving.');};
 const numericFields=new Set(['markupPercent','taxPercent','rangeBufferPercent','peakSurchargePercent',...DEFAULT_MONEY]);
 for(const [field,value] of Object.entries(book.defaults||{}))if(numericFields.has(field))numericTree(value,'defaults.'+field);
 const nonNumeric=new Set(['underlaymentPriceBasis','accessoryPricingMode','materialAccessoryBasis','vinylPlankUnderlaymentRule','postsIncludedInMaterial','customPricingMode','customChargeClassification','unit','offeringMode','offeringDetails','scopeDetails']);
 for(const service of book.services||[])for(const pricing of [service,service.pricing,...(service.tiers||[]).map(t=>t.overrides)])if(record(pricing))for(const field of new Set([...(ALL_OWNER_FIELDS[service.serviceType]||[]),...allowedPricingFields(service.serviceType),...Object.keys(CLASS2_DEFAULTS_BY_SERVICE[service.serviceType]||{})]))if(!nonNumeric.has(field)&&has(pricing,field))numericTree(pricing[field],field);
}
export function validateApplicationDraft(ownerId,input) {
  requireDraftBook(input);
 const saved=loadPricebook(ownerId);requireRevision(saved,input.revision);
 validateApplicationNumericDraft(input);
 const incoming=convertApplicationBook(input,'toCents');
 for(const service of incoming.services) {
  const old=saved.services.find(s=>s.id===service.id);
  for(const field of ['origin','source','approvedValues','confirmedFields','quoteDoneApproval','zeroPricePolicy']) {
   if(old&&has(old,field))service[field]=clone(old[field]);else if(field!=='source')delete service[field];
  }
  if(old)service.serviceType=old.serviceType;
 }
 const statuses=bookStatuses({...saved,...incoming,ownerId});
 return {statuses,validationErrors:statuses.flatMap(s=>s.validationErrors||[]),revision:bookRevision(saved)};
}
export function saveApplicationBook(ownerId,input) {
  requireDraftBook(input);
  const previous=loadPricebook(ownerId);requireRevision(previous,input.revision);
  validateApplicationNumericDraft(input);
  const incoming=convertApplicationBook(input,'toCents');
  const ids=new Set();
  for(const service of incoming.services) {
    if(!service.id)service.id=crypto.randomUUID();
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
    }
    projection(service); // detect conflicts without relocating stored fields
  }
  const next={...previous,...incoming,ownerId};delete next.revision;delete next.quoteDoneVersion;
  const result=savePricebook(ownerId,next).pricebook;
  return {success:true,statuses:bookStatuses(result),revision:bookRevision(result)};
}
export function approveApplicationService(ownerId,serviceId,input) {
  if(!record(input))throw problem('Explicit saved-configuration approval is required.');
  const book=loadPricebook(ownerId);requireRevision(book,input.revision);
  const selected=uniqueApplicationService(book,serviceId),index=book.services.indexOf(selected);if(index<0)throw problem('Service not found.',404);
  const raw=clone(book.services[index]);
  if(input.confirmConfiguration!==true)throw problem('Explicit confirmation of the displayed saved configuration is required.');
  if(raw.serviceType==='ROOFING_REPLACEMENT'&&[raw.minimumJob,raw.pricing?.minimumJob,...(Array.isArray(raw.tiers)?raw.tiers:[]).map(t=>t.overrides?.minimumJob)].some(value=>typeof value==='number'&&!Number.isSafeInteger(value)))throw problem('Correct the roof replacement minimum, including price options, to an exact dollar-and-cent amount before confirming it. The stored value has not been rounded.',422);
  if(legacySettings(raw,book).length&&input.confirmLegacySettings!==true)throw problem('Confirm the listed retained legacy settings are not used by the measured contract.');
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
    raw.confirmedFields={...(raw.confirmedFields||{}),...service.confirmedFields};raw.approvedValues={...(raw.approvedValues||{}),...service.approvedValues};
  }
  if(has(input,'zeroClassification')) {const issues=validateServiceRulesDetailed(service,raw.serviceType);if(issues.some(d=>d.path?.startsWith('zeroPricePolicy')))throw problem('The free/included classification is invalid.',400,{issues});}
  raw.quoteDoneApproval={ownerId,serviceId:raw.id,operationId,approvedAt:now,engineVersion:ENGINE_VERSION,moneyUnitVersion:ROOF_MINIMUM_MONEY_VERSION,contentDigest:digest(approvalContent(raw,book)),operation:'owner_confirmed_quotedone_registration'};
  book.services[index]=raw;const saved=savePricebook(ownerId,book).pricebook;
  return {success:true,revision:bookRevision(saved),statuses:bookStatuses(saved)};
}
export function previewApplicationQuote(ownerId,input) {
  if(!record(input))throw problem('Select a saved service and revision for preview.');
  requireApplicationPricingEnvelope(input);
  const contactFields=invalidCallbackFields(input.contact);
  if(contactFields.length)throw problem('Correct the '+contactFields.join(' and ')+' field, or leave an unused contact channel blank. Keep any work instructions in Additional project details.',422,{fields:contactFields});
  const saved=loadPricebook(ownerId);requireRevision(saved,input.revision);
  const raw=uniqueApplicationService(saved,input.serviceId);if(!raw)throw problem('Save this service before previewing it.',409);
  const guidedIntake=validIntakeConfirmation(ownerId,bookRevision(saved),input,{preview:true});
  const clarification=intakeClarification(ownerId,bookRevision(saved),input,applicationServiceName(raw));
  if(!clarification.valid||!validIntakeHistory(ownerId,input))throw problem('The earlier answers or clarification changed. Check the current job details again.',409);
  const scopeReview=applicationScopeReview(raw,input,{preview:true,guidedIntake,clarifiedFields:clarification.fields});
  if(scopeReview)return {...scopeReview.customerResult,reviewReason:scopeReview.applicationReview.reason,applicationReview:scopeReview.applicationReview,bookRevision:bookRevision(saved),selectedServiceId:raw.id};
  const draft=input.service?convertApplicationBook({services:[input.service],defaults:input.defaults||readApplicationBook(ownerId).defaults},'toCents'):{services:[raw],defaults:saved.defaults};
  const draftRaw={...draft.services[0],id:raw.id,serviceType:raw.serviceType,source:raw.source,origin:raw.origin,confirmedFields:raw.confirmedFields,approvedValues:raw.approvedValues,zeroPricePolicy:raw.zeroPricePolicy};
  const service=projection(draftRaw),defaults=defaultsProjection({...saved,defaults:draft.defaults});
  service.active=applicationStatus(raw,saved).status==='QUOTING LIVE'&&draftRaw.active===true&&same(approvalContent(draftRaw,{...saved,defaults}),approvalContent(raw,saved));
  const result=previewQuoteVNext({serviceType:raw.serviceType,ownerPricing:service,businessDefaults:defaults,customerInputs:input.customerInputs||{},feeSelections:{owner:raw.ownerFeeSelections||{},customer:input.customerFeeSelections||{}}});
  const definition=applicationServiceDefinition(raw);
  return {...discloseQuoteScope(result,raw,definition,input,bookRevision(saved),clarification.fields),bookRevision:bookRevision(saved),selectedServiceId:raw.id};
}
export function calculateApplicationQuote(book,raw,submission,{ownerId,preparingIntake=false}={}) {
  requireApplicationPricingEnvelope(submission);
  const guidedIntake=preparingIntake||!!ownerId&&validIntakeConfirmation(ownerId,bookRevision(book),submission);
  const clarification=intakeClarification(ownerId,bookRevision(book),submission,applicationServiceName(raw));
  if(!clarification.valid||!validIntakeHistory(ownerId,submission))throw problem('The earlier answers or clarification changed. Check the current job details again.',409);
  const scopeReview=applicationScopeReview(raw,submission,{guidedIntake,clarifiedFields:clarification.fields});
  if(scopeReview)return {...scopeReview,customerClarifications:clarificationSummary(submission,applicationServiceName(raw))};
  const service=projection(raw);
  const eligibility=applicationStatus(raw,book),current=eligibility.approvalCurrent;
  const ready=eligibility.status==='QUOTING LIVE';
  // Active-for-customers is a trusted application eligibility decision. Preserve
  // raw owner intent separately; never change a rate or measurement to make it quote.
  service.active=raw.active===true&&ready;
  const request={serviceType:raw.serviceType,ownerPricing:service,businessDefaults:defaultsProjection(book),customerInputs:submission.customerInputs??{},callerType:'owner',feeSelections:{owner:raw.ownerFeeSelections||{},customer:submission.customerFeeSelections||{}}};
  const internalResult=generateQuoteVNext(request);
  const definition=applicationServiceDefinition(raw);
  const customerResult=discloseQuoteScope(sanitizeForCustomerVNext(internalResult),raw,definition,submission,bookRevision(book),clarification.fields);
  let leadEnvelope=null;
  if(internalResult.resultType==='ESTIMATE_REQUIRES_REVIEW'&&record(request.customerInputs))leadEnvelope=buildInternalLeadVNext({request:{...submission,serviceId:raw.id,serviceType:raw.serviceType,customerInputs:request.customerInputs,ownerPricing:service},internalResult});
  return {request,internalResult,customerResult,leadEnvelope,customerClarifications:clarificationSummary(submission,applicationServiceName(raw)),applicationEligibility:{ownerRequestedActive:raw.active===true,approvalCurrent:current,issues:eligibility.validationErrors}};
}
export function prepareApplicationIntake(ownerId,submission) {
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
  const outcome=calculateApplicationQuote(book,raw,submission,{ownerId,preparingIntake:true});
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
  const customerFields=Object.entries(customerContractForVNext(raw.serviceType,p,raw).fields).map(([name,field])=>({name,...field}));
  if(!configuredOffering(raw.serviceType,p))return {...definition,customerFields};
  const d=p.offeringDetails||{};
  const summary=[d.description];
  if(raw.serviceType.startsWith('FENCING_'))summary.push('Standard posts and footings: '+(d.postFootingDescription||''),'Fence length excludes gate openings.');
  else summary.push('Surface and coating: '+(d.substrate||'')+'; '+(d.coating||''),String(d.finishCoats??'Unconfigured')+' finish coat(s); '+String(d.primerCoats??'Unconfigured')+' primer coat(s).','Preparation: '+(d.preparation||''));
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
    const setupFields=meta.pricingFields.filter(field=>!requiresOffering||['minimumJob','offeringMode','offeringDetails','offeringRates','scopeDetails','scopeRates'].includes(field.field));
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
      if(optionalFields[meta.serviceType]?.includes(field.field))info.requiredAtBase=false;
      if(requiresOffering&&field.field==='minimumJob')Object.assign(info,{label:'Minimum job price',title:'Minimum job price',help:'Minimum for this offering; enter zero when there is no service minimum.',reviewOnly:false});
      if(['offeringMode','offeringDetails','offeringRates'].includes(field.field))Object.assign(info,{type:'offering_configuration',requiredAtBase:false});
      if(['scopeDetails','scopeRates'].includes(field.field))Object.assign(info,{type:'scope_configuration',requiredAtBase:false});
      const priceMaps={
        ROOFING_REPLACEMENT:['laborPerSquare','materialCostPerSquare','tearOffPerSquare','underlaymentPerSquare'],
        FLAT_ROOF_REPLACEMENT:['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'],
        FLOORING_INSTALL:['laborPerSqft','materialPerSqft','removalPerSqft'],
        FLOORING_REPLACEMENT:['laborPerSqft','materialPerSqft','removalPerSqft'],
        FENCING_INSTALL:['laborPerLinearFoot','materialPerLinearFoot','postPrice','gatePrice'],
        FENCING_REPLACEMENT:['laborPerLinearFoot','materialPerLinearFoot','postPrice','gatePrice','removalPerLinearFoot'],
        SIDING_REPLACEMENT:['laborPerSqft','materialPerSqft'],
        LANDSCAPING_MULCH:['mulchMaterialPerYard','bedPrepLaborPerSqft'],
        LANDSCAPING_PLANTING:['mulchMaterialPerYard','bedPrepLaborPerSqft','plantingLaborPerPlant','plantMaterialAllowance']
      };
      if(priceMaps[meta.serviceType]?.includes(field.field))Object.assign(info,{type:'json',tree:{depth:1}});
      if(field.field==='mowingBaseRatePerSqft')Object.assign(info,{label:prior.label,title:prior.title,help:prior.help,engineLabel:field.label});
      const enums={accessoryPricingMode:['per_square_allin','itemized'],materialAccessoryBasis:['excludes_itemized_accessories'],vinylPlankUnderlaymentRule:['always_included','never_included','subfloor_condition','customer_selectable_addon','owner_review'],customPricingMode:['fixed','range','inspection_first'],customChargeClassification:PRICE_BASIS_CATEGORIES};
      if(enums[field.field])Object.assign(info,{type:'select',options:enums[field.field],optionLabels:Object.fromEntries(enums[field.field].map(v=>[v,v.replaceAll('_',' ')]))});
      if(field.field==='underlaymentPriceBasis')Object.assign(info,meta.serviceType==='ROOFING_REPLACEMENT'?{type:'json',tree:{leafType:'enum',options:['installed_area_sell_price','cost']}}:{type:'select',options:['installed_area_sell_price','cost'],optionLabels:{installed_area_sell_price:'Installed-area sell price',cost:'Cost'}});
      if(['repairHours','repairMaterialAllowance','patchRepairHours','patchMaterialAllowance'].includes(field.field)||meta.serviceType==='SIDING_REPAIR'&&field.field==='materialAllowance')Object.assign(info,{type:'json',tree:{depth:3,leafKeys:['small','medium','large']}});
      if(field.field==='postsIncludedInMaterial')Object.assign(info,{type:'json',tree:{leafType:'boolean'}});
      return info;
    });
    return {...old,...meta,name:meta.service,requiresOffering,fields,legacyClass2Fields:(old?.class2Fields||[]).filter(field=>!meta.class2Fields.some(current=>current.name===field.field)),class2Fields:meta.class2Fields.map(field=>({...field,field:field.name})),class2Defaults:Object.fromEntries(meta.class2Fields.map(field=>[field.name,field.defaultValue])),sampleInputs:{}};
  })};
}
