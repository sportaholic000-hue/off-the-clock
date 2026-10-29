// The quote results of a frozen input corpus, reduced to what customers are
// charged and why a quote is held. A change in any of them is a change in quote
// semantics and needs a new ENGINE_VERSION, so saved approvals never silently
// authorize new formulas. corpus-inputs.json.gz is built once by
// build-corpus.mjs and never edited.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/engine.js';

export const corpusInputs=()=>JSON.parse(gunzipSync(readFileSync(new URL('./corpus-inputs.json.gz',import.meta.url))));
export function engineResultCorpus(rows=corpusInputs()){
  return rows.map(({id,input})=>{
    const q=generateQuoteVNext(structuredClone(input));
    const options=(q.options?.length?q.options:[q]).map(option=>({
      tierName:option.tierName??null,
      totalCents:option.calculationRecord?.scenarios?.mid?.finalTotalCents??null,
      lines:(option.lineItems||[]).map(line=>[line.name,line.category,line.amountCents])
    }));
    return {id,resultType:q.resultType,reviewReason:q.reviewReason??null,options};
  });
}
export function engineFingerprint(corpus=engineResultCorpus()){
  return createHash('sha256').update(JSON.stringify(corpus)).digest('hex');
}
