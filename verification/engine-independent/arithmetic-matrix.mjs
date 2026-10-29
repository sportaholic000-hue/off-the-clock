import fs from 'node:fs';import path from 'node:path';
import {cases} from './fixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';
const dir=path.resolve(process.argv[2]);if(fs.existsSync(dir))throw Error('Fresh directory required');fs.mkdirSync(dir,{recursive:true});
// Independent hand-derived base amounts, cents. Do not read calculated engine line amounts to derive expectations.
const bases=[
 ['mowing-priced-extras-control',[['labor',10000],['disposal',1000],['labor',5000]]],
 ['floor-tile-200-control',[['labor',66000],['material',112000]]],
 ['concrete-base-control',[['labor',120000],['material',48889],['material',150000],['prep',35000]]],
 // Fence, 100 ft and 2 walk gates: labor 100 x 1,000; infill 110 ft (10% waste) x 2,000;
 // 18 posts x 2,000 material, x 400 footing labor, x 600 footing material; gates 2 x 25,000 installed
 // selling price, 60% labor (30,000) and 40% materials (20,000).
 ['FENCING_INSTALL-itemized-control',[['labor',100000],['material',220000],['material',36000],['labor',7200],['material',10800],['addon',50000,'sell_price',false,{labor:30000,material:20000}]]],
 // Exterior, 500 sq ft, 2 stories (x1.10 labor): finish labor 1,000 x 100 x 1.10; finish paint
 // 1,100 x 30; primer labor 500 x 50 x 1.10; primer 550 x 20; prep labor 500 x 100 x 1.10;
 // prep material 550 x 20. Prep labor counts as labor for the busy-season charge.
 ['EXTERIOR_PAINTING-itemized-control',[['labor',110000],['material',33000,'sell_price'],['labor',27500],['material',11000,'sell_price'],['prep',55000,undefined,true],['material',11000,'sell_price']]]
];
const expectations=[];
const roundDiv=(n,d)=>Number((2n*BigInt(n)+BigInt(d))/(2n*BigInt(d)));
for(const [id,base]of bases)for(const taxMode of ['TAX_NONE','TAX_ALL','TAX_MATERIALS'])for(const markupMode of ['markup','margin'])for(const markupPercent of [0,20])for(const minimum of [0,1000000])for(const fees of [false,true])for(const seasonal of [false,true]){
 const input=structuredClone(cases().find(c=>c.id===id).input);input.businessDefaults={...input.businessDefaults,taxMode,taxPercent:taxMode==='TAX_NONE'?0:15,markupMode,markupPercent,minimumJobPrice:minimum};
 const lines=base.map(([category,cents,basis,seasonalLabor,installed])=>({category,cents,basis:basis||input.ownerPricing.priceBasisByCategory[category],seasonalLabor:category==='labor'||seasonalLabor===true,installed}));
 if(fees)for(const [category,cents,field]of [['travel',1000,'travelFee'],['disposal',2000,'disposalFee'],['permit',3000,'permitFee'],['overhead',4000,'overheadFixed']]){
   input.ownerPricing.feeRules[category]='always';input.businessDefaults[field]=cents;
   if(!(id==='mowing-priced-extras-control'&&category==='disposal'))lines.push({category,cents,basis:'cost'});
 }
 if(seasonal){input.ownerPricing.peakMonths=[1];input.ownerPricing.peakSurchargePercent=10;// Labor inside an installed selling price gets its own busy-season line, also a selling price.
 const installedLabor=lines.reduce((a,x)=>a+(x.installed?.labor||0),0);
 lines.push({category:'surcharge',cents:roundDiv(lines.filter(x=>x.seasonalLabor).reduce((a,x)=>a+x.cents,0)*10,100),basis:'cost'});
 if(installedLabor)lines.push({category:'surcharge',cents:roundDiv(installedLabor*10,100),basis:'sell_price'});}
 for(const c of Object.keys(input.ownerPricing.taxabilityByCategory))input.ownerPricing.taxabilityByCategory[c]=['material','disposal'].includes(c);
 const markup=amount=>roundDiv(amount*markupPercent,markupMode==='margin'?100-markupPercent:100);
 const subtotal=lines.reduce((a,x)=>a+x.cents,0)+markup(lines.filter(x=>x.basis==='cost').reduce((a,x)=>a+x.cents,0));
 const materialBase=lines.filter(x=>['material','disposal'].includes(x.category));
 // Under materials-only tax an installed price is taxed on its materials share.
 const installedMaterials=lines.reduce((a,x)=>a+(x.installed?.material||0),0);
 const taxBase=taxMode==='TAX_ALL'?Math.max(minimum,subtotal):materialBase.reduce((a,x)=>a+x.cents,0)+markup(materialBase.filter(x=>x.basis==='cost').reduce((a,x)=>a+x.cents,0))+installedMaterials;
 const tax=taxMode==='TAX_NONE'?0:roundDiv(taxBase*15,100);
 const expected=Math.max(minimum,subtotal)+tax;
 expectations.push({id,taxMode,markupMode,markupPercent,minimum,fees,seasonal,expected,input,independentLines:lines});
}
fs.writeFileSync(path.join(dir,'expectations-before-execution.json'),JSON.stringify(expectations,null,2));
const results=expectations.map(c=>{const result=generateQuoteVNext(c.input),actualCents=result.resultType==='INSTANT_ESTIMATE_READY'?Math.round(result.midEstimate*100):null;return {...c,result,actualCents,passed:actualCents===c.expected};});
fs.writeFileSync(path.join(dir,'complete-results.json'),JSON.stringify(results,null,2));
const failures=results.filter(x=>!x.passed);console.log(JSON.stringify({cases:results.length,passed:results.length-failures.length,failures:failures.map(({id,expected,actualCents,taxMode,markupMode,markupPercent,minimum,fees,seasonal,result})=>({id,expected,actualCents,taxMode,markupMode,markupPercent,minimum,fees,seasonal,reason:result.reviewReason}))}));
// A mismatch is a failure, never a success.
if(failures.length)process.exitCode=1;
