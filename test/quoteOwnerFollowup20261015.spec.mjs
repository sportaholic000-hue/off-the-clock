import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {custom} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {generateQuoteVNext,validateCustomerInputs} from '../server/quote-engine-vnext/index.js';
import * as onboarding from '../server/src/onboardingService.js';
import {validateInterviewValue,validateStarterOutput,suggestStarterBook} from '../server/src/priceBookAI.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';
import {db,migrate} from '../server/src/db.js';
import {removeScopeConfiguration} from '../client/src/pricebookEditing.js';
import {validateStarterServices} from '../server/src/platformIntegrations.js';

// Written before repairs: 178000 floor + 5*17500 installed stairs +
// (5*17500*30/100)*10/100 materials tax = 268125 cents.
// Allocation changes must validate the complete intended pair, independent
// of JSON property order. Every rejected update must preserve the whole row.
const type='ROOFING_REPLACEMENT',path='underlaymentPerSquare.product_0';
const stairPath='scopeRates.stairs_installed';
const date={timeZone:'UTC',quoteInstant:'2026-10-15T12:00:00.000Z'};
const nameError='Enter a service name of 1–80 characters.';
test('QE-016 owner decision: compatibility starter retains 80 characters and rejects 81 without truncation',()=>{
  for(const type of ['CUSTOM','FENCING_INSTALL']){
    const entry=type==='CUSTOM'?{serviceType:type,low:100,high:150,unit:'flat'}:{serviceType:type,fields:{minimumJob:125}};
    assert.equal(validateStarterServices([{...entry,service:'X'.repeat(80)}],[type])[0]?.service,'X'.repeat(80));
    assert.throws(()=>validateStarterServices([{...entry,service:'X'.repeat(81)}],[type]),{message:nameError});
  }
});
migrate();
function owner(){
  const id='synthetic-owner-followup-'+randomUUID(),now=date.quoteInstant;
  db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'UTC','owner',now);
  return id;
}
function allocationDraft(labor=40,materials=60){
  const id=owner();let draft=onboarding.createInterviewDraft(id,{serviceTypes:[type]});
  draft=onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{[type]:{
    underlaymentPerSquare:{product_0:15},underlaymentPriceBasis:{product_0:'installed_area_sell_price'},
    installedLaborPercent:{[path]:labor},installedMaterialsPercent:{[path]:materials}
  }},confirmedFields:{[type]:['underlaymentPerSquare','underlaymentPriceBasis','installedLaborPercent','installedMaterialsPercent']}});
  return {id,draft};
}
for(const [from,to] of [[40,60],[60,40]])for(const order of ['labor-first','materials-first']){
  test(`QE-008 follow-up: ${from}/${100-from} to ${to}/${100-to}, ${order}, save/resume and confirmations`,()=>{
    const {id,draft}=allocationDraft(from,100-from);
    const entries=[['installedLaborPercent',{[path]:to}],['installedMaterialsPercent',{[path]:100-to}]];
    if(order==='materials-first')entries.reverse();
    const saved=onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{[type]:Object.fromEntries(entries)}});
    assert.deepEqual(saved.fields[type].installedLaborPercent,{[path]:to});
    assert.deepEqual(saved.fields[type].installedMaterialsPercent,{[path]:100-to});
    assert.deepEqual(saved.confirmedFields[type],['underlaymentPerSquare','underlaymentPriceBasis']);
    assert.deepEqual(onboarding.getInterviewDraft(id,draft.id),saved);
    assert.equal(onboarding.listInterviewDrafts(id).some(row=>row.id===draft.id),true);
    const confirmed=onboarding.saveInterviewDraft(id,draft.id,{revision:saved.revision,confirmedFields:{[type]:Object.keys(saved.fields[type])}});
    assert.ok(confirmed.confirmedFields[type].includes('installedLaborPercent'));
    assert.ok(confirmed.confirmedFields[type].includes('installedMaterialsPercent'));
  });
}
test('QE-008 follow-up: single-field changes use the saved sibling and preserve rejected storage exactly',()=>{
  const {id,draft}=allocationDraft();
  assert.throws(()=>onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{[type]:{installedLaborPercent:{[path]:60}}}}),/total more than 100/);
  assert.deepEqual(onboarding.getInterviewDraft(id,draft.id),draft);
  const reduced=onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{[type]:{installedMaterialsPercent:{[path]:40}}}});
  assert.ok(reduced.confirmedFields[type].includes('installedLaborPercent'));
  assert.ok(!reduced.confirmedFields[type].includes('installedMaterialsPercent'));
  const increased=onboarding.saveInterviewDraft(id,draft.id,{revision:reduced.revision,fields:{[type]:{installedLaborPercent:{[path]:60}}},confirmedFields:{[type]:['installedLaborPercent']}});
  assert.deepEqual(increased.fields[type].installedLaborPercent,{[path]:60});
});
test('QE-008 follow-up: invalid pairs, domains, types and bounds reject atomically in either order',()=>{
  const {id,draft}=allocationDraft();
  for(const [labor,materials] of [[61,40],[101,0],[-1,50],['60',40],[NaN,40]])for(const reverse of [false,true]){
    const entries=[['installedLaborPercent',{[path]:labor}],['installedMaterialsPercent',{[path]:materials}]];
    if(reverse)entries.reverse();
    assert.throws(()=>onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{[type]:Object.fromEntries(entries)}}));
    assert.deepEqual(onboarding.getInterviewDraft(id,draft.id),draft);
  }
  for(const bad of ['underlaymentPerSquare.missing','__proto__.polluted']){
    assert.throws(()=>onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{[type]:{installedLaborPercent:{[bad]:40},installedMaterialsPercent:{[path]:60}}}}));
    assert.deepEqual(onboarding.getInterviewDraft(id,draft.id),draft);
  }
});
test('QE-008 follow-up: explicit empty maps and decimal percentages replace whole maps without stale confirmations',()=>{
  const {id,draft}=allocationDraft();
  const saved=onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{[type]:{installedLaborPercent:{[path]:60.25},installedMaterialsPercent:{[path]:39.75}}},confirmedFields:{[type]:['installedLaborPercent','installedMaterialsPercent']}});
  assert.equal(saved.fields[type].installedLaborPercent[path],60.25);
  const cleared=onboarding.saveInterviewDraft(id,draft.id,{revision:saved.revision,fields:{[type]:{installedLaborPercent:{},installedMaterialsPercent:{}}}});
  assert.deepEqual(cleared.fields[type].installedLaborPercent,{});
  assert.deepEqual(cleared.fields[type].installedMaterialsPercent,{});
  assert.deepEqual(cleared.confirmedFields[type],[]);
});

function stairInput(){
  const input=structuredClone(measuredScopeCases().find(item=>item.id==='stairs-installed').input);
  input.businessDefaults.taxMode='TAX_MATERIALS';input.businessDefaults.taxPercent=10;
  input.ownerPricing.pricing.installedLaborPercent={[stairPath]:70};
  input.ownerPricing.pricing.installedMaterialsPercent={[stairPath]:30};
  input.ownerPricing.tiers=[{name:'Premium',overrides:{scopeDetails:{stairs:structuredClone(input.ownerPricing.pricing.scopeDetails.stairs)},scopeRates:{stairs_installed:17500}}}];
  return input;
}
test('QE-013 follow-up: retained installed tier keeps inherited allocations and the 268125-cent quote',()=>{
  const input=stairInput(),before=structuredClone(input.ownerPricing);
  assert.equal(generateQuoteVNext(input).options[0].calculationRecord.scenarios.mid.finalTotalCents,268125);
  const changed=removeScopeConfiguration(input.ownerPricing,'stairs');
  assert.deepEqual(input.ownerPricing,before,'the editor helper must not mutate the prior draft');
  assert.equal(changed.pricing.scopeRates.stairs_installed,undefined);
  assert.equal(changed.pricing.installedMaterialsPercent[stairPath],undefined);
  assert.equal(changed.tiers[0].overrides.installedLaborPercent?.[stairPath],70);
  assert.equal(changed.tiers[0].overrides.installedMaterialsPercent?.[stairPath],30);
  const quote=generateQuoteVNext({...input,ownerPricing:changed});
  assert.equal(quote.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(quote));
  assert.equal(quote.options[0].calculationRecord.scenarios.mid.finalTotalCents,268125);
});
test('QE-013 follow-up: explicit and partial tier allocations, dependent fragments and unrelated scopes stay distinct',()=>{
  const input=stairInput(),s=input.ownerPricing,p=s.pricing;
  p.scopeDetails.floor_underlayment_tile={description:'[SYNTHETIC] underlayment',mode:'installed_area_sell_price'};
  p.scopeRates.floor_underlayment_tile=125;
  p.installedLaborPercent['scopeRates.floor_underlayment_tile']=10;
  p.installedMaterialsPercent['scopeRates.floor_underlayment_tile']=90;
  s.tiers.push({name:'Explicit',overrides:{...structuredClone(s.tiers[0].overrides),installedLaborPercent:{[stairPath]:60},installedMaterialsPercent:{[stairPath]:40}}});
  s.tiers.push({name:'Partial',overrides:{...structuredClone(s.tiers[0].overrides),installedLaborPercent:{[stairPath]:60}}});
  s.tiers.push({name:'Dependent',overrides:{scopeRates:{stairs_installed:16000},installedMaterialsPercent:{[stairPath]:40},minimumJob:500}});
  const explicit=structuredClone(s.tiers[1]),changed=removeScopeConfiguration(s,'stairs');
  assert.deepEqual(changed.tiers[1],explicit);
  assert.equal(changed.tiers[2].overrides.installedLaborPercent?.[stairPath],60);
  assert.equal(changed.tiers[2].overrides.installedMaterialsPercent?.[stairPath],30);
  assert.equal(changed.tiers[3].overrides.scopeRates.stairs_installed,undefined);
  assert.equal(changed.tiers[3].overrides.installedMaterialsPercent?.[stairPath],undefined);
  assert.equal(changed.tiers[3].overrides.minimumJob,500);
  assert.equal(changed.pricing.scopeRates.floor_underlayment_tile,125);
  assert.equal(changed.pricing.installedMaterialsPercent['scopeRates.floor_underlayment_tile'],90);
});
test('QE-013 follow-up: absent allocations are never fabricated and explicit zero remains explicit',()=>{
  const input=stairInput();delete input.ownerPricing.pricing.installedMaterialsPercent;
  const changed=removeScopeConfiguration(input.ownerPricing,'stairs');
  assert.equal(changed.tiers[0].overrides.installedMaterialsPercent?.[stairPath],undefined);
  assert.equal(generateQuoteVNext({...input,ownerPricing:changed}).resultType,'ESTIMATE_REQUIRES_REVIEW');
  input.ownerPricing.pricing.installedMaterialsPercent={[stairPath]:0};
  assert.equal(removeScopeConfiguration(input.ownerPricing,'stairs').tiers[0].overrides.installedMaterialsPercent?.[stairPath],0);
});

function namedInput(name){const input=custom();input.ownerPricing.service=name;input.customerInputs.service=name;return input;}
function quoteSaved(input){
  const id=owner(),service=structuredClone(input.ownerPricing);
  delete service.origin;delete service.approvedValues;delete service.quoteDoneApproval;delete service.zeroPricePolicy;
  const initial=bridge.readApplicationBook(id),book=bridge.convertApplicationBook({services:[service],defaults:{currency:'USD',quoteTimeZone:'UTC',...input.businessDefaults}},'toDollars');
  bridge.saveApplicationBook(id,{...book,revision:initial.revision},date);
  const saved=bridge.readApplicationBook(id);
  bridge.approveApplicationService(id,saved.services[0].id,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
  const stored=loadPricebook(id),quote=bridge.calculateApplicationQuote(stored,stored.services[0],{customerInputs:input.customerInputs,customerFeeSelections:{}},{...date,preparingIntake:true});
  assert.equal(stored.services[0].service,input.ownerPricing.service);
  assert.equal(quote.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(quote.internalResult));
  assert.equal(quote.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,12500);
}
for(const [label,name] of [['one','X'],['forty','X'.repeat(40)],['eighty','X'.repeat(80)],['Unicode','Réparation 🏠'],['Unicode boundary','é'.repeat(78)+'🏠']]){
  test('QE-016 owner decision: '+label+' name survives interview, starter, save, approval, reload and actual quote',()=>{
    const id=owner(),draft=onboarding.createInterviewDraft(id,{serviceTypes:['CUSTOM']});
    const saved=onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{CUSTOM:{service:name,unit:'flat',customPricingMode:'fixed',price:125}},confirmedFields:{CUSTOM:['service','unit','customPricingMode','price']}});
    assert.equal(onboarding.getInterviewDraft(id,draft.id).fields.CUSTOM.service,name);
    const review=onboarding.draftReviewPayload(id,draft.id);
    assert.equal(review.services[0].service,name);
    assert.equal(review.services[0].fields.service,undefined,'identity must not become a pricing field');
    assert.equal(validateStarterOutput([{service:name,serviceType:'CUSTOM',low:100,high:150,unit:'flat'}],['CUSTOM'])[0].service,name);
    quoteSaved(namedInput(saved.fields.CUSTOM.service));
  });
}
test('QE-016 owner decision: 81 characters reject consistently in saved book, interview and AI starter',async()=>{
  const name='X'.repeat(81),id=owner(),input=namedInput(name),initial=bridge.readApplicationBook(id),service=structuredClone(input.ownerPricing);
  delete service.origin;
  const draftBook=bridge.convertApplicationBook({services:[service],defaults:{currency:'USD',quoteTimeZone:'UTC',...input.businessDefaults}},'toDollars');
  assert.throws(()=>bridge.saveApplicationBook(id,{...draftBook,revision:initial.revision},date),{message:nameError});
  assert.equal(bridge.readApplicationBook(id).services.length,0);
  const draft=onboarding.createInterviewDraft(id,{serviceTypes:['CUSTOM']});
  assert.throws(()=>onboarding.saveInterviewDraft(id,draft.id,{revision:draft.revision,fields:{CUSTOM:{service:name}}}),{message:nameError});
  assert.deepEqual(onboarding.getInterviewDraft(id,draft.id),draft);
  assert.throws(()=>validateInterviewValue('CUSTOM','service',name),{message:nameError});
  assert.throws(()=>validateStarterOutput([{service:name,serviceType:'CUSTOM',low:100,high:150,unit:'flat'}],['CUSTOM']),{message:nameError});
  const validation=validateCustomerInputs('CUSTOM',input.customerInputs,input.ownerPricing.pricing,input.ownerPricing);
  assert.equal(validation.ok,false);assert.deepEqual(validation.invalidCustomerFields,['service']);
  let calls=0;
  await assert.rejects(suggestStarterBook({industry:'[SYNTHETIC]',serviceTypes:['CUSTOM'],country:'US',region:'OR'},{env:{GEMINI_TEXT_MODEL:'synthetic-text-model',GEMINI_API_KEY:'[SYNTHETIC]'},fetchImpl:async()=>{
    calls++;return {ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify([{service:name,serviceType:'CUSTOM',low:100,high:150,unit:'flat'}])}]}}]})};
  }}),{message:nameError});
  assert.ok(calls>=1&&calls<=2);
});
