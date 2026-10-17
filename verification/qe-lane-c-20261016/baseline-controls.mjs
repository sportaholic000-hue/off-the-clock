import '../../../qe-lane-c-baseline/test/pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../../../qe-lane-c-baseline/server/quote-engine-vnext/engine.js';
import {fixture,siding} from '../../../qe-lane-c-baseline/verification/engine-independent/fixtures.mjs';
import {offeringFixture} from '../../../qe-lane-c-baseline/test/configuredOfferingsFixtures.mjs';

// Recomputed BEFORE this baseline execution, from the actual fixture's current
// rates and 10% waste/story factors rather than its stale cases() comments:
// interior 100000+33000+25000+11000+70000+15400+32000+11000+8000+3300+20000=328700.
// exterior 110000+33000+27500+11000+55000+11000=247500 (story factor1.10, labor only).
// basic 400*2*100 +400*2*30*1.10=106400. Siding400000+770000=1170000.
const basic=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
basic.ownerPricing.priceBasisByCategory.material='sell_price';
for(const [name,f,expected] of [['basic',basic,106400],['itemized-interior',offeringFixture('INTERIOR_PAINTING','itemized'),328700],['itemized-exterior',offeringFixture('EXTERIOR_PAINTING','itemized'),247500],['siding',siding(),1170000]]){
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
 assert.equal(q.options[0].midEstimate,expected/100);
 console.log(JSON.stringify({name,expectedCents:expected,actualAmount:q.options[0].midEstimate,lines:q.options[0].lineItems.map(l=>({path:l.calculation.ratePath,amountCents:l.amountCents}))}));
}
