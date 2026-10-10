import {usageOwnerQuery} from '../billingUsagePolicy.js';

const E164=/^\+[1-9]\d{7,14}$/;

export function recordForwardingArrival(database,{context,forwardedFrom,forwardedFromPresent,at}){
  const query=usageOwnerQuery(database);
  // A CallSid cannot be reused to plant a forwarding receipt for another
  // business, even if the first delivery had to take a fallback path.
  if(query('SELECT 1 FROM voiceForwardingArrivals WHERE callSid=? AND ownerId<>?').get(context.callSid,context.ownerId)){
    const error=new Error('Call binding mismatch');error.code='VOICE_CALL_BINDING_MISMATCH';throw error;
  }
  const forwarded=forwardedFromPresent===true;
  query(`INSERT OR IGNORE INTO voiceForwardingArrivals
    (ownerId,callSid,accountSid,callerNumber,destinationNumber,forwardedFromPresent,forwardedFrom,reachedAt)
    VALUES(?,?,?,?,?,?,?,?)`).run(context.ownerId,context.callSid,context.accountSid,context.from,context.to,forwarded?1:0,forwarded&&E164.test(forwardedFrom)?forwardedFrom:null,at);
}

export function latestForwardingArrival(database,ownerId,destinationNumber){
  if(!E164.test(String(destinationNumber||'')))return null;
  const row=usageOwnerQuery(database)(`SELECT callSid,callerNumber,forwardedFromPresent,forwardedFrom,reachedAt
    FROM voiceForwardingArrivals WHERE ownerId=? AND destinationNumber=? ORDER BY reachedAt DESC,rowid DESC LIMIT 1`).get(ownerId,destinationNumber);
  return row?{callSid:row.callSid,callerNumber:row.callerNumber,forwardedFromPresent:Boolean(row.forwardedFromPresent),forwardedFrom:row.forwardedFrom,reachedAt:row.reachedAt}:null;
}
