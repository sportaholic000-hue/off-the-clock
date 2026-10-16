function localDateParts(instant,timeZone){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(instant));
  const read=type=>Number(parts.find(part=>part.type===type)?.value);
  const year=read('year'),month=read('month'),day=read('day');
  if(!Number.isInteger(year)||!Number.isInteger(month)||!Number.isInteger(day))throw new TypeError('Quote date could not be represented in the business time zone.');
  return {year,month,day};
}

export function quoteValidityStatementVNext(defaults={},quoteDate){
  const days=defaults.quoteValidityDays;
  if(days===undefined||days===null||days==='')return null;
  if(!Number.isSafeInteger(days)||days<=0||days>36500)throw new TypeError('Quote validity must be a positive whole number of days.');
  if(!quoteDate||typeof quoteDate.quoteInstant!=='string'||typeof quoteDate.timeZone!=='string'||!quoteDate.timeZone)throw new TypeError('Quote validity requires a recorded quote instant and business time zone.');
  const local=localDateParts(quoteDate.quoteInstant,quoteDate.timeZone);
  const expires=new Date(Date.UTC(local.year,local.month-1,local.day+days));
  const until=new Intl.DateTimeFormat('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'}).format(expires);
  return `This quote is valid for ${days} day${days===1?'':'s'}, until ${until}.`;
}
