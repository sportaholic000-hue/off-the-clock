import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {customerReceiptPresentation} from '../../server/src/quoteScopeDisclosure.js';
import {projectVoiceQuote,projectSavedQuoteContext} from '../../server/src/voice/voiceQuotePresentation.js';

const saved={tierName:'[PLACEHOLDER] Saved',lowEstimate:221.23,highEstimate:243.35,currency:'CAD',skippedAddons:['Door sides']};
const instant={resultType:'INSTANT_ESTIMATE_READY',options:[null,'invalid',saved]};
const partial={resultType:'PARTIAL_ESTIMATE_READY',pricedEstimate:instant,additionalWork:[{source:'unpriced_surface_work',description:'Door sides'}],additionalWorkStatus:'ON_SITE_ESTIMATE_REQUIRED',fullJobTotal:null};
const reversed={resultType:'INSTANT_ESTIMATE_READY',options:[{tierName:'[PLACEHOLDER] Reversed',lowEstimate:300,highEstimate:200,currency:'CAD'}]};
const container={resultType:'INSTANT_ESTIMATE_READY',lowEstimate:221.23,highEstimate:243.35,currency:'CAD',options:{invalid:'[PLACEHOLDER] malformed options'}};
const functions={customerReceiptPresentation,projectVoiceQuote:input=>projectVoiceQuote(input,'placeholder-f18-minimal-handle-1234'),projectSavedQuoteContext};
const call=(fn,input)=>{try{return {returned:fn(input)};}catch(error){return {rejected:{name:error.name,message:error.message}};}};
const outcomes=[];
for(const [id,input] of Object.entries({instant,partial,reversed,container})){
  const before=JSON.stringify(input),actual=Object.fromEntries(Object.entries(functions).map(([name,fn])=>[name,call(fn,input)]));
  for(const [name,fn] of Object.entries(functions))assert.deepEqual(call(fn,input),actual[name]);
  assert.equal(JSON.stringify(input),before);
  outcomes.push({id,input,actual});
}
writeFileSync(new URL('minimal-results.json',import.meta.url),JSON.stringify(outcomes,null,2)+'\n');
for(const {id,actual} of outcomes)console.log(JSON.stringify({id,actual}));
