export function callTime(value,timeZone='UTC'){
 if(!value)return 'Not recorded';const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Not recorded';
 try{return new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(date);}catch{return new Intl.DateTimeFormat('en-CA',{timeZone:'UTC',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'}).format(date);}
}
