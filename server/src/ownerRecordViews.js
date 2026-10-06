import {declaredAdditionalWork} from './quoteScopeDisclosure.js';

export function storedObject(value) {
  try { const parsed=JSON.parse(value); return parsed && typeof parsed==='object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

const safeText=(value,max)=>typeof value==='string'&&value.trim()?value.trim().slice(0,max):undefined;
export function followUpContact(value) {
  return Object.fromEntries(['name','phone','email'].flatMap(key=>{const text=safeText(value?.[key],key==='phone'?64:320);return text===undefined?[]:[[key,text]];}));
}
export function followUpLocation(value) {
  return Object.fromEntries(['line1','line2','addressLine1','addressLine2','city','region','postalCode','country'].flatMap(key=>{const text=safeText(value?.[key],200);return text===undefined?[]:[[key,text]];}));
}
function followUpUrgency(value) {
  if(typeof value==='string')return safeText(value,1000)||null;
  if(!['active_leak','flooding','safety','complaint'].includes(value?.reason))return null;
  return {reason:value.reason,summary:safeText(value.summary,1000)||null,
    recordedAt:safeText(value.recordedAt,64)||null,source:safeText(value.source,64)||null};
}

// Voice stores the same application calculation under applicationOutcome.
// These are historical receipts: never calculate again using today's rates.
export function storedQuoteView(row, role, originalSubmission) {
  const internal=storedObject(row.resultJson), calculation=internal.applicationOutcome || internal;
  const submitted=originalSubmission||internal.originalSubmission||{};
  return {id:row.id, callId:row.callId, serviceType:row.serviceType, status:row.status,
    tierChosen:row.tierChosen, createdAt:row.createdAt, result:calculation.customerResult || null,
    contact:followUpContact(submitted.contact),location:followUpLocation(submitted.location),
    context:safeText(submitted.context,4000)||null,
    ...(role==='owner'?{internal}: {})};
}

export function storedLeadView(row, role, originalSubmission, preferredRequest) {
  const detail=storedObject(row.collectedInputsJson), calculation=detail.applicationOutcome || detail;
  const submitted=originalSubmission || detail.originalSubmission || {};
  const common={id:row.id,callId:row.callId,customerName:row.customerName,callerNumber:row.callerNumber,
    describedService:row.describedService,type:row.type,status:row.status,createdAt:row.createdAt,
    contact:followUpContact(submitted.contact??detail.contact),location:followUpLocation(submitted.location??detail.address),
    customerInputs:submitted.customerInputs??calculation.request?.customerInputs??null,
    explicitUnknowns:submitted.explicitUnknowns??null,urgency:followUpUrgency(detail.urgency??submitted.urgency),context:submitted.context??null,
    notes:safeText(detail.notes,1000)||null,
    reviewReason:calculation.applicationReview?.reason??calculation.internalResult?.reviewReason??calculation.leadEnvelope?.reviewReason??null};
  common.clarifications=calculation.customerClarifications||[];
  common.additionalWork=declaredAdditionalWork(submitted,common.clarifications.map(item=>item.field));
  common.submittedAdditionalWork=submitted.additionalWork??null;
  common.contact={...followUpContact({name:row.customerName,phone:row.callerNumber}),...common.contact};
  common.captureHistory=(Array.isArray(detail.captureHistory)?detail.captureHistory:[]).map(item=>({
    source:safeText(item.source,64),at:safeText(item.at,64),contact:followUpContact(item.contact),location:followUpLocation(item.address),
    notes:safeText(item.notes,1000)||null,description:safeText(item.description,1000)||null}));
  if(preferredRequest){
    common.submittedContact=common.contact;common.submittedLocation=common.location;
    common.preferredRequest={id:preferredRequest.id,status:preferredRequest.status,createdAt:preferredRequest.createdAt,
      contact:followUpContact(storedObject(preferredRequest.customerJson)),location:followUpLocation(storedObject(preferredRequest.locationJson))};
    common.contact={...common.contact,...common.preferredRequest.contact};
    if(Object.keys(common.preferredRequest.location).length)common.location=common.preferredRequest.location;
    common.followUpSource={kind:'booking_preference',id:preferredRequest.id,createdAt:preferredRequest.createdAt};
    for(const capture of Array.isArray(detail.captureHistory)?detail.captureHistory:[]){
      if(!(Date.parse(capture.at)>Date.parse(preferredRequest.createdAt)))continue;
      const fields=Array.isArray(capture.providedFields)?capture.providedFields:[];
      let corrected=false;
      for(const field of ['name','email'])if(fields.includes(field)){
        const contact=followUpContact(capture.contact);if(contact[field]!==undefined){common.contact[field]=contact[field];corrected=true;}
      }
      if(fields.includes('address')){common.location=followUpLocation(capture.address);corrected=true;}
      if(corrected)common.followUpSource={kind:'voice_capture',createdAt:safeText(capture.at,64)};
    }
  }
  common.customerName=common.preferredRequest?.contact.name?common.contact.name:row.customerName??common.contact.name;
  common.callerNumber=common.preferredRequest?.contact.phone?common.contact.phone:row.callerNumber??common.contact.phone;
  if(calculation.customerResult?.resultType==='PARTIAL_ESTIMATE_READY')Object.assign(common,{
    linkedQuoteId:detail.linkedQuoteId || row.id,additionalWork:calculation.customerResult.additionalWork,
    additionalWorkStatus:calculation.customerResult.additionalWorkStatus,pricedScope:calculation.customerResult.pricedScope});
  return role==='owner'?{...common,internal:detail}:common;
}
