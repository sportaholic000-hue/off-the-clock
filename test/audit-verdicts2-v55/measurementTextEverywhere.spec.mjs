// Verdicts on the deployment and v54 audits, item 1.3 (V54-3): v54 rounded the
// price-driver lines but not the matching line-item text, so a decimal
// measurement showed twice ("122.21 measured square feet" and "122.2 measured
// square feet"), and six more customer lines printed raw decimals. Expected,
// written before the change (customer-safe quote):
// - flooring 122.21 sq ft: "122.2 measured square feet" exactly once, no 122.21;
// - cleanup 1234.56 sq ft: "1234.6 measured square feet" once, no 1234.56;
// - mulch bed preparation 125.75 sq ft: "125.8 square feet of bed preparation";
// - configured fence 125.678 ft: "125.7 measured linear feet";
// - configured painting 345.678 sq ft: "345.7 measured square feet of wall area";
// - custom per-unit quantity 234.567: "Confirmed service quantity: 234.57"
//   (two decimals: a custom quantity may be hours);
// - prices are unchanged by the display.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,flooring,custom} from '../../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';

const text=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return JSON.stringify(sanitizeForCustomerVNext(q));};
// Within one option's price drivers (the customer copy also repeats them at the top level).
const count=(s,needle)=>JSON.parse(s).options[0].priceDrivers.filter(d=>d===needle).length;
test('decimal measurements show once, rounded, in every customer line',()=>{
  let t=text(flooring('tile',122.21));assert.equal(count(t,'122.2 measured square feet'),1,t);assert.doesNotMatch(t,/122\.21/);
  const cleanup=fixture('LANDSCAPING_CLEANUP',{cleanupBaseRatePerSqft:10,minimumServiceCharge:0,disposalPerBag:300,disposalPerLoad:6000,haulAwayFee:2500,slopeMultiplier:{flat:1,moderate:1.1,steep:1.25},debrisPricing:{light:{laborMultiplier:1,disposalFlat:5000},moderate:{laborMultiplier:1.2,disposalFlat:7500},heavy:{laborMultiplier:1.5,disposalFlat:10000}}},{yardSqft:1234.56,sqftMethod:'exact',debrisLevel:'light',slope:'flat',haulAway:false});
  t=text(cleanup);assert.equal(count(t,'1234.6 measured square feet'),1,t);assert.doesNotMatch(t,/1234\.56/);
  const mulch=fixture('LANDSCAPING_MULCH',{minimumServiceCharge:0,mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:2000,bedPrepLaborPerSqft:{needs_weeding:100,overgrown:200}},{inputMethod:'yards',mulchArea:6,mulchType:'brown',bedCondition:'needs_weeding',bedSqft:125.75,edgingNeeded:false,accessDifficulty:'easy'});
  t=text(mulch);assert.match(t,/125\.8 square feet of bed preparation/);assert.doesNotMatch(t,/125\.75/);
  const fence=offeringFixture('FENCING_INSTALL','installed');fence.customerInputs.linearFeet=125.678;
  t=text(fence);assert.match(t,/125\.7 measured linear feet/);assert.doesNotMatch(t,/125\.678/);
  const paint=offeringFixture('INTERIOR_PAINTING','installed');paint.customerInputs.wallAreaSqft=345.678;
  t=text(paint);assert.match(t,/345\.7 measured square feet of wall area/);assert.doesNotMatch(t,/345\.678/);
  const c=custom();Object.assign(c.ownerPricing.pricing,{unit:'per_hour',price:10000});Object.assign(c.customerInputs,{unit:'per_hour',hours:234.567});
  const q=generateQuoteVNext(c);
  if(q.resultType==='INSTANT_ESTIMATE_READY'){t=JSON.stringify(sanitizeForCustomerVNext(q));assert.match(t,/Confirmed service quantity: 234\.57/);assert.doesNotMatch(t,/234\.567/);}
  else assert.fail('custom per-hour fixture did not quote: '+q.reviewReason);
});
