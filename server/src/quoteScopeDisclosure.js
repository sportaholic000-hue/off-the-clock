import { customerJobSummary } from './quoteIntake.js';

// The engine's sanitized skipped-add-on labels are the only source of these
// exclusions. Keep this presentation boundary free of engine imports.
const SURFACE_EXTRA_LABELS=new Set(['Door sides','Door frames','Windows','Cabinet doors or drawer faces','Doors','Shutters','Garage doors','Exterior trim','Soffit','Fascia','Power washing']);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);

function sharedSurfaceExclusions(estimate) {
  if(!record(estimate))return [];
  const options=Array.isArray(estimate.options)&&estimate.options.length?estimate.options:[estimate];
  if(!options.length||options.some(option=>!record(option)))return [];
  const optionExclusions=options.map(option=>(Array.isArray(option.skippedAddons)?option.skippedAddons:[])
    .filter(label=>typeof label==='string'&&SURFACE_EXTRA_LABELS.has(label)));
  return [...new Set(optionExclusions[0])].filter(label=>optionExclusions.every(labels=>labels.includes(label)));
}

const surfaceWorkItems=estimate=>sharedSurfaceExclusions(estimate)
  .map(description=>({source:'unpriced_surface_work',description}));

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
  if(['INTERIOR_PAINTING','EXTERIOR_PAINTING','SIDING_REPLACEMENT'].includes(service.serviceType)){
    additionalWork.push(...surfaceWorkItems(result));
  }
  const scope={pricedScope,submittedDetails,scopeNotice:SELECTED_WORK_NOTICE,fullJobTotal:null};
  if(!additionalWork.length)return {...result,...scope};
  // A partial response has no top-level amount or options that an API consumer
  // could mistake for the whole job. The unchanged engine estimate is nested.
  return {resultType:'PARTIAL_ESTIMATE_READY',quoteId:result.quoteId,pricedEstimate:result,...scope,additionalWork,additionalWorkStatus:'ON_SITE_ESTIMATE_REQUIRED',customerMessage:ADDITIONAL_WORK_NOTICE};
}

// Historical retry receipts keep their original amounts. Apply the current
// public presentation boundary without recalculating or rewriting that record.
export function customerReceiptPresentation(response) {
 let next=structuredClone(response);
 // Earlier presentations promoted the union of every option's surface
 // exclusions into one whole-quote exclusion. Rebuild only that generated
 // portion from the intersection while retaining caller-declared work. The
 // stored receipt remains unchanged; this is a customer presentation clone.
 if(next?.resultType==='PARTIAL_ESTIMATE_READY'&&next.pricedEstimate?.resultType==='INSTANT_ESTIMATE_READY'){
  const retained=(Array.isArray(next.additionalWork)?next.additionalWork:[]).filter(item=>
   !(record(item)&&item.source==='unpriced_surface_work'&&SURFACE_EXTRA_LABELS.has(item.description)));
  const additionalWork=[...retained,...surfaceWorkItems(next.pricedEstimate)];
  if(additionalWork.length)next={...next,additionalWork};
  else {
   const {pricedEstimate,additionalWork:ignoredWork,additionalWorkStatus:ignoredStatus,customerMessage:ignoredMessage,...outer}=next;
   next={...pricedEstimate,...outer,resultType:'INSTANT_ESTIMATE_READY'};
  }
 }
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
