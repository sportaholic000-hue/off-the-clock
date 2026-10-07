import React from 'react';
import {callTime} from './callTime.js';
export function DeliveryActions({actions=[],ownerTimezone}){
  if(!actions.length)return null;
  return <><h3>Delivery and transfer attempts on this call</h3><p>QUEUED and ACCEPTED do not confirm sending. SENT confirms sending; DELIVERED confirms a provider delivery receipt. UNKNOWN needs review and is not resent automatically.</p>
    {actions.map(action=><p key={action.id}>{action.eventType} · {action.status} · {ownerTimezone?callTime(action.createdAt,ownerTimezone):action.createdAt}
      {action.attemptCount!==null&&action.attemptCount!==undefined&&<> · {action.attemptCount} attempts</>}
      {action.lastErrorCode&&<> · {action.lastErrorCode}</>}</p>)}</>;
}
