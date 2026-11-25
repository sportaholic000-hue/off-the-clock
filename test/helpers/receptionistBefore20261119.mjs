// Maps compiled receptionist instructions back to the text before the
// 2026-11-19 change (emergency goodbye and endCall, transfer sentence on its own
// line) and before the 2026-11-25 stay-on-topic rule, so earlier byte-for-byte guards keep their pinned hashes and still
// prove nothing else changed. Throws when an expected edit is not found.
import {EMERGENCY_RULE,END_CALL_RULE,STAY_ON_TOPIC_RULE} from '../../server/src/voice/voicePromptCompiler.js';
export const EMERGENCY_RULE_BEFORE_20261119="EMERGENCY (before anything else): if the caller describes immediate danger to people, such as a fire, a gas smell, someone hurt, or water near electrical, first tell them to hang up and call 911 or their local emergency number right now. Say this before any other question, quoting, booking or other step. Then call flagUrgent with reason safety.";
export const END_CALL_RULE_BEFORE_20261119="ENDING THE CALL: you can end the call with endCall. Call it only after the caller's request is handled or the caller says goodbye, and only after you have said goodbye. Never call endCall while a quote, booking or email confirmation is in progress, such as while waiting for the caller's answer to a recap, an offered appointment, or an email read-back. Say nothing after calling endCall; the call ends once your goodbye finishes playing. Messages in square brackets that start with \"Call event\" come from the phone system, not the caller: when one says the caller has been silent, do exactly what it asks.";
const TRANSFER_LINE='\nSupply the caller words in transferCall.notes.';
const BOOKED=' pending_confirmation is not a booking confirmation.\nNever invent';
export function beforeEmergencyChange(text){
  const once=(value,from,to)=>{if(value.split(from).length!==2)throw Error('Expected instruction text not found once: '+from.slice(0,60));return value.replace(from,()=>to);};
  text=once(text,'\n\n'+STAY_ON_TOPIC_RULE,'');
  text=once(once(text,EMERGENCY_RULE,EMERGENCY_RULE_BEFORE_20261119),END_CALL_RULE,END_CALL_RULE_BEFORE_20261119);
  if(!text.includes(TRANSFER_LINE))return text;
  return once(once(text,TRANSFER_LINE,''),BOOKED,' pending_confirmation is not a booking confirmation. Supply the caller words in transferCall.notes.\nNever invent');
}
