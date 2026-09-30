import fs from 'node:fs';import path from 'node:path';
import {cases} from './fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';
const dir=path.resolve(process.argv[2]);if(fs.existsSync(dir))throw Error('Fresh directory required');fs.mkdirSync(dir,{recursive:true});
// Independent hand-derived base amounts, cents. Do not read calculated engine line amounts to derive expectations.
const bases=[
 ['mowing-priced-extras-control',[['labor',10000],['disposal',1000],['addon',5000]]],
 ['floor-tile-200-control',[['labor',66000],['material',112000]]],
 ['concrete-base-control',[['labor',120000],['material',48889],['material',150000],['prep',35000]]],
 ['FENCING_INSTALL-itemized-control',[['labor',105600],['material',236400],['addon',50000,'sell_price']]],
 ['EXTERIOR_PAINTING-itemized-control',[['labor',125000],['prep',12000],['material',42400,'sell_price']]]
];
const expectations=[];
const roundDiv=(n,d)=>Number((2n*BigInt(n)+BigInt(d))/(2n*BigInt(d)));
for(const [id,base]of bases)for(const taxMode of ['TAX_NONE','TAX_ALL','TAX_MATERIALS'])for(const markupMode of ['markup','margin'])for(const markupPercent of [0,20])for(const minimum of [0,1000000])for(const fees of [false,true])for(const seasonal of [false,true]){
 const input=structuredClone(cases().find(c=>c.id===id).input);input.businessDefaults={...input.businessDefaults,taxMode,taxPercent:taxMode==='TAX_NONE'?0:15,markupMode,markupPercent,minimumJobPrice:minimum};
 const lines=base.map(([category,cents,basis])=>({category,cents,basis:basis||input.ownerPricing.priceBasisByCategory[category]}));
 if(fees)for(const [category,cents,field]of [['travel',1000,'travelFee'],['disposal',2000,'disposalFee'],['permit',3000,'permitFee'],['overhead',4000,'overheadFixed']]){
   input.ownerPricing.feeRules[category]='always';input.businessDefaults[field]=cents;
   if(!(id==='mowing-priced-extras-control'&&category==='disposal'))lines.push({category,cents,basis:'cost'});
 }
 if(seasonal){input.ownerPricing.peakMonths=[1];input.ownerPricing.peakSurchargePercent=10;lines.push({category:'surcharge',cents:roundDiv(lines.filter(x=>x.category==='labor').reduce((a,x)=>a+x.cents,0)*10,100),basis:'cost'});}
 for(const c of Object.keys(input.ownerPricing.taxabilityByCategory))input.ownerPricing.taxabilityByCategory[c]=['material','disposal'].includes(c);
 const markup=amount=>roundDiv(amount*markupPercent,markupMode==='margin'?100-markupPercent:100);
 const subtotal=lines.reduce((a,x)=>a+x.cents,0)+markup(lines.filter(x=>x.basis==='cost').reduce((a,x)=>a+x.cents,0));
 const materialBase=lines.filter(x=>['material','disposal'].includes(x.category));
 const taxBase=taxMode==='TAX_ALL'?Math.max(minimum,subtotal):materialBase.reduce((a,x)=>a+x.cents,0)+markup(materialBase.filter(x=>x.basis==='cost').reduce((a,x)=>a+x.cents,0));
 const tax=taxMode==='TAX_NONE'?0:roundDiv(taxBase*15,100);
 const expected=taxMode==='TAX_MATERIALS'?Math.max(minimum,subtotal+tax):Math.max(minimum,subtotal)+tax;
 expectations.push({id,taxMode,markupMode,markupPercent,minimum,fees,seasonal,expected,input,independentLines:lines});
}
fs.writeFileSync(path.join(dir,'expectations-before-execution.json'),JSON.stringify(expectations,null,2));
const results=expectations.map(c=>{const result=generateQuoteVNext(c.input),actualCents=result.resultType==='INSTANT_ESTIMATE_READY'?Math.round(result.midEstimate*100):null;return {...c,result,actualCents,passed:actualCents===c.expected};});
fs.writeFileSync(path.join(dir,'complete-results.json'),JSON.stringify(results,null,2));
const failures=results.filter(x=>!x.passed);console.log(JSON.stringify({cases:results.length,passed:results.length-failures.length,failures:failures.map(({id,expected,actualCents,taxMode,markupMode,markupPercent,minimum,fees,seasonal,result})=>({id,expected,actualCents,taxMode,markupMode,markupPercent,minimum,fees,seasonal,reason:result.reviewReason}))}));

