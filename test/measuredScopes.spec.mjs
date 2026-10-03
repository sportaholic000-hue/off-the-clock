import test from 'node:test';import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {scopeRequiredCustomer} from '../server/scopeConfiguration.js';
import {convertApplicationBook} from '../server/src/quoteDoneBridge.js';
import {flatRoof} from '../verification/engine-independent/fixtures.mjs';
// Expected cents and arithmetic are authored in fixtures before execution.
for(const row of measuredScopeCases())test(row.id+' quotes its explicitly configured scope',()=>{
 const r=generateQuoteVNext(row.input);assert.equal(r.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(r));
 assert.equal(sanitizeForCustomerVNext(r).midEstimate,row.expected.cents/100,row.arithmetic);
 const status=vNextServiceStatus(row.input.ownerPricing,row.input.businessDefaults);assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));
});
for(const row of measuredScopeCases())test(row.id+' rejects missing scope facts and prices without changing submitted details',()=>{
 for(const field of scopeRequiredCustomer(row.input.serviceType,row.input.customerInputs,row.input.ownerPricing.pricing,row.input.ownerPricing)){
  const f=structuredClone(row.input);delete f.customerInputs[field];const original=structuredClone(f.customerInputs),r=generateQuoteVNext(f);
  assert.equal(r.resultType,'ESTIMATE_REQUIRES_REVIEW',field);assert.deepEqual(r.submittedCustomerInputs,original);assert.equal(sanitizeForCustomerVNext(r).midEstimate,undefined);
 }
 const f=structuredClone(row.input);delete f.ownerPricing.pricing.scopeRates[Object.keys(f.ownerPricing.pricing.scopeRates)[0]];
 assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
});
const get=id=>structuredClone(measuredScopeCases().find(r=>r.id===id).input);
test('Installed scope receives no second markup; fractional unit prices remain exact',()=>{
 const f=get('siding-trim-installed');f.ownerPricing.pricing.scopeRates.siding_trim_installed=0.5;f.businessDefaults.markupPercent=20;
 // Base 1170000 cost *1.2 +200*0.5 selling-price trim =1404100 cents.
 assert.equal(generateQuoteVNext(f).midEstimate,14041);
 const book={services:[f.ownerPricing],defaults:f.businessDefaults};assert.deepEqual(convertApplicationBook(convertApplicationBook(book,'toDollars'),'toCents'),book);
});
test('Purchased paint cost gets material markup and tax once; installed trim does not',()=>{
 const f=get('paint-cost-packages');f.businessDefaults.markupPercent=20;f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;f.ownerPricing.taxabilityByCategory.material=true;
 // Costs 279000 *1.2=334800 +20000 installed trim +44000*1.2*.1 material tax +20000*.4*.1 installed-material tax =360880.
 assert.equal(generateQuoteVNext(f).midEstimate,3608.80);
});
test('Package rounding handles exact and just-over boundaries, and rejects conflicting purchase groups',()=>{
 const f=get('floor-hardwood-packages');f.ownerPricing.pricing.scopeDetails.floor_underlayment_hardwood.wastePercent=0;
 assert.equal(generateQuoteVNext(f).midEstimate,1960);f.customerInputs.sqft=200.01;
 // Labor 66003 + material110006 +3 packages30000 =206009 cents.
 assert.equal(generateQuoteVNext(f).midEstimate,2060.09);
 const paint=get('paint-cost-packages');paint.ownerPricing.pricing.scopeRates.paint_ceiling=5001;
 const r=generateQuoteVNext(paint);assert.equal(r.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(r.invalidOwnerFields.includes('scopeDetails.paint_ceiling.productKey'));
});
test('Scope boundaries reject mismatches, nested facts and unrequested work',()=>{
 for(const [id,change]of [
  ['stairs-installed',c=>c.stairWidthLF=4.01],['stairs-itemized',c=>c.floorAreaExcludesStairs=false],
  ['siding-removal-installed',c=>c.sidingRemovalStories=2],['siding-removal-itemized',c=>c.existingSidingType={unpriced:'more work'}],
  ['demolition-installed',c=>c.demolitionThickness=7],['demolition-itemized',c=>c.demolitionReinforcement='none'],
  ['commercial-itemized',c=>c.coverboardAreaSqft=1001],['overlay-installed',c=>c.newFlooringType='laminate'],
  ['exposed-installed',c=>c.finishType='smooth']]){
  const f=get(id);change(f.customerInputs);const before=structuredClone(f.customerInputs),r=generateQuoteVNext(f);
  assert.equal(r.resultType,'ESTIMATE_REQUIRES_REVIEW',id);assert.deepEqual(r.submittedCustomerInputs,before);
 }
});
test('Included demolition and siding disposal replace fees, while separate main-floor disposal remains',()=>{
 for(const id of ['demolition-installed','siding-removal-itemized']){
  const f=get(id);f.ownerPricing.feeRules.disposal='when_scope_selected';f.businessDefaults.disposalFee=15000;
  assert.equal(generateQuoteVNext(f).midEstimate,measuredScopeCases().find(r=>r.id===id).expected.cents/100);
 }
 const f=get('stairs-installed');f.ownerPricing.feeRules.disposal='when_scope_selected';f.businessDefaults.disposalFee=15000;
 Object.assign(f.customerInputs,{removalNeeded:true,existingFloorType:'vinyl_plank',removalAreaSqft:100});f.ownerPricing.pricing.removalPerSqft={vinyl_plank:200};
 f.customerInputs.confirmedFacts={existingFloorType:{field:'existingFloorType',value:'vinyl_plank',status:'identified',offeringId:f.ownerPricing.knownOfferings.existingFloorType.vinyl_plank}};
 assert.equal(generateQuoteVNext(f).midEstimate,2880); //253000 +20000 floor removal +15000 floor disposal.
});
test('Exposed-aggregate finishing uses measured outline area',()=>{
 const f=get('exposed-itemized');delete f.customerInputs.length;delete f.customerInputs.width;
 Object.assign(f.customerInputs,{dimensionMethod:'measured_outline',outlinePoints:[{x:0,y:0},{x:20,y:0},{x:20,y:10},{x:0,y:10},{x:0,y:0}]});
 assert.equal(generateQuoteVNext(f).midEstimate,4238.89);
});
test('Identical partial measurements quote; any numerical contradiction remains editable',()=>{
 const flat=flatRoof(),roof=get('roof-underlayment-packages');
 Object.assign(flat.customerInputs,{serviceScope:'partial',partialAreaSqft:500,partialPercent:50});
 Object.assign(roof.customerInputs,{serviceScope:'partial',partialAreaSqft:500,partialPercent:25});
 assert.equal(generateQuoteVNext(flat).midEstimate,7350); //500*(500+700*1.1+200).
 assert.equal(generateQuoteVNext(roof).midEstimate,4950); //250000+165000+50000+ceil(550/500)*15000.
 for(const f of [flat,roof])for(const area of [499.9,499.9999999999,500.0000000001]){
  const changed=structuredClone(f);changed.customerInputs.partialAreaSqft=area;
  const r=generateQuoteVNext(changed);assert.equal(r.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(r.invalidCustomerFields.includes('partialAreaSqft'));
 }
});
test('Additional work must be excluded from the base price and unsupported scope settings reject',()=>{
 for(const [id,scope,field]of [['overlay-installed','floor_overlay','basePriceExcludesPreparation'],['siding-trim-itemized','siding_trim','basePriceExcludesTrim']]){
  const f=get(id);f.ownerPricing.pricing.scopeDetails[scope][field]=false;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
 }
 for(const name of ['scopeDetails','scopeRates']){const f=get('stairs-installed');f.ownerPricing.pricing[name].constructor=name==='scopeDetails'?{}:100;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');}
});
test('Scope tier prices preserve exact units, inherit other prices and exclude only an invalid option',()=>{
 const f=get('floor-hardwood-packages');
 f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Better',overrides:{scopeRates:{floor_underlayment_hardwood:10001}}},{name:'Incomplete',overrides:{scopeRates:{floor_underlayment_hardwood:null}}}];
 const result=generateQuoteVNext(f);
 assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
 assert.deepEqual(result.options.map(o=>[o.tierName,o.midEstimate]),[['Good',2060],['Better',2060.03]]);
 assert.equal(sanitizeForCustomerVNext(result).optionAvailabilityNotice,'Fewer options are available because one or more configured options need owner review.');
 assert.ok(result.failedTierDiagnostics.some(tier=>tier.tierName==='Incomplete'));
 const book={services:[f.ownerPricing],defaults:f.businessDefaults};assert.deepEqual(convertApplicationBook(convertApplicationBook(book,'toDollars'),'toCents'),book);
});
