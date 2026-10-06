import {storedObject,followUpContact,followUpLocation} from './ownerRecordViews.js';
import {leadFollowUpView,quoteFollowUpView} from './leadFollowUp.js';

function invalid(message,statusCode=400) { return Object.assign(new Error(message),{statusCode}); }
function transcript(value) {
  try {
    const rows=JSON.parse(value||'[]');
    if(!Array.isArray(rows))return null;
    return rows.filter(row=>row&&typeof row.text==='string').map(row=>({
      role:row.role,text:row.text,final:row.final,interrupted:row.interrupted}));
  } catch { return null; }
}

export function createOwnerCallService({ownerQuery}) {
  if(typeof ownerQuery!=='function')throw new TypeError('Call reads require tenant-scoped queries.');
  function list({ownerId,query={},limit=50}) {
    if(Object.keys(query).some(key=>key!=='offset'))throw invalid('Unsupported call filter.');
    const offset=query.offset??'0';
    if(typeof offset!=='string'||!/^\d{1,8}$/.test(offset))throw invalid('Choose a valid call page.');
    const calls=ownerQuery(`SELECT id,callerNumber,status,outcome,summaryText,urgency,spamFiltered,
      duration,failureCode,createdAt,completedAt FROM calls WHERE ownerId=?
      ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?`).all(ownerId,limit,Number(offset));
    const total=ownerQuery('SELECT COUNT(*) AS count FROM calls WHERE ownerId=?').get(ownerId).count;
    return {calls,total,offset:Number(offset),nextOffset:Number(offset)+calls.length<total?Number(offset)+calls.length:null};
  }

  function detail({ownerId,id,role='owner'}) {
    const row=ownerQuery(`SELECT id,callerNumber,destinationNumber,status,outcome,summaryText,urgency,
      spamFiltered,duration,failureCode,createdAt,completedAt,transcriptJson FROM calls
      WHERE ownerId=? AND id=?`).get(ownerId,id);
    if(!row)throw invalid('Call not found.',404);
    let turns=transcript(row.transcriptJson);
    if(!turns?.length){
      const stored=ownerQuery(`SELECT role,text,interrupted FROM transcriptTurns
        WHERE ownerId=? AND callId=? ORDER BY sequence,id`).all(ownerId,id);
      if(stored.length)turns=stored;
    }
    const quotes=ownerQuery('SELECT * FROM quotes WHERE ownerId=? AND callId=? ORDER BY createdAt,id').all(ownerId,id)
      .map(quote=>quoteFollowUpView(ownerQuery,quote,role));
    const leads=ownerQuery('SELECT * FROM leads WHERE ownerId=? AND callId=? ORDER BY createdAt,id').all(ownerId,id)
      .map(lead=>leadFollowUpView(ownerQuery,lead,role));
    // Both the source and the linked record must belong to this owner. A bad
    // cross-tenant foreign key must never reveal the other tenant's booking.
    const source=`((i.sourceType='quote' AND EXISTS(SELECT 1 FROM quotes q WHERE q.ownerId=? AND q.id=i.sourceId AND q.callId=?))
      OR (i.sourceType='lead' AND EXISTS(SELECT 1 FROM leads l WHERE l.ownerId=? AND l.id=i.sourceId AND l.callId=?)))`;
    const bookings=ownerQuery(`SELECT a.id,a.status,a.serviceType,a.bookingMode,a.startAtUtc,a.endAtUtc,
      a.datetime,a.timezone,a.tierChosen,a.customerJson,a.locationJson,a.createdAt
      FROM appointments a LEFT JOIN bookingIntents i ON i.id=a.bookingIntentId AND i.ownerId=a.ownerId
      WHERE a.ownerId=? AND (EXISTS(SELECT 1 FROM quotes q WHERE q.ownerId=? AND q.id=a.quoteId AND q.callId=?)
        OR ${source}) ORDER BY a.createdAt,a.id`).all(ownerId,ownerId,id,ownerId,id,ownerId,id)
      .map(({customerJson,locationJson,...booking})=>({...booking,customer:storedObject(customerJson),location:storedObject(locationJson)}));
    const bookingRequests=ownerQuery(`SELECT p.id,p.status,p.preferredWindowsJson,p.note,p.createdAt,p.customerJson,p.locationJson
      FROM bookingPreferences p JOIN bookingIntents i ON i.id=p.intentId AND i.ownerId=p.ownerId
      WHERE p.ownerId=? AND ${source} ORDER BY p.createdAt,p.id`).all(ownerId,ownerId,id,ownerId,id)
      .map(({preferredWindowsJson,customerJson,locationJson,...request})=>({...request,preferredWindows:transcriptWindows(preferredWindowsJson),
        customer:followUpContact(storedObject(customerJson)),location:followUpLocation(storedObject(locationJson))}));
    const quoteRequests=ownerQuery('SELECT id,describedService,estimatedValue,createdAt FROM quoteRequests WHERE ownerId=? AND callId=? ORDER BY createdAt,id').all(ownerId,id);
    const {transcriptJson,...call}=row;
    return {...call,transcript:turns||[],transcriptAvailable:turns!==null,quotes,leads,bookings,bookingRequests,quoteRequests};
  }

  function dashboard(ownerId) {
    const counts=ownerQuery(`SELECT COUNT(*) AS calls,
      COALESCE(SUM(CASE WHEN duration>0 AND spamFiltered=0 THEN 1 ELSE 0 END),0) AS answered,
      COALESCE(SUM(CASE WHEN duration>0 AND spamFiltered=0 THEN duration ELSE 0 END),0) AS seconds
      FROM calls WHERE ownerId=?`).get(ownerId);
    const quotes=ownerQuery('SELECT COUNT(*) AS count FROM quotes WHERE ownerId=?').get(ownerId).count;
    const bookings=ownerQuery("SELECT COUNT(*) AS count FROM appointments WHERE ownerId=? AND status='CONFIRMED'").get(ownerId).count;
    return {counts:{...counts,quotes,bookings},...list({ownerId,limit:5})};
  }
  return {list,detail,dashboard};
}

function transcriptWindows(value) {
  try {const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return [];}
}
