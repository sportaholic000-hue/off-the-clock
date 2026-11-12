// Plain words for the owner alert raised when a first booking that was waiting
// for calendar confirmation is released (the calendar answered that the event
// does not exist). The same lines go in the email and on the dashboard.
import {formatOwnerTimeRange,labeled,serviceName} from './ownerMessageFormat.js';
import {storedObject} from './ownerRecordViews.js';

export const RELEASED_BOOKING_SENTENCE='The calendar never confirmed this booking, so it is not booked and the time was released.';
export const RELEASED_BOOKING_CALL_BACK='Call the customer back to book a new time.';

const words=value=>typeof value==='string'&&value.trim()?value.trim():null;

// The booked service: the quote's saved customer view first (the price book's
// service name at quote time), then the stored service, then the lead's request.
function bookedService(query,ownerId,appointment){
  const quoteId=appointment.sourceType==='quote'?appointment.sourceId:appointment.quoteId;
  const quote=quoteId?query('SELECT serviceType,resultJson FROM quotes WHERE ownerId=? AND id=?').get(ownerId,quoteId):null;
  const receipt=storedObject(quote?.resultJson),result=(receipt.applicationOutcome||receipt).customerResult;
  const estimate=result?.pricedEstimate||result;
  const lead=appointment.sourceType==='lead'?query('SELECT describedService FROM leads WHERE ownerId=? AND id=?').get(ownerId,appointment.sourceId):null;
  return words(result?.pricedScope?.service)||words(estimate?.pricedScope?.service)||serviceName(quote?.serviceType)||
    serviceName(lead?.describedService)||serviceName(appointment.serviceType);
}

// Lines after the alert title. Throws ALERT_SOURCE_MISSING when the booking is gone.
export function releasedBookingLines(query,ownerId,appointmentId,timeZone){
  const appointment=query(`SELECT a.serviceType,a.quoteId,a.startAtUtc,a.endAtUtc,a.datetime,a.timezone,a.customerJson,i.sourceType,i.sourceId
    FROM appointments a LEFT JOIN bookingIntents i ON i.ownerId=a.ownerId AND i.id=a.bookingIntentId
    WHERE a.ownerId=? AND a.id=?`).get(ownerId,appointmentId);
  if(!appointment)throw Error('ALERT_SOURCE_MISSING');
  const customer=storedObject(appointment.customerJson),start=appointment.startAtUtc||appointment.datetime;
  return [RELEASED_BOOKING_SENTENCE,labeled('Customer',customer.name),labeled('Phone',customer.phone),labeled('Email',customer.email),
    labeled('Service',bookedService(query,ownerId,appointment)),
    labeled('Requested time',start?formatOwnerTimeRange(start,appointment.endAtUtc,appointment.timezone||timeZone):null),
    RELEASED_BOOKING_CALL_BACK].filter(Boolean);
}

// Owner screens show the same lines under a released-booking alert's title.
export function withReleasedBookingDetails(query,ownerId,rows,timeZone){
  return rows.map(row=>{
    if(row.eventType!=='booking.released')return row;
    let details=null;try{details=releasedBookingLines(query,ownerId,row.aggregateId,timeZone);}catch{/* The title alone remains. */}
    return {...row,details};
  });
}
