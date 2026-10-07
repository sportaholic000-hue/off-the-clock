import React from 'react';
export function DeliveryActions({actions=[]}){
  if(!actions.length)return null;
  return <><h3>Delivery and transfer attempts on this call</h3><p>ACCEPTED means the email provider accepted the message. DELIVERED confirms a delivery receipt. REVIEW needs owner attention.</p>
    {actions.map(action=><p key={action.id}>{action.eventType==='quote.email_requested'?'Quote email':action.eventType}{action.recipient&&<> to {action.recipient}</>} · {action.status} · {action.createdAt}
      {action.attemptCount!==null&&action.attemptCount!==undefined&&<> · {action.attemptCount} attempts</>}
      {action.lastErrorCode&&<> · {action.lastErrorCode}</>}</p>)}</>;
}
