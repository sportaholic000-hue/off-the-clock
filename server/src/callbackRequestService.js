import {usageOwnerQuery} from './billingUsagePolicy.js';
import {randomUUID} from 'node:crypto';

// Caller invokes this inside its IMMEDIATE capture transaction. The database
// identity is independent of contact corrections, tool IDs and signing keys.
export function saveCallbackRequest({database,ownerId,callId,leadId,requestKey,source,reason,notes,at}) {
  if(!usageOwnerQuery(database)('SELECT 1 FROM leads l JOIN calls c ON c.id=l.callId AND c.ownerId=l.ownerId WHERE l.ownerId=? AND l.id=? AND c.id=?').get(ownerId,leadId,callId))throw Error('Callback inquiry is not bound to this call.');
  if(notes!==null&&(typeof notes!=='string'||!notes.trim()||notes.length>1000))throw Error('Callback notes are invalid.');
  const old=usageOwnerQuery(database)('SELECT * FROM callbackRequests WHERE ownerId=? AND callId=? AND requestKey=?').get(ownerId,callId,requestKey);
  if(old&&old.leadId!==leadId)throw Error('Callback inquiry binding cannot change.');
  if(old&&old.notes===notes)return old;
  const id=old?.id||randomUUID(),history=old?JSON.parse(old.historyJson):[];
  history.push({at,notes,source,reason});
  if(old)usageOwnerQuery(database)('UPDATE callbackRequests SET notes=?,historyJson=?,updatedAt=? WHERE ownerId=? AND callId=? AND id=?').run(notes,JSON.stringify(history),at,ownerId,callId,id);
  else usageOwnerQuery(database)('INSERT INTO callbackRequests(id,ownerId,callId,leadId,requestKey,source,reason,notes,historyJson,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,ownerId,callId,leadId,requestKey,source,reason,notes,JSON.stringify(history),at,at);
  return {id,ownerId,callId,leadId,notes,source,reason,createdAt:old?.createdAt||at};
}
