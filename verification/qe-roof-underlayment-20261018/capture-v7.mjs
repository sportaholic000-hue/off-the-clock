// Run only at the approved v7 base, before the repair. Synthetic local state.
import '../../test/pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {ENGINE_VERSION} from '../../server/quote-engine-vnext/index.js';
import {webQuote,db} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';
import {roofFixture} from './roof-fixture.mjs';

assert.equal(ENGINE_VERSION,'quote-engine-vnext-date-context-20261006-v7');
const f=roofFixture();
delete f.ownerPricing.startingValueAdoptions;
const w=webQuote(f,[],undefined,{roofRuleMode:'new'});
const record=db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(w.owner,w.row.recordId);
const outcome=JSON.parse(w.row.internalOutcomeJson);
assert.equal(w.result.midEstimate,6011.48);
assert.equal(outcome.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,601148);
assert.equal(outcome.internalResult.lineItems.find(line=>line.name==='Purchased materials: synthetic_roof_roll').amountCents,60000);
const snapshot={base:'550728daea4058c37f13952ab78785929bab39b0',owner:w.owner,book:w.book,body:w.body,
  response:w.result,submission:w.row,quote:record};
writeFileSync(new URL('./historical-v7.json',import.meta.url),JSON.stringify(snapshot,null,2)+'\n');
console.log(JSON.stringify({engineVersion:ENGINE_VERSION,response:w.result,internal:outcome},null,2));
