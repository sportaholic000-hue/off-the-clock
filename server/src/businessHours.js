// Business hours: the one weekly schedule an owner enters. The receptionist's
// hours text, transfer hours, booking availability and the after-hours report
// all read from it, unless the owner chose different transfer or booking hours.
// Shape: {mon:[{start:'08:00',end:'17:00'}], ..., sun:[]}; an empty day is closed.
// Times are HH:mm from 00:00 to 23:59 in the business timezone; overnight hours
// are split across the two days.
export const BUSINESS_HOURS_DAYS=Object.freeze(['mon','tue','wed','thu','fri','sat','sun']);
export const BUSINESS_HOURS_DAY_NAMES=Object.freeze({mon:'Monday',tue:'Tuesday',wed:'Wednesday',thu:'Thursday',fri:'Friday',sat:'Saturday',sun:'Sunday'});
export const BUSINESS_HOURS_MAX_WINDOWS=4;
export const BUSINESS_HOURS_NOTE_LIMIT=2000;
export const BUSINESS_HOURS_REQUIRED='Set your business hours: add opening hours to at least one day, or describe your hours in the note.';
export const BUSINESS_HOURS_MISSING_FOR_SYNC='Set your business hours under Settings, Business knowledge first, or choose different hours here.';
const TIME=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const invalid=message=>Object.assign(new Error(message),{statusCode:400,code:'INVALID_REQUEST'});
const minutes=time=>Number(time.slice(0,2))*60+Number(time.slice(3));

export function emptyBusinessHours(){return Object.fromEntries(BUSINESS_HOURS_DAYS.map(day=>[day,[]]));}

// The first day and window with a blank start or end, so the form can name it.
export function firstBlankBusinessHoursWindow(hours){
  for(const day of BUSINESS_HOURS_DAYS)for(const [index,window] of (hours?.[day]||[]).entries())for(const key of ['start','end'])if(!window?.[key])return {day,index,key};
  return null;
}
export function blankBusinessHoursMessage(day){return `Enter an opening and closing time for ${BUSINESS_HOURS_DAY_NAMES[day]}, or remove that row.`;}

export function validateBusinessHours(value){
  if(!plain(value)||Object.keys(value).some(key=>!BUSINESS_HOURS_DAYS.includes(key)))throw invalid('Business hours must list days of the week.');
  return Object.fromEntries(BUSINESS_HOURS_DAYS.map(day=>{
    const windows=value[day]??[],name=BUSINESS_HOURS_DAY_NAMES[day];
    if(!Array.isArray(windows)||windows.length>BUSINESS_HOURS_MAX_WINDOWS)throw invalid(`${name} can have at most ${BUSINESS_HOURS_MAX_WINDOWS} sets of opening hours.`);
    let lastEnd=-1;
    return [day,windows.map(window=>{
      if(!plain(window)||Object.keys(window).some(key=>!['start','end'].includes(key)))throw invalid(`${name} hours must have an opening and closing time.`);
      if(!window.start||!window.end)throw invalid(blankBusinessHoursMessage(day));
      if(!TIME.test(window.start)||!TIME.test(window.end))throw invalid(`${name} hours must use times like 08:00.`);
      const start=minutes(window.start),end=minutes(window.end);
      if(end<=start)throw invalid(`${name} closing time must be after the opening time. For hours past midnight, end at 23:59 and continue on the next day.`);
      if(start<lastEnd)throw invalid(`${name} hours must not overlap.`);
      lastEnd=end;return {start:window.start,end:window.end};
    })];
  }));
}

// Saved hours, or null when none are saved or they no longer validate.
export function businessHoursFromKnowledge(knowledgeBase){
  if(!plain(knowledgeBase)||knowledgeBase.weeklyHours===undefined||knowledgeBase.weeklyHours===null)return null;
  try{return validateBusinessHours(knowledgeBase.weeklyHours);}catch{return null;}
}
export function hasOpenHours(hours){return Boolean(hours)&&BUSINESS_HOURS_DAYS.some(day=>(hours[day]||[]).length>0);}

function clock(time){
  const hour=Number(time.slice(0,2)),minute=time.slice(3);
  return `${hour%12===0?12:hour%12}:${minute} ${hour<12?'AM':'PM'}`;
}
function dayText(windows){
  if(!windows.length)return 'closed';
  if(windows.length===1&&windows[0].start==='00:00'&&windows[0].end==='23:59')return 'open 24 hours';
  return windows.map(window=>`${clock(window.start)} to ${clock(window.end)}`).join(' and ');
}
// One plain sentence per run of days with the same hours:
// "Monday to Friday: 8:00 AM to 5:00 PM. Saturday and Sunday: closed."
export function businessHoursText(hours){
  if(!hasOpenHours(hours))return '';
  const runs=[];
  for(const day of BUSINESS_HOURS_DAYS){
    const text=dayText(hours[day]||[]),last=runs.at(-1);
    if(last&&last.text===text)last.end=day;else runs.push({start:day,end:day,text});
  }
  return runs.map(run=>{
    const span=BUSINESS_HOURS_DAYS.indexOf(run.end)-BUSINESS_HOURS_DAYS.indexOf(run.start);
    const days=span===0?BUSINESS_HOURS_DAY_NAMES[run.start]:`${BUSINESS_HOURS_DAY_NAMES[run.start]} ${span===1?'and':'to'} ${BUSINESS_HOURS_DAY_NAMES[run.end]}`;
    return `${days}: ${run.text}.`;
  }).join(' ');
}
// The receptionist's hours text: the schedule, then the owner's note on its own line.
export function knowledgeHoursText(hours,note){
  return [businessHoursText(hours),String(note||'').trim()].filter(Boolean).join('\n');
}
export function businessHoursEqual(left,right){
  const a=validateBusinessHours(left||{}),b=validateBusinessHours(right||{});
  return BUSINESS_HOURS_DAYS.every(day=>JSON.stringify(a[day])===JSON.stringify(b[day]));
}
