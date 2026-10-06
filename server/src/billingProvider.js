import crypto from 'node:crypto';

export const BILLING_PROVIDER_OPTIONS = Object.freeze({timeout:10000,maxNetworkRetries:0});
export function billingProviderError(code='BILLING_PROVIDER_ERROR') {
  return Object.assign(new Error('Billing evidence could not be reconciled.'),{code,statusCode:code==='BILLING_OPERATION_IN_PROGRESS'?409:502});
}
// The provider call is outside SQLite's transaction. A durable owner lease and
// fencing token prevent a late response from committing after another process
// has reclaimed the operation. Local timeout never proves provider failure.
export async function withBillingLease(db,ownerId,work,{clock=()=>new Date(),leaseMs=120000}={}) {
  const token=crypto.randomUUID(),at=clock().toISOString();
  const expiresAt=new Date(clock().getTime()+leaseMs).toISOString();
  const result=db.prepare(`INSERT INTO billingOperationLeases(ownerId,token,expiresAt) VALUES(?,?,?)
    ON CONFLICT(ownerId) DO UPDATE SET token=excluded.token,expiresAt=excluded.expiresAt
    WHERE billingOperationLeases.expiresAt<=?`).run(ownerId,token,expiresAt,at);
  if (!Number(result.changes)) throw billingProviderError('BILLING_OPERATION_IN_PROGRESS');
  const assertLease=()=>{
    const current=db.prepare('SELECT token,expiresAt FROM billingOperationLeases WHERE ownerId=?').get(ownerId);
    if (current?.token!==token || current.expiresAt<=clock().toISOString()) throw billingProviderError('BILLING_LEASE_LOST');
  };
  try {return await work(assertLease);}
  finally {db.prepare('DELETE FROM billingOperationLeases WHERE ownerId=? AND token=?').run(ownerId,token);}
}
export async function billingProviderRead(call) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(call),new Promise((_,reject)=>{timer=setTimeout(()=>reject(billingProviderError()),BILLING_PROVIDER_OPTIONS.timeout);})]);
  } finally {clearTimeout(timer);}
}
