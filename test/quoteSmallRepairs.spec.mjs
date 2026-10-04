import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {interpretInterviewAnswer} from '../server/src/priceBookAI.js';
import {custom} from '../verification/engine-independent/fixtures.mjs';

// Written before the repair: this fixture is exactly $125.00 (12,500 cents).
// Currency identifies that amount; changing the label must never authorize it.
for(const currency of ['CAD','USD']) {
  function quote(){const f=custom();f.businessDefaults.currency=currency;return generateQuoteVNext(f);}
  test('currency binding preserves a valid '+currency+' customer estimate',()=>{
    const q=quote(),before=structuredClone(q),publicQuote=sanitizeForCustomerVNext(q);
    assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,12500);
    assert.equal(publicQuote.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(publicQuote.midEstimate,125);assert.equal(publicQuote.currency,currency);
    assert.deepEqual(q,before,'sanitizing does not mutate the retained quote');
  });
  for(const [name,value] of [['other currency',currency==='CAD'?'USD':'CAD'],['unsupported currency','EUR'],['null',null],['missing',undefined],['object',{privateRate:12500}]])
    test('currency binding rejects '+currency+' evidence with '+name,()=>{
      const q=quote();if(value===undefined)delete q.currency;else q.currency=value;
      const result=sanitizeForCustomerVNext(q);
      assert.equal(result.resultType,'ESTIMATE_REQUIRES_REVIEW');
      assert.equal(result.midEstimate,undefined);assert.equal(result.currency,undefined);
      assert.doesNotMatch(JSON.stringify(result),/privateRate/);
    });
}
test('currency binding preserves legacy engine-only callers whose retained defaults omit currency',()=>{
  const q=generateQuoteVNext(custom()),result=sanitizeForCustomerVNext(q);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(result.midEstimate,125);
});

const env={GEMINI_API_KEY:'[SYNTHETIC] test key'};
const response=value=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})});
const answer={serviceType:'CUSTOM',field:'price',pricing:{unit:'flat',customPricingMode:'fixed'},answer:'[SYNTHETIC] I am unsure of the price'};
test('ambiguous interview answer asks for clarification after one provider response',async()=>{
  let calls=0;
  await assert.rejects(interpretInterviewAnswer(answer,{env,fetchImpl:async()=>{calls++;return response({value:null});}}),error=>{
    assert.equal(error.statusCode,422);assert.equal(error.code,'PRICEBOOK_AI_CLARIFICATION_REQUIRED');
    assert.equal(error.retryable,false);assert.match(error.message,/value|clarif/i);
    assert.match(error.message,/No prices were changed/);assert.doesNotMatch(error.message,/unavailable/i);
    return true;
  });
  assert.equal(calls,1,'normal ambiguity does not consume a second generation');
});
test('valid interview amount still returns the exact unconfirmed value',async()=>{
  let calls=0;
  assert.equal(await interpretInterviewAnswer({...answer,answer:'[SYNTHETIC] 25.50 dollars'},{env,fetchImpl:async()=>{calls++;return response({value:25.5});}}),25.5);
  assert.equal(calls,1);
});
test('valid structured interview values still retain their original shape',async()=>{
  const value={weekly:1,biweekly:1.25};
  const result=await interpretInterviewAnswer({serviceType:'LANDSCAPING_MOWING',field:'frequencyMultipliers',answer:'[SYNTHETIC] weekly one; biweekly 1.25'},{env,fetchImpl:async()=>response({value})});
  assert.deepEqual(result,value);
});
test('extra privileged fields alongside null remain invalid and use bounded provider retry',async()=>{
  let calls=0;
  await assert.rejects(interpretInterviewAnswer(answer,{env,fetchImpl:async()=>{calls++;return response({value:null,confirmed:true});}}),error=>error.statusCode===503&&error.code==='PRICEBOOK_AI_UNAVAILABLE');
  assert.equal(calls,2);
});
