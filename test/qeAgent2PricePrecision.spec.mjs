import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixedPriceField} from '../server/pricePrecision.js';
import {ownerMoneyEntries,convertPricebookMoney,moneyKindForField,wholeCentsForPricingField,parseOwnerNumericInput,validatePricebookNumericDraft} from '../server/priceBookMoney.js';
import {applicationMetadata,readApplicationBook,saveApplicationBook} from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';
import {validateOwnerPricing} from '../server/quote-engine-vnext/contracts.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {exactMultiply,exactRound} from '../server/quote-engine-vnext/exactMath.js';
import {concreteFixture,sodFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {roofFixture,ROOF_EXPECTED,CONCRETE_EXPECTED,SOD_EXPECTED} from '../verification/qe-agent2-price-metadata-20261018/fixtures.mjs';

const type='ROOFING_REPLACEMENT';
const editorField=field=>applicationMetadata().services.find(row=>row.serviceType===type).fields.find(row=>row.field===field);
function ready(input){const q=generateQuoteVNext(input);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;}
function assertLine(input,path,category,cents){
  const q=ready(input),line=q.lineItems.find(row=>row.calculation.ratePath===path);
  assert.ok(line,path+' must actually be charged');
  assert.equal(line.category,category,path+' quote category');
  assert.equal(line.amountCents,cents,path+' unchanged exact extension');
  const entry=ownerMoneyEntries(input.ownerPricing).find(row=>row.path===path);
  assert.equal(entry.category,category,path+' enumeration category');
  assert.equal(entry.material,category==='material');
  assert.equal(entry.costBasis,input.ownerPricing.priceBasisByCategory[category]==='cost');
}

test('Agent 2 F16 pipeJackEach is fixed whole-cent money in server and editor metadata',()=>{
  assert.equal(fixedPriceField('pipeJackEach'),true);
  assert.equal(moneyKindForField(type,'pipeJackEach'),'fixed_amount');
  assert.equal(wholeCentsForPricingField(type,'pipeJackEach'),true);
  const field=editorField('pipeJackEach');assert.ok(field);
  assert.equal(field.moneyKind,'fixed_amount');assert.equal(field.wholeCents,true);
  assert.throws(()=>parseOwnerNumericInput('1.005',{kind:field.moneyKind,wholeCents:field.wholeCents}),/whole.cent|precision/i);
});

for(const location of ['root','pricing','tier'])test('Agent 2 F16 rejects $1.005 without mutation at '+location,()=>{
  const service={serviceType:type,source:'MANUAL',active:false};
  if(location==='root')service.pipeJackEach=1.005;
  else if(location==='pricing')service.pricing={pipeJackEach:1.005};
  else {service.pricing={pipeJackEach:1.01};service.tiers=[{name:'[SYNTHETIC] Tier',overrides:{pipeJackEach:1.005}}];}
  const original=structuredClone(service);
  assert.throws(()=>convertPricebookMoney(service,'toCents'),/whole.cent|precision/i);
  assert.throws(()=>validatePricebookNumericDraft(service),/whole.cent|precision/i);
  assert.deepEqual(service,original,'the owner input must never be silently rounded');
});

for(const [dollars,cents] of [[0,0],[1,100],[1.01,101],[12.34,1234]])test(`Agent 2 F16 whole-cent control $${dollars} stores ${cents} cents`,()=>{
  const service={serviceType:type,pipeJackEach:dollars,tiers:[{name:'[SYNTHETIC] Tier',overrides:{pipeJackEach:dollars}}]};
  const converted=convertPricebookMoney(service,'toCents');
  assert.equal(converted.pipeJackEach,cents);assert.equal(converted.tiers[0].overrides.pipeJackEach,cents);
  assert.deepEqual(convertPricebookMoney(converted,'toDollars'),service);
  const field=editorField('pipeJackEach');
  assert.equal(parseOwnerNumericInput(String(dollars),{kind:field.moneyKind,wholeCents:field.wholeCents}),dollars);
});

test('Agent 2 F16 actual application saves reject fractional each-prices and preserve the durable book',()=>{
  const owner='qe-agent2-precision-'+randomUUID();
  const draft=readApplicationBook(owner);
  draft.services=[{serviceType:type,service:'[SYNTHETIC] Pipe-jack price',source:'MANUAL',active:false,pricing:{pipeJackEach:1.01}}];
  assert.equal(saveApplicationBook(owner,draft).success,true);
  const file=join(process.env.PRICEBOOK_PATH,owner+'.json'),before=readFileSync(file,'utf8');
  for(const location of ['base','tier']){
    const invalid=readApplicationBook(owner);
    if(location==='base')invalid.services[0].pricing.pipeJackEach=1.005;
    else invalid.services[0].tiers=[{name:'[SYNTHETIC] Fractional each',overrides:{pipeJackEach:1.005}}];
    const original=structuredClone(invalid);
    assert.throws(()=>saveApplicationBook(owner,invalid),/whole.cent|precision/i);
    assert.equal(readFileSync(file,'utf8'),before,'a rejected save changes no data or approval');
    assert.deepEqual(invalid,original);
  }
  assert.equal(loadPricebook(owner).services[0].pricing.pipeJackEach,101);
});

test('Agent 2 F16 legacy fractional each-prices remain visible but fail owner validation and quoting',()=>{
  const f=roofFixture();f.ownerPricing.pricing.pipeJackEach=100.5;
  assert.equal(convertPricebookMoney(f.ownerPricing,'toDollars').pricing.pipeJackEach,1.005);
  const validation=validateOwnerPricing(type,f.customerInputs,f.ownerPricing.pricing,f.ownerPricing);
  assert.ok(validation.invalidOwnerFields.includes('pipeJackEach'),JSON.stringify(validation));
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(f.ownerPricing.pricing.pipeJackEach,100.5,'validation is not a migration or rounding operation');
});

test('Agent 2 F16 measured roofing rates retain fractional cents and round only the extended charge',()=>{
  // Independently expected: 3 * 100.5 = 301.5 cents -> 302, while
  // the valid discrete 3 * 101-cent pipe jack line remains exactly 303.
  assert.equal(exactRound(exactMultiply(3,100.5)),302);
  for(const field of ['iceWaterBarrierPerSqft','iceWaterBarrierPerLF','valleyPerLF','stepFlashingPerLF','ridgeVentPerLF']){
    assert.equal(fixedPriceField(field),false,field);
    assert.equal(moneyKindForField(type,field),'unit_rate',field);
    const metadata=editorField(field);
    assert.equal(parseOwnerNumericInput('1.005',{kind:metadata.moneyKind,wholeCents:metadata.wholeCents}),1.005);
    const service={serviceType:type,pricing:{[field]:1.005},tiers:[{name:'[SYNTHETIC] Fractional measured',overrides:{[field]:1.005}}]};
    const stored=convertPricebookMoney(service,'toCents');
    assert.equal(stored.pricing[field],100.5);assert.equal(stored.tiers[0].overrides[field],100.5);
    assert.deepEqual(convertPricebookMoney(stored,'toDollars'),service);
  }
  const q=ready(roofFixture());
  assert.equal(q.lineItems.find(row=>row.name==='Pipe jacks').amountCents,303);
  assert.equal(q.lineItems.find(row=>row.name==='Valley preparation').amountCents,302);
});

for(const unit of ['linear_feet','square_feet'])test('Agent 2 F21 roofing classifications match actual quote lines, '+unit,()=>{
  const f=roofFixture(unit);
  for(const [path,category] of ROOF_EXPECTED){
    if(path===(unit==='linear_feet'?'iceWaterBarrierPerSqft':'iceWaterBarrierPerLF'))continue;
    assertLine(f,path,category,path==='pipeJackEach'?303:302);
  }
  const before=ready(f).lineItems.map(row=>[row.name,row.amountCents]);
  ownerMoneyEntries(f.ownerPricing);
  assert.deepEqual(ready(f).lineItems.map(row=>[row.name,row.amountCents]),before,'enumeration cannot change monetary lines');
});

for(const serviceType of ['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY'])test('Agent 2 F21 concrete classifications follow supplier/material, labor and addon lines: '+serviceType,()=>{
  const f=concreteFixture();f.serviceType=serviceType;f.ownerPricing.serviceType=serviceType;f.ownerPricing.origin.serviceType=serviceType;
  // 100 sqft orders 1.5 yd. Short 3.5 yd at 100.5c -> 352c;
  // flat alternative 1234c. Pump adds 1234c + 1.5*100.5c -> 151c.
  Object.assign(f.ownerPricing.pricing,{shortLoadThresholdCubicYards:5,shortLoadPerYard:100.5,placementFlat:{pump:1234},placementPerCubicYard:{pump:100.5}});
  f.customerInputs.chuteAccess='no';
  assertLine(f,'shortLoadPerYard','material',352);
  assertLine(f,'placementFlat.pump','addon',1234);
  assertLine(f,'placementPerCubicYard.pump','addon',151);
  delete f.ownerPricing.pricing.shortLoadPerYard;f.ownerPricing.pricing.shortLoadFlatFee=1234;
  assertLine(f,'shortLoadFlatFee','material',1234);
  // 100*4/324*1.2 yd at 100.5c ->149c. Grading100*100.5=10050c.
  Object.assign(f.ownerPricing.pricing,{baseDepthInches:4,baseCompactionAllowance:0.2,baseGravelPerCubicYard:100.5,baseExcavationGradingPerSqft:100.5});
  f.customerInputs.baseNeeded=true;
  assertLine(f,'baseGravelPerCubicYard','material',149);
  assertLine(f,'baseExcavationGradingPerSqft','labor',10050);
  // 20x20,10ft maximum spacing ->40LF;40*100.5=4020c.
  Object.assign(f.ownerPricing.pricing,{controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:100.5});
  Object.assign(f.customerInputs,{length:20,width:20});
  assertLine(f,'sawCutPerLF','labor',4020);
  assert.equal(CONCRETE_EXPECTED.length,7);
});

test('Agent 2 F21 sod grading is labor and imported topsoil is material in actual quote lines',()=>{
  const f=sodFixture();f.customerInputs.sodSqft=324;f.customerInputs.usableTopsoilDepthInches=3;
  Object.assign(f.ownerPricing.pricing,{sodGradingPerSqft:100.5,topsoilPerCubicYard:100.5,topsoilTargetDepthInches:4});
  //324*100.5=32562c labor;324*(4-3)/324=1yd;1*100.5 ->101c material.
  assertLine(f,'sodGradingPerSqft','labor',32562);
  assertLine(f,'topsoilPerCubicYard','material',101);
  assert.equal(ROOF_EXPECTED.length+CONCRETE_EXPECTED.length+SOD_EXPECTED.length,15);
});
