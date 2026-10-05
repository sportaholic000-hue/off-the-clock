// Compare the current checkout with a separate baseline checkout. Both need
// their locked dependencies installed. Only generated quoteId fields vary.
// node verification/independent-followup-20261004/compare.mjs /path/to/baseline
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cases} from '../engine-independent/fixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import * as current from '../../server/quote-engine-vnext/index.js';
if(!process.argv[2])throw new Error('Supply a separate baseline checkout path.');
const baseline=await import(pathToFileURL(path.resolve(process.argv[2],'server/quote-engine-vnext/index.js')).href);
const normalize=value=>JSON.parse(JSON.stringify(value,(key,item)=>key==='quoteId'?undefined:item));
const fixtures=[...cases(),...measuredScopeCases()],differences=[];
for(const {id,input} of fixtures){
 const oldQuote=baseline.generateQuoteVNext(input),newQuote=current.generateQuoteVNext(input);
 const comparisons=[
  ['internal',oldQuote,newQuote],
  ['customer',baseline.sanitizeForCustomerVNext(oldQuote),current.sanitizeForCustomerVNext(newQuote)],
  ['status',baseline.vNextServiceStatus(input.ownerPricing,input.businessDefaults),current.vNextServiceStatus(input.ownerPricing,input.businessDefaults)]
 ];
 for(const [kind,before,after] of comparisons)try{assert.deepEqual(normalize(after),normalize(before));}catch{differences.push({id,kind});}
}
console.log(JSON.stringify({cases:fixtures.length,comparisons:fixtures.length*3,normalizedOnly:['quoteId'],differences},null,2));
if(differences.length)process.exitCode=1;
