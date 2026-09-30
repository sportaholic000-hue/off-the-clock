import {fixtureIdentity,fixtureOfferings,confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
import {withClass2Defaults,PRICE_BASIS_CATEGORIES} from '../../server/quote-engine-vnext/index.js';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
const map=v=>Object.fromEntries(PRICE_BASIS_CATEGORIES.map(k=>[k,v]));
export const defaults={markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(true),peakMonths:[],peakSurchargePercent:0};
export function fixture(type,p,c){
 const ownerPricing={...fixtureIdentity('MANUAL',undefined,type),knownOfferings:fixtureOfferings(type),active:true,serviceType:type,service:'[SYNTHETIC] '+type,pricing:withClass2Defaults(type,p),feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:map('cost'),taxabilityByCategory:map(false),peakMonths:[],peakSurchargePercent:0};
 return {serviceType:type,customerInputs:confirmedFixtureInputs(c),ownerPricing,businessDefaults:structuredClone(defaults),callerType:'owner',currentMonth:1};
}
export const mowing=()=>fixture('LANDSCAPING_MOWING',{mowingBaseRatePerSqft:2,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1.2,monthly:1.5,one_time:1.8},overgrowthMultipliers:{maintained:1,overgrown:1.5,severe:2}},{yardSqft:5000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false});
export const flatRepair=()=>fixture('FLAT_ROOF_REPAIR',{laborHourlyRate:10000,repairMinimum:0,patchRepairHours:{epdm:{seam_patch:{small:3,medium:5,large:8}}},patchMaterialAllowance:{epdm:{seam_patch:{small:6000,medium:9000,large:14000}}}},{repairType:'seam_patch',affectedArea:10,membraneType:'epdm',leakPresent:false,pondingWater:false});
export const flooring=(type='tile',sqft=200)=>fixture('FLOORING_INSTALL',{laborPerSqft:{[type]:300},materialPerSqft:{[type]:500},minimumJob:0,vinylPlankUnderlaymentRule:'never_included',perStepPrice:10000},{sqft,sqftMethod:'exact',newFlooringType:type,existingFloorType:'none',removalNeeded:false,roomCount:1,layoutPattern:'straight',stairSteps:0});
export const siding=()=>fixture('SIDING_REPLACEMENT',{laborPerSqft:{vinyl:400},materialPerSqft:{vinyl:700},minimumJob:0,removalPerSqft:100,trimPerLinearFoot:100},{areaInputMethod:'sqft',sidingAreaSqft:1000,sidingType:'vinyl',stories:1,oldSidingRemoval:false,trimIncluded:false});
export const concrete=()=>fixture('CONCRETE_PATIO_SLAB',{laborPerSqft:600,concreteCostPerCubicYard:18000,formworkPerLF:2500,minimumJob:0,basePrepPerSqft:175,demolitionPerSqft:300,wireReinforcementPerSqft:150,rebarReinforcementPerSqft:200,stampedMaterialPerSqft:300},{dimensionMethod:'exact',length:20,width:10,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:true});
export const flatRoof=()=>fixture('FLAT_ROOF_REPLACEMENT',{laborPerSqft:{epdm:500},membraneCostPerSqft:{epdm:700},tearOffPerSqft:{epdm:200},insulationPerSqft:250,minimumJob:0},{roofSqft:1000,sqftMethod:'exact',membraneType:'epdm',replacementMembraneType:'epdm',existingLayers:1,accessDifficulty:'easy',serviceScope:'full',buildingType:'residential'});
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
 add('floor-tile-150-boundary',flooring('tile',150),{ready:true,cents:133500},'Spec 150 <= average <300 is medium:150*300*1.10 +150*1.12*500=133500.');
 add('floor-tile-300-boundary',flooring('tile',300),{ready:true,cents:258000},'Spec average >=300 is large:300*300+300*1.12*500=258000.');
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
 add('flat-roof-residential-control',flatRoof(),{ready:true,cents:1400000},'1000*(500+700+200)=1400000.');
 f=flatRoof();f.customerInputs.buildingType='commercial';add('flat-roof-commercial',f,{ready:true},'Capability check: insulation price configured but required insulation-system scope cannot be entered.');
 for(const [type,mode,cents] of [['FENCING_INSTALL','installed',450000],['FENCING_INSTALL','itemized',392000],['FENCING_REPLACEMENT','installed',490000],['FENCING_REPLACEMENT','itemized',432000],['INTERIOR_PAINTING','installed',380000],['INTERIOR_PAINTING','itemized',252400],['EXTERIOR_PAINTING','installed',300000],['EXTERIOR_PAINTING','itemized',179400]]){
   f=offeringFixture(type,mode);add(type+'-'+mode+'-control',f,{ready:true,cents},'Independently calculated cents captured in expected-controls.md.');
 }
 f=offeringFixture('INTERIOR_PAINTING','itemized');f.ownerPricing.priceBasisByCategory.material='cost';add('painting-itemized-cost-basis',f,{ready:true},'Capability check: material cost classification is selectable but cannot complete the purchase-rule requirement.');
 return out;
}

