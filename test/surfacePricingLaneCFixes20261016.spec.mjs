import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {customerContractForVNext,validateCustomerInputs} from '../server/quote-engine-vnext/contracts.js';
import {surfaceGeometry,surfaceExtraDefinitions} from '../server/quote-engine-vnext/surfacePricing.js';
import {exactToNumber} from '../server/quote-engine-vnext/exactMath.js';
import {customerFieldVisible} from '../server/scopeConfiguration.js';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {discloseQuoteScope} from '../server/src/quoteScopeDisclosure.js';
import {customerJobSummary} from '../server/src/quoteIntake.js';
import {fixture,siding} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';

// All expected values below are handwritten before the first execution.
// 20x15x9 walls: 2(20+15)9=630. 100 sqft opening =>530x120x2=127200c.
// 6x9 opening: floor-to-ceiling =>576x120x2=138240c; otherwise630x120x2=151200c.
// Paint always removes54, leaving576. Exact5ft width does not meet >5ft.
// Siding gross120x9+2(24x6/2)=1224. Left-in:1224-63/2=1192.5.
// Labor1192.5x400=477000; material1192.5x1.1x700=918225; total1395225c.
// Subtracted:1224-8x15-20-63=1021. Existing1584-sqft case remains in the old suite.
const room={lengthFeet:20,widthFeet:15,heightFeet:9,doorCount:0,windowCount:0};
const house={areaInputMethod:'building_dimensions',buildingPerimeterFeet:120,wallHeightFeet:9,gables:[{widthFeet:24,heightFeet:6},{widthFeet:24,heightFeet:6}],doorCount:1,windowCount:8,garageDoorCount:1,garageDoorWidthFeet:9,garageDoorHeightFeet:7};
function paint(){
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:120,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'room_dimensions',rooms:[structuredClone(room)],wallHeight:'standard',surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
 f.ownerPricing.priceBasisByCategory.material='sell_price';return f;
}
function basic(){
 const f=paint();f.ownerPricing.pricing.laborPerWallSqftPerCoat=100;delete f.customerInputs.rooms;
 Object.assign(f.customerInputs,{areaInputMethod:'wall_sqft',wallAreaSqft:400,wallScopeUniform:true});return f;
}
function quote(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;}
const amounts=(q,path)=>q.options[0].lineItems.filter(l=>l.calculation.ratePath===path).map(l=>l.amountCents);
function definition(f){return {customerFields:Object.entries(customerContractForVNext(f.serviceType,f.ownerPricing.pricing).fields).map(([name,d])=>({name,...d}))};}

for(const [opening,labor,paintArea,cents] of [
 [{widthFeet:12.5,heightFeet:8,runsFloorToCeiling:false},530,530,127200],
 [{widthFeet:6,heightFeet:9,runsFloorToCeiling:true},576,576,138240],
 [{widthFeet:6,heightFeet:9,runsFloorToCeiling:false},630,576,151200],
 [{widthFeet:6,heightFeet:9},630,576,151200],
 [{widthFeet:5,heightFeet:9,runsFloorToCeiling:true},630,585,151200]
])test('lane C fixes: room opening '+JSON.stringify(opening),()=>{
 const f=paint();f.customerInputs.rooms[0].largeOpenings=[opening];
 const g=surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing);
 assert.deepEqual([g.labor,g.paint].map(exactToNumber),[labor,paintArea]);
 assert.deepEqual(amounts(quote(f),'laborPerWallSqftPerCoat'),[cents]);
});
test('lane C fixes: interior direct-area openings use the same dimensions and floor-to-ceiling rule',()=>{
 //400-54=346;346x100x2=69200c. Paint also346.
 const f=basic();f.customerInputs.largeOpenings=[{widthFeet:6,heightFeet:9,runsFloorToCeiling:true}];
 const g=surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing);
 assert.deepEqual([g.labor,g.paint].map(exactToNumber),[346,346]);assert.deepEqual(amounts(quote(f),'laborPerWallSqftPerCoat'),[69200]);
});
for(const openings of [
 {largeOpenings:[{areaSqft:100}],garageDoorCount:0},
 {garageDoorCount:1,garageDoorWidthFeet:12.5,garageDoorHeightFeet:8},
 {garageDoorCount:1,garageOpenings:[{widthFeet:12.5,heightFeet:8}]}
])test('lane C fixes: exterior100-sqft threshold '+JSON.stringify(openings),()=>{
 //Gross1224 minus100=1124 labor; no ordinary openings =>1124 paint.
 const f=offeringFixture('EXTERIOR_PAINTING','itemized');
 f.customerInputs={...f.customerInputs,...house,doorCount:0,windowCount:0,...openings};delete f.customerInputs.exteriorAreaSqft;
 if(openings.garageOpenings||!openings.garageDoorCount){delete f.customerInputs.garageDoorWidthFeet;delete f.customerInputs.garageDoorHeightFeet;}
 const g=surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing);
 assert.deepEqual([g.labor,g.paint].map(exactToNumber),[1124,1124]);quote(f);
});
for(const [convention,area,cents] of [['openings_left_in',1192.5,1395225],['openings_subtracted',1021,1194570]])test('lane C fixes:9x7 garage '+convention,()=>{
 const f=siding();f.customerInputs={...f.customerInputs,...house};delete f.customerInputs.sidingAreaSqft;
 Object.assign(f.ownerPricing.pricing,{laborPerSqft:{vinyl:400},materialPerSqft:{vinyl:700},sidingSettings:{areaConventionByType:{vinyl:convention}}});
 assert.equal(exactToNumber(surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing).labor),area);
 assert.equal(quote(f).options[0].midEstimate,cents/100);
});
test('lane C fixes: siding halves every other opening and every individual garage opening',()=>{
 //1224-(63+40+20)/2=1162.5, including all three openings below100.
 const f=siding();f.customerInputs={...f.customerInputs,...house,garageDoorCount:2,garageOpenings:[{widthFeet:9,heightFeet:7},{widthFeet:8,heightFeet:5}],largeOpenings:[{areaSqft:20}]};
 for(const key of ['sidingAreaSqft','garageDoorWidthFeet','garageDoorHeightFeet'])delete f.customerInputs[key];
 f.ownerPricing.pricing.sidingSettings={areaConventionByType:{vinyl:'openings_left_in'}};
 assert.equal(exactToNumber(surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing).labor),1162.5);quote(f);
});
for(const f of [basic(),offeringFixture('INTERIOR_PAINTING','itemized'),offeringFixture('EXTERIOR_PAINTING','itemized'),siding()])test('lane C fixes: one optional selector and no unpriced quantities '+f.serviceType+' '+(f.ownerPricing.pricing.offeringMode||'basic'),()=>{
 const d=definition(f),extras=Object.values(surfaceExtraDefinitions(f.serviceType,f.ownerPricing.pricing));
 assert.equal(d.customerFields.filter(x=>x.type==='multi_enum').length,1);
 assert.equal(d.customerFields.filter(x=>x.optionalItemKey&&customerFieldVisible(x,f.customerInputs)).length,0);
 const voice=voiceQuestionContract(f.ownerPricing,d,f.customerInputs);
 assert.equal(voice.fields.filter(x=>x.type==='multi_enum').length,1);
 for(const extra of extras)assert.ok(!voice.fields.some(x=>x.field===extra.field));
 assert.doesNotMatch(JSON.stringify(d),/owner must confirm/);
});
test('lane C fixes: unpriced selection excludes door sides without asking a quantity',()=>{
 //Base remains106400c; optional item is excluded, not charged or sent to review.
 const f=basic();f.customerInputs.surfaceOptionalItems=['doorSides'];
 const q=sanitizeForCustomerVNext(quote(f));assert.equal(q.midEstimate,1064);assert.deepEqual(q.options[0].skippedAddons,['Door sides']);
 const d=definition(f),view=discloseQuoteScope(q,f.ownerPricing,d,{customerInputs:f.customerInputs},1);
 assert.equal(view.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(view.pricedEstimate.midEstimate,1064);assert.equal(view.fullJobTotal,null);assert.equal(view.additionalWork[0].description,'Door sides');
 assert.ok(!voiceQuestionContract(f.ownerPricing,d,f.customerInputs).fields.some(x=>x.field==='paintDoorSides'));
 assert.equal(customerJobSummary(f.ownerPricing,d,{customerInputs:f.customerInputs},1).facts.find(x=>x.label==='Which optional painting items would you like?').value,'Door sides');
});
test('lane C fixes: only selected priced quantities are asked, required and charged',()=>{
 //4door sidesx11500=46000c; base106400+46000=152400. Unpriced windows excluded.
 const f=basic();f.ownerPricing.pricing.surfaceExtraRates={doorSides:11500,doorFrames:5000};
 f.customerInputs.surfaceOptionalItems=['doorSides','windows'];
 const d=definition(f),voice=voiceQuestionContract(f.ownerPricing,d,f.customerInputs);
 assert.deepEqual(d.customerFields.filter(x=>x.optionalItemKey&&customerFieldVisible(x,f.customerInputs)).map(x=>x.name),['paintDoorSides']);
 assert.deepEqual(voice.fields.filter(x=>['paintDoorSides','paintDoorFrames','paintWindows','paintCabinetFaces'].includes(x.field)).map(x=>[x.field,x.unit]),[['paintDoorSides','each']]);
 assert.ok(validateCustomerInputs(f.serviceType,f.customerInputs,f.ownerPricing.pricing).missingCustomerFields.includes('paintDoorSides'));
 f.customerInputs.paintDoorSides=4;
 const q=quote(f);assert.deepEqual(amounts(q,'surfaceExtraRates.doorSides'),[46000]);assert.equal(q.midEstimate,1524);assert.deepEqual(q.options[0].skippedAddons,['Windows']);
 //Explicit deselection overrides stale legacy quantities and restores106400c.
 f.customerInputs.surfaceOptionalItems=[];assert.equal(quote(f).midEstimate,1064);
 //A supplied zero count also adds0c and never creates a zero-quantity charge.
 f.customerInputs.surfaceOptionalItems=['doorSides'];f.customerInputs.paintDoorSides=0;assert.equal(quote(f).midEstimate,1064);
});
for(const [unit,label] of [['square_feet','square feet'],['linear_feet','linear feet']])test('lane C fixes: selected soffit uses saved '+unit,()=>{
 //200unitsx500c=100000c, independent of whether the saved unit is area or length.
 const f=siding();Object.assign(f.ownerPricing.pricing,{surfaceExtraRates:{soffit:500},sidingSettings:{soffitUnit:unit}});
 Object.assign(f.customerInputs,{surfaceOptionalItems:['soffit'],soffitQuantity:200});
 assert.equal(voiceQuestionContract(f.ownerPricing,definition(f),f.customerInputs).fields.find(x=>x.field==='soffitQuantity').unit,label);
 assert.deepEqual(amounts(quote(f),'surfaceExtraRates.soffit'),[100000]);
});
test('lane C fixes: unpriced siding soffit needs no unit or quantity',()=>{
 //Existing siding remains1170000c; selected soffit is excluded without a unit guess.
 const f=siding();f.customerInputs.surfaceOptionalItems=['soffit'];
 const q=quote(f);assert.equal(q.midEstimate,11700);assert.deepEqual(q.options[0].skippedAddons,['Soffit']);
 assert.ok(!voiceQuestionContract(f.ownerPricing,definition(f),f.customerInputs).fields.some(x=>x.field==='soffitQuantity'));
});
test('lane C fixes: invalid optional selections and floor-to-ceiling flags do not quote',()=>{
 for(const value of ['doorSides',['doorSides','doorSides'],['unknown'],[42]]){
  const f=basic();f.customerInputs.surfaceOptionalItems=value;assert.equal(validateCustomerInputs(f.serviceType,f.customerInputs,f.ownerPricing.pricing).ok,false);
 }
 const f=paint();f.customerInputs.rooms[0].largeOpenings=[{widthFeet:6,heightFeet:9,runsFloorToCeiling:'true'}];
 assert.equal(validateCustomerInputs(f.serviceType,f.customerInputs,f.ownerPricing.pricing).ok,false);
});
