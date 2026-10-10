import {usageOwnerQuery} from './billingUsagePolicy.js';
import crypto from 'node:crypto';

export const BILLING_PROVIDER_OPTIONS = Object.freeze({timeout:10000,maxNetworkRetries:0});
export function billingProviderError(code='BILLING_PROVIDER_ERROR') {
  return Object.assign(new Error('Billing evidence could not be reconciled.'),{code,statusCode:code==='BILLING_OPERATION_IN_PROGRESS'?409:502});
}
// The provider call is outside SQLite's transaction. A durable owner lease and
// fencing token prevent a late response from committing after another process
// has reclaimed the operation. Local timeout never proves provider failure.
export function withBillingLease(db,ownerId,work,options={}) {
  return withOwnerLease(db,ownerId,work,'billingOperationLeases',options);
}
// Retention deadlines must progress while a financial-provider read holds its
// own lease. Keep independent fencing for phone/data cleanup across processes.
export function withBillingRetentionLease(db,ownerId,work,options={}) {
  return withOwnerLease(db,ownerId,work,'billingRetentionLeases',{...options,renew:true});
}
async function withOwnerLease(db,ownerId,work,table,{clock=()=>new Date(),leaseMs=120000,renew=false}={}) {
  const token=crypto.randomUUID(),at=clock().toISOString();
  const expiresAt=new Date(clock().getTime()+leaseMs).toISOString();
  const result=usageOwnerQuery(db)(`INSERT INTO ${table}(ownerId,token,expiresAt) VALUES(?,?,?)
    ON CONFLICT(ownerId) DO UPDATE SET token=excluded.token,expiresAt=excluded.expiresAt
    WHERE ${table}.expiresAt<=?`).run(ownerId,token,expiresAt,at);
  if (!Number(result.changes)) throw billingProviderError('BILLING_OPERATION_IN_PROGRESS');
  const assertLease=()=>{
    const current=usageOwnerQuery(db)(`SELECT token,expiresAt FROM ${table} WHERE ownerId=?`).get(ownerId);
    if (current?.token!==token || current.expiresAt<=clock().toISOString()) throw billingProviderError('BILLING_LEASE_LOST');
  };
  // Redacting retained archives can take longer than one provider request.
  // Renew only the separate retention lease, never the financial mutation lease.
  const timer=renew?setInterval(()=>{
    try{assertLease();usageOwnerQuery(db)(`UPDATE ${table} SET expiresAt=? WHERE ownerId=? AND token=?`)
      .run(new Date(clock().getTime()+leaseMs).toISOString(),ownerId,token);}catch{/* Fencing remains authoritative. */}
  },Math.max(10,Math.floor(leaseMs/3))):null;
  timer?.unref?.();
  try {return await work(assertLease);}
  finally {clearInterval(timer);usageOwnerQuery(db)(`DELETE FROM ${table} WHERE ownerId=? AND token=?`).run(ownerId,token);}
}
export async function billingProviderRead(call) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(call),new Promise((_,reject)=>{timer=setTimeout(()=>reject(billingProviderError()),BILLING_PROVIDER_OPTIONS.timeout);})]);
  } catch(error) {
    if (error?.code?.startsWith('BILLING_')) throw error;
    throw billingProviderError();
  } finally {clearTimeout(timer);}
}
