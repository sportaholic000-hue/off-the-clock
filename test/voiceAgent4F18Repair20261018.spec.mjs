import test from 'node:test';
import assert from 'node:assert/strict';
import {customerReceiptPresentation} from '../server/src/quoteScopeDisclosure.js';
import {projectVoiceQuote,projectSavedQuoteContext} from '../server/src/voice/voiceQuotePresentation.js';

// Expected outcomes were recorded before execution in
// verification/qe-agent4-f18-repair-20261018/EXPECTED.md.
const work={source:'unpriced_surface_work',description:'Door sides'};
const genuine={source:'additionalWork[0]',description:'[PLACEHOLDER] Repair the detached fence.'};
const option=(skippedAddons=['Door sides'])=>({tierName:'[PLACEHOLDER] Saved',lowEstimate:221.23,midEstimate:232.29,highEstimate:243.35,currency:'CAD',taxTreatment:'Tax included',priceUnit:'per job',skippedAddons,disclaimer:'[PLACEHOLDER] Exact saved qualification.'});
const ready=options=>({resultType:'INSTANT_ESTIMATE_READY',options});
const partial=estimate=>({resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:estimate,additionalWork:[work],additionalWorkStatus:'ON_SITE_ESTIMATE_REQUIRED',customerMessage:'[PLACEHOLDER] Selected work remains unpriced.',fullJobTotal:null});
const live=value=>projectVoiceQuote(value,'[PLACEHOLDER] saved-quote-handle');
const voices={live,saved:projectSavedQuoteContext};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};

for(const [name,options] of [
  ['junk before',[null,'invalid',option()]],
  ['junk after',[option(),false,0,[]]],
  ['junk between',[option(),null,{...option(),tierName:'[PLACEHOLDER] Complete'}]],
  ['empty record',[{},option()]],
  ['inverted record',[option(),{...option([]),lowEstimate:300,midEstimate:250,highEstimate:200}]]
])test('F18 shared exclusions survive '+name,()=>{
  const receipt=partial(ready(options)),before=structuredClone(receipt);
  const result=customerReceiptPresentation(freeze(receipt));
  assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY');
  assert.deepEqual(result.additionalWork,[work]);
  assert.deepEqual(result.pricedEstimate.options,options);
  assert.deepEqual(receipt,before);
  assert.deepEqual(customerReceiptPresentation(result),result);
});

for(const [name,estimate] of [
  ['no prices',{resultType:'INSTANT_ESTIMATE_READY'}],
  ['all junk',ready([null,'invalid',false])],
  ['empty record',ready([{}])],
  ['empty options',ready([])],
  ['invalid top range',{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:300,highEstimate:200,skippedAddons:[]}],
  ['missing exclusion evidence',ready([{...option(),skippedAddons:undefined}])],
  ['malformed exclusion evidence',ready([{...option(),skippedAddons:{wrong:[]}}])]
])test('F18 uncertain partial scope stays partial: '+name,()=>{
  const result=customerReceiptPresentation(partial(estimate));
  assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY');
  assert.deepEqual(result.additionalWork,[work]);
  assert.equal(result.fullJobTotal,null);
  assert.equal(result.lowEstimate,undefined);
  assert.deepEqual(customerReceiptPresentation(result),result);
});

for(const [name,changes] of [
  ['inverted',{lowEstimate:300,midEstimate:250,highEstimate:200}],
  ['negative',{lowEstimate:-1}],['missing low',{lowEstimate:undefined}],
  ['missing high',{highEstimate:undefined}],['string',{lowEstimate:'221.23'}],
  ['NaN',{lowEstimate:NaN}],['infinite',{highEstimate:Infinity}],
  ['mid below',{midEstimate:200}],['mid above',{midEstimate:250}],
  ['mid string',{midEstimate:'232.29'}],['mid null',{midEstimate:null}]
])test('F18 voice rejects invalid option range: '+name,()=>{
  for(const project of Object.values(voices)){
    const bad={...option(),...changes};
    assert.throws(()=>project(ready([bad])),TypeError);
    assert.throws(()=>project(ready([{...option(),firstVisit:bad}])),TypeError);
    assert.throws(()=>project({resultType:'INSTANT_ESTIMATE_READY',...bad}),TypeError);
  }
});

for(const container of [null,{},'invalid',42,false])test('F18 live rejects non-array options '+JSON.stringify(container),()=>{
  const receipt={resultType:'INSTANT_ESTIMATE_READY',...option(),options:container};
  for(const project of Object.values(voices))assert.throws(()=>project(receipt),TypeError);
});

test('F18 voices reject ready or partial receipts with no valid pricing evidence',()=>{
  for(const estimate of [{resultType:'INSTANT_ESTIMATE_READY'},ready([]),ready([null,'invalid']),ready([{}])]){
    for(const project of Object.values(voices)){
      assert.throws(()=>project(estimate),TypeError);
      assert.throws(()=>project(partial(estimate)),TypeError);
    }
  }
});

test('F18 D15 keeps exact valid saved ranges surrounded by non-record junk',()=>{
  const receipt=partial(ready([null,'invalid',option(),false,0,[]]));
  const projected=projectSavedQuoteContext(receipt);
  assert.equal(projected.resultType,'PARTIAL_ESTIMATE_READY');
  assert.deepEqual(projected.additionalWork,['Door sides']);
  assert.deepEqual(projected.options,[{...option(),disclaimer:undefined,writtenDisclosure:option().disclaimer}].map(({disclaimer,...value})=>value));
});

test('F18 valid mixed options remove only false generated work and preserve genuine same-label work',()=>{
  const receipt=partial(ready([option(),{...option([]),tierName:'[PLACEHOLDER] Complete'}]));
  receipt.additionalWork.push(genuine,{source:'additionalWork[1]',description:'Door sides'});
  const expected=[genuine,{source:'additionalWork[1]',description:'Door sides'}];
  assert.deepEqual(customerReceiptPresentation(receipt).additionalWork,expected);
  for(const project of Object.values(voices)){
    const result=project(receipt);
    assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY');
    assert.deepEqual(result.additionalWork,expected.map(item=>item.description));
    assert.deepEqual(result.options.map(item=>item.skippedAddons),[['Door sides'],[]]);
  }
  receipt.additionalWork=[work];
  for(const project of [customerReceiptPresentation,...Object.values(voices)]){
    assert.equal(project(receipt).resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(project(receipt).additionalWork,undefined);
  }
});

test('F18 valid zero and decimal ranges, privacy, frozen receipt and projection stability',()=>{
  const receipt=partial(ready([{...option(),firstVisit:{...option(),lowEstimate:0,midEstimate:undefined,highEstimate:0}}]));
  Object.assign(receipt.pricedEstimate.options[0],{lineItems:[{rate:'PRIVATE_RATE'}],markupPercent:'PRIVATE_MARKUP',rangeBufferUsed:10});
  receipt.pricedScope={service:'[PLACEHOLDER] Painting',facts:[{label:'Door sides',value:2}],serviceId:'PRIVATE_ID',bookRevision:'PRIVATE_REVISION',serviceType:'PRIVATE_TYPE'};
  const before=structuredClone(receipt);freeze(receipt);
  for(const project of Object.values(voices)){
    const result=project(receipt);
    assert.deepEqual(result,project(receipt));
    assert.deepEqual(result,project(customerReceiptPresentation(receipt)));
    assert.equal(result.options[0].lowEstimate,221.23);
    assert.equal(result.options[0].midEstimate,232.29);
    assert.equal(result.options[0].highEstimate,243.35);
    assert.equal(result.options[0].firstVisit.lowEstimate,0);
    assert.equal(result.options[0].firstVisit.highEstimate,0);
    assert.equal(result.options[0].firstVisit.midEstimate,undefined);
    assert.equal(result.options[0].currency,'CAD');
    assert.equal(result.options[0].taxTreatment,'Tax included');
    assert.equal(result.options[0].priceUnit,'per job');
    assert.equal(result.options[0].writtenDisclosure,option().disclaimer);
    assert.doesNotMatch(JSON.stringify(result),/PRIVATE_|lineItems|markupPercent|rangeBufferUsed|bookRevision|serviceType|serviceId/);
    result.options[0].lowEstimate=0;result.additionalWork.push('[PLACEHOLDER] local mutation');
    assert.deepEqual(receipt,before);
  }
});

test('F18 malformed record cannot promote uncertain mixed scope or invent a global exclusion',()=>{
  const receipt=partial(ready([option(),option([]),{}]));
  const result=customerReceiptPresentation(receipt);
  assert.equal(result.resultType,'PARTIAL_ESTIMATE_READY');
  assert.deepEqual(result.additionalWork,[]);
  assert.equal(result.fullJobTotal,null);
  assert.deepEqual(result.pricedEstimate.options,receipt.pricedEstimate.options);
  assert.deepEqual(customerReceiptPresentation(result),result);
  for(const project of Object.values(voices))assert.throws(()=>project(receipt),TypeError);
});
