const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const empty = value => value === undefined || value === null ||
  (typeof value === 'string' && value.trim() === '') ||
  (Array.isArray(value) && value.length === 0) ||
  (record(value) && Object.keys(value).length === 0);

// There is no approved classifier for deciding whether prose affects price.
// Preserve it for review; do not guess, remove, or reinterpret requested work.
export function wholeRequestIssues(submission, selectedServiceName, {preview=false}={}) {
  const issues = [];
  const accepted=new Set(['requestId','serviceId','serviceRequest','customerInputs','contact','location','context','explicitUnknowns','urgency','customerFeeSelections','ownerId','callerType',...(preview?['revision','service','defaults']:[])]);
  if(Object.keys(submission).some(key=>!accepted.has(key))) issues.push('Unsupported request fields require review; no supplied scope may be silently omitted.');
  if (!empty(submission.explicitUnknowns)) issues.push('Explicitly unknown project facts require review.');
  if (!empty(submission.context)) issues.push('Additional project details require review of the complete requested scope.');
  if (!empty(submission.serviceRequest) &&
      (typeof submission.serviceRequest !== 'string' || submission.serviceRequest.trim() !== selectedServiceName.trim())) {
    issues.push('The service description differs from the selected saved offering and requires review.');
  }
  return issues;
}
