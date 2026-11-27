// Neon audit of d712c688 (November 26, 2026), findings 2 and 3 (v60).
// Every expected value is worked out by hand in the comments before the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,getVNextPriceBookMetadata,vNextServiceStatus,ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';

migrate();
test('the engine is v61 (file written for v60)',()=>{assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261127-v61');});

// ---------------------------------------------------------------------------
// Finding 2. "Confirm your business-wide settings" (v59) was offered, and
// recorded a confirmation, while the saved business-wide settings themselves
// failed their check (tax on the whole job with no tax rate). The service
// stayed NEEDS PRICING after the owner confirmed, and the message said it was
// waiting "only" for that confirmation.
//
// Expected: a service is waiting only for the business-wide settings when
// confirming them is the one thing left before it quotes again. So:
//   a. Tax on the whole job, no rate saved: no service is offered the
//      confirmation, the confirmation is refused (409) and no receipt changes.
//      Each service says "taxPercent is required."
//   b. The owner saves a 13% rate: both services are offered it; one
//      confirmation renews both and both quote again.
//   c. A service that is turned off is not waiting to quote: it is not
//      offered or renewed. Turned on again, it is offered and renewed.
//   d. A service that also has a problem of its own (here a price option with
//      no name) is not offered or renewed until that is corrected.
// ---------------------------------------------------------------------------
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(false),peakMonths:[],peakSurchargePercent:0};
const custom=name=>({serviceType:'CUSTOM',service:name,source:'MANUAL',active:true,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},tiers:[]});
function twoApproved(){
  const owner='[SYNTHETIC]-v60-business-'+randomUUID();
  bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),defaults,services:[custom('[SYNTHETIC] First visit'),custom('[SYNTHETIC] Second visit')]});
  for(const index of [0,1]){const book=bridge.readApplicationBook(owner);bridge.approveApplicationService(owner,book.services[index].id,{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true});}
  return owner;
}
const statuses=owner=>{const book=bridge.readApplicationBook(owner);return bridge.validateApplicationDraft(owner,book).statuses;};
const edit=(owner,change)=>{const book=bridge.readApplicationBook(owner);change(book);return bridge.saveApplicationBook(owner,book);};
const confirm=owner=>bridge.confirmApplicationBusinessSettings(owner,{revision:bridge.readApplicationBook(owner).revision,confirmBusinessSettings:true});
const receipts=owner=>loadPricebook(owner).services.map(service=>structuredClone(service.quoteDoneApproval));
const row=s=>[s.status,s.approvalCurrent,s.businessSettingsOnly];
const NOTHING_WAITING=error=>error.statusCode===409&&/No service is waiting only for its business-wide settings/.test(error.message);

test('2a/2b: settings that fail their own check are not offered for confirmation and are not confirmed; once complete, one confirmation renews both services',()=>{
  const owner=twoApproved();
  assert.deepEqual(statuses(owner).map(row),[['QUOTING LIVE',true,undefined],['QUOTING LIVE',true,undefined]]);
  const before=receipts(owner);
  edit(owner,book=>{book.defaults.taxMode='TAX_ALL';delete book.defaults.taxPercent;});
  const held=statuses(owner);
  assert.deepEqual(held.map(row),[['NEEDS PRICING',false,undefined],['NEEDS PRICING',false,undefined]]);
  for(const status of held)assert.ok(status.validationErrors.includes('taxPercent is required.'),JSON.stringify(status.validationErrors));
  assert.throws(()=>confirm(owner),NOTHING_WAITING);
  assert.deepEqual(receipts(owner),before);
  // The owner completes the settings: 13% on the whole job.
  edit(owner,book=>{book.defaults.taxPercent=13;});
  assert.deepEqual(statuses(owner).map(row),[['NEEDS PRICING',false,true],['NEEDS PRICING',false,true]]);
  const result=confirm(owner);
  assert.equal(result.success,true);assert.equal(result.confirmedServiceIds.length,2);
  assert.deepEqual(statuses(owner).map(row),[['QUOTING LIVE',true,undefined],['QUOTING LIVE',true,undefined]]);
  for(const receipt of receipts(owner))assert.equal(receipt.businessSettingsConfirmation.operation,'owner_confirmed_business_settings');
});

test('2c: a service that is turned off is not offered or renewed; turned on again, it is',()=>{
  const owner=twoApproved();
  edit(owner,book=>{book.services[0].active=false;book.defaults.markupPercent=10;});
  assert.deepEqual(statuses(owner).map(row),[['DISABLED',false,undefined],['NEEDS PRICING',false,true]]);
  const [first,second]=bridge.readApplicationBook(owner).services.map(service=>service.id);
  const before=receipts(owner)[0];
  assert.deepEqual(confirm(owner).confirmedServiceIds,[second]);
  assert.deepEqual(statuses(owner).map(row),[['DISABLED',false,undefined],['QUOTING LIVE',true,undefined]]);
  assert.deepEqual(receipts(owner)[0],before);
  assert.throws(()=>confirm(owner),NOTHING_WAITING);
  edit(owner,book=>{book.services[0].active=true;});
  assert.deepEqual(statuses(owner).map(row),[['NEEDS PRICING',false,true],['QUOTING LIVE',true,undefined]]);
  assert.deepEqual(confirm(owner).confirmedServiceIds,[first]);
  assert.deepEqual(statuses(owner).map(row),[['QUOTING LIVE',true,undefined],['QUOTING LIVE',true,undefined]]);
});

test('2d: a service that also lacks a price of its own is not offered or renewed',()=>{
  // The first service was confirmed while its price was still missing, so its
  // receipt covers that saved content. A markup change then leaves its receipt
  // failing only on the business-wide settings, but confirming those would not
  // make it quote: it is not waiting only for them.
  const owner='[SYNTHETIC]-v60-business-'+randomUUID();
  const unpriced=custom('[SYNTHETIC] No price yet');delete unpriced.pricing.price;
  bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),defaults,services:[unpriced,custom('[SYNTHETIC] Priced visit')]});
  for(const index of [0,1]){const book=bridge.readApplicationBook(owner);bridge.approveApplicationService(owner,book.services[index].id,{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true});}
  assert.deepEqual(statuses(owner).map(row),[['NEEDS PRICING',true,undefined],['QUOTING LIVE',true,undefined]]);
  edit(owner,book=>{book.defaults.markupPercent=10;});
  const held=statuses(owner);
  assert.deepEqual(held.map(row),[['NEEDS PRICING',false,undefined],['NEEDS PRICING',false,true]]);
  assert.ok(held[0].validationErrors.includes('Fixed price per configured unit is required.'),JSON.stringify(held[0].validationErrors));
  const before=receipts(owner)[0],second=bridge.readApplicationBook(owner).services[1].id;
  assert.deepEqual(confirm(owner).confirmedServiceIds,[second]);
  assert.deepEqual(statuses(owner).map(row),[['NEEDS PRICING',false,undefined],['QUOTING LIVE',true,undefined]]);
  assert.deepEqual(receipts(owner)[0],before);
});

// ---------------------------------------------------------------------------
// Finding 3. Planting mulch is the cubic yards the customer states, with no
// overage (v59), so planting never reads "Mulch ordering overage". The engine
// still required the setting on a planting service and checked its range,
// while the price book no longer showed it: a planting service saved with an
// overage outside 1 to 2 was held with no field to correct.
//
// Expected: planting neither requires nor checks the setting; a saved value is
// ignored. Mulching still requires it and checks it.
//   Planting: 2 small plants (labor 20.00, plant allowance 15.00 each), 2 yd mulch.
//   Plants 2 x 20.00 + 2 x 15.00 = 70.00; mulch 2 x 45.00 = 90.00;
//   mulch labor 2 x 30.00 = 60.00; total 220.00, whatever the saved overage is.
//   Mulching: 324 sq ft at 3 in = 3 yd; overage 10%: 3.3 yd x 45.00 = 148.50;
//   labor 3 x 30.00 = 90.00; 238.50.
// ---------------------------------------------------------------------------
const mid=q=>q.options[0].calculationRecord.scenarios.mid;
const total=q=>mid(q).finalTotalCents;
const PLANTING_PRICES={plantingLaborPerPlant:{small:2000,medium:3000,large:5000},plantMaterialAllowance:{small:1500,medium:2500,large:6000},minimumServiceCharge:0,mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000};
const planting=(pricing={})=>fixture('LANDSCAPING_PLANTING',{...PLANTING_PRICES,...pricing},{plantsBySize:{small:2,medium:0,large:0},bedCondition:'clean',mulchNeeded:true,mulchYards:2,mulchType:'brown',accessDifficulty:'easy'});
const mulch=(pricing={})=>fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:4500},mulchInstallLaborPerYard:3000,minimumServiceCharge:0,mulchOverageFactor:1.10,...pricing},{mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy',inputMethod:'sqft',mulchArea:324,mulchDepth:3});
const live=f=>vNextServiceStatus({id:randomUUID(),active:true,...f.ownerPricing},f.businessDefaults);

test('3: planting quotes 220.00 whatever overage is saved on it, and with none saved',()=>{
  for(const [name,pricing] of [['the starting value',{mulchOverageFactor:1.10}],['above the range',{mulchOverageFactor:5}],['below the range',{mulchOverageFactor:0.5}],['zero',{mulchOverageFactor:0}]]){
    const f=planting(pricing),q=generateQuoteVNext(f);
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',name+': '+JSON.stringify([q.reviewReason,q.invalidOwnerFields,q.missingOwnerFields]));
    assert.equal(total(q),22000,name);
    const status=live(f);
    assert.equal(status.status,'QUOTING LIVE',name+': '+JSON.stringify(status.validationErrors));
  }
  // None saved at all.
  const bare=planting();delete bare.ownerPricing.mulchOverageFactor;if(bare.ownerPricing.pricing)delete bare.ownerPricing.pricing.mulchOverageFactor;
  const q=generateQuoteVNext(bare);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.invalidOwnerFields,q.missingOwnerFields]));
  assert.equal(total(q),22000);
  const status=live(bare);
  assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status.validationErrors));
  assert.ok(!(status.ownerDiagnostics||[]).some(d=>d.path==='mulchOverageFactor'));
});

test('3: mulching still requires the overage and checks its range',()=>{
  assert.equal(total(generateQuoteVNext(mulch())),23850);
  const outside=generateQuoteVNext(mulch({mulchOverageFactor:5}));
  assert.equal(outside.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(outside.invalidOwnerFields.includes('mulchOverageFactor'),JSON.stringify(outside.invalidOwnerFields));
  const status=live(mulch({mulchOverageFactor:5}));
  assert.equal(status.status,'NEEDS PRICING');
  assert.ok(status.ownerDiagnostics.some(d=>d.path==='mulchOverageFactor'&&d.type==='invalid'));
  const missing=mulch();delete missing.ownerPricing.mulchOverageFactor;if(missing.ownerPricing.pricing)delete missing.ownerPricing.pricing.mulchOverageFactor;
  assert.ok(live(missing).ownerDiagnostics.some(d=>d.path==='mulchOverageFactor'&&d.type==='missing'));
});

test('3: the setting is marked unused for planting only, and the price book does not offer it there',()=>{
  assert.equal(CLASS2_DEFINITIONS.LANDSCAPING_PLANTING.mulchOverageFactor.unused,true);
  assert.equal(CLASS2_DEFINITIONS.LANDSCAPING_MULCH.mulchOverageFactor.unused,undefined);
  // No other setting of any service is marked unused.
  const marked=Object.entries(CLASS2_DEFINITIONS).flatMap(([type,definitions])=>Object.entries(definitions).filter(([,definition])=>definition.unused).map(([name])=>type+'.'+name));
  assert.deepEqual(marked,['LANDSCAPING_PLANTING.mulchOverageFactor']);
  const meta=getVNextPriceBookMetadata();
  assert.ok(!meta.find(m=>m.serviceType==='LANDSCAPING_PLANTING').class2Fields.some(d=>d.name==='mulchOverageFactor'));
  assert.ok(meta.find(m=>m.serviceType==='LANDSCAPING_MULCH').class2Fields.some(d=>d.name==='mulchOverageFactor'));
  const app=bridge.applicationMetadata().services.find(m=>m.serviceType==='LANDSCAPING_PLANTING');
  assert.ok(!app.class2Fields.some(d=>(d.name||d.field)==='mulchOverageFactor'));
  assert.ok(!app.fields.some(d=>d.field==='mulchOverageFactor'));
});

test('3: a saved planting service whose overage is outside the range quotes again in the application',()=>{
  const owner='[SYNTHETIC]-v60-planting-'+randomUUID();
  const service={serviceType:'LANDSCAPING_PLANTING',service:'[SYNTHETIC] Planting',source:'MANUAL',active:true,knownOfferings:{mulchType:{brown:randomUUID()}},
    feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),
    pricing:{plantingLaborPerPlant:{small:20,medium:30,large:50},plantMaterialAllowance:{small:15,medium:25,large:60},minimumServiceCharge:0,mulchMaterialPerYard:{brown:45},mulchOrderIncrementCubicYards:{brown:1},mulchInstallLaborPerYard:30,
      bedPrepLaborPerSqft:{needs_weeding:1,overgrown:2},accessMultiplier:{easy:1,moderate:1.1,difficult:1.25}},tiers:[]};
  bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),defaults,services:[service]});
  let book=bridge.readApplicationBook(owner);
  bridge.approveApplicationService(owner,book.services[0].id,{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true});
  assert.deepEqual(statuses(owner).map(s=>[s.status,s.approvalCurrent]),[['QUOTING LIVE',true]]);
  // An earlier save left 5 on the service (the editor offered the field before v59).
  const stored=loadPricebook(owner);stored.services[0].pricing.mulchOverageFactor=5;savePricebook(owner,stored);
  book=bridge.readApplicationBook(owner);
  const [status]=statuses(owner);
  assert.ok(!status.validationErrors.some(message=>/overage/i.test(message)),JSON.stringify(status.validationErrors));
  assert.ok(!(status.ownerDiagnostics||[]).some(d=>d.path==='mulchOverageFactor'));
  // Its saved content changed, so it needs its own confirmation; nothing else holds it.
  assert.deepEqual(status.applicationIssues,['Confirm this exact saved configuration before enabling customer quotes.']);
  bridge.approveApplicationService(owner,book.services[0].id,{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true});
  assert.deepEqual(statuses(owner).map(s=>[s.status,s.approvalCurrent]),[['QUOTING LIVE',true]]);
});
