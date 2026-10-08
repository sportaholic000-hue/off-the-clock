import {randomUUID} from 'node:crypto';
import {createTransactionalEmailSender} from './email.js';
import {usageOwnerQuery,usageTransaction} from './billingUsagePolicy.js';

const RETRY_WINDOW_MS=23*60*60*1000;
export function createOwnerEmailProvider({environment=process.env,fetchClient=globalThis.fetch}={}) {
  const send=createTransactionalEmailSender({environment,fetchClient});
  return {send,async read(id){
    if(environment.EMAIL_PROVIDER!=='resend'||environment.EMAIL_DELIVERY_ENABLED!=='true'||!environment.RESEND_API_KEY)throw Error('Email unavailable.');
    const response=await fetchClient('https://api.resend.com/emails/'+encodeURIComponent(id),{method:'GET',redirect:'error',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+environment.RESEND_API_KEY}});
    if(!response.ok)throw Error('Email receipt unavailable.');
    return response.json();
  }};
}
export function createOwnerEmailDelivery({database,ownerQuery,provider,enabled=()=>false,clock=()=>new Date()}={}) {
  const query=usageOwnerQuery(database,ownerQuery),now=()=>clock().toISOString();
  function queue({id,ownerId,message,unpaidInvoiceId=null,at=now()}) {
    query(`INSERT OR IGNORE INTO ownerEmailDeliveries(id,ownerId,messageJson,unpaidInvoiceId,nextAttemptAt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?)`)
      .run(id,ownerId,JSON.stringify(message),unpaidInvoiceId,at,at,at);
  }
  async function deliverOne(ownerId) {
    if(!enabled()||!provider)return false;
    const row=usageTransaction(database,()=>{
      const current=query(`SELECT * FROM ownerEmailDeliveries WHERE ownerId=? AND suppressedAt IS NULL AND nextAttemptAt<=? AND
        (status IN ('PENDING','ACCEPTED') OR status='SENDING' AND leaseUntil<=?) ORDER BY createdAt,id LIMIT 1`).get(ownerId,now(),now());
      if(!current)return null;
      const token=randomUUID();query(`UPDATE ownerEmailDeliveries SET status='SENDING',leaseToken=?,leaseUntil=?,attempts=attempts+1,updatedAt=? WHERE ownerId=? AND id=?`)
        .run(token,new Date(clock().getTime()+120000).toISOString(),now(),ownerId,current.id);
      return {...current,leaseToken:token};
    });
    if(!row)return false;
    const save=(status,{id=row.providerId,error=null,delay=60000}={})=>usageTransaction(database,()=>{
      const updated=query(`UPDATE ownerEmailDeliveries SET status=?,providerId=?,lastError=?,nextAttemptAt=?,leaseToken=NULL,leaseUntil=NULL,updatedAt=?
        WHERE ownerId=? AND id=? AND leaseToken=?`).run(status,id,error,new Date(clock().getTime()+delay).toISOString(),now(),ownerId,row.id,row.leaseToken);
      if(status==='DELIVERED'&&Number(updated.changes))query("UPDATE outboxEvents SET status='DELIVERED',updatedAt=? WHERE ownerId=? AND id=? AND eventType IN ('billing.minute_warning','billing.lifecycle_notice')").run(now(),ownerId,row.id);
      return updated;
    });
    const message=JSON.parse(row.messageJson);
    try{
      if(row.providerId){
        const receipt=await provider.read(row.providerId);
        if(receipt.id!==row.providerId||!Array.isArray(receipt.to)||receipt.to.length!==1||receipt.to[0]!==message.to||receipt.subject!==message.subject)throw Error('Email receipt mismatch.');
        if(['delivered','opened','clicked'].includes(receipt.last_event))save('DELIVERED');
        else if(['bounced','complained','failed','suppressed'].includes(receipt.last_event))save('BOUNCED',{error:'EMAIL_DELIVERY_FAILED'});
        else save('ACCEPTED');
        return true;
      }
      if(row.firstAttemptAt&&clock().getTime()-Date.parse(row.firstAttemptAt)>=RETRY_WINDOW_MS){save('REVIEW',{error:'EMAIL_CONFIRMATION_REQUIRED'});return true;}
      const owner=query("SELECT email FROM users WHERE id=@ownerId AND role='owner'").get({ownerId});
      if(owner?.email!==message.to){save('REVIEW',{error:'OWNER_EMAIL_CHANGED'});return true;}
      // Settlement may have happened after the notice was queued, including in
      // another worker. Recheck at the final synchronous boundary before send.
      if(row.unpaidInvoiceId&&query('SELECT status FROM billingInvoiceEvidence WHERE ownerId=? AND stripeInvoiceId=?').get(ownerId,row.unpaidInvoiceId)?.status==='PAID'){
        usageTransaction(database,()=>{
          const suppressed=query("UPDATE ownerEmailDeliveries SET status='REVIEW',suppressedAt=?,lastError=NULL,leaseToken=NULL,leaseUntil=NULL,updatedAt=? WHERE ownerId=? AND id=? AND leaseToken=? AND providerId IS NULL")
            .run(now(),now(),ownerId,row.id,row.leaseToken);
          if(Number(suppressed.changes))query("UPDATE outboxEvents SET status='CANCELLED',updatedAt=? WHERE ownerId=? AND id=? AND eventType='billing.lifecycle_notice'").run(now(),ownerId,row.id);
        });return true;
      }
      query('UPDATE ownerEmailDeliveries SET firstAttemptAt=COALESCE(firstAttemptAt,?) WHERE ownerId=? AND id=? AND leaseToken=?').run(now(),ownerId,row.id,row.leaseToken);
      const receipt=await provider.send({...message,idempotencyKey:'minute-alert/'+row.id});
      if(receipt?.simulated||receipt?.accepted!==true||typeof receipt.id!=='string'||!receipt.id)throw Error('Email acceptance unconfirmed.');
      save('ACCEPTED',{id:receipt.id,delay:0});
    }catch(error){
      if(error?.code==='EMAIL_NOT_CONFIGURED'&&!row.firstAttemptAt)query('UPDATE ownerEmailDeliveries SET firstAttemptAt=NULL WHERE ownerId=? AND id=? AND leaseToken=? AND providerId IS NULL').run(ownerId,row.id,row.leaseToken);
      save(row.providerId?'ACCEPTED':'PENDING',{error:'EMAIL_CONFIRMATION_PENDING'});
    }
    return true;
  }
  return {queue,deliverOne};
}
