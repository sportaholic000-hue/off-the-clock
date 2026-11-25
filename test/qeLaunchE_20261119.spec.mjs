import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
import {OPENING_ALLOWANCE_NOTE} from '../server/quote-engine-vnext/templates.js';
import {scopeStructureDiagnostics} from '../server/quote-engine-vnext/scopePricing.js';
import {surfaceOwnerDiagnostics} from '../server/quote-engine-vnext/surfacePricing.js';
import {scopeVisibleInEditor} from '../server/scopeConfiguration.js';
import {CLASS2_HELP} from '../server/priceBookCopy.js';
import {fixture,siding} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';

// November 19, 2026 launch fixes, lane E: interior painting, exterior painting
// and siding. Every expected value is worked by hand in the comment above it.

const option=q=>q.options[0];
const mid=q=>option(q).calculationRecord.scenarios.mid;
const total=q=>mid(q).finalTotalCents;
const lines=q=>Object.fromEntries(mid(q).lineItems.map(l=>[l.name,l.amountCents]));
const lineList=q=>mid(q).lineItems.map(l=>[l.name,l.amountCents]);
const ready=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q.missingCustomerFields||q.missingOwnerFields||q.validationMessages||q.reviewReason));return q;};
const review=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');return q;};
const purchase=(productKey,coverage)=>({mode:'package_cost',productKey,coverage,wastePercent:10});
const packaged=(f,scopes)=>{const p=f.ownerPricing.pricing;f.ownerPricing.priceBasisByCategory.material='cost';p.scopeDetails={...(p.scopeDetails||{})};p.scopeRates={...(p.scopeRates||{})};
  for(const [key,productKey,coverage,rate] of scopes){p.scopeDetails[key]={description:'[SYNTHETIC] '+key,...purchase(productKey,coverage)};p.scopeRates[key]=rate;}
  f.customerInputs.paintProductsConfirmed=true;return f;};
// Basic (older) interior setup: walls 100c labor and 30c paint per sq ft per coat,
// trim 150c labor and 10c material per LF per coat, paint waste 10% (class 2 default).
const basic=(customer={})=>{const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0,trimLaborPerLF:150,trimMaterialPerLF:10},
  {areaInputMethod:'wall_sqft',wallAreaSqft:800,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false,...customer});
  f.ownerPricing.priceBasisByCategory.material='sell_price';return f;};
const rooms=(f,list,extra={})=>{const c=f.customerInputs;for(const k of ['wallAreaSqft','ceilingAreaSqft','wallScopeUniform','doorCount','windowCount'])delete c[k];Object.assign(c,{areaInputMethod:'room_dimensions',rooms:list,...extra});return f;};
// Room A 12x14x8, 1 door, 2 windows: gross 2x(12+14)x8 = 416; paint 416 - 20 - 30 = 366.
// Room B 10x10x8, 1 door, 1 window: gross 2x(10+10)x8 = 320; paint 320 - 20 - 15 = 285.
const A={lengthFeet:12,widthFeet:14,heightFeet:8,doorCount:1,windowCount:2},B={lengthFeet:10,widthFeet:10,heightFeet:8,doorCount:1,windowCount:1};

// ---------------- E1: trim coats on the basic setup ----------------
test('E1: basic trim is charged at the customer\'s trim coats',()=>{
  // Walls 800 x 2 coats x 100c = 160000; paint 800 x 2 x 1.10 x 30c = 52800.
  // Trim 200 LF x 2 coats x 150c = 60000; trim materials 200 x 2 x 1.10 x 10c = 4400.
  const q=ready(basic({trimIncluded:true,trimLengthLF:200,trimCoats:2}));
  assert.deepEqual(lines(q),{'Wall labor':160000,'Wall paint and materials':52800,'Trim labor':60000,'Trim materials':4400});
  assert.equal(total(q),277200);
});
test('E1: trim coats are asked, never defaulted, and stay within 1 to 3',()=>{
  const q=review(basic({trimIncluded:true,trimLengthLF:200}));
  assert.deepEqual(q.missingCustomerFields,['trimCoats']);
  for(const bad of [0,4,1.5])assert.ok(review(basic({trimIncluded:true,trimLengthLF:200,trimCoats:bad})).invalidCustomerFields.includes('trimCoats'),String(bad));
  // Boundaries: 1 coat = 30000 labor + 200 x 1.10 x 10c = 2200; 3 coats = 90000 + 6600.
  assert.equal(total(ready(basic({trimIncluded:true,trimLengthLF:200,trimCoats:1}))),160000+52800+30000+2200);
  assert.equal(total(ready(basic({trimIncluded:true,trimLengthLF:200,trimCoats:3}))),160000+52800+90000+6600);
  const contract=customerContractForVNext('INTERIOR_PAINTING',basic().ownerPricing.pricing);
  assert.ok(contract.required({...basic().customerInputs,trimIncluded:true}).includes('trimCoats'));
  assert.ok(!contract.required(basic().customerInputs).includes('trimCoats'));
});
test('E1: trim paint bought by the can uses the trim coats',()=>{
  // Walls 800 x 2 = 1600 x 1.10 / 400 = 4.4 -> 5 cans x 5000 = 25000. Trim 200 x 3 = 600 x 1.10 / 100 = 6.6 -> 7 x 2000 = 14000.
  // Labor 160000 + trim 200 x 3 x 150 = 90000. Total 289000.
  const f=packaged(basic({trimIncluded:true,trimLengthLF:200,trimCoats:3,wallColorCount:1}),[['paint_wall','wall',400,5000],['paint_trim','trim',100,2000]]);
  const q=ready(f);
  assert.deepEqual(lines(q),{'Wall labor':160000,'Trim labor':90000,'Purchased materials: wall':25000,'Purchased materials: trim':14000});
  assert.equal(total(q),289000);
});
test('E1: an installed trim price still quotes without trim coats, and basic trim stays live',()=>{
  // The installed offering fixture's control total is 380000 (fixture unchanged).
  const f=offeringFixture('INTERIOR_PAINTING','installed');assert.equal(f.customerInputs.trimCoats,undefined);
  assert.equal(total(ready(f)),380000);
  const b=basic({trimIncluded:true,trimLengthLF:200,trimCoats:2}),s=vNextServiceStatus(b.ownerPricing,b.businessDefaults);
  assert.equal(s.status,'QUOTING LIVE');assert.equal(s.scopeCoverage.find(r=>r.key==='trim_prices').configurationComplete,true);
});

// ---------------- E2: stories on soffit, fascia and exterior trim ----------------
function sidingExtras(stories,labor=60){
  const f=siding(),p=f.ownerPricing.pricing;p.surfaceExtraRates={soffit:900,fascia:700};p.sidingSettings={soffitUnit:'linear_feet'};
  if(labor!==null){p.installedLaborPercent={'surfaceExtraRates.soffit':labor,'surfaceExtraRates.fascia':labor};p.installedMaterialsPercent={'surfaceExtraRates.soffit':100-labor,'surfaceExtraRates.fascia':100-labor};}
  Object.assign(f.customerInputs,{stories,surfaceOptionalItems:['soffit','fascia'],soffitQuantity:150,fasciaLengthLF:150});return f;
}
test('E2: siding soffit and fascia take the stories on their labor share',()=>{
  // 1 story: soffit 150 x 900c = 135000, fascia 150 x 700c = 105000; labor 1000 x 400c = 400000; materials 1000 x 1.10 x 700c = 770000.
  assert.deepEqual(lines(ready(sidingExtras(1))),{'Siding labor':400000,'Siding materials':770000,Soffit:135000,Fascia:105000});
  // 3 stories (1.20) at a 60% labor share: x (1 + 0.60 x 0.20) = 1.12 -> soffit 151200, fascia 117600; labor 400000 x 1.20 = 480000.
  const q3=ready(sidingExtras(3));
  assert.deepEqual(lines(q3),{'Siding labor':480000,'Siding materials':770000,Soffit:151200,Fascia:117600});
  assert.equal(total(q3),1518800);
  // 2 stories (1.10): x 1.06 -> soffit 143100, fascia 111300; labor 440000.
  assert.equal(total(ready(sidingExtras(2))),440000+770000+143100+111300);
});
test('E2: without a labor share, a story adjustment goes to the owner as a missing setting; one story still quotes',()=>{
  const q=review(sidingExtras(3,null));
  assert.ok(q.missingOwnerFields.includes('installedLaborPercent.surfaceExtraRates.soffit'));
  assert.equal(total(ready(sidingExtras(1,null))),400000+770000+135000+105000);
  const f=sidingExtras(3,null),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(s.status,'QUOTING LIVE');
  assert.deepEqual(s.laborAdjustmentCoverage.map(r=>[r.selection.stories,r.missingOwnerFields]),[[2,['installedLaborPercent.surfaceExtraRates.soffit','installedLaborPercent.surfaceExtraRates.fascia']],[3,['installedLaborPercent.surfaceExtraRates.soffit','installedLaborPercent.surfaceExtraRates.fascia']]]);
});
function exteriorExtras(stories,labor=60){
  const f=offeringFixture('EXTERIOR_PAINTING','itemized'),p=f.ownerPricing.pricing;
  p.paintingSettings={soffitUnit:'linear_feet'};p.surfaceExtraRates={exteriorTrim:300,soffit:300,fascia:250,windows:4500,doors:9000,shutters:3000,garageDoors:20000,powerWashing:25};
  p.installedLaborPercent={...(p.installedLaborPercent||{})};p.installedMaterialsPercent={...(p.installedMaterialsPercent||{})};
  for(const key of Object.keys(p.surfaceExtraRates))if(labor!==null){p.installedLaborPercent['surfaceExtraRates.'+key]=labor;p.installedMaterialsPercent['surfaceExtraRates.'+key]=100-labor;}
  Object.assign(f.customerInputs,{stories,surfaceOptionalItems:Object.keys(p.surfaceExtraRates),exteriorTrimLengthLF:150,soffitQuantity:150,fasciaLengthLF:150,paintWindows:6,paintDoors:2,paintShutters:4,paintGarageDoors:1,powerWashingAreaSqft:1200});
  return f;
}
test('E2: exterior painting adjusts soffit, fascia and exterior trim only',()=>{
  const pick=q=>Object.fromEntries(Object.entries(lines(q)).filter(([name])=>['Exterior trim','Soffit','Fascia','Windows','Doors','Shutters','Garage doors','Power washing'].includes(name)));
  // 1 story: trim 150 x 300c = 45000, soffit 45000, fascia 150 x 250c = 37500, windows 6 x 4500c = 27000,
  // doors 2 x 9000c = 18000, shutters 4 x 3000c = 12000, garage door 20000, power washing 1200 x 25c = 30000.
  const base={'Exterior trim':45000,Soffit:45000,Fascia:37500,Windows:27000,Doors:18000,Shutters:12000,'Garage doors':20000,'Power washing':30000};
  assert.deepEqual(pick(ready(exteriorExtras(1))),base);
  // 3 stories (1.20), 60% labor share, x 1.12: trim 50400, soffit 50400 (the help text's $450 -> $504), fascia 42000; others unchanged.
  assert.deepEqual(pick(ready(exteriorExtras(3))),{...base,'Exterior trim':50400,Soffit:50400,Fascia:42000});
  assert.ok(review(exteriorExtras(3,null)).missingOwnerFields.includes('installedLaborPercent.surfaceExtraRates.exteriorTrim'));
});
test('E2: story-multiplier help states the adjustment for both services',()=>{
  assert.match(CLASS2_HELP['EXTERIOR_PAINTING.storyMultiplier'],/Soffit, fascia and exterior trim prices are adjusted on their labor share the same way: at a 60% labor share and 1\.20, a \$450 soffit price becomes \$504\. Until the labor share is set, a job that needs a story adjustment and includes a soffit, fascia or exterior trim price goes to you for review\. Door, garage door, window, shutter and power washing prices and materials are not adjusted\.$/);
  assert.match(CLASS2_HELP['SIDING_REPLACEMENT.storyMultiplier'],/Soffit and fascia prices are adjusted on their labor share the same way: at a 60% labor share and 1\.20, a \$1,350 soffit price becomes \$1,512\. Until the labor share is set, a job that needs a story adjustment and includes a soffit or fascia price goes to you for review\./);
  // The examples price as stated: 151200c soffit at 3 stories above is $1,512; 50400c exterior soffit is $504.
});

// ---------------- E3: wall coats per room ----------------
test('E3: a room with its own coats is priced at its own coats (basic setup)',()=>{
  // A 2 coats (job answer): labor 416 x 2 x 100c = 83200; B 3 coats: 320 x 3 x 100c = 96000.
  // Paint (366 x 2 + 285 x 3) = 1587 x 1.10 x 30c = 52371.
  const q=ready(rooms(basic(),[A,{...B,coats:3}]));
  assert.deepEqual(lineList(q),[['Wall labor',83200],['Wall labor',96000],['Wall paint and materials',52371]]);
  assert.equal(total(q),231571);
  assert.ok(option(q).priceDrivers.includes('Paint coats by room: 2 and 3'));
});
test('E3: rooms at the job\'s coats price exactly as before',()=>{
  // (416 + 320) x 2 x 100c = 147200; (366 + 285) x 2 x 1.10 x 30c = 42966.
  const without=ready(rooms(basic(),[A,B])),same=ready(rooms(basic(),[{...A,coats:2},{...B,coats:2}]));
  assert.deepEqual(lineList(without),[['Wall labor',147200],['Wall paint and materials',42966]]);
  assert.deepEqual(lineList(same),lineList(without));
  assert.ok(option(without).priceDrivers.includes('2 paint coats'));
});
test('E3: room coats boundaries and the outside-opening guard',()=>{
  // 1 and 3 are accepted; 0, 4 and 1.5 are not.
  for(const coats of [1,3])ready(rooms(basic(),[{...A,coats},B]));
  for(const coats of [0,4,1.5])assert.ok(review(rooms(basic(),[{...A,coats},B])).invalidCustomerFields.includes('rooms'),String(coats));
  // An opening listed outside the rooms cannot be placed when room coats differ...
  const q=review(rooms(basic(),[A,{...B,coats:3}],{largeOpenings:[{widthFeet:6,heightFeet:7}]}));
  assert.ok(q.validationMessages.includes('Put each opening in its room so that room\'s own coats can be used.'));
  // ...and is still accepted when every room uses the job's coats: paint (366 + 285 - 42) x 2 x 1.10 x 30c = 40194.
  assert.equal(lines(ready(rooms(basic(),[A,B],{largeOpenings:[{widthFeet:6,heightFeet:7}]})))['Wall paint and materials'],40194);
});
test('E3: itemized offering prices room coats; installed offering prices its own coats',()=>{
  // Itemized walls: same as the basic case: 83200 + 96000 labor, 52371 finish materials.
  const f=rooms(offeringFixture('INTERIOR_PAINTING','itemized'),[A,{...B,coats:3}],{ceilingsIncluded:false,trimIncluded:false});delete f.customerInputs.trimLengthLF;
  const q=ready(f),l=lineList(q);
  assert.deepEqual(l.filter(([n])=>n==='Wall finish labor').map(([,v])=>v),[83200,96000]);
  assert.equal(lines(q)['Wall finish materials'],52371);
  assert.match(option(q).disclaimer,/Wall finish coats by room: 2 and 3; 1 wall primer coat\(s\)\./);
  const g=rooms(offeringFixture('INTERIOR_PAINTING','installed'),[A,{...B,coats:3}],{ceilingsIncluded:false,trimIncluded:false});delete g.customerInputs.trimLengthLF;
  // Changed November 24, 2026 (audit f1501ff #8, owner instruction to quote
  // by trade practice): an installed price covers the painter's own coats, so
  // a room's coat answer is not used and no longer sends the job to review.
  // Installed at the offering's 2 coats: (416 + 320) x 600c = 441600.
  assert.equal(total(ready(g)),441600);
  g.customerInputs.rooms=[{...A,coats:2},{...B,coats:2}];assert.equal(total(ready(g)),441600);
});
test('E3: the customer form offers a coat count on every room, and direct area points to it',()=>{
  const contract=customerContractForVNext('INTERIOR_PAINTING',basic().ownerPricing.pricing);
  assert.deepEqual(contract.fields.rooms.rowFields.coats,{label:'Wall finish coats in this room',unit:'coats',type:'number',min:1,max:3,integer:true,optional:true});
  assert.equal(contract.fields.rooms.rowFields.wallColor,undefined);
  assert.equal(review(basic({wallScopeUniform:false})).reviewReason,'Walls that need different numbers of coats can be entered room by room, each room with its own wall finish coats. Rooms of different heights can also be entered room by room.');
});

// ---------------- E4: wall colors, each rounded to its own cans ----------------
// 400 sq ft of wall, 2 doors and 2 windows, 2 coats: paint 400 - 40 - 30 = 330 x 2 = 660 coat sq ft.
const cans=colors=>packaged(basic({wallAreaSqft:400,doorCount:2,windowCount:2,...(colors===undefined?{}:{wallColorCount:colors})}),[['paint_wall','paint',400,5000]]);
test('E4: each wall color is rounded up to its own cans',()=>{
  // 1 color: 660 x 1.10 / 400 = 1.815 -> 2 cans = 10000. Labor 400 x 2 x 100c = 80000.
  assert.deepEqual(lines(ready(cans(1))),{'Wall labor':80000,'Purchased materials: paint':10000});
  // 3 colors: 660 / 3 = 220 x 1.10 / 400 = 0.605 -> 1 can each = 15000 (one shared purchase bought 2).
  const three=cans(3);three.customerInputs.wallColorAreas=[110,110,110].map(areaSqft=>({areaSqft}));
  const q=ready(three);
  assert.deepEqual(lines(q),{'Wall labor':80000,'Purchased materials: paint — wall color 1':5000,'Purchased materials: paint — wall color 2':5000,'Purchased materials: paint — wall color 3':5000});
  assert.equal(total(q),95000);
  // 2 colors: 330 x 1.10 / 400 = 0.9075 -> 1 can each = 10000.
  const two=cans(2);two.customerInputs.wallColorAreas=[{areaSqft:165},{areaSqft:165}];
  assert.equal(total(ready(two)),90000);
});
test('E4: the number of wall colors is asked when paint is bought by the can, and only then',()=>{
  assert.deepEqual(review(cans()).missingCustomerFields,['wallColorCount']);
  for(const bad of [0,1.5,101])assert.ok(review(cans(bad)).invalidCustomerFields.includes('wallColorCount'),String(bad));
  const perSqft=basic({wallAreaSqft:400});
  assert.equal(customerContractForVNext('INTERIOR_PAINTING',perSqft.ownerPricing.pricing,perSqft.ownerPricing).required(perSqft.customerInputs).includes('wallColorCount'),false);
  const f=cans(1),contract=customerContractForVNext('INTERIOR_PAINTING',f.ownerPricing.pricing,f.ownerPricing);
  assert.equal(contract.fields.wallColorCount.label,'Number of wall paint colors');
  assert.ok(contract.fields.rooms.rowFields.wallColor);
});
// Room C 20x15x8, 1 door, 2 windows: gross 560, paint 510. Room D 12x10x8, 1 door, 1 window: gross 352, paint 317.
// Room E 8x6x8, 1 door: gross 224, paint 204. Labor (560 + 352 + 224) x 2 x 100c = 227200.
const C={lengthFeet:20,widthFeet:15,heightFeet:8,doorCount:1,windowCount:2},D={lengthFeet:12,widthFeet:10,heightFeet:8,doorCount:1,windowCount:1},E={lengthFeet:8,widthFeet:6,heightFeet:8,doorCount:1,windowCount:0};
test('E4: room wall colors count each color\'s cans from its own rooms; multiple colors require room assignments',()=>{
  // Color 1 = C + D: (510 + 317) x 2 = 1654 x 1.10 / 400 = 4.5485 -> 5 cans; color 2 = E: 204 x 2 = 408 x 1.10 / 400 = 1.122 -> 2 cans.
  const own=ready(packaged(rooms(basic(),[{...C,wallColor:1},{...D,wallColor:1},{...E,wallColor:2}],{wallColorCount:2}),[['paint_wall','paint',400,5000]]));
  assert.deepEqual(lines(own),{'Wall labor':227200,'Purchased materials: paint — wall color 1':25000,'Purchased materials: paint — wall color 2':10000});
  const unassigned=packaged(rooms(basic(),[C,D,E],{wallColorCount:2}),[['paint_wall','paint',400,5000]]);
  assert.ok(review(unassigned).invalidCustomerFields.includes('rooms'));
});
test('E4: room wall colors must be complete and match the number of colors',()=>{
  const make=(list,count=2)=>packaged(rooms(basic(),list,{wallColorCount:count}),[['paint_wall','paint',400,5000]]);
  assert.ok(review(make([{...C,wallColor:1},D])).validationMessages.includes('Give every room its wall color number.'));
  for(const list of [[{...C,wallColor:1},{...D,wallColor:3}],[{...C,wallColor:1},{...D,wallColor:1}]])assert.ok(review(make(list)).validationMessages.includes('Room wall color numbers must use each number from 1 to the number of wall colors.'));
  // A room color without paint bought by the can is refused.
  assert.ok(review(rooms(basic(),[{...C,wallColor:1},{...D,wallColor:1}])).validationMessages.includes('This detail was supplied for work not selected in this request.'));
});
test('E4: with several wall colors, a ceiling sharing the wall product has its own cans',()=>{
  // Changed November 25, 2026 (Neon audit of v48 #6): each wall color is its
  // own tint and the ceiling is not wall color 1, so the ceiling is bought on
  // its own. Walls 500 x 2 = 1000 -> 500 per color: 500 x 1.10 / 400 = 1.375
  // -> 2 cans each; ceilings 200 x 2 = 400 x 1.10 / 400 = 1.1 -> 2 cans.
  // (Before: color 1 + ceilings 900 x 1.10 / 400 = 2.475 -> 3 cans.)
  const f=packaged(offeringFixture('INTERIOR_PAINTING','itemized'),[['paint_wall','finish',400,5000],['paint_ceiling','finish',400,5000],['paint_primer','primer',400,4000],['paint_ceiling_primer','primer',400,4000],['paint_prep','prep',100,2000]]);
  f.customerInputs.wallColorCount=2;f.customerInputs.wallColorAreas=[{areaSqft:250},{areaSqft:250}];
  const l=lines(ready(f));
  assert.equal(l['Purchased materials: finish — wall color 1'],10000);assert.equal(l['Purchased materials: finish — wall color 2'],10000);assert.equal(l['Purchased materials: finish — ceilings'],10000);
  // Changed November 25, 2026 (Neon v49 NEW-6): one wall color too. Walls 1000 x 1.10 / 400 = 2.75 -> 3 cans;
  // ceilings 2 cans (before: pooled 1400 x 1.10 / 400 = 3.85 -> 4 cans = 20000).
  f.customerInputs.wallColorCount=1;delete f.customerInputs.wallColorAreas;const one=lines(ready(f));
  assert.equal(one['Purchased materials: finish'],15000);assert.equal(one['Purchased materials: finish — ceilings'],10000);
});

// ---------------- E5: the door and window note on packaged paint ----------------
test('E5: packaged paint carries the door and window note like per-square-foot paint',()=>{
  assert.ok(option(ready(cans(1))).disclaimer.includes(OPENING_ALLOWANCE_NOTE));
  assert.ok(option(ready(basic({wallAreaSqft:400,doorCount:2,windowCount:2}))).disclaimer.includes(OPENING_ALLOWANCE_NOTE));
  // Boundary: one window alone is enough; no doors and no windows means no note.
  const one=packaged(basic({wallAreaSqft:400,doorCount:0,windowCount:1,wallColorCount:1}),[['paint_wall','paint',400,5000]]);
  assert.ok(option(ready(one)).disclaimer.includes(OPENING_ALLOWANCE_NOTE));
  const none=packaged(basic({wallAreaSqft:400,wallColorCount:1}),[['paint_wall','paint',400,5000]]);
  assert.ok(!option(ready(none)).disclaimer.includes(OPENING_ALLOWANCE_NOTE));
});

// ---------------- E6: wall area wording ----------------
test('E6: the driver states measured wall area, not paintable wall area',()=>{
  const q=ready(basic({wallAreaSqft:500,doorCount:2}));
  assert.ok(option(q).priceDrivers.includes('500 measured square feet of wall area'));
  // Paint is still charged on 500 - 40 = 460 sq ft per coat: 460 x 2 x 1.10 x 30c = 30360.
  assert.equal(lines(q)['Wall paint and materials'],30360);
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING']){
    const o=option(ready(offeringFixture(type,'itemized')));
    assert.ok(o.priceDrivers.includes('500 measured square feet of wall area'),type);
    assert.ok(!JSON.stringify(o.priceDrivers).includes('paintable'),type);
  }
});

// ---------------- E7: preparation bought for each surface condition ----------------
function prep(perCondition,ceilingCondition='good'){
  const f=offeringFixture('INTERIOR_PAINTING','itemized');Object.assign(f.ownerPricing.pricing.offeringRates,{prepLaborPerSqft_good:50,prepMaterialPerSqft_good:10,prepLaborPerSqft_poor:150,prepMaterialPerSqft_poor:30});
  packaged(f,[['paint_wall','finish',400,5000],['paint_ceiling','finish',400,5000],['paint_primer','primer',400,4000],['paint_ceiling_primer','primer',400,4000],['paint_prep','prep',100,2000],...(perCondition?[['paint_prep_fair','prep',60,2000],['paint_prep_good','prep',300,2000]]:[])]);
  Object.assign(f.customerInputs,{wallColorCount:1,ceilingSurfaceCondition:ceilingCondition,trimIncluded:false});delete f.customerInputs.trimLengthLF;return f;
}
test('E7: each surface condition gets its own preparation purchase and coverage',()=>{
  // Walls 500 sq ft fair, ceilings 200 sq ft good. Shared prep: (500 + 200) x 1.10 / 100 = 7.7 -> 8 x 2000 = 16000.
  // Totals changed November 25, 2026 (Neon v49 NEW-6): the ceiling finish paint is its own cans, one more 5000 can (269000 -> 274000).
  const shared=ready(prep(false));assert.equal(lines(shared)['Purchased materials: prep'],16000);assert.equal(total(shared),274000);
  // By condition: fair 500 x 1.10 / 60 = 9.17 -> 10 x 2000 = 20000; good 200 x 1.10 / 300 = 0.73 -> 1 x 2000 = 2000.
  const own=ready(prep(true)),l=lines(own);
  assert.equal(l['Purchased materials: prep — fair surfaces'],20000);assert.equal(l['Purchased materials: prep — good surfaces'],2000);
  assert.equal(l['Purchased materials: prep'],undefined);assert.equal(total(own),274000-16000+22000);
});
test('E7: one condition is one purchase; a condition without its own purchase uses the shared one',()=>{
  // Fair ceilings: (500 + 200) x 1.10 / 60 = 12.83 -> 13 x 2000 = 26000.
  assert.equal(lines(ready(prep(true,'fair')))['Purchased materials: prep — fair surfaces'],26000);
  // Poor ceilings (no poor purchase): fair walls 20000; ceilings 200 x 1.10 / 100 = 2.2 -> 3 x 2000 = 6000 shared.
  const l=lines(ready(prep(true,'poor')));
  assert.equal(l['Purchased materials: prep — fair surfaces'],20000);assert.equal(l['Purchased materials: prep'],6000);
});
test('E7: condition purchases may differ in coverage from the shared product; editor and coverage follow',()=>{
  const f=prep(true),p=f.ownerPricing.pricing;
  assert.deepEqual(scopeStructureDiagnostics('INTERIOR_PAINTING',p).filter(d=>d.path.endsWith('.productKey')),[]);
  // Two ordinary scopes that share a product still must agree.
  const clash=structuredClone(p);clash.scopeDetails.paint_ceiling.coverage=350;
  assert.ok(scopeStructureDiagnostics('INTERIOR_PAINTING',clash).some(d=>d.path==='scopeDetails.paint_ceiling.productKey'));
  const s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(s.status,'QUOTING LIVE');
  for(const key of ['paint_prep_fair','paint_prep_good'])assert.equal(s.scopeCoverage.find(r=>r.key===key).configurationComplete,true,key);
  assert.equal(scopeVisibleInEditor('INTERIOR_PAINTING',{},'paint_prep_fair'),false);
  assert.equal(scopeVisibleInEditor('INTERIOR_PAINTING',{offeringMode:'itemized'},'paint_prep_fair'),true);
});

// ---------------- E8: siding labor and material areas ----------------
// 160 ft perimeter x 10 ft + one 30 x 6 gable (90) = 1690 gross. Garage 16 x 7 = 112; 2 doors (40); 10 windows (150).
// Openings left in 1690; large openings subtracted 1690 - 112 = 1578; all openings subtracted 1578 - 40 - 150 = 1388.
const BUILDING={areaInputMethod:'building_dimensions',buildingPerimeterFeet:160,wallHeightFeet:10,doorCount:2,windowCount:10,garageDoorCount:1,garageDoorWidthFeet:16,garageDoorHeightFeet:7,gables:[{widthFeet:30,heightFeet:6}]};
const areas=(settings,customer)=>{const f=siding();f.ownerPricing.pricing.sidingSettings=settings;delete f.customerInputs.sidingAreaSqft;Object.assign(f.customerInputs,customer);return f;};
test('E8: siding labor and materials use their own conventions',()=>{
  // Labor left in: 1690 x 400c = 676000; materials all subtracted: 1388 x 1.10 x 700c = 1068760.
  assert.deepEqual(lines(ready(areas({areaConventionByType:{vinyl:'openings_left_in'},materialAreaConventionByType:{vinyl:'openings_subtracted'}},BUILDING))),{'Siding labor':676000,'Siding materials':1068760});
  // Labor all subtracted: 1388 x 400c = 555200; materials left in: 1690 x 1.10 x 700c = 1301300.
  assert.deepEqual(lines(ready(areas({areaConventionByType:{vinyl:'openings_subtracted'},materialAreaConventionByType:{vinyl:'openings_left_in'}},BUILDING))),{'Siding labor':555200,'Siding materials':1301300});
  // Materials large openings subtracted: 1578 x 1.10 x 700c = 1215060.
  assert.equal(lines(ready(areas({areaConventionByType:{vinyl:'openings_left_in'},materialAreaConventionByType:{vinyl:'large_openings_subtracted'}},BUILDING)))['Siding materials'],1215060);
});
test('E8: without a separate material convention, saved books price exactly as before',()=>{
  // Both left in: 676000 + 1301300.
  assert.equal(total(ready(areas({areaConventionByType:{vinyl:'openings_left_in'}},BUILDING))),1977300);
  // Direct area, single convention: 1600 x 400c + 1600 x 1.10 x 700c = 640000 + 1232000; same when chosen equal.
  assert.equal(total(ready(areas({areaConventionByType:{vinyl:'openings_subtracted'}},{areaInputMethod:'sqft',sidingAreaSqft:1600}))),1872000);
  assert.equal(total(ready(areas({areaConventionByType:{vinyl:'openings_subtracted'},materialAreaConventionByType:{vinyl:'openings_subtracted'}},{areaInputMethod:'sqft',sidingAreaSqft:1600}))),1872000);
  assert.equal(total(ready(siding())),1170000);
});
test('E8: a direct area with differing conventions is the full wall area with its openings counted',()=>{
  const settings={areaConventionByType:{vinyl:'openings_left_in'},materialAreaConventionByType:{vinyl:'openings_subtracted'}};
  assert.deepEqual(review(areas(settings,{areaInputMethod:'sqft',sidingAreaSqft:1600})).missingCustomerFields,['doorCount','windowCount','garageDoorCount']);
  // Labor 1600 x 400c = 640000; materials (1600 - 40 - 150) = 1410 x 1.10 x 700c = 1085700.
  assert.deepEqual(lines(ready(areas(settings,{areaInputMethod:'sqft',sidingAreaSqft:1600,doorCount:2,windowCount:10,garageDoorCount:0}))),{'Siding labor':640000,'Siding materials':1085700});
  const f=areas(settings,{areaInputMethod:'sqft',sidingAreaSqft:1600}),contract=customerContractForVNext('SIDING_REPLACEMENT',f.ownerPricing.pricing,f.ownerPricing);
  assert.equal(contract.fields.sidingAreaSqft.presentationVariants.find(v=>v.visibleWhen[0][0][2]==='vinyl').label,'Siding wall area — Full wall area: openings left in');
  assert.ok(contract.fields.doorCount.visibleWhen.some(all=>JSON.stringify(all)===JSON.stringify([['areaInputMethod','eq','sqft'],['sidingType','eq','vinyl']])));
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
});
test('E8: the material convention needs a labor convention and a supported value',()=>{
  assert.deepEqual(surfaceOwnerDiagnostics('SIDING_REPLACEMENT',{sidingSettings:{materialAreaConventionByType:{vinyl:'openings_subtracted'}}}).map(d=>d.path),['sidingSettings.areaConventionByType.vinyl']);
  assert.deepEqual(surfaceOwnerDiagnostics('SIDING_REPLACEMENT',{sidingSettings:{areaConventionByType:{vinyl:'openings_left_in'},materialAreaConventionByType:{vinyl:'half'}}}).map(d=>d.path),['sidingSettings.materialAreaConventionByType.vinyl']);
  assert.deepEqual(surfaceOwnerDiagnostics('SIDING_REPLACEMENT',{sidingSettings:{areaConventionByType:{vinyl:'openings_left_in'},materialAreaConventionByType:{vinyl:'openings_subtracted'}}}),[]);
});
