import {reviewLabel} from '../../server/priceBookLabels.js';

// Machine diagnostics stay intact in the API. Owner surfaces use the editor's
// existing labels; generated receipts are never decisions for an owner to enter.
export const CONFIGURATION_HELP='Choose each rate meaning, tax treatment and charge rule. Missing decisions keep customer requests in review.';
const receipts=/^(id|serviceId|ownerId|origin|approval|approvedValues|confirmedFields)(\.|$)/;
export function ownerDiagnosticLabels(status,service,meta={}) {
 const paths=[...(status.missingOwnerFields||[]),...(status.invalidOwnerFields||[]),...(status.unsupportedOwnerFields||[]),...(status.crossFieldOwnerFields||[]),...(status.ownerDiagnostics||[]).map(d=>d.path).filter(Boolean)];
 return [...new Set(paths.filter(path=>!receipts.test(path)&&path!=='pricing').map(path=>reviewLabel(path.replace(/^businessDefaults\./,''),service,meta)))];
}
export function ownerValidationMessages(result,book,metadata) {
 return (result.statuses||[]).flatMap((status,index)=>{
  const service=book.services[index];
  if(!service||service.active===false||status.status==='DISABLED')return [];
  const labels=ownerDiagnosticLabels(status,service,metadata.find(m=>m.serviceType===service.serviceType));
  if(labels.length)return [(service.service||'Your prices')+': '+labels.join('; ')+'. '+CONFIGURATION_HELP];
  // Approval already has a dedicated review flow. It is not a missing price.
  return (status.validationErrors||[]).filter(message=>!message.includes('Confirm this exact saved configuration')).map(message=>ownerMessage(message));
 });
}
export function ownerMessage(message,fallback='Review configuration') {
 if(!message)return fallback;
 // Last boundary for unstructured errors (transport, preview, recovery). Do
 // not guess a label from an arbitrary backend sentence or echo internal keys.
 const text=String(message).replace(/https?:\/\/\S+|\bQuoteDone\b/g,'');
 return /\b[a-z]+[A-Z][A-Za-z0-9]*\b|\b[A-Za-z]\w*(?:\.[A-Za-z_]\w*)+\b/.test(text)||text.includes('Tier pricing contains values that cannot be validated safely')?fallback:message;
}
