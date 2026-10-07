import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {roofingDisplayFixture,savedDisplayFixture} from './quoteDisplayFixtures20261006.mjs';
import {includedFixture} from './quoteEngineVNextFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {bindVoiceQuoteInputs,voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {projectVoiceToolResult} from '../server/src/voice/toolDispatcher.js';
import {smsFixture} from './ownerAlertsDelivery20261006Fixture.mjs';
import {at,secret} from './leadCaptureRepair20261006Fixture.mjs';
import {createVoiceHandleStore} from '../server/src/voice/voicePersistence.js';
import {validateDeploymentConfig} from '../server/src/deploymentConfig.js';
import {productionEnv} from './helpers/railwayEnv.mjs';
import {createVoiceToolRuntime} from '../server/src/voice/voiceToolRuntime.js';
import {approveApplicationService,bookRevision,bookStatuses,calculateApplicationQuote} from '../server/src/quoteDoneBridge.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';

process.env.JWT_SECRET='SYNTHETIC_AUDIT_QUOTE_SIGNING_KEY_NEVER_LIVE';

// Independent expected values are recorded before execution in
// verification/audit-small-repairs-20261007/EXPECTATIONS.md.
function bareFloor(){
  const f=flooring();delete f.ownerPricing.pricing.perStepPrice;
  f.ownerPricing.pricing.laborPerSqft.tile=100;f.ownerPricing.pricing.materialPerSqft.tile=200;
  delete f.ownerPricing.knownOfferings.existingFloorType;
  return f;
}
test('audit repair: bare-floor binding quotes $668 without a fictitious product identity',()=>{
  const f=bareFloor(),a=savedDisplayFixture(f),inputs=structuredClone(f.customerInputs);delete inputs.confirmedFacts;
  assert.equal(a.quote(inputs).customerResult.midEstimate,668);
  for(const productConfirmations of [{},{existingFloorType:true}]){
    const bound=bindVoiceQuoteInputs(a.service,a.definition,{customerInputs:inputs,productConfirmations});
    assert.deepEqual(bound.followUps,[]);assert.equal(bound.customerInputs.confirmedFacts,undefined);
    assert.equal(a.quote(bound.customerInputs).customerResult.midEstimate,668);
  }
  const contract=projectVoiceToolResult('matchService',{status:'matched',questionContract:voiceQuestionContract(a.service,a.definition)}).questionContract;
  const question=contract.fields.find(field=>field.field==='existingFloorType');
  assert.ok(question.choices.some(choice=>choice.value==='none'));
  assert.deepEqual(question.productConfirmationExemptValues,['none']);
  const contradictory={...inputs,removalNeeded:true,removalAreaSqft:200};
  assert.equal(a.quote(contradictory).customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('audit repair: real phone match and quote accept a confirmed bare-floor job',async t=>{
  const h=smsFixture(t),f=bareFloor();delete f.ownerPricing.origin;
  savePricebook(h.c.ownerId,{services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}});
  let book=loadPricebook(h.c.ownerId);
  approveApplicationService(h.c.ownerId,book.services[0].id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC',quoteInstant:at});
  const runtime=createVoiceToolRuntime({database:h.db,callContext:h.c,handleSecret:secret,clock:()=>new Date(at)});
  const invoke=(name,args)=>runtime.handlers[name]({context:h.c,args});
  const matched=await invoke('matchService',{query:f.ownerPricing.service});assert.equal(matched.status,'matched');
  const customerInputs=structuredClone(f.customerInputs);delete customerInputs.confirmedFacts;
  const result=projectVoiceToolResult('getQuote',await invoke('getQuote',{serviceHandle:matched.serviceHandle,customerInputs,customerConfirmed:true}));
  assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.options[0].lowEstimate,668);
});
test('audit repair: real products still need registration and affirmative identity confirmation',()=>{
  for(const field of ['existingFloorType','replacementRoofType']){
    const service={knownOfferings:{[field]:{tile:'00000000-0000-4000-8000-000000000001'}}},definition={customerFields:[{name:field,label:field,type:'slug'}]};
    assert.equal(bindVoiceQuoteInputs(service,definition,{customerInputs:{[field]:'tile'}}).followUps.length,1);
    assert.equal(bindVoiceQuoteInputs(service,definition,{customerInputs:{[field]:'unregistered'},productConfirmations:{[field]:true}}).followUps.length,1);
    if(field!=='existingFloorType')assert.equal(bindVoiceQuoteInputs(service,definition,{customerInputs:{[field]:'none'},productConfirmations:{[field]:true}}).followUps.length,1);
  }
});
function includedRoof(){
  const f=roofingDisplayFixture(),p=f.ownerPricing.pricing;
  Object.assign(p,{laborPerSquare:{asphalt_shingle:5000},materialCostPerSquare:{asphalt_shingle:10000},tearOffPerSquare:{asphalt_shingle:2000},underlaymentPerSquare:{asphalt_shingle:0},wasteFactorByComplexity:{simple:0,moderate:0,complex:0}});
  delete p.installedMaterialsPercent;delete p.installedLaborPercent;
  f.ownerPricing.priceBasisByCategory.material='sell_price';f.ownerPricing.taxabilityByCategory.material=true;
  f.ownerPricing=includedFixture(f.ownerPricing,{'underlaymentPerSquare.asphalt_shingle':'materialCostPerSquare.asphalt_shingle'});
  Object.assign(f.businessDefaults,{currency:'CAD',taxMode:'TAX_MATERIALS',taxPercent:10});return f;
}
test('audit repair: included zero roof underlay needs no fictitious tax allocation',()=>{
  const f=includedRoof(),q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,180000);
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  const application=structuredClone(f);delete application.ownerPricing.zeroPricePolicy;
  const a=savedDisplayFixture(application,{approve:false});
  approveApplicationService(a.owner,a.service.id,{revision:bookRevision(a.book),confirmConfiguration:true,confirmLegacySettings:true,zeroClassification:{freeCompleteService:false,freeTiers:[],includedPrices:{'underlaymentPerSquare.asphalt_shingle':'materialCostPerSquare.asphalt_shingle'}}},{timeZone:'UTC',quoteInstant:at});
  const book=loadPricebook(a.owner);assert.equal(bookStatuses(book,{timeZone:'UTC',quoteInstant:at})[0].status,'QUOTING LIVE');
  assert.equal(calculateApplicationQuote(book,book.services[0],{customerInputs:f.customerInputs,customerFeeSelections:{}},{preparingIntake:true,timeZone:'UTC',quoteInstant:at}).customerResult.midEstimate,1800);
});
test('audit repair: positive roof tier retains allocation gate and unclassified zero is rejected',()=>{
  const f=includedRoof();f.ownerPricing.tiers=[{name:'Included',overrides:{}},{name:'Paid',overrides:{underlaymentPerSquare:{asphalt_shingle:1000}}}];
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
  assert.deepEqual(q.options.map(option=>option.tierName),['Included']);
  assert.ok(q.failedTierDiagnostics.some(d=>d.tierName==='Paid'&&d.missingOwnerFields.includes('installedMaterialsPercent.underlaymentPerSquare.asphalt_shingle')));
  f.ownerPricing.tiers[1].overrides.installedMaterialsPercent={'underlaymentPerSquare.asphalt_shingle':100};
  const complete=generateQuoteVNext(f);assert.deepEqual(complete.options.map(o=>o.calculationRecord.scenarios.mid.finalTotalCents),[180000,191000]);
  const invalid=includedRoof();delete invalid.ownerPricing.zeroPricePolicy;
  assert.equal(generateQuoteVNext(invalid).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
function savedSms(h,receipt){
  const recordId='SYNTHETIC-audit-sms',requestId='SYNTHETIC-audit-submission';
  h.db.prepare("INSERT INTO quotes(id,ownerId,callId,serviceType,resultJson,status,createdAt) VALUES(?,?,?,'CUSTOM',?,'INSTANT',?)").run(recordId,h.c.ownerId,h.c.callSid,JSON.stringify({customerResult:receipt,privateRate:'PRIVATE_RATE_MUST_NOT_LEAK'}),at);
  h.db.prepare("INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,?,'SYNTHETIC',?,?,'SYNTHETIC','{}','{}',?,?)").run(h.c.ownerId,requestId,recordId,receipt.resultType,JSON.stringify(receipt),at);
  const store=createVoiceHandleStore({database:h.db,secret,clock:()=>new Date(at)});
  return store.issue({context:h.c,type:'quote',resourceKey:recordId,reference:{recordId,requestId,resultType:receipt.resultType},expiresAt:new Date(Date.parse(at)+3600000)});
}
const fixedReceipt=()=>({resultType:'INSTANT_ESTIMATE_READY',currency:'CAD',taxTreatment:'No tax added.',priceUnit:'per visit',options:[{tierName:'Base',lowEstimate:100,midEstimate:100,highEstimate:100,skippedAddons:['Clipping bagging and disposal'],disclaimer:'[SYNTHETIC] Measured mowing only. Access must be clear.'}]});
test('audit repair: outgoing frozen partial SMS retains currency, exclusions, scope and separate work',async t=>{
  const h=smsFixture(t),receipt={resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:fixedReceipt(),pricedScope:{service:'[SYNTHETIC] Mowing',facts:[{label:'Measured area',value:'5,000 square feet'}]},additionalWork:[{description:'[SYNTHETIC] Remove stump'}],fullJobTotal:null};
  const recordHandle=savedSms(h,receipt);await h.tool('sendSms',{template:'quote',recordHandle});
  assert.equal(h.sends(),1);const body=JSON.parse(h.rows()[0].requestJson).body;
  for(const text of ['$100 CAD per visit','No tax added.','Clipping bagging and disposal','Remove stump','Access must be clear.','5,000 square feet','A total for all requested work is not available.'])assert.ok(body.includes(text),body);
  assert.ok(!body.includes('100.00 to 100.00')&&!body.includes('..')&&!body.includes('PRIVATE_RATE'));
  assert.deepEqual(JSON.parse(h.db.prepare('SELECT customerResponseJson FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId).customerResponseJson),receipt);
});
test('audit repair: SMS retains true ranges and each option disclosure',async t=>{
  const h=smsFixture(t),receipt=fixedReceipt();receipt.currency='USD';receipt.options.push({tierName:'Premium',lowEstimate:125.5,midEstimate:130,highEstimate:150,skippedAddons:[],disclaimer:'[SYNTHETIC] Premium includes bagging.'});
  await h.tool('sendSms',{template:'quote',recordHandle:savedSms(h,receipt)});
  const body=JSON.parse(h.rows()[0].requestJson).body;
  for(const text of ['Base: $100.00 USD per visit','Premium: $125.50 to $150.00 USD per visit','Premium includes bagging.','Access must be clear.'])assert.ok(body.includes(text),body);
});
test('audit repair: SMS refuses an oversized receipt rather than dropping qualifications',async t=>{
  const h=smsFixture(t),receipt=fixedReceipt();receipt.options[0].disclaimer='[SYNTHETIC] '+ 'Scope restriction. '.repeat(110);
  await assert.rejects(h.tool('sendSms',{template:'quote',recordHandle:savedSms(h,receipt)}));
  assert.equal(h.sends(),0);assert.equal(h.rows().length,0);
});
test('audit repair: startup rejects bcrypt costs that authentication cannot use',()=>{
  for(const cost of [10,11,17,31,'invalid'])assert.throws(()=>validateDeploymentConfig(productionEnv('/tmp/synthetic-audit-volume',{BCRYPT_COST:String(cost)})),/BCRYPT_COST/);
  for(const cost of [12,16])assert.equal(validateDeploymentConfig(productionEnv('/tmp/synthetic-audit-volume',{BCRYPT_COST:String(cost)})).production,true);
});
