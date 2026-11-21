import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
import {CARPET_ROLL_FIT_NOTE,CARPET_ROLL_FIT_NOTE_ROOMS} from '../server/quote-engine-vnext/flooringPricing.js';
import {withoutDeselectedDependents,clearChangedScopeConfirmations} from '../server/scopeConfiguration.js';
import {readyMixUnitPresentationCopy,FIELD_COPY as CONCRETE_COPY} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
import {interpretInterviewAnswer,interpretInterviewAnswerInUnit} from '../server/src/priceBookAI.js';
import {fixture,flooring,concrete,flatRoof,TILE_ON_CONCRETE_SLAB} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {fenceMeasuringForm,fenceStartsTotalOnly,fenceWizardFields} from '../client/src/fenceMeasuring.js';

// November 21, 2026 (v42). Neon's and Astra's audits of v41 (b1cd0fa). Every
// expected value below was worked out by hand before the run.
const quote=f=>generateQuoteVNext(f);
const ready=f=>{const q=quote(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.missingCustomerFields,q.invalidCustomerFields]));return q;};
const mid=q=>q.options[0].calculationRecord.scenarios.mid;
const cents=q=>mid(q).finalTotalCents;
const line=(q,name)=>mid(q).lineItems.find(l=>l.name===name);
const notes=q=>q.options[0].calculationRecord.disclosures||[];
const D=f=>f.businessDefaults,O=f=>f.ownerPricing;
// A 10% busy season in the work month (July).
const season=f=>{delete O(f).peakMonths;delete O(f).peakSurchargePercent;Object.assign(D(f),{peakMonths:[7],peakSurchargePercent:10});f.customerInputs.workMonth='july';return f;};

// ---- Carpet: a room no wider than the roll takes one width ----
// Carpet 3.00 per sq ft, labor 1.00 per sq ft, pad 0.80 per sq ft, 12 ft roll.
const PAD={scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Carpet pad',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_carpet:80}};
const carpet=(rooms,p={})=>fixture('FLOORING_INSTALL',{laborPerSqft:{carpet:100},materialPerSqft:{carpet:300},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',carpetRollWidthFt:12,carpetCrossgrainSeams:'not_allowed',...PAD,...p},
  {sqft:rooms.reduce((s,r)=>s+r.lengthFt*r.widthFt,0),sqftMethod:'exact',newFlooringType:'carpet',existingFloorType:'none',removalNeeded:false,roomCount:rooms.length,layoutPattern:'straight',stairSteps:0,carpetRooms:rooms,carpetConnectedAreas:[],underlaymentScopeConfirmed:true});
const bought=q=>line(q,'Flooring materials').calculation.quantity;
test('a room as wide as the carpet roll takes one width; trim stays on the cut length',()=>{
  // 12 x 12 on a 12 ft roll: one width cut 12 + 0.5 = 12.5 long: 150 sq ft (was two widths, 300).
  let q=ready(carpet([{lengthFt:12,widthFt:12}]));
  assert.equal(bought(q),150);
  // Material 150 x 3.00 = 450.00; labor 144 x 1.00 x 1.20 (small room) = 172.80; pad 144 x 0.80 = 115.20: 738.00.
  assert.equal(cents(q),73800);
  assert.ok(notes(q).includes(CARPET_ROLL_FIT_NOTE));
  // The same with crossgrain fills allowed (was 204 with a 0.5 ft fill).
  assert.equal(bought(ready(carpet([{lengthFt:12,widthFt:12}],{carpetCrossgrainSeams:'allowed'}))),150);
  // 12 x 15: one width cut 15.5 long: 186 (was 300).
  assert.equal(bought(ready(carpet([{lengthFt:12,widthFt:15}]))),186);
  // A 3 x 12 hall: one 12 ft width cut 3.5 long: 42, one piece (was two pieces, 84).
  q=ready(carpet([{lengthFt:12,widthFt:3}]));
  assert.equal(bought(q),42);assert.equal(q.options[0].calculationRecord.quantityDerivations.find(d=>d.name==='flooringMaterialSqft').inputs.cuts[0].pieces,1);
  // 11.75 ft across still fits one width: 12 x 12.25 = 147.
  assert.equal(bought(ready(carpet([{lengthFt:11.75,widthFt:11.75}]))),147);
});
test('rooms narrower or wider than the roll are bought as before, with no fit note',()=>{
  // 11 x 14: across 11 + 0.5 = 11.5 fits; cut 14.5: 174. No note: the trim fits inside the roll.
  let q=ready(carpet([{lengthFt:14,widthFt:11}]));
  assert.equal(bought(q),174);assert.ok(!notes(q).some(n=>n===CARPET_ROLL_FIT_NOTE||n===CARPET_ROLL_FIT_NOTE_ROOMS));
  // 13 x 13 is wider than the roll both ways: two widths cut 13.5: 324.
  assert.equal(bought(ready(carpet([{lengthFt:13,widthFt:13}]))),324);
  // With fills allowed: one width 12 x 13.5 = 162 plus a 1.5 ft fill, 3 strips from one cut of (13 + 3 x 0.5) / 3 = 4.8333 ft: 58. 220.
  assert.equal(bought(ready(carpet([{lengthFt:13,widthFt:13}],{carpetCrossgrainSeams:'allowed'}))),220);
  // 12.5 x 12: the 12 ft side runs across the roll, cut 12.5 + 0.5 = 13: 156.
  assert.equal(bought(ready(carpet([{lengthFt:12.5,widthFt:12}]))),156);
  // A 3 x 20 hall is longer than the roll: two 12 ft widths cut 3.5: 84.
  assert.equal(bought(ready(carpet([{lengthFt:20,widthFt:3}]))),84);
  // A 13.5 ft roll takes a 12 x 12 room with its trim: 13.5 x 12.5 = 168.75, no note.
  q=ready(carpet([{lengthFt:12,widthFt:12}],{carpetRollWidthFt:13.5}));
  assert.equal(bought(q),168.75);assert.ok(!notes(q).includes(CARPET_ROLL_FIT_NOTE));
});

// ---- Furniture moving asked for is never dropped silently ----
test('a tier with no furniture-moving price lists it as not included',()=>{
  // Tile 500 sq ft, labor 6.00 x 1.10 (medium rooms) = 3,300.00. Basic material 4.00 x 560 = 2,240.00: 5,540.00.
  // Full material 6.00 x 560 = 3,360.00 plus 200.00 moving: 6,860.00.
  const f=fixture('FLOORING_INSTALL',{laborPerSqft:{tile:600},materialPerSqft:{tile:600},minimumJob:0},{sqft:500,sqftMethod:'exact',newFlooringType:'tile',existingFloorType:'none',removalNeeded:false,roomCount:2,layoutPattern:'straight',stairSteps:0,furnitureMovingNeeded:true,...TILE_ON_CONCRETE_SLAB});
  O(f).tiers=[{name:'Basic',overrides:{materialPerSqft:{tile:400}}},{name:'Full',overrides:{furnitureMovingPrice:20000,furnitureMovingPriceUnit:'flat'}}];
  const q=ready(f),[basic,full]=q.options;
  assert.equal(basic.calculationRecord.scenarios.mid.finalTotalCents,554000);assert.deepEqual(basic.skippedAddons,['Furniture moving']);
  assert.match(basic.disclaimer,/This estimate does not include: Furniture moving\./);
  assert.equal(full.calculationRecord.scenarios.mid.finalTotalCents,686000);assert.deepEqual(full.skippedAddons,[]);
  // Not asked for: nothing is listed.
  f.customerInputs.furnitureMovingNeeded=false;
  assert.deepEqual(ready(f).options.map(o=>o.skippedAddons),[[],[]]);
});

// ---- An overlay rule for another floor and product does not hold a floating floor ----
const allFalse={wood:false,resilient_sheet:false,resilient_tile_plank:false,ceramic_stone_tile:false,concrete:false};
const floating=(overlayFor)=>{
  const id=randomUUID(),f=flooring('laminate');
  Object.assign(O(f).pricing,{laminateInstallInstructions:'[SYNTHETIC] Laminate, instructions 2025',laminateFloatsOver:{...allFalse,ceramic_stone_tile:true},
    scopeDetails:{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'},...(overlayFor?{floor_overlay:{description:'[SYNTHETIC] Clean only',mode:'itemized',existingFloorType:'tile',newFlooringType:overlayFor,basePriceExcludesPreparation:true}}:{})},
    ...(overlayFor?{scopeRates:{floor_overlay_prep:100,floor_overlay_material:50}}:{})});
  O(f).knownOfferings.existingFloorType={...O(f).knownOfferings.existingFloorType,tile:id};
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:'tile',removalNeeded:false,existingFloorSound:'yes',underlaymentScopeConfirmed:true,...(overlayFor==='laminate'?{overlayScopeConfirmed:true}:{})});
  f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:'tile',offeringId:id}};
  return f;
};
test('floating laminate over sound tile quotes when the book only has a vinyl-plank-over-tile rule',()=>{
  // 200 sq ft: labor 3.00 x 1.10 = 660.00; material 5.00 x 216 = 1,080.00: 1,740.00.
  assert.equal(cents(ready(floating())),174000);
  assert.equal(cents(ready(floating('vinyl_plank'))),174000);
  // A rule for this floor and this product still applies: 200 x (1.00 + 0.50) = 300.00 more.
  assert.equal(cents(ready(floating('laminate'))),204000);
});

// ---- Answers left behind by a switched-off option ----
const scopeCase=id=>structuredClone(measuredScopeCases().find(c=>c.id===id).input);
const formFields=f=>Object.entries(customerContractForVNext(f.serviceType,O(f).pricing,O(f).feeRules||{}).fields).map(([name,d])=>({name,...d}));
// What the form does when the customer changes an answer.
const edited=(f,change)=>{const fields=formFields(f),next={...f.customerInputs,...change};f.customerInputs=withoutDeselectedDependents(fields,clearChangedScopeConfirmations(fields,f.customerInputs,next));return f;};
test('switching an option off takes its answers with it, and the job quotes',()=>{
  // Each total is the same job with the option never selected.
  let f=edited(scopeCase('demolition-itemized'),{demolitionNeeded:false});
  for(const k of ['demolitionAreaSqft','demolitionThickness','demolitionReinforcement','demolitionAccessDifficulty','demolitionScopeConfirmed'])assert.ok(!(k in f.customerInputs),k);
  assert.equal(cents(ready(f)),353889);
  f=edited(scopeCase('siding-removal-itemized'),{oldSidingRemoval:false});
  for(const k of ['existingSidingType','sidingRemovalAreaSqft','sidingRemovalStories','sidingRemovalScopeConfirmed'])assert.ok(!(k in f.customerInputs),k);
  assert.equal(cents(ready(f)),1170000);
  f=edited(scopeCase('stairs-itemized'),{stairSteps:0});
  for(const k of ['stairWidthLF','stairRemovalNeeded','stairDisposalNeeded','floorAreaExcludesStairs','stairScopeConfirmed'])assert.ok(!(k in f.customerInputs),k);
  assert.equal(cents(ready(f)),178000);
  f=edited(scopeCase('commercial-itemized'),{insulationNeeded:false,coverboardNeeded:false});
  for(const k of ['insulationAreaSqft','coverboardAreaSqft','insulationScopeConfirmed'])assert.ok(!(k in f.customerInputs),k);
  assert.equal(cents(ready(f)),1470000);
});
test('only an explicit No or 0 takes answers away',()=>{
  // Insulation off, cover board still on: the cover-board area stays.
  let f=scopeCase('commercial-itemized'),fields=formFields(f);
  let out=withoutDeselectedDependents(fields,{...f.customerInputs,insulationNeeded:false});
  assert.ok(!('insulationAreaSqft' in out));assert.equal(out.coverboardAreaSqft,600);
  // An unanswered question keeps its dependents.
  f=scopeCase('stairs-itemized');fields=formFields(f);
  const unanswered={...f.customerInputs};delete unanswered.stairSteps;
  assert.equal(withoutDeselectedDependents(fields,unanswered).stairWidthLF,3);
  // A different measuring method is not a switch-off: the customer corrects it on screen.
  const paint=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:75,materialPerWallSqftPerCoat:20,ceilingLaborPerSqftPerCoat:60,ceilingMaterialPerSqftPerCoat:20,trimLaborPerLF:150,trimMaterialPerLF:25,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:500,rooms:[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:1}],wallHeight:'standard',surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
  assert.ok('rooms' in withoutDeselectedDependents(formFields(paint),paint.customerInputs));
});

// ---- A bare deck has nothing to tear off ----
const roof=(c={})=>{const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:15000},materialCostPerSquare:{asphalt_shingle:13000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2500},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},bundlesPerSquare:{asphalt_shingle:3},partialPackagePricing:'whole_packages',disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0},
  {roofSizeMethod:'roof_measured',roofSizeInput:2400,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'up_to_six',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...c});
  O(f).startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};return f;};
const withoutOld=(f,key)=>{delete f.customerInputs[key];if(f.customerInputs.confirmedFacts){delete f.customerInputs.confirmedFacts[key];if(!Object.keys(f.customerInputs.confirmedFacts).length)delete f.customerInputs.confirmedFacts;}return f;};
test('a roof with no existing layers does not ask for the old roof material',()=>{
  // 24 squares: labor 150.00 x 24 = 3,600.00; shingles 26.67 squares (80 bundles) x 130.00 = 3,466.67; underlayment 25.00 x 24 = 600.00: 7,666.67.
  assert.equal(cents(ready(withoutOld(roof({existingLayers:0}),'existingRoofType'))),766667);
  assert.equal(cents(ready(roof({existingLayers:0}))),766667);
  // With a layer to remove the material is still needed.
  let q=quote(withoutOld(roof(),'existingRoofType'));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.missingCustomerFields,['existingRoofType']);
  // Flat roof 1,000 sq ft: labor 5.00 + membrane 7.00 x 1.10 = 12,700.00.
  let f=flatRoof();f.customerInputs.existingLayers=0;
  assert.equal(cents(ready(withoutOld(f,'membraneType'))),1270000);
  f=flatRoof();q=quote(withoutOld(f,'membraneType'));
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.missingCustomerFields,['membraneType']);
});

// ---- A multi-storey footprint is always confirmed as the ground floor ----
test('every multi-storey footprint asks whether it is the ground floor only',()=>{
  const foot=(size,stories,extra={})=>roof({roofSizeMethod:'footprint',roofSizeInput:size,stories,pitchRisePer12:6,...extra});
  for(const size of [800,1600,1800,2400]){
    const q=quote(foot(size,2));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',String(size));assert.deepEqual(q.missingCustomerFields,['footprintGroundFloorOnly'],String(size));
  }
  // Confirmed, 1,600 sq ft at 6/12 is 1,600 x 1.118034 = 1,788.85 sq ft of roof.
  const q=ready(foot(1600,2,{footprintGroundFloorOnly:true}));
  assert.equal(q.options[0].calculationRecord.quantityDerivations.find(d=>d.name==='roofSquares').result,17.8885);
  // One storey is not asked, and "not the ground floor only" is corrected by the customer.
  ready(foot(1600,1));
  assert.deepEqual(quote(foot(1600,2,{footprintGroundFloorOnly:false})).invalidCustomerFields,['roofSizeInput']);
  assert.deepEqual(quote(foot(1600,1,{footprintGroundFloorOnly:true})).invalidCustomerFields,['footprintGroundFloorOnly']);
});

// ---- The busy-season charge covers the labor inside a combined preparation price ----
const sod=(p,c={})=>fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:55,sodInstallLaborPerSqft:60,minimumServiceCharge:0,sodPalletSizeSqft:450,partialPackagePricing:'whole_packages',topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2,...p},{sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:true,existingLawnToRemove:true,slope:'flat',accessDifficulty:'easy',...c});
const peakLines=q=>mid(q).lineItems.filter(l=>l.category==='surcharge').map(l=>[l.name,l.amountCents]);
test('combined ground preparation: 10% of its labor share is charged in the busy season',()=>{
  // Sod 1,350 x 0.55 = 742.50; install labor 600.00; preparation 1,000 x 1.50 = 1,500.00, 70% labor = 1,050.00.
  // Charge 10% of 600.00 = 60.00 and 10% of 1,050.00 = 105.00: 3,007.50 (was 2,902.50).
  let q=ready(season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70})));
  assert.equal(cents(q),300750);assert.deepEqual(peakLines(q),[['Peak season adjustment',6000],['Peak season adjustment on prep (with markup)',10500]]);
  // The share after the slope and access adjustment: 1,050.00 x 1.15 x 1.25 = 1,509.375; the line is 450.00 + 1,509.375 = 1,959.38.
  // Install labor 600.00 x 1.4375 = 862.50. Charges 86.25 and 150.94: 742.50 + 862.50 + 1,959.38 + 86.25 + 150.94 = 3,801.57.
  q=ready(season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70},{slope:'moderate',accessDifficulty:'difficult'})));
  assert.equal(line(q,'Ground preparation').amountCents,195938);assert.equal(cents(q),380157);
  // No labor share set, or 0%: no charge on the preparation price. 100%: 150.00.
  assert.equal(cents(ready(season(sod({groundPrepPerSqft:150})))),290250);
  assert.equal(cents(ready(season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:0})))),290250);
  assert.equal(cents(ready(season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:100})))),305250);
  // Outside the busy months nothing is charged.
  const off=season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70}));off.customerInputs.workMonth='october';
  assert.equal(cents(ready(off)),284250);
});
test('the charge on combined preparation takes the markup and tax of the preparation price',()=>{
  // 20% markup, every price a cost: 20% of (742.50 + 600.00 + 1,500.00 + 60.00 + 105.00) = 601.50: 3,609.00.
  let f=season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70}));D(f).markupPercent=20;
  assert.equal(cents(ready(f)),360900);
  // Preparation entered as a selling price: its charge is not marked up. 20% of 1,402.50 = 280.50: 3,288.00.
  f=season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70}));D(f).markupPercent=20;O(f).priceBasisByCategory.prep='sell_price';
  assert.equal(cents(ready(f)),328800);
  // Materials-only tax 10%, only preparation taxable: 10% of (1,500.00 + 105.00) = 160.50.
  const taxed=only=>{const g=season(sod({groundPrepPerSqft:150,groundPrepLaborPercent:70}));D(g).taxMode='TAX_MATERIALS';D(g).taxPercent=10;for(const k of Object.keys(O(g).taxabilityByCategory))O(g).taxabilityByCategory[k]=k===only;return mid(ready(g)).tax.taxCents;};
  assert.equal(taxed('prep'),16050);
  // Only labor taxable: 10% of (600.00 + 60.00) = 66.00.
  assert.equal(taxed('labor'),6600);
});
test('combined concrete base preparation: its labor share takes the busy-season charge',()=>{
  // Slab labor 200 x 6.00 = 1,200.00; base preparation 200 x 1.75 = 350.00, 60% labor = 210.00.
  // Charges 120.00 and 21.00. Ready-mix 488.89 and formwork 1,500.00: 3,679.89 (was 3,658.89).
  const f=concrete();O(f).pricing.basePrepLaborPercent=60;
  const q=ready(season(f));
  assert.deepEqual(peakLines(q),[['Peak season adjustment',12000],['Peak season adjustment on prep (with markup)',2100]]);assert.equal(cents(q),367989);
  const none=concrete();O(none).pricing.basePrepLaborPercent=0;
  assert.equal(cents(ready(season(none))),365889);
});
test('the busy-season charge on tear-off is taxed like tear-off',()=>{
  // Roof labor 3,600.00, tear-off 24 x 60.00 = 1,440.00. 10% season: 360.00 and 144.00.
  // Materials-only tax 10%, only removal taxable: 10% of (1,440.00 + 144.00) = 158.40 (was 144.00).
  const f=season(roof());D(f).taxMode='TAX_MATERIALS';D(f).taxPercent=10;for(const k of Object.keys(O(f).taxabilityByCategory))O(f).taxabilityByCategory[k]=k==='removal';
  const q=ready(f);assert.equal(mid(q).tax.taxCents,15840);
  // Only labor taxable: 10% of (3,600.00 + 360.00) = 396.00; the removal charge is not taxed.
  // (The installed underlayment price is all materials, so none of it is labor.)
  O(f).pricing.installedMaterialsPercent={'underlaymentPerSquare.asphalt_shingle':100};
  for(const k of Object.keys(O(f).taxabilityByCategory))O(f).taxabilityByCategory[k]=k==='labor';
  assert.equal(mid(ready(f)).tax.taxCents,39600);
});

// ---- Zero imported topsoil is not described as included ----
test('a typical import depth of 0 lists no imported topsoil',()=>{
  const q=ready(sod({sodRemovalPerSqft:75,sodGradingPerSqft:60,topsoilPerCubicYard:4000,topsoilTypicalImportDepthInches:0},{usableTopsoilDepthInches:'unknown'}));
  // 742.50 + 600.00 + 750.00 + 600.00 = 2,692.50; no topsoil line.
  assert.equal(cents(q),269250);assert.equal(line(q,'Imported topsoil'),undefined);
  assert.ok(notes(q).includes('Included ground preparation: old-lawn removal and disposal, grading.'));
  assert.ok(!notes(q).some(n=>/Included ground preparation:.*imported topsoil/.test(n)));
  // A typical depth of 2 inches: 1,000 x 2 / 324 x 1.10 = 6.79 cu yd is listed and charged.
  const two=ready(sod({sodRemovalPerSqft:75,sodGradingPerSqft:60,topsoilPerCubicYard:4000},{usableTopsoilDepthInches:'unknown'}));
  assert.ok(line(two,'Imported topsoil').amountCents>0);assert.ok(notes(two).some(n=>/Included ground preparation:.*imported topsoil/.test(n)));
});

// ---- Travel and permit fees are charged on top of the minimum unless the owner counts them toward it ----
test('with no choice saved, travel and permit fees are on top of the job minimum',()=>{
  // Tile 50 sq ft: labor 50 x 1.00 x 1.20 = 60.00; material 56 x 1.00 = 56.00: 116.00 of work.
  // Minimum 600.00, travel 150.00, permit 200.00. On top: 600.00 + 350.00 = 950.00. Counted toward it: 600.00.
  const job=treatment=>{const f=fixture('FLOORING_INSTALL',{laborPerSqft:{tile:100},materialPerSqft:{tile:100},minimumJob:0},{sqft:50,sqftMethod:'exact',newFlooringType:'tile',existingFloorType:'none',removalNeeded:false,roomCount:1,layoutPattern:'straight',stairSteps:0,...TILE_ON_CONCRETE_SLAB});
    Object.assign(D(f),{minimumJobPrice:60000,travelFee:15000,permitFee:20000});O(f).feeRules={...O(f).feeRules,travel:'always',permit:'always'};if(treatment)D(f).minimumFeeTreatment=treatment;return f;};
  assert.equal(cents(ready(job())),95000);
  assert.equal(cents(ready(job('travel_permit_on_top'))),95000);
  assert.equal(cents(ready(job('fees_in_minimum'))),60000);
  assert.match(fs.readFileSync(new URL('../client/src/quoteDoneControls.jsx',import.meta.url),'utf8'),/value=\{defaults\.minimumFeeTreatment \?\? 'travel_permit_on_top'\}/);
});

// ---- The pump charge by volume is in the book's ready-mix unit ----
test('a cubic-metre book prices pump placement per cubic metre',()=>{
  const pump=unit=>{const f=concrete();Object.assign(O(f).pricing,{readyMixUnit:unit,placementPerCubicYard:{pump:1000},placementFlat:{pump:20000},defaultPlacementMethod:'pump'});Object.assign(f.customerInputs,{chuteAccess:'no',placementMethod:'pump'});return f;};
  // 200 sq ft x 4 in / 324 = 2.4691 cu yd, x 1.10 waste = 2.7160 cu yd = 2.0766 cubic metres.
  let l=line(ready(pump('cubic_metre')),'Pump placement by volume');
  assert.equal(l.calculation.unit,'cubic metres ordered');assert.equal(l.amountCents,2077);
  l=line(ready(pump('cubic_yard')),'Pump placement by volume');
  assert.equal(l.calculation.unit,'cubic yards ordered');assert.equal(l.amountCents,2716);
  assert.equal(readyMixUnitPresentationCopy({field:'placementPerCubicYard',...CONCRETE_COPY.placementPerCubicYard},'CONCRETE_PATIO_SLAB',{readyMixUnit:'cubic_metre'},'CA').label,'Placement charge ($ per cubic metre ordered)');
});

// ---- Tax choices the tax mode ignores do not hold a service ----
test('blank per-category tax choices hold a service only under materials-only tax',()=>{
  const job=(mode,choices)=>{const f=flooring('tile');D(f).taxMode=mode;D(f).taxPercent=mode==='TAX_NONE'?0:10;if(choices===undefined)delete O(f).taxabilityByCategory;else O(f).taxabilityByCategory=choices;return f;};
  // Tile 200 sq ft: 660.00 + 1,120.00 = 1,780.00; 10% on the whole job = 178.00.
  assert.equal(cents(ready(job('TAX_ALL'))),195800);assert.equal(cents(ready(job('TAX_ALL',{}))),195800);assert.equal(cents(ready(job('TAX_ALL',{labor:false}))),195800);
  assert.equal(cents(ready(job('TAX_NONE'))),178000);
  // Materials-only tax reads the choices, so it still needs every one.
  const held=quote(job('TAX_MATERIALS',{labor:true}));
  assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(held.missingOwnerFields.includes('taxabilityByCategory.material'));
  // A choice that is set must still be Yes or No.
  assert.deepEqual(quote(job('TAX_ALL',{labor:'yes'})).invalidOwnerFields,['taxabilityByCategory.labor']);
});

// ---- Approved wording ----
test('approved wording is in place',()=>{
  const src=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
  assert.ok(src('server/priceBookCopy.js').includes("'Per sqft to remove existing grass, haul it away, grade/compact, and add topsoil as needed unless you set a separate Imported topsoil price. Make sure this number covers disposal of the old lawn.'"));
  assert.ok(src('client/src/pricebook.jsx').includes('Tax materials uses the categories you explicitly mark taxable in Quote configuration. An installed price with a materials share is split: its materials share is taxed when Materials is marked taxable, and the rest is taxed when Labor is marked taxable. Tax entire job taxes all categories.'));
  assert.ok(src('client/src/quoteDoneControls.jsx').includes("defaults.taxMode==='TAX_ALL'?<span data-tax-entire-job=\"\">Taxed — tax applies to entire job</span>:"));
  assert.equal(CARPET_ROLL_FIT_NOTE,'This room spans the full width of the carpet roll, so it is quoted as one piece with no seam. The exact wall-to-wall fit is confirmed on site.');
});

// ---- The interview keeps an ordinary per-square-yard carpet price ----
const env={GEMINI_API_KEY:'SYNTHETIC-TEST-KEY',GEMINI_TEXT_MODEL:'synthetic-text-model'};
const provider=value=>({env,fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})})});
const answer=(pricing,value,unit='square_yard')=>interpretInterviewAnswerInUnit({serviceType:'FLOORING_INSTALL',field:'materialPerSqft',answer:'[SYNTHETIC] owner answer',pricing},provider({value:{carpet:value},carpetSourceUnit:unit}));
test('a per-square-yard carpet price with no exact per-square-foot amount changes the unit instead of being refused',async()=>{
  // 30 / 9 = 3.3333... has no exact amount per square foot: kept as 30.00 per square yard.
  for(const dollars of [20,25,30,35,40,50])for(const pricing of [{carpetPriceUnit:'square_foot'},{}])
    assert.deepEqual(await answer(pricing,dollars),{value:{carpet:dollars},carpetPriceUnit:'square_yard'},String(dollars));
  // 27 / 9 = 3.00 exactly: converted, the unit stays.
  assert.deepEqual(await answer({carpetPriceUnit:'square_foot'},27),{value:{carpet:3}});
  // A square-yard book keeps the price; a per-square-foot price there is 9 times as much.
  assert.deepEqual(await answer({carpetPriceUnit:'square_yard'},30),{value:{carpet:30}});
  assert.deepEqual(await answer({carpetPriceUnit:'square_yard'},3,'square_foot'),{value:{carpet:27}});
  // The value-only form cannot change the unit, so it still asks again.
  await assert.rejects(interpretInterviewAnswer({serviceType:'FLOORING_INSTALL',field:'materialPerSqft',answer:'[SYNTHETIC] owner answer',pricing:{carpetPriceUnit:'square_foot'}},provider({value:{carpet:30},carpetSourceUnit:'square_yard'})),e=>e.statusCode===422);
});

// ---- The fence wizard asks one measuring method ----
test('fence wizard questions belong to one measuring method',()=>{
  const fields=['linearFeet','lfMethod','fenceType','fenceHeight','terrainSlope','gates','fenceRunCount','fenceRuns','cornerCount','closedRunCount'].map(name=>({name,type:name==='fenceRuns'?'fence_runs':'number'}));
  assert.ok(fenceMeasuringForm(fields));
  assert.deepEqual(fenceWizardFields(fields,false).map(f=>f.name),['fenceType','fenceHeight','terrainSlope','fenceRunCount','fenceRuns']);
  assert.deepEqual(fenceWizardFields(fields,true).map(f=>f.name),['linearFeet','lfMethod','fenceType','fenceHeight','terrainSlope','gates','fenceRunCount','cornerCount','closedRunCount']);
  assert.equal(fenceStartsTotalOnly({linearFeet:100}),true);assert.equal(fenceStartsTotalOnly({}),false);assert.equal(fenceStartsTotalOnly({linearFeet:100,fenceRuns:[]}),false);
  // A service with no section layout is untouched.
  const plain=[{name:'linearFeet',type:'number'},{name:'gateCount',type:'number'}];
  assert.deepEqual(fenceWizardFields(plain,false),plain);
});
