import assert from 'node:assert/strict';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
export async function scopeApplicationFixture(app,label,origin,group){
 const owner=await app.owner(label),call=async(method,url,body)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,200,JSON.stringify(r));return r.result;};
 const prefixes={floor:['floor-','stairs-','overlay-'],siding:['siding-'],concrete:['demolition-','exposed-'],roof:['commercial-','roof-'],paint:['paint-']};
 assert.ok(prefixes[group]);
 const samples=measuredScopeCases().filter(f=>prefixes[group].some(prefix=>f.id.startsWith(prefix)));
 const cases=samples.map(f=>{
  const service=convertApplicationBook({services:[f.input.ownerPricing],defaults:f.input.businessDefaults},'toDollars').services[0];
  delete service.origin;delete service.confirmedFields;delete service.approvedValues;service.service='[SYNTHETIC] '+f.id;
  return {id:service.id,name:service.service,type:service.serviceType,expected:f.expected.cents/100,service,inputs:f.input.customerInputs};
 });
 const book=await call('GET','/api/pricebook/'+owner.id);book.defaults=convertApplicationBook({services:[],defaults:samples[0].input.businessDefaults},'toDollars').defaults;
 book.services=cases.map(c=>{const s=structuredClone(c.service);delete s.pricing.scopeDetails;delete s.pricing.scopeRates;return s;});
 await call('POST','/api/pricebook/save',book);
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:[origin]});
 return {owner,book,cases,access,call,headers:{Origin:origin},url:'/api/public/quote/'+access.publicKey};
}
