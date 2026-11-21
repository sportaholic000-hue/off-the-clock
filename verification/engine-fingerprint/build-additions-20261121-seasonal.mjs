import {writeFileSync} from 'node:fs';
import {mowing,flatRoof,fixture} from '../engine-independent/fixtures.mjs';

const cases=[];
function peak(input){
  Object.assign(input.ownerPricing,{peakMonths:[7],peakSurchargePercent:10});
  input.currentMonth=7;input.customerInputs.workMonth='july';input.businessDefaults.markupPercent=50;
  return input;
}
function add(id,input){cases.push({id:'seasonal-20261121:'+id,input:structuredClone(input)});}
const f=peak(mowing());f.ownerPricing.pricing.mowingBaseRatePerSqft=20;
f.ownerPricing.priceBasisByCategory.surcharge='sell_price';
add('labor-cost-surcharge-sell',f);
f.ownerPricing.priceBasisByCategory.surcharge='cost';f.businessDefaults.markupApplies.surcharge=false;
add('labor-cost-surcharge-off',f);
f.ownerPricing.priceBasisByCategory.labor='sell_price';f.businessDefaults.markupApplies.surcharge=true;
add('labor-sell-surcharge-cost',f);
const mixed=peak(flatRoof());
mixed.businessDefaults.markupApplies=Object.fromEntries(Object.keys(mixed.businessDefaults.markupApplies).map(key=>[key,key==='labor']));
mixed.ownerPricing.priceBasisByCategory.removal='sell_price';
add('mixed-labor-and-removal',mixed);
const custom=peak(fixture('CUSTOM',{customPricingMode:'fixed',customChargeClassification:'addon',price:100000,unit:'flat',minimumJob:0,installedMaterialsPercent:{price:40}},
  {service:'[SYNTHETIC] Split service',serviceConfirmed:true,unit:'flat'}));
custom.ownerPricing.service=custom.customerInputs.service;custom.businessDefaults.markupApplies.surcharge=false;add('custom-cost-split',custom);
writeFileSync(new URL('./corpus-additions-20261121-seasonal.json',import.meta.url),JSON.stringify(cases,null,2)+'\n');
