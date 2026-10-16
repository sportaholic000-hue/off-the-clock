import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {concreteFixture,sodFixture,customPlantFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {quoteEmailFixture,webQuote,publicCopy,publish,bridge,date} from './quoteDeliveryBatch20261015Fixture.mjs';
import {voiceQuestionContract,bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';
import {generateQuoteVNext,vNextServiceStatus,materializeVNextService} from '../server/quote-engine-vnext/index.js';
import {CONCRETE_FIELDS,SOD_FIELDS,FIELD_COPY} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
import {starterFields,validateInterviewValue} from '../server/src/priceBookAI.js';
import {reviewRows} from '../client/src/pricebookReview.js';
import {loadPricebook} from '../server/priceBookService.js';

// All expected amounts and disclosures below were written before execution.
test('about10by10 with uncertain chute quotes337000c with150000c pump allowance and estimate sentence',async t=>{
  //100*600 +1.5*18000 +40*2500 +150000=337000 cents.
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{placementFlat:{pump:150000},uncertainPlacementMethod:'pump'});f.customerInputs.chuteAccess='unknown';
  const h=quoteEmailFixture(t);publish(h.c.ownerId,f);const match=await h.tool('matchService',{query:f.ownerPricing.service});assert.equal(match.status,'matched');
  const result=await h.tool('getQuote',{serviceHandle:match.serviceHandle,customerInputs:f.customerInputs,customerConfirmed:true,callerMeasurementsEstimated:true,productConfirmations:{},additionalWork:[]});
  assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,3370);
  assert.match(result.quoteNarration,/This price is based on the measurements you gave us\. The business will confirm them on site\./);
  assert.match(result.quoteNarration,/placement is an allowance.*confirmed on site/i);
  const row=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId);assert.equal(JSON.parse(row.customerResponseJson).midEstimate,3370);
  const prepared=await h.tool('prepareQuoteEmail',{quoteHandle:result.quoteHandle,email:'caller@example.invalid'});
  await h.tool('sendQuoteEmail',{emailConfirmationHandle:prepared.emailConfirmationHandle,customerConfirmed:true});
  assert.equal(publicCopy(h.emailService(),h.rows()[0]).copy.narration,result.quoteNarration);
});
test('uncertain chute without owner allowance quotes187000c and preserves extra-cost note in saved public copy',()=>{
  //Same100sqft patio187000c; absence of a not-sure method adds zero cents.
  const f=concreteFixture();f.customerInputs.chuteAccess='unknown';const w=webQuote(f);assert.equal(w.result.midEstimate,1870);
  w.email.enqueueSavedQuote({ownerId:w.owner,quoteId:w.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  assert.match(publicCopy(w.email,w.rows()[0]).copy.narration,/Placement other than the truck chute would be extra.*confirmed on site/);
});
test('custom plant sizes reach both question contracts, phone name binding, saved job facts and public copy at30000c',()=>{
  //4*(4500+3000)=30000; no price fields may enter the voice question contract.
  const f=customPlantFixture(),def=bridge.applicationServiceDefinition(f.ownerPricing),voice=voiceQuestionContract(f.ownerPricing,def);
  assert.deepEqual(voice.fields.find(f=>f.field==='plantsBySize').choices,[{value:'shrub_5',label:'#5 shrub, container'},{value:'tree_2',label:'2 in. caliper tree, balled and burlapped'}]);
  assert.doesNotMatch(JSON.stringify(voice),/4500|25000|plantingLaborPerPlant|plantMaterialAllowance/);
  const args={customerInputs:{...f.customerInputs,plantsBySize:{'#5 shrub, container':4}},customerConfirmed:true};
  const bound=bindVoiceQuoteInputs(f.ownerPricing,def,args);assert.deepEqual(bound.customerInputs.plantsBySize,{shrub_5:4});
  const w=webQuote(f);assert.equal(w.result.midEstimate,300);assert.match(JSON.stringify(w.row),/#5 shrub, container/);
  w.email.enqueueSavedQuote({ownerId:w.owner,quoteId:w.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  assert.match(publicCopy(w.email,w.rows()[0]).copy.narration,/#5 shrub, container/);
});
test('concrete and sod optional controls have labels, blank new services, exact money conversion and persisted settings',()=>{
  //4000c->$40 short,150000c->$1500 pump,120c->$1.20 grading.
  //5yd threshold,4in depth and20% compaction (.2) are not dollars.
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{shortLoadThresholdCubicYards:5,shortLoadPerYard:4000,placementFlat:{pump:150000},placementPerCubicYard:{power_buggy:3000},baseGravelPerCubicYard:4500,baseExcavationGradingPerSqft:120,baseDepthInches:4,baseCompactionAllowance:0.2,controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:150,slabLaborMinThicknessInches:4,slabLaborMaxThicknessInches:6});
  const dollars=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');
  const p=dollars.services[0].pricing;assert.deepEqual([p.shortLoadPerYard,p.placementFlat.pump,p.baseExcavationGradingPerSqft,p.shortLoadThresholdCubicYards,p.baseDepthInches,p.baseCompactionAllowance],[40,1500,1.2,5,4,.2]);
  assert.deepEqual(bridge.convertApplicationBook(dollars,'toCents').services[0].pricing,f.ownerPricing.pricing);
  const meta=bridge.applicationMetadata();
  for(const [fixture,fields] of [[concreteFixture(),CONCRETE_FIELDS],[sodFixture(),SOD_FIELDS]]){
    const materialized=materializeVNextService(fixture.ownerPricing),schema=meta.services.find(s=>s.serviceType===fixture.serviceType);
    assert.equal(starterFields(fixture.serviceType).some(def=>fields.includes(def.field)),false);
    for(const field of fields){assert.equal(Object.hasOwn(materialized.pricing,field),false);assert.equal(schema.fields.find(f=>f.field===field).label,FIELD_COPY[field].label);assert.equal(schema.fields.find(f=>f.field===field).requiredAtBase,false);}
  }
  const owner='concrete-landscape-save-'+crypto.randomUUID();delete dollars.services[0].origin;
  bridge.saveApplicationBook(owner,{...dollars,revision:bridge.readApplicationBook(owner).revision},date);
  const saved=loadPricebook(owner).services[0].pricing;assert.equal(saved.shortLoadPerYard,4000);assert.equal(saved.placementFlat.pump,150000);assert.equal(saved.baseCompactionAllowance,.2);
});
test('custom plant definitions and prices survive owner dollars, interview validation and review with exact names',()=>{
  //Both whole per-plant prices convert:4500c->$45;3000c->$30.
  const f=customPlantFixture(),dollars=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars').services[0],p=dollars.pricing;
  assert.equal(p.plantingLaborPerPlant.shrub_5,45);assert.equal(p.plantMaterialAllowance.shrub_5,30);
  assert.deepEqual(validateInterviewValue(f.serviceType,'plantSizes',p.plantSizes,p),p.plantSizes);
  assert.deepEqual(validateInterviewValue(f.serviceType,'plantingLaborPerPlant',p.plantingLaborPerPlant,p),p.plantingLaborPerPlant);
  const meta=bridge.applicationMetadata().services.find(s=>s.serviceType===f.serviceType),rows=reviewRows(dollars,{},meta);
  assert.ok(rows.some(r=>r.label.includes('#5 shrub, container')&&r.value==='$45'));
});
test('4–6 inch concrete rate and custom planting are live;15ft spacing is a warning, not a quote block',()=>{
  //Expected statuses are live on supported inputs; outside-band jobs review.
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{slabLaborMinThicknessInches:4,slabLaborMaxThicknessInches:6,controlJointPricing:'excluded',controlJointSpacingFt:15,sawCutPerLF:150});
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));assert.ok(status.statusNotices.some(n=>/15 feet.*10 feet/.test(n)));
  const plants=customPlantFixture(),s=vNextServiceStatus(plants.ownerPricing,plants.businessDefaults);assert.equal(s.status,'QUOTING LIVE',JSON.stringify(s));
});
test('phone prompts add concrete/sod/planting blocks while retaining immutable guide and caller-estimate instruction',()=>{
  //Expected: three supported trades compile with no price-book rates.
  const guideText=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
  const instruction=compileVoiceSystemInstruction({guideText,business:{businessName:'Synthetic Landscaping',agentName:'Sam'},services:[concreteFixture(),sodFixture(),customPlantFixture()].map(f=>({serviceType:f.serviceType,serviceLabel:f.serviceType.replaceAll('_',' '),active:true,status:'QUOTING LIVE',offerings:[]}))});
  assert.match(instruction,/Concrete owner ruling/);assert.match(instruction,/Sod and planting owner ruling/);assert.match(instruction,/caller-confirmed approximate slab dimensions/);assert.match(instruction,/exact size names/);
});
