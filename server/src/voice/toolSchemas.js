const HANDLE = /^[A-Za-z0-9_-]{24,200}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORBIDDEN_KEYS = new Set(['ownerpricing','price','amount','total','offeringid','proto','ownerid','tenantid','tenantownerid','accountsid','callsid','from','to','phonenumber','twilionumber','twilionumbersid','serviceid','quoteid','slotid','appointmentid','customerid','leadid','calendarid','pricebook','bookversion','ownerspricing','pricing','rate','rates','unitrate','baserate','cost','internalcost','markup','margin','datetime','rawdatetime','startdatetime','enddatetime','starttime','endtime','durationminutes','prototype','constructor']);
const FORBIDDEN_DERIVED_KEYS = new Set(['hourlyrate','laborrate','materialrate','ownerrate','rawrate','unitprice','unitcost','laborcost','materialcost','estimatedcost','estimatedprice','customerprice','ownerprice','requestedatetime','requesteddatetime','scheduleddatetime']);
const FORBIDDEN_ID_SUFFIXES = ['ownerid','tenantid','accountsid','callsid','serviceid','quoteid','slotid','appointmentid','customerid','leadid','calendarid','offeringid'];
export const VOICE_TOOL_NAMES = Object.freeze(['matchService','getQuote','calculateListedPrice','calculateVoiceArea','checkAvailability','bookAppointment','captureLead','logQuoteRequest','prepareQuoteEmail','sendQuoteEmail','flagUrgent','transferCall','modifyAppointment','getCustomerContext']);
export const MUTATING_VOICE_TOOLS = Object.freeze(VOICE_TOOL_NAMES.filter(name => !['matchService','getCustomerContext','calculateListedPrice','calculateVoiceArea'].includes(name)));
export class VoiceToolValidationError extends Error {
  constructor(code) { super('The requested voice action was not valid.'); this.name='VoiceToolValidationError'; this.code=code; this.statusCode=400; }
}
const fail = code => { throw new VoiceToolValidationError(code); };
const normalizedKey = key => key.toLowerCase().replace(/[^a-z0-9]/g,'');
function forbiddenNormalizedKey(key) { return FORBIDDEN_KEYS.has(key)||FORBIDDEN_DERIVED_KEYS.has(key)||FORBIDDEN_ID_SUFFIXES.some(suffix=>key.endsWith(suffix))||key.endsWith('datetime'); }
function assertAllowedKey(key) { if(typeof key!=='string'||forbiddenNormalizedKey(normalizedKey(key)))fail('FORBIDDEN_TOOL_FIELD'); }
function assertPlainObject(value) {
  if(value===null||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).some(key=>typeof key!=='string'))fail('INVALID_TOOL_OBJECT');
  for(const key of Object.keys(value)){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||descriptor.get||descriptor.set)fail('INVALID_TOOL_OBJECT');}
}
function assertClosed(value,allowed,required=[]) {
  assertPlainObject(value);
  for(const key of Object.keys(value)){assertAllowedKey(key);if(!allowed.includes(key))fail('EXTRA_TOOL_FIELD');}
  for(const key of required)if(!Object.hasOwn(value,key))fail('MISSING_TOOL_FIELD');
}
function text(value,{min=1,max=500}={}) {if(typeof value!=='string')fail('INVALID_TOOL_STRING');const normalized=value.trim();if(normalized.length<min||normalized.length>max)fail('INVALID_TOOL_STRING');return normalized;}
function handle(value){if(typeof value!=='string'||!HANDLE.test(value))fail('INVALID_OPAQUE_HANDLE');return value;}
function oneOf(value,values){if(typeof value!=='string'||!values.includes(value))fail('INVALID_TOOL_ENUM');return value;}
function confirmed(value){if(value!==true)fail('CUSTOMER_CONFIRMATION_REQUIRED');return true;}
function textList(value,{maxItems=20,maxLength=300}={}){if(!Array.isArray(value)||value.length>maxItems)fail('INVALID_TOOL_ARRAY');return value.map(item=>text(item,{max:maxLength}));}
function safeDynamicValue(value,depth=0,budget={nodes:0}){
  if(++budget.nodes>250||depth>6)fail('TOOL_INPUT_TOO_LARGE');
  if(typeof value==='string')return text(value,{min:0,max:1000});
  if(typeof value==='boolean'||value===null)return value;
  if(typeof value==='number'){if(!Number.isFinite(value)||Math.abs(value)>1000000000)fail('INVALID_TOOL_NUMBER');return value;}
  if(Array.isArray(value)){if(value.length>50)fail('TOOL_INPUT_TOO_LARGE');return value.map(item=>safeDynamicValue(item,depth+1,budget));}
  assertPlainObject(value);if(Object.keys(value).length>50)fail('TOOL_INPUT_TOO_LARGE');const output={};
  for(const key of Object.keys(value)){
    assertAllowedKey(key);
    if(['address','serviceaddress','contact','location','phone','email','confirmedfacts'].includes(normalizedKey(key)))fail('FORBIDDEN_TOOL_FIELD');
    if(key.length===0||key.length>100)fail('INVALID_TOOL_FIELD');
    output[key]=safeDynamicValue(value[key],depth+1,budget);
  }
  return output;
}
function address(value){
  assertClosed(value,['line1','line2','city','region','postalCode','country'],['line1','city','region','postalCode']);
  const result={line1:text(value.line1,{max:200}),city:text(value.city,{max:100}),region:text(value.region,{max:100}),postalCode:text(value.postalCode,{max:30})};
  if(value.line2!==undefined)result.line2=text(value.line2,{max:200});if(value.country!==undefined)result.country=text(value.country,{max:2});return result;
}
function booleanMap(value,allowed){
  assertPlainObject(value);const result={};
  for(const [key,answer] of Object.entries(value)){assertAllowedKey(key);if(!/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(key)||allowed&&!allowed.includes(key))fail('EXTRA_TOOL_FIELD');if(typeof answer!=='boolean')fail('INVALID_TOOL_BOOLEAN');result[key]=answer;}
  if(Object.keys(result).length>32)fail('TOOL_INPUT_TOO_LARGE');return result;
}
function matchService(args){return {query:text(args.query,{max:500})};}
function calculateListedPrice(args){
  const quantity=text(args.quantity,{max:19});if(!/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/.test(quantity)||!/[1-9]/.test(quantity))fail('INVALID_TOOL_NUMBER');
  return {listedItem:text(args.listedItem,{max:2000}),quantity,customerConfirmed:confirmed(args.customerConfirmed)};
}
function calculateVoiceArea(args){
  const decimal=value=>{const number=text(value,{max:14});if(!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/.test(number))fail('INVALID_TOOL_NUMBER');return number;};
  return {length:decimal(args.length),width:decimal(args.width),customerConfirmed:confirmed(args.customerConfirmed)};
}
function getQuote(args){
  assertPlainObject(args.customerInputs);
  const result={serviceHandle:handle(args.serviceHandle),customerInputs:safeDynamicValue(args.customerInputs),customerConfirmed:confirmed(args.customerConfirmed)};
  if(args.callerMeasurementsEstimated!==undefined){if(typeof args.callerMeasurementsEstimated!=='boolean')fail('INVALID_TOOL_BOOLEAN');result.callerMeasurementsEstimated=args.callerMeasurementsEstimated;}
  if(args.productConfirmations!==undefined)result.productConfirmations=booleanMap(args.productConfirmations);
  if(args.scopeConfirmations!==undefined){
    assertPlainObject(args.scopeConfirmations);if(Object.keys(args.scopeConfirmations).length>32)fail('TOOL_INPUT_TOO_LARGE');
    result.scopeConfirmations={};for(const [key,value] of Object.entries(args.scopeConfirmations)){
      assertAllowedKey(key);if(!/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(key))fail('INVALID_TOOL_FIELD');
      result.scopeConfirmations[key]=handle(value);
    }
  }
  if(args.customerFeeSelections!==undefined)result.customerFeeSelections=booleanMap(args.customerFeeSelections,['travel','disposal','permit','overhead']);
  if(args.additionalWork!==undefined)result.additionalWork=textList(args.additionalWork);return result;
}
function checkAvailability(args){
  if(args.appointmentHandle===undefined&&args.leadHandle===undefined)fail('MISSING_TOOL_FIELD');
  if(args.appointmentHandle!==undefined&&(args.quoteHandle!==undefined||args.leadHandle!==undefined))fail('EXTRA_TOOL_FIELD');
  const result=args.appointmentHandle!==undefined?{appointmentHandle:handle(args.appointmentHandle)}:{...(args.quoteHandle!==undefined?{quoteHandle:handle(args.quoteHandle)}:{}),leadHandle:handle(args.leadHandle)};
  if(args.preference!==undefined){
    assertClosed(args.preference,['fromDate','days','timeOfDay']);const value=args.preference,preference={};
    if(value.fromDate!==undefined){
      if(typeof value.fromDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value.fromDate))fail('INVALID_TOOL_DATE');const instant=new Date(value.fromDate+'T00:00:00Z');
      if(!Number.isFinite(instant.getTime())||instant.toISOString().slice(0,10)!==value.fromDate)fail('INVALID_TOOL_DATE');preference.fromDate=value.fromDate;
    }
    if(value.days!==undefined){if(!Number.isInteger(value.days)||value.days<1||value.days>31)fail('INVALID_TOOL_NUMBER');preference.days=value.days;}
    if(value.timeOfDay!==undefined){if(!Array.isArray(value.timeOfDay)||value.timeOfDay.length<1||value.timeOfDay.length>3||new Set(value.timeOfDay).size!==value.timeOfDay.length)fail('INVALID_TOOL_ARRAY');preference.timeOfDay=value.timeOfDay.map(part=>oneOf(part,['morning','afternoon','evening']));}
    result.preference=preference;
  }
  return result;
}
function bookAppointment(args){return {slotHandle:handle(args.slotHandle),leadHandle:handle(args.leadHandle),customerConfirmed:confirmed(args.customerConfirmed)};}
function captureLead(args){
  const result={};if(args.name!==undefined)result.name=text(args.name,{max:120});
  if(args.phone!==undefined){const phone=text(args.phone,{max:16});if(!/^\+[1-9]\d{7,14}$/.test(phone))fail('INVALID_TOOL_PHONE');result.phone=phone;}
  if(args.email!==undefined){const email=text(args.email,{max:254}).toLowerCase();if(!EMAIL.test(email))fail('INVALID_TOOL_EMAIL');result.email=email;}
  if(args.address!==undefined)result.address=address(args.address);if(args.notes!==undefined)result.notes=text(args.notes,{max:1000});
  if(args.description!==undefined)result.description=text(args.description,{max:1000});
  if(args.leadHandle!==undefined)result.leadHandle=handle(args.leadHandle);
  if(args.inquiryNumber!==undefined){if(!Number.isSafeInteger(args.inquiryNumber)||args.inquiryNumber<1||args.inquiryNumber>100)fail('INVALID_TOOL_NUMBER');result.inquiryNumber=args.inquiryNumber;}
  if(args.callbackRequested!==undefined){if(typeof args.callbackRequested!=='boolean')fail('INVALID_TOOL_BOOLEAN');result.callbackRequested=args.callbackRequested;if(args.callbackRequested&&args.notes===undefined)fail('MISSING_TOOL_FIELD');}
  return result;
}
function logQuoteRequest(args){const result={description:text(args.description,{max:1000})};if(args.leadHandle!==undefined)result.leadHandle=handle(args.leadHandle);return result;}
function prepareQuoteEmail(args){const email=text(args.email,{max:254}).toLowerCase();if(!EMAIL.test(email)||/[<>\r\n]/.test(email))fail('INVALID_TOOL_EMAIL');return {quoteHandle:handle(args.quoteHandle),email};}
function sendQuoteEmail(args){return {emailConfirmationHandle:handle(args.emailConfirmationHandle),customerConfirmed:confirmed(args.customerConfirmed)};}
function flagUrgent(args){const result={reason:oneOf(args.reason,['active_leak','flooding','safety','complaint'])};if(args.summary!==undefined)result.summary=text(args.summary,{max:500});if(args.leadHandle!==undefined)result.leadHandle=handle(args.leadHandle);return result;}
function transferCall(args){const result={reason:oneOf(args.reason,['caller_requested','urgent','escalation']),customerConfirmed:confirmed(args.customerConfirmed)};if(args.notes!==undefined)result.notes=text(args.notes,{max:1000});if(args.leadHandle!==undefined)result.leadHandle=handle(args.leadHandle);if(args.inquiryNumber!==undefined){if(!Number.isSafeInteger(args.inquiryNumber)||args.inquiryNumber<1||args.inquiryNumber>100)fail('INVALID_TOOL_NUMBER');result.inquiryNumber=args.inquiryNumber;}return result;}
function modifyAppointment(args){
  const action=oneOf(args.action,['reschedule','cancel']);if(action==='reschedule'&&args.slotHandle===undefined)fail('MISSING_TOOL_FIELD');if(action==='cancel'&&args.slotHandle!==undefined)fail('EXTRA_TOOL_FIELD');
  const result={appointmentHandle:handle(args.appointmentHandle),action,customerConfirmed:confirmed(args.customerConfirmed)};if(args.slotHandle!==undefined)result.slotHandle=handle(args.slotHandle);return result;
}
function getCustomerContext(args){if(args.callerConfirmedIdentity!==undefined&&typeof args.callerConfirmedIdentity!=='boolean')fail('INVALID_TOOL_BOOLEAN');return {callerConfirmedIdentity:args.callerConfirmedIdentity===true};}
const VALIDATORS=Object.freeze({matchService,getQuote,calculateListedPrice,calculateVoiceArea,checkAvailability,bookAppointment,captureLead,logQuoteRequest,prepareQuoteEmail,sendQuoteEmail,flagUrgent,transferCall,modifyAppointment,getCustomerContext});
function deepFreeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const item of Object.values(value))deepFreeze(item);}return value;}
export function validateVoiceToolCall(name,args){
  if(typeof name!=='string'||!Object.hasOwn(VALIDATORS,name))fail('UNKNOWN_VOICE_TOOL');
  const contract=VOICE_TOOL_DECLARATIONS.find(tool=>tool.name===name).parameters;
  assertClosed(args,Object.keys(contract.properties),contract.required);return deepFreeze(VALIDATORS[name](args));
}
export function isForbiddenVoiceField(key){return typeof key!=='string'||forbiddenNormalizedKey(normalizedKey(key));}

// The same closed shapes drive validation and provider-facing declarations.
// Dynamic measurements are validated against the saved service by the engine.
const string=description=>({type:'STRING',description});
const boolean=description=>({type:'BOOLEAN',description});
const object=(properties,required=[])=>({type:'OBJECT',properties,required,additionalProperties:false});
const enumeration=values=>({type:'STRING',enum:values});
const strings=description=>({type:'ARRAY',items:{type:'STRING'},description});
const opaque=string('Opaque server-issued handle from this call. Never invent or speak it.');
const confirmation=boolean('True only after the caller affirmatively confirms the recap, or the exact displayed appointment and address.');
const declarations={
  matchService:object({query:string("The caller's requested main service, in ordinary words.")},['query']),
  calculateListedPrice:object({listedItem:string('Copy exactly one complete saved item paragraph from knowledge.prices, including its conditions. Never supply or edit a rate.'),quantity:string('The caller-confirmed quantity in the listing unit, as plain decimal text. Never convert units or infer a quantity.'),customerConfirmed:confirmation},['listedItem','quantity','customerConfirmed']),
  calculateVoiceArea:object({length:string('Caller-confirmed length in feet as plain positive decimal text.'),width:string('Caller-confirmed width in feet as plain positive decimal text.'),customerConfirmed:confirmation},['length','width','customerConfirmed']),
  getQuote:object({serviceHandle:opaque,customerInputs:{type:'OBJECT',description:'Only current question field names and caller-stated measurements or ordinary product names returned by matchService. No address, contact, identifiers, money or confirmedFacts.'},customerConfirmed:confirmation,callerMeasurementsEstimated:boolean("True if any supplied measurement is the caller's own approximate number, after digits-then-words read-back and their Yes."),productConfirmations:{type:'OBJECT',description:'Product question fields mapped to true only when the caller has identified and confirmed that exact named product. False or missing means unknown; never assume identification.'},scopeConfirmations:{type:'OBJECT',description:'Scope question field mapped to its current server-issued confirmationToken only after reading that question label and every detail and receiving affirmative confirmation. Never reuse after changing scope.'},customerFeeSelections:object(Object.fromEntries(['travel','disposal','permit','overhead'].map(fee=>[fee,boolean("The caller's Yes/No to this currently offered fee; no amount.")]))),additionalWork:strings('Separate requested work needing its own on-site estimate, not part of the selected-service price.')},['serviceHandle','customerInputs','customerConfirmed']),
  checkAvailability:object({quoteHandle:opaque,leadHandle:opaque,appointmentHandle:opaque,preference:object({fromDate:string('Local date YYYY-MM-DD, never an invented slot or raw datetime.'),days:{type:'INTEGER',minimum:1,maximum:31},timeOfDay:{type:'ARRAY',items:enumeration(['morning','afternoon','evening'])}})}),
  bookAppointment:object({slotHandle:opaque,leadHandle:opaque,customerConfirmed:confirmation},['slotHandle','leadHandle','customerConfirmed']),
  captureLead:object({name:string('Optional caller name.'),phone:string('Caller-provided callback contact in E.164 with country code. This does not verify identity or authorize access to history.'),email:string('Optional caller email.'),address:object({line1:string('Street address'),line2:string('Optional address line 2'),city:string('City'),region:string('Province or state'),postalCode:string('Postal or ZIP code'),country:string('Two-letter country')},['line1','city','region','postalCode']),notes:string('Caller request and non-pricing callback notes. Preserve the caller words.'),callbackRequested:boolean('True when the caller requests a callback; requires their notes. Reuse inquiryNumber for corrections and retries.'),description:string('Optional caller-described work; never invent scope.'),leadHandle:opaque,inquiryNumber:{type:'INTEGER',minimum:1,maximum:100,description:'Default 1. Reuse the number or leadHandle for corrections. Use a different number only for a genuinely separate job on this call.'}}),
  logQuoteRequest:object({description:string("The customer's request needing follow-up."),leadHandle:opaque},['description']),
  prepareQuoteEmail:object({quoteHandle:opaque,email:string('Only after the caller asks for a written quote: their stated email address. Returns a read-back; never send before confirmation.')},['quoteHandle','email']),
  sendQuoteEmail:object({emailConfirmationHandle:opaque,customerConfirmed:confirmation},['emailConfirmationHandle','customerConfirmed']),
  flagUrgent:object({reason:enumeration(['active_leak','flooding','safety','complaint']),summary:string('Optional caller-reported urgency, not an invented diagnosis.'),leadHandle:opaque},['reason']),
  transferCall:object({reason:enumeration(['caller_requested','urgent','escalation']),customerConfirmed:confirmation,notes:string('The caller exact request words. Preserved in a callback if transfer fails.'),leadHandle:opaque,inquiryNumber:{type:'INTEGER',minimum:1,maximum:100,description:'Default 1. Reuse for retries; a different number marks a genuinely separate callback request.'}},['reason','customerConfirmed']),
  modifyAppointment:object({appointmentHandle:opaque,action:enumeration(['reschedule','cancel']),slotHandle:opaque,customerConfirmed:confirmation},['appointmentHandle','action','customerConfirmed']),
  getCustomerContext:object({callerConfirmedIdentity:boolean('False for the first lookup. True only after asking the returned identity question and hearing this caller affirm that identity; the server checks the call transcript before releasing any history.')})
};
export const VOICE_TOOL_DECLARATIONS=deepFreeze(VOICE_TOOL_NAMES.map(name=>({name,description:name==='bookAppointment'?'After explicit caller confirmation, the server obtains one hold and then confirms that held appointment. Do not supply hold IDs, finalize flags, addresses or times.':"Perform "+name+" using this call's server-authoritative records. Never invent prices, identities or outcomes.",parameters:declarations[name]})));
export const getVoiceToolDeclarations=()=>VOICE_TOOL_DECLARATIONS;
