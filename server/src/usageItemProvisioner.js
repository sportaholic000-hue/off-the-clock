import {createHash} from 'node:crypto';
import {utcMilliseconds} from './usagePolicy.js';

// Checkout supports one interval. Annual subscriptions acquire their monthly
// usage item after the existing billing state has verified their payment method.
export function createUsageItemProvisioner({database,ownerQuery,stripeClient,usageConfig,clock,log}) {
  const now=()=>utcMilliseconds(clock()),query=sql=>ownerQuery(sql);
  const reference=value=>typeof value==='string'?value:value?.id;
  function mark(ownerId,subscriptionId,status,error=null,next=now()) {
    query('UPDATE voiceUsageItemProvisioning SET status=?,lastErrorCode=?,nextAttemptMs=?,leaseUntilMs=NULL,updatedAt=? WHERE ownerId=? AND stripeSubscriptionId=?')
      .run(status,error,next,new Date(now()).toISOString(),ownerId,subscriptionId);
  }
  async function ensureMonthlyItem(ownerId,subscription) {
    const account=query('SELECT ownerId,stripeCustomerId,stripeSubscriptionId,stripePriceId,paymentMethodVerifiedAt FROM billingAccounts WHERE ownerId=?').get(ownerId);
    const base=usageConfig.basePrices[account?.stripePriceId];
    const items=subscription.items?.data;
    if(!account?.paymentMethodVerifiedAt || subscription.id!==account.stripeSubscriptionId ||
       reference(subscription.customer)!==account.stripeCustomerId || subscription.livemode!==usageConfig.livemode ||
       !Array.isArray(items) || subscription.items.has_more) throw Error('USAGE_ITEM_BINDING_INVALID');
    const meters=items.filter(item=>reference(item.price)===usageConfig.priceId);
    if(meters.length===1) {
      mark(ownerId,subscription.id,'READY');return subscription;
    }
    if(meters.length!==0 || base?.interval!=='annual' || subscription.billing_mode?.type!=='flexible' ||
       !['trialing','active','past_due'].includes(subscription.status) ||
       items.filter(item=>reference(item.price)===account.stripePriceId).length!==1) return subscription;
    const claim=database.transaction(()=>{
      const at=now(),iso=new Date(at).toISOString();
      const idempotencyKey='otc_usage_item_'+createHash('sha256').update(JSON.stringify([ownerId,subscription.id,usageConfig.priceId])).digest('hex');
      query(`INSERT OR IGNORE INTO voiceUsageItemProvisioning(ownerId,stripeSubscriptionId,stripeCustomerId,stripePriceId,
        idempotencyKey,status,nextAttemptMs,createdAt,updatedAt) VALUES(?,?,?,?,?,'PENDING',?,?,?)`)
        .run(ownerId,subscription.id,account.stripeCustomerId,usageConfig.priceId,idempotencyKey,at,iso,iso);
      const job=query('SELECT * FROM voiceUsageItemProvisioning WHERE ownerId=? AND stripeSubscriptionId=?').get(ownerId,subscription.id);
      if(job.stripePriceId!==usageConfig.priceId || job.stripeCustomerId!==account.stripeCustomerId) {
        mark(ownerId,subscription.id,'REVIEW','USAGE_ITEM_CONFIG_CHANGED');log('USAGE_ITEM_CONFIG_CHANGED');return null;
      }
      if(job.status==='REVIEW')return null;
      if(job.status==='READY') {
        mark(ownerId,subscription.id,'REVIEW','VERIFIED_USAGE_ITEM_REMOVED');log('VERIFIED_USAGE_ITEM_REMOVED');return null;
      }
      if(job.firstAttemptMs!==null && at-job.firstAttemptMs>=23*3600000) {
        mark(ownerId,subscription.id,'REVIEW','USAGE_ITEM_IDEMPOTENCY_EXPIRED');log('USAGE_ITEM_IDEMPOTENCY_EXPIRED');return null;
      }
      if(job.nextAttemptMs>at || job.status==='SENDING' && job.leaseUntilMs>at)return null;
      query(`UPDATE voiceUsageItemProvisioning SET status='SENDING',firstAttemptMs=COALESCE(firstAttemptMs,?),
        attempts=attempts+1,leaseUntilMs=?,updatedAt=? WHERE ownerId=? AND stripeSubscriptionId=?`)
        .run(at,at+120000,iso,ownerId,subscription.id);
      return job;
    }).immediate();
    if(!claim)return subscription;
    try {
      await stripeClient.subscriptionItems.create({subscription:subscription.id,price:usageConfig.priceId,proration_behavior:'none'},
        {idempotencyKey:claim.idempotencyKey});
      const verified=await stripeClient.subscriptions.retrieve(subscription.id,{expand:['items.data.price']});
      if(verified.id!==account.stripeSubscriptionId || reference(verified.customer)!==account.stripeCustomerId ||
         verified.livemode!==usageConfig.livemode || verified.items?.has_more ||
         verified.items?.data?.filter(item=>reference(item.price)===usageConfig.priceId).length!==1) {
        mark(ownerId,subscription.id,'REVIEW','USAGE_ITEM_RECEIPT_MISMATCH');log('USAGE_ITEM_RECEIPT_MISMATCH');return subscription;
      }
      mark(ownerId,subscription.id,'READY');return verified;
    } catch {
      mark(ownerId,subscription.id,'RETRY','USAGE_ITEM_SETUP_FAILED',now()+30000);log('USAGE_ITEM_SETUP_FAILED');return subscription;
    }
  }
  return {ensureMonthlyItem};
}

