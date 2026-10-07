import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import Stripe from 'stripe';
import {fixture,A,START} from './overageMinute20261006Fixture.mjs';
import {createStripeOverageProvider} from '../server/src/billingOverageProvider.js';
import {createBillingMinuteService} from '../server/src/billingMinuteService.js';
import {monthlyAnniversary} from '../server/src/billingUsagePolicy.js';

test('real Stripe SDK serializes one 35-cent monthly usage invoice against a loopback fake provider',async t=>{
  const h=fixture(t);h.activate(A,{interval:'annual'});h.call(301*60);h.setTime(monthlyAnniversary(START,1));const requests=[];
  const server=createServer(async(req,res)=>{
    try{
      let raw='';for await(const bytes of req)raw+=bytes;
      const url=new URL(req.url,'http://127.0.0.1'),form=new URLSearchParams(raw||url.search),p={};
      for(const [k,v] of form){const nested=k.match(/^(metadata|period)\[([^\]]+)\]$/);if(nested){p[nested[1]]??={};p[nested[1]][nested[2]]=nested[1]==='period'?Number(v):v;}else p[k]=['amount','limit'].includes(k)?Number(v):['auto_advance','discountable'].includes(k)?v==='true':v;}
      requests.push({method:req.method,path:url.pathname,p,key:req.headers['idempotency-key']});const sdk=h.fakes.stripe,o={idempotencyKey:req.headers['idempotency-key']};let result;
      if(url.pathname.startsWith('/v1/prices/'))result=await sdk.prices.retrieve(url.pathname.split('/').at(-1));
      else if(url.pathname.startsWith('/v1/subscriptions/'))result=await sdk.subscriptions.retrieve(url.pathname.split('/').at(-1));
      else if(url.pathname==='/v1/invoices')result=req.method==='POST'?await sdk.invoices.create(p,o):await sdk.invoices.list(p);
      else if(url.pathname==='/v1/invoiceitems')result=req.method==='POST'?await sdk.invoiceItems.create(p,o):await sdk.invoiceItems.list(p);
      else if(url.pathname.endsWith('/finalize'))result=await sdk.invoices.finalizeInvoice(url.pathname.split('/').at(-2),p,o);
      else if(url.pathname.startsWith('/v1/invoices/'))result=await sdk.invoices.retrieve(url.pathname.split('/').at(-1));
      else throw Error('Unexpected fake provider route');
      res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(result));
    }catch(e){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:e.message}}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const stripe=new Stripe('sk_test_SYNTHETIC_ONLY',{host:'127.0.0.1',port:server.address().port,protocol:'http',maxNetworkRetries:0});
  const service=createBillingMinuteService({...h.options,paymentProvider:createStripeOverageProvider({stripeClient:stripe})});await service.processOwner(A);await service.processOwner(A);
  assert.equal(h.fakes.invoices.size,1);assert.equal(h.fakes.items.size,1);assert.equal([...h.fakes.items.values()][0].amount,35);
  const writes=requests.filter(r=>r.method==='POST');assert.equal(writes.length,3);assert.ok(writes.every(r=>r.key));assert.equal(writes[0].p.auto_advance,false);assert.equal(writes[0].p.pending_invoice_items_behavior,'exclude');assert.equal(writes[0].p.subscription,undefined);assert.equal(writes[1].p.discountable,false);assert.equal(writes[2].p.auto_advance,true);
});
