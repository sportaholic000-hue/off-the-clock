// Owner ruling, 2026-10-07. This is deliberately not an environment toggle.
// The real application never sends caller texts, confirmations or reminders.
export const CALLER_COMMUNICATION_RULE='OWNER RULING: Do not offer, promise, request or send texts, emails, calendar invitations, post-call confirmations or reminders to callers. No caller messaging tool is available. You may verbally report a booking only when its tool confirms it. Save requests for owner follow-up.';
export const ownerOnlyVoiceTools=declarations=>declarations.filter(tool=>tool.name!=='sendSms');
export const disabledCallerMessageProvider=()=>({ready:()=>false,unavailableCode:'CALLER_MESSAGES_DISABLED',send:async()=>{throw Object.assign(Error('Caller messages are disabled by owner policy.'),{code:'CALLER_MESSAGES_DISABLED',definitive:true});}});
