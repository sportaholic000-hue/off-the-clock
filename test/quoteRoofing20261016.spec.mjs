import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import {synchronizeStartingValuesVNext} from '../server/quote-engine-vnext/priceGroundwork.js';
import {CLASS2_DEFINITIONS} from '../server/quote-engine-vnext/contracts.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {customerQuoteFields} from '../server/customerQuoteFields.js';
import {webQuote,phone,at} from './quoteDeliveryBatch20261015Fixture.mjs';
import {quoteEmailFixture} from './quoteEmailFixture.mjs';

const line=(result,name)=>result.lineItems.find(item=>item.name===name);
const total=result=>result.lineItems.reduce((sum,item)=>sum+item.amountCents,0);

function roof(customer={},pricing={}){
  const input=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:1},
    tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:1},
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},
    disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0,
    ...pricing
  },{
    roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',
    replacementRoofType:'asphalt_shingle',pitchMethod:'area_by_pitch',
    pitchAreaUpTo6Sqft:1200,pitchArea7To9Sqft:800,stories:1,existingLayers:1,
    roofComplexity:'simple',serviceScope:'full',...customer
  });
  input.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  Object.assign(input.ownerPricing.pricing,{
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},
    pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},
    complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},
    additionalLayerRemovalFactor:0.70
  });
  return input;
}

function newApplicationRoof(customer={}){
  const input=roof(customer);
  delete input.ownerPricing.startingValueAdoptions;delete input.ownerPricing.startingValueState;
  for(const field of ['pitchInstallationAdder','pitchRemovalAdder','complexityLaborMultiplier','additionalLayerRemovalFactor'])delete input.ownerPricing.pricing[field];
  input.ownerPricing.pricing.unknownPitchBand='seven_to_nine';
  return input;
}

test('roof adoption keeps legacy mode unchanged and adopted mixed pitch uses additive per-band charges',()=>{
  // Written before execution: 20 squares at $200 = 400,000c labor. Only the
  // eight 7/12-9/12 squares add 8*$200*20% = 32,000c. Tear-off is 120,000c,
  // disposal is 40,000c, and steep removal is 8*($60+$20)*26% = 16,640c.
  const input=roof();
  let result=generateQuoteVNext(input);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(line(result,'Roofing labor').amountCents,400000);
  assert.equal(line(result,'Steep-pitch installation').amountCents,32000);
  assert.equal(line(result,'Tear-off').amountCents,120000);
  assert.equal(line(result,'Roofing disposal').amountCents,40000);
  assert.equal(line(result,'Steep-pitch removal').amountCents,16640);

  // Before adoption, today's Very steep x three-story multiplication remains:
  // 10*$200*1.40*1.20 = 336,000c, regardless of complexity.
  delete input.ownerPricing.startingValueAdoptions;
  input.customerInputs={...input.customerInputs,roofSizeInput:1000,pitch:'very_steep',stories:3,roofComplexity:'moderate'};
  delete input.customerInputs.pitchMethod;delete input.customerInputs.pitchAreaUpTo6Sqft;delete input.customerInputs.pitchArea7To9Sqft;
  result=generateQuoteVNext(input);
  assert.equal(line(result,'Roofing labor').amountCents,336000);
});

test('adopted upper pitch, story and complexity additions do not multiply',()=>{
  // Written before execution: labor = 200,000 base + 40,000 story + 40,000
  // complexity + 62,000 steep = 342,000c. Tear-off = 60,000 + 12,000 story;
  // upper-band removal = 10*($60+$20)*41% = 32,800c.
  const input=roof({roofSizeInput:1000,pitchMethod:'whole_roof',pitchBand:'ten_to_twelve',stories:3,roofComplexity:'moderate'});
  delete input.customerInputs.pitchAreaUpTo6Sqft;delete input.customerInputs.pitchArea7To9Sqft;
  const result=generateQuoteVNext(input);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(line(result,'Roofing labor').amountCents,200000);
  assert.equal(line(result,'Story labor adjustment').amountCents,40000);
  assert.equal(line(result,'Roof-shape labor adjustment').amountCents,40000);
  assert.equal(line(result,'Steep-pitch installation').amountCents,62000);
  assert.equal(['Roofing labor','Story labor adjustment','Roof-shape labor adjustment','Steep-pitch installation'].reduce((sum,name)=>sum+line(result,name).amountCents,0),342000);
  assert.equal(line(result,'Tear-off').amountCents+line(result,'Story tear-off adjustment').amountCents,72000);
  assert.equal(line(result,'Steep-pitch removal').amountCents,32800);
});

test('adopted footprint conversion, additional layers, over-12 and unknown pitch rules are explicit',()=>{
  // Written before execution: 1,500*sqrt(1+(8/12)^2) rounds to 1,802.78 sq ft,
  // and 18.0278 roofing squares at $200 produce 360,556 cents of base labor.
  let input=roof({roofSizeMethod:'footprint',roofSizeInput:1500,pitchRisePer12:8,pitchMethod:'whole_roof',pitchBand:'seven_to_nine'});
  delete input.customerInputs.pitchAreaUpTo6Sqft;delete input.customerInputs.pitchArea7To9Sqft;
  let result=generateQuoteVNext(input);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(line(result,'Roofing labor').calculation.quantity*100,1802.78);
  assert.equal(line(result,'Roofing labor').amountCents,360556);

  // Two layers on ten squares: first removal 60,000c; additional layer
  // 10*$60*70%=42,000c. Disposal remains every layer: 20*$20=40,000c.
  input=roof({roofSizeInput:1000,pitchMethod:'whole_roof',pitchBand:'up_to_six',existingLayers:2});
  delete input.customerInputs.pitchAreaUpTo6Sqft;delete input.customerInputs.pitchArea7To9Sqft;
  result=generateQuoteVNext(input);
  assert.equal(line(result,'Tear-off').amountCents,60000);
  assert.equal(line(result,'Additional-layer tear-off').amountCents,42000);
  assert.equal(line(result,'Roofing disposal').amountCents,40000);

  input=roof({pitchMethod:'whole_roof',pitchBand:'over_twelve'});
  delete input.customerInputs.pitchAreaUpTo6Sqft;delete input.customerInputs.pitchArea7To9Sqft;
  result=generateQuoteVNext(input);
  assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.match(result.reviewReason,/over 12\/12/i);
  input.ownerPricing.pricing.pitchInstallationAdderOverTwelve=0.50;
  input.ownerPricing.pricing.pitchRemovalAdderOverTwelve=0.60;
  assert.equal(generateQuoteVNext(input).resultType,'INSTANT_ESTIMATE_READY');

  input=roof({pitchMethod:'not_sure'});delete input.customerInputs.pitchAreaUpTo6Sqft;delete input.customerInputs.pitchArea7To9Sqft;
  assert.equal(generateQuoteVNext(input).resultType,'ESTIMATE_REQUIRES_REVIEW');
  input.ownerPricing.pricing.unknownPitchBand='seven_to_nine';
  result=generateQuoteVNext(input);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
  assert.ok(result.priceDrivers.some(value=>/pitch.*confirm.*on site/i.test(value)));
});

test('roof dependent accessory lines, distinct labels and decking allocation are exact',()=>{
  // Written before execution: 120LF*$4=48,000c; 40LF*$6=24,000c;
  // 30LF*$8=24,000c; 3*$45=13,500c; 40LF*$9=36,000c.
  const input=roof({
    iceWaterBarrierLengthLF:120,valleyLengthLF:40,stepFlashingLengthLF:30,
    pipeJackCount:3,ridgeVentLengthLF:40,deckingSheets:5,
    starterLengthLF:0,dripEdgeLengthLF:0,ridgeCapLengthLF:0
  },{
    accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',
    iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:400,valleyPerLF:600,
    stepFlashingPerLF:800,pipeJackEach:4500,ridgeVentPerLF:900,
    deckingPerSheet:9000,deckingPriceBasis:'installed',
    installedLaborPercent:{'deckingPerSheet':60},installedMaterialsPercent:{'deckingPerSheet':40}
  });
  const dependent=roofFlashingVentDefinitionVNext('asphalt_shingle');
  const before=structuredClone(input);
  for(const field of ['iceWaterBarrierLengthLF','valleyLengthLF','stepFlashingLengthLF','pipeJackCount','ridgeVentLengthLF'])delete before.customerInputs[field];
  before.ownerPricing.pricing.materialAccessoryBasis='excludes_itemized_accessories';
  delete before.ownerPricing.dependentLineState;
  const withoutNewRates=structuredClone(before);
  for(const field of ['iceWaterBarrierUnit','iceWaterBarrierPerLF','valleyPerLF','stepFlashingPerLF','pipeJackEach','ridgeVentPerLF'])delete withoutNewRates.ownerPricing.pricing[field];
  assert.equal(total(generateQuoteVNext(before)),total(generateQuoteVNext(withoutNewRates)),'inactive extracted lines preserve today to the cent');
  assert.ok(!customerQuoteFields(before.ownerPricing,before.ownerPricing.pricing).some(field=>field.name==='pipeJackCount'));
  input.ownerPricing=synchronizeDependentLinesVNext(input.ownerPricing,[dependent],{ownerId:input.ownerPricing.origin.ownerId,reenteredIds:[dependent.id],confirmIds:[dependent.id],now:'2026-10-16T12:00:00.000Z'});
  assert.ok(customerQuoteFields(input.ownerPricing,input.ownerPricing.pricing).some(field=>field.name==='pipeJackCount'));
  const result=generateQuoteVNext(input);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));
  assert.equal(line(result,'Ice and water barrier').amountCents,48000);
  assert.equal(line(result,'Valley preparation').amountCents,24000);
  assert.equal(line(result,'Step flashing').amountCents,24000);
  assert.equal(line(result,'Pipe jacks').amountCents,13500);
  assert.equal(line(result,'Ridge vent').amountCents,36000);
  const decking=line(result,'Decking replacement');
  assert.equal(decking.amountCents,45000);
  assert.equal(decking.installedLaborExactCents.numerator/decking.installedLaborExactCents.denominator,27000);
});

test('caller approximate roofing inputs quote and voice retains the exact on-site line',()=>{
  // Written before execution: approximate 2,000 sq ft and an 8/12 selection
  // are usable numeric inputs. They must quote rather than review. Voice adds
  // the existing exact on-site confirmation sentence.
  const result=generateQuoteVNext(roof({pitchMethod:'whole_roof',pitchBand:'seven_to_nine'}));
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
  const voice=projectVoiceQuote(result,'synthetic-roof-handle',[],{callerMeasurementsEstimated:true});
  assert.match(voice.quoteNarration,/This price is based on the measurements you gave us\. The business will confirm them on site\./);
});

test('every legacy roof pitch, story, layer and complexity combination stays on the prior formula until adoption',()=>{
  // Written before execution: legacy labor remains squares*$200*pitch*story;
  // tear-off remains squares*layers*$60*pitch*story. Complexity changes only
  // material waste, exactly as at the lane-A parent.
  const pitch={low:1,medium:1.15,steep:1.25,very_steep:1.40},story={1:1,2:1.10,3:1.20};
  for(const pitchName of Object.keys(pitch))for(const stories of [1,2,3])for(const layers of [1,2])for(const complexity of ['simple','moderate','complex']){
    const input=roof();delete input.ownerPricing.startingValueAdoptions;
    input.customerInputs={...input.customerInputs,pitch:pitchName,stories,existingLayers:layers,roofComplexity:complexity};
    delete input.customerInputs.pitchMethod;delete input.customerInputs.pitchAreaUpTo6Sqft;delete input.customerInputs.pitchArea7To9Sqft;
    const result=generateQuoteVNext(input),key=[pitchName,stories,layers,complexity].join('/');
    assert.equal(line(result,'Roofing labor').amountCents,Math.round(20*20000*pitch[pitchName]*story[stories]),key+' labor');
    assert.equal(line(result,'Tear-off').amountCents,Math.round(20*layers*6000*pitch[pitchName]*story[stories]),key+' tear-off');
  }
});

test('group adoption confirms current system values together, preserves owner values and later definition changes unconfirm',()=>{
  // Written before execution: legacy mode retains old rules while displaying
  // all eight current roofing leaves. One adoption changes only the group
  // receipt and confirms every system-owned leaf. An owner-entered 0.33 stays
  // 0.33. A later changed system value becomes unconfirmed again.
  const original=roof().ownerPricing;delete original.startingValueAdoptions;
  delete original.pricing.pitchInstallationAdder;delete original.pricing.pitchRemovalAdder;delete original.pricing.complexityLaborMultiplier;delete original.pricing.additionalLayerRemovalFactor;
  let service=synchronizeStartingValuesVNext(original,CLASS2_DEFINITIONS.ROOFING_REPLACEMENT,{legacyGroups:['roofing_replacement_20261016'],now:'2026-10-16T10:00:00.000Z'});
  assert.equal(service.startingValueAdoptions.roofing_replacement_20261016.mode,'legacy');
  service.pricing.pitchInstallationAdder.seven_to_nine=0.33;
  service=synchronizeStartingValuesVNext(service,CLASS2_DEFINITIONS.ROOFING_REPLACEMENT,{ownerEnteredPaths:['pitchInstallationAdder.seven_to_nine'],now:'2026-10-16T10:01:00.000Z'});
  service=synchronizeStartingValuesVNext(service,CLASS2_DEFINITIONS.ROOFING_REPLACEMENT,{ownerId:service.origin.ownerId,adoptGroups:['roofing_replacement_20261016'],now:'2026-10-16T10:02:00.000Z'});
  assert.equal(service.startingValueAdoptions.roofing_replacement_20261016.mode,'adopted');
  assert.equal(service.pricing.pitchInstallationAdder.seven_to_nine,0.33);
  assert.ok(Object.values(service.startingValueState).every(row=>row.confirmed===true));
  const changed=structuredClone(CLASS2_DEFINITIONS.ROOFING_REPLACEMENT);
  changed.additionalLayerRemovalFactor={...changed.additionalLayerRemovalFactor,defaultValue:0.72,startingValue:0.72};
  service=synchronizeStartingValuesVNext(service,changed,{now:'2026-10-17T10:00:00.000Z'});
  assert.equal(service.pricing.additionalLayerRemovalFactor,0.72);
  assert.equal(service.startingValueState.additionalLayerRemovalFactor.confirmed,false);
  assert.equal(service.pricing.pitchInstallationAdder.seven_to_nine,0.33);
});

test('application adoption keeps a historically approved roof live, then atomically binds the new rules',()=>{
  // Written before execution: the synthetic historical approval remains
  // current and quotes legacy Very steep x three-story labor at 336,000c.
  // One application approval operation adopts and confirms the whole roofing
  // starting-value group. After reload, 10 squares at 11/12, three stories and
  // moderate shape use additive labor totaling 342,000c.
  const owner='roof-adoption-'+crypto.randomUUID(),input=roof(),raw=structuredClone(input.ownerPricing);
  raw.id=crypto.randomUUID();raw.origin={...raw.origin,ownerId:owner,serviceId:raw.id};raw.source='MANUAL';raw.active=true;
  delete raw.startingValueAdoptions;delete raw.startingValueState;
  for(const field of ['pitchInstallationAdder','pitchRemovalAdder','complexityLaborMultiplier','additionalLayerRemovalFactor'])delete raw.pricing[field];
  Object.assign(raw.pricing,{unknownPitchBand:'seven_to_nine',pitchInstallationAdderOverTwelve:.5,pitchRemovalAdderOverTwelve:.6});
  const book={ownerId:owner,services:[raw],defaults:{currency:'CAD',...input.businessDefaults}};
  raw.quoteDoneApproval={ownerId:owner,serviceId:raw.id,operationId:crypto.randomUUID(),approvedAt:'2026-10-15T12:00:00.000Z',engineVersion:bridge.ENGINE_VERSION,moneyUnitVersion:'roof-minimum-cents-v1',operation:'owner_confirmed_quotedone_registration',contentDigest:bridge.digest(bridge.approvalContent(raw,book,{forceLegacyStartingValues:true}))};
  savePricebook(owner,book);
  let saved=loadPricebook(owner);
  const historicalStatus=bridge.applicationStatus(saved.services[0],saved);
  assert.equal(historicalStatus.status,'QUOTING LIVE',JSON.stringify(historicalStatus));
  let preview=bridge.previewApplicationQuote(owner,{revision:bridge.bookRevision(saved),serviceId:raw.id,customerInputs:{roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'very_steep',stories:3,existingLayers:1,roofComplexity:'moderate',serviceScope:'full',confirmedFacts:input.customerInputs.confirmedFacts}});
  assert.equal(preview.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(preview));
  assert.equal(preview.midEstimate,4568.21);
  const display=bridge.readApplicationBook(owner);
  assert.equal(display.services[0].startingValueAdoptions.roofing_replacement_20261016.mode,'legacy');
  bridge.approveApplicationService(owner,raw.id,{revision:display.revision,adoptStartingValueGroup:'roofing_replacement_20261016'});
  saved=loadPricebook(owner);
  assert.equal(saved.services[0].startingValueAdoptions.roofing_replacement_20261016.mode,'adopted');
  assert.ok(Object.values(saved.services[0].startingValueState).every(row=>row.confirmed===true));
  preview=bridge.previewApplicationQuote(owner,{revision:bridge.bookRevision(saved),serviceId:raw.id,customerInputs:{roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'ten_to_twelve',stories:3,existingLayers:1,roofComplexity:'moderate',serviceScope:'full',confirmedFacts:input.customerInputs.confirmedFacts}});
  assert.equal(preview.midEstimate,4668.21);
});

test('new-rule application service confirms its starting values, reaches live readiness and quotes a whole-roof steep band',()=>{
  // Written before execution: after all four starting definitions (eight
  // leaves) are explicitly confirmed and the owner's not-sure band is set,
  // readiness must exercise the new customer contract and report QUOTING
  // LIVE. Twenty 7/12-9/12 squares then quote rather than review.
  const owner='roof-new-live-'+crypto.randomUUID(),input=roof({pitchMethod:'whole_roof',pitchBand:'seven_to_nine'}),service=structuredClone(input.ownerPricing);
  delete service.origin;delete service.quoteDoneApproval;delete service.startingValueAdoptions;delete service.startingValueState;
  for(const field of ['pitchInstallationAdder','pitchRemovalAdder','complexityLaborMultiplier','additionalLayerRemovalFactor'])delete service.pricing[field];
  service.source='MANUAL';service.pricing.unknownPitchBand='seven_to_nine';
  const initial=bridge.readApplicationBook(owner),draft=bridge.convertApplicationBook({services:[service],defaults:{currency:'USD',...input.businessDefaults}},'toDollars');
  bridge.saveApplicationBook(owner,{...draft,revision:initial.revision});
  let display=bridge.readApplicationBook(owner),saved=display.services[0];
  saved.startingValueActions={confirmPaths:Object.keys(saved.startingValueState)};
  bridge.saveApplicationBook(owner,{...display,services:[saved],revision:display.revision});
  display=bridge.readApplicationBook(owner);
  bridge.approveApplicationService(owner,display.services[0].id,{revision:display.revision,confirmConfiguration:true,confirmLegacySettings:true});
  const stored=loadPricebook(owner),status=bridge.bookStatuses(stored)[0];
  assert.equal(status.status,'QUOTING LIVE',JSON.stringify(status));
  const outcome=bridge.calculateApplicationQuote(stored,stored.services[0],{customerInputs:input.customerInputs,customerFeeSelections:{}},{preparingIntake:true});
  assert.equal(outcome.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(outcome.internalResult));

  // The public application boundary must reach the same ready outcome, not
  // merely the direct bridge calculation above.
  const webInput=newApplicationRoof({pitchMethod:'whole_roof',pitchBand:'seven_to_nine'});
  delete webInput.customerInputs.pitchAreaUpTo6Sqft;delete webInput.customerInputs.pitchArea7To9Sqft;
  const web=webQuote(webInput,[],at,{roofRuleMode:'new'});
  assert.equal(web.result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(web.result));
});

test('new roofing decking exactly preserves the established optional-line and customer-note behavior',()=>{
  // Written before execution: without a decking price, a confirmed zero sheet
  // count has no line and no decking-price note. At $90 per sheet, five sheets
  // cost exactly 45,000 cents and both established customer notes appear.
  const none=roof({deckingSheets:0});delete none.ownerPricing.pricing.deckingPerSheet;delete none.ownerPricing.pricing.deckingPriceBasis;
  let result=generateQuoteVNext(none);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));
  assert.equal(line(result,'Decking replacement'),undefined);
  assert.equal(result.priceDrivers.some(value=>/decking/i.test(value)),false);
  const priced=roof({deckingSheets:5},{deckingPerSheet:9000,deckingPriceBasis:'installed',installedLaborPercent:{deckingPerSheet:60},installedMaterialsPercent:{deckingPerSheet:40}});
  result=generateQuoteVNext(priced);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));
  assert.equal(line(result,'Decking replacement').amountCents,45000);
  assert.ok(result.priceDrivers.includes('Any additional decking is priced per sheet and confirmed on site.'));
  assert.ok(result.priceDrivers.includes('5 decking sheets included'));
});

test('new roofing partial pitch areas describe only the replaced area and reject whole-roof totals',()=>{
  // Written before execution: a 1,000-sq-ft partial replacement with 600 sq ft
  // at up to 6/12 and 400 sq ft at 8/12 applies 20% steep labor to four
  // $200 squares: 4 * 20,000 * 0.20 = 16,000 cents. Pitch areas totaling the
  // full 2,000-sq-ft roof contradict that job scope and request correction.
  const valid=roof({roofSizeInput:2000,serviceScope:'partial',partialAreaSqft:1000,pitchAreaUpTo6Sqft:600,pitchArea7To9Sqft:400});
  let result=generateQuoteVNext(valid);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));
  assert.equal(line(result,'Steep-pitch installation').amountCents,16000);
  const invalid=roof({roofSizeInput:2000,serviceScope:'partial',partialAreaSqft:1000,pitchAreaUpTo6Sqft:1200,pitchArea7To9Sqft:800});
  result=generateQuoteVNext(invalid);
  assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(result.invalidCustomerFields.includes('pitchAreaUpTo6Sqft'));
  assert.match(result.reviewReason,/areas by pitch.*area being replaced/i);
});

test('partial pitch-area contradictions ask for correction at the widget application boundary',()=>{
  // Written before execution: a partial 1,000-sq-ft job cannot accept pitch
  // areas totaling the 2,000-sq-ft whole roof. The production intake boundary
  // must return needs_details and identify the pitch-area field for correction.
  const valid=newApplicationRoof({roofSizeInput:2000,serviceScope:'partial',partialAreaSqft:1000,pitchAreaUpTo6Sqft:600,pitchArea7To9Sqft:400});
  const web=webQuote(valid,[],at,{roofRuleMode:'new'});
  const submission=structuredClone(web.body);
  submission.requestId=crypto.randomUUID();delete submission.intakeConfirmation;
  Object.assign(submission.customerInputs,{pitchAreaUpTo6Sqft:1200,pitchArea7To9Sqft:800});
  const prepared=bridge.prepareApplicationIntake(web.owner,submission,{timeZone:'UTC',quoteInstant:at});
  assert.equal(prepared.status,'needs_details',JSON.stringify(prepared));
  assert.ok(prepared.followUps.some(value=>/pitch|6\/12/i.test(value)),JSON.stringify(prepared.followUps));
});

test('partial pitch-area contradictions ask for correction through the receptionist',async t=>{
  // Written before execution: the same contradiction returns needs_details on
  // the production voice tool and repeats a pitch-area correction prompt; it
  // never presents a price based on the whole-roof areas.
  const h=quoteEmailFixture(t),invalid=newApplicationRoof({roofSizeInput:2000,serviceScope:'partial',partialAreaSqft:1000,pitchAreaUpTo6Sqft:1200,pitchArea7To9Sqft:800});
  const observed=await phone(h,invalid,{applicationOptions:{roofRuleMode:'new'}});
  assert.equal(observed.result.status,'needs_details',JSON.stringify(observed.result));
  assert.equal(observed.result.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(observed.result.followUps.some(value=>/pitch|6\/12/i.test(value)),JSON.stringify(observed.result.followUps));
  assert.equal(observed.result.quoteNarration,undefined);
});
