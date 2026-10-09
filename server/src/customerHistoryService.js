import {customerQuery,customerPhone} from './customerIdentityService.js';
import {projectSavedQuoteContext,VOICE_RESULT_BYTES} from './voice/voiceQuotePresentation.js';
import {usageOwnerQuery} from './billingUsagePolicy.js';
const parsed=value=>{try{return JSON.parse(value)||{};}catch{return {};}};
const text=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,500):null;
const jsonPhone=(column,path)=>`customer_phone(CASE WHEN json_valid(${column}) THEN json_extract(${column},'${path}') END)`;

const numberWord='(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)';
const numberValue=new RegExp(`\\b(?:\\d[\\d,.]*|${numberWord}(?:[\\s-]+(?:and[\\s-]+)?${numberWord})*)\\b`,'giu');
const measurementUnit=/^\s*(?:square\s+|sq\.?\s*)?(?:feet|foot|ft|inches|inch|yards?|yds?|meters?|metres?|miles?|acres?|centimeters?|cm|millimeters?|mm)\b/i;
function redactPreviousText(value,role){
 const source=value.trim().slice(0,role==='caller'?500:300);
 if(role==='receptionist')return source.replace(numberValue,'[past number omitted]');
 // The transcript is quoted context, never a source of prices. Measurements
 // explicitly followed by a length/area unit may remain; every other number
 // or number-word sequence could be an amount and is removed.
 return source.replace(numberValue,(match,offset,input)=>measurementUnit.test(input.slice(offset+match.length))?match:'[past amount omitted]')
  .replace(/(?:\b(?:CA|US|AU|NZ|C|A)\s*)?[$€£¥]\s*\[past amount omitted\]/gi,'[past amount omitted]')
  .replace(/\[past amount omitted\]\s*(?:dollars?|cents?|bucks?|grand|k)\b/gi,'[past amount omitted]');
}
function previousCallContext(row){
 if(!row)return null;
 let entries;try{entries=JSON.parse(row.transcriptJson||'[]');}catch{return null;}
 if(!Array.isArray(entries))return null;
 const utterances=entries.filter(item=>item&&typeof item==='object'&&['caller','user','assistant','model'].includes(item.role)&&typeof item.text==='string');
 const backup=utterances.filter(item=>typeof item.fallbackKey==='string').at(-1);
 const excerpt=utterances.filter(item=>typeof item.fallbackKey!=='string').slice(-10).map(item=>{const role=['caller','user'].includes(item.role)?'caller':'receptionist';return {role,text:redactPreviousText(item.text,role)};}).filter(item=>item.text);
 let remaining=2500;const recent=[];for(const item of excerpt.reverse()){if(item.text.length>remaining)break;recent.push(item);remaining-=item.text.length;}
 return {recordedAt:row.createdAt,endedUnexpectedly:row.status==='FAILED'||row.outcome==='TWILIO_SOCKET_CLOSED'||Boolean(row.failureCode&&/^(?:GEMINI_|TWILIO_SOCKET_)/.test(row.failureCode)),transcriptExcerpt:recent.reverse(),...(backup?{backupMessage:redactPreviousText(backup.text,'caller')}:{})};
}
export function customerHistory(database,{ownerId,from,callSid},{now=Date.now(),ownerQuery}={}) {
 customerQuery(database); // Register the same normalized phone function used by existing history joins.
 const query=usageOwnerQuery(database,ownerQuery),normalized=customerPhone(from);
 const customer=normalized?query(`SELECT * FROM customers WHERE ownerId=? AND customer_phone(phoneE164)=?
   ORDER BY createdAt,id LIMIT 1`).get(ownerId,normalized):null;
 const prior=query(`SELECT status,outcome,failureCode,createdAt,transcriptJson FROM calls
   WHERE ownerId=? AND customer_phone(callerNumber)=? AND callSid<>? AND createdAt>=? AND createdAt<=?
   ORDER BY createdAt DESC,id DESC LIMIT 1`).get(ownerId,from,callSid||'',new Date(now-24*60*60*1000).toISOString(),new Date(now).toISOString());
 const previousCall=previousCallContext(prior);
 const appointments=query(`SELECT * FROM appointments a WHERE a.ownerId=?
   AND (${jsonPhone('a.customerJson','$.phone')}=? OR
     (a.customerId IS NOT NULL AND EXISTS(SELECT 1 FROM customers c WHERE c.ownerId=a.ownerId AND c.id=a.customerId AND customer_phone(c.phoneE164)=?)
       AND ${jsonPhone('a.customerJson','$.phone')} IS NULL))
   AND (a.customerId IS NULL OR EXISTS(SELECT 1 FROM customers c WHERE c.ownerId=a.ownerId AND c.id=a.customerId AND customer_phone(c.phoneE164)=?))
   ORDER BY COALESCE(a.startAtUtc,a.datetime,a.createdAt) DESC,a.id DESC LIMIT 5`).all(ownerId,from,from,from);
 const openLeads=query(`SELECT l.describedService,l.status,l.createdAt FROM leads l WHERE l.ownerId=?
   AND customer_phone(l.callerNumber)=? AND COALESCE(l.status,'') NOT IN ('DISMISSED','RESOLVED','CLOSED','CONVERTED','BOOKED')
   ORDER BY l.createdAt DESC,l.id DESC LIMIT 5`).all(ownerId,from)
   .map(row=>({description:text(row.describedService),status:text(row.status),createdAt:row.createdAt}));
 let quoteBudget=VOICE_RESULT_BYTES-16384;
 const recentQuotes=query(`SELECT q.resultJson,q.status,q.serviceType,q.createdAt,s.customerResponseJson
   FROM quotes q LEFT JOIN quoteSubmissions s ON s.ownerId=q.ownerId AND s.recordId=q.id
   WHERE q.ownerId=? AND (
     EXISTS(SELECT 1 FROM calls c WHERE c.ownerId=q.ownerId AND c.id=q.callId AND customer_phone(c.callerNumber)=?)
     OR ${jsonPhone('s.originalSubmissionJson','$.contact.phone')}=?
     OR ${jsonPhone('q.resultJson','$.originalSubmission.contact.phone')}=?)
   ORDER BY q.createdAt DESC,q.id DESC LIMIT 5`).all(ownerId,from,from,from)
   .map(row=>{
     const stored=parsed(row.customerResponseJson),fallback=parsed(row.resultJson).customerResult;
     const result=stored.resultType?stored:fallback||{};
     const view={status:text(row.status),serviceType:text(row.serviceType),createdAt:row.createdAt,resultType:text(result.resultType)};
     try{
       const complete=projectSavedQuoteContext(result),bytes=Buffer.byteLength(JSON.stringify(complete),'utf8');
       if(bytes>quoteBudget)throw new TypeError('History exceeds voice budget.');
       quoteBudget-=bytes;Object.assign(view,complete);
     }catch{
       view.resultType='ESTIMATE_REQUIRES_REVIEW';
       view.customerMessage='The complete saved quote qualifications are unavailable in this conversation. Ask the business to review the saved estimate; do not repeat an unqualified amount.';
     }
     return view;
   });
 const quoteRequests=query(`SELECT r.describedService,r.createdAt FROM quoteRequests r WHERE r.ownerId=? AND
   (EXISTS(SELECT 1 FROM calls c WHERE c.ownerId=r.ownerId AND c.id=r.callId AND customer_phone(c.callerNumber)=?)
    OR EXISTS(SELECT 1 FROM quoteSubmissions s WHERE s.ownerId=r.ownerId AND s.recordId=r.id AND ${jsonPhone('s.originalSubmissionJson','$.contact.phone')}=?))
   ORDER BY r.createdAt DESC,r.id DESC LIMIT 5`).all(ownerId,from,from)
   .map(row=>({description:text(row.describedService),createdAt:row.createdAt}));
 return {customer,appointments,openLeads,recentQuotes,quoteRequests,previousCall};
}
