import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {convertPricebookMoney,validatePricebookNumericDraft} from '../server/priceBookMoney.js';
import {servicePricing} from '../client/src/pricebookEditing.js';

// Handwritten expectations before execution:
// - A $0.005 product rate stores as 0.5 cents, without changing any factors.
// - A $0.005 installed-area rate cannot become a package fixed charge: it is
//   half a cent. A $0.01 package fixed charge stores as exactly one cent.
// - 10,000 square feet at the saved $0.005 rate is $50; an unsaved $0.0075
//   draft previews as $75, remains customer-ineligible and does not change $50.

const directory=mkdtempSync(join(tmpdir(),'otc-converter-regressions-'));
process.env.PRICEBOOK_PATH=join(directory,'books');
process.env.DATABASE_PATH=join(directory,'synthetic.sqlite');
const store=await import('../server/priceBookService.js');
const bridge=await import('../server/src/quoteDoneBridge.js');
const database=await import('../server/src/db.js');
database.migrate();
test.after(()=>{database.db.close();rmSync(directory,{recursive:true,force:true});});

test('every current Class 2 factor survives root, nested and tier money boundaries without scaling',()=>{
  for(const [serviceType,definitions] of Object.entries(CLASS2_DEFINITIONS)) {
    const factors=Object.fromEntries(Object.entries(definitions).map(([field,definition])=>[field,structuredClone(definition.defaultValue)]));
    const service={serviceType,...structuredClone(factors),pricing:structuredClone(factors),tiers:[{name:'Factors',overrides:structuredClone(factors)}]};
    const before=structuredClone(service);
    assert.equal(validatePricebookNumericDraft(service),true,serviceType);
    assert.deepEqual(convertPricebookMoney(service,'toCents'),before,serviceType);
    assert.deepEqual(convertPricebookMoney(service,'toDollars'),before,serviceType);
    assert.deepEqual(service,before,serviceType+' must not mutate the draft');
    for(const [field,value] of Object.entries(factors)) {
      const invalid=structuredClone(service);
      invalid.pricing[field]=typeof value==='number'?'0.1x':{...value,[Object.keys(value)[0]]:'1x'};
      // Resolve the duplicate root copy so this exercises numeric validation.
      invalid[field]=structuredClone(invalid.pricing[field]);
      assert.throws(()=>validatePricebookNumericDraft(invalid),/numeric|number|finite/i,serviceType+'.'+field);
    }
  }
});

for(const [serviceType,field,key] of [
  ['FLOORING_INSTALL','removalPerSqft','carpet'],
  ['FLOORING_REPLACEMENT','removalPerSqft','carpet'],
  ['LANDSCAPING_MULCH','bedPrepLaborPerSqft','needs_weeding'],
  ['LANDSCAPING_PLANTING','bedPrepLaborPerSqft','overgrown']
]) for(const placement of ['root','nested']) test('current product map '+serviceType+'.'+field+' validates '+placement+' and inherited tier values',()=>{
  const prices={[field]:{[key]:0.005}};
  const service={serviceType,...(placement==='root'?prices:{pricing:prices}),tiers:[{name:'Map',overrides:{[field]:{[key]:0.01}}}]};
  const before=structuredClone(service);
  assert.equal(bridge.applicationMetadata().services.find(row=>row.serviceType===serviceType).fields.find(row=>row.field===field).type,'json');
  assert.equal(validatePricebookNumericDraft(service),true);
  const cents=convertPricebookMoney(service,'toCents');
  assert.equal((placement==='root'?cents:cents.pricing)[field][key],0.5);
  assert.equal(cents.tiers[0].overrides[field][key],1);
  assert.deepEqual(convertPricebookMoney(cents,'toDollars'),before);
  const invalid=structuredClone(service);
  invalid.tiers[0].overrides[field][key]='0.01x';
  assert.throws(()=>validatePricebookNumericDraft(invalid),/numeric|number|finite/i);
  assert.deepEqual(service,before);
});

test('a scope tier cannot reinterpret an inherited fractional-cent rate as a fixed package charge',()=>{
  const field='floor_underlayment_laminate';
  const service={serviceType:'FLOORING_INSTALL',pricing:{
    scopeDetails:{[field]:{description:'Synthetic underlayment',mode:'installed_area_sell_price',productKey:'synthetic_underlayment'}},
    scopeRates:{[field]:0.005}
  },tiers:[{name:'Package',overrides:{scopeDetails:{[field]:{description:'Synthetic package',mode:'package_cost',productKey:'synthetic_underlayment',coverage:100,wastePercent:10}}}}]};
  const before=structuredClone(service);
  assert.throws(()=>convertPricebookMoney(service,'toCents'),/whole.cent|fixed|cent/i);
  assert.deepEqual(service,before);
  service.tiers[0].overrides.scopeRates={[field]:0.01};
  const cents=convertPricebookMoney(service,'toCents');
  assert.equal(cents.pricing.scopeRates[field],0.5);
  assert.equal(cents.tiers[0].overrides.scopeRates[field],1);
  assert.deepEqual(convertPricebookMoney(cents,'toDollars'),service);
});

test('pure nested editor views retain identity while mixed current and retained factors stay visible',()=>{
  const nested={serviceType:'INTERIOR_PAINTING',service:'Synthetic painting',pricing:{minimumJob:0}};
  assert.equal(servicePricing(nested),nested.pricing);
  const mixed={...nested,ceilingMaterialFactor:0.23,paintWasteFactor:0.1375};
  const before=structuredClone(mixed);
  assert.deepEqual(servicePricing(mixed),{ceilingMaterialFactor:0.23,paintWasteFactor:0.1375,minimumJob:0});
  assert.deepEqual(mixed,before);
});

test('a server creation receipt enables draft preview without granting customer approval or changing saved prices',()=>{
  const ownerId='synthetic-creation-'+randomUUID();
  const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
  const all=value=>Object.fromEntries(categories.map(category=>[category,value]));
  const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(true),peakMonths:[],peakSurchargePercent:0};
  const service={serviceType:'LANDSCAPING_MOWING',service:'Saved mowing',source:'MANUAL',active:true,tiers:[],
    feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),
    pricing:{mowingBaseRatePerSqft:0.005,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}}};
  bridge.saveApplicationBook(ownerId,{revision:bridge.readApplicationBook(ownerId).revision,services:[service],defaults});
  const saved=store.loadPricebook(ownerId),raw=saved.services[0];
  assert.equal(raw.origin.ownerId,ownerId);assert.equal(raw.origin.serviceId,raw.id);assert.equal(raw.origin.serviceType,raw.serviceType);assert.equal(raw.origin.source,'MANUAL');
  assert.equal(raw.quoteDoneApproval,undefined);
  assert.equal(bridge.applicationStatus(raw,saved).approvalCurrent,false);
  assert.equal(bridge.applicationStatus(raw,saved).status,'NEEDS PRICING');
  const draft=bridge.readApplicationBook(ownerId);draft.services[0].service='Draft mowing';draft.services[0].pricing.mowingBaseRatePerSqft=0.0075;
  const customerInputs={yardSqft:10000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false};
  const preview=bridge.previewApplicationQuote(ownerId,{revision:draft.revision,serviceId:raw.id,service:draft.services[0],defaults:draft.defaults,customerInputs});
  assert.equal(preview.midEstimate,75);assert.equal(preview.customerEligible,false);assert.equal(preview.pricedScope.service,'Draft mowing');
  assert.deepEqual(store.loadPricebook(ownerId),saved);
  const spoofed=bridge.readApplicationBook(ownerId);spoofed.services[0].origin.ownerId='another-owner';
  assert.throws(()=>bridge.saveApplicationBook(ownerId,spoofed),error=>error.statusCode===409);
  assert.deepEqual(store.loadPricebook(ownerId),saved);
  bridge.approveApplicationService(ownerId,raw.id,{revision:bridge.bookRevision(saved),confirmConfiguration:true});
  const approved=store.loadPricebook(ownerId);
  assert.equal(bridge.applicationStatus(approved.services[0],approved).status,'QUOTING LIVE');
  const quote=bridge.calculateApplicationQuote(approved,approved.services[0],{customerInputs,contact:{email:'synthetic@example.invalid'}},{ownerId}).customerResult;
  assert.equal(quote.midEstimate,50);
});
