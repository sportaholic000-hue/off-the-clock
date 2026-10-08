import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,vNextServiceStatus,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {flatRoof} from '../verification/engine-independent/fixtures.mjs';
import * as forms from '../server/scopeConfiguration.js';
process.env.PRICEBOOK_PATH=fs.mkdtempSync(path.join(os.tmpdir(),'otc-astra-five-'));
const store=await import('../server/priceBookService.js'),bridge=await import('../server/src/quoteDoneBridge.js');
const get=id=>structuredClone(measuredScopeCases().find(x=>x.id===id).input);
const cents=q=>q.options?.[0]?.calculationRecord.scenarios.mid.finalTotalCents;
function saved(f){const id='synthetic-astra-'+randomUUID(),raw=structuredClone(f.ownerPricing);delete raw.origin;store.savePricebook(id,{services:[raw],defaults:{currency:'CAD',...f.businessDefaults}});const b=store.loadPricebook(id);assert.equal(bridge.approveApplicationService(id,raw.id,{revision:bridge.bookRevision(b),confirmConfiguration:true,confirmLegacySettings:true}).success,true);const book=store.loadPricebook(id);return {id,book,raw:book.services[0]};}
const quote=(s,inputs)=>bridge.calculateApplicationQuote(s.book,s.raw,{serviceId:s.raw.id,customerInputs:inputs},{ownerId:s.id});
const view=(field,inputs)=>{assert.equal(typeof forms.customerFieldForInputs,'function');return forms.customerFieldForInputs(field,inputs);};

for(const type of ['FENCING_INSTALL','FENCING_REPLACEMENT'])test('Astra 1: '+type+' excludes an option that changes confirmed gate width',()=>{
 const f=offeringFixture(type,'installed');f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{offeringDetails:{gates:{walk:{widthLF:8,description:'[SYNTHETIC] Eight-foot gate.',postsAndFootingsIncluded:true}}},offeringRates:{gate_walk:60000}}}];
 const s=saved(f),before=JSON.stringify(s.book),q=quote(s,f.customerInputs);
 assert.equal(q.customerResult.resultType,'INSTANT_ESTIMATE_READY');assert.deepEqual(q.internalResult.options.map(o=>o.tierName),['Good']);assert.equal(cents(q.internalResult),type==='FENCING_INSTALL'?450000:490000);
 assert.match(q.customerResult.pricedScope.facts.find(x=>x.label==='Gates by measured opening width').value,/4 ft opening/);assert.doesNotMatch(JSON.stringify(q.customerResult),/8 ft gate/);
 assert.ok(q.internalResult.failedTierDiagnostics[0].invalidCustomerFields.includes('gates.walk'));assert.equal(JSON.stringify(s.book),before);
 // No gate width is being confirmed when the measured request has no gates.
 const noGates=quote(s,{...f.customerInputs,gates:{}});assert.equal(noGates.internalResult.options.length,2);
});
test('Astra 1: all conflicting gates return review without customer money',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed');f.ownerPricing.tiers=[{name:'Best',overrides:{offeringDetails:{gates:{walk:{widthLF:8}}}}}];const q=generateQuoteVNext(f),publicResult=sanitizeForCustomerVNext(q);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(publicResult.midEstimate,undefined);
 const s=saved(f),status=bridge.applicationStatus(s.raw,s.book);assert.equal(status.status,'QUOTING LIVE');assert.ok(status.scopeCoverage.some(x=>x.key==='gate_width_walk'&&!x.configurationComplete));assert.equal(cents(quote(s,{...f.customerInputs,gates:{}}).internalResult),400000);
});
test('Astra 1 control: same-width upgrades retain both independently priced options',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed');f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{offeringDetails:{gates:{walk:{description:'[SYNTHETIC] Four-foot upgraded hardware.'}}},offeringRates:{gate_walk:60000}}}];assert.deepEqual(generateQuoteVNext(f).options.map(x=>x.calculationRecord.scenarios.mid.finalTotalCents),[450000,520000]);
});
test('Astra 2: approved tier-only hardwood scope exposes its required confirmation',()=>{
 const f=get('floor-hardwood-installed'),p=f.ownerPricing.pricing;f.ownerPricing.tiers=[{name:'Best',overrides:{scopeDetails:p.scopeDetails,scopeRates:p.scopeRates}}];delete p.scopeDetails;delete p.scopeRates;delete f.customerInputs.underlaymentScopeConfirmed;
 const s=saved(f),status=bridge.applicationStatus(s.raw,s.book),field=bridge.applicationServiceDefinition(s.raw).customerFields.find(x=>x.name==='underlaymentScopeConfirmed');assert.equal(status.status,'QUOTING LIVE');assert.equal(status.approvalCurrent,true);assert.ok(field);assert.equal(forms.customerFieldVisible(field,f.customerInputs),true);assert.match(view(field,f.customerInputs).label,/hardwood/);
 assert.equal(quote(s,f.customerInputs).internalResult.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(cents(quote(s,{...f.customerInputs,underlaymentScopeConfirmed:true}).internalResult),196000);
 assert.equal(forms.customerFieldVisible(field,{newFlooringType:'tile'}),false);
});
for(const [id,fields,expected] of [['commercial-installed',['insulationScopeConfirmed','insulationAreaSqft','coverboardAreaSqft'],1690000],['stairs-installed',['stairScopeConfirmed','stairWidthLF','floorAreaExcludesStairs','stairRemovalNeeded','stairDisposalNeeded'],253000],['roof-underlayment-packages',['roofUnderlaymentScopeConfirmed'],1935000]])test('Astra 2: tier-only '+id+' retains all measured questions',()=>{
 const f=get(id),p=f.ownerPricing.pricing;f.ownerPricing.tiers=[{name:'Best',overrides:{scopeDetails:p.scopeDetails,scopeRates:p.scopeRates}}];delete p.scopeDetails;delete p.scopeRates;
 const definition=bridge.applicationServiceDefinition(f.ownerPricing);for(const name of fields)assert.ok(definition.customerFields.some(x=>x.name===name),name);assert.equal(generateQuoteVNext(f).resultType,'INSTANT_ESTIMATE_READY');assert.equal(cents(generateQuoteVNext(f)),expected);
});
test('Astra 2: gates introduced by a tier appear with a stable measured width',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed'),gate=f.ownerPricing.pricing.offeringDetails.gates.walk;f.ownerPricing.pricing.offeringDetails.gates={};delete f.ownerPricing.pricing.offeringRates.gate_walk;
 f.ownerPricing.tiers=[{name:'Best',overrides:{offeringDetails:{gates:{walk:gate}},offeringRates:{gate_walk:25000}}}];const field=bridge.applicationServiceDefinition(f.ownerPricing).customerFields.find(x=>x.name==='gates');assert.ok(field.values.includes('walk'));assert.match(field.options.walk,/4 ft opening/);assert.equal(cents(generateQuoteVNext(f)),450000);
});
test('Astra 2: an option-specific confirmation does not remove another complete option',()=>{
 const f=get('roof-underlayment-packages'),p=f.ownerPricing.pricing,scopeDetails=structuredClone(p.scopeDetails),scopeRates=structuredClone(p.scopeRates);delete p.scopeDetails;delete p.scopeRates;
 p.underlaymentPriceBasis.asphalt_shingle='installed_area_sell_price';p.underlaymentPerSquare={asphalt_shingle:15000};
 f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{underlaymentPriceBasis:{asphalt_shingle:'cost'},scopeDetails,scopeRates}}];
 const s=saved(f),q=quote(s,f.customerInputs);assert.equal(q.internalResult.resultType,'INSTANT_ESTIMATE_READY');assert.deepEqual(q.internalResult.options.map(x=>x.tierName),['Good','Best']);assert.deepEqual(q.internalResult.options.map(x=>x.calculationRecord.scenarios.mid.finalTotalCents),[2160000,1935000]);
 // Measured commercial area cannot be slipped through this confirmation rule.
 const extra=generateQuoteVNext({...f,customerInputs:{...f.customerInputs,insulationAreaSqft:100}});assert.equal(extra.resultType,'ESTIMATE_REQUIRES_REVIEW');
});
for(const [type,legacy,baseline,expected] of [['FENCING_INSTALL',{terrainSlope:'moderate'},{terrainSlope:'flat'},450000],['FENCING_REPLACEMENT',{terrainSlope:'steep'},{terrainSlope:'flat'},490000],['INTERIOR_PAINTING',{wallHeight:'high'},{wallHeight:'standard'},380000],['EXTERIOR_PAINTING',{stories:2},{stories:1},300000]])test('Astra 3: confirmed '+type+' legacy condition permits baseline jobs only',()=>{
 const f=offeringFixture(type,'installed');Object.assign(f.ownerPricing.pricing.offeringDetails,legacy,{baselinePricesConfirmed:true});delete f.ownerPricing.pricing.installedLaborPercent;Object.assign(f.customerInputs,baseline);const s=saved(f),status=bridge.applicationStatus(s.raw,s.book);assert.equal(status.status,'QUOTING LIVE');assert.equal(status.approvalCurrent,true);assert.equal(cents(quote(s,f.customerInputs).internalResult),expected);assert.equal(quote(s,{...f.customerInputs,...legacy}).internalResult.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(status.laborAdjustmentCoverage.length);
});
test('Astra 3 control: generic approval cannot substitute for explicit baseline confirmation',()=>{
 const f=offeringFixture('INTERIOR_PAINTING','installed');f.ownerPricing.pricing.offeringDetails.wallHeight='high';delete f.ownerPricing.pricing.offeringDetails.baselinePricesConfirmed;const s=saved(f);assert.equal(bridge.applicationStatus(s.raw,s.book).status,'NEEDS PRICING');assert.equal(quote(s,f.customerInputs).internalResult.resultType,'ESTIMATE_REQUIRES_REVIEW');
});
for(const reverse of [false,true])test('Astra 4: selected underlayment text is independent of map order '+reverse,()=>{
 const f=get('floor-hardwood-installed'),p=f.ownerPricing.pricing;p.scopeDetails.floor_underlayment_hardwood.description='[SYNTHETIC] Hardwood felt.';p.scopeDetails.floor_underlayment_vinyl_plank={description:'[SYNTHETIC] Vinyl plank foam.',mode:'installed_area_sell_price'};p.scopeRates.floor_underlayment_vinyl_plank=120;
 if(reverse)p.scopeDetails=Object.fromEntries(Object.entries(p.scopeDetails).reverse());const field=bridge.applicationServiceDefinition(f.ownerPricing).customerFields.find(x=>x.name==='underlaymentScopeConfirmed'),display=view(field,f.customerInputs);assert.match(display.details.join(' '),/hardwood felt/i);assert.doesNotMatch(JSON.stringify(display.details),/vinyl/i);assert.equal(cents(generateQuoteVNext(f)),196000);assert.equal(generateQuoteVNext({...f,customerInputs:{...f.customerInputs,underlaymentScopeConfirmed:false}}).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('Astra 4: different tier products are both disclosed for the selected floor',()=>{
 const f=get('floor-hardwood-installed');f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{scopeDetails:{floor_underlayment_hardwood:{description:'[SYNTHETIC] Premium hardwood felt.'}},scopeRates:{floor_underlayment_hardwood:150}}}];const field=bridge.applicationServiceDefinition(f.ownerPricing).customerFields.find(x=>x.name==='underlaymentScopeConfirmed'),display=view(field,f.customerInputs);assert.match(display.details.join(' '),/Good:/);assert.match(display.details.join(' '),/Best:.*Premium hardwood felt/);assert.deepEqual(generateQuoteVNext(f).options.map(x=>x.calculationRecord.scenarios.mid.finalTotalCents),[196000,206000]);
});
test('Astra 4: changing to a product with no underlayment clears its earlier confirmation',()=>{
 const f=get('floor-hardwood-installed'),fields=bridge.applicationServiceDefinition(f.ownerPricing).customerFields;
 assert.equal(forms.clearChangedScopeConfirmations(fields,f.customerInputs,{...f.customerInputs,newFlooringType:'tile'}).underlaymentScopeConfirmed,undefined);
 assert.equal(forms.clearChangedScopeConfirmations(fields,f.customerInputs,{...f.customerInputs,sqft:300}).underlaymentScopeConfirmed,true);
});
function catalog(){const f=flatRoof(),p=f.ownerPricing.pricing;for(const field of ['laborPerSqft','membraneCostPerSqft','tearOffPerSqft'])p[field]={};f.ownerPricing.knownOfferings={membraneType:{},replacementMembraneType:{}};for(let i=0;i<80;i++){const key='product_'+i;p.laborPerSqft[key]=500;p.membraneCostPerSqft[key]=700;p.tearOffPerSqft[key]=200;f.ownerPricing.knownOfferings.membraneType[key]=randomUUID();f.ownerPricing.knownOfferings.replacementMembraneType[key]=randomUUID();}return f;}
for(const disabled of [false,true])test('Astra 5: cold 80-by-80 product '+(disabled?'disabled':'incomplete')+' catalog rejects common fee blockers promptly',async()=>{
 const f=catalog();f.ownerPricing.active=!disabled;f.ownerPricing.feeRules.travel='owner_selected';f.businessDefaults.travelFee=900;const book={services:[f.ownerPricing],defaults:{currency:'CAD',...f.businessDefaults}},start=performance.now(),timer=new Promise(resolve=>setTimeout(()=>resolve(performance.now()-start),20)),status=bridge.bookQuoteStatuses(book)[0],elapsed=performance.now()-start,timerMs=await timer;
 assert.equal(status.status,disabled?'DISABLED':'NEEDS PRICING');assert.ok(elapsed<1500,'cold readiness '+Math.round(elapsed)+' ms');assert.ok(timerMs<1500,'20 ms timer blocked for '+Math.round(timerMs)+' ms');console.log('Astra 5 cold '+(disabled?'disabled':'incomplete')+' milliseconds:',Math.round(elapsed));
 if(!disabled){const ownerStart=performance.now(),full=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{ownerFeeSelections:{}});assert.equal(full.status,'NEEDS PRICING');assert.ok(performance.now()-ownerStart<1500);assert.ok(full.invalidOwnerFields.includes('feeSelections.owner.travel'));}
});
test('Astra 5 control: selected owner fee still quotes exactly and included disposal is not blocked',()=>{
 const f=catalog();f.ownerPricing.feeRules.travel='owner_selected';f.businessDefaults.travelFee=900;const start=performance.now(),status=vNextServiceStatus(f.ownerPricing,f.businessDefaults,{ownerFeeSelections:{travel:true},firstLiveProduct:true});assert.equal(status.status,'QUOTING LIVE');assert.ok(performance.now()-start<1500);
 const q=structuredClone(f);Object.assign(q.customerInputs,{replacementMembraneType:'product_0',membraneType:'product_0'});q.customerInputs.confirmedFacts=Object.fromEntries(['replacementMembraneType','membraneType'].map(field=>[field,{status:'identified',field,value:'product_0',offeringId:q.ownerPricing.knownOfferings[field].product_0}]));q.feeSelections={owner:{travel:true},customer:{}};assert.equal(cents(generateQuoteVNext(q)),1470900);
 const d=get('demolition-installed');d.ownerPricing.feeRules.disposal='owner_selected';d.businessDefaults.disposalFee=900;
 // Handwritten before execution: $3538.89 slab + $1000 demolition = $4538.89.
 // Approved rule: readiness uses real fee replacements. Included demolition
 // disposal keeps that work live; an uncovered base job still needs its choice.
 assert.equal(vNextServiceStatus(d.ownerPricing,d.businessDefaults,{ownerFeeSelections:{},firstLiveProduct:true}).status,'QUOTING LIVE');assert.equal(cents(generateQuoteVNext({...d,feeSelections:{owner:{},customer:{}}})),453889);
 const base=structuredClone(d);base.customerInputs.demolitionNeeded=false;
 for(const key of Object.keys(base.customerInputs))if(key.startsWith('demolition')&&key!=='demolitionNeeded')delete base.customerInputs[key];
 const missingChoice=generateQuoteVNext({...base,feeSelections:{owner:{},customer:{}}});
 assert.equal(missingChoice.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(missingChoice.midEstimate,undefined);
 assert.ok(missingChoice.invalidOwnerFields.includes('feeSelections.owner.disposal'));
 // Handwritten: $3538.89 slab + explicitly selected $9 disposal = $3547.89.
 assert.equal(cents(generateQuoteVNext({...base,feeSelections:{owner:{disposal:true},customer:{}}})),354789);
});
