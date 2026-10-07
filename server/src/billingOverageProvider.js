import {billingProviderRead,BILLING_PROVIDER_OPTIONS,billingProviderError} from './billingProvider.js';
import {MINUTE_PLANS} from './billingUsagePolicy.js';
const reference=value=>typeof value==='string'?value:value?.id;
const fail=()=>billingProviderError('BILLING_OVERAGE_CONFIRMATION_REQUIRED');

// A separate monthly usage invoice keeps annual base payments annual. Every
// remote mutation is journalled by the service before this adapter executes it.
export function createStripeOverageProvider({stripeClient:stripe}={}) {
  if(!stripe)return null;
  const read=fn=>billingProviderRead(fn);
  async function listAll(list,params){
    let after;const rows=[];const cursors=new Set();
    for(let page=0;page<100;page++){
      const result=await read(()=>list({...params,limit:100,...(after?{starting_after:after}:{})},BILLING_PROVIDER_OPTIONS));
      if(!Array.isArray(result?.data)||typeof result.has_more!=='boolean')throw fail();rows.push(...result.data);
      if(!result.has_more)return rows;
      after=result.data.at(-1)?.id;if(!after||cursors.has(after))throw fail();cursors.add(after);
    }
    throw fail(); // An incomplete read never authorizes another invoice/item.
  }
  return {async submit(period,charge,journal){
    const metadata={otc_usage_period:period.id,otc_usage_digest:charge.usageDigest};
    const validInvoice=invoice=>{
      if(!invoice?.id||reference(invoice.customer)!==period.stripeCustomerId||invoice.metadata?.otc_usage_period!==period.id||invoice.metadata?.otc_usage_digest!==charge.usageDigest)throw fail();return invoice;
    };
    const invoices=charge.providerInvoiceId?[]:await listAll((...args)=>stripe.invoices.list(...args),{customer:period.stripeCustomerId});
    const found=invoices.filter(i=>i.metadata?.otc_usage_period===period.id);
    if(found.length>1)throw fail();
    let invoice=charge.providerInvoiceId
      ? validInvoice(await read(()=>stripe.invoices.retrieve(charge.providerInvoiceId,{},BILLING_PROVIDER_OPTIONS)))
      : found.length?validInvoice(found[0]):null;
    const price=await read(()=>stripe.prices.retrieve(period.stripePriceId,{},BILLING_PROVIDER_OPTIONS));
    const expected=MINUTE_PLANS[period.plan][period.billingInterval==='annual'?'annualCents':'monthlyCents'];
    if(price?.id!==period.stripePriceId||price.unit_amount!==expected||!['cad','usd'].includes(price.currency)||
      price.recurring?.interval!==(period.billingInterval==='annual'?'year':'month')||(price.recurring.interval_count??1)!==1)throw fail();
    if(invoice&&invoice.currency!==price.currency)throw fail();
    if(!invoice){
      const subscription=await read(()=>stripe.subscriptions.retrieve(period.stripeSubscriptionId,{},BILLING_PROVIDER_OPTIONS));
      if(subscription?.id!==period.stripeSubscriptionId||reference(subscription.customer)!==period.stripeCustomerId)throw fail();
      const paymentMethod=reference(subscription.default_payment_method);
      invoice=validInvoice(await journal.mutate('invoice',()=>stripe.invoices.create({
        customer:period.stripeCustomerId,currency:price.currency,collection_method:'charge_automatically',
        auto_advance:false,pending_invoice_items_behavior:'exclude',discounts:'',metadata,
        description:`Voice minute overage ${period.startAt.slice(0,10)} to ${period.endAt.slice(0,10)}`,
        ...(paymentMethod?{default_payment_method:paymentMethod}:{})
      },{...BILLING_PROVIDER_OPTIONS,idempotencyKey:'minute-invoice-'+period.id})));
    }
    journal.save({providerInvoiceId:invoice.id,currency:price.currency});
    const items=await listAll((...args)=>stripe.invoiceItems.list(...args),{invoice:invoice.id});
    if(items.length>1)throw fail();
    let item=items[0];
    if(!item){
      if(invoice.status!=='draft')throw fail();
      item=await journal.mutate('item',()=>stripe.invoiceItems.create({customer:period.stripeCustomerId,invoice:invoice.id,
        amount:charge.amountCents,currency:price.currency,discountable:false,metadata,
        period:{start:Math.floor(Date.parse(period.startAt)/1000),end:Math.floor(Date.parse(period.endAt)/1000)},
        description:`${charge.minutesUsed-MINUTE_PLANS[period.plan].included} extra voice minutes at $0.35/min`
      },{...BILLING_PROVIDER_OPTIONS,idempotencyKey:'minute-item-'+period.id}));
    }
    if(!item?.id||reference(item.customer)!==period.stripeCustomerId||reference(item.invoice)!==invoice.id||
      item.metadata?.otc_usage_period!==period.id||item.metadata?.otc_usage_digest!==charge.usageDigest||item.amount!==charge.amountCents||item.currency!==price.currency)throw fail();
    journal.save({providerItemId:item.id});
    invoice=validInvoice(await read(()=>stripe.invoices.retrieve(invoice.id,{},BILLING_PROVIDER_OPTIONS)));
    if(invoice.subtotal!==charge.amountCents||invoice.currency!==price.currency)throw fail();
    if(invoice.status==='draft')invoice=validInvoice(await journal.mutate('finalize',()=>stripe.invoices.finalizeInvoice(invoice.id,{auto_advance:true},{...BILLING_PROVIDER_OPTIONS,idempotencyKey:'minute-finalize-'+period.id}),{resourceUpdate:true}));
    if(!['open','paid'].includes(invoice.status)||invoice.subtotal!==charge.amountCents)throw fail();
    return {status:invoice.status==='paid'?'PAID':'SUBMITTED',providerInvoiceId:invoice.id};
  }};
}
