import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';

// Independent cents expectations, written before execution:
// Fence installed: 100*4000+2*25000=450000; removal adds50*800=40000.
// Fence itemized:100*(1000+2000)+14*(2000+400+600)+2*25000=392000.
// Interior installed:500*600+200*300+100*200=380000.
// Interior itemized:500*2*(100+30)+500*(50+20)+120*(100+20)
//                   +200*2*(80+25)+200*(40+15)+100*200=252400.
// Exterior installed:500*600=300000.
// Exterior itemized:500*2*(100+30)+500*(50+20)+120*(100+20)=179400.
const cases=[['FENCING_INSTALL','installed',450000],['FENCING_INSTALL','itemized',392000],['FENCING_REPLACEMENT','installed',490000],['FENCING_REPLACEMENT','itemized',432000],['INTERIOR_PAINTING','installed',380000],['INTERIOR_PAINTING','itemized',252400],['EXTERIOR_PAINTING','installed',300000],['EXTERIOR_PAINTING','itemized',179400]];
for(const [type,mode,cents] of cases)test(`${type} ${mode}: independent complete quote`,()=>{
  const input=offeringFixture(type,mode),result=generateQuoteVNext(input);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));
  assert.equal(result.midEstimate,cents/100);assert.equal(result.lineItems.reduce((sum,line)=>sum+line.amountCents,0),cents);
  const customer=sanitizeForCustomerVNext(result);assert.equal(customer.midEstimate,cents/100);
  assert.equal(customer.lineItems,undefined);assert.ok(customer.disclaimer.includes('[SYNTHETIC]'));
  const status=vNextServiceStatus(input.ownerPricing,input.businessDefaults);assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));
});
test('Configured offerings: missing selected prices and mismatched defined scope do not quote',()=>{
  for(const [type,mode] of cases){
    const missing=offeringFixture(type,mode);delete missing.ownerPricing.pricing.offeringRates[Object.keys(missing.ownerPricing.pricing.offeringRates)[0]];
    assert.equal(generateQuoteVNext(missing).resultType,'ESTIMATE_REQUIRES_REVIEW');
    const mismatch=offeringFixture(type,mode);if(type.startsWith('FENCING_'))mismatch.customerInputs.fenceHeight=8;else mismatch.customerInputs.coats=3;
    assert.equal(generateQuoteVNext(mismatch).resultType,'ESTIMATE_REQUIRES_REVIEW');
  }
});
test('Configured offerings: nested gate input, unexpected scope and contradictory fields cannot disappear',()=>{
  const variants=[c=>c.gates={walk:{count:2,additionalWork:'unpriced'}},c=>c.gates={unoffered:1},c=>c.gates={walk:-1},c=>c.additionalWork='unpriced',c=>c.postCount=14];
  for(const change of variants){const input=offeringFixture('FENCING_INSTALL','installed');change(input.customerInputs);assert.equal(generateQuoteVNext(input).resultType,'ESTIMATE_REQUIRES_REVIEW');}
  const invalid=offeringFixture('INTERIOR_PAINTING','itemized');invalid.customerInputs.prepAreaSqft=Infinity;assert.equal(generateQuoteVNext(invalid).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('Configured offerings: fractional-cent unit rates and installed selling-price markup behavior',()=>{
  const input=offeringFixture('FENCING_INSTALL','installed');input.customerInputs.gates={};input.customerInputs.linearFeet=10000;input.ownerPricing.pricing.offeringRates.installedFencePerLF=0.5;input.businessDefaults.markupPercent=1200;
  assert.equal(generateQuoteVNext(input).midEstimate,50);
});

test('Itemized fence: owner cost markup and sales tax apply once; installed gates stay selling prices',()=>{
  const input=offeringFixture('FENCING_INSTALL','itemized');
  input.businessDefaults.markupPercent=25;input.businessDefaults.taxMode='TAX_ALL';input.businessDefaults.taxPercent=10;
  for(const category of Object.keys(input.ownerPricing.taxabilityByCategory))input.ownerPricing.taxabilityByCategory[category]=true;
  const result=generateQuoteVNext(input);
  // $3420 cost *1.25 + $500 installed gates = $4775; 10% tax = $5252.50.
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));assert.equal(result.midEstimate,5252.50);
});

test('Fence removal disposal is charged exactly once and only when selected',()=>{
  const input=offeringFixture('FENCING_REPLACEMENT','installed');input.ownerPricing.feeRules.disposal='when_scope_selected';input.businessDefaults.disposalFee=15000;
  assert.equal(generateQuoteVNext(input).midEstimate,4900);
  input.ownerPricing.pricing.offeringDetails.removalIncludesDisposal=false;assert.equal(generateQuoteVNext(input).midEstimate,5050);
  input.customerInputs.oldFenceRemoval=false;delete input.customerInputs.removalLengthLF;assert.equal(generateQuoteVNext(input).midEstimate,4500);
});

test('Offering definitions do not convert zero required prices into a free job',()=>{
  for(const [type,mode] of cases){const input=offeringFixture(type,mode);for(const key of Object.keys(input.ownerPricing.pricing.offeringRates))input.ownerPricing.pricing.offeringRates[key]=0;const result=generateQuoteVNext(input);assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(result));}
});

test('All painting surface conditions quote only their explicitly defined finish, primer and preparation',()=>{
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING'])for(const mode of ['installed','itemized'])for(const condition of ['good','fair','poor']){
    const input=offeringFixture(type,mode);input.ownerPricing.pricing.offeringDetails.surfaceCondition=condition;input.customerInputs.surfaceCondition=condition;
    const result=generateQuoteVNext(input);assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));assert.equal(result.midEstimate,cases.find(c=>c[0]===type&&c[1]===mode)[2]/100);
  }
});

test('Inactive owner choices retain saved values without adding charges, and unknown shapes remain invalid',()=>{
  const input=offeringFixture('INTERIOR_PAINTING','installed');input.ownerPricing.pricing.offeringDetails.ceilingsOffered=false;input.ownerPricing.pricing.offeringDetails.trimOffered=false;
  input.customerInputs.ceilingsIncluded=false;input.customerInputs.trimIncluded=false;delete input.customerInputs.ceilingAreaSqft;delete input.customerInputs.trimLengthLF;
  assert.equal(generateQuoteVNext(input).midEstimate,3000);
  input.ownerPricing.pricing.offeringRates.unspecifiedScope=100;assert.equal(generateQuoteVNext(input).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const malformed=offeringFixture('FENCING_INSTALL','installed');malformed.ownerPricing.pricing.offeringDetails.gates.walk=null;assert.equal(generateQuoteVNext(malformed).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('Tier rate overrides retain inherited scope and disclose unusable options',()=>{
  const input=offeringFixture('FENCING_INSTALL','installed');input.ownerPricing.tiers=[{name:'Standard',overrides:{}},{name:'Premium',overrides:{offeringRates:{installedFencePerLF:5000}}},{name:'Incomplete',overrides:{offeringRates:{installedFencePerLF:0}}}];
  const result=generateQuoteVNext(input);assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));assert.deepEqual(result.options.map(o=>o.midEstimate),[4500,5500]);assert.ok(sanitizeForCustomerVNext(result).optionAvailabilityNotice.includes('Fewer options'));
});
