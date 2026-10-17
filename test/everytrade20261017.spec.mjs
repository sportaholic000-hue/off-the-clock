import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {custom} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {validateBusinessDefaults,validateServiceRulesDetailed,validatePricingStructuresDetailed} from '../server/quote-engine-vnext/contracts.js';
import {convertApplicationBook} from '../server/src/quoteDoneBridge.js';
import {ownerJobMetrics} from '../server/src/ownerJobMetrics.js';
import {createOwnerJobCostService} from '../server/src/ownerJobCosts.js';
import {ownerCallFixture} from './helpers/ownerCallFixture.mjs';
import {createOwnerReportService} from '../server/src/ownerReportService.js';
import {createOwnerWorkflowService} from '../server/src/ownerWorkflowService.js';
import {integratedBaselineExpectation} from './finalIntegrationMetadata20261017Fixture.mjs';

// Synthetic inputs; independent oracles were written in EXPECTATIONS.md first.
const fixture=()=>{const f=custom();Object.assign(f.businessDefaults,{currency:'CAD',rangeBufferPercent:10});f.ownerPricing.pricing.price=97600;return f;};
const range=result=>result.options[0].calculationRecord.range;
const stable=value=>JSON.parse(JSON.stringify(value,(key,v)=>key==='quoteId'?'synthetic-quote-id':v));
const baseline=JSON.parse(gunzipSync(readFileSync(new URL('../verification/everytrade-20261017/base-quotes.json.gz',import.meta.url))));
for(const row of baseline)test('unchanged pinned quote and book: '+row.id,()=>{
 assert.deepEqual(stable(generateQuoteVNext(row.input)),integratedBaselineExpectation(row));
 assert.deepEqual(convertApplicationBook(convertApplicationBook({services:[row.input.ownerPricing],defaults:row.input.businessDefaults},'toDollars'),'toCents'),row.book);
});
test('range endpoints, independent service overrides, private settings and unchanged display',()=>{
 const f=fixture(),old=generateQuoteVNext(f);assert.deepEqual([range(old).lowCents,range(old).highCents],[87840,107360]);assert.deepEqual([old.lowEstimate,old.highEstimate],[878,1074]);
 Object.assign(f.businessDefaults,{rangeLowPercent:5,rangeHighPercent:15});let result=generateQuoteVNext(f);
 assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.deepEqual([range(result).lowCents,range(result).highCents],[92720,112240]);
 const safe=sanitizeForCustomerVNext(result);assert.equal(safe.resultType,'INSTANT_ESTIMATE_READY');assert.doesNotMatch(JSON.stringify(safe),/rangeLowPercent|rangeHighPercent|lowBufferPercent|highBufferPercent|rangeBufferUsed/);
 f.ownerPricing.rangeLowPercent=2;result=generateQuoteVNext(f);assert.deepEqual([range(result).lowCents,range(result).highCents],[95648,112240]);
 f.ownerPricing.rangeHighPercent=0;result=generateQuoteVNext(f);assert.equal(range(result).highCents,97600);
 const tampered=structuredClone(result);tampered.options[0].calculationRecord.range.highBufferPercent=1;assert.equal(sanitizeForCustomerVNext(tampered).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('legacy single-buffer evidence retains its 25% bound',()=>{
 const f=fixture();Object.assign(f.businessDefaults,{rangeLowPercent:30,rangeHighPercent:30});const result=generateQuoteVNext(f),option=result.options[0],evidence=option.calculationRecord.range;
 evidence.source='business_range_buffer';delete evidence.lowBufferPercent;delete evidence.highBufferPercent;
 for(const key of ['bufferPercent','effectiveRangeBufferPercent','rangeBufferUsed'])evidence[key]=30;
 option.rangeBufferUsed=30;option.effectiveRangeBufferPercent=30;result.rangeBufferUsed=30;result.effectiveRangeBufferPercent=30;
 assert.equal(sanitizeForCustomerVNext(result).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('blank range sides fall back; wide high bands, minimum and zero side validation',()=>{
 const f=fixture();Object.assign(f.businessDefaults,{rangeLowPercent:null,rangeHighPercent:''});assert.deepEqual([range(generateQuoteVNext(f)).lowCents,range(generateQuoteVNext(f)).highCents],[87840,107360]);
 Object.assign(f.businessDefaults,{rangeLowPercent:0,rangeHighPercent:30});assert.equal(range(generateQuoteVNext(f)).highCents,126880);
 f.ownerPricing.pricing.minimumJob=100000;let result=generateQuoteVNext(f);assert.deepEqual([range(result).lowCents,range(result).highCents],[100000,100000]);assert.equal(sanitizeForCustomerVNext(result).resultType,'INSTANT_ESTIMATE_READY');
 for(const invalid of [-1,101,NaN,Infinity,'5']){f.businessDefaults.rangeLowPercent=invalid;assert.equal(validateBusinessDefaults(f.businessDefaults).ok,false);}
 f.ownerPricing.rangeHighPercent=-1;assert.ok(validateServiceRulesDetailed(f.ownerPricing,'CUSTOM').some(d=>d.path==='rangeHighPercent'));
});
function splitFixture(){const f=fixture();f.ownerPricing.pricing.price=100000;f.ownerPricing.pricing.installedMaterialsPercent={price:40};f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=20;Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:15});return f;}
test('custom materials share gives exact tax, labor surcharge and total',()=>{
 const f=splitFixture(),result=generateQuoteVNext(f);assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');const scenario=result.options[0].calculationRecord.scenarios.mid;
 assert.equal(scenario.tax.taxCents,6000);assert.equal(scenario.seasonal.customLaborSurchargeCents,12000);assert.equal(scenario.finalTotalCents,118000);
 assert.equal(sanitizeForCustomerVNext(result).resultType,'INSTANT_ESTIMATE_READY');assert.doesNotMatch(JSON.stringify(sanitizeForCustomerVNext(result)),/installedMaterials|customPriceSplit|actualLabor|Custom service labor/);
 delete f.ownerPricing.pricing.installedMaterialsPercent;const blank=generateQuoteVNext(f).options[0].calculationRecord.scenarios.mid;assert.equal(blank.finalTotalCents,120000);assert.equal(blank.tax.taxCents,0);
});
test('custom split follows labor/material markup flags, sell basis, and intrinsic scenarios',()=>{
 const f=splitFixture();f.ownerPricing.peakMonths=[];Object.assign(f.ownerPricing.priceBasisByCategory,{labor:'cost',material:'cost'});f.businessDefaults.markupPercent=10;f.businessDefaults.markupApplies.material=false;
 let scenario=generateQuoteVNext(f).options[0].calculationRecord.scenarios.mid;assert.equal(scenario.markup.amountCents,6000);assert.equal(scenario.finalTotalCents,112000);
 f.businessDefaults.markupApplies.labor=false;f.businessDefaults.markupApplies.material=true;scenario=generateQuoteVNext(f).options[0].calculationRecord.scenarios.mid;assert.equal(scenario.markup.amountCents,4000);assert.equal(scenario.finalTotalCents,110600);
 Object.assign(f.ownerPricing.priceBasisByCategory,{labor:'sell_price',material:'sell_price'});scenario=generateQuoteVNext(f).options[0].calculationRecord.scenarios.mid;assert.equal(scenario.markup.amountCents,0);assert.equal(scenario.finalTotalCents,106000);
 Object.assign(f.ownerPricing.pricing,{customPricingMode:'range',low:100000,high:200000});delete f.ownerPricing.pricing.price;const result=generateQuoteVNext(f);assert.deepEqual([range(result).lowCents,range(result).midCents,range(result).highCents],[106000,159000,212000]);assert.equal(sanitizeForCustomerVNext(result).resultType,'INSTANT_ESTIMATE_READY');
});
test('custom shares reject invalid values and conserve billed cents at tiny boundaries',()=>{
 const f=splitFixture();for(const invalid of [-1,101,'40',null,NaN]){f.ownerPricing.pricing.installedMaterialsPercent.price=invalid;assert.ok(validatePricingStructuresDetailed('CUSTOM',f.ownerPricing.pricing).length);}
 for(const share of [0,25,50,100]){f.ownerPricing.pricing.installedMaterialsPercent.price=share;f.ownerPricing.pricing.price=1;f.ownerPricing.peakMonths=[];f.businessDefaults.taxMode='TAX_NONE';f.businessDefaults.taxPercent=0;
 const result=generateQuoteVNext(f);assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(result.options[0].calculationRecord.scenarios.mid.finalTotalCents,1);assert.equal(sanitizeForCustomerVNext(result).resultType,'INSTANT_ESTIMATE_READY');}
});
const receipt=(mid)=>({customerResult:{resultType:'INSTANT_ESTIMATE_READY',lowEstimate:mid*90/100,midEstimate:mid,highEstimate:mid*110/100,currency:'CAD'},internalResult:{resultType:'INSTANT_ESTIMATE_READY',lineItems:[{category:'labor',amountCents:30000,calculation:{effectivePriceBasis:'cost'}},{category:'material',amountCents:20000,calculation:{effectivePriceBasis:'cost'}}]}});
const jobs=()=>[1000,2000,1500,900].map((mid,index)=>({id:'synthetic-job-'+index,serviceType:'CUSTOM',resultJson:JSON.stringify(receipt(mid)),finalInvoiceAmount:[105000,230000,140000,null][index]}));
const costs=()=>[{quoteId:'synthetic-job-0',dataJson:JSON.stringify({actualLaborHours:8.5,actualLaborCostCents:40000,actualMaterialCostCents:30000,approvedChanges:[]})},{quoteId:'synthetic-job-1',dataJson:JSON.stringify({approvedChanges:[{amountCents:20000,description:'[SYNTHETIC] Approved additional scope'}]})}];
test('accuracy independent three-job oracle and metric-specific coverage',()=>{
 const g=ownerJobMetrics(jobs(),costs())[0];assert.equal(g.jobs,4);
 assert.equal(ownerJobMetrics([jobs()[0]],[{quoteId:jobs()[0].id,dataJson:'broken'}])[0].insideRange.count,0);assert.deepEqual(g.records.map(r=>r.originalScopeInvoice),['1050.00','2100.00','1400.00',null]);
 assert.deepEqual(g.insideRange,{count:3,inside:3,percent:'100.00'});assert.deepEqual(g.signedGap,{count:3,value:'16.67'});assert.deepEqual(g.signedGapPercent,{count:3,value:'1.11'});assert.deepEqual(g.absoluteGap,{count:3,value:'83.33'});assert.deepEqual(g.absoluteGapPercent,{count:3,value:'5.56'});assert.deepEqual(g.realizedMargin,{count:1,value:'33.33'});
 assert.deepEqual(g.labor,{count:1,estimated:'300.00',actual:'400.00',gap:'100.00'});assert.deepEqual(g.material,{count:1,estimated:'200.00',actual:'300.00',gap:'100.00'});assert.deepEqual(g.actualLaborHours,{count:1,value:'8.50'});
});
test('metrics exclude missing middles, zero denominators, unknown tiers, currencies and sell-price budgets separately',()=>{
 const rows=jobs();let r=receipt(1000);delete r.customerResult.midEstimate;rows[0].resultJson=JSON.stringify(r);
 r=receipt(0);rows[1].resultJson=JSON.stringify(r);rows[1].finalInvoiceAmount=0;
 r=receipt(1500);r.customerResult.options=[{...r.customerResult,tierName:'One'},{...r.customerResult,tierName:'Two'}];rows[2].resultJson=JSON.stringify(r);
 let g=ownerJobMetrics(rows,costs())[0];assert.equal(g.signedGap.count,0);assert.equal(g.signedGapPercent.count,0);assert.equal(g.insideRange.count,1);
 rows[2].tierChosen='Two';g=ownerJobMetrics(rows,costs())[0];assert.equal(g.signedGap.count,1);
 const other=jobs()[0];r=receipt(1000);r.customerResult.currency='USD';other.resultJson=JSON.stringify(r);assert.equal(ownerJobMetrics([...jobs(),other],costs()).length,2);
 r=receipt(1000);r.internalResult.lineItems[0].calculation.effectivePriceBasis='sell_price';other.resultJson=JSON.stringify(r);assert.equal(ownerJobMetrics([other],costs())[0].labor.count,0);
});
test('owner cost storage is separate, tenant-bound, revisioned, durable and absent from staff views',t=>{
 const f=ownerCallFixture();t.after(()=>f.db.close());const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/);return f.db.prepare(sql);};const service=createOwnerJobCostService({database:f.db,ownerQuery});
 const ownerId='synthetic-a',id=ownerId+'-quote',request={ownerId,id,body:{revision:0,actualLaborHours:'8.5',actualLaborCost:'400.00',actualMaterialCost:'300',approvedChanges:[{amount:'200',description:'[SYNTHETIC] Added scope'}]}};
 const before=f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(ownerId,id).resultJson;
 const report=createOwnerReportService({ownerQuery,clock:()=>new Date('2026-10-17T12:00:00Z')});const totals=report.report({ownerId,query:{period:'all'}});
 assert.equal(service.save(request).actualLaborCostCents,40000);assert.equal(service.view({ownerId,id}).approvedChanges[0].amountCents,20000);
 assert.throws(()=>service.save(request),{statusCode:409});assert.throws(()=>service.save({...request,role:'staff'}),{statusCode:403});assert.throws(()=>service.view({ownerId,id:'synthetic-b-quote'}),{statusCode:404});
 assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(ownerId,id).resultJson,before);
 const after=report.report({ownerId,query:{period:'all'}});assert.deepEqual(after.values,totals.values);assert.deepEqual(after.counts,totals.counts);assert.deepEqual(after.funnel,totals.funnel);
 const staff=createOwnerWorkflowService({database:f.db,ownerQuery}).view(ownerId,'quotes',id,'staff');assert.doesNotMatch(JSON.stringify(staff),/actualLabor|actualMaterial|Added scope/);assert.equal(report.report({ownerId,role:'staff'}).jobMetrics,undefined);
 const updated=service.save({...request,body:{...request.body,revision:1,actualLaborHours:'0',actualLaborCost:'',actualMaterialCost:'0',approvedChanges:[]}});assert.equal(updated.actualLaborHours,0);assert.equal(updated.actualLaborCostCents,null);assert.equal(updated.actualMaterialCostCents,0);
 for(const fields of [{actualLaborCost:'-1'},{actualLaborHours:'-1'},{approvedChanges:[{amount:'1',description:''}]},{actualLaborHours:'1e3'}])assert.throws(()=>service.save({...request,body:{...request.body,revision:2,...fields}}),{statusCode:400});
});

test('new settings and custom share survive the real saved-book, approval and interview paths',async()=>{
 const {savedDisplayFixture,date}=await import('./quoteDisplayFixtures20261006.mjs');
 const {applicationMetadata,readApplicationBook,saveApplicationBook,approveApplicationService}=await import('../server/src/quoteDoneBridge.js');
 const {validateInterviewValue}=await import('../server/src/priceBookAI.js');
 const {migrate}=await import('../server/src/db.js');migrate();
 const f=splitFixture();f.ownerPricing.peakMonths=[1,10];Object.assign(f.businessDefaults,{rangeLowPercent:5,rangeHighPercent:15});f.ownerPricing.rangeLowPercent=2;
 const saved=savedDisplayFixture(f);assert.equal(saved.book.defaults.rangeHighPercent,15);assert.equal(saved.book.services[0].rangeLowPercent,2);assert.equal(saved.book.services[0].pricing.installedMaterialsPercent.price,40);
 const preview=saved.preview(f.customerInputs);assert.ok(JSON.stringify(preview).includes('1180'));
 const field=applicationMetadata().services.find(s=>s.serviceType==='CUSTOM').fields.find(f=>f.field==='installedMaterialsPercent');assert.deepEqual(field.tree.leafKeys,['price']);
 assert.deepEqual(validateInterviewValue('CUSTOM','installedMaterialsPercent',{price:40},f.ownerPricing.pricing),{price:40});
 const book=readApplicationBook(saved.owner);const unchanged=saveApplicationBook(saved.owner,book,date);assert.equal(readApplicationBook(saved.owner).services[0].pricing.installedMaterialsPercent.price,40);
 const next=readApplicationBook(saved.owner);delete next.services[0].pricing.installedMaterialsPercent;delete next.services[0].rangeLowPercent;delete next.defaults.rangeLowPercent;delete next.defaults.rangeHighPercent;saveApplicationBook(saved.owner,next,date);
 const last=readApplicationBook(saved.owner);approveApplicationService(saved.owner,last.services[0].id,{revision:last.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
 assert.equal(readApplicationBook(saved.owner).services[0].pricing.installedMaterialsPercent,undefined);
});
