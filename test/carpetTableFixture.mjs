// The v31 carpet table, shared: 48 starting books (storage x base unit x option
// unit x option prices x exact/$28), quoted for the same 200 sq ft carpet job
// through the real engine, and an oracle independent of the code under test.
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {exactCarpetConversion} from '../server/quote-engine-vnext/carpetUnitConversion.js';
import {convertPricebookMoney} from '../server/priceBookMoney.js';
import * as E from '../client/src/pricebookEditing.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
export const FT='square_foot',YD='square_yard',other=u=>u===YD?FT:YD;
export const CARPET=['carpetPriceUnit','laborPerSqft','materialPerSqft'];
export const D=s=>convertPricebookMoney(s,'toDollars'),C=s=>convertPricebookMoney(s,'toCents');
export const ready=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason+' '+JSON.stringify([q.missingOwnerFields,q.invalidCustomerFields,q.invalidOwnerFields]));return q;};
export const review=f=>{const q=generateQuoteVNext(structuredClone(f));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(q.options?.map(o=>o.midEstimate)));return q;};
export const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;

// ---------------------------------------------------------------------------
// Items 1-4: the carpet table
// ---------------------------------------------------------------------------
// 200 sq ft of carpet with an included pad. Labor and material are each taken
// on 200 x 1.10 = 220 sq ft (22.2 sq yd x 1.10): $3 + $5 per sq ft = 220 x 8 = $1,760.
export function job(){
  const f=flooring('carpet',200);delete f.ownerPricing.pricing.perStepPrice;Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true});
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}});
  for(const k of CARPET)delete f.ownerPricing.pricing[k];
  return f;
}
export const JOB=job();
// A carpet price in a unit, from its per-square-foot cents. The inexact set
// states every square-yard labor price as $28 (no exact per-foot price).
export const priceIn=(unit,ftCents,inexact,field)=>unit===YD?(inexact&&field==='laborPerSqft'?2800:ftCents*9):ftCents;
// Base $3/$5 per sq ft ($27/$45 per sq yd); an option's own prices $4/$6 per sq ft ($36/$54 per sq yd).
export function startBook({storage,base,option,prices,inexact}){
  const s=structuredClone(JOB.ownerPricing);
  const p={...(base===YD?{carpetPriceUnit:YD}:{}),laborPerSqft:{carpet:priceIn(base,300,inexact,'laborPerSqft')},materialPerSqft:{carpet:priceIn(base,500,inexact,'materialPerSqft')}};
  const optionUnit=option==='none'?base:option==='same'?base:other(base);
  const overrides={...(option==='none'?{}:{carpetPriceUnit:optionUnit}),...(prices==='own'?{laborPerSqft:{carpet:priceIn(optionUnit,400,inexact,'laborPerSqft')},materialPerSqft:{carpet:priceIn(optionUnit,600,inexact,'materialPerSqft')}}:{})};
  if(storage==='root')Object.assign(s,p);else Object.assign(s.pricing,p);
  s.tiers=[{name:'Option',overrides}];
  return D(s);
}
// The engine reads a service the way the bridge projects it: a price under
// `pricing` wins, otherwise the one stored on the service.
export function engineService(dollars){
  const s=C(dollars),out={...s,pricing:{...E.servicePricing(s)}};
  for(const k of CARPET)delete out[k];
  for(const k of Object.keys(out.pricing))if(Object.hasOwn(s,k)&&!Object.hasOwn(s.pricing||{},k)&&!CARPET.includes(k))delete out[k];
  return out;
}
export const quoteCache=new Map();
export function quoteOf(ownerPricing){
  const key=JSON.stringify(ownerPricing);
  if(!quoteCache.has(key)){const q=generateQuoteVNext(structuredClone({...JOB,ownerPricing}));quoteCache.set(key,q.resultType==='INSTANT_ESTIMATE_READY'?q.options.map(o=>o.calculationRecord.scenarios.mid.finalTotalCents):'unpriced');}
  return quoteCache.get(key);
}
// [base quote, option quote] in cents, or 'unpriced'.
export function quotes(dollars){
  const s=engineService(dollars);
  const base=quoteOf({...s,tiers:[]});
  const option=quoteOf(s);
  return [Array.isArray(base)?base[0]:base,Array.isArray(option)?option[0]:option];
}
// The meaning of a book: each carpet price the base and the option read, per
// square foot, worked out independently of the code under test.
export function meaning(dollars){
  const p=E.servicePricing(C(dollars)),bu=p.carpetPriceUnit===YD?YD:FT,perFoot=(v,u)=>v===undefined?undefined:u===YD?v/9:v;
  const base=['laborPerSqft','materialPerSqft'].map(f=>perFoot(p[f]?.carpet,bu));
  const options=(C(dollars).tiers||[]).map(t=>{
    const o=t.overrides||{},ou=o.carpetPriceUnit===undefined?bu:o.carpetPriceUnit===YD?YD:FT;
    return ['laborPerSqft','materialPerSqft'].map(f=>{
      if(o[f]&&Object.hasOwn(o[f],'carpet'))return perFoot(o[f].carpet,ou);
      const inherited=p[f]?.carpet;if(inherited===undefined)return undefined;
      const v=exactCarpetConversion(inherited,bu,ou);return v===null?undefined:perFoot(v,ou);
    });
  });
  return [base,...options];
}
// Labor and material are each charged on 220 sq ft and rounded to the cent.
export const expectedQuote=prices=>prices.some(v=>v===undefined)?'unpriced':prices.reduce((sum,v)=>sum+Math.round(220*v),0);
export const expectedQuotes=dollars=>{const [base,option]=meaning(dollars);return [expectedQuote(base),expectedQuote(option)];};

export const CASES=[];
for(const storage of ['pricing','root'])for(const base of [FT,YD])for(const option of ['none','same','different'])for(const prices of ['inherited','own'])for(const inexact of [false,true])
  CASES.push({storage,base,option,prices,inexact,name:`${storage}/${base}/option ${option}/${prices}/${inexact?'$28':'exact'}`});
export const optionUnitOf=c=>c.option==='different'?other(c.base):c.base;

export const sameMeaning=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// What a session stored, per square yard (x 9 is always exact): the base unit and
// prices, and the option's own unit (or "follows" the base) and own prices (or "inherit").
export function stored(dollars){
  const s=C(dollars),p=E.servicePricing(s),bu=p.carpetPriceUnit===YD?YD:FT,yd=(v,u)=>v===undefined?undefined:u===YD?v:v*9;
  const o=(s.tiers||[])[0]?.overrides||{},own=o.carpetPriceUnit!==undefined,ou=own?(o.carpetPriceUnit===YD?YD:FT):bu;
  const optionPrice=f=>o[f]&&Object.hasOwn(o[f],'carpet')?yd(o[f].carpet,ou):'inherit';
  return {baseUnit:bu,baseLabor:yd(p.laborPerSqft?.carpet,bu),baseMaterial:yd(p.materialPerSqft?.carpet,bu),optionUnit:own?ou:'follows',optionLabor:optionPrice('laborPerSqft'),optionMaterial:optionPrice('materialPerSqft')};
}
// The prices each quote reads from what is stored, per square foot (as meaning()).
export function readFromStored(st){
  const ou=st.optionUnit==='follows'?st.baseUnit:st.optionUnit,base=[st.baseLabor,st.baseMaterial];
  const option=['optionLabor','optionMaterial'].map((k,i)=>{
    if(st[k]!=='inherit')return st[k]/9;
    if(base[i]===undefined)return undefined;
    const v=exactCarpetConversion(st.baseUnit===YD?base[i]:base[i]/9,st.baseUnit,ou);
    return v===null?undefined:ou===YD?v/9:v;
  });
  return [base.map(m=>m===undefined?undefined:m/9),option];
}
// Both sessions' changes kept: each stored setting from whichever session changed it.
export function combined(start,local,remote){
  const s0=stored(start),sa=stored(local),sb=stored(remote),out={};
  for(const k of Object.keys(s0)){const v=s0[k],a=sa[k],b=sb[k];if(a===v)out[k]=b;else if(b===v||a===b)out[k]=a;else return null;}
  return readFromStored(out);
}
