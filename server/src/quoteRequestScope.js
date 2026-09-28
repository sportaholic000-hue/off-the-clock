import { isCallbackEmail, isCallbackPhone } from './quoteContact.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const optionalText = value => value === undefined || value === null || typeof value === 'string';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const empty = value => value === undefined || value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0) ||
  (record(value) && Object.keys(value).length === 0);

// There is no approved classifier for deciding whether prose affects price.
// Preserve it for review; do not guess, remove, or reinterpret requested work.
export function wholeRequestIssues(submission, selectedServiceName, {preview=false}={}) {
  if (!record(submission)) return ['The submitted request must be an object.'];
  const issues = [];
  const accepted=new Set(['requestId','serviceId','serviceRequest','customerInputs','contact','location','context','explicitUnknowns','urgency','customerFeeSelections','ownerId','callerType',...(preview?['revision','service','defaults']:[])]);
  if(Object.keys(submission).some(key=>!accepted.has(key))) issues.push('Unsupported request fields require review; no supplied scope may be silently omitted.');
  if (submission.requestId !== undefined && !uuid(submission.requestId)) issues.push('A supplied request identity must be a UUID.');
  if (preview) {
    if (Object.hasOwn(submission,'service') && !record(submission.service)) issues.push('A supplied preview service must be an object.');
    if (Object.hasOwn(submission,'defaults') && (!record(submission.defaults) || !record(submission.service))) {
      issues.push('Preview defaults require an accompanying draft service object; supplied defaults cannot be silently ignored.');
    }
  }
  if (!empty(submission.explicitUnknowns)) issues.push('Explicitly unknown project facts require review.');
  if (!empty(submission.context)) issues.push('Additional project details require review of the complete requested scope.');
  if (!optionalText(submission.serviceRequest) || (!empty(submission.serviceRequest) &&
      submission.serviceRequest.trim() !== selectedServiceName.trim())) {
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
      if (!empty(contact.name)) issues.push('Untriaged contact-name text requires review of the complete request.');
      if (!empty(contact.email) && !isCallbackEmail(contact.email)) issues.push('Unresolved email-field text requires review.');
      if (!empty(contact.phone) && !isCallbackPhone(contact.phone)) issues.push('Unresolved phone-field text requires review.');
    }
  }
  const location = submission.location;
  if (!optionalText(location) && (!record(location) || Object.keys(location).some(key => key !== 'address') || !optionalText(location.address))) {
    issues.push('Unsupported location fields or values require review of the original request.');
  } else if (!empty(record(location) ? location.address : location)) {
    issues.push('Untriaged project-location text requires review of the complete request.');
  }
  if (!optionalText(submission.urgency)) issues.push('Unsupported urgency values require review of the original request.');
  else if (!empty(submission.urgency)) issues.push('Untriaged urgency text requires review of the complete request.');
  if (submission.ownerId !== undefined && submission.ownerId !== null && !uuid(submission.ownerId)) issues.push('Unsupported owner-identity values require review.');
  if (submission.callerType !== undefined && submission.callerType !== null && !['owner','customer','staff'].includes(submission.callerType)) issues.push('Unsupported caller-category values require review.');
  return issues;
}
