import {isValidIanaTimeZone} from './calendarTime.js';
import {callDeliveryActions} from './voiceDeliveryViews.js';
import {customerPhone} from './customerIdentityService.js';
import {ownerAlertEmailReady} from './ownerAlertEmail.js';
import {storedObject,followUpContact,followUpLocation} from './ownerRecordViews.js';
import {leadFollowUpView,quoteFollowUpView} from './leadCaptureRepair20261006FollowUp.js';

function invalid(message,statusCode=400) { return Object.assign(new Error(message),{statusCode}); }
function transcript(value) {
  try {
    const rows=JSON.parse(value||'[]');
    if(!Array.isArray(rows))return null;
    return rows.filter(row=>row&&typeof row.text==='string').map(row=>({
      role:row.role,text:row.text,final:row.final,interrupted:row.interrupted}));
  } catch { return null; }
}

export function createOwnerCallService({ownerQuery,database}) {
  if(typeof ownerQuery!=='function')throw new TypeError('Call reads require tenant-scoped queries.');
  function timezone(ownerId){const value=ownerQuery("SELECT timezone FROM users WHERE id=? AND (ownerId=? OR id=?) AND role='owner'").get(ownerId,ownerId,ownerId)?.timezone;return isValidIanaTimeZone(value)?value:'UTC';}
  function list({ownerId,query={},limit=50}) {
    if(Object.keys(query).some(key=>key!=='offset'))throw invalid('Unsupported call filter.');
    const offset=query.offset??'0';
    if(typeof offset!=='string'||!/^\d{1,8}$/.test(offset))throw invalid('Choose a valid call page.');
    const calls=ownerQuery(`SELECT id,callerNumber,status,outcome,summaryText,urgency,spamFiltered,
      duration,failureCode,createdAt,completedAt FROM calls WHERE ownerId=?
      ORDER BY createdAt DESC,id DESC LIMIT ? OFFSET ?`).all(ownerId,limit,Number(offset));
    const total=ownerQuery('SELECT COUNT(*) AS count FROM calls WHERE ownerId=?').get(ownerId).count;
    const ownerTimezone=timezone(ownerId);
    return {calls:calls.map(call=>({...call,ownerTimezone})),total,offset:Number(offset),nextOffset:Number(offset)+calls.length<total?Number(offset)+calls.length:null};
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
    const callbackRequests=ownerQuery('SELECT id,leadId,source,reason,notes,historyJson,createdAt,updatedAt FROM callbackRequests WHERE ownerId=? AND callId=? ORDER BY createdAt,id').all(ownerId,id)
      .map(({historyJson,...request})=>({...request,history:JSON.parse(historyJson)}));
    const notifications=ownerQuery('SELECT id,eventType,aggregateId,callId,status,attemptCount,nextAttemptAt,lastErrorCode,acceptedAt,createdAt FROM ownerAlerts WHERE ownerId=? AND callId=? ORDER BY createdAt,id').all(ownerId,id);
    const deliveryActions=callDeliveryActions(ownerQuery,ownerId,row.callSid||ownerQuery('SELECT callSid FROM calls WHERE ownerId=? AND id=?').get(ownerId,id)?.callSid);
    const phone=customerPhone(call.callerNumber);
    const blocked=!!phone&&!!ownerQuery('SELECT 1 FROM callerBlocklist WHERE ownerId=? AND phoneNumber=?').get(ownerId,phone);
    return {...call,ownerTimezone:timezone(ownerId),blocked,canManageSpam:role==='owner'&&!!phone,transcript:turns||[],transcriptAvailable:turns!==null,quotes,leads,bookings,bookingRequests,quoteRequests,callbackRequests,notifications,deliveryActions,emailAlertsConfigured:ownerAlertEmailReady(),canRetryOwnerAlerts:role==='owner'};
  }

  function dashboard(ownerId) {
    const counts=ownerQuery(`SELECT COUNT(*) AS calls,
      COALESCE(SUM(CASE WHEN duration>0 AND spamFiltered=0 THEN 1 ELSE 0 END),0) AS answered,
      COALESCE(SUM(CASE WHEN duration>0 AND spamFiltered=0 THEN duration ELSE 0 END),0) AS seconds
      FROM calls WHERE ownerId=?`).get(ownerId);
    const quotes=ownerQuery('SELECT COUNT(*) AS count FROM quotes WHERE ownerId=?').get(ownerId).count;
    const bookings=ownerQuery("SELECT COUNT(*) AS count FROM appointments WHERE ownerId=? AND status='CONFIRMED'").get(ownerId).count;
    const notifications=ownerQuery(`SELECT id,eventType,aggregateId,callId,status,attemptCount,nextAttemptAt,lastErrorCode,acceptedAt,createdAt FROM ownerAlerts WHERE ownerId=? AND (status<>'ACCEPTED' OR seenAt IS NULL) ORDER BY CASE WHEN status IN ('FAILED','UNKNOWN','BLOCKED') THEN 0 ELSE 1 END,createdAt DESC,id DESC LIMIT 20`).all(ownerId);
    const unresolvedNotifications=ownerQuery("SELECT COUNT(*) AS n FROM ownerAlerts WHERE ownerId=? AND status<>'ACCEPTED'").get(ownerId).n;
    return {counts:{...counts,quotes,bookings},...list({ownerId,limit:5}),notifications,unresolvedNotifications,emailAlertsConfigured:ownerAlertEmailReady()};
  }
  function blocklist({ownerId,query={}}){
    if(Object.keys(query).some(k=>k!=='offset')||!/^\d{1,8}$/.test(query.offset??'0'))throw invalid('Unsupported blocklist page.');
    const offset=Number(query.offset||0),numbers=ownerQuery('SELECT phoneNumber,createdAt FROM callerBlocklist WHERE ownerId=? ORDER BY createdAt DESC,phoneNumber LIMIT 50 OFFSET ?').all(ownerId,offset);
    const total=ownerQuery('SELECT COUNT(*) n FROM callerBlocklist WHERE ownerId=?').get(ownerId).n;
    return {numbers,total,nextOffset:offset+numbers.length<total?offset+numbers.length:null};
  }
  function block({ownerId,phoneNumber}){
    const phone=customerPhone(phoneNumber);if(!phone)throw invalid('Enter an international phone number beginning with +.');
    ownerQuery('INSERT OR IGNORE INTO callerBlocklist(ownerId,phoneNumber,createdAt) VALUES(?,?,?)').run(ownerId,phone,new Date().toISOString());
    return {phoneNumber:phone,blocked:true};
  }
  function unblock({ownerId,phoneNumber}){
    const phone=customerPhone(phoneNumber);if(!phone)throw invalid('Enter an international phone number beginning with +.');
    ownerQuery('DELETE FROM callerBlocklist WHERE ownerId=? AND phoneNumber=?').run(ownerId,phone);
    return {phoneNumber:phone,blocked:false};
  }
  function markSpam({ownerId,id}){
    if(!database)throw new TypeError('Spam changes require transactional storage.');
    return database.transaction(()=>{
      const call=ownerQuery('SELECT callerNumber FROM calls WHERE ownerId=? AND id=?').get(ownerId,id);
      if(!call)throw invalid('Call not found.',404);
      const result=block({ownerId,phoneNumber:call.callerNumber});
      ownerQuery('UPDATE calls SET spamFiltered=1,minutesBilled=0 WHERE ownerId=? AND id=?').run(ownerId,id);
      return result;
    }).immediate();
  }
  return {list,detail,dashboard,blocklist,block,unblock,markSpam};
}

function transcriptWindows(value) {
  try {const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[];}catch{return [];}
}
