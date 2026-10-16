import {fixtureIdentity} from './quoteEngineVNextFixtures.mjs';
import {withClass2Defaults,PRICE_BASIS_CATEGORIES,TAXABILITY_CATEGORIES} from '../server/quote-engine-vnext/index.js';

// Marked synthetic, independently declared rates; never customer/business data.
const map=(keys,value)=>Object.fromEntries(keys.map(key=>[key,value]));
export function landscapeFixture(type,pricing,inputs){
 return {serviceType:type,customerInputs:inputs,ownerPricing:{...fixtureIdentity('MANUAL',undefined,type),
  serviceType:type,service:'[SYNTHETIC] '+type,active:true,knownOfferings:{},pricing:withClass2Defaults(type,pricing),tiers:[],
  feeRules:map(['travel','disposal','permit','overhead'],'not_applicable'),priceBasisByCategory:map(PRICE_BASIS_CATEGORIES,'cost'),
  taxabilityByCategory:Object.fromEntries(TAXABILITY_CATEGORIES.map(key=>[key,key==='material'])),peakMonths:[],peakSurchargePercent:0},
  businessDefaults:{currency:'CAD',quoteTimeZone:'UTC',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,
   travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,
   markupApplies:map(PRICE_BASIS_CATEGORIES,true),peakMonths:[],peakSurchargePercent:0},callerType:'owner',currentMonth:1};
}
export function mowingFixture(){return landscapeFixture('LANDSCAPING_MOWING',{
 mowingBaseRatePerSqft:0.5,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},
 overgrowthMultipliers:{maintained:1,overgrown:1.5,severe:2}},
 {yardSqft:10000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'overgrown',bagClippings:false,edgingIncluded:false});}
export function cleanupFixture(){return landscapeFixture('LANDSCAPING_CLEANUP',{
 cleanupBaseRatePerSqft:1,minimumServiceCharge:0,disposalPerBag:800,disposalPerLoad:12000,
 debrisPricing:Object.fromEntries(['light','moderate','heavy'].map(key=>[key,{laborMultiplier:1,disposalFlat:10000,sqftPerLoad:2000}]))},
 {yardSqft:10000,sqftMethod:'exact',debrisLevel:'heavy',slope:'flat',haulAway:false});}
