import {storedObject} from './ownerRecordViews.js';
import {utcToLocalParts} from './calendarTime.js';
import {localReportRange,ownerTimezone,reportProblem as problem} from './ownerReportTime.js';
const weekdays=['sun','mon','tue','wed','thu','fri','sat'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const dateMs=value=>typeof value==='string'?Date.parse(value):NaN;
const activeQuote=row=>!['DISMISSED','SUPERSEDED'].includes(row.status);
const receipt=row=>{const saved=storedObject(row?.resultJson);return (saved.applicationOutcome||saved).customerResult;};
const cents=value=>{if(!['number','string'].includes(typeof value)||!/^\d{1,13}(?:\.\d{1,2})?$/.test(String(value)))return null;const [a,b='']=String(value).split('.');return BigInt(a)*100n+BigInt(b.padEnd(2,'0'));};
const decimal=value=>(value/100n).toString()+'.'+(value%100n).toString().padStart(2,'0');
export function savedQuoteValue(row,tierName=row?.tierChosen) {
  if(!row)return {excluded:'unpriced'};
  const result=receipt(row);
  if(result?.resultType==='PARTIAL_ESTIMATE_READY')return {excluded:'partial_scope'};
  if(!result||!['INSTANT_ESTIMATE_READY','INSTANT_QUOTE'].includes(result.resultType))return {excluded:'unpriced'};
  if(result.options!==undefined&&(!Array.isArray(result.options)||!result.options.length||result.options.some(option=>!object(option))))return {excluded:'unpriced'};
  let options=Array.isArray(result.options)?result.options:[result];
  if(tierName){options=options.filter(option=>option.tierName===tierName);if(options.length!==1)return {excluded:'unknown_tier'};}
  const values=options.map(option=>({low:cents(option.lowEstimate),high:cents(option.highEstimate),currency:option.currency??result.currency,
    priceUnit:option.priceUnit??result.priceUnit??'per job',taxTreatment:option.taxTreatment??result.taxTreatment??'Tax treatment not recorded'}));
  if(!values.length||values.some(v=>v.low===null||v.high===null||v.high<v.low))return {excluded:'unpriced'};
  if(values.some(v=>!['CAD','USD'].includes(v.currency)))return {excluded:'unknown_currency'};
  if(values.some(v=>!['per job','per visit'].includes(v.priceUnit)))return {excluded:'unit_price'};
  if(values.some(v=>typeof v.taxTreatment!=='string'||v.taxTreatment.length>2000))return {excluded:'invalid_qualification'};
  const first=values[0];
  if(values.some(v=>v.currency!==first.currency||v.priceUnit!==first.priceUnit||v.taxTreatment!==first.taxTreatment))return {excluded:'incomparable_options'};
  return {...first,low:values.reduce((min,v)=>v.low<min?v.low:min,first.low),high:values.reduce((max,v)=>v.high>max?v.high:max,first.high)};
}
function accumulator(){
  const groups=new Map(),excluded={};
  return {add(value){if(value.excluded){excluded[value.excluded]=(excluded[value.excluded]||0)+1;return;}
    const key=JSON.stringify([value.currency,value.priceUnit,value.taxTreatment]);
    const group=groups.get(key)||{currency:value.currency,priceUnit:value.priceUnit,taxTreatment:value.taxTreatment,low:0n,high:0n,count:0};
    group.low+=value.low;group.high+=value.high;group.count++;groups.set(key,group);},
    output:()=>[...groups.values()].sort((a,b)=>JSON.stringify(a.currency+a.priceUnit+a.taxTreatment).localeCompare(JSON.stringify(b.currency+b.priceUnit+b.taxTreatment))).map(g=>({...g,low:decimal(g.low),high:decimal(g.high)})),excluded};
}
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
export function createOwnerReportService({ownerQuery,clock=()=>new Date()}) {
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
  function report({ownerId,query={},role='owner'}){
    if(Object.keys(query).some(key=>!['period','fromDate','toDate'].includes(key)))throw problem('Unsupported report filter.');
    const range=localReportRange(query,ownerTimezone(q,ownerId),clock),hours=settings(ownerId);
    const inPeriod=value=>range.startAtUtc===null||(Number.isFinite(dateMs(value))&&dateMs(value)>=dateMs(range.startAtUtc)&&dateMs(value)<dateMs(range.endAtUtc));
    // Bounds prevent a truncated report from posing as a complete total. Every
    // collection belongs to the authenticated owner, including linked evidence.
    const read=(table,columns='*')=>{const rows=q(`SELECT ${columns} FROM ${table} WHERE ownerId=? LIMIT 100001`).all(ownerId);if(rows.length>100000)throw problem('This report exceeds the supported record limit. Export or archive older activity before reporting.',409);return rows;};
    const calls=read('calls','id,createdAt,duration,minutesBilled,spamFiltered'),allQuotes=read('quotes'),leads=read('leads'),appointments=read('appointments'),intents=read('bookingIntents'),events=read('ownerRecordEvents'),workflows=read('ownerRecordWorkflows');
    const callById=new Map(calls.map(row=>[row.id,row])),quoteById=new Map(allQuotes.map(row=>[row.id,row])),leadById=new Map(leads.map(row=>[row.id,row])),intentById=new Map(intents.map(row=>[row.id,row]));
    const selectedCalls=calls.filter(row=>inPeriod(row.createdAt)),eligibleCalls=selectedCalls.filter(row=>!row.spamFiltered);
    const selectedQuotes=allQuotes.filter(row=>activeQuote(row)&&inPeriod(row.createdAt));
    const selectedBookings=appointments.filter(row=>row.status==='CONFIRMED'&&inPeriod(row.confirmedAt||row.createdAt));
    const quoteValues=accumulator(),bookValues=accumulator(),invoiceValues=accumulator();
    for(const quote of selectedQuotes)quoteValues.add(savedQuoteValue(quote));
    function source(booking){const intent=intentById.get(booking.bookingIntentId);
      return quoteById.get(booking.quoteId)||(intent?.sourceType==='quote'?quoteById.get(intent.sourceId):intent?.sourceType==='lead'?leadById.get(intent.sourceId):null);}
    const valuedJobs=new Set();
    for(const booking of selectedBookings){
      if(booking.bookingMode!=='book_job'){bookValues.add({excluded:booking.bookingMode==='site_visit_first'?'site_visit':'unknown_booking_mode'});continue;}
      const row=source(booking),quote=row&&quoteById.get(row.id);
      if(!quote){bookValues.add({excluded:'unpriced'});continue;}
      if(valuedJobs.has(quote.id)){bookValues.add({excluded:'duplicate_quote_booking'});continue;}valuedJobs.add(quote.id);
      bookValues.add(savedQuoteValue(quote,booking.tierChosen||quote.tierChosen));
    }
    const invoiceEvents=events.filter(event=>event.kind==='quotes'&&event.action==='INVOICED'&&inPeriod(event.createdAt)&&quoteById.has(event.recordId));
    const invoiced=new Set();
    for(const event of invoiceEvents){if(invoiced.has(event.recordId))continue;invoiced.add(event.recordId);const value=storedObject(event.payloadJson);
      if(Number.isSafeInteger(value.invoiceCents)&&value.invoiceCents>=0&&['CAD','USD'].includes(value.currency))invoiceValues.add({low:BigInt(value.invoiceCents),high:BigInt(value.invoiceCents),currency:value.currency,priceUnit:'per invoice',taxTreatment:'As recorded on invoice'});
      else invoiceValues.add({excluded:'invalid_invoice'});}
    const afterHours={count:0,duringHours:0,unknown:0,basis:'Current saved business hours applied to call start in the owner timezone; spam excluded.'};
    for(const call of eligibleCalls){if(!hours.weeklyHours||!Number.isFinite(dateMs(call.createdAt))){afterHours.unknown++;continue;}
      const parts=utcToLocalParts(call.createdAt,range.timezone),day=weekdays[new Date(Date.UTC(parts.year,parts.month-1,parts.day)).getUTCDay()],minute=parts.hour*60+parts.minute;
      const inside=hours.weeklyHours[day].some(window=>minute>=Number(window.start.slice(0,2))*60+Number(window.start.slice(3))&&minute<Number(window.end.slice(0,2))*60+Number(window.end.slice(3)));
      afterHours[inside?'duringHours':'count']++;}
    const cohort=new Set(eligibleCalls.map(row=>row.id)),funnel=new Map(),assigned=new Set();
    const service=row=>[row.serviceType,storedObject(row.collectedInputsJson).applicationOutcome?.request?.serviceType,row.describedService].find(value=>typeof value==='string'&&value.trim())||'Unclassified';
    function funnelRow(row){if(!row?.callId||!cohort.has(row.callId)||!callById.has(row.callId))return null;const key=service(row);
      if(!funnel.has(key))funnel.set(key,{service:key,calls:new Set(),quoted:new Set(),booked:new Set(),invoiced:new Set(),quoteValues:accumulator(),bookValues:accumulator(),invoiceValues:accumulator(),bookQuoteIds:new Set(),invoiceQuoteIds:new Set()});
      const item=funnel.get(key);item.calls.add(row.callId);assigned.add(row.callId);return item;}
    for(const lead of leads)funnelRow(lead);
    for(const quote of allQuotes){const item=funnelRow(quote);if(item&&activeQuote(quote)){const value=savedQuoteValue(quote);if(!value.excluded)item.quoted.add(quote.callId);item.quoteValues.add(value);}}
    for(const booking of appointments){if(booking.status!=='CONFIRMED'||booking.bookingMode!=='book_job')continue;const row=source(booking),item=funnelRow(row);if(item&&item.quoted.has(row.callId)){item.booked.add(row.callId);if(quoteById.has(row.id)&&!item.bookQuoteIds.has(row.id)){item.bookQuoteIds.add(row.id);item.bookValues.add(savedQuoteValue(row,booking.tierChosen||row.tierChosen));}}}
    for(const event of events){if(event.kind!=='quotes'||event.action!=='INVOICED')continue;const quote=quoteById.get(event.recordId),item=funnelRow(quote);if(item&&item.booked.has(quote.callId)){item.invoiced.add(quote.callId);const value=storedObject(event.payloadJson);if(!item.invoiceQuoteIds.has(quote.id)&&Number.isSafeInteger(value.invoiceCents)&&value.invoiceCents>=0&&['CAD','USD'].includes(value.currency)){item.invoiceQuoteIds.add(quote.id);item.invoiceValues.add({low:BigInt(value.invoiceCents),high:BigInt(value.invoiceCents),currency:value.currency,priceUnit:'per invoice',taxTreatment:'As recorded on invoice'});}}}
    for(const callId of cohort)if(!assigned.has(callId))funnelRow({callId,serviceType:'Unclassified'});
    const percentage=(numerator,denominator)=>denominator?Math.round(numerator/denominator*10000)/100:null;
    const openFollowUps=workflows.filter(row=>row.followUpStatus==='OPEN'&&(row.kind==='quotes'?quoteById:leadById).has(row.recordId));
    return {range,settings:hours,canManage:role==='owner',counts:{calls:selectedCalls.length,answered:eligibleCalls.filter(row=>row.duration>0).length,
      spam:selectedCalls.length-eligibleCalls.length,seconds:eligibleCalls.reduce((sum,row)=>sum+(Number.isFinite(row.duration)&&row.duration>0?row.duration:0),0),
      billedMinutes:selectedCalls.reduce((sum,row)=>sum+(Number.isSafeInteger(row.minutesBilled)&&row.minutesBilled>=0?row.minutesBilled:0),0),quotes:selectedQuotes.length,bookings:selectedBookings.length,invoices:invoiced.size},
      afterHours,values:{quoted:quoteValues.output(),booked:bookValues.output(),invoiced:invoiceValues.output()},excludedValues:{quoted:quoteValues.excluded,booked:bookValues.excluded,invoiced:invoiceValues.excluded},
      undatedRecords:{calls:calls.filter(row=>!Number.isFinite(dateMs(row.createdAt))).length,quotes:allQuotes.filter(row=>!Number.isFinite(dateMs(row.createdAt))).length,bookings:appointments.filter(row=>row.status==='CONFIRMED'&&!Number.isFinite(dateMs(row.confirmedAt||row.createdAt))).length},
      funnel:[...funnel.values()].sort((a,b)=>a.service.localeCompare(b.service)).map(row=>({service:row.service,calls:row.calls.size,quoted:row.quoted.size,booked:row.booked.size,invoiced:row.invoiced.size,
        values:{quoted:row.quoteValues.output(),booked:row.bookValues.output(),invoiced:row.invoiceValues.output()},callsToQuoted:percentage(row.quoted.size,row.calls.size),quotedToBooked:percentage(row.booked.size,row.quoted.size),bookedToInvoiced:percentage(row.invoiced.size,row.booked.size)})),
      funnelBasis:'Distinct non-spam calls started in the selected period, by recorded service. Later saved quote, confirmed job and invoice stages are counted cumulatively in order; site visits are excluded. Unclassified calls remain visible.',
      valueBasis:'Saved estimates are ranges, not revenue. Currencies, price basis and tax treatment stay separate. Tier alternatives form an envelope. Confirmed jobs count a linked quote once; site visits, partial scope and unpriced records are excluded. Invoices are owner-recorded amounts, not payment receipts.',
      followUp:{open:openFollowUps.length,overdue:openFollowUps.filter(row=>row.dueAt&&dateMs(row.dueAt)<clock().getTime()).length,
        items:openFollowUps.sort((a,b)=>(a.dueAt||'9999').localeCompare(b.dueAt||'9999')).slice(0,20).map(({kind,recordId,followUpAction,dueAt,note})=>({kind,recordId,action:followUpAction,dueAt,note}))},generatedAt:clock().toISOString()};
  }
  return {report,settings,saveHours};
}
