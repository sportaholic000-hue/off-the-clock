// Compare the repaired checkout with the previous 4b6deec checkout.
// node verification/readiness-scope-followup-20261004/compare.mjs /path/to/baseline
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {cases} from '../engine-independent/fixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import * as current from '../../server/quote-engine-vnext/index.js';
if(!process.argv[2])throw new Error('Supply the baseline checkout path.');
const baseline=await import(pathToFileURL(path.resolve(process.argv[2],'server/quote-engine-vnext/index.js')).href);
const normalize=value=>JSON.parse(JSON.stringify(value,(key,item)=>key==='quoteId'?undefined:item));
const fixtures=[...cases(),...measuredScopeCases()],changes=[];
for(const {id,input:f} of fixtures){
 const before=baseline.generateQuoteVNext(f),after=current.generateQuoteVNext(f);
 assert.deepEqual(normalize(after),normalize(before),id+' internal quote');
 assert.deepEqual(normalize(current.sanitizeForCustomerVNext(after)),normalize(baseline.sanitizeForCustomerVNext(before)),id+' customer quote');
 const a=baseline.vNextServiceStatus(f.ownerPricing,f.businessDefaults),b=current.vNextServiceStatus(f.ownerPricing,f.businessDefaults);
 if(JSON.stringify(a)===JSON.stringify(b))continue;
 const {scopeCoverage:oldCoverage,...oldStatus}=a,{scopeCoverage:newCoverage,...newStatus}=b;
 for(const row of oldCoverage)assert.deepEqual(newCoverage.find(x=>x.key===row.key),row,id+' existing scope coverage');
 const changed={id,addedCoverage:newCoverage.filter(row=>!oldCoverage.some(old=>old.key===row.key))};
 if(id==='painting-itemized-cost-basis'){
  // Optional ceiling setup now lives in coverage rather than the base-work
  // blocker list. The three missing wall/prep products still block this book.
  const paths=['scopeDetails.paint_ceiling','scopeDetails.paint_ceiling_primer'];
  const diagnostics=a.ownerDiagnostics.filter(row=>paths.includes(row.path));
  assert.equal(diagnostics.length,2);
  const strings=new Set([...paths,...diagnostics.map(row=>row.message)]);
  const removeOptional=value=>Array.isArray(value)?value.filter(item=>typeof item==='string'?!strings.has(item):!paths.includes(item?.path)).map(removeOptional):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,removeOptional(item)])):value;
  assert.deepEqual(newStatus,removeOptional(oldStatus),id+' only optional blocker diagnostics moved');
  changed.movedFromBaseBlockersToCoverage=paths;
 }else assert.deepEqual(newStatus,oldStatus,id+' status outside added coverage');
 changes.push(changed);
}
console.log(JSON.stringify({cases:fixtures.length,quoteComparisons:fixtures.length*2,quoteDifferences:0,statusComparisons:fixtures.length,unexplainedStatusDifferences:0,normalizedQuoteFields:['quoteId'],expectedStatusChanges:changes},null,2));
