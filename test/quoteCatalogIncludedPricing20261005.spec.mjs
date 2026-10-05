import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {flatRoof,fixture} from '../verification/engine-independent/fixtures.mjs';
import {includedFixture,explicitUnderlaymentFixtureShares} from './quoteEngineVNextFixtures.mjs';
import {bookQuoteStatuses} from '../server/src/quoteDoneBridge.js';
import {vNextServiceStatus,generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {createActivationValidationVNext,validateOwnerPricing} from '../server/quote-engine-vnext/contracts.js';
import {scopeDefinitions} from '../server/scopeConfiguration.js';

// All money expectations are handwritten in specs/CATALOG_STALL_REPAIR_20261005.md.
// Timing/readiness/review/snapshot cases produce no dollar estimate.
const map=(n,value)=>Object.fromEntries(Array.from({length:n},(_,i)=>['product_'+i,typeof value==='function'?value(i):value]));
function flatCatalog(n,mode='same_axis',cover= n-1) {
  const f=flatRoof(),p=f.ownerPricing.pricing;
  Object.assign(p,{laborPerSqft:map(n,500),membraneCostPerSqft:map(n,0),tearOffPerSqft:map(n,100),membraneWasteFactor:0});
  f.ownerPricing.knownOfferings=Object.fromEntries(['membraneType','replacementMembraneType'].map(field=>[field,map(n,()=>randomUUID())]));
  f.ownerPricing=includedFixture(f.ownerPricing,Object.fromEntries(Object.keys(p.membraneCostPerSqft).map(key=>['membraneCostPerSqft.'+key,mode==='same_axis'?'laborPerSqft.'+key:'tearOffPerSqft.product_'+cover])));
  return f;
}
function roofCatalog(n,basis='sell_price') {
  const p={laborPerSquare:map(n,5000),materialCostPerSquare:map(n,10000),tearOffPerSquare:map(n,2000),underlaymentPerSquare:map(n,0),underlaymentPriceBasis:map(n,'installed_area_sell_price'),minimumJob:0,accessoryPricingMode:'per_square_allin',wasteFactorByComplexity:{simple:0,moderate:0,complex:0},pitchMultiplier:{low:1,medium:1,steep:1,very_steep:1},storyMultiplier:{1:1,2:1,3:1}};
  explicitUnderlaymentFixtureShares('ROOFING_REPLACEMENT',p);
  const f=fixture('ROOFING_REPLACEMENT',p,{roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'product_0',replacementRoofType:'product_0',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
  f.ownerPricing.priceBasisByCategory.material=basis;
  f.ownerPricing.knownOfferings=Object.fromEntries(['existingRoofType','replacementRoofType'].map(field=>[field,map(n,()=>randomUUID())]));
  f.ownerPricing=includedFixture(f.ownerPricing,Object.fromEntries(Object.keys(p.underlaymentPerSquare).map(key=>['underlaymentPerSquare.'+key,'materialCostPerSquare.'+key])));
  return f;
}
function selected(f,replacement,existing=replacement){
  const c=structuredClone(f.customerInputs),fields=f.serviceType==='FLAT_ROOF_REPLACEMENT'?['replacementMembraneType','membraneType']:['replacementRoofType','existingRoofType'];
  c[fields[0]]=replacement;c[fields[1]]=existing;
  c.confirmedFacts=Object.fromEntries(fields.map(field=>[field,{status:'identified',field,value:c[field],offeringId:f.ownerPricing.knownOfferings[field][c[field]]}]));
  return {...f,customerInputs:c};
}
for(const variant of ['same_axis','cross_first','cross_last','different_basis'])for(const path of ['full','quick','public'])test('catalog included pricing: '+variant+' 320 products via '+path,async()=>{
  const f=variant==='different_basis'?roofCatalog(320,'cost'):flatCatalog(320,variant==='same_axis'?'same_axis':'cross_axis',variant==='cross_first'?0:319);
  const before=JSON.stringify(f),book={ownerId:'synthetic-catalog-'+randomUUID(),services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'USD'}};
  const start=performance.now(),timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20));
  const status=path==='public'?bookQuoteStatuses(book)[0]:vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:path==='quick'});
  const elapsed=performance.now()-start,delay=await timer;
  assert.equal(status.status,'NEEDS PRICING');
  assert.ok(status.ownerDecisionRequired.some(d=>d.kind==='included_price_allocation'));
  assert.ok((status.productCoverage||[]).length<=640);
  assert.ok(elapsed<1500&&delay<1500,'Synchronous status/timer blocked for '+Math.round(elapsed)+'/'+Math.round(delay)+' ms');
  assert.equal(JSON.stringify(f),before);
  if(path==='public'){
    const warmStart=performance.now();assert.deepEqual(bookQuoteStatuses(book)[0],status);
    assert.ok(performance.now()-warmStart<150,'Cached public status remains compact');
  }
  console.log(JSON.stringify({variant,path,productsPerAxis:320,bytes:Buffer.byteLength(JSON.stringify(book)),elapsedMs:elapsed,timerDelayMs:delay,coverageRows:status.productCoverage?.length||0}));
});
for(const mode of ['same_axis','cross_axis'])test('catalog included pricing: final complete sibling survives '+mode+' ($13000)',()=>{
  const f=flatCatalog(320,mode);f.ownerPricing.pricing.membraneCostPerSqft.product_319=700;
  for(const quick of [false,true])assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick}).status,'QUOTING LIVE');
  const good=generateQuoteVNext(selected(f,'product_319'));
  assert.equal(good.resultType,'INSTANT_ESTIMATE_READY');assert.equal(good.midEstimate,13000);
  const bad=generateQuoteVNext(selected(f,'product_0','product_319'));
  assert.equal(bad.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(bad.ownerDecisionRequired.some(d=>d.kind==='included_price_allocation'));
});
test('catalog included pricing: a tier can repair the incomplete base ($13000)',()=>{
  const f=flatCatalog(80,'cross_axis');f.ownerPricing.tiers=[{name:'Complete',overrides:{membraneCostPerSqft:map(80,700)}}];
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  const q=generateQuoteVNext(selected(f,'product_0','product_79'));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,13000);
});
test('catalog included pricing: valid same-product material inclusion remains live ($1700)',()=>{
  const f=roofCatalog(320);
  for(const quick of [false,true])assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick}).status,'QUOTING LIVE');
  for(const key of ['product_0','product_319']){
    const q=generateQuoteVNext(selected(f,key));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1700);
  }
});
test('catalog included pricing: same-category unselected covering product cannot authorize a quote',()=>{
  const f=roofCatalog(12);
  f.ownerPricing.zeroPricePolicy.includedPrices['underlaymentPerSquare.product_0']='materialCostPerSquare.product_11';
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
  assert.equal(generateQuoteVNext(selected(f,'product_0')).resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(generateQuoteVNext(selected(f,'product_11')).midEstimate,1700);
});
test('catalog shared incomplete accessory price is checked once and a tier can repair it ($1730)',async()=>{
  const f=roofCatalog(320),p=f.ownerPricing.pricing;
  Object.assign(p,{accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories',dripEdgePerLF:100,ridgeCapPerLF:100,accessoryWasteFactor:{starterPerLF:0,dripEdgePerLF:0,ridgeCapPerLF:0}});
  const start=performance.now(),timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20));
  const s=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:true}),elapsed=performance.now()-start,delay=await timer;
  assert.equal(s.status,'NEEDS PRICING');assert.ok(s.missingOwnerFields.includes('starterPerLF'));assert.ok(elapsed<1500&&delay<1500);
  f.ownerPricing.tiers=[{name:'Complete',overrides:{starterPerLF:100}}];
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:true}).status,'QUOTING LIVE');
  Object.assign(f.customerInputs,{starterLengthLF:10,dripEdgeLengthLF:10,ridgeCapLengthLF:10});
  const q=generateQuoteVNext(selected(f,'product_319'));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1730);
});
for(const kind of ['valid','invalid-receipt','invalid-path','invalid-covering-price'])test('catalog policy cache matches ordinary validation: '+kind,()=>{
  const f=flatCatalog(12),p=f.ownerPricing.pricing;
  if(kind==='invalid-receipt')f.ownerPricing.zeroPricePolicy.serviceId=randomUUID();
  if(kind==='invalid-path')f.ownerPricing.zeroPricePolicy.includedPrices['membraneCostPerSqft.product_0']='laborPerSqft.absent';
  if(kind==='invalid-covering-price')p.laborPerSqft.product_0=0;
  const prepared=createActivationValidationVNext(f.serviceType,p,f.ownerPricing);
  for(const key of ['product_0','product_11']){
    const c=selected(f,key).customerInputs;
    assert.deepEqual(prepared.owner(c),validateOwnerPricing(f.serviceType,c,p,f.ownerPricing));
    assert.deepEqual(prepared.owner(c),validateOwnerPricing(f.serviceType,c,p,f.ownerPricing));
  }
});
test('catalog policy cache isolates changed prices, rules and returned diagnostics',()=>{
  const f=flatCatalog(12),c=selected(f,'product_0').customerInputs;
  const prepared=createActivationValidationVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing);
  assert.equal(prepared.owner(c).ok,true);
  f.ownerPricing.zeroPricePolicy.includedPrices['membraneCostPerSqft.product_0']='laborPerSqft.absent';
  assert.equal(prepared.owner(c).ok,true);
  const fresh=createActivationValidationVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing);
  const rejected=fresh.owner(c);assert.equal(rejected.ok,false);
  const expected=structuredClone(rejected);rejected.ownerDiagnostics[0].message='[SYNTHETIC] mutation';rejected.ownerDiagnostics.length=0;
  assert.deepEqual(fresh.owner(c),expected);
});
test('catalog shared included accessory retains its one valid covering product ($1720)',()=>{
  const f=roofCatalog(12),p=f.ownerPricing.pricing;
  Object.assign(p,{accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories',starterPerLF:0,dripEdgePerLF:100,ridgeCapPerLF:100,accessoryWasteFactor:{starterPerLF:0,dripEdgePerLF:0,ridgeCapPerLF:0}});
  f.ownerPricing.zeroPricePolicy.includedPrices.starterPerLF='materialCostPerSquare.product_11';
  Object.assign(f.customerInputs,{starterLengthLF:10,dripEdgeLengthLF:10,ridgeCapLengthLF:10});
  for(const quick of [false,true])assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults,{firstLiveProduct:quick}).status,'QUOTING LIVE');
  assert.equal(generateQuoteVNext(selected(f,'product_0')).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const q=generateQuoteVNext(selected(f,'product_11'));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.midEstimate,1720);
});
test('catalog definition reuse cannot be poisoned or confused across service types',()=>{
  const p=Object.freeze({underlaymentPriceBasis:Object.freeze({product_0:'cost'})});
  const first=scopeDefinitions('ROOFING_REPLACEMENT',p);
  assert.throws(()=>{first.roof_underlayment_product_0.label='[SYNTHETIC] changed';},TypeError);
  assert.deepEqual(scopeDefinitions('ROOFING_REPLACEMENT',p),first);
  assert.ok(scopeDefinitions('FLAT_ROOF_REPLACEMENT',p).insulation);
  assert.deepEqual(scopeDefinitions('ROOFING_REPLACEMENT',p),first);
});
test('catalog definition reuse never trusts an unfrozen product-key map',()=>{
  const keys={product_0:'cost'},p=Object.freeze({underlaymentPriceBasis:keys});
  assert.ok(!scopeDefinitions('ROOFING_REPLACEMENT',p).roof_underlayment_product_1);
  keys.product_1='cost';assert.ok(scopeDefinitions('ROOFING_REPLACEMENT',p).roof_underlayment_product_1);
  delete keys.product_0;assert.ok(!scopeDefinitions('ROOFING_REPLACEMENT',p).roof_underlayment_product_0);
});
