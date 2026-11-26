import React from 'react';
import {callTime} from './callTime.js';
import {deliveryStatusWords,deliveryErrorSentence} from './deliveryWords.js';
// Plain names for the delivery and transfer attempts listed to the owner.
const ACTION_NAMES=Object.freeze({'quote.email_requested':'Quote email','voice.transfer_requested':'Live transfer','voice.appointment_change_requested':'Booking change'});
export function deliveryActionName(eventType){return Object.hasOwn(ACTION_NAMES,eventType)?ACTION_NAMES[eventType]:'Other attempt';}
export function DeliveryActions({actions=[],ownerTimezone}){
  if(!actions.length)return null;
  return <><h3>Delivery and transfer attempts on this call</h3><p>Sent means the email service accepted the message. Delivered confirms a delivery receipt. Not sent and Not confirmed need your attention.</p>
    {actions.map(action=><p key={action.id}>{deliveryActionName(action.eventType)}{action.recipient&&<> to {action.recipient}</>} · {deliveryStatusWords(action.status,action.eventType)} · {callTime(action.createdAt,ownerTimezone)}
      {action.attemptCount!==null&&action.attemptCount!==undefined&&<> · {action.attemptCount} attempts</>}
      {deliveryErrorSentence(action.lastErrorCode)&&<> · {deliveryErrorSentence(action.lastErrorCode)}</>}</p>)}</>;
}
