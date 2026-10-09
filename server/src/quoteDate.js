import {usageOwnerQuery} from './billingUsagePolicy.js';
import {utcToLocalParts,isValidIanaTimeZone} from './calendarTime.js';

// Injected by the application composition root. Pure quote calculations never
// open a database. Readiness callers without an explicit context still read
// the current owner's profile rather than caching a profile value globally.
let profileDatabase;
export function registerQuoteDateDatabase(database) { profileDatabase=database; }

// Owner identity and clock are trusted application arguments, never request data.
export function quoteDateContext(database,ownerId,now=new Date()) {
  const row=usageOwnerQuery(database)('SELECT timezone FROM users WHERE id = @ownerId').get({ownerId});
  return {timeZone:row?.timezone,quoteInstant:now};
}
export function applicationDateContext(ownerId,context={}) {
  const quoteInstant=context.quoteInstant===undefined?new Date():context.quoteInstant;
  if(Object.hasOwn(context,'timeZone'))return {timeZone:context.timeZone,quoteInstant};
  return profileDatabase&&typeof ownerId==='string'
    ?quoteDateContext(profileDatabase,ownerId,quoteInstant)
    :{timeZone:undefined,quoteInstant};
}
export function peakSurchargeConfigured(service={},defaults={}) {
  const months=service.peakMonths!==undefined?service.peakMonths:defaults.peakMonths;
  const percent=service.peakSurchargePercent!==undefined?service.peakSurchargePercent:defaults.peakSurchargePercent;
  return Array.isArray(months)&&months.length>0&&typeof percent==='number'&&percent>0;
}
export function resolvedQuoteTimeZone(defaults={},profileTimeZone) {
  return isValidIanaTimeZone(defaults.quoteTimeZone)?defaults.quoteTimeZone:isValidIanaTimeZone(profileTimeZone)?profileTimeZone:null;
}
export function quoteDefaultsForTimeZone(defaults,timeZone) {
  const result={...defaults};
  if(timeZone===null)delete result.quoteTimeZone;else result.quoteTimeZone=timeZone;
  return result;
}
export const MISSING_PEAK_TIME_ZONE='Choose a valid quote or profile time zone before using a busy-season surcharge.';
export function applicationQuoteDate(service,defaults,{timeZone,quoteInstant=new Date()}={}) {
  const instant=quoteInstant instanceof Date?quoteInstant:typeof quoteInstant==='string'?new Date(quoteInstant):null;
  return {timeZone:resolvedQuoteTimeZone(defaults,timeZone),quoteInstant:instant&&Number.isFinite(instant.getTime())?instant.toISOString():null};
}
export function recordedQuoteDateDiagnostic(service,defaults,date) {
  const invalid=(path,message)=>({type:'invalid',kind:'quote_date',path,message});
  if(!date||typeof date!=='object'||Array.isArray(date)||Object.keys(date).length!==2||!Object.hasOwn(date,'timeZone')||!Object.hasOwn(date,'quoteInstant'))return invalid('quoteDate','Quote date context is incomplete or invalid.');
  if(typeof date.quoteInstant!=='string'||!Number.isFinite(Date.parse(date.quoteInstant))||new Date(date.quoteInstant).toISOString()!==date.quoteInstant)return invalid('quoteDate.quoteInstant','Quote instant is invalid.');
  if(date.timeZone!==null&&!isValidIanaTimeZone(date.timeZone))return invalid('quoteDate.timeZone','Quote time zone is invalid.');
  if(isValidIanaTimeZone(defaults.quoteTimeZone)&&date.timeZone!==defaults.quoteTimeZone)return invalid('quoteDate.timeZone','Quote time zone does not match the configured book time zone.');
  if(date.timeZone===null&&peakSurchargeConfigured(service,defaults))return invalid('businessDefaults.quoteTimeZone',MISSING_PEAK_TIME_ZONE);
  return null;
}
export function recordedQuoteDateIssue(service,defaults,date) {
  return recordedQuoteDateDiagnostic(service,defaults,date)?.message??null;
}
export function monthForRecordedQuoteDate(date) {
  // Null is recorded explicitly when no zone exists and seasonal pricing is
  // off. UTC is used only for a financially irrelevant month in that case.
  return date.timeZone===null?new Date(date.quoteInstant).getUTCMonth()+1:Number(utcToLocalParts(date.quoteInstant,date.timeZone).month);
}
export function applicationQuoteMonth(service,defaults,context={}) {
  const date=applicationQuoteDate(service,defaults,context);
  return recordedQuoteDateIssue(service,defaults,date)?null:monthForRecordedQuoteDate(date);
}
