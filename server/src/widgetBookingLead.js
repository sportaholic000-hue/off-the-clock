import {usageOwnerQuery} from './billingUsagePolicy.js';
import {resolveCustomer} from './customerIdentityService.js';
import {storedObject,followUpContact} from './ownerRecordViews.js';

// Called inside the booking confirmation transaction. A widget request keeps
// its existing lead ID; a booking from an older widget quote fills the gap.
// Phone identity is shared with the web/call producers, never inferred by name.
export function linkWidgetBookingLead(database,{ownerId,intentId,appointmentId,createdAt}) {
  const query=usageOwnerQuery(database);
  const intent=query('SELECT sourceType,sourceId FROM bookingIntents WHERE ownerId=? AND id=?').get(ownerId,intentId);
  if(!intent)return;
  const lead=query('SELECT * FROM leads WHERE ownerId=? AND id=?').get(ownerId,intent.sourceId);
  const quote=intent.sourceType==='quote'?query('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(ownerId,intent.sourceId):null;
  // Call leads and call-linked quotes retain their existing capture behaviour.
  if(lead?.callId||quote?.callId)return;
  const detail=storedObject(quote?.resultJson||lead?.collectedInputsJson);
  if(!detail.originalSubmission&&quote?.callerType!=='customer')return;
  const appointment=query('SELECT customerJson,locationJson FROM appointments WHERE ownerId=? AND id=? AND bookingIntentId=?').get(ownerId,appointmentId,intentId);
  if(!appointment)return;
  const contact=followUpContact(storedObject(appointment.customerJson));
  const customer=resolveCustomer(database,{ownerId,phone:contact.phone,createdAt});
  query('UPDATE appointments SET customerId=? WHERE ownerId=? AND id=?').run(customer?.id??null,ownerId,appointmentId);
  if(lead)return;
  const original=detail.originalSubmission||{};
  const saved={...detail,customerId:detail.customerId||customer?.id||null,linkedQuoteId:quote?.id,
    originalSubmission:{...original,contact:{...contact,...followUpContact(original.contact)},
      location:original.location||storedObject(appointment.locationJson)}};
  query(`INSERT INTO leads (id,ownerId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(intent.sourceId,ownerId,contact.name||null,contact.phone||null,
    original.serviceRequest||quote?.serviceType||'Customer service request',JSON.stringify(saved),'widget_quote','NEW',createdAt);
}
