import {fixtureIdentity,fixtureOfferings,confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
import {withClass2Defaults,PRICE_BASIS_CATEGORIES} from '../../server/quote-engine-vnext/index.js';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {withOwnerDecisions} from '../../test/ownerDecisionsFixture.mjs';
const map=v=>Object.fromEntries(PRICE_BASIS_CATEGORIES.map(k=>[k,v]));
export const defaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
export function fixture(type,p,c){
 const ownerPricing={...fixtureIdentity('MANUAL',undefined,type),knownOfferings:fixtureOfferings(type),active:true,serviceType:type,service:'[SYNTHETIC] '+type,pricing:withClass2Defaults(type,withOwnerDecisions(type,p)),feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:map('cost'),taxabilityByCategory:map(false),peakMonths:[],peakSurchargePercent:0};
 return {serviceType:type,customerInputs:confirmedFixtureInputs(c),ownerPricing,businessDefaults:structuredClone(defaults),callerType:'owner',currentMonth:1};
}
export const mowing=()=>fixture('LANDSCAPING_MOWING',{mowingBaseRatePerSqft:2,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1.2,monthly:1.5,one_time:1.8},overgrowthMultipliers:{maintained:1,overgrown:1.5,severe:2}},{yardSqft:5000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false});
export const flatRepair=()=>fixture('FLAT_ROOF_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1000000,patchRepairHours:{epdm:{seam_patch:{small:3,medium:5,large:8}}},patchMaterialAllowance:{epdm:{seam_patch:{small:6000,medium:9000,large:14000}}}},{repairType:'seam_patch',affectedArea:10,membraneType:'epdm',leakPresent:false,pondingWater:false,accessDifficulty:'easy'});
// Lane D fix D1 (November 19, 2026): new tile asks what the floor is built on.
// This fixture's tile is laid on a concrete slab, which needs no backer board,
// so its prices are the same as before the question existed.
export const TILE_ON_CONCRETE_SLAB=Object.freeze({floorConstructionKnown:'yes',floorSupportConstruction:'concrete_slab'});
// Lane D fix D3 (November 19, 2026): carpet is bought from room sizes. This
// fixture's 200 sq ft of carpet is one 10 ft by 20 ft room on a 13.75 ft roll
// with crossgrain fills: 20.5 ft across is one 13.75 ft width cut 10.5 ft long
// (144.375 sq ft) plus a 6.75 ft fill split into 2 strips cut (10 + 2*0.5)/2 =
// 5.5 ft long (75.625 sq ft) = 220 sq ft bought, the same as 200 x 1.10 before.
export const CARPET_ROOM_220=Object.freeze({rooms:[{lengthFt:10,widthFt:20}],pricing:{carpetRollWidthFt:13.75,carpetCrossgrainSeams:'allowed'}});
const carpetRoom=(type,sqft)=>type==='carpet'&&sqft===200;
export const flooring=(type='tile',sqft=200)=>fixture('FLOORING_INSTALL',{laborPerSqft:{[type]:300},materialPerSqft:{[type]:500},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',perStepPrice:10000,...(carpetRoom(type,sqft)?CARPET_ROOM_220.pricing:{})},{sqft,sqftMethod:'exact',newFlooringType:type,existingFloorType:'none',removalNeeded:false,roomCount:1,layoutPattern:'straight',stairSteps:0,...(type==='tile'?TILE_ON_CONCRETE_SLAB:{}),...(carpetRoom(type,sqft)?{carpetRooms:structuredClone(CARPET_ROOM_220.rooms)}:{})});
export const siding=()=>fixture('SIDING_REPLACEMENT',{laborPerSqft:{vinyl:400},materialPerSqft:{vinyl:700},minimumJob:0,removalPerSqft:100,trimPerLinearFoot:100},{areaInputMethod:'sqft',sidingAreaSqft:1000,sidingType:'vinyl',stories:1,oldSidingRemoval:false,trimIncluded:false});
export const concrete=()=>fixture('CONCRETE_PATIO_SLAB',{laborPerSqft:600,concreteCostPerCubicYard:18000,formworkPerLF:2500,minimumJob:0,slabLaborMinThicknessInches:2,slabLaborMaxThicknessInches:24,formingLaborPricing:'included_in_slab_labor',basePrepPerSqft:175,demolitionPerSqft:300,wireReinforcementPerSqft:150,rebarReinforcementPerSqft:200,stampedMaterialPerSqft:300},{dimensionMethod:'exact',length:20,width:10,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:true});
// Roof details without their own price are confirmed and priced on site.
const FLAT_ROOF_ON_SITE={flatRoofEdgeMetalPerLF:'priced_on_site',flatRoofWallFlashingPerLF:'priced_on_site',flatRoofPenetrationEach:'priced_on_site',flatRoofCurbEach:'priced_on_site',flatRoofDrainEach:'priced_on_site',flatRoofDeckPerSheet:'priced_on_site'};
export const flatRoof=()=>fixture('FLAT_ROOF_REPLACEMENT',{laborPerSqft:{epdm:500},membraneCostPerSqft:{epdm:700},tearOffPerSqft:{epdm:200},insulationPerSqft:250,minimumJob:0,flatRoofItemBasis:{...FLAT_ROOF_ON_SITE}},{roofSqft:1000,sqftMethod:'exact',membraneType:'epdm',replacementMembraneType:'epdm',existingLayers:1,accessDifficulty:'easy',serviceScope:'full',buildingType:'residential'});
export const custom=()=>{const f=fixture('CUSTOM',{customPricingMode:'fixed',customChargeClassification:'labor',price:12500,unit:'flat',minimumJob:0},{service:'[SYNTHETIC] Fixed service',serviceConfirmed:true,unit:'flat'});f.ownerPricing.service=f.customerInputs.service;f.ownerPricing.priceBasisByCategory=map('sell_price');return f;};
export function cases(){
 const out=[];
 const add=(id,input,expected,note)=>out.push({id,input,expected,note});
 add('mowing-control',mowing(),{ready:true,cents:10000},'5000 sqft * 2 cents = 10000 cents.');
 let f=mowing();f.customerInputs.bagClippings=true;add('mowing-unpriced-bagging',f,{ready:true,cents:10000,excluded:'bagging'},'Spec ADDON policy: quote main work, preserve/exclude unpriced bagging.');
 f=mowing();f.customerInputs.edgingIncluded=true;f.customerInputs.edgingLengthLF=100;add('mowing-unpriced-edging',f,{ready:true,cents:10000,excluded:'edging'},'Spec ADDON policy: quote main work, preserve/exclude unpriced edging.');
 f=mowing();f.customerInputs.bagClippings=true;f.customerInputs.edgingIncluded=true;f.customerInputs.edgingLengthLF=100;Object.assign(f.ownerPricing.pricing,{baggingSurchargePercent:10,edgingPerLinearFoot:50});add('mowing-priced-extras-control',f,{ready:true,cents:16000},'10000 + 10% bagging 1000 + 100 LF * 50 = 16000.');
 add('flat-repair-control',flatRepair(),{ready:true,cents:36000},'3 hours * 10000 + 6000 material = 36000.');
 f=flatRepair();f.customerInputs.pondingWater=true;add('flat-repair-unpriced-ponding',f,{ready:true,cents:36000,excluded:'ponding'},'Spec ADDON policy: quote main repair, disclose excluded ponding treatment.');
 f=flatRepair();f.customerInputs.pondingWater=true;f.ownerPricing.pricing.pondingWaterSurcharge=7000;add('flat-repair-priced-ponding-control',f,{ready:true,cents:43000},'36000 + 7000 = 43000.');
 add('floor-tile-200-control',flooring(),{ready:true,cents:178000},'200*300*1.10 labor + 200*1.12*500 material = 178000.');
 add('floor-tile-150-boundary',flooring('tile',150),{ready:true,cents:138000},'Inclusive small maximum:150*300*1.20 +150*1.12*500=138000.');
 add('floor-tile-300-boundary',flooring('tile',300),{ready:true,cents:267000},'Inclusive medium maximum:300*300*1.10+300*1.12*500=267000.');
 for(const [type,amount] of [['tile',178000],['vinyl_plank',174000],['hardwood',171000],['laminate',174000],['carpet',171000]]){
   f=flooring(type);add('floor-type-'+type,f,{ready:true,...(['tile','vinyl_plank'].includes(type)?{cents:amount}:{})},'Capability check: configured material/labor/waste + measured inputs; do not invent missing underlayment rules.');
 }
 f=flooring();f.customerInputs.stairSteps=5;add('floor-stairs',f,{ready:true},'Capability check: 5 measured steps and configured perStepPrice, but no supported way to define complete stair inclusions.');
 add('custom-flat',custom(),{ready:true,cents:12500},'Fixed installed selling price12500, tax0/markup0/min0 =>12500.');
 for(const [unit,quantity,cents] of [['per_hour',{hours:1.5},18750],['per_unit',{itemCount:3},37500],['per_sqft',{areaSqft:2.5},31250],['per_LF',{linearFeet:10.25},128125],['per_square',{roofSquares:2.5},31250]]){
   f=custom();Object.assign(f.ownerPricing.pricing,{unit});Object.assign(f.customerInputs,{unit,...quantity});add('custom-fixed-'+unit,f,{ready:true,cents},'12500 cents per explicitly measured unit; independent quantity multiplication.');
 }
 f=custom();Object.assign(f.ownerPricing.pricing,{unit:'per_sqft',price:0.5});Object.assign(f.customerInputs,{unit:'per_sqft',areaSqft:1000});add('custom-fixed-fractional-rate',f,{ready:true,cents:500},'1000 square feet at 0.5 cents/sqft =>500 cents.');
 f=custom();Object.assign(f.ownerPricing.pricing,{customPricingMode:'range',low:10000,high:20000});delete f.ownerPricing.pricing.price;add('custom-range-flat',f,{ready:true,cents:15000},'One service with configured low10000 high20000 => midpoint15000; full scenario range10000–20000.');
 f=custom();f.ownerPricing.pricing.customChargeClassification='labor';add('custom-classification-attempt',f,{ready:true},'Try exactly the missing field named by the engine; demonstrate whether the owner can resolve its diagnostic.');
 add('siding-base-control',siding(),{ready:true,cents:1170000},'1000*400 labor +1000*1.10*700 material=1170000.');
 f=siding();f.customerInputs.trimIncluded=true;f.customerInputs.trimLengthLF=200;add('siding-trim',f,{ready:true},'Capability check: measured trim and configured trimPerLinearFoot; no offered charge-allocation field.');
 f=siding();f.customerInputs.oldSidingRemoval=true;add('siding-removal',f,{ready:true},'Capability check: selected configured removal; input form cannot collect the old-siding facts its engine now requires.');
 add('concrete-base-control',concrete(),{ready:true,cents:353889},'Labor120000+round(200*4/324*1.10*18000)=48889+60LF*2500=150000+prep35000=>353889.');
 f=concrete();f.customerInputs.demolitionNeeded=true;f.customerInputs.demolitionAreaSqft=200;add('concrete-demolition',f,{ready:true},'Capability check: measured 200 sqft demolition and configured rate; no offered old-slab detail fields to resolve the refusal.');
 f=concrete();f.customerInputs.finishType='exposed_aggregate';add('concrete-exposed-aggregate',f,{ready:true},'Capability check: selectable finish with no supported material/all-in finish configuration.');
 add('flat-roof-residential-control',flatRoof(),{ready:true,cents:1470000},'1000*500 labor + 1000*700*1.10 membrane with 10% waste + 1000*200 tear-off = 1470000.');
 f=flatRoof();f.customerInputs.buildingType='commercial';add('flat-roof-commercial',f,{ready:true},'Capability check: insulation price configured but required insulation-system scope cannot be entered.');
 for(const [type,mode,cents] of [['FENCING_INSTALL','installed',450000],['FENCING_INSTALL','itemized',424000],['FENCING_REPLACEMENT','installed',490000],['FENCING_REPLACEMENT','itemized',464000],['INTERIOR_PAINTING','installed',380000],['INTERIOR_PAINTING','itemized',328700],['EXTERIOR_PAINTING','installed',318000],['EXTERIOR_PAINTING','itemized',247500]]){
   f=offeringFixture(type,mode);add(type+'-'+mode+'-control',f,{ready:true,cents},'Independently calculated cents; the line-by-line arithmetic is in test/qeAuditBuild20261028.spec.mjs.');
 }
 f=offeringFixture('INTERIOR_PAINTING','itemized');f.ownerPricing.priceBasisByCategory.material='cost';add('painting-itemized-cost-basis',f,{ready:true},'Capability check: material cost classification is selectable but cannot complete the purchase-rule requirement.');
 return out;
}

// Lane D fixes D1 and D3 (November 19, 2026), for frozen inputs recorded before
// the questions existed: new tile laid on the floor construction (no old floor,
// or a non-wood old floor removed) is answered as a concrete slab (no backer,
// prices unchanged); a 200 sq ft carpet total area is given as the 10 ft by 20 ft
// room of CARPET_ROOM_220, which buys the same 220 sq ft. Returns a copy.
export function withLaneDAnswers(input){
  const f=structuredClone(input),c=f.customerInputs||{},p=f.ownerPricing?.pricing;
  if(!String(f.serviceType).startsWith('FLOORING_'))return f;
  const woodRemoved=c.removalNeeded===true&&['hardwood','solid_hardwood','engineered_hardwood','oak','maple'].includes(c.existingFloorType);
  if(c.newFlooringType==='tile'&&(c.existingFloorType==='none'||c.removalNeeded===true)&&c.floorConstructionKnown===undefined&&c.floorSupportConstruction===undefined&&c.woodFloorAssembly===undefined)
    Object.assign(c,woodRemoved?{floorConstructionKnown:'yes',woodFloorAssembly:'glued_to_concrete'}:TILE_ON_CONCRETE_SLAB);
  if(c.newFlooringType==='carpet'&&c.carpetRooms===undefined&&c.sqft===200&&p){
    c.carpetRooms=structuredClone(CARPET_ROOM_220.rooms);delete c.carpetMeasurementMethod;
    Object.assign(p,CARPET_ROOM_220.pricing);
  }
  return f;
}
