import {utcToLocalParts,isValidIanaTimeZone} from './calendarTime.js';

// Owner identity and clock are trusted application arguments, never request data.
export function quoteDateContext(database,ownerId,now=new Date()) {
  const row=database.prepare('SELECT timezone FROM users WHERE id = @ownerId').get({ownerId});
  return {timeZone:row?.timezone,quoteInstant:now};
}
export function applicationQuoteMonth(service,defaults,{timeZone,quoteInstant=new Date()}={}) {
  // Missing zone setup is prompted in the price book, never a quoting gate.
  // Preserve the profile fallback until the owner explicitly chooses a zone.
  timeZone=defaults.quoteTimeZone??timeZone;
  if(!isValidIanaTimeZone(timeZone))timeZone='UTC';
  return Number(utcToLocalParts(quoteInstant,timeZone).month);
}
