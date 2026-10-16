import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {fenceOfferingFromLegacy} from '../server/quote-engine-vnext/fencePricing.js';

// Written before execution, and also run against detached 33d30e9:
// 100 LF, two $250 gates. Installed $40/LF. Itemized $10/LF labor,
// $20/LF infill plus 10% waste; ceil(100/8)+1+4 = 18 separately priced
// posts at $20+$4+$6. Moderate terrain: 1.15 labor, gate/installed labor
// share 60% -> 1.09. Replacement adds 50 LF*$8 (1.09 when moderate).
for(const [type,mode,terrain,expected]of [
 ['FENCING_INSTALL','installed','flat',450000],['FENCING_INSTALL','installed','moderate',490500],
 ['FENCING_INSTALL','itemized','flat',424000],['FENCING_INSTALL','itemized','moderate',444580],
 ['FENCING_REPLACEMENT','installed','flat',490000],['FENCING_REPLACEMENT','installed','moderate',534100],
 ['FENCING_REPLACEMENT','itemized','flat',464000],['FENCING_REPLACEMENT','itemized','moderate',488180],
])test('Oct16 legacy baseline '+type+' '+mode+' '+terrain+': 6 ft remains '+expected+' cents; 8 ft requires review',()=>{
 const f=offeringFixture(type,mode),before=structuredClone(f.ownerPricing);f.customerInputs.terrainSlope=terrain;
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,expected);
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).fenceHeightNotice,'Only the saved fence height is priced. Add rows for the other heights you build.');
 assert.deepEqual(f.ownerPricing,before,'reads and quotes do not rewrite saved prices');f.customerInputs.fenceHeight=8;
 const unpriced=generateQuoteVNext(f);assert.equal(unpriced.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(unpriced.reviewReason,'No price is set for a fence at 8 ft.');
});
test('Oct16 explicit legacy migration keeps its rounding boundary: 24 LF, 4 posts, moderate terrain = 109205 cents before and after',()=>{
 // Infill 27600+52800; posts 8000; footing labor 4*4001*1.15=18404.6 ->18405;
 // footing materials 2400. Splitting equal footing rates would lose one cent.
 const f=offeringFixture('FENCING_INSTALL','itemized');Object.assign(f.customerInputs,{linearFeet:24,gates:{},terrainSlope:'moderate'});f.ownerPricing.pricing.offeringRates.footingLaborEach=4001;
 const before=generateQuoteVNext(f);assert.equal(before.options[0].calculationRecord.scenarios.mid.finalTotalCents,109205);
 f.ownerPricing.pricing.fenceOfferings={wood:fenceOfferingFromLegacy(f.ownerPricing.pricing)};f.customerInputs.fenceRunCount=1;
 const after=generateQuoteVNext(f);assert.equal(after.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(after));assert.equal(after.options[0].calculationRecord.scenarios.mid.finalTotalCents,109205);
 assert.deepEqual(after.options[0].lineItems.map(l=>l.amountCents),before.options[0].lineItems.map(l=>l.amountCents));
});
