// Run once at the exact untouched base; never regenerate this after the repair.
import '../../test/pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../../server/quote-engine-vnext/index.js';
import {webQuote,phone,quoteEmailFixture,db} from '../../test/quoteDeliveryBatch20261015Fixture.mjs';
import {BASE,types,expected,fixtureFor,numericalOutput,moneyText,finalCents} from './fixtures.mjs';

test('capture unchanged exact-base concrete responses and independent money controls',async t=>{
  assert.equal(execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),BASE);
  assert.equal(execFileSync('git',['diff','HEAD','--','server/quote-engine-vnext/templates.js','server/quote-engine-vnext/contracts.js'],{encoding:'utf8'}),'');
  const rows=[],responses=[];
  for(const type of types)for(const [kind,wanted] of Object.entries(expected)){
    const input=fixtureFor(type,kind),result=generateQuoteVNext(input),customer=sanitizeForCustomerVNext(result);
    assert.equal(result.resultType,wanted===null?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY',type+'/'+kind+' '+JSON.stringify(result));
    if(wanted!==null){
      if(typeof wanted==='number')assert.equal(finalCents(result.options[0]),wanted,type+'/'+kind);
      else assert.deepEqual(Object.fromEntries(result.options.map(o=>[o.tierName,finalCents(o)])),wanted);
    }
    rows.push({type,kind,input,resultType:result.resultType,numbers:numericalOutput(result),customerNumbers:numericalOutput(customer),customerMoneyText:moneyText(customer)});
    if(kind==='gravel'){
      const web=webQuote(input),h=quoteEmailFixture(t),voice=await phone(h,input);
      assert.equal(web.result.midEstimate,8030);assert.equal(voice.result.midEstimate,8030);
      assert.ok(web.result.pricedScope.facts.some(f=>f.label==='Base preparation included'&&f.value==='Yes'));
      assert.match(customer.disclaimer,/Base preparation is priced for 4 inches of compacted base depth\./);
      assert.doesNotMatch(customer.disclaimer,/Excluded base preparation:/);
      responses.push({type,customer,widget:web.result,voice:voice.result,voiceQuestionContract:voice.match.questionContract,historical:{owner:web.owner,book:web.book,body:web.body,response:web.result,submission:web.row,quote:db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(web.owner,web.row.recordId)}});
      console.log(JSON.stringify({type,completeCustomerResponse:customer,completeWidgetResponse:web.result,completeVoiceResponse:voice.result}));
    }
  }
  writeFileSync(new URL('./before-monetary.json',import.meta.url),JSON.stringify({base:BASE,rows},null,2)+'\n');
  writeFileSync(new URL('./before-responses.json',import.meta.url),JSON.stringify({base:BASE,responses},null,2)+'\n');
});
