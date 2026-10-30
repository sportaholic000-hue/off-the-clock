import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {fixture,flooring,concrete,custom} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
import {editCarpetPriceUnit} from '../client/src/pricebookEditing.js';
import {carpetUnitPresentationCopy} from '../server/priceBookCopy.js';
import {synchronizeDependentLinesVNext,roofFlashingVentDefinitionVNext} from '../server/quote-engine-vnext/priceGroundwork.js';

// Fixes for the re-audit of commit 3a40e9dd (October 29-30, 2026). Every
// expected value was worked out by hand before the run, from the rule named
// beside it.
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const line=(q,name)=>(q.options?.[0]?.lineItems||[]).find(l=>l.name===name);
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.invalidOwnerFields]));assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');return q;};
const review=(f,pattern)=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(q.midEstimate));if(pattern)assert.match(q.reviewReason,pattern);return q;};

test('a custom materials share never changes which markup applies (R01)',()=>{
  // $1,000 custom add-on at cost, 20% markup. Markup follows the add-on category for the whole
  // price, whatever the share: 1,200.00 when add-on markup is on, 1,000.00 when it is off.
  for(const share of [undefined,0,40,100])for(const flags of ['addon','labor_material','all']){
    const f=custom();Object.assign(f.ownerPricing.pricing,{price:100000,customChargeClassification:'addon',...(share===undefined?{}:{installedMaterialsPercent:{price:share}})});
    for(const k of Object.keys(f.ownerPricing.priceBasisByCategory))f.ownerPricing.priceBasisByCategory[k]='cost';
    f.businessDefaults.markupPercent=20;
    for(const k of Object.keys(f.businessDefaults.markupApplies))f.businessDefaults.markupApplies[k]=flags==='all'||(flags==='addon'?k==='addon':['labor','material'].includes(k));
    assert.equal(cents(ready(f)),flags==='labor_material'?100000:120000,`share ${share}, markup on ${flags}`);
  }
});

test('installed prices are taxed on whichever portions the owner taxes (R02)',()=>{
  // $3,800 of installed painting prices, 60% labor and 40% materials, 10% tax.
  const job=(mode,taxed)=>{const f=offeringFixture('INTERIOR_PAINTING','installed');Object.assign(f.businessDefaults,{taxMode:mode,taxPercent:10});
    for(const k of Object.keys(f.ownerPricing.taxabilityByCategory))f.ownerPricing.taxabilityByCategory[k]=taxed.includes(k);return f;};
  // Everything taxed: 3,800 + 380 = 4,180.00.
  assert.equal(cents(ready(job('TAX_ALL',[]))),418000);
  // Materials only: 1,520 x 10% = 152 -> 3,952.00. Labor only: 2,280 x 10% = 228 -> 4,028.00.
  assert.equal(cents(ready(job('TAX_MATERIALS',['material']))),395200);
  assert.equal(cents(ready(job('TAX_MATERIALS',['labor']))),402800);
  // Both: 380 -> 4,180.00, the same as taxing everything.
  assert.equal(cents(ready(job('TAX_MATERIALS',['labor','material']))),418000);
  // Neither: 3,800.00.
  assert.equal(cents(ready(job('TAX_MATERIALS',[]))),380000);
});

test('carpet prices change unit with the carpet price unit, converted exactly (R03)',()=>{
  const service={serviceType:'FLOORING_INSTALL',pricing:{laborPerSqft:{carpet:300,tile:400},materialPerSqft:{carpet:300,tile:500}}};
  // 3.00 per square foot is 27.00 per square yard; tile stays per square foot.
  const yards=editCarpetPriceUnit(service,'square_yard');
  assert.deepEqual([yards.pricing.carpetPriceUnit,yards.pricing.laborPerSqft,yards.pricing.materialPerSqft],['square_yard',{carpet:2700,tile:400},{carpet:2700,tile:500}]);
  // Back to square feet: 27.00 / 9 = 3.00 exactly.
  const feet=editCarpetPriceUnit(yards,'square_foot');
  assert.deepEqual([feet.pricing.laborPerSqft,feet.pricing.materialPerSqft],[{carpet:300,tile:400},{carpet:300,tile:500}]);
  // 27.01 per square yard is not a whole number of cents per square foot: cleared for re-entry.
  const odd=editCarpetPriceUnit({serviceType:'FLOORING_INSTALL',pricing:{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:2701,tile:400}}},'square_foot');
  assert.deepEqual(odd.pricing.laborPerSqft,{tile:400});
  // The rate fields say per square yard for carpet.
  const copy=carpetUnitPresentationCopy({field:'laborPerSqft',label:'Labor price per square foot by flooring type',tree:{leafUnit:'$ per sq ft'}},'FLOORING_INSTALL',{carpetPriceUnit:'square_yard'});
  assert.match(copy.label,/carpet per square yard/);assert.equal(copy.tree.leafUnitByKey.carpet,'$ per sq yd');
});

function seamRoof(customer={},pricing={}){
  const product='meridian_seam';
  const p=Object.fromEntries(Object.entries({laborPerSquare:20000,materialCostPerSquare:15000,tearOffPerSquare:6000,underlaymentPerSquare:2000,underlaymentPriceBasis:'installed_area_sell_price'}).map(([k,v])=>[k,{[product]:v}]));
  const f=fixture('ROOFING_REPLACEMENT',{...p,disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,roofProductClass:{[product]:'standing_seam_metal'},
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70,...pricing},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:product,replacementRoofType:product,pitchMethod:'whole_roof',pitchBand:'under_four',pitchRisePer12:1,stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',...customer});
  for(const [k,v] of Object.entries(pricing))if(v===undefined)delete f.ownerPricing.pricing[k];
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  const facts={};
  for(const field of ['existingRoofType','replacementRoofType']){const id=randomUUID();f.ownerPricing.knownOfferings[field]={...f.ownerPricing.knownOfferings[field],[product]:id};facts[field]={status:'identified',field,value:product,offeringId:id};}
  f.customerInputs.confirmedFacts={...f.customerInputs.confirmedFacts,...facts};
  return f;
}
test('a roofing product quotes only on the manufacturer minimum slope the owner enters (R04)',()=>{
  // Standing seam with no manufacturer minimum entered: the owner is asked, and the service is not live.
  const blank=seamRoof({},{roofProductMinSlope:undefined});
  assert.ok(review(blank).missingOwnerFields.includes('roofProductMinSlope.meridian_seam'));
  assert.equal(vNextServiceStatus(blank.ownerPricing,blank.businessDefaults).status,'NEEDS PRICING');
  // A product whose maker requires 3/12: a 1/12 roof goes to review, a 3/12 roof quotes at 9,500.00.
  review(seamRoof({},{roofProductMinSlope:{meridian_seam:3}}),/3\/12 or steeper/);
  assert.equal(cents(ready(seamRoof({pitchRisePer12:3},{roofProductMinSlope:{meridian_seam:3}}))),950000);
  // The IRC floor (1/4:12) still governs a maker figure below it.
  review(seamRoof({pitchRisePer12:0.2},{roofProductMinSlope:{meridian_seam:0.1}}),/1\/4\/12 or steeper|0\.25\/12 or steeper/);
});

test('a whole-roof self-adhered membrane covers the eaves; no second barrier is charged (R05)',()=>{
  // 2,000 sq ft of 3/12 asphalt shingles, itemized accessories with flashing and vents outside the field price.
  const low=(customer={},pricing={})=>{
    const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},
      underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,minimumJob:0,
      accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories_flashing_vents',iceWaterBarrierUnit:'linear_feet',iceWaterBarrierPerLF:300,
      roofProductMinSlope:{asphalt_shingle:2},lowSlopeAssembly:'self_adhered_underlayment',selfAdheredUnderlaymentPerSquare:4500,...pricing},
     {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitchMethod:'whole_roof',pitchBand:'under_four',pitchRisePer12:3,
      stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',iceWaterBarrierLengthLF:0,valleyLengthLF:0,stepFlashingLengthLF:0,pipeJackCount:0,ridgeVentLengthLF:0,
      starterLengthLF:0,dripEdgeLengthLF:0,ridgeCapLengthLF:0,...customer});
    f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
    Object.assign(f.ownerPricing.pricing,{pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70});
    const dependent=roofFlashingVentDefinitionVNext('asphalt_shingle');
    f.ownerPricing=synchronizeDependentLinesVNext(f.ownerPricing,[dependent],{ownerId:f.ownerPricing.origin.ownerId,reenteredIds:[dependent.id],confirmIds:[dependent.id],now:'2026-10-30T12:00:00.000Z'});
    return f;
  };
  // Labor 4,000 + field material 22 x 150 = 3,300 + tear-off 1,200 + disposal 600 + 20 x 45.00
  // self-adhered = 900: 10,000.00, whether eave protection is required or not, and with 40 ft
  // of barrier measured: the whole-roof membrane is the eave protection.
  for(const required of ['yes','no'])for(const lf of [0,40]){
    const q=ready(low({iceWaterBarrierLengthLF:lf},{eaveProtectionRequired:required}));
    assert.equal(cents(q),1000000,`${required} ${lf}`);assert.equal(line(q,'Ice and water barrier'),undefined);
    if(lf)assert.match(q.disclaimer,/self-adhered underlayment over the whole roof also protects the eaves/);
  }
  // Two underlayment layers instead: the barrier is its own work, 40 x 3.00 = 120.00.
  assert.equal(line(ready(low({iceWaterBarrierLengthLF:40},{eaveProtectionRequired:'yes',lowSlopeAssembly:'double_underlayment'})),'Ice and water barrier').amountCents,12000);
});

test('a narrow leg of an L-shaped slab goes to review (R19)',()=>{
  const outline=points=>({dimensionMethod:'measured_outline',outlinePoints:[...points,points[0]]});
  const slab=customer=>{const f=concrete();delete f.customerInputs.length;delete f.customerInputs.width;Object.assign(f.customerInputs,customer);return f;};
  // Two 8 ft legs, each 0.5 ft wide.
  review(slab(outline([{x:0,y:0},{x:8,y:0},{x:8,y:0.5},{x:0.5,y:0.5},{x:0.5,y:8},{x:0,y:8}])),/narrower than 1 foot/);
  // The same L with 1 ft legs quotes.
  ready(slab(outline([{x:0,y:0},{x:8,y:0},{x:8,y:1},{x:1,y:1},{x:1,y:8},{x:0,y:8}])));
});

test('hard floors can be measured room by room; each room takes its own labor band (R11)',()=>{
  // 440 sq ft of tile at 3.00 labor. Total area for 2 rooms: average 220 sq ft, medium 1.10:
  // 484 x 3.00 = 1,452.00, with the equal-size assumption stated.
  const total=flooring('tile',440);total.customerInputs.roomCount=2;
  let q=ready(total);
  assert.equal(line(q,'Flooring labor').amountCents,145200);
  assert.match(q.disclaimer,/Labor assumes the 2 rooms are about the same size \(about 220 square feet each\)/);
  // Measured rooms: 5 x 8 (40 sq ft, small 1.20) = 48; 20 x 20 (400, large 1.00) = 400 above
  // its floors 180 and 330. 448 x 3.00 = 1,344.00; no assumption to state.
  const rooms=flooring('tile',440);delete rooms.customerInputs.sqft;delete rooms.customerInputs.roomCount;delete rooms.customerInputs.sqftMethod;
  rooms.customerInputs.floorRooms=[{lengthFt:5,widthFt:8},{lengthFt:20,widthFt:20}];
  q=ready(rooms);
  assert.equal(line(q,'Flooring labor').amountCents,134400);
  assert.doesNotMatch(q.disclaimer,/about the same size/);
  // A stated total that disagrees with the rooms goes to review.
  rooms.customerInputs.sqft=400;review(rooms,/must agree with the supplied room measurements/);
  // One room: nothing to assume.
  const one=flooring('tile',440);one.customerInputs.roomCount=1;assert.doesNotMatch(ready(one).disclaimer,/about the same size/);
  // The customer form offers the room method for hard floors.
  const contract=customerContractForVNext('FLOORING_INSTALL',total.ownerPricing.pricing,total.ownerPricing);
  assert.equal(contract.fields.floorRooms.type,'carpet_rooms');
  assert.deepEqual(contract.fields.floorMeasurementMethod.values,['room_dimensions','total_area']);
});

test('cost-priced materials need a package size or the owner\'s exact-quantity choice (R12)',()=>{
  // 200 sq ft of tile at cost, no carton coverage: review until the owner decides.
  const tile=pricing=>{const f=flooring('tile',200);f.ownerPricing.priceBasisByCategory.material='cost';delete f.ownerPricing.pricing.partialPackagePricing;Object.assign(f.ownerPricing.pricing,pricing);return f;};
  assert.deepEqual(review(tile(),/package size/).missingOwnerFields,['cartonCoverageSqft.tile']);
  // Exact quantity chosen: 1,780.00 as before. Cartons of 23.64 sq ft: 200 x 1.10 = 220 -> 10 cartons = 236.4 sq ft.
  assert.equal(ready(tile({partialPackagePricing:'exact_quantity'})).midEstimate,1780);
  assert.equal(line(ready(tile({cartonCoverageSqft:{tile:23.64}})),'Flooring materials').calculation.quantity,236.4);
  // A selling-rate material price is the owner's own rate: no package size needed.
  const sell=tile();sell.ownerPricing.priceBasisByCategory.material='sell_price';ready(sell);
  // Ready-mix: 20 x 10 x 4 in slab, order increment blank.
  const slab=pricing=>{const f=concrete();f.ownerPricing.priceBasisByCategory.material='cost';delete f.ownerPricing.pricing.partialPackagePricing;Object.assign(f.ownerPricing.pricing,pricing);return f;};
  assert.deepEqual(review(slab()).missingOwnerFields,['readyMixOrderIncrementCubicYards']);
  // 2.716 yd rounds to 3.0 yd at 0.5 yd increments: 3 x 180 = 540.00 instead of 488.89 -> 3,590.00.
  assert.equal(ready(slab({readyMixOrderIncrementCubicYards:0.5})).midEstimate,3590);
  // The service is not live while the decision is open.
  const open=tile();assert.equal(vNextServiceStatus(open.ownerPricing,open.businessDefaults).status,'NEEDS PRICING');
});

test('a concrete quote states the mix and reinforcement its prices are for (R13)',()=>{
  const slab=(customer={},pricing={})=>{const f=concrete();Object.assign(f.customerInputs,customer);Object.assign(f.ownerPricing.pricing,pricing);for(const [k,v] of Object.entries(pricing))if(v===undefined)delete f.ownerPricing.pricing[k];return f;};
  assert.ok(review(slab({},{concreteMixDescription:undefined})).missingOwnerFields.includes('concreteMixDescription'));
  const mesh=slab({reinforcement:'wire_mesh'},{wireReinforcementPerSqft:50,wireMeshDescription:undefined});
  assert.ok(review(mesh).missingOwnerFields.includes('wireMeshDescription'));
  const q=ready(slab({reinforcement:'rebar'},{rebarReinforcementPerSqft:90,concreteMixDescription:'32 MPa air-entrained',rebarDescription:'#3 (10M) bars at 18 in. each way on chairs'}));
  const c=sanitizeForCustomerVNext(q);
  assert.ok(c.priceDrivers.includes('Concrete mix: 32 MPa air-entrained'));
  assert.ok(c.priceDrivers.includes('Reinforcement: #3 (10M) bars at 18 in. each way on chairs'));
  // Rebar on 200 sq ft plus the owner's 10% material waste: 220 x 0.90 = 198.00 on the
  // 3,538.89 slab -> 3,736.89.
  assert.equal(line(q,'Rebar reinforcement').calculation.quantity,220);
  assert.equal(q.midEstimate,3736.89);
  // A blank mix keeps the service from going live.
  const blank=slab({},{concreteMixDescription:undefined});
  assert.ok(vNextServiceStatus(blank.ownerPricing,blank.businessDefaults).missingOwnerFields.includes('concreteMixDescription'));
});
