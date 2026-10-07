// Twilio's signed From is a contact identifier, never a tenant selector.
// Withheld identities must remain distinct by CallSid in customer storage.
export const isPhoneNumber=value=>typeof value==='string'&&/^\+[1-9]\d{7,14}$/.test(value);
export const isVoiceCaller=value=>isPhoneNumber(value)||typeof value==='string'&&/^(anonymous|unknown|restricted|unavailable|private|blocked)$/i.test(value);
export const callerIdentity=context=>isPhoneNumber(context.from)?context.from:context.callSid;
