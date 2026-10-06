import {randomUUID} from 'node:crypto';

// International numbers only: never infer a country or match names/emails.
// Normalization verifies syntax, not ownership. Signed voice context supplies
// the caller number; public web contact never authenticates a caller.
export function customerPhone(value) {
  if(typeof value!=='string'||!/^\+[\d\s().-]+$/.test(value.trim()))return null;
  const phone='+'+value.replace(/\D/g,'');
  return /^\+[1-9]\d{7,14}$/.test(phone)?phone:null;
}
const registered=new WeakSet();
export function customerQuery(database) {
  if(!registered.has(database)){
    database.function('customer_phone',{deterministic:true},customerPhone);
    registered.add(database);
  }
  return sql=>{
    if(!/\bownerId\b/.test(sql))throw new Error('Customer queries require ownerId.');
    return database.prepare(sql);
  };
}
export function findCustomer(database,ownerId,phone) {
  const query=customerQuery(database),normalized=customerPhone(phone);
  if(!normalized)return null;
  // Stable oldest identity also handles legacy secret-derived duplicates without
  // deleting records, moving other people's records or rewriting old receipts.
  return query(`SELECT * FROM customers WHERE ownerId=? AND customer_phone(phoneE164)=?
    ORDER BY createdAt,id LIMIT 1`).get(ownerId,normalized)||null;
}
// Call only within the producer's IMMEDIATE transaction. SQLite serializes both
// web and voice writers, including separate connections/processes and retries.
export function resolveCustomer(database,{ownerId,phone,createdAt}) {
  if(!database.inTransaction&&!database.isTransaction)throw new Error('Customer resolution requires an atomic producer transaction.');
  const normalized=customerPhone(phone);if(!normalized)return null;
  const existing=findCustomer(database,ownerId,normalized);if(existing)return existing;
  const id=randomUUID();
  customerQuery(database)('INSERT INTO customers(id,ownerId,phoneE164,createdAt) VALUES(?,?,?,?)').run(id,ownerId,normalized,createdAt);
  return {id,ownerId,phoneE164:normalized,name:null,address:null,notesJson:null,createdAt};
}
