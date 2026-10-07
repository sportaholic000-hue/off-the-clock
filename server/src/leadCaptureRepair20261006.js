import {resolveCustomer,customerQuery} from './customerIdentityService.js';
import {randomUUID} from 'node:crypto';

const object=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const parsed=value=>{try{return object(JSON.parse(value));}catch{return {};}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

// Caller identity and inquiry identity are separate. This helper runs inside
// the caller's IMMEDIATE transaction; it never changes an owner's disposition.
export function saveVoiceInquiry({database,context,callId,key,leadId,customerId,updates={},createdAt,
  type='voice_lead',status='CAPTURED',legacyDefault=false}) {
  let row=leadId?database.prepare('SELECT * FROM leads WHERE ownerId=? AND callId=? AND id=?').get(context.ownerId,callId,leadId):
    database.prepare(`SELECT * FROM leads WHERE ownerId=? AND callId=? AND json_valid(collectedInputsJson)
      AND json_extract(collectedInputsJson,'$.voiceVersion')=1
      AND json_extract(collectedInputsJson,'$.inquiryKey')=? ORDER BY rowid LIMIT 1`).get(context.ownerId,callId,key);
  if(!row&&!leadId&&legacyDefault)row=database.prepare(`SELECT * FROM leads WHERE ownerId=? AND callId=?
    AND json_valid(collectedInputsJson) AND json_extract(collectedInputsJson,'$.voiceVersion')=1
    AND json_extract(collectedInputsJson,'$.inquiryKey') IS NULL
    AND callerNumber=? ORDER BY rowid LIMIT 1`).get(context.ownerId,callId,context.from);
  if(!row&&!leadId&&legacyDefault){
    const pending=database.prepare(`SELECT * FROM leads WHERE ownerId=? AND callId=?
      AND json_valid(collectedInputsJson) AND json_extract(collectedInputsJson,'$.voiceVersion')=1
      AND callerNumber=? ORDER BY rowid`).all(context.ownerId,callId,context.from);
    if(pending.length===1&&String(parsed(pending[0].collectedInputsJson).inquiryKey||'').startsWith('review:'))row=pending[0];
  }
  customerQuery(database);
  const before=parsed(row?.collectedInputsJson);
  if(row&&(before.voiceVersion!==1||row.callerNumber!==context.from))throw Error('Invalid inquiry binding.');
  const id=row?.id||leadId||randomUUID();
  customerId=resolveCustomer(database,{ownerId:context.ownerId,phone:context.from,createdAt})?.id||customerId||randomUUID();
  const customer=database.prepare('SELECT * FROM customers WHERE ownerId=? AND id=? AND (customer_phone(phoneE164)=? OR phoneE164=?)').get(context.ownerId,customerId,context.from,context.from);
  const customerNotes=parsed(customer?.notesJson);
  const contact={name:before.contact?.name??customer?.name??null,email:before.contact?.email??customerNotes.email??null,phone:before.contact?.phone??context.from};
  for(const field of ['name','email','phone'])if(updates[field]!==undefined)contact[field]=updates[field];
  // An old customer's address is retained on the customer, but is not silently
  // promoted to the site of a new inquiry/booking.
  const address=updates.address!==undefined?updates.address:before.address??null;
  const notes=updates.notes!==undefined?updates.notes:before.notes??null;
  const description=updates.description!==undefined?updates.description:row?.describedService??notes;
  const urgency=updates.urgency&&before.urgency?.reason===updates.urgency.reason&&before.urgency?.summary===updates.urgency.summary?
    before.urgency:updates.urgency??before.urgency??null;
  const snapshot={contact,address,notes,description,urgency};
  const previous={contact:before.contact??null,address:before.address??null,notes:before.notes??null,description:row?.describedService??null,urgency:before.urgency??null};
  const history=Array.isArray(before.captureHistory)?[...before.captureHistory]:[];
  if(row&&!history.length)history.push({source:'prior_capture',at:row.createdAt,...previous});
  if(!row||!same(snapshot,previous))history.push({source:'voice_capture',at:createdAt,providedFields:Object.keys(updates),...snapshot});
  const details={...before,voiceVersion:1,inquiryKey:legacyDefault?key:before.inquiryKey||key,customerId,...snapshot,captureHistory:history};
  const nextCustomerNotes={...customerNotes,voiceVersion:1,email:updates.email!==undefined?updates.email:customerNotes.email??contact.email};
  if(customer)database.prepare('UPDATE customers SET name=?,address=?,notesJson=? WHERE ownerId=? AND id=? AND (customer_phone(phoneE164)=? OR phoneE164=?)').run(
    updates.name??customer.name,updates.address!==undefined?JSON.stringify(updates.address):customer.address,JSON.stringify(nextCustomerNotes),context.ownerId,customerId,context.from,context.from);
  else database.prepare('INSERT INTO customers(id,ownerId,phoneE164,name,address,notesJson,createdAt) VALUES(?,?,?,?,?,?,?)').run(
    customerId,context.ownerId,context.from,contact.name,address?JSON.stringify(address):null,JSON.stringify(nextCustomerNotes),createdAt);
  const nextType=urgency?.reason==='complaint'?'COMPLAINT':row?.type||type;
  if(row)database.prepare('UPDATE leads SET customerName=?,describedService=?,collectedInputsJson=?,type=? WHERE ownerId=? AND callId=? AND id=?').run(
    contact.name,description,JSON.stringify(details),nextType,context.ownerId,callId,id);
  else database.prepare('INSERT INTO leads(id,ownerId,callId,customerName,callerNumber,describedService,collectedInputsJson,type,status,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(
    id,context.ownerId,callId,contact.name,context.from,description,JSON.stringify(details),nextType,status,createdAt);
  if(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='webhookDeliveries'").get())
    database.prepare(`UPDATE webhookDeliveries SET payloadJson=json_set(payloadJson,
      '$.customerName',?,'$.phone',?,'$.email',?,'$.service',?,'$.type',?)
      WHERE ownerId=? AND aggregateId=? AND eventType='lead.created' AND status='PENDING'
      AND attemptCount=0 AND json_valid(payloadJson)`).run(contact.name,contact.phone,contact.email,description,nextType,context.ownerId,id);
  return {row:{...row,id,ownerId:context.ownerId,callId,describedService:description},details};
}
