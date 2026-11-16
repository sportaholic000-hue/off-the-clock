import {withheldCallerId} from '../customerIdentityService.js';
// Twilio's signed From is a contact identifier, never a tenant selector.
// Withheld identities must remain distinct by CallSid in customer storage.
export const isPhoneNumber=value=>typeof value==='string'&&/^\+[1-9]\d{7,14}$/.test(value);
export const isVoiceCaller=value=>isPhoneNumber(value)||typeof value==='string'&&/^(anonymous|unknown|restricted|unavailable|private|blocked)$/i.test(value);
// Withheld caller IDs Twilio sends as digits (customerIdentityService.js) are no one's number either.
export const callerIdentity=context=>isPhoneNumber(context.from)&&!withheldCallerId(context.from)?context.from:context.callSid;
