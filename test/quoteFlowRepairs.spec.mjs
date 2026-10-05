import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext,vNextServiceStatus,getVNextPriceBookMetadata} from '../server/quote-engine-vnext/index.js';
import {mowing,flatRepair,flooring,custom} from '../verification/engine-independent/fixtures.mjs';
const ready='INSTANT_ESTIMATE_READY',review='ESTIMATE_REQUIRES_REVIEW';
function total(request,cents){const r=generateQuoteVNext(request);assert.equal(r.resultType,ready,JSON.stringify(r));assert.equal(r.options[0].calculationRecord.scenarios.mid.finalTotalCents,cents);assert.equal(sanitizeForCustomerVNext(r).midEstimate,cents/100);return r;}

// Expected cents are recorded here before execution, independently of engine output.
const addons=[
 {name:'Clipping bagging and disposal',make:mowing,select:{bagClippings:true},field:'baggingSurchargePercent',rate:10,base:10000,extra:1000},
 {name:'Lawn edging',make:mowing,select:{edgingIncluded:true,edgingLengthLF:100},field:'edgingPerLinearFoot',rate:50,base:10000,extra:5000},
 {name:'Ponding water surcharge',make:flatRepair,select:{pondingWater:true},field:'pondingWaterSurcharge',rate:7000,base:36000,extra:7000}
];
for(const f of addons)test('optional extra: '+f.name+' preserves main price, submitted scope and per-option disclosure',()=>{
 const request=f.make();Object.assign(request.customerInputs,f.select);
 const original=structuredClone(request.customerInputs),r=total(request,f.base);
 assert.deepEqual(r.submittedCustomerInputs,original);
 assert.deepEqual(r.options[0].skippedAddons,[f.name]);
 assert.ok(r.options[0].disclaimer.includes('This estimate does not include: '+f.name+'.'));
 assert.ok(sanitizeForCustomerVNext(r).options[0].disclaimer.includes(f.name));
 assert.ok(r.appliedRules.includes(f.name+' skipped: price not configured'));
 assert.ok(!r.lineItems.some(l=>l.name===f.name));
 assert.equal(vNextServiceStatus(request.ownerPricing,request.businessDefaults).status,'QUOTING LIVE');
 request.ownerPricing.pricing[f.field]=f.rate;const priced=total(request,f.base+f.extra);
 assert.deepEqual(priced.options[0].skippedAddons,[]);assert.equal(priced.lineItems.find(l=>l.name===f.name).amountCents,f.extra);
 request.ownerPricing.pricing[f.field]=0;const free=total(request,f.base);assert.deepEqual(free.options[0].skippedAddons,[]);assert.equal(free.lineItems.find(l=>l.name===f.name).amountCents,0);
});
test('tier exclusions remain specific; missing optional prices keep valid lower-priced options',()=>{
 const request=mowing();Object.assign(request.customerInputs,{bagClippings:true,edgingIncluded:true,edgingLengthLF:100});
 request.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Better',overrides:{baggingSurchargePercent:10}},{name:'Best',overrides:{baggingSurchargePercent:10,edgingPerLinearFoot:50}}];
 const r=total(request,10000);assert.deepEqual(r.options.map(o=>o.calculationRecord.scenarios.mid.finalTotalCents),[10000,11000,16000]);
 assert.deepEqual(r.options.map(o=>o.skippedAddons),[['Clipping bagging and disposal','Lawn edging'],['Lawn edging'],[]]);
 assert.ok(!r.disclaimer.includes('This estimate does not include:'));
 assert.ok(r.appliedRules.includes('Good tier: Lawn edging skipped: price not configured'));
 assert.ok(r.appliedRules.includes('Better tier: Lawn edging skipped: price not configured'));
 assert.equal(sanitizeForCustomerVNext(r).options.length,3);
});
test('malformed optional prices and missing main-job rates still require correction',()=>{
 for(const f of addons)for(const bad of [null,'',-1,NaN,Infinity,'10']){
  const request=f.make();Object.assign(request.customerInputs,f.select);request.ownerPricing.pricing[f.field]=bad;
  assert.equal(generateQuoteVNext(request).resultType,review,String(bad));
 }
 const request=mowing();request.customerInputs.bagClippings=true;delete request.ownerPricing.pricing.mowingBaseRatePerSqft;
 assert.equal(generateQuoteVNext(request).resultType,review);
});
test('flooring default thresholds follow the specified 150 medium / 300 large bands',()=>{
 // tile material = area * 1.12 * 500; labor = area * 300 * room multiplier.
 for(const [area,cents,band] of [[149,137080,'small'],[150,133500,'medium'],[151,134390,'medium'],[299,266110,'medium'],[300,258000,'large'],[301,258860,'large']]){
  const r=total(flooring('tile',area),cents);assert.equal(r.options[0].calculationRecord.ruleApplications.find(x=>x.name==='averageRoomComplexityBand').result,band);
 }
 const twoRooms=flooring('tile',300);twoRooms.customerInputs.roomCount=2;total(twoRooms,267000);
 const twoLarge=flooring('tile',600);twoLarge.customerInputs.roomCount=2;total(twoLarge,516000);
});
test('fixed custom service positive control has an explicit amount and confirmed service',()=>{total(custom(),12500);});
test('custom price category is an editable owner setting, never a guessed allocation',()=>{
 const request=custom();delete request.ownerPricing.pricing.customChargeClassification;
 assert.equal(generateQuoteVNext(request).resultType,review);
 const metadata=getVNextPriceBookMetadata().find(s=>s.serviceType==='CUSTOM');
 assert.ok(metadata.pricingFields.some(f=>f.field==='customChargeClassification'&&!f.reviewOnly));
 for(const category of ['labor','material','removal','prep','addon','equipment']){request.ownerPricing.pricing.customChargeClassification=category;total(request,12500);assert.equal(vNextServiceStatus(request.ownerPricing,request.businessDefaults).status,'QUOTING LIVE');}
 request.ownerPricing.pricing.customChargeClassification='guess';assert.equal(generateQuoteVNext(request).resultType,review);
});
test('fixed custom units retain measured quantities and fractional-cent unit prices',()=>{
 for(const [unit,quantity,cents] of [['flat',{},1001],['per_hour',{hours:1.5},1502],['per_unit',{itemCount:3},3003],['per_sqft',{areaSqft:2.5},2503],['per_LF',{linearFeet:10.25},10260],['per_square',{roofSquares:2.5},2503]]){
  const r=custom();Object.assign(r.ownerPricing.pricing,{unit,price:1001});Object.assign(r.customerInputs,{unit,...quantity});total(r,cents);
 }
 const f=custom();Object.assign(f.ownerPricing.pricing,{unit:'per_sqft',price:0.5});Object.assign(f.customerInputs,{unit:'per_sqft',areaSqft:1000});total(f,500);
 const flat=custom();flat.ownerPricing.pricing.price=0.5;assert.equal(generateQuoteVNext(flat).resultType,review);
});
test('custom cost and final selling price follow saved markup tax fee and minimum rules',()=>{
 const f=custom();Object.assign(f.businessDefaults,{markupPercent:1200});total(f,12500);
 f.ownerPricing.priceBasisByCategory.labor='cost';f.businessDefaults.markupPercent=20;total(f,15000);
 Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:10});total(f,16500);
 f.ownerPricing.feeRules.travel='customer_selected';f.businessDefaults.travelFee=500;f.feeSelections={customer:{travel:true}};total(f,17050);
 f.ownerPricing.pricing.minimumJob=20000;total(f,22000);
 const material=custom();material.ownerPricing.pricing.customChargeClassification='material';material.ownerPricing.taxabilityByCategory.material=true;Object.assign(material.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10});total(material,13750);
 material.ownerPricing.pricing.customChargeClassification='labor';total(material,12500);
});
test('custom configured ranges preserve independently calculated low midpoint and high scenarios',()=>{
 for(const [low,high,qty,amounts] of [[10000,20000,2,[20000,30000,40000]],[100,101,3,[300,302,303]],[0.5,1.5,1000,[500,1000,1500]]]){
  const f=custom();Object.assign(f.ownerPricing.pricing,{customPricingMode:'range',unit:'per_hour',low,high});delete f.ownerPricing.pricing.price;Object.assign(f.customerInputs,{unit:'per_hour',hours:qty});
  const r=generateQuoteVNext(f);assert.equal(r.resultType,ready,JSON.stringify(r));const s=r.options[0].calculationRecord.scenarios;assert.deepEqual([s.low.finalTotalCents,s.mid.finalTotalCents,s.high.finalTotalCents],amounts);assert.equal(sanitizeForCustomerVNext(r).resultType,ready);
 }
});
test('custom service confirmation missing quantities mismatched units and unsafe amounts still review',()=>{
 const cases=[f=>f.customerInputs.serviceConfirmed=false,f=>f.customerInputs.service='Another job',f=>f.customerInputs.unit='per_hour',f=>f.ownerPricing.pricing.price=-1,f=>f.ownerPricing.pricing.customPricingMode='inspection_first'];
 for(const change of cases){const f=custom();change(f);assert.equal(generateQuoteVNext(f).resultType,review);}
 const f=custom();Object.assign(f.ownerPricing.pricing,{unit:'per_hour',price:Number.MAX_SAFE_INTEGER});Object.assign(f.customerInputs,{unit:'per_hour',hours:2});assert.equal(generateQuoteVNext(f).resultType,review);
});
