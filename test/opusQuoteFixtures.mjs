import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
export const sourceRoot=process.env.OPUS_SOURCE_ROOT||fileURLToPath(new URL('..',import.meta.url));
export const engine=await import(pathToFileURL(path.join(sourceRoot,'server/quote-engine-vnext/index.js')).href);
const {fixtureIdentity,fixtureOfferings,confirmedFixtureInputs}=await import(pathToFileURL(path.join(sourceRoot,'test/quoteEngineVNextFixtures.mjs')).href);
const {offeringFixture}=await import(pathToFileURL(path.join(sourceRoot,'test/configuredOfferingsFixtures.mjs')).href);
const {measuredScopeCases}=await import(pathToFileURL(path.join(sourceRoot,'test/measuredScopeFixtures.mjs')).href);
const {scopeRequiredCustomer}=await import(pathToFileURL(path.join(sourceRoot,'server/scopeConfiguration.js')).href);
const map=(keys,value)=>Object.fromEntries(keys.map(k=>[k,value]));
export const defaults=()=>({markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:map(engine.PRICE_BASIS_CATEGORIES,true),peakMonths:[],peakSurchargePercent:0});
function owner(type,prices){
 const p=engine.withClass2Defaults(type,prices);
 if(type==='ROOFING_REPLACEMENT')p.underlaymentPriceBasis={asphalt_shingle:'installed_area_sell_price'};
 return {...fixtureIdentity('MANUAL',undefined,type),serviceType:type,service:'[SYNTHETIC] '+type,active:true,knownOfferings:fixtureOfferings(type),pricing:p,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:map(engine.PRICE_BASIS_CATEGORIES,'cost'),taxabilityByCategory:Object.fromEntries(engine.TAXABILITY_CATEGORIES.map(k=>[k,k==='material'])),peakMonths:[],peakSurchargePercent:0};
}
function request(type,inputs,prices){return {serviceType:type,customerInputs:confirmedFixtureInputs(inputs),ownerPricing:owner(type,prices),businessDefaults:defaults(),callerType:'owner',currentMonth:1};}
export function mulch(mode='TAX_MATERIALS'){
 const r=request('LANDSCAPING_MULCH',{inputMethod:'sqft',mulchArea:96,mulchDepth:3,mulchType:'brown',bedCondition:'clean',edgingNeeded:false},{mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:3000,minimumServiceCharge:0});
 Object.assign(r.businessDefaults,{minimumJobPrice:45000,taxMode:mode,taxPercent:mode==='TAX_NONE'?0:15,rangeBufferPercent:10});return r;
}
export function roof(sheets){
 const c={roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',starterLengthLF:100,dripEdgeLengthLF:100,ridgeCapLengthLF:20};
 if(sheets!==undefined)c.deckingSheets=sheets;
 const r=request('ROOFING_REPLACEMENT',c,{laborPerSquare:{asphalt_shingle:5000},materialCostPerSquare:{asphalt_shingle:10000},tearOffPerSquare:{asphalt_shingle:2000},underlaymentPerSquare:{asphalt_shingle:1500},accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories',starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300,deckingPerSheet:8900,minimumJob:0});
 r.ownerPricing.priceBasisByCategory.material='sell_price';return r;
}
export function mowing(frequency='biweekly'){
 return request('LANDSCAPING_MOWING',{yardSqft:5000,sqftMethod:'exact',serviceFrequency:frequency,grassCondition:'maintained',bagClippings:false,edgingIncluded:false},{mowingBaseRatePerSqft:2,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1.2,monthly:1.5,one_time:1.8},overgrowthMultipliers:{maintained:1,overgrown:1.5,severe:2}});
}
export function concrete(finish='stamped',access='difficult'){
 return request('CONCRETE_PATIO_SLAB',{dimensionMethod:'exact',length:20,width:10,thickness:4,finishType:finish,demolitionNeeded:false,reinforcement:'none',accessDifficulty:access,baseNeeded:false},{laborPerSqft:600,concreteCostPerCubicYard:18000,formworkPerLF:2500,minimumJob:0,stampedMaterialPerSqft:100});
}
export function fence(height=5.5,mode='installed',type='FENCING_INSTALL'){
 const r=offeringFixture(type,mode);r.ownerPricing.pricing.offeringDetails.fenceHeight=height;r.customerInputs.fenceHeight=height;return r;
}
export function coverageCases(configured=false){
 return [['siding-removal-installed','siding_removal','removalPerSqft',800],['demolition-installed','demolition','demolitionPerSqft',1500],['commercial-installed','insulation','insulationPerSqft',300],['stairs-installed','stairs','perStepPrice',10000]].map(([id,key,legacyField,rate])=>{
  const r=structuredClone(measuredScopeCases().find(row=>row.id===id).input);
  if(!configured){for(const field of scopeRequiredCustomer(r.serviceType,r.customerInputs,r.ownerPricing.pricing,r.ownerPricing))delete r.customerInputs[field];delete r.ownerPricing.pricing.scopeDetails;delete r.ownerPricing.pricing.scopeRates;r.ownerPricing.pricing[legacyField]=rate;}
  return {id,key,input:r};
 });
}
