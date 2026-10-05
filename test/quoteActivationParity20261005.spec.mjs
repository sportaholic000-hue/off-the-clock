import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {cases,flatRoof} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {createActivationQuoteCheckVNext,generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {createActivationValidationVNext} from '../server/quote-engine-vnext/contracts.js';
const projection=result=>Object.fromEntries(['resultType','reviewReason','missingCustomerFields','invalidCustomerFields','missingOwnerFields','invalidOwnerFields','unsupportedOwnerFields','crossFieldOwnerFields','ownerDecisionRequired'].filter(k=>result[k]!==undefined).map(k=>[k,result[k]]));
for(const {id,input} of [...cases(),...measuredScopeCases()])test('Prepared full-pipeline readiness matches ordinary engine: '+id,()=>{
 for(const mode of ['normal','tax-and-markup','unsafe-total','invalid-fees']){
  const f=structuredClone(input);
  if(mode==='tax-and-markup')Object.assign(f.businessDefaults,{markupPercent:31.5,taxMode:'TAX_ON_TOTAL',taxPercent:8.75,rangeBufferPercent:10});
  if(mode==='unsafe-total')f.businessDefaults.minimumJobPrice=Number.MAX_SAFE_INTEGER;
  if(mode==='invalid-fees')f.feeSelections={owner:{unexpected:true}};
  const prepared=createActivationQuoteCheckVNext(f);
  for(const customerInputs of [f.customerInputs,{}, {...f.customerInputs,unexpectedSyntheticAnswer:true}])assert.deepEqual(projection(prepared(customerInputs)),projection(generateQuoteVNext({...f,customerInputs})),mode);
 }
});
test('Prepared pipeline cannot trust mutable callers, outputs, or fabricated request flags',()=>{
 const f=flatRoof(),prepared=createActivationQuoteCheckVNext(f);
 assert.equal(prepared(f.customerInputs).resultType,'INSTANT_ESTIMATE_READY');
 f.ownerPricing.pricing.minimumJob=-1;
 assert.equal(prepared(f.customerInputs).resultType,'INSTANT_ESTIMATE_READY');
 const invalid=createActivationQuoteCheckVNext(f),first=invalid(f.customerInputs);first.invalidOwnerFields.length=0;
 assert.ok(invalid(f.customerInputs).invalidOwnerFields.length>0);
 assert.equal(generateQuoteVNext({...f,prepared:true}).resultType,'ESTIMATE_REQUIRES_REVIEW');
 const context=createActivationValidationVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing);
 assert.throws(()=>{context.pricing.minimumJob=0;},TypeError);
 assert.throws(()=>{context.serviceRules.pricing.minimumJob=0;},TypeError);
});
for(const kind of ['accessor','cycle','nonplain','function'])test('Prepared pipeline rejects unsafe configuration: '+kind,()=>{
 const f=flatRoof();let reads=0;
 if(kind==='accessor')Object.defineProperty(f,'ownerPricing',{enumerable:true,get(){reads++;return {};}});
 if(kind==='cycle')f.ownerPricing.pricing.cycle=f.ownerPricing.pricing;
 if(kind==='nonplain')f.ownerPricing.pricing.minimumJob=new Date(0);
 if(kind==='function')f.ownerPricing.pricing.minimumJob=()=>0;
 const prepared=createActivationQuoteCheckVNext(f);
 assert.equal(prepared(f.customerInputs).resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(reads,0);
});
