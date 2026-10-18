import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/engine.js';
import {validateClass2FactorsDetailed,validateOwnerPricing,validateServiceRulesDetailed} from '../../server/quote-engine-vnext/contracts.js';
import {validatePricebookNumericDraft} from '../../server/priceBookMoney.js';
const dir=new URL('./',import.meta.url),blob=readFileSync(new URL('expected-cases.json',dir));
const expected=JSON.parse(blob),rows=[];
const decode=v=>v==='@NaN'?NaN:v==='@Infinity'?Infinity:v==='@null'?null:v==='@undefined'?undefined:v;
for(const c of expected.cases){
  const f=structuredClone(c.input);
  for(const map of ['storyMultiplier','complexityLaborMultiplier'])for(const [key,v] of Object.entries(f.ownerPricing.pricing[map])){
    if(v==='@undefined')delete f.ownerPricing.pricing[map][key];else f.ownerPricing.pricing[map][key]=decode(v);
  }
  const factors=validateClass2FactorsDetailed(f.serviceType,f.ownerPricing.pricing);
  const owner=validateOwnerPricing(f.serviceType,f.customerInputs,f.ownerPricing.pricing,f.ownerPricing);
  const rules=validateServiceRulesDetailed(f.ownerPricing,f.serviceType);
  let draft;try{draft={accepted:validatePricebookNumericDraft(f.ownerPricing)};}catch(e){draft={accepted:false,message:e.message,details:e.details};}
  const q=generateQuoteVNext(f);
  const actualCents=q.lineItems?.reduce((sum,l)=>sum+l.amountCents,0)??null;
  const row={id:c.id,category:c.category,expectedClass2Valid:c.expectedClass2Valid,class2Valid:!factors.length,factors,ownerValid:owner.ok,ownerErrors:owner,rules,draft,result:q,actualCents,independent:c.independent};
  rows.push(row);
  assert.equal(row.class2Valid,c.expectedClass2Valid,'independent bound expectation: '+c.id);
}
const counts={observations:rows.length,accepted:rows.filter(r=>r.class2Valid).length,rejected:rows.filter(r=>!r.class2Valid).length,ready:rows.filter(r=>r.result.resultType==='INSTANT_ESTIMATE_READY').length,review:rows.filter(r=>r.result.resultType==='ESTIMATE_REQUIRES_REVIEW').length,
 acceptedButReview:rows.filter(r=>r.class2Valid&&r.result.resultType==='ESTIMATE_REQUIRES_REVIEW').length,
 readyWithAmountMismatch:rows.filter(r=>r.result.resultType==='INSTANT_ESTIMATE_READY'&&r.actualCents!==r.independent?.separateTermRoundedTotalCents).length};
writeFileSync(new URL('sweep-results.json',dir),JSON.stringify({base:expected.base,expectedSha256:createHash('sha256').update(blob).digest('hex'),counts,rows},null,2)+'\n');
for(const row of rows.filter(r=>r.category!=='boundary'&&r.category!=='grid'))console.log(JSON.stringify({id:row.id,class2Valid:row.class2Valid,resultType:row.result.resultType,formalCents:row.independent?.separateTermRoundedTotalCents,actualCents:row.actualCents,invalidOwnerFields:row.result.invalidOwnerFields}));
console.log(JSON.stringify(counts));
