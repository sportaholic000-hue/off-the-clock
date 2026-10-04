// Independent acceptance checks for the five findings reported at eda14525.
// Run from a checkout with Node 22 and locked dependencies installed:
// node --test test/quoteAuditAcceptance20261004.spec.mjs
// Synthetic local data only. The original missing-minimum case failed on
// 6eb6622 and is now retained in the strict quote/price-book regression gate.
import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {flatRoof} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {customerFieldForInputs,clearChangedScopeConfirmations} from '../server/scopeConfiguration.js';
const directory=mkdtempSync(join(tmpdir(),'otc-independent-followup-'));
process.env.PRICEBOOK_PATH=join(directory,'books');
process.env.JWT_SECRET='SYNTHETIC_LOCAL_VERIFICATION_ONLY';
const b=await import('../server/src/quoteDoneBridge.js');
const store=await import('../server/priceBookService.js');
after(()=>rmSync(directory,{recursive:true,force:true}));
const scope=id=>structuredClone(measuredScopeCases().find(row=>row.id===id).input);
function saveAndApprove(f){
 const ownerId='synthetic-followup-'+randomUUID(),service=structuredClone(f.ownerPricing);delete service.origin;
 const draft=b.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'USD',quoteTimeZone:'UTC'}},'toDollars');
 b.saveApplicationBook(ownerId,{...b.readApplicationBook(ownerId),...draft});
 const saved=store.loadPricebook(ownerId);
 b.approveApplicationService(ownerId,service.id,{revision:b.bookRevision(saved),confirmConfiguration:true,confirmLegacySettings:true});
 return store.loadPricebook(ownerId);
}
function prepare(book,customerInputs){
 const submission={requestId:randomUUID(),intakeFlow:'job-details-v1',serviceId:book.services[0].id,customerInputs,contact:{email:'synthetic@example.invalid'}};
 const prepared=b.prepareApplicationIntake(book.ownerId,submission);
 return {prepared,submission};
}
function customerQuote(book,customerInputs){
 const {prepared,submission}=prepare(book,customerInputs);assert.equal(prepared.status,'ready');
 return b.calculateApplicationQuote(book,book.services[0],{...submission,intakeConfirmation:prepared.confirmation},{ownerId:book.ownerId}).customerResult;
}
for(const type of ['FENCING_INSTALL','FENCING_REPLACEMENT'])test('QP-01 '+type+': the original 4 ft selection never produces the conflicting 8 ft option',()=>{
 const f=offeringFixture(type,'installed');
 f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{offeringDetails:{gates:{walk:{widthLF:8,description:'[SYNTHETIC] Eight-foot gate'}}},offeringRates:{gate_walk:50000}}}];
 const book=saveAndApprove(f),q=customerQuote(book,f.customerInputs);
 assert.deepEqual(q.options.map(o=>o.tierName),['Good']);assert.equal(q.midEstimate,type==='FENCING_INSTALL'?4500:4900);
 assert.match(q.pricedScope.facts.find(f=>f.label==='Gates by measured opening width').value,/4 ft/);
 assert.doesNotMatch(JSON.stringify(q),/8 ft gate/);
 assert.equal(customerQuote(book,{...f.customerInputs,gates:{}}).options.length,2);
});
test('QP-01 control: same-width gate upgrades retain both original expected totals',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed');f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{offeringRates:{gate_walk:50000}}}];
 assert.deepEqual(customerQuote(saveAndApprove(f),f.customerInputs).options.map(o=>o.midEstimate),[4500,5000]);
});
test('QP-02: the original tier-only hardwood package can be answered, prepared, and quoted',()=>{
 const f=scope('floor-hardwood-packages'),p=f.ownerPricing.pricing;
 f.ownerPricing.tiers=[{name:'Good',overrides:{scopeDetails:p.scopeDetails,scopeRates:p.scopeRates}}];delete p.scopeDetails;delete p.scopeRates;
 const book=saveAndApprove(f),definition=b.applicationServiceDefinition(book.services[0]);
 assert.equal(b.applicationStatus(book.services[0],book).status,'QUOTING LIVE');
 assert.ok(definition.customerFields.some(f=>f.name==='underlaymentScopeConfirmed'));
 const missing={...f.customerInputs};delete missing.underlaymentScopeConfirmed;
 assert.equal(prepare(book,missing).prepared.status,'needs_details');
 assert.equal(customerQuote(book,f.customerInputs).midEstimate,2060);
});
for(const [type,key,legacy,baseline,expected] of [['FENCING_INSTALL','terrainSlope','moderate','flat',4500],['FENCING_REPLACEMENT','terrainSlope','steep','flat',4900],['INTERIOR_PAINTING','wallHeight','high','standard',3800],['EXTERIOR_PAINTING','stories',2,1,3000]])test('QP-03 '+type+': confirmed baseline quotes, adjusted job without shares still reviews',()=>{
 const f=offeringFixture(type,'installed');delete f.ownerPricing.pricing.installedLaborPercent;
 Object.assign(f.ownerPricing.pricing.offeringDetails,{[key]:legacy,baselinePricesConfirmed:true});f.customerInputs[key]=baseline;
 const book=saveAndApprove(f),status=b.applicationStatus(book.services[0],book);
 assert.equal(status.approvalCurrent,true);assert.equal(status.status,'QUOTING LIVE');
 assert.equal(customerQuote(book,f.customerInputs).midEstimate,expected);
 assert.equal(prepare(book,{...f.customerInputs,[key]:legacy}).prepared.status,'needs_details');
 assert.ok(status.laborAdjustmentCoverage.length);
});
for(const reverse of [false,true])test('QP-04: original distinct package products display only the selected confirmation; reverse='+reverse,()=>{
 const f=scope('floor-hardwood-packages'),p=f.ownerPricing.pricing;
 p.scopeDetails.floor_underlayment_vinyl_plank={mode:'package_cost',productKey:'vinyl_product',coverage:500,wastePercent:5,description:'[SYNTHETIC] VINYL ONLY PRODUCT'};
 p.scopeRates.floor_underlayment_vinyl_plank=20000;p.vinylPlankUnderlaymentRule='always_included';p.laborPerSqft.vinyl_plank=300;p.materialPerSqft.vinyl_plank=500;
 if(reverse)p.scopeDetails=Object.fromEntries(Object.entries(p.scopeDetails).reverse());
 const book=saveAndApprove(f),fields=b.applicationServiceDefinition(book.services[0]).customerFields;
 const field=fields.find(x=>x.name==='underlaymentScopeConfirmed'),view=customerFieldForInputs(field,f.customerInputs);
 assert.match(view.label,/hardwood/);assert.doesNotMatch(JSON.stringify(view.details),/VINYL ONLY/);
 const changed=clearChangedScopeConfirmations(fields,f.customerInputs,{...f.customerInputs,newFlooringType:'vinyl_plank'});
 assert.equal(changed.underlaymentScopeConfirmed,undefined);
 assert.equal(clearChangedScopeConfirmations(fields,f.customerInputs,{...f.customerInputs,sqft:300}).underlaymentScopeConfirmed,true);
 const q=customerQuote(book,f.customerInputs);assert.equal(q.midEstimate,2060);
 assert.match(q.pricedScope.facts.find(x=>/Confirmed hardwood/.test(x.label)).label,/hardwood/);
});
function originalCatalog(){
 const f=flatRoof(),p=f.ownerPricing.pricing;
 for(const key of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'])p[key]=Object.fromEntries(Array.from({length:80},(_,i)=>['product_'+i,500]));
 f.ownerPricing.knownOfferings=Object.fromEntries(['membraneType','replacementMembraneType'].map(field=>[field,Object.fromEntries(Array.from({length:80},(_,i)=>['product_'+i,randomUUID()]))]));
 delete p.minimumJob;
 return {services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'USD',quoteTimeZone:'UTC'}};
}
test('QP-05: ORIGINAL 80-by-80 missing-minimum public catalog returns without blocking the worker',async()=>{
 const book=originalCatalog(),start=performance.now();
 const timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20));
 const status=b.bookQuoteStatuses(book)[0],elapsed=performance.now()-start,delay=await timer;
 assert.equal(status.status,'NEEDS PRICING');assert.ok(status.missingOwnerFields.includes('minimumJob'));
 console.log(JSON.stringify({case:'original-missing-minimum',bytes:JSON.stringify(book).length,productsPerAxis:80,elapsedMs:elapsed,timerDelayMs:delay}));
 assert.ok(elapsed<1500&&delay<1500,'Global missing minimum still causes synchronous pair enumeration: '+Math.round(elapsed)+' ms; timer '+Math.round(delay)+' ms');
});
test('QP-05 repaired control: disabled original catalog returns promptly',()=>{
 const book=originalCatalog();book.services[0].active=false;const start=performance.now();
 assert.equal(b.bookQuoteStatuses(book)[0].status,'DISABLED');const elapsed=performance.now()-start;
 console.log(JSON.stringify({case:'disabled-original',elapsedMs:elapsed}));assert.ok(elapsed<1500);
});
test('QP-05 valid control: restored explicit zero minimum permits a fast live engine check',()=>{
 const book=originalCatalog(),s=book.services[0];s.pricing.minimumJob=0;const start=performance.now();
 assert.equal(vNextServiceStatus(s,book.defaults,{firstLiveProduct:true}).status,'QUOTING LIVE');
 const elapsed=performance.now()-start;console.log(JSON.stringify({case:'restored-minimum',elapsedMs:elapsed}));assert.ok(elapsed<1500);
});

test('QP-05: original missing minimum also returns promptly with detailed owner status',()=>{
 const book=originalCatalog(),before=JSON.stringify(book),start=performance.now();
 const status=vNextServiceStatus(book.services[0],book.defaults);
 assert.equal(status.status,'NEEDS PRICING');assert.ok(status.missingOwnerFields.includes('minimumJob'));
 assert.ok(performance.now()-start<1500);assert.equal(JSON.stringify(book),before);
});
for(const [label,value,kind] of [
 ['undefined',undefined,'missing'],['null',null,'missing'],['negative',-1,'invalid'],
 ['fractional cents',0.5,'invalid'],['numeric string','0','invalid'],['boolean',false,'invalid'],
 ['unsafe integer',Number.MAX_SAFE_INTEGER+1,'invalid'],['object',{},'invalid']
])test('QP-05: '+label+' minimum fails both readiness modes before pair search',()=>{
 const book=originalCatalog(),s=book.services[0];s.pricing.minimumJob=value;
 for(const firstLiveProduct of [false,true]){
  const start=performance.now(),status=vNextServiceStatus(s,book.defaults,{firstLiveProduct});
  assert.equal(status.status,'NEEDS PRICING');
  assert.ok(status[kind==='missing'?'missingOwnerFields':'invalidOwnerFields'].includes('minimumJob'));
  assert.ok(performance.now()-start<1500);
 }
});
function catalogRequest(book,replacement='product_0',existing='product_0'){
 const f=flatRoof();f.ownerPricing=book.services[0];f.businessDefaults=book.defaults;
 Object.assign(f.customerInputs,{replacementMembraneType:replacement,membraneType:existing});
 f.customerInputs.confirmedFacts=Object.fromEntries([['replacementMembraneType',replacement],['membraneType',existing]].map(([field,value])=>[field,{status:'identified',field,value,offeringId:f.ownerPricing.knownOfferings[field][value]}]));
 return f;
}
for(const minimumJob of [0,2000000])test('QP-05: valid tier supplies missing base minimum '+minimumJob+' without changing cents',()=>{
 const book=originalCatalog(),s=book.services[0];
 s.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{minimumJob}}];
 const before=JSON.stringify(book);
 for(const firstLiveProduct of [false,true]){
  const status=vNextServiceStatus(s,book.defaults,{firstLiveProduct});
  assert.equal(status.status,'QUOTING LIVE');assert.deepEqual(status.validTierNames,['Best']);
  assert.ok(status.failedTierDiagnostics.find(x=>x.tierName==='Good').missingOwnerFields.includes('minimumJob'));
 }
 const quote=generateQuoteVNext(catalogRequest(book));
 assert.equal(quote.resultType,'INSTANT_ESTIMATE_READY');assert.deepEqual(quote.options.map(o=>o.tierName),['Best']);
 // 1,000 sqft x 500 labor + 1,100 sqft x 500 membrane (owner's 10% waste)
 // + 1,000 sqft x 500 tear-off = 1,550,000 cents, per the October amendment.
 // The explicit 2,000,000-cent minimum raises this subtotal; tax and markup are zero.
 assert.equal(quote.options[0].calculationRecord.scenarios.mid.finalTotalCents,minimumJob||1550000);
 assert.equal(JSON.stringify(book),before);
});
test('QP-05: an invalid tier minimum cannot hide a valid inherited option',()=>{
 const book=originalCatalog(),s=book.services[0];s.pricing.minimumJob=0;
 s.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{minimumJob:null}}];
 for(const firstLiveProduct of [false,true]){
  const status=vNextServiceStatus(s,book.defaults,{firstLiveProduct});
  assert.equal(status.status,'QUOTING LIVE');assert.deepEqual(status.validTierNames,['Good']);
  assert.ok(status.failedTierDiagnostics.find(x=>x.tierName==='Best').missingOwnerFields.includes('minimumJob'));
 }
 const quote=generateQuoteVNext(catalogRequest(book));assert.deepEqual(quote.options.map(o=>o.tierName),['Good']);
 assert.equal(quote.options[0].calculationRecord.scenarios.mid.finalTotalCents,1550000);
});
test('QP-05: passing the shared minimum never bypasses the requested product pair',()=>{
 const book=originalCatalog(),s=book.services[0];s.pricing.minimumJob=0;
 delete s.pricing.membraneCostPerSqft.product_0;delete s.knownOfferings.membraneType.product_0;
 assert.equal(vNextServiceStatus(s,book.defaults,{firstLiveProduct:true}).status,'QUOTING LIVE');
 assert.equal(generateQuoteVNext(catalogRequest(book,'product_0','product_1')).resultType,'ESTIMATE_REQUIRES_REVIEW');
 assert.equal(generateQuoteVNext(catalogRequest(book,'product_1','product_0')).resultType,'ESTIMATE_REQUIRES_REVIEW');
 assert.equal(generateQuoteVNext(catalogRequest(book,'product_1','product_1')).options[0].calculationRecord.scenarios.mid.finalTotalCents,1550000);
});
test('QP-05: pitched-roof tier minimum follows the same contract',()=>{
 const f=scope('roof-underlayment-packages');delete f.ownerPricing.pricing.minimumJob;
 assert.ok(vNextServiceStatus(f.ownerPricing,f.businessDefaults).missingOwnerFields.includes('minimumJob'));
 f.ownerPricing.tiers=[{name:'Best',overrides:{minimumJob:0}}];
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
 assert.equal(generateQuoteVNext(f).options[0].calculationRecord.scenarios.mid.finalTotalCents,1935000);
});
