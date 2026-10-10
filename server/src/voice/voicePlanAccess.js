import {hasOperatorAccess,hasQuoteDoneAccess,hasReceptionistAccess} from '../planAccess.js';

const BOOKING_TOOLS=new Set(['checkAvailability','bookAppointment','modifyAppointment']);
const QUOTE_TOOLS=new Set(['matchService','getQuote','calculateVoiceArea','prepareQuoteEmail','sendQuoteEmail']);
export function voicePlanCapabilities(account,options){
  return {receptionist:hasReceptionistAccess(account,options),booking:hasOperatorAccess(account,options),transfer:hasOperatorAccess(account,options),phoneQuoting:hasQuoteDoneAccess(account,options)};
}
export function voiceToolAllowed(name,capabilities){
  if(!capabilities.receptionist)return false;
  if(BOOKING_TOOLS.has(name))return capabilities.booking;
  if(name==='transferCall')return capabilities.transfer;
  if(QUOTE_TOOLS.has(name))return capabilities.phoneQuoting;
  return true;
}
export const PLAN_TOOL_UNAVAILABLE=Object.freeze({status:'needs_details',customerMessage:'The business will review this request. Take the caller’s details and save a lead; do not offer a booking, transfer or calculated quote.'});
