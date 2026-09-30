import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

// Expected totals are independently calculated in configuredOfferings.spec.mjs.
export const offeringCases=[['FENCING_INSTALL','installed',4500],['FENCING_INSTALL','itemized',3920],['FENCING_REPLACEMENT','installed',4900],['FENCING_REPLACEMENT','itemized',4320],['INTERIOR_PAINTING','installed',3800],['INTERIOR_PAINTING','itemized',2524],['EXTERIOR_PAINTING','installed',3000],['EXTERIOR_PAINTING','itemized',1794]];
export async function offeringApplicationFixture(app,label,origin) {
  const owner=await app.owner(label);
  async function call(method,url,body,status=200,token=owner.token,headers={}) {
    const response=await app.request(method,url,body,token,headers);
    assert.equal(response.status,status,JSON.stringify(response));return response.result;
  }
  let book=await call('GET','/api/pricebook/'+owner.id);
  book.defaults=structuredClone(offeringFixture('FENCING_INSTALL','installed').businessDefaults);
  const cases=offeringCases.map(([type,mode,expected])=>{
    const f=offeringFixture(type,mode),id=crypto.randomUUID(),name='[SYNTHETIC] '+type+' '+mode;
    const knownOfferings=type.startsWith('FENCING_')?{fenceType:{wood:crypto.randomUUID()}}:{};
    const service={id,serviceType:type,service:name,source:'MANUAL',active:true,pricing:{minimumJob:0,offeringMode:mode,offeringDetails:f.ownerPricing.pricing.offeringDetails,offeringRates:Object.fromEntries(Object.entries(f.ownerPricing.pricing.offeringRates).map(([k,v])=>[k,v/100]))},knownOfferings,feeRules:f.ownerPricing.feeRules,priceBasisByCategory:f.ownerPricing.priceBasisByCategory,taxabilityByCategory:f.ownerPricing.taxabilityByCategory};
    const inputs=structuredClone(f.customerInputs);
    if(type.startsWith('FENCING_'))inputs.confirmedFacts={fenceType:{status:'identified',field:'fenceType',value:'wood',offeringId:knownOfferings.fenceType.wood}};
    return {type,mode,expected,id,name,service,inputs};
  });
  book.services=cases.map(entry=>entry.service);
  await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
  for(const service of book.services){const receipt=await call('POST','/api/pricebook/services/'+service.id+'/approve',{revision:book.revision,confirmConfiguration:true});book.revision=receipt.revision;}
  book=await call('GET','/api/pricebook/'+owner.id);
  const access=await call('POST','/api/quotedone/access',{allowedOrigins:[origin]});
  return {owner,book,cases,access,call,headers:{Origin:origin},url:'/api/public/quote/'+access.publicKey,
    submission:entry=>({serviceId:entry.id,serviceRequest:entry.name,customerInputs:structuredClone(entry.inputs),contact:{email:'synthetic-offering@example.invalid'},requestId:crypto.randomUUID(),intakeFlow:'job-details-v1'})};
}
