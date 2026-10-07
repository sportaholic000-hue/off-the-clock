import {isValidIanaTimeZone} from '../calendarTime.js';
export const VOICE_NAMES=Object.freeze({male:'Charon',female:'Kore'});
export const TRANSFER_DAYS=Object.freeze(['sun','mon','tue','wed','thu','fri','sat']);
const plain=value=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const invalid=message=>Object.assign(new Error(message),{statusCode:400,code:'INVALID_VOICE_SETTINGS'});
export function validateVoiceSettings(input){
 if(!plain(input)||Object.keys(input).some(key=>!['voiceId','agentName','greeting','transferNumber','transferWindows'].includes(key)))throw invalid('Voice settings contain unsupported fields.');
 const {voiceId,agentName,greeting}=input;
 if(typeof voiceId!=='string'||!Object.hasOwn(VOICE_NAMES,voiceId)||typeof agentName!=='string'||!agentName.trim()||agentName.length>500||/[\u0000-\u001f\u007f]/.test(agentName)||/[$€£]|\b(?:CAD|USD)\s*\d|\d[\d.,]*\s*(?:dollars?|cents?|\/\s*(?:hour|hr|sq|foot|ft))|\b(?:rate|cost|markup|margin)\b[^\n]{0,30}\d/i.test(agentName)||typeof greeting!=='string'||!greeting.trim()||greeting.length>1000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(greeting))throw invalid('Choose a voice, enter an agent name, and enter a greeting. Agent names must be valid text up to 500 characters; greetings up to 1000 characters.');
 const out={voiceId,agentName:agentName.trim(),greeting:greeting.trim()};
 if(input.transferNumber!==undefined){if(typeof input.transferNumber!=='string'||input.transferNumber!==''&&!/^\+[1-9]\d{7,14}$/.test(input.transferNumber))throw invalid('Transfer number must include the country code.');out.transferNumber=input.transferNumber;}
 if(input.transferWindows!==undefined)out.transferWindows=normalizeTransferWindows(input.transferWindows);
 return out;
}
export function normalizeTransferWindows(value){
 if(!plain(value)||Object.keys(value).some(key=>!TRANSFER_DAYS.includes(key)))throw invalid('Choose valid transfer availability windows.');
 const minute=time=>{if(typeof time!=='string'||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw invalid('Transfer times must use HH:mm.');return Number(time.slice(0,2))*60+Number(time.slice(3));};
 return Object.fromEntries(TRANSFER_DAYS.map(day=>{const windows=value[day]??[];if(!Array.isArray(windows)||windows.length>24)throw invalid('Choose valid transfer availability windows.');let end=-1;
 const normalized=windows.map(window=>{if(!plain(window)||Object.keys(window).some(key=>!['start','end'].includes(key)))throw invalid('Choose valid transfer availability windows.');const start=minute(window.start),finish=minute(window.end);if(start>=finish||start<end)throw invalid('Transfer windows must be ordered, non-overlapping, and end after they start.');end=finish;return {start:window.start,end:window.end};});return [day,normalized];}));
}
export function transferDecision(database,ownerId,now){
 const profile=database.prepare('SELECT existingPhoneNumber,knowledgeBaseJson FROM businessProfiles WHERE ownerId=?').get(ownerId);
 const owner=database.prepare("SELECT timezone FROM users WHERE id=? AND role='owner'").get(ownerId);
 let kb,windows;try{kb=JSON.parse(profile?.knowledgeBaseJson||'{}');windows=normalizeTransferWindows(kb.transferWindows);}catch{return {allowed:false,reason:'TRANSFER_HOURS_UNCONFIGURED'};}
 if(!isValidIanaTimeZone(owner?.timezone))return {allowed:false,reason:'TRANSFER_TIMEZONE_INVALID'};
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:owner.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const get=type=>parts.find(part=>part.type===type)?.value;const day=get('weekday').toLowerCase(),time=get('hour')+':'+get('minute');
 const destination=kb.transferNumber??profile.existingPhoneNumber;
 if(!/^\+[1-9]\d{7,14}$/.test(destination||''))return {allowed:false,reason:'TRANSFER_DESTINATION_UNAVAILABLE'};
 return {allowed:windows[day].some(window=>time>=window.start&&time<window.end),reason:'TRANSFER_OUTSIDE_HOURS',destination};
}
