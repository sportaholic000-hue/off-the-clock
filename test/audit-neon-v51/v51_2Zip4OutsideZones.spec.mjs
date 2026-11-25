// Neon audit of v51, V51-2 (November 26, 2026): a US business taxing by job
// location with only ZIP+4 zones inside a ZIP (Washington), and the default
// "send jobs outside my zones to me", sent a customer who typed the 5-digit
// ZIP straight to review as "outside the tax zones" instead of asking for the
// ZIP+4. Expected, written before the fix (mowing 5,000 sq ft = 10000 cents):
// - "98004": asked for the 9-digit ZIP+4 (ZIP4_NEEDED_MESSAGE);
// - "98004-1234" (10.1% zone): 10000 + 1010 tax = 11010 cents;
// - unchanged: "98004-3333" (in no zone) and "98005" (no zone in that ZIP) go
//   to the owner as outside the tax zones.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';
import {ZIP4_NEEDED_MESSAGE} from '../../server/taxJurisdiction.js';

const OUTSIDE='This job is outside the areas the business has set tax rates for; the business will confirm the tax.';
const quote=postalCode=>{const f=mowing();return generateQuoteVNext({...f,businessDefaults:{...f.businessDefaults,businessCountry:'US',currency:'USD',taxMode:'TAX_ALL',taxPercent:6.5,taxByJobLocation:true,
  taxZones:[{name:'[SYNTHETIC] Bellevue A',codes:['98004-1234','98004-5678'],percent:10.1},{name:'[SYNTHETIC] Bellevue B',codes:['98004-9012'],percent:9.8}]},customerInputs:{...f.customerInputs,postalCode}});};
test('V51-2: a 5-digit ZIP holding ZIP+4 zones asks for the ZIP+4',()=>{
  const bare=quote('98004');assert.equal(bare.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(bare.reviewReason,ZIP4_NEEDED_MESSAGE);
  const full=quote('98004-1234');assert.equal(full.resultType,'INSTANT_ESTIMATE_READY',full.reviewReason);
  assert.equal(full.options[0].calculationRecord.scenarios.mid.finalTotalCents,11010);
});
test('V51-2: outside every zone still goes to the owner',()=>{
  for(const code of ['98004-3333','98005'])assert.equal(quote(code).reviewReason,OUTSIDE,code);
});
