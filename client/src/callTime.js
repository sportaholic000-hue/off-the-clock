// One date and time format for every owner page: the business time zone,
// "2026-11-13, 01:33 AST". A missing or invalid value reads "Not recorded";
// a missing or invalid time zone falls back to UTC, which the format names.
const PARTS={year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'};
const CLOCK={hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'short'};
const DAY={year:'numeric',month:'2-digit',day:'2-digit'};
function formatted(value,timeZone,options){
 if(!value)return 'Not recorded';const date=new Date(value);if(!Number.isFinite(date.getTime()))return 'Not recorded';
 try{return new Intl.DateTimeFormat('en-CA',{...options,timeZone:timeZone||'UTC'}).format(date);}catch{return new Intl.DateTimeFormat('en-CA',{...options,timeZone:'UTC'}).format(date);}
}
export function callTime(value,timeZone='UTC'){return formatted(value,timeZone,PARTS);}
// The time of day alone, for the end of a range on the same day: "09:45 ADT".
export function clockTime(value,timeZone='UTC'){return formatted(value,timeZone,CLOCK);}
// The business-local calendar date alone: "2026-11-12".
export function businessDay(value,timeZone='UTC'){return formatted(value,timeZone,DAY);}
