// One-time build of corpus-additions-20261117.json (engine v34): inputs that
// reach the November 17, 2026 owner round, items 1-7. Each result is worked by
// hand in test/qeOwnerRoundV34_20261117.spec.mjs. Run once; the output file is
// never edited.
// Usage: node --import ./test/pricebookTestEnv.mjs verification/engine-fingerprint/build-additions-20261117.mjs
import {writeFileSync} from 'node:fs';
import {siding,flooring,flatRepair,custom} from '../engine-independent/fixtures.mjs';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';
import {corpusInputs} from './fingerprint.mjs';
import {productKeyFromName} from '../../server/productNames.js';
const rows=[];const add=(id,input)=>rows.push({id,input:structuredClone(input)});
const rename=(obj,old,key)=>Array.isArray(obj)?obj.map(v=>rename(v,old,key)):obj&&typeof obj==='object'?Object.fromEntries(Object.entries(obj).map(([k,v])=>[k===old?key:k,rename(v,old,key)])):obj===old?key:obj;
// Item 1: vinyl fully priced, fiber cement with a labor price only.
let f=siding();f.ownerPricing.pricing.laborPerSqft.fiber_cement=500;
add('v34:item1-siding-vinyl-job-fiber-cement-half-priced',f);
f=structuredClone(f);f.customerInputs.sidingType='fiber_cement';
add('v34:item1-siding-fiber-cement-job-half-priced',f);
// Item 2: four 24 ft sides joined at corners, the last ending in the 4 ft gate.
function square(mode,corner){
  const g=offeringFixture('FENCING_INSTALL',mode),c=g.customerInputs;for(const k of ['linearFeet','lfMethod','gates','cornerCount'])delete c[k];
  c.fenceRuns=[{closed:true,sections:[{lengthLF:24},{lengthLF:24},{lengthLF:24},{lengthLF:24,gateAfter:'walk',...(corner===undefined?{}:{cornerAfterGate:corner})}]}];
  return g;
}
add('v34:item2-closed-square-corner-gate-installed',square('installed',true));
add('v34:item2-closed-square-corner-gate-itemized',square('itemized',true));
add('v34:item2-closed-square-gate-no-corner-itemized',square('itemized',false));
f=offeringFixture('FENCING_INSTALL','itemized');for(const k of ['linearFeet','lfMethod','gates','cornerCount'])delete f.customerInputs[k];
f.customerInputs.fenceRuns=[{closed:false,sections:[{lengthLF:20,gateAfter:'walk',cornerAfterGate:true},{lengthLF:30,gateAfter:'walk',cornerAfterGate:true}]}];
add('v34:item2-open-run-middle-and-end-gates-corner-itemized',f);
// Item 3: itemized painting, installed trim price set for fair trim.
for(const condition of ['good','poor']){
  f=offeringFixture('INTERIOR_PAINTING','itemized');f.ownerPricing.pricing.offeringDetails.trimSurfaceCondition='fair';f.customerInputs.trimSurfaceCondition=condition;
  add('v34:item3-itemized-fair-trim-price-'+condition+'-trim',f);
}
// Item 4: mulch stated yards, planting with and without the order increment.
const corpus=id=>structuredClone(corpusInputs().find(r=>r.id===id).input);
f=corpus('explanation:catalog-LANDSCAPING_MULCH');Object.assign(f.customerInputs,{inputMethod:'yards',mulchArea:2.3});delete f.customerInputs.mulchDepth;f.ownerPricing.pricing.mulchOrderIncrementCubicYards={brown:0.5};
add('v34:item4-mulch-stated-2.3-yards-half-yard-increment',f);
f=corpus('explanation:catalog-LANDSCAPING_PLANTING');f.ownerPricing.pricing.partialPackagePricing='exact_quantity';
add('v34:item4-planting-exact-quantity-no-increment',f);
f=corpus('explanation:catalog-LANDSCAPING_PLANTING');f.ownerPricing.pricing.mulchOrderIncrementCubicYards={brown:1};
add('v34:item4-planting-one-yard-increment',f);
// Item 5: an Ontario business, tax by job location off, 13%.
function provinceJob(code,extra={}){
  const g=flooring('tile',200);g.ownerPricing.taxabilityByCategory={...g.ownerPricing.taxabilityByCategory,labor:true,material:true};
  Object.assign(g.businessDefaults,{taxMode:'TAX_ALL',taxPercent:13,currency:'CAD',businessCountry:'CA',businessProvince:'ON',...extra});g.customerInputs.postalCode=code;return g;
}
add('v34:item5-on-business-alberta-job',provinceJob('T2P 1J9'));
add('v34:item5-on-business-toronto-job',provinceJob('M5V 2T6'));
add('v34:item5-on-business-bc-job-no-rate',provinceJob('V6B 1A1'));
add('v34:item5-on-business-bc-job-owner-rate',provinceJob('V6B 1A1',{provinceTaxPercent:{BC:12}}));
add('v34:item5-no-saved-province-alberta-job',(()=>{const g=provinceJob('T2P 1J9');delete g.businessDefaults.businessProvince;return g;})());
// Item 6: $600 of materials, $500 minimum, 10% materials tax, 20% range.
f=custom();Object.assign(f.ownerPricing.pricing,{customChargeClassification:'material',price:60000,minimumJob:50000});
f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,material:true};Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10,rangeBufferPercent:20});
add('v34:item6-materials-tax-minimum-floor',f);
// Item 7: a flat-roof repair type whose name starts with a digit.
add('v34:item7-flat-repair-digit-first-type',rename(flatRepair(),'seam_patch',productKeyFromName('2 ply seam patch').key));
writeFileSync(new URL('./corpus-additions-20261117.json',import.meta.url),JSON.stringify(rows,null,1)+'\n');
console.log(rows.length+' inputs written');
