import {recordCallDeliveryActions} from './voiceDeliveryViews.js';
import {storedObject,storedLeadView,storedQuoteView,followUpContact,followUpLocation} from './ownerRecordViews.js';
import {recordWorkflow} from './ownerWorkflowViews.js';

export function leadFollowUpView(ownerQuery,row,role) {
  const submission=ownerQuery(`SELECT originalSubmissionJson FROM quoteSubmissions
    WHERE ownerId=? AND recordId=? ORDER BY createdAt DESC,rowid DESC LIMIT 1`).get(row.ownerId,row.id);
  const preferred=ownerQuery(`SELECT p.id,p.status,p.customerJson,p.locationJson,p.createdAt
    FROM bookingPreferences p JOIN bookingIntents i ON i.ownerId=p.ownerId AND i.id=p.intentId
    WHERE p.ownerId=? AND i.sourceId=? AND i.sourceType IN ('lead','quote')
    ORDER BY p.createdAt DESC,p.rowid DESC LIMIT 1`).get(row.ownerId,row.id);
  const view=storedLeadView(row,role,submission?storedObject(submission.originalSubmissionJson):undefined,preferred);
  if(!row.callId){
    const detail=storedObject(row.collectedInputsJson);
    view.customerId=detail.customerId&&ownerQuery('SELECT id FROM customers WHERE ownerId=? AND id=?').get(row.ownerId,detail.customerId)?.id||null;
    const quote=detail.linkedQuoteId&&ownerQuery('SELECT id,resultJson FROM quotes WHERE ownerId=? AND id=?').get(row.ownerId,detail.linkedQuoteId);
    if(quote){view.linkedQuoteId=quote.id;view.result=storedQuoteView(quote,role).result;}
    view.bookings=ownerQuery(`SELECT a.id,a.status,a.createdAt,a.startAtUtc,a.endAtUtc,a.timezone,a.customerJson,a.locationJson,a.customerId
      FROM appointments a JOIN bookingIntents i ON i.ownerId=a.ownerId AND i.id=a.bookingIntentId
      WHERE a.ownerId=? AND i.sourceId=? ORDER BY a.createdAt,a.id`).all(row.ownerId,row.id)
      .map(({customerJson,locationJson,...booking})=>({...booking,contact:followUpContact(storedObject(customerJson)),location:followUpLocation(storedObject(locationJson))}));
    const latest=view.bookings.filter(booking=>booking.status==='CONFIRMED').at(-1);
    if(latest&&(!view.preferredRequest||Date.parse(latest.createdAt)>=Date.parse(view.preferredRequest.createdAt))){
      view.submittedContact=view.contact;view.submittedLocation=view.location;
      view.contact={...view.contact,...latest.contact};view.location=latest.location;
      view.customerName=view.contact.name||view.customerName;view.callerNumber=view.contact.phone||view.callerNumber;
      view.customerId=latest.customerId||view.customerId;
      view.followUpSource={kind:'booking',id:latest.id,createdAt:latest.createdAt};
    }
  }
  view.callbackRequests=ownerQuery('SELECT id,source,reason,notes,historyJson,createdAt FROM callbackRequests WHERE ownerId=? AND leadId=? ORDER BY createdAt,id').all(row.ownerId,row.id).map(({historyJson,...request})=>({...request,history:JSON.parse(historyJson)}));
  view.deliveryActions=recordCallDeliveryActions(ownerQuery,row);
  view.workflow=recordWorkflow(ownerQuery,row.ownerId,'leads',row.id);view.canReview=role==='owner';
  if(!row.callId&&view.linkedQuoteId&&!view.workflow.bookingIntent)view.workflow.bookingIntent=recordWorkflow(ownerQuery,row.ownerId,'quotes',view.linkedQuoteId).bookingIntent;
  return view;
}

export function quoteFollowUpView(ownerQuery,row,role) {
  const submission=ownerQuery(`SELECT originalSubmissionJson FROM quoteSubmissions
    WHERE ownerId=? AND recordId=? ORDER BY createdAt DESC,rowid DESC LIMIT 1`).get(row.ownerId,row.id);
  return {...storedQuoteView(row,role,submission?storedObject(submission.originalSubmissionJson):undefined),workflow:recordWorkflow(ownerQuery,row.ownerId,'quotes',row.id),canReview:role==='owner',deliveryActions:recordCallDeliveryActions(ownerQuery,row)};
}
