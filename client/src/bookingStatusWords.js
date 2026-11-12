// Plain words for every booking and appointment status the server stores.
// A stored code is never shown to the owner.
const WAITING_WORDS='Pending confirmation';
const NOT_BOOKED='Not booked';
const APPOINTMENT_WORDS=Object.freeze({
  CONFIRMED:'Confirmed',
  PENDING_PROVIDER:WAITING_WORDS,
  PENDING_CONFIRMATION:WAITING_WORDS,
  CONFIRMING:WAITING_WORDS,
  CANCELLED:'Cancelled',
  PROVIDER_FAILED:NOT_BOOKED,
  CONFLICTED:NOT_BOOKED
});
const REQUEST_WORDS=Object.freeze({REQUESTED:'Requested time'});
const UNKNOWN='Status unknown';
const CALL_BACK=' Call the customer back to book a new time.';
const APPOINTMENT_NOTES=Object.freeze({
  PENDING_PROVIDER:'Calendar confirmation is still pending. This appointment has not been confirmed.',
  PENDING_CONFIRMATION:'Calendar confirmation is still pending. This appointment has not been confirmed.',
  CONFIRMING:'Calendar confirmation is still pending. This appointment has not been confirmed.',
  PROVIDER_FAILED:'The calendar never confirmed this booking, so it is not booked.'+CALL_BACK,
  CONFLICTED:'That time was no longer open when the calendar was checked, so it is not booked.'+CALL_BACK
});

export const WAITING_APPOINTMENT_STATUSES=Object.freeze(['PENDING_PROVIDER','PENDING_CONFIRMATION','CONFIRMING']);
export const appointmentStatusWords=status=>Object.hasOwn(APPOINTMENT_WORDS,status)?APPOINTMENT_WORDS[status]:UNKNOWN;
export const appointmentStatusNote=status=>Object.hasOwn(APPOINTMENT_NOTES,status)?APPOINTMENT_NOTES[status]:null;
export const bookingRequestStatusWords=status=>Object.hasOwn(REQUEST_WORDS,status)?REQUEST_WORDS[status]:UNKNOWN;
export const bookingModeWords=mode=>mode==='site_visit_first'?'Site visit':mode==='book_job'?'Job appointment':null;
