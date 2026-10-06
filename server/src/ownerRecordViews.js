import {declaredAdditionalWork} from './quoteScopeDisclosure.js';

export function storedObject(value) {
  try { const parsed=JSON.parse(value); return parsed && typeof parsed==='object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}

// Voice stores the same application calculation under applicationOutcome.
// These are historical receipts: never calculate again using today's rates.
export function storedQuoteView(row, role) {
  const internal=storedObject(row.resultJson), calculation=internal.applicationOutcome || internal;
  return {id:row.id, callId:row.callId, serviceType:row.serviceType, status:row.status,
    tierChosen:row.tierChosen, createdAt:row.createdAt, result:calculation.customerResult || null,
    ...(role==='owner'?{internal}: {})};
}

export function storedLeadView(row, role, originalSubmission) {
  const detail=storedObject(row.collectedInputsJson), calculation=detail.applicationOutcome || detail;
  const submitted=originalSubmission || detail.originalSubmission || {};
  const common={id:row.id,callId:row.callId,customerName:row.customerName,callerNumber:row.callerNumber,
    describedService:row.describedService,type:row.type,status:row.status,createdAt:row.createdAt,
    contact:submitted.contact??detail.contact??null,location:submitted.location??detail.address??null,
    customerInputs:submitted.customerInputs??calculation.request?.customerInputs??null,
    explicitUnknowns:submitted.explicitUnknowns??null,urgency:submitted.urgency??null,context:submitted.context??null,
    reviewReason:calculation.applicationReview?.reason??calculation.internalResult?.reviewReason??calculation.leadEnvelope?.reviewReason??null};
  common.clarifications=calculation.customerClarifications||[];
  common.additionalWork=declaredAdditionalWork(submitted,common.clarifications.map(item=>item.field));
  common.submittedAdditionalWork=submitted.additionalWork??null;
  if(calculation.customerResult?.resultType==='PARTIAL_ESTIMATE_READY')Object.assign(common,{
    linkedQuoteId:detail.linkedQuoteId || row.id,additionalWork:calculation.customerResult.additionalWork,
    additionalWorkStatus:calculation.customerResult.additionalWorkStatus,pricedScope:calculation.customerResult.pricedScope});
  return role==='owner'?{...common,internal:detail}:common;
}
