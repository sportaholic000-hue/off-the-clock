import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';

function base(f){
 const clone=structuredClone(f),c=clone.customerInputs;
 if(f.serviceType.startsWith('FENCING_')){c.gates={};if(f.serviceType==='FENCING_REPLACEMENT')c.oldFenceRemoval=false;delete c.removalLengthLF;}
 else {c.ceilingsIncluded=false;c.trimIncluded=false;delete c.ceilingAreaSqft;delete c.trimLengthLF;}
 return clone;
}
function ready(f,cents){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,cents);}
function review(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(sanitizeForCustomerVNext(q).midEstimate,undefined);}
for(const mode of ['installed','itemized'])for(const [type,scope] of [['INTERIOR_PAINTING','ceiling'],['INTERIOR_PAINTING','trim'],['FENCING_INSTALL','gate'],['FENCING_REPLACEMENT','gate'],['FENCING_REPLACEMENT','removal']])test('Offering optional '+type+' '+mode+' '+scope+' prices do not disable base work',()=>{
 const f=offeringFixture(type,mode),p=f.ownerPricing.pricing;
 const paths=scope==='ceiling'?Object.keys(p.offeringRates).filter(key=>/ceiling/i.test(key)):scope==='trim'?['installedTrimPerLF']:scope==='gate'?['gate_walk']:['removalPerLF'];
 // Installed walls: 500*600=300000; itemized: 175000 labor/prep +
 // (500*2*30 +500*20 +500*20)*1.1 =230000 cents.
 // Installed fence:100*4000=400000; itemized:100*1000 labor +
 // 100*2000*1.1 infill +14*(2000+400+600) posts/footings=362000 cents.
 const total=type==='INTERIOR_PAINTING'?(mode==='installed'?300000:230000):(mode==='installed'?400000:362000);
 ready(base(f),total);
 for(const field of paths)for(const value of [undefined,0]){
  const draft=structuredClone(f);if(value===undefined)delete draft.ownerPricing.pricing.offeringRates[field];else draft.ownerPricing.pricing.offeringRates[field]=value;
  review(draft);ready(base(draft),total);
  const status=vNextServiceStatus(draft.ownerPricing,draft.businessDefaults);assert.equal(status.status,'QUOTING LIVE');
  const key={ceiling:'ceiling_prices',trim:'trim_prices',gate:'gate_prices_walk',removal:'removal_prices'}[scope];
  assert.equal(status.scopeCoverage.find(row=>row.key===key).configurationComplete,false);
 }
 p.offeringRates[paths[0]]=-1;review(base(f));assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
});
for(const key of ['paint_ceiling','paint_ceiling_primer'])for(const field of ['price','coverage','wastePercent','description','productKey'])test('Shared paint purchase group: unfinished '+key+'.'+field+' does not contradict wall prices',()=>{
 const f=structuredClone(measuredScopeCases().find(row=>row.id==='paint-cost-packages').input),p=f.ownerPricing.pricing;
 if(field==='price')delete p.scopeRates[key];else delete p.scopeDetails[key][field];
 review(f);const walls=base(f);
 // 175000 labor/prep +ceil(1000*1.1/400)*5000 finish +
 // ceil(500*1.1/400)*4000 primer +ceil(500*1.1/100)*2000 prep =210000.
 ready(walls,210000);const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
 assert.equal(status.status,'QUOTING LIVE');assert.equal(status.scopeCoverage.find(row=>row.key===key).configurationComplete,false);
});
for(const reverse of [false,true])test('Shared paint purchase group rejects conflicting supplied values in either map order '+reverse,()=>{
 for(const [field,value] of [['price',5001],['coverage',401],['wastePercent',11]]){
  const f=structuredClone(measuredScopeCases().find(row=>row.id==='paint-cost-packages').input),p=f.ownerPricing.pricing;
  if(field==='price')p.scopeRates.paint_ceiling=value;else p.scopeDetails.paint_ceiling[field]=value;
  if(reverse)p.scopeDetails=Object.fromEntries(Object.entries(p.scopeDetails).reverse());
  review(base(f));assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
 }
});
