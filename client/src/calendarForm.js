import {formatLocalIso, isValidIanaTimeZone, localDateTimeCandidates} from '../../server/src/calendarTime.js';

export const WEEKDAYS = [['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday']];
export const NUMBER_SETTINGS = [
  ['bookingHorizonDays','Days ahead customers can book',1,366],
  ['minimumNoticeMinutes','Minimum notice (minutes)',0,525600],
  ['slotIncrementMinutes','Start time intervals (minutes)',1,1440],
  ['bufferBeforeMinutes','Buffer before appointments (minutes)',0,1440],
  ['bufferAfterMinutes','Buffer after appointments (minutes)',0,1440]
];

export function blackoutForForm(row, timezone) {
  return {...row, startLocal:formatLocalIso(row.startAtUtc,timezone).slice(0,16),
    endLocal:formatLocalIso(row.endAtUtc,timezone).slice(0,16), originalTimezone:timezone};
}

export function bookingForm(configuration) {
  const saved=configuration.settings;
  const timezone=saved?.timezone||configuration.owner.timezone||'';
  return {timezone, weeklyAvailability:Object.fromEntries(WEEKDAYS.map(([day])=>
    [day,(saved?.weeklyAvailability?.[day]||[]).map(window=>({...window}))])),
    blackouts:(saved?.blackouts||[]).map(row=>blackoutForForm(row,timezone)),
    ...Object.fromEntries(NUMBER_SETTINGS.map(([key])=>[key,saved?.[key]===null||saved?.[key]===undefined?'':String(saved[key])])),
    directBookingEnabled:saved?.directBookingEnabled===true};
}

function blackoutInstant(row,key,timezone) {
  const text=row[key+'Local'];
  if(row[key+'AtUtc'] && row.originalTimezone===timezone &&
      formatLocalIso(row[key+'AtUtc'],timezone).slice(0,16)===text) return row[key+'AtUtc'];
  if(typeof text!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) throw Error('Enter a start and end for every blocked period.');
  const matches=localDateTimeCandidates(text.slice(0,10),text.slice(11),timezone);
  if(matches.length!==1) throw Error('That blocked time is skipped or repeated by a clock change. Choose an unambiguous time.');
  return matches[0];
}

export function blackoutValues(rows,timezone) {
  return rows.map(row=>({startAtUtc:blackoutInstant(row,'start',timezone),endAtUtc:blackoutInstant(row,'end',timezone)}));
}

export function changeFormTimezone(form,timezone) {
  if(!isValidIanaTimeZone(timezone))throw Error('Choose a valid timezone.');
  return {...form,timezone,blackouts:blackoutValues(form.blackouts,form.timezone).map(row=>blackoutForForm(row,timezone))};
}

export function settingsPayload(form) {
  if(!isValidIanaTimeZone(form.timezone))throw Error('Choose a valid timezone.');
  const numbers=Object.fromEntries(NUMBER_SETTINGS.map(([key,label,min,max])=>{
    const value=form[key];
    if(typeof value!=='string'||!/^\d+$/.test(value)||Number(value)<min||Number(value)>max)throw Error(`${label}: enter a whole number from ${min} to ${max}.`);
    return [key,Number(value)];
  }));
  return {timezone:form.timezone,weeklyAvailability:form.weeklyAvailability,
    blackouts:blackoutValues(form.blackouts,form.timezone),...numbers,directBookingEnabled:form.directBookingEnabled};
}
