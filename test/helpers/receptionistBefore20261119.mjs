// Maps compiled receptionist instructions back to the text before the
// 2026-11-19 change (emergency goodbye and endCall, transfer sentence on its own
// line) and before the 2026-11-25 stay-on-topic rule, so earlier byte-for-byte guards keep their pinned hashes and still
// prove nothing else changed. Throws when an expected edit is not found.
import {readFileSync} from 'node:fs';
import {EMERGENCY_RULE,END_CALL_RULE,STAY_ON_TOPIC_RULE,HOLD_RULE,STEADY_VOICE_RULE} from '../../server/src/voice/voicePromptCompiler.js';
// 2026-11-25: plans without phone quoting no longer get the measuring steps (units line,
// question-order step 4, unsure-measurement block). Put them back, taken from the guide,
// so the pinned Starter and Operator hashes still prove nothing else changed.
const GUIDE=readFileSync(new URL('../../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const pick=re=>{const m=GUIDE.match(re);if(!m)throw Error('Guide text not found: '+re);return m[0];};
const UNITS_LINE=pick(/^- Talk in the caller's units\..*\n/m);
const STEP_FOUR=pick(/^  4\. Measurements LAST[^\n]*\n[^\n]*go measure it\.\n/m);
const UNSURE_BLOCK=pick(/^UNSURE HANDLING \(every size\/measurement field\):[\s\S]*?(?=^A measurement may be the caller's own approximation;)/m);
const NO_QUOTING_LINE="Never say 'error', 'not configured' or 'system'.\n\n";
function beforeMeasuringChange(text){
  if(text.includes('UNSURE HANDLING (every size/measurement field):')||!text.includes('\n'+NO_QUOTING_LINE))return text;
  const once=(value,from,to)=>{if(value.split(from).length!==2)throw Error('Expected instruction text not found once: '+from.slice(0,60));return value.replace(from,()=>to);};
  text=once(text,'\n'+NO_QUOTING_LINE,'\n'+UNSURE_BLOCK);
  text=once(text,'  3. Yes/no scope questions (removal? gates? ceilings?).\n','  3. Yes/no scope questions (removal? gates? ceilings?).\n'+STEP_FOUR);
  return once(text,'- If the caller volunteers answers early',UNITS_LINE+'- If the caller volunteers answers early');
}
export const EMERGENCY_RULE_BEFORE_20261119="EMERGENCY (before anything else): if the caller describes immediate danger to people, such as a fire, a gas smell, someone hurt, or water near electrical, first tell them to hang up and call 911 or their local emergency number right now. Say this before any other question, quoting, booking or other step. Then call flagUrgent with reason safety.";
export const END_CALL_RULE_BEFORE_20261119="ENDING THE CALL: you can end the call with endCall. Call it only after the caller's request is handled or the caller says goodbye, and only after you have said goodbye. Never call endCall while a quote, booking or email confirmation is in progress, such as while waiting for the caller's answer to a recap, an offered appointment, or an email read-back. Say nothing after calling endCall; the call ends once your goodbye finishes playing. Messages in square brackets that start with \"Call event\" come from the phone system, not the caller: when one says the caller has been silent, do exactly what it asks.";
const TRANSFER_LINE='\nSupply the caller words in transferCall.notes.';
const BOOKED=' pending_confirmation is not a booking confirmation.\nNever invent';
export function beforeEmergencyChange(text){
  const once=(value,from,to)=>{if(value.split(from).length!==2)throw Error('Expected instruction text not found once: '+from.slice(0,60));return value.replace(from,()=>to);};
  // 2026-11-25: the HOLD rule (holdCall) sits after STAY ON TOPIC in every plan.
  // 2026-11-26: the VOICE (steady voice) rule sits between them.
  text=beforeMeasuringChange(once(once(once(text,'\n\n'+HOLD_RULE,''),'\n\n'+STEADY_VOICE_RULE,''),'\n\n'+STAY_ON_TOPIC_RULE,''));
  text=once(once(text,EMERGENCY_RULE,EMERGENCY_RULE_BEFORE_20261119),END_CALL_RULE,END_CALL_RULE_BEFORE_20261119);
  if(!text.includes(TRANSFER_LINE))return text;
  return once(once(text,TRANSFER_LINE,''),BOOKED,' pending_confirmation is not a booking confirmation. Supply the caller words in transferCall.notes.\nNever invent');
}
