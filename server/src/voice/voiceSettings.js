import {usageOwnerQuery} from '../billingUsagePolicy.js';
import {identityLabel} from './receptionistSettings.js';
import {isValidIanaTimeZone} from '../calendarTime.js';
export const VOICE_NAMES=Object.freeze({male:'Charon',female:'Kore'});
export const TWILIO_BACKUP_VOICES=Object.freeze(Object.fromEntries(Object.entries(VOICE_NAMES).map(([id,name])=>[id,`Google.en-US-Chirp3-HD-${name}`])));
export const AGENT_NAME_REQUIRED_MESSAGE='Enter a name for your receptionist.';
export const TRANSFER_DAYS=Object.freeze(['sun','mon','tue','wed','thu','fri','sat']);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const invalid=message=>Object.assign(new Error(message),{statusCode:400,code:'INVALID_VOICE_SETTINGS'});
export function validateVoiceSettings(input){
 if(!plain(input)||Object.keys(input).some(key=>!['voiceId','agentName','greeting','transferNumber','transferWindows','transcriptionNotice'].includes(key)))throw invalid('Voice settings contain unsupported fields.');
 const {voiceId,agentName,greeting}=input;
 // The agent name is required. A blank (or spaces only) name is refused;
 // a non-blank name keeps every existing check.
 if(agentName===undefined||agentName===null||typeof agentName==='string'&&!agentName.trim())throw invalid(AGENT_NAME_REQUIRED_MESSAGE);
 identityLabel(agentName,'Agent name');
 const out={voiceId,agentName:agentName.trim(),greeting:validateVoiceAndGreeting({voiceId,greeting}).greeting};
 if(input.transferNumber!==undefined){if(typeof input.transferNumber!=='string'||input.transferNumber!==''&&!/^\+[1-9]\d{7,14}$/.test(input.transferNumber))throw invalid('Transfer number must include the country code.');out.transferNumber=input.transferNumber;}
 if(input.transferWindows!==undefined)out.transferWindows=normalizeTransferWindows(input.transferWindows);
 if(input.transcriptionNotice!==undefined){if(typeof input.transcriptionNotice!=='boolean')throw invalid('Choose whether callers are told the call is transcribed.');out.transcriptionNotice=input.transcriptionNotice;}
 return out;
}
// The voice and greeting checks on their own, for a greeting preview where no name is involved.
export function validateVoiceAndGreeting({voiceId,greeting}={}){
 if(typeof voiceId!=='string'||!Object.hasOwn(VOICE_NAMES,voiceId)||typeof greeting!=='string'||!greeting.trim()||greeting.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(greeting))throw invalid('Choose a voice and enter a greeting. Agent names must be valid text up to 500 characters; greetings up to 1000 characters.');
 return {voiceId,greeting:greeting.trim()};
}
export function normalizeTransferWindows(value){
 if(!plain(value)||Object.keys(value).some(key=>!TRANSFER_DAYS.includes(key)))throw invalid('Choose valid transfer availability windows.');
 const minute=time=>{if(typeof time!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw invalid('Transfer times must use HH:mm.');return Number(time.slice(0,2))*60+Number(time.slice(3));};
 return Object.fromEntries(TRANSFER_DAYS.map(day=>{const windows=value[day]??[];if(!Array.isArray(windows)||windows.length>24)throw invalid('Choose valid transfer availability windows.');let end=-1;
 const normalized=windows.map(window=>{if(!plain(window)||Object.keys(window).some(key=>!['start','end'].includes(key)))throw invalid('Choose valid transfer availability windows.');const start=minute(window.start),finish=minute(window.end);if(start>=finish||start<end)throw invalid('Transfer windows must be ordered, non-overlapping, and end after they start.');end=finish;return {start:window.start,end:window.end};});return [day,normalized];}));
}
export const TRANSFER_NUMBER_IS_BUSINESS_LINE_MESSAGE='Enter a different number for transfers. Your business line forwards to your receptionist, so a transfer to it would ring the receptionist again.';
export const TRANSFER_NUMBER_IS_RECEPTIONIST_MESSAGE='Enter a different number for transfers. This is your receptionist\'s number, so a transfer to it would ring the receptionist again.';
// Compare by digits so formatting never hides the same line. A 10-digit North
// American number and its +1 form are the same line.
const lineDigits=value=>{const digits=String(value??'').replace(/\D/g,'');return digits.length===10?'1'+digits:digits;};
const sameLine=(a,b)=>{const left=lineDigits(a);return left.length>0&&left===lineDigits(b);};
// Which forbidden line a transfer number matches: 'business', 'receptionist' or null.
export function transferNumberConflict(number,profile){
 if(sameLine(number,profile?.twilioNumber))return 'receptionist';
 if(sameLine(number,profile?.existingPhoneNumber))return 'business';
 return null;
}
export function transferDecision(database,ownerId,now){
 const profile=usageOwnerQuery(database)('SELECT existingPhoneNumber,twilioNumber,knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(ownerId);
 const owner=usageOwnerQuery(database)("SELECT timezone FROM users WHERE id=? AND role='owner' AND ownerId IS NULL").get(ownerId);
 let kb,windows;try{kb=JSON.parse(profile?.knowledgeBaseJson||'{}');windows=normalizeTransferWindows(kb.transferWindows);}catch{return {allowed:false,reason:'TRANSFER_HOURS_UNCONFIGURED'};}
 if(!isValidIanaTimeZone(owner?.timezone))return {allowed:false,reason:'TRANSFER_TIMEZONE_INVALID'};
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:owner.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const get=type=>parts.find(part=>part.type===type)?.value;const day=get('weekday').toLowerCase(),time=get('hour')+':'+get('minute');
 // Only the owner's saved transfer number is ever dialed. The business line
 // forwards to the receptionist and the receptionist number is the receptionist,
 // so a transfer to either would ring the receptionist again; the caller's
 // request is saved as a callback instead.
 const destination=typeof kb.transferNumber==='string'?kb.transferNumber:'';
 if(!/^\+[1-9]\d{7,14}$/.test(destination)||transferNumberConflict(destination,profile))return {allowed:false,reason:'TRANSFER_DESTINATION_UNAVAILABLE'};
 return {allowed:windows[day].some(window=>time>=window.start&&time<window.end),reason:'TRANSFER_OUTSIDE_HOURS',destination};
}
