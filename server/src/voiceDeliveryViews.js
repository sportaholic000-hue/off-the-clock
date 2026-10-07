export function callDeliveryActions(ownerQuery,ownerId,callSid){
  if(!callSid)return [];
  return ownerQuery(`SELECT o.id,o.eventType,COALESCE(s.status,o.status) AS status,
    s.attemptCount,s.lastErrorCode,s.nextAttemptAt,o.createdAt,o.updatedAt
    FROM outboxEvents o LEFT JOIN voiceSmsDeliveries s ON s.ownerId=o.ownerId AND s.id=o.id
    WHERE o.ownerId=? AND json_valid(o.payloadJson) AND json_extract(o.payloadJson,'$.callSid')=?
    AND o.eventType IN ('voice.sms_requested','voice.transfer_requested','voice.appointment_change_requested')
    ORDER BY o.createdAt,o.id`).all(ownerId,callSid);
}
export function recordCallDeliveryActions(ownerQuery,row){
  const call=ownerQuery('SELECT callSid FROM calls WHERE ownerId=? AND id=?').get(row.ownerId,row.callId);
  return callDeliveryActions(ownerQuery,row.ownerId,call?.callSid);
}
