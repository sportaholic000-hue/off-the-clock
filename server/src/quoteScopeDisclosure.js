import { customerJobSummary } from './quoteIntake.js';

export const ADDITIONAL_WORK_NOTICE = 'The business owner will estimate this additional work on site and agree its price with you before that work starts. It is not included in the estimate for the selected service.';
export const SELECTED_WORK_NOTICE = 'This estimate covers only the selected service and job details listed here. Any additional work described in your submitted details needs a separate on-site estimate from the business owner.';

// This is a lossless record of the customer's declared separate work, not a
// classifier of prose. Never remove a selected engine input to make it price.
export function declaredAdditionalWork(submission,clarifiedFields=[]) {
  const items=(Array.isArray(submission.additionalWork)?submission.additionalWork:[]).filter(item=>typeof item==='string'&&item.trim()).map((description,index)=>({source:`additionalWork[${index}]`,description}));
  for(const field of ['context','serviceRequest'])if(clarifiedFields.includes(field)&&submission.intakeClarification?.answers?.[field]==='additional_work')items.push({source:field,description:submission[field]});
  return items;
}

export function discloseQuoteScope(result,service,definition,submission,revision,clarifiedFields=[]) {
  if(result.resultType!=='INSTANT_ESTIMATE_READY')return result;
  const summary=customerJobSummary(service,definition,submission,revision);
  const pricedScope={service:summary.service,facts:summary.facts,fees:summary.fees};
  // All submitted metadata remains visible. The application does not claim
  // that a name/address field has been semantically classified as scope-free.
  const submittedDetails={requestedWork:summary.requestedWork,contact:summary.contact,location:summary.location,timing:summary.timing,additionalDetails:summary.additionalDetails,unknowns:summary.unknowns,clarifications:summary.clarifications};
  const additionalWork=declaredAdditionalWork(submission,clarifiedFields);
  const scope={pricedScope,submittedDetails,scopeNotice:SELECTED_WORK_NOTICE,fullJobTotal:null};
  if(!additionalWork.length)return {...result,...scope};
  // A partial response has no top-level amount or options that an API consumer
  // could mistake for the whole job. The unchanged engine estimate is nested.
  return {resultType:'PARTIAL_ESTIMATE_READY',quoteId:result.quoteId,pricedEstimate:result,...scope,additionalWork,additionalWorkStatus:'ON_SITE_ESTIMATE_REQUIRED',customerMessage:ADDITIONAL_WORK_NOTICE};
}

// Historical retry receipts keep their original amounts. Apply the current
// public presentation boundary without recalculating or rewriting that record.
export function customerReceiptPresentation(response) {
 const next=structuredClone(response);
 function clean(quote){
  if(!quote||typeof quote!=='object')return;
  delete quote.rangeBufferUsed;
  for(const option of quote.options||[])delete option.rangeBufferUsed;
  if(quote.pricedScope){for(const field of ['serviceId','serviceType','bookRevision'])delete quote.pricedScope[field];}
  if(quote.jobSummary)delete quote.jobSummary.bookRevision;
  if(quote.pricedEstimate)clean(quote.pricedEstimate);
 }
 clean(next);return next;
}
