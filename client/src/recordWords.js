// Plain words for the stored call, quote, lead, follow-up, staff and webhook
// values shown on owner pages. Each known stored value maps to words; an
// unknown value shows a plain fallback, never the stored code.
// Sources: server/src/voice/voicePersistence.js, voiceProviderAdapters.js,
// geminiMediaBridge.js and server/src/callSummaryService.js (calls);
// server/src/ownerWorkflowService.js, quoteDoneRoutes.js, quoteLog.js (quotes);
// server/src/leadCaptureRepair20261006.js, voice/voiceToolRuntime.js,
// voice/voiceRecovery.js, widgetBookingLead.js, migrations.js (leads);
// server/src/staffService.js; server/src/outboundWebhookService.js;
// server/src/onboardingService.js (calendar connection).
import {CALL_FAILURE_REASONS} from './callFailureReasons.js';

const lookup=(map,fallback)=>value=>typeof value==='string'&&Object.hasOwn(map,value)?map[value]:fallback;

export const CALL_STATUS_WORDS=Object.freeze({
  CONNECTING:'Connecting',
  CONNECTED:'In progress',
  TRANSFERRING:'Transferring to you',
  HUMAN_ROUTING:'Rang through to you',
  COMPLETED:'Completed',
  FALLBACK:'Taken as a message on the backup line',
  RECOVERED:'Stopped when the service restarted',
  FAILED:'Ended early'
});
export const callStatusWords=lookup(CALL_STATUS_WORDS,'Status unknown');

const CALL_OUTCOME_WORDS=Object.freeze({
  INFO:'Answered by the receptionist',
  LEAD:'Lead saved',
  QUOTED:'Quote given',
  QUOTE_REQUEST:'Quote requested',
  BOOKED:'Booked',
  TRANSFERRED:'Transferred to you',
  TRANSFER_CONNECTED:'Transferred to you',
  SPAM:'Marked as spam',
  SPAM_FILTERED:'Marked as spam',
  OPERATOR_OFF:'Rang through to you (answering was off)',
  AI_FALLBACK:'Taken as a message on the backup line',
  ...CALL_STATUS_WORDS
});
// Normal ways a call ends. Failure codes use the shared failure sentences.
const CALL_ENDING_WORDS=Object.freeze({
  RECEPTIONIST_ENDED_CALL:'The receptionist ended the call.',
  CALLER_SILENT:'The caller stayed silent.',
  TWILIO_STOP:'The phone call ended.',
  VOICE_TRANSPORT_CLOSED:'The phone connection closed.',
  FALLBACK_REQUEST_CAPTURED:'The caller left a request on the backup line.'
});
const endingWords=code=>typeof code!=='string'?null:Object.hasOwn(CALL_ENDING_WORDS,code)?CALL_ENDING_WORDS[code]:Object.hasOwn(CALL_FAILURE_REASONS,code)?CALL_FAILURE_REASONS[code]:null;
export const callOutcomeWords=value=>typeof value==='string'&&Object.hasOwn(CALL_OUTCOME_WORDS,value)?CALL_OUTCOME_WORDS[value]:endingWords(value)||'Outcome unknown';
export const transportOutcomeWords=value=>endingWords(value)||'Outcome unknown';
// The call's chip: its outcome, else its status.
export const callResultWords=call=>call?.outcome?callOutcomeWords(call.outcome):call?.status?callStatusWords(call.status):'Not recorded';

export const URGENCY_WORDS=Object.freeze({active_leak:'Active leak',flooding:'Flooding',safety:'Safety issue',complaint:'Complaint'});
export const urgencyWords=lookup(URGENCY_WORDS,'Urgent');

export const TRANSCRIPT_ROLE_WORDS=Object.freeze({user:'Caller',caller:'Caller',model:'Receptionist',assistant:'Receptionist'});
export const transcriptRoleWords=lookup(TRANSCRIPT_ROLE_WORDS,'Speaker');

export const QUOTE_STATUS_WORDS=Object.freeze({
  INSTANT:'Priced instantly',
  PARTIAL:'Partly priced; the rest needs your review',
  INSTANT_ESTIMATE_READY:'Priced instantly',
  PARTIAL_ESTIMATE_READY:'Partly priced; the rest needs your review',
  ESTIMATE_REQUIRES_REVIEW:'Needs review',
  SENT:'Sent',
  VIEWED:'Viewed',
  ACCEPTED:'Accepted',
  INVOICED:'Invoiced',
  DISMISSED:'Dismissed',
  SUPERSEDED:'Replaced by a reviewed quote'
});
export const quoteStatusWords=lookup(QUOTE_STATUS_WORDS,'Status unknown');

export const LEAD_STATUS_WORDS=Object.freeze({
  NEW:'New',
  CAPTURED:'Saved from a call',
  'NEEDS REVIEW':'Needs review',
  DISMISSED:'Dismissed',
  REVIEWED:'Reviewed'
});
export const leadStatusWords=lookup(LEAD_STATUS_WORDS,'Status unknown');

export const LEAD_TYPE_WORDS=Object.freeze({
  voice_lead:'Phone call',
  AI_FALLBACK:'Backup line message',
  quote_review:'Quote review',
  additional_work:'Additional work',
  widget_quote:'Website quote',
  CALLBACK:'Callback request',
  COMPLAINT:'Complaint'
});
export const leadTypeWords=lookup(LEAD_TYPE_WORDS,'Type unknown');

// A record's stage in owner action history: quote or lead statuses.
export const recordStageWords=value=>value===null||value===undefined||value===''?'Not recorded'
  :Object.hasOwn(QUOTE_STATUS_WORDS,value)?QUOTE_STATUS_WORDS[value]:Object.hasOwn(LEAD_STATUS_WORDS,value)?LEAD_STATUS_WORDS[value]:'Status unknown';

export const FOLLOW_UP_STATUS_WORDS=Object.freeze({OPEN:'Open',COMPLETED:'Completed',DISMISSED:'Dismissed'});
export const followUpStatusWords=lookup(FOLLOW_UP_STATUS_WORDS,'Status unknown');

export const STAFF_STATUS_WORDS=Object.freeze({active:'Active',pending:'Invitation sent',suspended:'Suspended'});
export const staffStatusWords=lookup(STAFF_STATUS_WORDS,'Status unknown');

export const WEBHOOK_EVENT_WORDS=Object.freeze({'lead.created':'New lead','quote.requested':'New quote request','appointment.booked':'Confirmed booking'});
export const webhookEventWords=lookup(WEBHOOK_EVENT_WORDS,'Other event');
export const WEBHOOK_STATUS_WORDS=Object.freeze({PENDING:'Waiting to send',DELIVERING:'Sending',DELIVERED:'Delivered',FAILED:'Not delivered',CANCELED:'Cancelled'});
export const webhookStatusWords=lookup(WEBHOOK_STATUS_WORDS,'Status unknown');
export const WEBHOOK_ERROR_WORDS=Object.freeze({
  ACCOUNT_ACCESS_PAUSED:'Waiting for account access',
  WEBHOOK_DESTINATION_BLOCKED:'Your webhook address is not allowed.',
  WEBHOOK_DNS_FAILED:'Your webhook address could not be found.',
  WEBHOOK_DNS_TIMEOUT:'Looking up your webhook address took too long.',
  WEBHOOK_TIMEOUT:'Your system did not answer in time.',
  WEBHOOK_HTTP_FAILED:'Your system did not accept the delivery.',
  WEBHOOK_DELIVERY_FAILED:'The delivery could not be completed.'
});
export const webhookErrorWords=lookup(WEBHOOK_ERROR_WORDS,'The delivery did not go through.');

export const CALENDAR_CONNECTION_WORDS=Object.freeze({connected:'Connected',not_connected:'Not connected',skipped:'Skipped',pending_oauth:'Waiting for Google sign-in'});
export const calendarConnectionWords=lookup(CALENDAR_CONNECTION_WORDS,'Status unknown');

// "FENCING_INSTALL" -> "Fencing install"; a service name that is not a code passes through.
const CODE=/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$|^[A-Z]{3,}$/;
export function serviceWords(value){
  if(typeof value!=='string'||!value.trim())return null;
  const text=value.trim();
  if(!CODE.test(text))return text;
  const words=text.toLowerCase().split('_').filter(Boolean).join(' ');
  return words.charAt(0).toUpperCase()+words.slice(1);
}
