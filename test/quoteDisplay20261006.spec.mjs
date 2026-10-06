import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {roofingDisplayFixture,mowingDisplayFixture,missingFloorDisplayFixture,savedDisplayFixture} from './quoteDisplayFixtures20261006.mjs';
import {renderDisplay} from './quoteDisplayRender20261006.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {reviewLabel} from '../client/src/pricebookReview.js';
import {bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {conciseVoiceSummary} from '../server/src/voice/voiceQuotePresentation.js';
import {quoteMoneyFormatter} from '../server/quoteMoneyFormat.js';

// All expected dollars predate execution: specs/QUOTE_DISPLAY_DEFECTS_20261006.md.
test('display: public roofing accepts the phone product names with explicit confirmation and totals $2520',async()=>{
 const f=roofingDisplayFixture(),a=savedDisplayFixture(f),inputs={...f.customerInputs,existingRoofType:'Asphalt shingle',replacementRoofType:'Asphalt shingle'};delete inputs.confirmedFacts;
 const html=await renderDisplay('products',{fields:a.definition.customerFields.filter(f=>f.type==='slug'),value:inputs,knownOfferings:a.service.knownOfferings,onChange:()=>{}});
 assert.ok(html.includes('value="Asphalt shingle"'));assert.ok(!html.includes('<option value="asphalt_shingle"'));
 assert.equal((html.match(/I have identified this exact offering\./g)||[]).length,2);
 assert.ok(!html.includes('checked=""'),'typing alone must not confirm the product');
 const bound=bindVoiceQuoteInputs(a.service,a.definition,{customerInputs:inputs,productConfirmations:{existingRoofType:true,replacementRoofType:true}});
 assert.deepEqual(bound.followUps,[]);const q=a.quote(bound.customerInputs).customerResult;
 assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,2520);
 assert.equal(a.quote(inputs).customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('display: production status and preview use the editor label for a missing product price',async()=>{
 const f=missingFloorDisplayFixture(),a=savedDisplayFixture(f,{approve:false});
 const meta=bridge.applicationMetadata().services.find(s=>s.serviceType===f.serviceType);
 const expected=reviewLabel('materialPerSqft.tile',a.service,meta);
 assert.ok(expected.includes('Tile'));assert.ok(!expected.includes('materialPerSqft'));
 for(const response of [a.status,a.preview(f.customerInputs)]){
  const index=response.missingOwnerFields.indexOf('materialPerSqft.tile');assert.ok(index>=0);
  assert.equal(response.missingOwnerLabels?.[index],expected);
 }
 const html=await renderDisplay('preview',{preview:a.preview(f.customerInputs)});
 assert.ok(html.includes(expected));
});

test('display: minimum-bound taxed mowing is a single $172.50 on all four surfaces',async()=>{
 const f=mowingDisplayFixture(),a=savedDisplayFixture(f),result=a.quote(f.customerInputs).customerResult,preview=a.preview(f.customerInputs);
 assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.deepEqual([result.lowEstimate,result.midEstimate,result.highEstimate],[172.5,172.5,172.5]);
 for(const [surface,data] of [['customer',{result}],['records',{rows:[{id:'synthetic-mowing',result}],kind:'quotes'}],['preview',{preview}]]){
  const html=await renderDisplay(surface,data);assert.ok(html.includes('$172.50'),surface);assert.ok(!html.includes('$172.5<')&&!html.includes('$172.5 '),surface);
  if(surface==='preview')assert.ok(!html.includes('quote-dash')&&!html.includes('quote-high'),'equal endpoints have one price');
 }
 const phone=conciseVoiceSummary(result);assert.ok(phone.includes('$172.50 CAD per visit. Includes applicable tax.'));assert.ok(!phone.includes('..'));
});

export const productCases=bridge.applicationMetadata().services.flatMap(service=>service.customerFields.filter(field=>field.type==='slug').map(field=>({serviceType:service.serviceType,field})));
for(const {serviceType,field} of productCases)test(`display: registered human choices and phone binding — ${serviceType}.${field.name}`,async()=>{
 const id='00000000-0000-4000-8000-000000000001',knownOfferings={[field.name]:{epinette_cedar:id,other_product:'00000000-0000-4000-8000-000000000002'}};
 const value={[field.name]:'Épinette cedar'},html=await renderDisplay('products',{fields:[field],value,knownOfferings,onChange:()=>{}});
 assert.ok(html.includes('<option value="Epinette cedar"'));assert.ok(html.includes('<option value="Other product"'));assert.ok(!html.includes('value="epinette_cedar"'));
 assert.ok(html.includes('I have identified this exact offering.'));assert.ok(!html.includes('checked=""'));
 const args={customerInputs:value,productConfirmations:{[field.name]:true}},bound=bindVoiceQuoteInputs({knownOfferings},{customerFields:[field]},args);
 assert.deepEqual(bound.followUps,[]);assert.equal(bound.customerInputs[field.name],'epinette_cedar');assert.equal(bound.customerInputs.confirmedFacts[field.name].offeringId,id);
 const unknown=await renderDisplay('products',{fields:[field],value:{[field.name]:'Unregistered product'},knownOfferings,onChange:()=>{}});
 assert.ok(!unknown.includes('type="checkbox"'));assert.equal(bindVoiceQuoteInputs({knownOfferings},{customerFields:[field]},{...args,customerInputs:{[field.name]:'Unregistered product'}}).followUps.length,1);
 const stale=await renderDisplay('products',{fields:[field],value:{[field.name]:'epinette_cedar',confirmedFacts:{[field.name]:{value:'epinette_cedar',status:'identified',offeringId:'retired-id'}}},knownOfferings,onChange:()=>{}});
 assert.ok(!stale.includes('checked=""'),'a replacement registration needs fresh confirmation');
});

test('display: product and failed-tier production diagnostics share editor labels',()=>{
 const f=missingFloorDisplayFixture();f.ownerPricing.tiers=[{name:'Unpriced',overrides:{}},{name:'Complete',overrides:{materialPerSqft:{tile:500}}}];
 const a=savedDisplayFixture(f,{approve:false}),expected='Material price per square foot by flooring type. · Tile';
 for(const row of [...a.status.failedTierDiagnostics,...a.status.productCoverage].filter(row=>row.tierName==='Unpriced')){
  assert.deepEqual(row.missingOwnerFields,['materialPerSqft.tile']);assert.deepEqual(row.missingOwnerLabels,[expected]);
 }
 assert.equal(a.status.productCoverage.find(row=>row.tierName==='Complete').configurationComplete,true);
});

test('display: money groups retain cents and separators and reject malformed amounts',()=>{
 for(const [amounts,expected] of [[[4621.5,4621.5],'$4,621.50'],[[172.5,200],'$172.50 – $200.00'],[[2520,3000],'$2,520 – $3,000'],[[0,0.5],'$0.00 – $0.50']]){
  assert.equal(quoteMoneyFormatter(amounts).range(...amounts),expected);
 }
 assert.equal(quoteMoneyFormatter([172.5,200]).amount(200),'$200.00');
 assert.equal(quoteMoneyFormatter([2520]).amount(2520),'$2,520');
 for(const value of [NaN,Infinity,-1,'172.5',null,undefined])assert.throws(()=>quoteMoneyFormatter([value]),TypeError);
 assert.throws(()=>quoteMoneyFormatter([200,172.5]).range(200,172.5),TypeError);
});

test('display: partial and multi-option quotes share visible precision without changing receipts',async()=>{
 const result={resultType:'INSTANT_ESTIMATE_READY',currency:'CAD',taxTreatment:'Includes applicable tax.',priceUnit:'per visit',options:[{tierName:'First',lowEstimate:172.5,midEstimate:172.5,highEstimate:172.5},{tierName:'Second',lowEstimate:200,midEstimate:200,highEstimate:200},{tierName:'Third',lowEstimate:4621.5,midEstimate:4621.5,highEstimate:4621.5}]};
 const partial={resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:result,pricedScope:{service:'[SYNTHETIC] Mowing',facts:[]},additionalWork:[{description:'[SYNTHETIC] Separate work'}]};
 const before=structuredClone(partial);
 for(const [surface,data] of [['customer',{result:partial}],['records',{rows:[{id:'synthetic-options',result:partial}],kind:'quotes'}],['preview',{preview:partial}]]){
  const html=await renderDisplay(surface,data);assert.ok(html.includes('$172.50'),surface);
  if(surface!=='preview')assert.ok(html.includes('$200.00')&&html.includes('$4,621.50'),surface);
 }
 const phone=conciseVoiceSummary(result);for(const price of ['$172.50','$200.00','$4,621.50'])assert.ok(phone.includes(price));assert.ok(!phone.includes('..'));
 assert.deepEqual(partial,before);
});
