import {utcToLocalParts,isValidIanaTimeZone} from './calendarTime.js';

// Owner identity and clock are trusted application arguments, never request data.
export function quoteDateContext(database,ownerId,now=new Date()) {
  const row=database.prepare('SELECT timezone FROM users WHERE id = @ownerId').get({ownerId});
  return {timeZone:row?.timezone,quoteInstant:now};
}
export function applicationQuoteMonth(service,defaults,{timeZone,quoteInstant=new Date()}={}) {
  timeZone=defaults.quoteTimeZone??timeZone;
  const peakMonths=service.peakMonths??defaults.peakMonths;
  const peakPercent=service.peakSurchargePercent??defaults.peakSurchargePercent;
  if(!isValidIanaTimeZone(timeZone)) {
    if(Array.isArray(peakMonths)&&peakMonths.length&&peakPercent>0) {
      const error=new Error('Set a valid business time zone before calculating seasonal prices.');error.statusCode=409;throw error;
    }
    return 1; // Month has no price effect when seasonal pricing is off.
  }
  return Number(utcToLocalParts(quoteInstant,timeZone).month);
}
