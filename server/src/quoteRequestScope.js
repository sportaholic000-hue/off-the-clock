import { isCallbackEmail, isCallbackPhone } from './quoteContact.js';
import { JOB_DETAILS_FLOW, LOCATION_FIELDS, TIMING_CHOICES } from './quoteIntake.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const optionalText = value => value === undefined || value === null || typeof value === 'string';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const empty = value => value === undefined || value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0) ||
  (record(value) && Object.keys(value).length === 0);

// Legacy mixed-purpose text remains untriaged. The guided form separates
// identity/site/timing from work and uses a server-checked job summary.
// Neither path classifies arbitrary prose. Only recorded answers to the
// application's bound clarification questions can resolve notes/unknowns.
export function wholeRequestIssues(submission, selectedServiceName, {preview=false,guidedIntake=false,clarifiedFields=[]}={}) {
  if (!record(submission)) return ['The submitted request must be an object.'];
  const issues = [];
  const accepted=new Set(['requestId','serviceId','serviceRequest','customerInputs','contact','location','context','explicitUnknowns','urgency','customerFeeSelections','ownerId','callerType','intakeFlow','intakeConfirmation','reviewRequested','intakeClarification','previousIntake','additionalWork',...(preview?['revision','service','defaults']:[])]);
  if(Object.keys(submission).some(key=>!accepted.has(key))) issues.push('Unsupported request fields require review; no supplied scope may be silently omitted.');
  const guided=guidedIntake&&submission.intakeFlow===JOB_DETAILS_FLOW;
  if((submission.intakeFlow!==undefined||submission.intakeConfirmation!==undefined)&&!guided)issues.push('Review the current job details before requesting an estimate.');
  if(submission.reviewRequested!==undefined&&typeof submission.reviewRequested!=='boolean')issues.push('The review choice must be true or false.');
  if(submission.reviewRequested===true)issues.push('The customer requested business review of the original details.');
  if (submission.requestId !== undefined && !uuid(submission.requestId)) issues.push('A supplied request identity must be a UUID.');
  if(submission.additionalWork!==undefined&&(!Array.isArray(submission.additionalWork)||submission.additionalWork.some(item=>typeof item!=='string'||!item.trim())))issues.push('Describe additional work as a list of nonempty text descriptions.');
  if (preview) {
    if (Object.hasOwn(submission,'service') && !record(submission.service)) issues.push('A supplied preview service must be an object.');
    if (Object.hasOwn(submission,'defaults') && (!record(submission.defaults) || !record(submission.service))) {
      issues.push('Preview defaults require an accompanying draft service object; supplied defaults cannot be silently ignored.');
    }
  }
  if (!empty(submission.explicitUnknowns)&&!(guided&&typeof submission.explicitUnknowns==='string'&&clarifiedFields.includes('explicitUnknowns'))) issues.push('Check which measurements or job details are still unknown.');
  if (!empty(submission.context)&&!(guided&&typeof submission.context==='string'&&clarifiedFields.includes('context'))) issues.push('Check whether the additional details change the work to be priced.');
  if(!guided&&(submission.intakeClarification!==undefined||submission.previousIntake!==undefined))issues.push('Check the current job details and earlier answers before requesting an estimate.');
  if (!optionalText(submission.serviceRequest) || (!empty(submission.serviceRequest) &&
      submission.serviceRequest.trim().toLowerCase() !== selectedServiceName.trim().toLowerCase()&&!(guided&&clarifiedFields.includes('serviceRequest')))) {
    issues.push('The service description differs from the selected saved offering and requires review.');
  }
  // Known envelope names do not authorize arbitrary nested fields. Preserve
  // unsupported shapes for review instead of dropping their supplied contents.
  if (submission.contact !== undefined && submission.contact !== null) {
    const contact = submission.contact;
    if (!record(contact) || Object.keys(contact).some(key => !['name','email','phone'].includes(key)) ||
        ['name','email','phone'].some(key => !optionalText(contact[key]))) {
      issues.push('Unsupported contact fields or values require review of the original request.');
    } else {
      if (!guided&&!empty(contact.name)) issues.push('Untriaged contact-name text requires review of the complete request.');
      if (!empty(contact.email) && !isCallbackEmail(contact.email)) issues.push('Unresolved email-field text requires review.');
      if (!empty(contact.phone) && !isCallbackPhone(contact.phone)) issues.push('Unresolved phone-field text requires review.');
    }
  }
  const location = submission.location;
  if(guided) {
    if(!(location===undefined||location===null||typeof location==='string'&&!location.trim())&&(!record(location)||Object.keys(location).some(key=>!LOCATION_FIELDS.includes(key))||
      LOCATION_FIELDS.some(key=>!optionalText(location[key]))))issues.push('Use the address fields for the site and put work instructions in Additional project details.');
    if(!empty(submission.urgency)&&(typeof submission.urgency!=='string'||!Object.hasOwn(TIMING_CHOICES,submission.urgency)))issues.push('Choose a timing preference; keep other scheduling or work instructions in Additional project details.');
  } else if (!optionalText(location) && (!record(location) || Object.keys(location).some(key => key !== 'address') || !optionalText(location.address))) {
    issues.push('Unsupported location fields or values require review of the original request.');
  } else if (!empty(record(location) ? location.address : location)) {
    issues.push('Untriaged project-location text requires review of the complete request.');
  }
  if (!optionalText(submission.urgency)) issues.push('Unsupported urgency values require review of the original request.');
  else if (!guided&&!empty(submission.urgency)) issues.push('Untriaged urgency text requires review of the complete request.');
  if (submission.ownerId !== undefined && submission.ownerId !== null && !uuid(submission.ownerId)) issues.push('Unsupported owner-identity values require review.');
  if (submission.callerType !== undefined && submission.callerType !== null && !['owner','customer','staff'].includes(submission.callerType)) issues.push('Unsupported caller-category values require review.');
  return issues;
}
