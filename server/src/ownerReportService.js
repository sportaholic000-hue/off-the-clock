import {calculateOwnerReport,savedQuoteValue} from './ownerReportCalculation.js';
import {runOwnerReport} from './ownerReportWorkerPool.js';
import {localReportRange,ownerTimezone,reportProblem as problem} from './ownerReportTime.js';
const weekdays=['sun','mon','tue','wed','thu','fri','sat'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export {savedQuoteValue};
function validatedHours(value){
  if(value===null)return null;
  if(!object(value)||Object.keys(value).length!==7||weekdays.some(day=>!Array.isArray(value[day])||value[day].length>4))throw problem('Set every weekday; an empty day is closed. Use at most four opening windows per day.');
  const result={};
  for(const day of weekdays){let lastEnd=-1;result[day]=value[day].map(window=>{
    if(!object(window)||Object.keys(window).sort().join(',')!=='end,start'||typeof window.start!=='string'||typeof window.end!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start)||!/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(window.end))throw problem('Use HH:mm opening hours. Split overnight hours across the two days.');
    const minutes=text=>Number(text.slice(0,2))*60+Number(text.slice(3));const start=minutes(window.start),end=minutes(window.end);
    if(start>=end||start<lastEnd)throw problem('Opening windows must be ordered and must not overlap.');lastEnd=end;return {start:window.start,end:window.end};});}
  return result;
}
export function createOwnerReportService({ownerQuery,clock=()=>new Date(),reportRunner=runOwnerReport}) {
  const q=sql=>{if(!/\bownerId\b/.test(sql))throw Error('Report tenant binding required');return ownerQuery(sql);};
  function settings(ownerId){
    const row=q('SELECT weeklyHoursJson,revision,updatedAt FROM ownerReportSettings WHERE ownerId=?').get(ownerId);
    if(!row)return {weeklyHours:null,revision:0,updatedAt:null};
    let weeklyHours=null;try{weeklyHours=validatedHours(JSON.parse(row.weeklyHoursJson));}catch{/* Corrupt saved hours are unknown, never silently open or closed. */}
    return {weeklyHours,revision:row.revision,updatedAt:row.updatedAt};
  }
  function saveHours(ownerId,body){
    ownerTimezone(q,ownerId);
    if(!object(body)||Object.keys(body).sort().join(',')!=='revision,weeklyHours'||!Number.isSafeInteger(body.revision)||body.revision<0)throw problem('Supply business hours and the current revision.');
    const hours=validatedHours(body.weeklyHours),now=clock().toISOString();
    const changed=q(`INSERT INTO ownerReportSettings(ownerId,weeklyHoursJson,revision,updatedAt) SELECT ?,?,1,? WHERE ?=0
      ON CONFLICT(ownerId) DO NOTHING`).run(ownerId,JSON.stringify(hours),now,body.revision);
    if(!changed.changes){const updated=q('UPDATE ownerReportSettings SET weeklyHoursJson=?,revision=revision+1,updatedAt=? WHERE ownerId=? AND revision=?').run(JSON.stringify(hours),now,ownerId,body.revision);
      if(!updated.changes)throw problem('Business hours changed. Refresh before saving.',409);}
    return settings(ownerId);
  }
  function reportInput({ownerId,query={},role='owner'}){
    if(Object.keys(query).some(key=>!['period','fromDate','toDate'].includes(key)))throw problem('Unsupported report filter.');
    const range=localReportRange(query,ownerTimezone(q,ownerId),clock),hours=settings(ownerId);
    // Bounds prevent a truncated report from posing as a complete total. Every
    // collection belongs to the authenticated owner, including linked evidence.
    const read=(table,columns='*')=>{const rows=q(`SELECT ${columns} FROM ${table} WHERE ownerId=? LIMIT 100001`).all(ownerId);if(rows.length>100000)throw problem('This report exceeds the supported record limit. Export or archive older activity before reporting.',409);return rows;};
    const calls=read('calls','id,createdAt,duration,minutesBilled,spamFiltered'),allQuotes=read('quotes'),leads=read('leads'),appointments=read('appointments'),intents=read('bookingIntents'),events=read('ownerRecordEvents'),workflows=read('ownerRecordWorkflows');
    return {role,range,hours,calls,allQuotes,leads,appointments,intents,events,workflows,costRows:role==='owner'?read('ownerJobCosts'):[],nowMs:clock().getTime()};
  }
  const report=args=>({...calculateOwnerReport(reportInput(args)),generatedAt:clock().toISOString()});
  async function reportAsync({signal,...args}){
    const input=reportInput(args);
    try{return {...await reportRunner(input,{signal}),generatedAt:clock().toISOString()};}
    catch(cause){throw Object.assign(problem('Report calculation did not complete. Try again.',503),{code:cause?.code||'OWNER_REPORT_FAILED',cause});}
  }
  return {report,reportAsync,settings,saveHours};
}
