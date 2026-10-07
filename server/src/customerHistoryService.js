import {customerQuery,findCustomer} from './customerIdentityService.js';
import {projectSavedQuoteContext,VOICE_RESULT_BYTES} from './voice/voiceQuotePresentation.js';
const parsed=value=>{try{return JSON.parse(value)||{};}catch{return {};}};
const text=value=>typeof value==='string'&&value.trim()?value.trim().slice(0,500):null;
const jsonPhone=(column,path)=>`customer_phone(CASE WHEN json_valid(${column}) THEN json_extract(${column},'${path}') END)`;

export function customerHistory(database,{ownerId,from}) {
 const query=customerQuery(database),customer=findCustomer(database,ownerId,from);
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
 return {customer,appointments,openLeads,recentQuotes,quoteRequests};
}
