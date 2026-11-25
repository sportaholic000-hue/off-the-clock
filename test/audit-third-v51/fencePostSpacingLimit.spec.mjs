// Third audit of v51 (November 26, 2026), finding 5: post spacing accepted
// up to 100 ft, so a 100 ft fence could count no line posts. Residential
// practice: wood and vinyl 6-8 ft; chain link at most 10 ft (ASTM F567). Limit
// 12 ft. Expected, written before the change:
// - itemized fence: spacing 100 or 12.01 ft is refused (the service is not
//   live and the quote goes to review), 12 and 8 ft quote;
// - a height row with 100 ft spacing is refused the same way.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

test('fence post spacing is at most 12 ft',()=>{
  for(const [spacing,ok] of [[8,true],[12,true],[12.01,false],[100,false]]){
    const f=offeringFixture('FENCING_INSTALL','itemized');f.ownerPricing.pricing.postSpacingLF=spacing;
    assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,ok?'QUOTING LIVE':'NEEDS PRICING',String(spacing));
    assert.equal(generateQuoteVNext(f).resultType,ok?'INSTANT_ESTIMATE_READY':'ESTIMATE_REQUIRES_REVIEW',String(spacing));
  }
});
