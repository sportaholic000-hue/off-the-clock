// Synthetic application-path evidence; never rewrites the before captures.
import '../../test/pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';
import {webQuote,phone,quoteEmailFixture} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';
import {BASE,types,fixtureFor,numericalOutput,moneyText} from './fixtures.mjs';

test('capture corrected complete concrete responses with identical monetary outputs',async t=>{
  const before=JSON.parse(readFileSync(new URL('./before-responses.json',import.meta.url)));
  assert.equal(before.base,BASE);
  const responses=[];
  for(const type of types){
    const input=fixtureFor(type,'gravel'),customer=sanitizeForCustomerVNext(generateQuoteVNext(input));
    const widget=webQuote(input,[],'2026-01-15T15:00:00.000Z').result;
    const observed=await phone(quoteEmailFixture(t),input),voice=observed.result;
    const old=before.responses.find(r=>r.type===type);
    for(const [key,response] of Object.entries({customer,widget,voice})){
      assert.deepEqual(numericalOutput(response),numericalOutput(old[key]));
      assert.deepEqual(moneyText(response),moneyText(old[key]));
      assert.match(JSON.stringify(response),/Included base preparation: base gravel material\./);
      assert.match(JSON.stringify(response),/Excluded base preparation: base excavation and grading labor\. Any required excluded work needs a separate on-site estimate\./);
      assert.doesNotMatch(JSON.stringify(response),/Base preparation included|Base preparation is priced for/);
    }
    responses.push({type,customer,widget,voice,voiceQuestionContract:observed.match.questionContract});
  }
  writeFileSync(new URL('./after-responses.json',import.meta.url),JSON.stringify({base:BASE,responses},null,2)+'\n');
});
