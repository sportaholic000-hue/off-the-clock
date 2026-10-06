import '../../../test/pricebookTestEnv.mjs';
import {randomUUID} from 'node:crypto';
import {fixture, flooring} from '../../../verification/engine-independent/fixtures.mjs';
import {includedFixture, explicitUnderlaymentFixtureShares} from '../../../test/quoteEngineVNextFixtures.mjs';
import {offeringFixture} from '../../../test/configuredOfferingsFixtures.mjs';
export {fixture, offeringFixture, includedFixture};
export const map=(n,value)=>Object.fromEntries(Array.from({length:n},(_,i)=>['product_'+i,typeof value==='function'?value(i):value]));
export function floor(sqft=200,roomCount=1) {
 const f=flooring('tile',sqft),p=f.ownerPricing.pricing;
 delete p.perStepPrice; p.laborPerSqft.tile=100;p.materialPerSqft.tile=100;p.wasteFactorByType.tile=0;
 f.customerInputs.roomCount=roomCount;return f;
}
export function roof(n=1,{included=false,shares=true}={}) {
 const p={laborPerSquare:map(n,5000),materialCostPerSquare:map(n,10000),tearOffPerSquare:map(n,2000),underlaymentPerSquare:map(n,included?0:100),underlaymentPriceBasis:map(n,'installed_area_sell_price'),minimumJob:0,accessoryPricingMode:'per_square_allin',wasteFactorByComplexity:{simple:0,moderate:0,complex:0},pitchMultiplier:{low:1,medium:1,steep:1,very_steep:1},storyMultiplier:{1:1,2:1,3:1}};
 explicitUnderlaymentFixtureShares('ROOFING_REPLACEMENT',p);if(!shares)delete p.installedMaterialsPercent;
 const f=fixture('ROOFING_REPLACEMENT',p,{roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'product_0',replacementRoofType:'product_0',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
 f.ownerPricing.priceBasisByCategory.material='sell_price';
 f.ownerPricing.knownOfferings=Object.fromEntries(['existingRoofType','replacementRoofType'].map(field=>[field,map(n,()=>randomUUID())]));
 if(included)f.ownerPricing=includedFixture(f.ownerPricing,Object.fromEntries(Object.keys(p.underlaymentPerSquare).map(key=>['underlaymentPerSquare.'+key,'materialCostPerSquare.'+key])));
 return select(f,'product_0');
}
export function select(f,replacement,existing=replacement) {
 const c=structuredClone(f.customerInputs);c.replacementRoofType=replacement;c.existingRoofType=existing;
 c.confirmedFacts=Object.fromEntries(['replacementRoofType','existingRoofType'].map(field=>[field,{status:'identified',field,value:c[field],offeringId:f.ownerPricing.knownOfferings[field][c[field]]}]));
 return {...f,customerInputs:c};
}
export const product=(productKey,coverage=250)=>({description:'[SYNTHETIC] exact paint product',mode:'package_cost',productKey,coverage,wastePercent:0});
export function paint(grouped=true) {
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:1,ceilingLaborPerSqftPerCoat:100,ceilingMaterialPerSqftPerCoat:1,trimLaborPerLF:100,trimMaterialPerLF:1,minimumJob:0,scopeDetails:{paint_wall:product('finish'),paint_ceiling:product(grouped?'finish':'ceiling'),paint_prep:product('prep')},scopeRates:{paint_wall:5000,paint_ceiling:5000,paint_prep:0}},{areaInputMethod:'wall_sqft',wallAreaSqft:100,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:1,ceilingsIncluded:true,ceilingAreaSqft:100,ceilingCoats:1,trimIncluded:false,paintProductsConfirmed:true});
 return f;
}
export function fence(){
 const f=offeringFixture('FENCING_INSTALL','installed');f.customerInputs.gates={};
 f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;
 delete f.ownerPricing.pricing.installedMaterialsPercent['offeringRates.gate_walk'];return f;
}
export function cleanup(){return fixture('LANDSCAPING_CLEANUP',{cleanupBaseRatePerSqft:100,minimumServiceCharge:0,debrisPricing:{light:{laborMultiplier:1,disposalFlat:2000},moderate:{laborMultiplier:1,disposalFlat:2000},heavy:{laborMultiplier:1,disposalFlat:2000}}},{yardSqft:100,sqftMethod:'exact',debrisLevel:'light',slope:'flat',haulAway:false});}
export function slab(){return fixture('CONCRETE_PATIO_SLAB',{laborPerSqft:100,concreteCostPerCubicYard:8100,formworkPerLF:100,minimumJob:0,concreteWasteFactor:0},{dimensionMethod:'exact',length:10,width:10,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:false});}
export const demolition=(low=0,high=4)=>({description:'[SYNTHETIC] demolition including haul-away',mode:'installed',category:'removal',minimumThickness:low,maximumThickness:high,reinforcement:'none',accessDifficulty:'easy',disposalIncluded:true});
export const stairs=(low=0,high=3)=>({description:'[SYNTHETIC] installed tile stairs',mode:'installed',category:'labor',flooringType:'tile',minimumWidthLF:low,maximumWidthLF:high,underlaymentIncluded:false,removalIncluded:false,disposalIncluded:false});
