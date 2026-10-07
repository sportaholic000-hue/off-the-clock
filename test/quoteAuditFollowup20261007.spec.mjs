import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,MEASUREMENT_CONTRACTS} from '../server/quote-engine-vnext/index.js';
import {customerFieldForInputs,clearChangedScopeConfirmations} from '../server/scopeConfiguration.js';
import {savedDisplayFixture} from './quoteDisplayFixtures20261006.mjs';
import {renderDisplay} from './quoteDisplayRender20261006.mjs';
import {customerJobSummary} from '../server/src/quoteIntake.js';
import {extractWebsitePrices} from '../server/src/websitePriceExtraction.js';

// Independent oracles: verification/audit-followup-20261007/EXPECTATIONS.md.
test('older interview tabs cannot replace a newer confirmed price, even without a revision',async()=>{
  const {db,migrate}=await import('../server/src/db.js');migrate();
  const {createInterviewDraft,saveInterviewDraft,getInterviewDraft}=await import('../server/src/onboardingService.js');
  const owner='synthetic-stale-'+randomUUID();
  db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-10-07T12:00:00Z');
  const original=createInterviewDraft(owner,{serviceTypes:['CUSTOM']});
  const old=saveInterviewDraft(owner,original.id,{revision:original.revision,fields:{CUSTOM:{unit:'per_sqft',customPricingMode:'fixed',price:0.02}},confirmedFields:{CUSTOM:['price']}});
  const accepted=saveInterviewDraft(owner,old.id,{revision:old.revision,fields:{CUSTOM:{price:0.03}},confirmedFields:{CUSTOM:['price']}});
  for(const revision of [undefined,old.revision]){
    assert.throws(()=>saveInterviewDraft(owner,old.id,{...(revision?{revision}:{}),fields:{CUSTOM:{price:0.04}},confirmedFields:{CUSTOM:['price']}}),e=>e.statusCode===409);
    assert.deepEqual(getInterviewDraft(owner,old.id),accepted);
  }
  const reconciled=saveInterviewDraft(owner,old.id,{revision:accepted.revision,fields:{CUSTOM:{price:0.04}},confirmedFields:{CUSTOM:['price']}});
  assert.equal(reconciled.fields.CUSTOM.price,0.04);
});

function mulch(inputMethod='sqft'){
  return fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,minimumServiceCharge:0},
    {inputMethod,mulchArea:300,...(inputMethod==='sqft'?{mulchDepth:3}:{}),mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy'});
}
test('mulch keeps its independently calculated area and direct-volume prices',()=>{
  for(const [method,cents] of [['sqft',22708],['yards',2250000]]){
    const q=generateQuoteVNext(mulch(method));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));
    assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,cents);
  }
});
test('mulch form and confirmation use the selected unit and readable method names',async()=>{
  for(const [method,label,unit,methodLabel] of [['sqft','Measured bed area','square feet','Bed area and depth'],['yards','Mulch volume','cubic yards','Cubic yards of mulch']]){
    const f=mulch(method),a=savedDisplayFixture(f),field=a.definition.customerFields.find(f=>f.name==='mulchArea');
    const resolved=customerFieldForInputs(field,f.customerInputs);assert.equal(resolved.label,label);assert.equal(resolved.unit,unit);
    const html=await renderDisplay('products',{fields:a.definition.customerFields,value:f.customerInputs,knownOfferings:a.service.knownOfferings});
    assert.ok(html.includes(label));assert.ok(html.includes(methodLabel));assert.ok(!html.includes('square feet or cubic yards'));
    const summary=customerJobSummary(a.service,a.definition,{customerInputs:f.customerInputs},'synthetic-revision');
    assert.ok(summary.facts.some(f=>f.label===label&&f.value==='300 '+unit),JSON.stringify(summary));
    const invalid=mulch(method);delete invalid.ownerPricing.pricing.mulchMaterialPerYard;
    const review=generateQuoteVNext(invalid);assert.equal(review.resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(review.validatedMeasurements.find(m=>m.name==='mulchArea').unit,unit);
  }
});
test('changing mulch units clears the old quantity but unrelated answers preserve it',()=>{
  const fields=Object.entries(MEASUREMENT_CONTRACTS.LANDSCAPING_MULCH.fields).map(([name,f])=>({name,...f}));
  for(const [beforeMethod,afterMethod] of [['sqft','yards'],['yards','sqft']]){
    const before={inputMethod:beforeMethod,mulchArea:300},after={...before,inputMethod:afterMethod};
    assert.equal(clearChangedScopeConfirmations(fields,before,after).mulchArea,undefined);
    assert.equal(clearChangedScopeConfirmations(fields,before,{...before,edgingNeeded:true}).mulchArea,300);
  }
});
for(const tag of ['div','section'])test('website '+tag+' retains price conditions without mixing neighboring offers',()=>{
  const r=extractWebsitePrices(`<main><${tag}><p>[SYNTHETIC] Cover: $20</p><p>Friday and Saturday only.</p></${tag}><${tag}><p>[SYNTHETIC] Item: $100.00 each</p><p>Minimum 10 items per order.</p></${tag}></main>`);
  assert.deepEqual(r.entries.map(e=>e.excerpt),['[SYNTHETIC] Cover: $20\nFriday and Saturday only.','[SYNTHETIC] Item: $100.00 each\nMinimum 10 items per order.']);
  assert.deepEqual(r.entries.map(e=>e.amounts),[['$20'],['$100.00']]);
});
test('plain-text price paragraphs retain adjacent conditions',()=>{
  const r=extractWebsitePrices('[SYNTHETIC] Cover: $20\nFriday and Saturday only.\n\n[SYNTHETIC] Item: $100.00 each\nMinimum 10 items per order.',{plain:true});
  assert.deepEqual(r.entries.map(e=>e.excerpt),['[SYNTHETIC] Cover: $20\nFriday and Saturday only.','[SYNTHETIC] Item: $100.00 each\nMinimum 10 items per order.']);
});
test('oversized adjacent conditions do not become an unqualified price',()=>{
  for(const plain of [false,true]){
    const price='[SYNTHETIC] Item $100.00',condition='Minimum 10 items per order. '+'[SYNTHETIC] condition '.repeat(80);
    const r=extractWebsitePrices(plain?price+'\n'+condition:`<div><p>${price}</p><p>${condition}</p></div>`,{plain});
    assert.deepEqual(r.entries,[]);assert.equal(r.limited,true);
  }
});
