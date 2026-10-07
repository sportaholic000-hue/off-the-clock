import {addLocalDays,isValidIanaTimeZone,localDateForInstant,localDateTimeCandidates,parseLocalDate} from './calendarTime.js';
export const reportProblem=(message,statusCode=400)=>Object.assign(Error(message),{statusCode});
export function ownerTimezone(query,ownerId) {
  const owner=query("SELECT timezone FROM users WHERE id=? AND ownerId IS NULL AND role='owner'").get(ownerId);
  if(!owner)throw reportProblem('Owner account not found.',404);
  if(!isValidIanaTimeZone(owner.timezone))throw reportProblem('Set the business timezone before filtering dates or opening reports.',409);
  return owner.timezone;
}
export function localReportRange({period='month',fromDate,toDate},timezone,clock=()=>new Date()) {
  if(!['today','week','month','custom','all'].includes(period))throw reportProblem('Choose today, week, month, custom or all.');
  const today=localDateForInstant(clock(),timezone);
  if(period!=='custom'&&(fromDate!==undefined||toDate!==undefined))throw reportProblem('Dates require a custom period.');
  if(period==='all')return {period,timezone,fromDate:null,toDate:null,startAtUtc:null,endAtUtc:null};
  if(period==='today')fromDate=toDate=today;
  if(period==='week'){
    const weekday=new Date(today+'T12:00:00Z').getUTCDay();fromDate=addLocalDays(today,-((weekday+6)%7));toDate=addLocalDays(fromDate,6);
  }
  if(period==='month'){
    fromDate=today.slice(0,7)+'-01';const date=new Date(fromDate+'T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);toDate=addLocalDays(date.toISOString().slice(0,10),-1);
  }
  try {parseLocalDate(fromDate);parseLocalDate(toDate);}catch{throw reportProblem('Choose valid start and end dates.');}
  const days=(Date.parse(toDate+'T12:00:00Z')-Date.parse(fromDate+'T12:00:00Z'))/86400000+1;
  if(days<1||days>366)throw reportProblem('Choose a period of 1 to 366 days.');
  const start=localDateTimeCandidates(fromDate,'00:00',timezone),end=localDateTimeCandidates(addLocalDays(toDate,1),'00:00',timezone);
  if(start.length!==1||end.length!==1)throw reportProblem('Choose dates with unambiguous local midnight boundaries.');
  return {period,timezone,fromDate,toDate,startAtUtc:start[0],endAtUtc:end[0]};
}
