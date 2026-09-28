import assert from 'node:assert/strict';
import crypto from 'node:crypto';

export async function mowingFixture(app,label,origins=['http://127.0.0.1:4492']) {
  const owner=await app.owner(label);
  const call=async(method,url,body,status=200,token=owner.token,headers={})=>{
    const reply=await app.request(method,url,body,token,headers);
    assert.equal(reply.status,status,JSON.stringify(reply));return reply.result;
  };
  const meta=await call('GET','/api/pricebook/meta'),map=value=>Object.fromEntries(meta.categories.map(key=>[key,value]));
  const id=crypto.randomUUID(),book=await call('GET','/api/pricebook/'+owner.id);
  book.defaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
  book.services=[{id,serviceType:'LANDSCAPING_MOWING',service:'[SYNTHETIC] Mowing',source:'MANUAL',active:true,priceBasisByCategory:map('cost'),taxabilityByCategory:map(false),feeRules:Object.fromEntries(meta.feeNames.map(k=>[k,'not_applicable'])),pricing:{mowingBaseRatePerSqft:.005,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}}}];
  const read=()=>call('GET','/api/pricebook/'+owner.id);
  const approve=async()=>call('POST','/api/pricebook/services/'+id+'/approve',{revision:(await read()).revision,confirmConfiguration:true});
  await call('POST','/api/pricebook/save',book);await approve();
  const access=await call('POST','/api/quotedone/access',{allowedOrigins:origins});
  const url='/api/public/quote/'+access.publicKey,headers={Origin:origins[0]};
  const inputs={yardSqft:10000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false};
  const submission=extra=>({requestId:crypto.randomUUID(),serviceId:id,serviceRequest:'[SYNTHETIC] Mowing',customerInputs:structuredClone(inputs),contact:{email:'synthetic@example.invalid'},...extra});
  return {owner,id,call,read,approve,meta,access,url,headers,inputs,submission};
}
