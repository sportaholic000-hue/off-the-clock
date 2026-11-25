// The quote results of a frozen input corpus, reduced to what customers are
// charged and why a quote is held. A change in any of them is a change in quote
// semantics and needs a new ENGINE_VERSION, so saved approvals never silently
// authorize new formulas. corpus-inputs.json.gz is built once by
// build-corpus.mjs and never edited.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/engine.js';

// Later rounds add frozen inputs in their own files; earlier files are never edited.
const ADDITIONS=['./corpus-additions-20261104.json','./corpus-additions-20261105.json','./corpus-additions-20261105b.json','./corpus-additions-20261105c.json','./corpus-additions-20261105d.json','./corpus-additions-20261105e.json','./corpus-additions-20261110.json','./corpus-additions-20261110b.json','./corpus-additions-20261110c.json','./corpus-additions-20261111.json','./corpus-additions-20261111b.json','./corpus-additions-20261112.json','./corpus-additions-20261112b.json','./corpus-additions-20261113.json','./corpus-additions-20261113b.json','./corpus-additions-20261113c.json','./corpus-additions-20261117.json','./corpus-additions-20261118.json','./corpus-additions-20261118b.json','./corpus-additions-20261119-A.json','./corpus-additions-20261119-B.json','./corpus-additions-20261119-C.json','./corpus-additions-20261119-D.json','./corpus-additions-20261119-E.json','./corpus-additions-20261119-M.json','./corpus-additions-20261121.json','./corpus-additions-20261121-seasonal.json','./corpus-additions-20261121-owner-season.json','./corpus-additions-20261121-sod.json','./corpus-additions-20261121-v42.json','./corpus-additions-20261121-v43.json','./corpus-additions-20261122-v44.json','./corpus-additions-20261122-v45.json','./corpus-additions-20261124-v46.json','./corpus-additions-20261124-v47.json','./corpus-additions-20261124-v48.json','./corpus-additions-20261125-v49.json','./corpus-additions-20261125-v50.json','./corpus-additions-20261126-v50b.json'];
export const corpusInputs=()=>[
  ...JSON.parse(gunzipSync(readFileSync(new URL('./corpus-inputs.json.gz',import.meta.url)))),
  ...ADDITIONS.flatMap(file=>JSON.parse(readFileSync(new URL(file,import.meta.url),'utf8')))
];
export function engineResultCorpus(rows=corpusInputs()){
  return rows.map(({id,input})=>{
    const q=generateQuoteVNext(structuredClone(input));
    // The quoted range and any separately quoted first visit are charges too.
    const range=quote=>[quote?.lowEstimate??null,quote?.midEstimate??null,quote?.highEstimate??null];
    const visit=first=>first?{range:range(first),lines:(first.lineItems||[]).map(line=>[line.name,line.category,line.amountCents])}:null;
    const options=(q.options?.length?q.options:[q]).map(option=>({
      tierName:option.tierName??null,
      totalCents:option.calculationRecord?.scenarios?.mid?.finalTotalCents??null,
      range:range(option),
      lines:(option.lineItems||[]).map(line=>[line.name,line.category,line.amountCents]),
      firstVisit:visit(option.firstVisit),
      // Requested work left for the site visit makes the quote partial.
      leftForSite:option.skippedAddons??[]
    }));
    return {id,resultType:q.resultType,reviewReason:q.reviewReason??null,options};
  });
}
export function engineFingerprint(corpus=engineResultCorpus()){
  return createHash('sha256').update(JSON.stringify(corpus)).digest('hex');
}
