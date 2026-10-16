import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {carpet} from './quoteFlooring20261016Fixture.mjs';

const line=(q,name)=>q.lineItems.find(item=>item.name===name);
function ready(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;}
// All expected values below were written before running this file.
for(const [sqft,rooms,labor,material,total] of [
  [149,1,53640,83440,137080],
  [150,1,54000,84000,138000],
  [150.01,1,54000,84006,138006],
  [151,1,54000,84560,138560],
  [300,1,99000,168000,267000],
  [300.01,1,99000,168006,267006],
  [450.03,3,162000,252017,414017]
])test(`flooring room-size floor: ${sqft} sq ft / ${rooms} rooms = ${total} cents`,()=>{
  // $3 labor, $5 material, 12% waste. Passed limits retain the previous
  // band's boundary labor: 150*300*1.20=54,000; 300*300*1.10=99,000
  // per room. At 450.03/3 the floor is 3*54,000=162,000 cents.
  const f=flooring('tile',sqft);f.customerInputs.roomCount=rooms;
  const q=ready(f);
  assert.equal(line(q,'Flooring labor').amountCents,labor);
  assert.equal(line(q,'Flooring materials').amountCents,material);
  assert.equal(q.lineItems.reduce((sum,l)=>sum+l.amountCents,0),total);
});

test('flooring diagonal LVP: 8% + owner 4% = 336 sq ft and 168,000 material cents',()=>{
  // 300*1.12=336; 336*500=168,000. Room labor is 300*300*1.10,
  // then the unchanged diagonal factor 1.20: 118,800 cents.
  const f=flooring('vinyl_plank',300);f.customerInputs.layoutPattern='diagonal';
  f.ownerPricing.pricing.diagonalWasteAdderByType={vinyl_plank:0.04};
  const q=ready(f);assert.equal(line(q,'Flooring materials').calculation.quantity,336);
  assert.equal(line(q,'Flooring materials').amountCents,168000);
  assert.equal(line(q,'Flooring labor').amountCents,118800);
});

test('flooring herringbone LVP: owner 1.75 produces 367,500 labor cents',()=>{
  // 700/2=350 sq ft per room => 1.00 room factor; 700*300*1.75=367,500.
  const f=flooring('vinyl_plank',700);Object.assign(f.customerInputs,{layoutPattern:'herringbone_or_chevron',roomCount:2});
  f.ownerPricing.pricing.herringboneLaborMultiplierByType={vinyl_plank:1.75};
  assert.equal(line(ready(f),'Flooring labor').amountCents,367500);
});

test('flooring blank herringbone values inherit the owner diagonal values',()=>{
  // 700*300*1.40=294,000 labor; 700*(1+.08+.04)*500=392,000 material.
  const f=flooring('vinyl_plank',700);Object.assign(f.customerInputs,{layoutPattern:'herringbone_or_chevron',roomCount:2});
  Object.assign(f.ownerPricing.pricing,{diagonalWasteAdderByType:{vinyl_plank:0.04},diagonalLaborMultiplierByType:{vinyl_plank:1.4}});
  const q=ready(f);assert.equal(line(q,'Flooring labor').amountCents,294000);assert.equal(line(q,'Flooring materials').amountCents,392000);
});

for(const [rate,price,inputs,name,cents] of [
  ['baseboardReinstallPerLF',250,{baseboardReinstallLF:120},'Baseboard or quarter-round removal and reinstall',30000],
  ['transitionPriceEach',3500,{transitionCount:3},'Transitions',10500],
  ['furnitureMovingPrice',7500,{furnitureMovingRoomCount:2},'Furniture moving',15000],
  ['furnitureMovingPrice',20000,{furnitureMovingNeeded:true},'Furniture moving',20000],
  ['toiletPullResetEach',12500,{toiletPullResetCount:1},'Toilet pull and reset',12500],
  ['floorLevelingPerSqft',400,{floorLevelingNeeded:true,floorLevelingSqft:80},'Floor leveling',32000]
])test(`flooring priced add-on: ${name} = ${cents} cents (${price})`,()=>{
  // Expected quantities and integer-cent rates are literal in this table:
  // 120*250; 3*3500; 2*7500 or one flat 20000; 1*12500; 80*400.
  const f=flooring('tile',200);f.ownerPricing.pricing[rate]=price;Object.assign(f.customerInputs,inputs);
  if(rate==='furnitureMovingPrice')f.ownerPricing.pricing.furnitureMovingPriceUnit=inputs.furnitureMovingNeeded?'flat':'per_room';
  assert.equal(line(ready(f),name).amountCents,cents);
});

test('flooring unknown leveling area preserves the 178,000-cent main quote and discloses additional work',()=>{
  // Base: 200*300*1.10 + 200*1.12*500 = 178,000. No leveling quantity
  // is invented; the priced floor remains ready with a site-confirmation note.
  const f=flooring('tile',200);f.ownerPricing.pricing.floorLevelingPerSqft=400;
  Object.assign(f.customerInputs,{floorLevelingNeeded:true,floorLevelingSqft:'unknown'});
  const q=ready(f);assert.equal(q.lineItems.reduce((s,l)=>s+l.amountCents,0),178000);
  assert.equal(line(q,'Floor leveling'),undefined);assert.match(q.disclaimer,/leveling.*confirm.*on site/i);
});

for(const [roll,repeat,quantity,cents] of [[12,0,324,97200],[15,0,202.5,60750],[12,1.5,360,108000]])test(`carpet 13 x 14, ${roll}-ft roll, ${repeat}-ft repeat: ${quantity} bought sq ft`,()=>{
  // Min of the two whole-width cut directions, including 0.5-ft wall trim:
  // 12-ft: 2*12*13.5=324; 15-ft: 1*15*13.5=202.5;
  // 12-ft with repeat 1.5: 2*12*15=360. Material is quantity*300 cents.
  const f=carpet([{lengthFt:13,widthFt:14}],roll,repeat);delete f.customerInputs.sqft;
  const q=ready(f);assert.equal(line(q,'Flooring materials').calculation.quantity,quantity);
  assert.equal(line(q,'Flooring materials').amountCents,cents);
  assert.equal(line(q,'Flooring labor').calculation.quantity,182);
  assert.match(q.disclaimer,/carpet quantity.*confirm.*on site.*seaming diagram/i);
});

for(const [groups,quantity] of [[[[1,2]],426],['unknown',426],[[[1],[2]],348]])test(`carpet connected areas ${JSON.stringify(groups)} buy ${quantity} sq ft`,()=>{
  // One shared direction: 2*12*10.5 + 1*12*14.5 =426 sq ft.
  // Separate directions: 2*(1*12*14.5)=348 sq ft; labor remains 280 sq ft.
  const f=carpet([{lengthFt:10,widthFt:14},{lengthFt:14,widthFt:10}],12,0,groups);
  const q=ready(f);assert.equal(line(q,'Flooring materials').calculation.quantity,quantity);
  assert.equal(line(q,'Flooring labor').calculation.quantity,280);
});

test('flooring 60 legacy quotes retain the exact integration cents when no new inputs are used',()=>{
  // Expected before production edits: the literal cents and line quantities
  // are frozen in this synthetic fixture from b682c443. All five flooring
  // types, both old layouts, three areas and two room counts are represented.
  const baseline=JSON.parse(readFileSync(new URL('./quoteFlooringLegacy20261016.json',import.meta.url),'utf8'));
  assert.equal(baseline.rows.length,60);
  for(const row of baseline.rows){
    const f=flooring(row.type,row.sqft);Object.assign(f.customerInputs,{roomCount:row.roomCount,layoutPattern:row.layoutPattern});
    if(['laminate','hardwood','carpet'].includes(row.type)){
      const key='floor_underlayment_'+row.type;
      Object.assign(f.ownerPricing.pricing,{scopeDetails:{[key]:{description:'[SYNTHETIC] Defined underlayment',mode:'installed_area_sell_price'}},scopeRates:{[key]:1},installedLaborPercent:{['scopeRates.'+key]:0},installedMaterialsPercent:{['scopeRates.'+key]:100}});
      f.customerInputs.underlaymentScopeConfirmed=true;
    }
    const q=ready(f);assert.equal(q.lineItems.reduce((s,l)=>s+l.amountCents,0),row.cents,JSON.stringify(row));
    assert.deepEqual(q.lineItems.map(l=>({name:l.name,cents:l.amountCents,quantity:l.calculation.quantity})),row.lines);
  }
});
