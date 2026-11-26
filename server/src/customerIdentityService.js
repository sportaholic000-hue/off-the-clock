import {randomUUID} from 'node:crypto';
import {usageOwnerQuery} from './billingUsagePolicy.js';

// International syntax ("+" and digits): never infer a country or match names/emails.
// Normalization verifies syntax, not ownership. Signed voice context supplies
// the caller number; public web contact never authenticates a caller.
// Used as-is by the caller blocklist and the per-caller call limit.
export function customerPhone(value) {
  if(typeof value!=='string'||!/^\+[\d\s().-]+$/.test(value.trim()))return null;
  const phone='+'+value.replace(/\D/g,'');
  return /^\+[1-9]\d{7,14}$/.test(phone)?phone:null;
}
// Twilio turns a withheld caller ID's carrier word into digits and sends them as
// the caller number (support article 223179988): RESTRICTED 7378742833, BLOCKED
// 2562533, UNKNOWN 8656696, ANONYMOUS 266696687, UNAVAILABLE 86282452253,
// EMPTY and "No Caller ID" 464. They identify nobody, with or without "+".
const WITHHELD_CALLER_DIGITS=new Set(['7378742833','2562533','8656696','266696687','86282452253','464']);
export const withheldCallerId=value=>typeof value==='string'&&WITHHELD_CALLER_DIGITS.has(value.replace(/\D/g,''));
const NORTH_AMERICAN_COUNTRIES=new Set(['CA','US']);
// Customer identity (customers, returning-caller history, captured contact numbers).
// A number with "+" keeps its international reading. For a business in Canada or
// the US (businessProfiles.country), a number typed without a country code is a
// North American number when it has 10 digits, or 11 starting with 1, with a valid
// area code and exchange (first digit 2-9, not N11; area code middle digit 0-8).
// Anything else, and every withheld caller ID, identifies nobody.
export function identityPhone(value,country) {
  if(typeof value!=='string')return null;
  const raw=value.trim(),digits=raw.replace(/\D/g,'');
  if(withheldCallerId(raw))return null;
  if(raw.startsWith('+'))return customerPhone(raw);
  if(!NORTH_AMERICAN_COUNTRIES.has(country)||!/^[\d\s().-]+$/.test(raw))return null;
  const national=digits.length===11&&digits[0]==='1'?digits.slice(1):digits;
  return /^[2-9][0-8]\d[2-9]\d{6}$/.test(national)&&!/^\d11|^\d{4}11/.test(national)?'+1'+national:null;
}
// SQL spelling of identityPhone for a business: stored columns are compared after
// the same normalization, so rows saved before it still match their caller.
export function identityPhoneSql(country) {
  return NORTH_AMERICAN_COUNTRIES.has(country)?'identity_phone_na':'identity_phone';
}
const registered=new WeakSet();
export function customerQuery(database) {
  if(!registered.has(database)){
    database.function('customer_phone',{deterministic:true},customerPhone);
    database.function('identity_phone',{deterministic:true},value=>identityPhone(value,null));
    database.function('identity_phone_na',{deterministic:true},value=>identityPhone(value,'CA'));
    registered.add(database);
  }
  return sql=>{
    if(!/\bownerId\b/.test(sql))throw new Error('Customer queries require ownerId.');
    return usageOwnerQuery(database)(sql);
  };
}
// The business's country from its jurisdiction setting (onboarding step 3).
export function businessCountry(query,ownerId) {
  return query('SELECT country FROM businessProfiles WHERE ownerId=?').get(ownerId)?.country??null;
}
// A captured contact number as the Leads page stores it: normalized when it is a
// valid identity number for this business, otherwise exactly as typed.
export function capturedPhone(database,ownerId,value) {
  return identityPhone(value,businessCountry(customerQuery(database),ownerId))??value;
}
export function findCustomer(database,ownerId,phone) {
  const query=customerQuery(database),country=businessCountry(query,ownerId),normalized=identityPhone(phone,country);
  if(!normalized)return null;
  // Stable oldest identity also handles legacy secret-derived duplicates without
  // deleting records, moving other people's records or rewriting old receipts.
  return query(`SELECT * FROM customers WHERE ownerId=? AND ${identityPhoneSql(country)}(phoneE164)=?
    ORDER BY createdAt,id LIMIT 1`).get(ownerId,normalized)||null;
}
// Call only within the producer's IMMEDIATE transaction. SQLite serializes both
// web and voice writers, including separate connections/processes and retries.
export function resolveCustomer(database,{ownerId,phone,createdAt}) {
  if(!database.inTransaction&&!database.isTransaction)throw new Error('Customer resolution requires an atomic producer transaction.');
  const normalized=identityPhone(phone,businessCountry(customerQuery(database),ownerId));if(!normalized)return null;
  const existing=findCustomer(database,ownerId,normalized);if(existing)return existing;
  const id=randomUUID();
  customerQuery(database)('INSERT INTO customers(id,ownerId,phoneE164,createdAt) VALUES(?,?,?,?)').run(id,ownerId,normalized,createdAt);
  return {id,ownerId,phoneE164:normalized,name:null,address:null,notesJson:null,createdAt};
}
