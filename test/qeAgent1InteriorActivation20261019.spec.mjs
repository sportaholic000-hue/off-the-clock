import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,validatePricingStructuresDetailed,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {EXPECTED_QUOTE_ENGINE_VERSION} from '../server/src/runtimeConfig.js';
import {bookStatuses,bookQuoteStatuses,convertApplicationBook} from '../server/src/quoteDoneBridge.js';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';

// Independent quantities/amounts were written in EXPECTED.md before execution.
const variants=[['walls',false,false,300000],['walls-ceilings',true,false,360000],['walls-trim',false,true,320000],['full',true,true,380000]];
function input(ceiling=true,trim=true){
 const f=offeringFixture('INTERIOR_PAINTING','installed');
 f.ownerPricing.pricing.paintingSettings={wallAdditionalCoatRatio:0.8};
 Object.assign(f.customerInputs,{ceilingsIncluded:ceiling,trimIncluded:trim,ceilingCoats:2,ceilingSurfaceCondition:'fair',trimCoats:1,trimSurfaceCondition:'good'});
 if(!ceiling)for(const k of ['ceilingAreaSqft','ceilingCoats','ceilingSurfaceCondition'])delete f.customerInputs[k];
 if(!trim)for(const k of ['trimLengthLF','trimCoats','trimSurfaceCondition'])delete f.customerInputs[k];
 return f;
}
function ready(f,cents){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,cents);return q;}
function review(f,field){const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(q));assert.equal(q.midEstimate,undefined);if(field)assert.ok(q.invalidCustomerFields.includes(field),JSON.stringify(q));return q;}
for(const [name,ceiling,trim,cents] of variants)test('PI00 direct installed '+name+' has independent total and no inferred settings',()=>{
 const f=input(ceiling,trim),before=structuredClone(f);ready(f,cents);assert.deepEqual(f,before);
});
for(const coats of [1,2,3])for(const condition of ['good','fair','poor'])test('PI00 absent owner trim settings accept validated customer facts '+coats+'/'+condition,()=>{
 const f=input();Object.assign(f.customerInputs,{trimCoats:coats,trimSurfaceCondition:condition});ready(f,380000);
 assert.equal(f.ownerPricing.pricing.offeringDetails.trimFinishCoats,undefined);assert.equal(f.ownerPricing.pricing.offeringDetails.trimSurfaceCondition,undefined);
});
for(const details of [{trimFinishCoats:2},{trimSurfaceCondition:'fair'},{trimFinishCoats:2,trimSurfaceCondition:'fair'}])test('PI00 explicit trim constraints remain independent '+JSON.stringify(details),()=>{
 const f=input();Object.assign(f.ownerPricing.pricing.offeringDetails,details);Object.assign(f.customerInputs,{trimCoats:2,trimSurfaceCondition:'fair'});ready(f,380000);
 for(const [key,field,wrong] of [['trimFinishCoats','trimCoats',1],['trimSurfaceCondition','trimSurfaceCondition','poor']])if(Object.hasOwn(details,key)){
  const bad=structuredClone(f);bad.customerInputs[field]=wrong;review(bad,field);
 }
});
for(const [field,value] of [['trimCoats',0],['trimCoats',4],['trimCoats',1.5],['trimCoats','2'],['trimSurfaceCondition','unknown'],['trimSurfaceCondition',null]])test('PI00 invalid trim input still rejects '+field+'/'+value,()=>{const f=input();f.customerInputs[field]=value;if(value===null)assert.ok(review(f).missingCustomerFields.includes(field));else review(f,field);});
for(const field of ['trimCoats','trimSurfaceCondition'])test('PI00 modern required trim answer remains required '+field,()=>{const f=input();delete f.customerInputs[field];const q=review(f);assert.ok(q.missingCustomerFields.includes(field));});
for(const [key,value] of [['trimFinishCoats',0],['trimFinishCoats',1.5],['trimSurfaceCondition','unknown'],['trimSurfaceCondition',null]])test('PI00 invalid owner trim constraint still rejects '+key+'/'+value,()=>{
 const f=input();f.ownerPricing.pricing.offeringDetails[key]=value;assert.ok(validatePricingStructuresDetailed(f.serviceType,f.ownerPricing.pricing).some(d=>d.path.endsWith(key)));review(f);
});
for(const [rate,ceiling,trim] of [['installedCeilingPerSqft',false,true],['installedTrimPerLF',true,false]])test('PI00 missing optional '+rate+' blocks selected scope only',()=>{
 const f=input();delete f.ownerPricing.pricing.offeringRates[rate];delete f.ownerPricing.pricing.installedLaborPercent['offeringRates.'+rate];delete f.ownerPricing.pricing.installedMaterialsPercent['offeringRates.'+rate];review(f);
 const c=input(ceiling,trim).customerInputs;f.customerInputs=c;ready(f,ceiling?360000:320000);
});
test('PI00 missing required wall price cannot quote',()=>{const f=input();delete f.ownerPricing.pricing.offeringRates.installedWallPerSqft;delete f.ownerPricing.pricing.installedLaborPercent['offeringRates.installedWallPerSqft'];delete f.ownerPricing.pricing.installedMaterialsPercent['offeringRates.installedWallPerSqft'];review(f);});
test('PI00 complete option survives contradictory trim tier',()=>{
 const f=input();f.ownerPricing.tiers=[{name:'Complete',overrides:{}},{name:'Different trim',overrides:{offeringDetails:{trimFinishCoats:3,trimSurfaceCondition:'poor'}}}];
 assert.deepEqual(ready(f,380000).options.map(o=>[o.tierName,o.midEstimate]),[['Complete',3800]]);
});
test('PI00 original genuinely approved blocked book activates without rewriting approval or settings',()=>{
 const b=JSON.parse(readFileSync(new URL('../verification/qe-agent1-interior-activation-20261019/before-durable/approved-book.json',import.meta.url))),before=structuredClone(b);
 for(const status of [bookStatuses(b)[0],bookQuoteStatuses(b)[0]]){assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));assert.equal(status.approvalCurrent,true);}
 assert.deepEqual(b,before);assert.equal(b.services[0].pricing.offeringDetails.trimFinishCoats,undefined);assert.equal(b.services[0].pricing.offeringDetails.trimSurfaceCondition,undefined);
 assert.equal(ENGINE_VERSION,'quote-engine-vnext-geometry-20261019-v12');assert.equal(EXPECTED_QUOTE_ENGINE_VERSION,ENGINE_VERSION);
});
test('PI00 actual HTTP save, starting-value confirmation, approval and public catalog full offering',async t=>{
 const app=await application(t),owner='synthetic-a';
 const call=async(method,url,body,publicRequest=false)=>{const r=await app.request(url,{method,body,owner:publicRequest?null:owner,publicRequest});assert.equal(r.status,200,JSON.stringify(r));return r.body;};
 const f=offeringFixture('INTERIOR_PAINTING','installed'),service=structuredClone(f.ownerPricing);
 for(const key of ['origin','quoteDoneApproval','startingValueState','startingValueAdoptions','dependentLineState'])delete service[key];
 service.validationInputs=structuredClone(f.customerInputs);service.tiers=[];
 const initial=await call('GET','/api/pricebook/'+owner),converted=convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
 await call('POST','/api/pricebook/save',{...initial,services:converted.services,defaults:converted.defaults});
 let saved=await call('GET','/api/pricebook/'+owner);
 const paths=Object.keys(saved.services[0].startingValueState||{});assert.ok(paths.length,'real new-service starting values must require confirmation');
 saved.services[0].startingValueActions={confirmPaths:paths};await call('POST','/api/pricebook/save',saved);saved=await call('GET','/api/pricebook/'+owner);
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:[app.base]});
 const catalog=()=>call('GET','/api/public/quote/'+access.publicKey,undefined,true);
 assert.deepEqual((await catalog()).services,[],'save/starting confirmation must not approve');
 const before=(await call('POST','/api/pricebook/validate',saved)).statuses[0];assert.equal(before.approvalCurrent,false);
 await call('POST','/api/pricebook/services/'+saved.services[0].id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:before.confirmationFields||[]});
 saved=await call('GET','/api/pricebook/'+owner);const approved=(await call('POST','/api/pricebook/validate',saved)).statuses[0];
 assert.equal(approved.approvalCurrent,true);assert.equal(approved.status,'QUOTING LIVE');assert.deepEqual(approved.invalidOwnerFields,[]);
 assert.deepEqual((await catalog()).services.map(s=>s.serviceType),['INTERIOR_PAINTING']);
 const receipt=structuredClone(saved.services[0].quoteDoneApproval);assert.ok(receipt);
 assert.equal(saved.services[0].pricing.offeringDetails.trimFinishCoats,undefined);assert.equal(saved.services[0].pricing.offeringDetails.trimSurfaceCondition,undefined);
 await call('POST','/api/pricebook/save',saved);saved=await call('GET','/api/pricebook/'+owner);assert.deepEqual(saved.services[0].quoteDoneApproval,receipt);assert.equal((await catalog()).services.length,1);
 saved.services[0].pricing.offeringRates.installedWallPerSqft=6.01;
 await call('POST','/api/pricebook/save',saved);saved=await call('GET','/api/pricebook/'+owner);assert.deepEqual(saved.services[0].quoteDoneApproval,receipt);assert.equal((await call('POST','/api/pricebook/validate',saved)).statuses[0].approvalCurrent,false);assert.equal((await catalog()).services.length,0);
 const refused=await app.request('/api/pricebook/services/'+saved.services[0].id+'/approve',{method:'POST',body:{revision:saved.revision,confirmLegacySettings:true}});assert.equal(refused.status,400);assert.deepEqual((await call('GET','/api/pricebook/'+owner)).services[0].quoteDoneApproval,receipt);
});
