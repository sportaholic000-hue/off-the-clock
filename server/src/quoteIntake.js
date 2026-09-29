import crypto from 'node:crypto';

export const JOB_DETAILS_FLOW = 'job-details-v1';
export const LOCATION_FIELDS = ['addressLine1','addressLine2','city','region','postalCode','country'];
export const TIMING_CHOICES = {flexible:'Flexible timing',contact_requested:'Please contact me about timing'};
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : record(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;

// These are answers to displayed questions, not classifications of the text.
// Keep the original text, question and answer together in the saved request.
export function intakeQuestions(submission) {
  const questions=[];
  if(typeof submission.context==='string'&&submission.context.trim())questions.push({field:'context',text:'Do these additional details change the work or measurements to be priced?',options:{message_only:'No, this is only a message for the business',work_changes:'Yes, the job details still need updating'}});
  if(typeof submission.explicitUnknowns==='string'&&submission.explicitUnknowns.trim())questions.push({field:'explicitUnknowns',text:'Are any of the measurements or job details above still unknown?',options:{resolved:'No, the answers above are now complete',still_unknown:'Yes, something still needs checking'}});
  return questions;
}
export function clarificationSummary(submission) {
  return intakeQuestions(submission).filter(question=>Object.hasOwn(question.options,submission.intakeClarification?.answers?.[question.field])).map(question=>({field:question.field,question:question.text,answer:question.options[submission.intakeClarification.answers[question.field]]}));
}
function detailsSignature(purpose,ownerId,revision,submission) {
  const secret=process.env.JWT_SECRET;
  if(!secret)throw new Error('The application signing key is unavailable.');
  return crypto.createHmac('sha256',secret).update(JSON.stringify(canonical({purpose,ownerId,revision,submission}))).digest('hex');
}
function receiptValid(receipt,purpose,ownerId,submission,revision=receipt?.bookRevision) {
  if(!record(receipt)||Object.keys(receipt).some(key=>!['bookRevision','signature'].includes(key))||
    typeof revision!=='string'||receipt.bookRevision!==revision||typeof receipt.signature!=='string'||!/^[a-f0-9]{64}$/.test(receipt.signature))return false;
  return crypto.timingSafeEqual(Buffer.from(receipt.signature,'hex'),Buffer.from(detailsSignature(purpose,ownerId,revision,submission),'hex'));
}
export function createHistoryReceipt(ownerId,revision,submission) {
  return {bookRevision:revision,signature:detailsSignature('intake-history-v1',ownerId,revision,submission)};
}
export function validIntakeHistory(ownerId,submission) {
  const previous=submission.previousIntake;
  return previous===undefined||record(previous)&&Object.keys(previous).length===2&&record(previous.submission)&&
    receiptValid(previous.receipt,'intake-history-v1',ownerId,previous.submission);
}
function clarificationDetails(submission) {
  const body=structuredClone(submission);delete body.intakeClarification;delete body.intakeConfirmation;delete body.reviewRequested;delete body.revision;return body;
}
export function createClarificationReceipt(ownerId,revision,submission) {
  return {bookRevision:revision,signature:detailsSignature('intake-questions-v1',ownerId,revision,clarificationDetails(submission))};
}
export function intakeClarification(ownerId,revision,submission) {
  const value=submission.intakeClarification;
  if(value===undefined)return {valid:true,fields:[]};
  const questions=intakeQuestions(submission);
  if(!record(value)||Object.keys(value).length!==2||!record(value.answers)||
    !receiptValid(value.receipt,'intake-questions-v1',ownerId,clarificationDetails(submission),revision)||
    Object.keys(value.answers).length!==questions.length||
    questions.some(question=>!Object.hasOwn(question.options,value.answers[question.field])))return {valid:false,fields:[]};
  return {valid:true,fields:questions.filter(question=>
    value.answers[question.field]===(question.field==='context'?'message_only':'resolved')).map(question=>question.field)};
}

function signedDetails(ownerId,revision,submission,{preview=false}={}) {
  const body=structuredClone(submission);
  delete body.intakeConfirmation;
  // Preview's revision is independently checked against this same saved book.
  // No job, contact, location, draft service or defaults are removed.
  if(preview)delete body.revision;
  const secret=process.env.JWT_SECRET;
  if(!secret)throw new Error('The application signing key is unavailable.');
  return crypto.createHmac('sha256',secret)
    .update(JSON.stringify(canonical({purpose:JOB_DETAILS_FLOW,ownerId,revision,body}))).digest('hex');
}

export function createIntakeConfirmation(ownerId,revision,submission) {
  return {version:JOB_DETAILS_FLOW,bookRevision:revision,signature:signedDetails(ownerId,revision,submission)};
}

export function validIntakeConfirmation(ownerId,revision,submission,options={}) {
  const proof=submission?.intakeConfirmation;
  if(submission?.intakeFlow!==JOB_DETAILS_FLOW||!record(proof)||
    Object.keys(proof).some(key=>!['version','bookRevision','signature'].includes(key))||
    proof.version!==JOB_DETAILS_FLOW||proof.bookRevision!==revision||
    typeof proof.signature!=='string'||!/^[a-f0-9]{64}$/.test(proof.signature))return false;
  return crypto.timingSafeEqual(Buffer.from(proof.signature,'hex'),Buffer.from(signedDetails(ownerId,revision,submission,options),'hex'));
}

const display = value => typeof value==='boolean' ? (value?'Yes':'No')
  : value===null||value===undefined ? 'Not supplied' : typeof value==='object' ? JSON.stringify(value) : String(value);
export function customerJobSummary(service,definition,submission,revision) {
  const labels=new Map((definition?.customerFields||[]).map(field=>[field.name,field]));
  const facts=Object.entries(record(submission.customerInputs)?submission.customerInputs:{}).map(([key,value])=>{
    const field=labels.get(key);
    const formatted=typeof value==='string'&&field?.optionLabels?.[value]||display(value);
    return {label:field?.label||key,value:formatted};
  });
  return {
    service:service?.service||definition?.service||'Selected service',
    requestedWork:structuredClone(submission.serviceRequest??service?.service??definition?.service??'Selected service'),
    bookRevision:revision,
    facts,
    fees:Object.entries(record(submission.customerFeeSelections)?submission.customerFeeSelections:{}).map(([key,value])=>({label:key.replaceAll('_',' '),value:display(value)})),
    contact:structuredClone(submission.contact??{}),
    location:structuredClone(submission.location??{}),
    timing:typeof submission.urgency==='string'&&Object.hasOwn(TIMING_CHOICES,submission.urgency)
      ?TIMING_CHOICES[submission.urgency]:display(submission.urgency)||'No timing preference supplied',
    additionalDetails:structuredClone(submission.context??''),
    unknowns:structuredClone(submission.explicitUnknowns??''),
    clarifications:clarificationSummary(submission)
  };
}
