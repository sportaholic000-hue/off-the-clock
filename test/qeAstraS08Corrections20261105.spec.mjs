import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {discloseQuoteScope,customerReceiptPresentation} from '../server/src/quoteScopeDisclosure.js';
import {approvalContent} from '../server/src/quoteDoneBridge.js';
import {existingFloorSubstrate,floatCompatibility,substrateContradiction,FLOOR_STAY_LABEL} from '../server/scopeConfiguration.js';

// November 5, 2026: Astra's S08 corrections (product conditions, partial
// estimate for unresolved compatibility, material-only names). Expected values
// worked out by hand: 200 sq ft laminate at 3.00 labor and 5.00 material =
// 660.00 + 1,080.00 = 1,740.00.
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X, instructions rev. 2025'};
const floor=(name,pricing={},answers={},product='laminate')=>{
  const id=randomUUID(),f=flooring(product);
  Object.assign(f.ownerPricing.pricing,{...(product==='laminate'?{scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}}:{}),...pricing});
  if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:id};
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,existingFloorSound:'yes',...(product==='laminate'?{underlaymentScopeConfirmed:true}:{}),...answers});
  f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
  return f;
};
const priced=(f,partial)=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);assert.equal(q.options[0].midEstimate,1740);assert.deepEqual(q.options[0].skippedAddons,partial?[FLOOR_STAY_LABEL]:[]);return q;};
const refused=(f,reason)=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,reason);};

test('a condition from the product instructions is asked, and its answer decides: met, broken or not sure',()=>{
  const sheet={...L,laminateFloatsOver:{resilient_sheet:true},laminateFloatConditions:{sheet_vinyl_single_layer:true}};
  assert.deepEqual(generateQuoteVNext(floor('sheet_vinyl',sheet)).missingCustomerFields,['existingFloorLayers']);
  priced(floor('sheet_vinyl',sheet,{existingFloorLayers:'one'}),false);
  refused(floor('sheet_vinyl',sheet,{existingFloorLayers:'two_or_more'}),/only one layer of existing sheet vinyl or linoleum\), so the existing floor has to come out first/);
  priced(floor('sheet_vinyl',sheet,{existingFloorLayers:'not_sure'}),true);
  const wood={...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_on_concrete:true}};
  assert.deepEqual(generateQuoteVNext(floor('oak',wood)).missingCustomerFields,['woodAdheredToConcrete']);
  priced(floor('oak',wood,{woodAdheredToConcrete:'no'}),false);
  refused(floor('oak',wood,{woodAdheredToConcrete:'yes'}),/do not allow a wood floor glued directly to concrete/);
  priced(floor('oak',wood,{woodAdheredToConcrete:'not_sure'}),true);
  // The sheet-vinyl layer condition does not apply to vinyl tile or plank.
  const plank={...L,laminateFloatsOver:{resilient_tile_plank:true},laminateFloatConditions:{sheet_vinyl_single_layer:true}};
  priced(floor('vct',plank),false);
  // Without the product's list, a condition is not asked: the job is conditional anyway.
  assert.equal(generateQuoteVNext(floor('sheet_vinyl',{...L,laminateFloatConditions:{sheet_vinyl_single_layer:true}})).missingCustomerFields,undefined);
});

test('absent maps, missing entries and explicit false stay distinct; all-false never falls into the permissive path',()=>{
  assert.equal(floatCompatibility('laminate','tile',{}),'conditional');
  assert.equal(floatCompatibility('laminate','tile',{laminateFloatsOver:{wood:true}}),'conditional');
  assert.equal(floatCompatibility('laminate','tile',{laminateFloatsOver:{ceramic_stone_tile:false}}),'prohibited');
  assert.equal(floatCompatibility('laminate','tile',{laminateFloatsOver:{wood:false,resilient_sheet:false,resilient_tile_plank:false,ceramic_stone_tile:false,concrete:false}}),'prohibited');
  assert.equal(floatCompatibility('laminate','tile',{laminateFloatsOver:{ceramic_stone_tile:true}}),'permitted');
  priced(floor('tile'),true);
  priced(floor('tile',{...L,laminateFloatsOver:{wood:true}}),true);
  refused(floor('tile',{...L,laminateFloatsOver:{ceramic_stone_tile:false}}),/has to come out first/);
  priced(floor('tile',{...L,laminateFloatsOver:{ceramic_stone_tile:true}}),false);
});

test('a name gives the material only: attachment comes from the customer, for engineered hardwood and vinyl plank',()=>{
  for(const [name,material] of [['engineered_hardwood','wood'],['vinyl_plank','resilient_tile_plank'],['lvp','resilient_tile_plank']]){
    assert.equal(existingFloorSubstrate(name),material,name);
    // An owner classifying it by its material is never a contradiction.
    assert.equal(substrateContradiction(name,{existingFloorSubstrate:{[name]:material}}),null,name);
    const permitted={...L,laminateFloatsOver:{[material]:true}};
    priced(floor(name,permitted,{existingFloorSound:'yes'}),false);                  // confirmed attached
    refused(floor(name,permitted,{existingFloorSound:'no'}),/loose, cushioned or floating floor usually has to come out/);   // confirmed floating
    refused(floor(name,permitted,{existingFloorSound:'not_sure'}),/needs an on-site check/);   // method unknown
  }
  // Bare vinyl names no material; compounds still need the owner.
  for(const name of ['vinyl','vinyl_tile','rubber_tile','cork_tile'])assert.equal(existingFloorSubstrate(name),undefined,name);
  // Only floors that always float stay refused outright.
  refused(floor('laminate'),/has to come out first/);
});

test('a conditional estimate reaches the customer as a partial estimate naming what is unresolved, and its receipt keeps it',()=>{
  const f=floor('tile');
  const shown=discloseQuoteScope(sanitizeForCustomerVNext(generateQuoteVNext(f)),f.ownerPricing,{},{customerInputs:f.customerInputs},'audit');
  assert.equal(shown.resultType,'PARTIAL_ESTIMATE_READY');
  assert.deepEqual(shown.additionalWork.map(item=>item.description),[FLOOR_STAY_LABEL]);
  assert.equal(shown.pricedEstimate.options[0].midEstimate,1740);
  assert.equal(shown.fullJobTotal,null);
  const receipt=customerReceiptPresentation(JSON.parse(JSON.stringify(shown)));
  assert.equal(receipt.resultType,'PARTIAL_ESTIMATE_READY');
  assert.deepEqual(receipt.additionalWork.map(item=>item.description),[FLOOR_STAY_LABEL]);
  // Permitted and conditions met: an ordinary estimate.
  const g=floor('tile',{...L,laminateFloatsOver:{ceramic_stone_tile:true}});
  assert.equal(discloseQuoteScope(sanitizeForCustomerVNext(generateQuoteVNext(g)),g.ownerPricing,{},{customerInputs:g.customerInputs},'audit').resultType,'INSTANT_ESTIMATE_READY');
});

test('tiers with different product rules carry their own outcome',()=>{
  const f=floor('tile');
  f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{...L,laminateFloatsOver:{ceramic_stone_tile:true}}}];
  const q=generateQuoteVNext(f),by=name=>q.options.find(o=>o.tierName===name);
  assert.deepEqual(by('Good').skippedAddons,[FLOOR_STAY_LABEL]);
  assert.deepEqual(by('Best').skippedAddons,[]);
  const customer=sanitizeForCustomerVNext(q);
  assert.deepEqual(customer.options.find(o=>o.tierName==='Good').skippedAddons,[FLOOR_STAY_LABEL]);
  assert.deepEqual(customer.options.find(o=>o.tierName==='Best').skippedAddons,[]);
  // A tier that prohibits the floor is never shown as a price for it.
  f.ownerPricing.tiers[1].overrides.laminateFloatsOver={ceramic_stone_tile:false};
  assert.deepEqual(generateQuoteVNext(f).options.map(o=>o.tierName),['Good']);
  // With that as the only tier, nothing is priced.
  f.ownerPricing.tiers=[f.ownerPricing.tiers[1]];
  assert.match(generateQuoteVNext(f).reviewReason,/has to come out first/);
});

test('the instruction basis is required with product rules and is part of the approval',()=>{
  const f=floor('tile',{laminateFloatsOver:{ceramic_stone_tile:true}});
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  const book={ownerId:'owner-synthetic',defaults:{},services:[]};
  const raw=rev=>({id:'5d1f0c6e-2a43-4b8e-9c71-3e6f8a2b9d99',serviceType:'FLOORING_INSTALL',pricing:{...f.ownerPricing.pricing,laminateInstallInstructions:rev}});
  assert.notDeepEqual(approvalContent(raw('[SYNTHETIC] rev. 2025'),book),approvalContent(raw('[SYNTHETIC] rev. 2026'),book));
});

test('S01: painting material notes cover inherited, overridden, zero and cleared tier values, labor and installed prices, and package pricing',async()=>{
  const {paintingMaterialNote,paintingMaterialNotice}=await import('../client/src/pricebookEditing.js');
  const {mergePricingVNext}=await import('../server/quote-engine-vnext/index.js');
  const {measuredScopeCases}=await import('./measuredScopeFixtures.mjs');
  const service={serviceType:'INTERIOR_PAINTING',priceBasisByCategory:{material:'sell_price'}},base={paintWasteFactor:0.1};
  const note=(overrides,key='wallMaterialPerSqftPerCoat')=>paintingMaterialNote(service,mergePricingVNext(base,overrides),'offeringRates',key,'Premium');
  assert.match(note({}),/in the Premium tier: 10% \(Finish paint material waste/);            // inherited
  assert.match(note({paintWasteFactor:0.25}),/in the Premium tier: 25%/);                     // override
  assert.match(note({paintWasteFactor:0}),/in the Premium tier: 0%/);                         // explicit zero
  const cleared={paintWasteFactor:0.25};delete cleared.paintWasteFactor;
  assert.match(note(cleared),/in the Premium tier: 10%/);                                     // override cleared
  for(const key of ['wallLaborPerSqftPerCoat','prepLaborPerSqft_good','installedWallPerSqft'])assert.equal(note({},key),null,key);
  // Package pricing: the package's own 50% applies, and the general allowance changes nothing.
  const f=structuredClone(measuredScopeCases().find(x=>x.id==='paint-cost-packages').input);
  for(const d of Object.values(f.ownerPricing.pricing.scopeDetails))if(d.mode==='package_cost')d.wastePercent=50;
  const total=pricing=>{const g=structuredClone(f);Object.assign(g.ownerPricing.pricing,pricing);return generateQuoteVNext(g).options[0].midEstimate;};
  assert.equal(total({}),total({paintWasteFactor:0,primerWasteFactor:0,prepMaterialWasteFactor:0}));
  const packaged={serviceType:'INTERIOR_PAINTING',priceBasisByCategory:f.ownerPricing.priceBasisByCategory};
  assert.match(paintingMaterialNotice(packaged,f.ownerPricing.pricing),/bought by the package/);
  assert.doesNotMatch(paintingMaterialNotice(packaged,f.ownerPricing.pricing),/finish paint 10%/);
  // Changing the pricing method changes the note, and changing it back restores it.
  assert.match(paintingMaterialNote(packaged,{},'offeringRates','wallMaterialPerSqftPerCoat'),/^Not used for materials bought by the package/);
  assert.match(paintingMaterialNote({...packaged,priceBasisByCategory:{...packaged.priceBasisByCategory,material:'sell_price'}},{},'offeringRates','wallMaterialPerSqftPerCoat'),/^Waste allowance applied to this price: 10%/);
});
