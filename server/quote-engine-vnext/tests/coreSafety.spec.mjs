import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildSync} from 'esbuild';
import {generateQuoteVNext,vNextServiceStatus,sanitizeForCustomerVNext} from '../index.js';
import {createActivationQuoteCheckVNext} from '../engine.js';
import {paint,product,roof,fence,includedFixture} from './coreFixtures.mjs';
// Handwritten amounts are in CORE_FIXES_20261005.md before any execution.
function grouped(){const f=paint();f.ownerPricing.pricing.scopeDetails.paint_trim=product('trim',100);f.ownerPricing.pricing.scopeRates.paint_trim=0;Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:100});f.ownerPricing=includedFixture(f.ownerPricing,{'scopeRates.paint_trim':'scopeRates.paint_ceiling'});return f;}
test('core 4: grouped identities survive the receipt and customer projection ($350)',()=>{
 const q=generateQuoteVNext(grouped());assert.equal(q.midEstimate,350);assert.equal(sanitizeForCustomerVNext(q).midEstimate,350);
 const line=q.options[0].lineItems.find(line=>line.name==='Purchased materials: finish');
 assert.deepEqual(line.calculation.contributingRatePaths,['scopeRates.paint_wall','scopeRates.paint_ceiling']);
 const modified=structuredClone(q);modified.options[0].lineItems.find(line=>line.name==='Purchased materials: finish').calculation.contributingRatePaths.push('scopeRates.absent');
 assert.equal(sanitizeForCustomerVNext(modified).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
for(const variant of ['category','basis','unselected'])test('core 4: included-price identities preserve '+variant+' checks',()=>{
 let f=grouped();
 if(variant==='category')f.ownerPricing.zeroPricePolicy.includedPrices['scopeRates.paint_trim']='ceilingLaborPerSqftPerCoat';
 if(variant==='basis'){
  f=roof();f.ownerPricing.pricing.underlaymentPriceBasis.product_0='cost';f.ownerPricing.pricing.scopeDetails={roof_underlayment_product_0:product('underlay',100)};f.ownerPricing.pricing.scopeRates={roof_underlayment_product_0:0};f.customerInputs.roofUnderlaymentScopeConfirmed=true;
  f.ownerPricing=includedFixture(f.ownerPricing,{'scopeRates.roof_underlayment_product_0':'materialCostPerSquare.product_0'});
 }
 if(variant==='unselected'){f.customerInputs.ceilingsIncluded=false;delete f.customerInputs.ceilingAreaSqft;delete f.customerInputs.ceilingCoats;}
 const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
 if(variant!=='unselected')assert.ok(q.ownerDecisionRequired.some(d=>d.kind==='included_price_allocation'),JSON.stringify(q));
});
test('core 5: missing optional share is irrelevant with tax off ($4250)',()=>{
 const f=fence();f.customerInputs.gates={walk:1};f.businessDefaults.taxMode='TAX_NONE';f.businessDefaults.taxPercent=0;
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');assert.equal(generateQuoteVNext(f).midEstimate,4250);
});
test('core 6: another good tier cannot hide the requested activation option failure',()=>{
 const f=roof();f.ownerPricing.tiers=[{name:'Incomplete',overrides:{materialCostPerSquare:{product_0:0}}},{name:'Complete',overrides:{}}];
 assert.equal(createActivationQuoteCheckVNext(f,'Incomplete')(f.customerInputs).resultType,'ESTIMATE_REQUIRES_REVIEW');
 const check=createActivationQuoteCheckVNext(f,'Complete');assert.equal(check(f.customerInputs).resultType,'INSTANT_ESTIMATE_READY');assert.equal(generateQuoteVNext(f).midEstimate,1710);
 f.ownerPricing.tiers[1].overrides.materialCostPerSquare={product_0:0};assert.equal(check(f.customerInputs).resultType,'INSTANT_ESTIMATE_READY');
 assert.equal(createActivationQuoteCheckVNext(f,'Complete')(f.customerInputs).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('core 9: zero is a valid explicit installed materials percentage ($1710)',()=>{
 const f=roof(12,{shares:false});f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;f.ownerPricing.pricing.installedMaterialsPercent={'underlaymentPerSquare.product_0':0};
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');assert.equal(generateQuoteVNext(f).midEstimate,1710);
});
test('core 8: rendered coverage field states linear feet in visible and accessible labels',t=>{
 const directory=mkdtempSync(join(tmpdir(),'core-trim-render-')),outfile=join(directory,'render.cjs');t.after(()=>rmSync(directory,{recursive:true,force:true}));
 buildSync({stdin:{contents:"import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {ScopeEditor} from './client/src/scopeEditor.jsx';export const render=service=>renderToStaticMarkup(<ScopeEditor service={service} onChange={()=>{}}/>);",resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',outfile,logLevel:'silent'});
 const f=paint();f.ownerPricing.pricing.scopeDetails.paint_trim=product('trim',100);f.ownerPricing.pricing.scopeRates.paint_trim=3000;
 const markup=createRequire(import.meta.url)(outfile).render(f.ownerPricing);
 assert.match(markup,/aria-label="Complete trim coating materials — Coverage per purchased package \(linear feet\)"/);
 assert.match(markup,/Coverage per purchased package \(linear feet\)/);
 assert.match(markup,/Wall finish materials — Coverage per purchased package \(square feet\)/);
});
