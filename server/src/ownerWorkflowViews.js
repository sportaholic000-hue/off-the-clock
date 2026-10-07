import {storedObject} from './ownerRecordViews.js';
import {isValidIanaTimeZone} from './calendarTime.js';
export function recordWorkflow(query,ownerId,kind,id) {
  const row=query('SELECT version,followUpAction,followUpStatus,dueAt,note,reviewedQuoteId,updatedAt FROM ownerRecordWorkflows WHERE ownerId=? AND kind=? AND recordId=?').get(ownerId,kind,id);
  const history=query('SELECT id,action,fromStatus,toStatus,note,actorId,payloadJson,createdAt FROM ownerRecordEvents WHERE ownerId=? AND kind=? AND recordId=? ORDER BY createdAt,rowid').all(ownerId,kind,id)
    .map(({payloadJson,...event})=>({...event,details:storedObject(payloadJson)}));
  const bookingIntent=query('SELECT id,status,expiresAtUtc FROM bookingIntents WHERE ownerId=? AND sourceType=? AND sourceId=? ORDER BY createdAt DESC,rowid DESC LIMIT 1').get(ownerId,kind==='leads'?'lead':'quote',id);
  const timezone=query("SELECT timezone FROM users WHERE id=? AND role='owner' AND ownerId IS NULL").get(ownerId)?.timezone;
  return {...(row||{version:0,followUpAction:null,followUpStatus:null,dueAt:null,note:null,reviewedQuoteId:null}),timezone:isValidIanaTimeZone(timezone)?timezone:null,bookingIntent:bookingIntent||null,history};
}
