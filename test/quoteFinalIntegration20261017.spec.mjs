import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {SERVICE_TYPES} from '../server/quote-engine-vnext/contracts.js';
import {explanationCases} from './customerExplanationFixtures.mjs';
import {custom} from '../verification/engine-independent/fixtures.mjs';
import {quoteEmailFixture,phone,webQuote,bridge,date} from './quoteDeliveryBatch20261015Fixture.mjs';

// Existing synthetic controls, unchanged at pinned base 56e19419. Expected
// cents are recorded before execution; this is channel/integration evidence,
// not a new estimate of trade prices or real-world accuracy.
const controls={ROOFING_REPLACEMENT:244600,ROOFING_REPAIR:58600,
  FLAT_ROOF_REPLACEMENT:1805000,FLAT_ROOF_REPAIR:36000,
  INTERIOR_PAINTING:169000,EXTERIOR_PAINTING:318000,
  FLOORING_INSTALL:260670,FLOORING_REPLACEMENT:311280,
  FENCING_INSTALL:450000,FENCING_REPLACEMENT:490000,
  SIDING_REPLACEMENT:1170000,SIDING_REPAIR:54000,
  CONCRETE_DRIVEWAY:892222,CONCRETE_PATIO_SLAB:353889,
  LANDSCAPING_CLEANUP:40000,LANDSCAPING_MULCH:32275,
  LANDSCAPING_SOD:253750,LANDSCAPING_PLANTING:28500,
  LANDSCAPING_MOWING:16000,CUSTOM:12500};
const missing={ROOFING_REPLACEMENT:'roofSizeInput',ROOFING_REPAIR:'affectedArea',
  FLAT_ROOF_REPLACEMENT:'roofSqft',FLAT_ROOF_REPAIR:'affectedArea',
  INTERIOR_PAINTING:'wallAreaSqft',EXTERIOR_PAINTING:'exteriorAreaSqft',
  FLOORING_INSTALL:'sqft',FLOORING_REPLACEMENT:'sqft',
  FENCING_INSTALL:'linearFeet',FENCING_REPLACEMENT:'linearFeet',
  SIDING_REPLACEMENT:'sidingAreaSqft',SIDING_REPAIR:'affectedArea',
  CONCRETE_DRIVEWAY:'length',CONCRETE_PATIO_SLAB:'length',
  LANDSCAPING_CLEANUP:'yardSqft',LANDSCAPING_MULCH:'mulchArea',
  LANDSCAPING_SOD:'sodSqft',LANDSCAPING_PLANTING:'plantsBySize',
  LANDSCAPING_MOWING:'yardSqft',CUSTOM:'serviceConfirmed'};
const rows=new Map();for(const row of explanationCases())if(!rows.has(row.input.serviceType))rows.set(row.input.serviceType,row.input);
const internal=row=>{const saved=JSON.parse(row.internalOutcomeJson);return (saved.applicationOutcome||saved).internalResult;};
const record=q=>q.options[0].calculationRecord;
const privateFields=/"(?:lineItems|calculationRecord|ratePath|installedMaterialsPercent|installedLaborPercent|priceMetadata|startingValueState|actualLaborCostCents|actualMaterialCostCents|jobMetrics|lowBufferPercent|highBufferPercent)"/;
function privateCheck(value){assert.doesNotMatch(JSON.stringify(value),privateFields);}
test('final integration covers every registered service with a saved-book widget and voice control',()=>{
  assert.deepEqual([...rows.keys()].sort(),[...SERVICE_TYPES].sort());
  assert.deepEqual(Object.keys(controls).sort(),[...SERVICE_TYPES].sort());
});
for(const type of SERVICE_TYPES)test('final integration saved widget/voice ranges, scope, privacy and unknown measurement: '+type,async t=>{
  const f=structuredClone(rows.get(type));
  if(['ROOFING_REPAIR','FLAT_ROOF_REPAIR','SIDING_REPAIR'].includes(type))f.ownerPricing.pricing.largeRepairMaxSqft=1_000_000;
  // Cross each calculator with business low 5 / high 15 and a service low
  // override of explicit zero. High must inherit 15; no default materializes.
  Object.assign(f.businessDefaults,{rangeBufferPercent:10,rangeLowPercent:5,rangeHighPercent:15});
  f.ownerPricing.rangeLowPercent=0;
  const w=webQuote(f),h=quoteEmailFixture(t),p=await phone(h,f);
  assert.equal(p.result.status,'quoted',JSON.stringify(p.result));
  const voiceRow=h.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? ORDER BY rowid DESC LIMIT 1').get(h.c.ownerId);
  const wi=internal(w.row),vi=internal(voiceRow),wr=record(wi),vr=record(vi);
  assert.equal(wi.resultType,'INSTANT_ESTIMATE_READY');assert.equal(vi.resultType,wi.resultType);
  assert.equal(wr.range.midCents,controls[type]);
  assert.deepEqual(wr.range,vr.range);
  assert.equal(wr.range.lowCents,controls[type]);
  assert.equal(wr.range.highCents,Math.floor((controls[type]*115+50)/100));
  assert.deepEqual(wr.lineItems,vr.lineItems);
  assert.deepEqual(wr.normalizedCustomerInputs,vr.normalizedCustomerInputs);
  const phoneCustomer=JSON.parse(voiceRow.customerResponseJson);
  for(const key of ['resultType','lowEstimate','midEstimate','highEstimate','disclaimer','priceDrivers','taxTreatment','priceUnit'])assert.deepEqual(w.result[key],phoneCustomer[key],key);
  privateCheck(w.result);privateCheck(p.result);privateCheck(phoneCustomer);
  // No missing/unknown required measurement gets a price or a confirmation.
  for(const value of [undefined,null]){
    const inputs=structuredClone(f.customerInputs);if(value===undefined)delete inputs[missing[type]];else inputs[missing[type]]=value;
    const body={...w.body,requestId:randomUUID(),customerInputs:inputs};delete body.intakeConfirmation;
    const prepared=bridge.prepareApplicationIntake(w.owner,body,date);
    assert.equal(prepared.status,'needs_details',type);assert.equal(prepared.confirmation,undefined);privateCheck(prepared);
    const args={...p.args,customerInputs:inputs};delete args.customerInputs.confirmedFacts;
    const response=await h.tool('getQuote',args);
    assert.notEqual(response.status,'quoted');assert.equal(response.resultType,'ESTIMATE_REQUIRES_REVIEW');
    for(const key of ['lowEstimate','midEstimate','highEstimate'])assert.equal(response[key],undefined);
    privateCheck(response);
  }
});
test('final integration fixed range cents and unchanged outward displays traverse widget and voice',async t=>{
  // 97600*.90=87840; *1.10=107360. *.95=92720; *1.15=112240.
  for(const [sides,ends,display] of [[{},[87840,107360],[878,1074]],[{rangeLowPercent:5,rangeHighPercent:15},[92720,112240],[927,1123]]]){
    const f=custom();f.ownerPricing.pricing.price=97600;Object.assign(f.businessDefaults,{rangeBufferPercent:10,...sides});
    const w=webQuote(f),h=quoteEmailFixture(t),p=await phone(h,f);
    const r=record(internal(w.row)).range;assert.deepEqual([r.lowCents,r.highCents],ends);
    assert.deepEqual([w.result.lowEstimate,w.result.highEstimate],display);
    assert.deepEqual([p.result.lowEstimate,p.result.highEstimate],display);privateCheck(p.result);
  }
});
test('final integration CUSTOM split crosses saved approval, seasonal labor, material tax and channels',async t=>{
  // $1000: labor60000 + material40000 + labor surcharge12000 + tax6000
  // =118000. Selling prices receive no second markup.
  const f=custom();Object.assign(f.ownerPricing.pricing,{price:100000,installedMaterialsPercent:{price:40}});
  Object.assign(f.ownerPricing,{peakMonths:[10],peakSurchargePercent:20});
  Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:15,markupPercent:30,rangeLowPercent:0,rangeHighPercent:0});
  const w=webQuote(f),h=quoteEmailFixture(t),p=await phone(h,f),q=internal(w.row);
  assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(w.result.midEstimate,1180);assert.equal(p.result.midEstimate,1180);
  for(const [path,cents] of [['customSplit.labor',60000],['customSplit.material',40000],['customSplit.peakLabor',12000]])assert.equal(q.lineItems.find(l=>l.calculation.ratePath===path).amountCents,cents);
  assert.equal(record(q).scenarios.mid.tax.taxCents,6000);assert.equal(record(q).scenarios.mid.markup.amountCents,0);
  privateCheck(w.result);privateCheck(p.result);
});
