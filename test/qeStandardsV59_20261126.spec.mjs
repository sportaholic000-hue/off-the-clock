// November 26, 2026 (v59). The owner's direction: decide the open audit items
// by industry standard and best practice. Every expected value is worked out
// by hand in the comments before the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,getVNextPriceBookMetadata,vNextServiceStatus,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {pendingStartingFactorUpdates} from '../server/quote-engine-vnext/startingFactorUpdates.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';

migrate();
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const mid=q=>q.options[0].calculationRecord.scenarios.mid;
const line=(q,name)=>mid(q).lineItems.find(l=>l.name===name);
const total=q=>mid(q).finalTotalCents;

test('the engine is v61 (file written for v59)',()=>{assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261127-v61');});

// ---------------------------------------------------------------------------
// 1. Mulch. Bulk mulch is sold and billed by the cubic yard. The ordering
// overage covers what an area-and-depth calculation misses (settling, uneven
// ground), so it applies only to yards worked out from the bed. Yards the
// customer states are their order and are bought as stated.
//   Material 45.00 a yard, labor 30.00 a yard, overage 10%.
//   Stated 5 yd:          material 5 x 45.00 = 225.00; labor 5 x 30.00 = 150.00; 375.00
//                         (before: material 5.5 yd = 247.50; 397.50)
//   Stated 5.2 yd, half-yard orders: 5.2 -> 5.5 yd x 45.00 = 247.50; labor 5.2 x 30.00 = 156.00; 403.50
//   324 sq ft at 3 in:    324 x 3 / 324 = 3 yd installed; ordered 3 x 1.10 = 3.3 yd x 45.00 = 148.50;
//                         labor 3 x 30.00 = 90.00; 238.50 (unchanged)
// ---------------------------------------------------------------------------
const mulch=(inputs,pricing={})=>fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,minimumServiceCharge:0,mulchOverageFactor:1.10,...pricing},{mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy',...inputs});
test('1: yards the customer states are bought as stated; the overage applies only to yards worked out from area and depth',()=>{
  let q=ready(mulch({inputMethod:'yards',mulchArea:5}));
  assert.equal(line(q,'Mulch material').amountCents,22500);assert.equal(line(q,'Mulch material').calculation.quantity,5);
  assert.equal(line(q,'Mulch installation labor').amountCents,15000);assert.equal(total(q),37500);
  q=ready(mulch({inputMethod:'yards',mulchArea:5.2},{mulchOrderIncrementCubicYards:{brown:0.5}}));
  assert.equal(line(q,'Mulch material').calculation.quantity,5.5);assert.equal(line(q,'Mulch material').amountCents,24750);
  assert.equal(line(q,'Mulch installation labor').amountCents,15600);assert.equal(total(q),40350);
  q=ready(mulch({inputMethod:'sqft',mulchArea:324,mulchDepth:3}));
  assert.ok(Math.abs(line(q,'Mulch material').calculation.quantity-3.3)<1e-12);assert.equal(line(q,'Mulch material').amountCents,14850);
  assert.equal(line(q,'Mulch installation labor').amountCents,9000);assert.equal(total(q),23850);
  // A larger overage changes the calculated route only.
  assert.equal(total(ready(mulch({inputMethod:'yards',mulchArea:5},{mulchOverageFactor:1.5}))),37500);
  // 3 x 1.5 = 4.5 yd x 45.00 = 202.50; + 90.00 = 292.50.
  assert.equal(total(ready(mulch({inputMethod:'sqft',mulchArea:324,mulchDepth:3},{mulchOverageFactor:1.5}))),29250);
});
// Planting: 2 small plants (labor 20.00, plant allowance 15.00 each) and 2 yd of mulch.
//   Plants 2 x 20.00 + 2 x 15.00 = 70.00; mulch 2 x 45.00 = 90.00; mulch labor 2 x 30.00 = 60.00; 220.00
//   (before: mulch 2.2 yd = 99.00; 229.00)
const planting=(mulchYards,pricing={})=>fixture('LANDSCAPING_PLANTING',{plantingLaborPerPlant:{small:2000,medium:3000,large:5000},plantMaterialAllowance:{small:1500,medium:2500,large:6000},minimumServiceCharge:0,mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,mulchOverageFactor:1.10,...pricing},{plantsBySize:{small:2,medium:0,large:0},bedCondition:'clean',mulchNeeded:true,mulchYards,mulchType:'brown',accessDifficulty:'easy'});
test('1: planting mulch is the yards the customer states, with no overage; the unused overage setting is not offered for planting',()=>{
  let q=ready(planting(2));
  assert.equal(line(q,'Mulch material').calculation.quantity,2);assert.equal(line(q,'Mulch material').amountCents,9000);
  assert.equal(line(q,'Mulch installation labor').amountCents,6000);assert.equal(total(q),22000);
  // Half-yard orders: 2.2 -> 2.5 yd x 45.00 = 112.50; labor 2.2 x 30.00 = 66.00; plants 70.00; 248.50.
  q=ready(planting(2.2,{mulchOrderIncrementCubicYards:{brown:0.5}}));
  assert.equal(line(q,'Mulch material').calculation.quantity,2.5);assert.equal(total(q),24850);
  const meta=getVNextPriceBookMetadata();
  assert.ok(!meta.find(m=>m.serviceType==='LANDSCAPING_PLANTING').class2Fields.some(d=>d.name==='mulchOverageFactor'));
  assert.ok(meta.find(m=>m.serviceType==='LANDSCAPING_MULCH').class2Fields.some(d=>d.name==='mulchOverageFactor'));
  assert.ok(!bridge.applicationMetadata().services.find(m=>m.serviceType==='LANDSCAPING_PLANTING').class2Fields.some(d=>(d.name||d.field)==='mulchOverageFactor'));
  // No "new starting value" offer for a setting planting does not use.
  assert.deepEqual(pendingStartingFactorUpdates('LANDSCAPING_PLANTING',()=>1.15),[]);
  assert.equal(pendingStartingFactorUpdates('LANDSCAPING_MULCH',()=>1.15).length,1);
});

// ---------------------------------------------------------------------------
// 2. Siding repair is screened like siding removal. Vinyl and metal quote
// without the question. Fiber cement and wood ask when the building was
// built: 1990 or earlier, or not sure, goes to the business; 1991 or later
// quotes. An owner who chose "Quote removal; testing and abatement are not
// included" quotes every age without the question. Every quoted repair says
// the exclusion.
//   40 sq ft minor repair (medium band): 4 hours x 100.00 + 100.00 materials = 500.00
// ---------------------------------------------------------------------------
const repair=(sidingType,inputs={},pricing={})=>fixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1_000_000,repairHours:{[sidingType]:{minor:{small:2,medium:4,large:8}}},materialAllowance:{[sidingType]:{minor:{small:5000,medium:10000,large:15000}}},...pricing},{sidingType,damageLevel:'minor',affectedArea:40,stories:1,...inputs});
const EXCLUSION='Repair does not include testing for or removing asbestos or lead paint. Older siding can contain them; if found, that work is priced separately.';
const HELD='Siding in a building built in 1990 or earlier can contain asbestos or lead paint, so it is checked before the repair. The business will confirm the price.';
test('2: vinyl and metal siding repairs quote without the year-built question',()=>{
  for(const type of ['vinyl','metal']){
    const q=ready(repair(type));assert.equal(total(q),50000,type);assert.ok(q.options[0].disclaimer.includes(EXCLUSION));
    // An age given anyway changes nothing for these materials.
    assert.equal(total(ready(repair(type,{buildingAge:'before_1978'}))),50000,type);
    const field=customerContractForVNext('SIDING_REPAIR',repair(type).ownerPricing.pricing,repair(type).ownerPricing).fields.buildingAge;
    assert.deepEqual(field.visibleWhen,[[['sidingType','eq','fiber_cement']],[['sidingType','eq','wood']]]);
  }
});
test('2: fiber cement and wood siding repairs ask the year built; older or unknown buildings go to the business',()=>{
  for(const type of ['fiber_cement','wood']){
    let q=generateQuoteVNext(repair(type));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',type);assert.deepEqual(q.missingCustomerFields,['buildingAge']);
    for(const age of ['before_1978','1978_to_1990','not_sure']){
      q=generateQuoteVNext(repair(type,{buildingAge:age}));
      assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',type+' '+age);assert.equal(q.reviewReason,HELD);assert.equal(q.options,undefined);
    }
    q=ready(repair(type,{buildingAge:'1991_or_later'}));assert.equal(total(q),50000);assert.ok(q.options[0].disclaimer.includes(EXCLUSION));
  }
});
test('2: the owner\'s exclusion policy quotes every age without the question, with the exclusion stated',()=>{
  for(const inputs of [{},{buildingAge:'before_1978'},{buildingAge:'not_sure'}]){
    const q=ready(repair('wood',inputs,{olderMaterialRemoval:'exclude'}));
    assert.equal(total(q),50000);assert.ok(q.options[0].disclaimer.includes(EXCLUSION));
  }
  // The setting is validated for siding repair and offered in its editor.
  assert.equal(generateQuoteVNext(repair('wood',{},{olderMaterialRemoval:'sometimes'})).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const app=bridge.applicationMetadata().services.find(m=>m.serviceType==='SIDING_REPAIR').fields.find(f=>f.field==='olderMaterialRemoval');
  assert.equal(app.requiredAtBase,false);assert.equal(app.type,'select');assert.deepEqual(app.options,['review_before_1990','exclude']);
  // Readiness samples a 1991-or-later building, so a priced wood repair service is live.
  const f=repair('wood');assert.equal(vNextServiceStatus({id:randomUUID(),active:true,...f.ownerPricing},f.businessDefaults).status,'QUOTING LIVE');
});

// ---------------------------------------------------------------------------
// 3. One confirmation of the saved business-wide settings renews every service
// whose approval is stale only because those settings changed. A service whose
// own saved content changed, or whose receipt fails any other check, still
// needs its own confirmation.
// ---------------------------------------------------------------------------
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(false),peakMonths:[],peakSurchargePercent:0};
const custom=name=>({serviceType:'CUSTOM',service:name,source:'MANUAL',active:true,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},tiers:[]});
function twoApproved(){
  const owner='[SYNTHETIC]-v59-business-'+randomUUID();
  bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),defaults,services:[custom('[SYNTHETIC] First visit'),custom('[SYNTHETIC] Second visit')]});
  for(const index of [0,1]){const book=bridge.readApplicationBook(owner);bridge.approveApplicationService(owner,book.services[index].id,{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true});}
  return owner;
}
const statuses=owner=>{const book=bridge.readApplicationBook(owner);return bridge.validateApplicationDraft(owner,book).statuses;};
const edit=(owner,change)=>{const book=bridge.readApplicationBook(owner);change(book);return bridge.saveApplicationBook(owner,book);};
const confirm=(owner,input)=>bridge.confirmApplicationBusinessSettings(owner,{revision:bridge.readApplicationBook(owner).revision,confirmBusinessSettings:true,...input});
test('3: after a markup change, one confirmation renews both services; each receipt keeps its own approval',()=>{
  const owner=twoApproved();
  assert.deepEqual(statuses(owner).map(s=>[s.status,s.approvalCurrent,s.businessSettingsOnly]),[['QUOTING LIVE',true,undefined],['QUOTING LIVE',true,undefined]]);
  const before=loadPricebook(owner).services.map(s=>structuredClone(s.quoteDoneApproval));
  edit(owner,book=>{book.defaults.markupPercent=10;});
  assert.deepEqual(statuses(owner).map(s=>[s.status,s.approvalCurrent,s.businessSettingsOnly]),[['NEEDS PRICING',false,true],['NEEDS PRICING',false,true]]);
  const result=confirm(owner);
  assert.equal(result.success,true);assert.equal(result.confirmedServiceIds.length,2);assert.equal(result.revision,bridge.readApplicationBook(owner).revision);
  assert.deepEqual(statuses(owner).map(s=>[s.status,s.approvalCurrent,s.businessSettingsOnly]),[['QUOTING LIVE',true,undefined],['QUOTING LIVE',true,undefined]]);
  loadPricebook(owner).services.forEach((service,index)=>{
    const receipt=service.quoteDoneApproval,prior=before[index];
    for(const key of ['ownerId','serviceId','operationId','approvedAt','engineVersion','approvalVersion','operation'])assert.deepEqual(receipt[key],prior[key],key);
    assert.notEqual(receipt.contentDigest,prior.contentDigest);assert.notEqual(receipt.sectionDigests.businessDefaults,prior.sectionDigests.businessDefaults);
    for(const key of Object.keys(prior.sectionDigests))if(key!=='businessDefaults')assert.equal(receipt.sectionDigests[key],prior.sectionDigests[key],key);
    assert.equal(receipt.businessSettingsConfirmation.operation,'owner_confirmed_business_settings');assert.equal(receipt.businessSettingsConfirmation.ownerId,owner);
  });
  // Nothing is waiting any more.
  assert.throws(()=>confirm(owner),error=>error.statusCode===409&&/No service is waiting only for its business-wide settings/.test(error.message));
});
test('3: a service whose own price also changed is not renewed; it still needs its own confirmation',()=>{
  const owner=twoApproved();
  edit(owner,book=>{book.defaults.markupPercent=10;book.services[0].pricing.price=150;});
  assert.deepEqual(statuses(owner).map(s=>[s.approvalCurrent,s.businessSettingsOnly]),[[false,undefined],[false,true]]);
  const second=bridge.readApplicationBook(owner).services[1].id;
  assert.deepEqual(confirm(owner).confirmedServiceIds,[second]);
  const after=statuses(owner);
  assert.deepEqual(after.map(s=>[s.status,s.approvalCurrent]),[['NEEDS PRICING',false],['QUOTING LIVE',true]]);
  assert.ok(after[0].applicationIssues.includes('Confirm this exact saved configuration before enabling customer quotes.'));
});
test('3: the confirmation must be explicit and for the current saved revision',()=>{
  const owner=twoApproved();edit(owner,book=>{book.defaults.rangeBufferPercent=5;});
  const revision=bridge.readApplicationBook(owner).revision;
  for(const input of [undefined,{},{revision},{revision,confirmBusinessSettings:'yes'}])assert.throws(()=>bridge.confirmApplicationBusinessSettings(owner,input),/Explicit confirmation of the saved business-wide settings is required/);
  assert.throws(()=>bridge.confirmApplicationBusinessSettings(owner,{revision:'stale',confirmBusinessSettings:true}),error=>error.details?.code==='REVISION_CONFLICT');
  assert.deepEqual(statuses(owner).map(s=>s.approvalCurrent),[false,false]);
});
test('3: a receipt that fails another check, or records no sections, is not renewed',()=>{
  // An older receipt without section records.
  let owner=twoApproved(),stored=loadPricebook(owner);delete stored.services[0].quoteDoneApproval.sectionDigests;savePricebook(owner,stored);
  edit(owner,book=>{book.defaults.markupPercent=10;});
  assert.deepEqual(statuses(owner).map(s=>s.businessSettingsOnly),[undefined,true]);
  // An approval version that no longer matches: the pricing rules changed.
  owner=twoApproved();stored=loadPricebook(owner);stored.services[0].quoteDoneApproval.approvalVersion=0;savePricebook(owner,stored);
  edit(owner,book=>{book.defaults.markupPercent=10;});
  const s=statuses(owner);assert.deepEqual(s.map(row=>row.businessSettingsOnly),[undefined,true]);
  assert.ok(s[0].applicationIssues.includes('Pricing rules changed — review and re-approve this service before customer quotes resume.'));
  confirm(owner);assert.deepEqual(statuses(owner).map(row=>row.approvalCurrent),[false,true]);
});
