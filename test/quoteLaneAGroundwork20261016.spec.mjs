import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {fixture, flooring} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext, sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {calculateServiceVNext} from '../server/quote-engine-vnext/templates.js';
import {
  synchronizeStartingValuesVNext,
  synchronizeDependentLinesVNext,
  activeDependentLinesVNext
} from '../server/quote-engine-vnext/priceGroundwork.js';
import {loadPricebook, savePricebook} from '../server/priceBookService.js';
import {staleOwnerPrices,aiPlaceholderPrices} from '../server/priceMetadata.js';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {webQuote,publicCopy} from './quoteDeliveryBatch20261015Fixture.mjs';

const line=(quote,name)=>quote.lineItems.find(item=>item.name===name);
const quote=f=>generateQuoteVNext(f);
const sum=lines=>lines.reduce((total,item)=>total+item.amountCents,0);
const clock=value=>()=>new Date(value);

test('lane A starting value provenance blocks only a request that uses the unconfirmed test factor',()=>{
  // Written before execution: the test starting value is 1.10. A 200-sq-ft
  // tile request uses the medium-room factor and must review until that exact
  // definition value is confirmed. Once confirmed, labor is
  // 200 * 300 * 1.10 = 66,000 cents and material is
  // 200 * 1.12 * 500 = 112,000 cents, for 178,000 cents total.
  const f=flooring('tile',200);
  delete f.ownerPricing.pricing.roomComplexityMultiplier.medium;
  const definitions={
    roomComplexityMultiplier:{
      defaultValue:{large:1,medium:1.10,small:1.20},min:0.1,max:5,
      label:'Medium-room installation factor',unit:'multiplier',
      startingValue:{medium:1.10},
      startingValueSource:'[SYNTHETIC] Published productivity sample: medium rooms use 1.10 times the large-room labor.',
      startingValueAssumption:'[SYNTHETIC] Assumes the crew matches the published productivity sample.'
    }
  };
  f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,definitions,{now:'2026-10-16T12:00:00.000Z'});
  let result=quote(f);
  assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.match(result.reviewReason,/Confirm the starting value for medium-room installation factor in your price book\./i);
  assert.deepEqual(result.missingOwnerFields,['startingValueState.roomComplexityMultiplier.medium']);

  f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,definitions,{ownerId:f.ownerPricing.origin.ownerId,now:'2026-10-16T12:01:00.000Z',confirmPaths:['roomComplexityMultiplier.medium']});
  result=quote(f);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(result.lineItems.reduce((total,item)=>total+item.amountCents,0),178000);

  const changed={roomComplexityMultiplier:{...definitions.roomComplexityMultiplier,defaultValue:{large:1,medium:1.15,small:1.20},startingValue:{medium:1.15}}};
  f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,changed,{now:'2026-10-17T12:00:00.000Z'});
  assert.equal(f.ownerPricing.pricing.roomComplexityMultiplier.medium,1.15);
  assert.equal(quote(f).resultType,'ESTIMATE_REQUIRES_REVIEW');

  f.ownerPricing.pricing.roomComplexityMultiplier.medium=1.33;
  f.ownerPricing=synchronizeStartingValuesVNext(f.ownerPricing,{roomComplexityMultiplier:{...changed.roomComplexityMultiplier,startingValue:{medium:1.25}}},{now:'2026-10-18T12:00:00.000Z'});
  assert.equal(f.ownerPricing.pricing.roomComplexityMultiplier.medium,1.33,'an owner-entered factor is never overwritten');
  assert.equal(Object.hasOwn(f.ownerPricing.startingValueState||{},'roomComplexityMultiplier.medium'),false);
});

test('lane A dependent-line receipt keeps a test-only extracted line off until the base is re-entered and confirmed',()=>{
  // Written before execution: today's 200-sq-ft tile template is 178,000
  // cents. The synthetic extracted line is 12,345 cents. Before the base-price
  // wording receipt, the line is absent and the template remains exactly
  // 178,000 cents; afterward it is present and the test sum is 190,345 cents.
  const f=flooring('tile',200);
  const definition={
    id:'synthetic_extracted_line',
    label:'[SYNTHETIC] Extracted material',
    basePricePath:'materialPerSqft.tile',
    basePriceNewWording:'[SYNTHETIC] Tile material price excluding the extracted material.'
  };
  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[definition],{now:'2026-10-16T12:00:00.000Z'});
  const template=calculateServiceVNext(f.serviceType,f.customerInputs,f.ownerPricing.pricing,{ownerPricing:f.ownerPricing,tierName:null,skipAddon(){}});
  const synthetic={dependentLineId:definition.id,name:definition.label,amountCents:12345};
  let lines=activeDependentLinesVNext([...template.lineItems,synthetic],f.ownerPricing,[definition]);
  assert.equal(sum(lines),178000);
  assert.equal(lines.some(item=>item.dependentLineId===definition.id),false);

  f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[definition],{
    ownerId:f.ownerPricing.origin.ownerId,now:'2026-10-16T12:05:00.000Z',
    reenteredIds:[definition.id],confirmIds:[definition.id]
  });
  lines=activeDependentLinesVNext([...template.lineItems,synthetic],f.ownerPricing,[definition]);
  assert.equal(sum(lines),190345);
  assert.equal(lines.at(-1).name,'[SYNTHETIC] Extracted material');
});

test('lane A per-price dates use the injected server clock and unchanged saves retain the old date',()=>{
  // Written before execution: a first saved rate gets July 8. An unchanged
  // October 16 save keeps July 8. Changing only the material rate on October
  // 17 moves only that material leaf to October 17.
  const owner='lane-a-dates-'+crypto.randomUUID(),f=flooring('tile',200);
  let saved=savePricebook(owner,{services:[f.ownerPricing],defaults:f.businessDefaults},{clock:clock('2026-07-08T10:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['laborPerSqft.tile'].changedAt,'2026-07-08T10:00:00.000Z');
  assert.equal(saved.services[0].priceMetadata['materialPerSqft.tile'].changedAt,'2026-07-08T10:00:00.000Z');
  saved=savePricebook(owner,saved,{clock:clock('2026-10-16T10:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['laborPerSqft.tile'].changedAt,'2026-07-08T10:00:00.000Z');
  assert.equal(saved.services[0].priceMetadata['materialPerSqft.tile'].changedAt,'2026-07-08T10:00:00.000Z');
  saved.services[0].pricing.materialPerSqft.tile=525;
  saved=savePricebook(owner,saved,{clock:clock('2026-10-17T10:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['laborPerSqft.tile'].changedAt,'2026-07-08T10:00:00.000Z');
  assert.equal(saved.services[0].priceMetadata['materialPerSqft.tile'].changedAt,'2026-10-17T10:00:00.000Z');
  assert.deepEqual(loadPricebook(owner),saved);
});

test('lane A 90-day stale listing includes a 100-day-old material and a legacy undated price',()=>{
  // Written before execution: July 8 through October 16 is 100 calendar days,
  // so the material price is older than 90 days. Legacy cost-basis labor and
  // stair add-on prices with no changedAt are also stale and display
  // "Date not recorded".
  const f=flooring('tile',200),service=f.ownerPricing;
  service.priceMetadata={
    'materialPerSqft.tile':{changedAt:'2026-07-08T12:00:00.000Z',sourceNote:'[SYNTHETIC] Supplier Q-17'},
    'laborPerSqft.tile':{sourceNote:'[SYNTHETIC] Legacy import'}
  };
  const rows=staleOwnerPrices(service,90,new Date('2026-10-16T12:00:00.000Z'));
  assert.deepEqual(rows.map(row=>[row.path,row.dateLabel]),[
    ['laborPerSqft.tile','Date not recorded'],
    ['materialPerSqft.tile','July 8, 2026'],
    ['perStepPrice','Date not recorded']
  ]);

  // A cost-basis labor price is also in scope even when its field name is a
  // generic base rate rather than a labor-prefixed name.
  const cleanup={serviceType:'LANDSCAPING_CLEANUP',pricing:{cleanupBaseRatePerSqft:25},priceBasisByCategory:{labor:'cost'},priceMetadata:{cleanupBaseRatePerSqft:{changedAt:'2026-07-08T12:00:00.000Z'}}};
  assert.deepEqual(staleOwnerPrices(cleanup,90,new Date('2026-10-16T12:00:00.000Z')).map(row=>row.path),['cleanupBaseRatePerSqft']);
});

test('lane A AI placeholder survives confirmation and clears only on edit or explicit owner adoption',()=>{
  // Written before execution: confirmation changes approval, not provenance.
  // An unchanged AI price remains marked. A numeric edit clears it. The
  // explicit "This is my price" action clears it without manufacturing a new
  // amount.
  const owner='lane-a-ai-'+crypto.randomUUID(),f=flooring('tile',200);
  f.ownerPricing.source='AI_SUGGESTED';f.ownerPricing.origin.source='AI_SUGGESTED';
  let saved=savePricebook(owner,{services:[f.ownerPricing],defaults:f.businessDefaults},{clock:clock('2026-10-16T10:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['materialPerSqft.tile'].aiPlaceholder,true);
  saved.services[0].confirmedFields={materialPerSqft:true};
  saved=savePricebook(owner,saved,{clock:clock('2026-10-16T11:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['materialPerSqft.tile'].aiPlaceholder,true);
  saved.services[0].pricing.materialPerSqft.tile=501;
  saved=savePricebook(owner,saved,{clock:clock('2026-10-16T12:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['materialPerSqft.tile'].aiPlaceholder,false);
  assert.equal(saved.services[0].priceMetadata['laborPerSqft.tile'].aiPlaceholder,true);
  saved.services[0].priceMetadata['laborPerSqft.tile'].acceptedAsOwnerPrice=true;
  saved=savePricebook(owner,saved,{clock:clock('2026-10-16T13:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['laborPerSqft.tile'].aiPlaceholder,false);
  assert.equal(Object.hasOwn(saved.services[0].priceMetadata['laborPerSqft.tile'],'acceptedAsOwnerPrice'),false);
});

test('lane A shared purchase rounding prices materials only and blank package fields preserve today',()=>{
  // Written before execution:
  // sod 520 * 1.05 = 546; ceil(546/450)*450 = 900; 900*$0.40 = 36,000c.
  let f=fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:40,sodInstallLaborPerSqft:100,minimumServiceCharge:0,sodPalletSizeSqft:450},{sodSqft:520,sqftMethod:'exact',groundPrepNeeded:false,slope:'flat',accessDifficulty:'easy'});
  let result=quote(f);assert.equal(line(result,'Sod material').amountCents,36000);assert.equal(line(result,'Sod installation labor').calculation.quantity,520);

  // LVP 300 * 1.08 = 324; ceil(324/20)*20 = 340 sq ft.
  f=flooring('vinyl_plank',300);f.ownerPricing.pricing.cartonCoverageSqft={vinyl_plank:20};
  result=quote(f);assert.equal(line(result,'Flooring materials').calculation.quantity,340);assert.equal(line(result,'Flooring labor').calculation.quantity,300);

  // 10*10*4/324 = 1.234567... yd; with 10% = 1.358024...;
  // ceil(required/.25)*.25 = 1.5 yd; 1.5*$180 = 27,000c.
  f=fixture('CONCRETE_PATIO_SLAB',{laborPerSqft:1,concreteCostPerCubicYard:18000,formworkPerLF:1,minimumJob:0,readyMixOrderIncrementCubicYards:0.25},{dimensionMethod:'exact',length:10,width:10,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:false});
  result=quote(f);assert.equal(line(result,'Ready-mix concrete').calculation.quantity,1.5);assert.equal(line(result,'Ready-mix concrete').amountCents,27000);

  // 10.5 squares * 1.10 = 11.55; *3 = 34.65 bundles; ceil=35;
  // 35/3 = 11.666... squares; *$150 = 175,000c.
  f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:1},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:1},underlaymentPerSquare:{asphalt_shingle:1},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},accessoryPricingMode:'per_square_allin',minimumJob:0,bundlesPerSquare:{asphalt_shingle:3}},{roofSizeMethod:'roof_measured',roofSizeInput:1050,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
  result=quote(f);assert.equal(line(result,'Field materials').amountCents,175000);assert.ok(Math.abs(line(result,'Field materials').calculation.quantity-35/3)<1e-12);

  // 400*3/324 = 3.703703... installed yd; *1.15 = 4.259259...;
  // ceil(required/.5)*.5 = 4.5 yd; 4.5*$40 = 18,000c.
  f=fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:4000},mulchInstallLaborPerYard:3000,minimumServiceCharge:0,mulchOrderIncrementCubicYards:{brown:0.5}},{inputMethod:'sqft',mulchArea:400,mulchDepth:3,mulchType:'brown',bedCondition:'clean',edgingNeeded:false});
  result=quote(f);assert.equal(line(result,'Mulch material').calculation.quantity,4.5);assert.equal(line(result,'Mulch material').amountCents,18000);assert.ok(Math.abs(line(result,'Mulch installation labor').calculation.quantity-100/27)<1e-12);

  // Customer-stated 2.3 yd rounds material to 2.5 yd; labor stays 2.3 yd.
  f.customerInputs={...f.customerInputs,inputMethod:'yards',mulchArea:2.3};
  delete f.customerInputs.mulchDepth;
  result=quote(f);assert.equal(line(result,'Mulch material').calculation.quantity,2.5);assert.equal(line(result,'Mulch installation labor').calculation.quantity,2.3);
});

test('lane A blank package sizes preserve all five pre-groundwork material amounts to the cent',()=>{
  // Written before execution: removing only the optional package fields must
  // restore today's exact-quantity calculation byte-for-byte at each affected
  // material line; no labor quantity may change.
  const cases=[];
  let f=fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:40,sodInstallLaborPerSqft:100,minimumServiceCharge:0},{sodSqft:520,sqftMethod:'exact',groundPrepNeeded:false,slope:'flat',accessDifficulty:'easy'});cases.push([f,'Sod material',21840,546]);
  f=flooring('vinyl_plank',300);cases.push([f,'Flooring materials',162000,324]);
  f=fixture('CONCRETE_PATIO_SLAB',{laborPerSqft:1,concreteCostPerCubicYard:18000,formworkPerLF:1,minimumJob:0},{dimensionMethod:'exact',length:10,width:10,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:false});cases.push([f,'Ready-mix concrete',24444,110/81]);
  f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:1},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:1},underlaymentPerSquare:{asphalt_shingle:1},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},accessoryPricingMode:'per_square_allin',minimumJob:0},{roofSizeMethod:'roof_measured',roofSizeInput:1050,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});cases.push([f,'Field materials',173250,11.55]);
  f=fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:4000},mulchInstallLaborPerYard:3000,minimumServiceCharge:0},{inputMethod:'sqft',mulchArea:400,mulchDepth:3,mulchType:'brown',bedCondition:'clean',edgingNeeded:false});cases.push([f,'Mulch material',17037,115/27]);
  for(const [input,name,expectedCents,expectedQuantity] of cases){const result=quote(input),material=line(result,name);assert.equal(material.amountCents,expectedCents,name);assert.ok(Math.abs(material.calculation.quantity-expectedQuantity)<1e-12,name);}
});

test('lane A 30-day validity is frozen into widget-safe and voice copy; blank emits nothing',()=>{
  // Written before execution: October 16, 2026 plus 30 calendar days in the
  // business time zone is November 15, 2026. Exact wording:
  // "This quote is valid for 30 days, until November 15, 2026."
  const statement='This quote is valid for 30 days, until November 15, 2026.';
  const f=flooring('tile',200);
  f.businessDefaults.quoteTimeZone='America/Halifax';
  f.businessDefaults.quoteValidityDays=30;
  f.quoteDate={timeZone:'America/Halifax',quoteInstant:'2026-10-16T15:00:00.000Z'};
  f.currentMonth=10;
  let internal=quote(f),customer=sanitizeForCustomerVNext(internal);
  assert.equal(customer.resultType,'INSTANT_ESTIMATE_READY');
  assert.match(customer.disclaimer,new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.match(projectVoiceQuote(customer,'synthetic-handle').quoteNarration,new RegExp(statement.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));

  delete f.businessDefaults.quoteValidityDays;
  internal=quote(f);customer=sanitizeForCustomerVNext(internal);
  assert.doesNotMatch(customer.disclaimer,/quote is valid for/i);
  assert.doesNotMatch(projectVoiceQuote(customer,'synthetic-handle-blank').quoteNarration,/quote is valid for/i);
});

test('lane A base and tier price dates and sources follow stable service and tier identities',()=>{
  // Written before execution: both first-entered prices get July 8. An
  // unchanged October 16 save retains July 8. Changing only Premium material
  // on October 17 changes only that override. Renaming the tier on October 18
  // retains its price date. Inserting another service on October 19 must not
  // transfer the existing service's metadata by index.
  const owner='lane-a-tier-dates-'+crypto.randomUUID(),f=flooring('tile',200),service=structuredClone(f.ownerPricing);
  service.id=crypto.randomUUID();service.origin={...service.origin,ownerId:owner,serviceId:service.id};
  service.priceMetadata={'materialPerSqft.tile':{sourceNote:'[SYNTHETIC] Supplier Q-17'}};
  service.tiers=[{name:'Premium',overrides:{materialPerSqft:{tile:550}},priceMetadata:{'materialPerSqft.tile':{sourceNote:'[SYNTHETIC] Supplier Q-18'}}}];
  let saved=savePricebook(owner,{services:[service],defaults:f.businessDefaults},{clock:clock('2026-07-08T10:00:00.000Z')}).pricebook;
  assert.deepEqual(saved.services[0].priceMetadata['materialPerSqft.tile'],{changedAt:'2026-07-08T10:00:00.000Z',sourceNote:'[SYNTHETIC] Supplier Q-17'});
  assert.deepEqual(saved.services[0].tiers[0].priceMetadata['materialPerSqft.tile'],{changedAt:'2026-07-08T10:00:00.000Z',sourceNote:'[SYNTHETIC] Supplier Q-18'});
  saved=savePricebook(owner,saved,{clock:clock('2026-10-16T10:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].tiers[0].priceMetadata['materialPerSqft.tile'].changedAt,'2026-07-08T10:00:00.000Z');
  saved.services[0].tiers[0].overrides.materialPerSqft.tile=575;
  saved.services[0].tiers[0].priceMetadata['materialPerSqft.tile'].sourceNote='[SYNTHETIC] Supplier Q-19';
  saved=savePricebook(owner,saved,{clock:clock('2026-10-17T10:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['materialPerSqft.tile'].changedAt,'2026-07-08T10:00:00.000Z');
  assert.deepEqual(saved.services[0].tiers[0].priceMetadata['materialPerSqft.tile'],{changedAt:'2026-10-17T10:00:00.000Z',sourceNote:'[SYNTHETIC] Supplier Q-19'});
  saved.services[0].tiers[0].name='Platinum';
  saved=savePricebook(owner,saved,{clock:clock('2026-10-18T10:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].tiers[0].priceMetadata['materialPerSqft.tile'].changedAt,'2026-10-17T10:00:00.000Z');
  const added=structuredClone(service);added.id=crypto.randomUUID();added.origin={...added.origin,serviceId:added.id};delete added.priceMetadata;for(const tier of added.tiers)delete tier.priceMetadata;
  saved=savePricebook(owner,{...saved,services:[added,saved.services[0]]},{clock:clock('2026-10-19T10:00:00.000Z')}).pricebook;
  assert.equal(saved.services[0].priceMetadata['materialPerSqft.tile'].changedAt,'2026-10-19T10:00:00.000Z');
  assert.equal(saved.services[1].priceMetadata['materialPerSqft.tile'].changedAt,'2026-07-08T10:00:00.000Z');
  assert.equal(saved.services[1].tiers[0].priceMetadata['materialPerSqft.tile'].changedAt,'2026-10-17T10:00:00.000Z');
});

test('lane A starting-value and dependent-line receipts survive durable save and reload',()=>{
  // Written before execution: reload must preserve the pending starting-value
  // review and keep the synthetic 12,345-cent line absent. Confirming both
  // receipts, saving and reloading yields the original 178,000 cents plus the
  // synthetic line, 190,345 cents.
  const owner='lane-a-receipts-'+crypto.randomUUID(),f=flooring('tile',200);
  f.ownerPricing.origin={...f.ownerPricing.origin,ownerId:owner};
  delete f.ownerPricing.pricing.roomComplexityMultiplier.medium;
  const factors={roomComplexityMultiplier:{defaultValue:{large:1,medium:1.10,small:1.20},min:0.1,max:5,label:'Medium-room installation factor',unit:'multiplier',startingValue:{medium:1.10},startingValueSource:'[SYNTHETIC] Published sample.',startingValueAssumption:'[SYNTHETIC] Crew productivity matches the sample.'}};
  const dependent={id:'synthetic_extracted_line',label:'[SYNTHETIC] Extracted material',basePricePath:'materialPerSqft.tile',basePriceNewWording:'[SYNTHETIC] Tile material excluding the extracted material.'};
  let service=synchronizeStartingValuesVNext(f.ownerPricing,factors,{now:'2026-10-16T12:00:00.000Z'});
  service=synchronizeDependentLinesVNext(service,[dependent],{now:'2026-10-16T12:00:00.000Z'});
  savePricebook(owner,{services:[service],defaults:f.businessDefaults},{clock:clock('2026-10-16T12:00:00.000Z')});
  service=loadPricebook(owner).services[0];f.ownerPricing=service;
  assert.equal(quote(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
  let template=calculateServiceVNext(f.serviceType,f.customerInputs,service.pricing,{ownerPricing:service,tierName:null,skipAddon(){}});
  assert.equal(sum(activeDependentLinesVNext([...template.lineItems,{dependentLineId:dependent.id,name:dependent.label,amountCents:12345}],service,[dependent])),178000);
  service=synchronizeStartingValuesVNext(service,factors,{ownerId:owner,now:'2026-10-16T12:05:00.000Z',confirmPaths:['roomComplexityMultiplier.medium']});
  service=synchronizeDependentLinesVNext(service,[dependent],{ownerId:owner,now:'2026-10-16T12:05:00.000Z',reenteredIds:[dependent.id],confirmIds:[dependent.id]});
  savePricebook(owner,{services:[service],defaults:f.businessDefaults},{clock:clock('2026-10-16T12:05:00.000Z')});
  service=loadPricebook(owner).services[0];f.ownerPricing=structuredClone(service);delete f.ownerPricing.priceMetadata;
  assert.equal(sum(quote(f).lineItems),178000);
  template=calculateServiceVNext(f.serviceType,f.customerInputs,service.pricing,{ownerPricing:service,tierName:null,skipAddon(){}});
  assert.equal(sum(activeDependentLinesVNext([...template.lineItems,{dependentLineId:dependent.id,name:dependent.label,amountCents:12345}],service,[dependent])),190345);
});

test('lane A owner status lists stale prices and legacy AI placeholders without blocking readiness policy',()=>{
  // Written before execution: both a 100-day-old material price and an
  // undated cost-basis labor price are status reminders. A legacy AI service
  // with no metadata still lists every AI-origin money leaf as a placeholder.
  const f=flooring('tile',200),service=f.ownerPricing;
  service.priceMetadata={'materialPerSqft.tile':{changedAt:'2026-07-08T12:00:00.000Z'},'laborPerSqft.tile':{}};
  service.source='AI_SUGGESTED';service.origin.source='AI_SUGGESTED';
  const book={ownerId:'lane-a-status-'+crypto.randomUUID(),services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC',stalePriceThresholdDays:90}};
  const status=bridge.applicationStatus(service,book,{timeZone:'UTC',quoteInstant:'2026-10-16T12:00:00.000Z'});
  assert.deepEqual(status.stalePrices.map(row=>row.path),['laborPerSqft.tile','materialPerSqft.tile','perStepPrice']);
  assert.deepEqual(aiPlaceholderPrices({...service,priceMetadata:undefined}).map(row=>row.path),['laborPerSqft.tile','materialPerSqft.tile','minimumJob','perStepPrice']);
  assert.equal(status.applicationIssues.some(issue=>/older|date not recorded/i.test(issue)),false,'staleness is a visible reminder, not a quote-policy gate');
});

test('lane A actual saved widget, email, public copy and voice freeze the 30-day validity statement',()=>{
  // Written before execution: October 16, 2026 plus 30 business-local calendar
  // days is November 15, 2026. Every delivery surface must carry exactly:
  // "This quote is valid for 30 days, until November 15, 2026."
  const statement='This quote is valid for 30 days, until November 15, 2026.',f=flooring('tile',200);
  f.businessDefaults.quoteValidityDays=30;
  const saved=webQuote(f,[],'2026-10-16T15:00:00.000Z');
  // Readiness caching must not let a prior valid quote date authorize a later
  // malformed date context. The valid request is live; the malformed one is
  // independently rejected even though the book revision is unchanged.
  const statusBook=loadPricebook(saved.owner);
  const validityContext={timeZone:'UTC',quoteInstant:'2026-10-16T15:00:00.000Z'};
  assert.equal(bridge.bookQuoteStatuses(statusBook,validityContext)[0].status,'QUOTING LIVE');
  assert.equal(bridge.bookQuoteStatuses(statusBook,{timeZone:'UTC',quoteInstant:'not-a-date'})[0].status,'NEEDS PRICING');
  // The freshness threshold is an owner reminder, not quote content. Changing
  // only that threshold keeps the exact saved pricing approval current.
  const reminderDraft=bridge.readApplicationBook(saved.owner);
  bridge.saveApplicationBook(saved.owner,{...reminderDraft,defaults:{...reminderDraft.defaults,stalePriceThresholdDays:90}},validityContext);
  assert.equal(bridge.bookStatuses(loadPricebook(saved.owner),validityContext)[0].approvalCurrent,true);
  assert.match(saved.result.disclaimer,/This quote is valid for 30 days, until November 15, 2026\./);
  assert.match(projectVoiceQuote(saved.result,'lane-a-validity').quoteNarration,/This quote is valid for 30 days, until November 15, 2026\./);
  saved.email.enqueueSavedQuote({ownerId:saved.owner,quoteId:saved.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  const delivery=saved.rows()[0],published=publicCopy(saved.email,delivery);
  assert.ok(JSON.parse(delivery.messageJson).text.includes(statement));
  assert.ok(published.copy.narration.includes(statement));

  const blank=flooring('tile',200),without=webQuote(blank,[],'2026-10-16T15:00:00.000Z');
  assert.doesNotMatch(without.result.disclaimer,/quote is valid for/i);
  assert.doesNotMatch(projectVoiceQuote(without.result,'lane-a-validity-blank').quoteNarration,/quote is valid for/i);
  without.email.enqueueSavedQuote({ownerId:without.owner,quoteId:without.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  assert.doesNotMatch(JSON.parse(without.rows()[0].messageJson).text,/quote is valid for/i);
  assert.doesNotMatch(publicCopy(without.email,without.rows()[0]).copy.narration,/quote is valid for/i);
});
