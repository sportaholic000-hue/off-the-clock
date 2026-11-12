// Plain words for the stored delivery statuses and error codes shown on the
// owner's delivery and alert lists. Stored values never reach the owner.
// Sources: server/src/ownerAlertService.js and ownerAlertEmail.js (owner alerts),
// server/src/quoteEmailService.js (quote emails), and the outbox statuses of
// live transfers and booking changes (server/src/voice/voiceToolRuntime.js,
// voiceProviderAdapters.js, server/src/bookingService.js).
export const STATUS_WORDS=Object.freeze({
  ACCEPTED:'Sent',
  DELIVERED:'Delivered',
  BOUNCED:'Email bounced',
  FAILED:'Not sent',
  UNKNOWN:'Not confirmed',
  PENDING:'Sending',
  SENDING:'Sending',
  DELIVERING:'Sending',
  BLOCKED:'Not sent',
  REVIEW:'Not confirmed',
  CONNECTED:'Connected',
  CONFIRMED:'Confirmed'
});
export const STATUS_UNAVAILABLE='Status unavailable';

export const ERROR_SENTENCES=Object.freeze({
  EMAIL_PROVIDER_REJECTED:'The email service refused this message.',
  EMAIL_REJECTED:'The email service refused this message.',
  EMAIL_NOT_CONFIGURED:'Email sending is not available right now, so this message was not sent.',
  OWNER_EMAIL_MISSING:'Your account has no valid email address to send this alert to.',
  OWNER_EMAIL_CHANGED:'Your account email changed after this message was prepared, so it was held back.',
  ALERT_SOURCE_MISSING:'The saved record behind this alert could not be found, so the alert was not sent.',
  DEDUPE_WINDOW_EXPIRED:'The first attempt could not be confirmed, and sending again now could send a duplicate, so sending stopped.',
  EMAIL_DEDUPE_WINDOW_EXPIRED:'The first attempt could not be confirmed, and sending again now could send a duplicate, so sending stopped.',
  EMAIL_ACCEPTANCE_UNKNOWN:'The email service did not confirm that it accepted this message.',
  EMAIL_OUTCOME_UNKNOWN:'The email service did not answer, so it is not known whether this message was sent.',
  EMAIL_CONFIRMATION_PENDING:'The email service has not confirmed this message yet, and it will be checked again automatically.',
  EMAIL_DELIVERY_UNCONFIRMED:'The email service accepted this message but never confirmed that it reached the inbox.',
  EMAIL_DELIVERY_FAILED:'The email service reported that this message could not be delivered or was marked as spam.'
});
export const ERROR_FALLBACK='Something went wrong sending this.';

export function deliveryStatusWords(status){
  return typeof status==='string'&&Object.hasOwn(STATUS_WORDS,status)?STATUS_WORDS[status]:STATUS_UNAVAILABLE;
}
// Returns null when there is no stored code, so nothing is printed.
export function deliveryErrorSentence(code){
  if(code===null||code===undefined||code==='')return null;
  return typeof code==='string'&&Object.hasOwn(ERROR_SENTENCES,code)?ERROR_SENTENCES[code]:ERROR_FALLBACK;
}
