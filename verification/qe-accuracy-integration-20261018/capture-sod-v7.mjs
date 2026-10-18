// Run only from the exact common-base checkout. Synthetic data only.
import '../../test/pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ENGINE_VERSION} from '../../server/quote-engine-vnext/index.js';
import {sodFixture} from '../../test/quoteConcreteLandscape20261016Fixture.mjs';
import {webQuote,db} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';

const V7='quote-engine-vnext-date-context-20261006-v7';
assert.equal(ENGINE_VERSION,V7);
const fixture=sodFixture();
Object.assign(fixture.ownerPricing.pricing,{topsoilPerCubicYard:3000,topsoilTargetDepthInches:4});
fixture.customerInputs.usableTopsoilDepthInches=3;
const saved=webQuote(fixture);
const quote=db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(saved.owner,saved.row.recordId);
const outcome=JSON.parse(saved.row.internalOutcomeJson);
assert.equal(saved.result.midEstimate,2142.59);
assert.equal(outcome.internalResult.engineVersion,V7);
assert.equal(outcome.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,214259);
assert.ok(saved.result.priceDrivers.includes('Existing-ground preparation included'));
assert.doesNotMatch(saved.result.disclaimer,/Included ground preparation:|Excluded ground preparation:/);
const snapshot={
  base:'550728daea4058c37f13952ab78785929bab39b0',
  owner:saved.owner,
  book:saved.book,
  body:saved.body,
  response:saved.result,
  submission:saved.row,
  quote
};
const output=process.env.SOD_HISTORY_OUTPUT||fileURLToPath(new URL('./historical-sod-v7.json',import.meta.url));
writeFileSync(output,JSON.stringify(snapshot,null,2)+'\n');
console.log(JSON.stringify({output,engineVersion:ENGINE_VERSION,totalCents:214259,priceDrivers:saved.result.priceDrivers}));
