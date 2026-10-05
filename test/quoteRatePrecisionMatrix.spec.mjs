import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {explanationCases} from './customerExplanationFixtures.mjs';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {scopeRateDefinitions} from '../server/scopeConfiguration.js';
import {offeringRateDefinitions} from '../server/quote-engine-vnext/configuredOfferings.js';
import {convertApplicationBook,quoteDoneMoneyKind} from '../server/src/quoteDoneBridge.js';
const seen=new Set();
for(const row of explanationCases()){
 const q=generateQuoteVNext(row.input);if(q.resultType!=='INSTANT_ESTIMATE_READY')throw new Error('Precision fixture is not ready: '+row.id);
 const p=row.input.ownerPricing.pricing,type=row.input.serviceType;
 const paths=q.options[0].calculationRecord.scenarios.mid.lineItems.flatMap(line=>[line.calculation?.ratePath,...(line.calculation?.components||[]).map(c=>c.ratePath)]).filter(path=>path&&!path.startsWith('businessDefaults.'));
 for(const path of paths){
  const [root,key]=path.split('.'),kind=root==='scopeRates'?scopeRateDefinitions(type,p)[key]?.moneyKind:root==='offeringRates'?offeringRateDefinitions(type,p)[key]?.moneyKind:quoteDoneMoneyKind(type,root,p);
  const id=type+':'+path;if(!kind||seen.has(id))continue;seen.add(id);
  test('rate precision matrix '+id+' '+kind,()=>{
   const input=structuredClone(row.input);let target=input.ownerPricing.pricing;const parts=path.split('.');for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=3.5;
   const book={services:[input.ownerPricing],defaults:input.businessDefaults},dollars=convertApplicationBook(book,'toDollars');
   if(kind==='fixed_amount'){assert.throws(()=>convertApplicationBook(dollars,'toCents'));assert.equal(generateQuoteVNext(input).resultType,'ESTIMATE_REQUIRES_REVIEW');}
   else{assert.deepEqual(convertApplicationBook(dollars,'toCents'),book);const actual=generateQuoteVNext(input);assert.equal(actual.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(actual));}
  });
 }
}
