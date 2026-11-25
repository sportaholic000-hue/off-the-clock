import {usageOwnerQuery} from './billingUsagePolicy.js';
import {utcToLocalParts,isValidIanaTimeZone} from './calendarTime.js';
import {CANADIAN_PROVINCES} from '../taxJurisdiction.js';

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
// The business country saved at onboarding (CA or US), or undefined.
export function applicationBusinessCountry(ownerId) {
  if(!profileDatabase||typeof ownerId!=='string')return undefined;
  const row=usageOwnerQuery(profileDatabase)('SELECT (SELECT country FROM businessProfiles WHERE businessProfiles.ownerId = users.id) AS country FROM users WHERE id = @ownerId').get({ownerId});
  return ['CA','US'].includes(row?.country)?row.country:undefined;
}
// Whether the owner profile store is available (it is, in the application).
export function applicationProfileStoreAvailable() { return !!profileDatabase; }
// True when the owner profile store is available and no business country is
// saved: such a business cannot have a live service.
export function applicationBusinessCountryMissing(ownerId) {
  return !!profileDatabase&&typeof ownerId==='string'&&applicationBusinessCountry(ownerId)===undefined;
}
// The province saved at onboarding for a Canadian business, or undefined.
export function applicationBusinessProvince(ownerId) {
  if(!profileDatabase||typeof ownerId!=='string')return undefined;
  const row=usageOwnerQuery(profileDatabase)('SELECT (SELECT country FROM businessProfiles WHERE businessProfiles.ownerId = users.id) AS country, (SELECT region FROM businessProfiles WHERE businessProfiles.ownerId = users.id) AS region FROM users WHERE id = @ownerId').get({ownerId});
  return row?.country==='CA'&&CANADIAN_PROVINCES.includes(row?.region)?row.region:undefined;
}
export function applicationDateContext(ownerId,context={}) {
  const quoteInstant=context.quoteInstant===undefined?new Date():context.quoteInstant;
  if(Object.hasOwn(context,'timeZone'))return {timeZone:context.timeZone,quoteInstant};
  return profileDatabase&&typeof ownerId==='string'
    ?quoteDateContext(profileDatabase,ownerId,quoteInstant)
    :{timeZone:undefined,quoteInstant};
}
// One definition, shared with the customer and preview forms.
export {peakSurchargeConfigured} from '../customerContextFields.js';
export function resolvedQuoteTimeZone(defaults={},profileTimeZone) {
  return isValidIanaTimeZone(defaults.quoteTimeZone)?defaults.quoteTimeZone:isValidIanaTimeZone(profileTimeZone)?profileTimeZone:null;
}
export function quoteDefaultsForTimeZone(defaults,timeZone) {
  const result={...defaults};
  if(timeZone===null)delete result.quoteTimeZone;else result.quoteTimeZone=timeZone;
  return result;
}
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
  return null;
}
export function recordedQuoteDateIssue(service,defaults,date) {
  return recordedQuoteDateDiagnostic(service,defaults,date)?.message??null;
}
export function monthForRecordedQuoteDate(date) {
  // Null is recorded explicitly when no zone exists. The busy-season surcharge
  // follows the customer's work month, so the quote month never sets a price.
  return date.timeZone===null?new Date(date.quoteInstant).getUTCMonth()+1:Number(utcToLocalParts(date.quoteInstant,date.timeZone).month);
}
export function applicationQuoteMonth(service,defaults,context={}) {
  const date=applicationQuoteDate(service,defaults,context);
  return recordedQuoteDateIssue(service,defaults,date)?null:monthForRecordedQuoteDate(date);
}
