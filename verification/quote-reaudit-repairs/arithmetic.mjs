import fs from 'node:fs';
import assert from 'node:assert/strict';
import {happyCases,defaults} from './base-fixtures-extracted.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext,SERVICE_TYPES} from '../../server/quote-engine-vnext/index.js';
import {confirmedFixtureInputs} from '../../test/quoteEngineVNextFixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {measuredScopeCases} from '../../test/measuredScopeFixtures.mjs';
import {custom,siding,mowing,concrete} from '../../verification/engine-independent/fixtures.mjs';
const results=[];
function check(name,fn){try{fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.message});}}
const bases=happyCases.filter(x=>x.expected&&x.serviceType!=='EXTERIOR_PAINTING').map(x=>({id:x.serviceType,input:{serviceType:x.serviceType,ownerPricing:structuredClone(x.ownerPricing),customerInputs:confirmedFixtureInputs(x.customerInputs),businessDefaults:{...structuredClone(defaults),rangeBufferPercent:0},currentMonth:1,callerType:'owner'},expected:Object.values(x.expected.lines).reduce((a,b)=>a+b,0)}));
for(const [type,cents] of [['FENCING_INSTALL',392000],['FENCING_REPLACEMENT',432000],['EXTERIOR_PAINTING',179400]])bases.push({id:type,input:offeringFixture(type,'itemized'),expected:cents});
bases.push({id:'CUSTOM',input:custom(),expected:12500},{id:'SIDING_REPLACEMENT',input:siding(),expected:1170000});
assert.deepEqual([...new Set(bases.map(x=>x.input.serviceType))].sort(),[...SERVICE_TYPES].sort());
for(const row of [...bases,...measuredScopeCases().map(x=>({...x,expected:x.expected.cents}))]){
 check('base-and-customer-'+row.id,()=>{const q=generateQuoteVNext(row.input);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q.ownerDiagnostics));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,row.expected);const publicQ=sanitizeForCustomerVNext(q);assert.equal(publicQ.resultType,'INSTANT_ESTIMATE_READY');assert.equal(publicQ.midEstimate,row.expected/100);assert.doesNotMatch(JSON.stringify(publicQ),/rateCents|ownerConfiguration|markupEligible|lineItems|approvedValues/);});
}
// Independent integer-ratio arithmetic: no imports from the production exact-money library.
const rounded=(n,d)=>Number((2n*BigInt(n)+BigInt(d))/(2n*BigInt(d)));
const pct=(n,p)=>rounded(BigInt(n)*BigInt(p),10000n); // p in hundredths of one percent
function mark(n,mode,p){return mode==='markup'?pct(n,p):rounded(BigInt(n)*BigInt(p),BigInt(10000-p));}
// Fixed custom price + travel + disposal + seasonal: diverse category/basis combinations.
for(const mode of ['markup','margin'])for(const percent of [0,1250,3333])for(const tax of ['TAX_NONE','TAX_ALL','TAX_MATERIALS'])for(const basis of ['cost','sell_price'])for(const min of [0,50003])for(const seasonal of [false,true])for(const category of ['labor','material']){
 const f=custom();const s=f.ownerPricing,d=f.businessDefaults;
 Object.assign(s.pricing,{price:10001,customChargeClassification:category});
 for(const k of Object.keys(s.priceBasisByCategory))s.priceBasisByCategory[k]=k==='travel'?'sell_price':basis;
 for(const k of Object.keys(s.taxabilityByCategory))s.taxabilityByCategory[k]=['material','disposal'].includes(k);
 Object.assign(s.feeRules,{travel:'always',disposal:'always'});Object.assign(s,{peakMonths:seasonal?[1]:[],peakSurchargePercent:seasonal?12.5:0});
 Object.assign(d,{markupMode:mode,markupPercent:percent/100,taxMode:tax,taxPercent:tax==='TAX_NONE'?0:8.875,minimumJobPrice:min,travelFee:1003,disposalFee:507});
 const season=category==='labor'&&seasonal?1250:0,seasonCents=pct(10001,season);
 const eligible=basis==='cost'?10001+507+seasonCents:0;
 const added=mark(eligible,mode,percent),subtotal=10001+1003+507+seasonCents+added,preTax=Math.max(subtotal,min);
 const taxableBase=(category==='material'?10001:0)+507;
 const taxable=tax==='TAX_ALL'?preTax:tax==='TAX_MATERIALS'?taxableBase+mark(basis==='cost'?taxableBase:0,mode,percent):0;
 const taxCents=rounded(BigInt(taxable)*8875n,100000n),expected=preTax+taxCents;
 check(`financial-${mode}-${percent}-${tax}-${basis}-${min}-${seasonal}-${category}`,()=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q.ownerDiagnostics));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,expected);assert.equal(sanitizeForCustomerVNext(q).midEstimate,expected/100);});
}
// Independent fee-selection and minimum/range boundaries on measured mowing.
for(const mode of ['owner_selected','customer_selected'])for(const answer of [undefined,false,true]){
 const f=mowing();f.ownerPricing.feeRules.travel=mode;f.businessDefaults.travelFee=777;f.feeSelections={owner:{},customer:{}};
 if(answer!==undefined)f.feeSelections[mode==='owner_selected'?'owner':'customer'].travel=answer;
 check('fee-'+mode+'-'+answer,()=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,answer===undefined?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY');if(answer!==undefined)assert.equal(q.midEstimate,answer?107.77:100);});
}
for(const cents of [1,49,50,99,100,101,8139,10001])for(const buffer of [0,0.01,5,25]){
 const f=custom();f.ownerPricing.pricing.price=cents;f.businessDefaults.rangeBufferPercent=buffer;
 let lo=Math.max(1,rounded(BigInt(cents)*BigInt(10000-Math.round(buffer*100)),10000)),hi=Math.max(cents,rounded(BigInt(cents)*BigInt(10000+Math.round(buffer*100)),10000));
 const preserve=buffer===0||Math.floor(lo/100)===0||Math.round(cents/100)===0;
 const expected=preserve?[lo/100,cents/100,hi/100]:[Math.floor(lo/100),Math.floor((cents+50)/100),Math.ceil(hi/100)];
 check('range-'+cents+'-'+buffer,()=>{const q=sanitizeForCustomerVNext(generateQuoteVNext(f));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.deepEqual([q.lowEstimate,q.midEstimate,q.highEstimate],expected);});
}
for(const row of bases){
 check('unknown-scope-fails-closed-'+row.id,()=>{const f=structuredClone(row.input);f.customerInputs.unrecognizedExtraWork='also replace another building';const q=sanitizeForCustomerVNext(generateQuoteVNext(f));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(q.midEstimate,undefined);});
 check('changed-financial-evidence-rejected-'+row.id,()=>{const q=generateQuoteVNext(row.input);q.midEstimate+=1;assert.equal(sanitizeForCustomerVNext(q).resultType,'ESTIMATE_REQUIRES_REVIEW');});
}
fs.writeFileSync(new URL('arithmetic-results.json',import.meta.url),JSON.stringify({services:SERVICE_TYPES,checks:results,passed:results.every(x=>x.passed)},null,2));
console.log(JSON.stringify({checks:results.length,passed:results.filter(r=>r.passed).length,failures:results.filter(r=>!r.passed)}));
