import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {engine,mulch,roof,mowing,concrete,fence,coverageCases} from './opusQuoteFixtures.mjs';
const rows=[];
const quote=input=>{const r=engine.generateQuoteVNext(input);assert.equal(r.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(r));const c=engine.sanitizeForCustomerVNext(r);assert.equal(c.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(c));rows.push({input,internal:r,customer:c});return {r,c};};
test.after(()=>{if(process.env.OPUS_CASE_EVIDENCE)fs.writeFileSync(process.env.OPUS_CASE_EVIDENCE,JSON.stringify(rows,null,2));});
test('Opus 1: decking explanations never expose the owner unit price',()=>{
 for(const sheets of [undefined,0,2]){const {r,c}=quote(roof(sheets));assert.equal(r.calculationRecord.options[0].scenarios.mid.finalTotalCents,231000+(sheets||0)*8900);assert.doesNotMatch(JSON.stringify(c),/billed at|\$89\.00\/sheet/);assert.match(c.priceDrivers.join(' '),/decking.*per sheet.*confirmed on site/i);}
});
for(const [mode,tax,total]of [['TAX_NONE',0,45000],['TAX_MATERIALS',767,45767],['TAX_ALL',6750,51750]])test('Opus 2: '+mode+' preserves the 45000-cent pre-tax minimum',()=>{
 const {r,c}=quote(mulch(mode)),s=r.calculationRecord.options[0].scenarios.mid;
 assert.equal(s.lineItems.find(x=>x.name==='Mulch material').amountCents,5111);
 assert.equal(s.lineItems.find(x=>x.name==='Mulch installation labor').amountCents,2667);
 assert.equal(s.minimum.adjustmentCents,37222);
 assert.equal(s.tax.taxCents,tax);
 assert.equal(s.finalTotalCents,total);assert.equal(c.midEstimate,total/100);
 assert.ok(c.lowEstimate*100>=45000+tax,'The customer lower bound must also preserve the pre-tax floor.');
});
for(const mode of ['installed','itemized'])for(const height of [0.5,3.5,5,5.5,7,9])test('Opus 3: '+mode+' fencing quotes only its explicitly offered '+height+'ft height',()=>{
 const input=fence(height,mode),{r}=quote(input);assert.equal(r.calculationRecord.options[0].scenarios.mid.finalTotalCents,mode==='installed'?450000:392000);
 input.customerInputs.fenceHeight=height+0.25;assert.equal(engine.generateQuoteVNext(input).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('Opus 3: zero, negative, missing and nonnumeric offered fence heights fail closed',()=>{
 for(const height of [0,-1,undefined,'5.5',Infinity,NaN]){const f=fence(height);f.ownerPricing.pricing.offeringDetails.fenceHeight=height;f.customerInputs.fenceHeight=height;assert.equal(engine.generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');}
});
for(const frequency of ['weekly','biweekly','monthly','one_time'])test('Opus 4: mowing '+frequency+' labels prices per visit',()=>{
 const {c}=quote(mowing(frequency));assert.equal(c.priceUnit,'per visit');assert.ok(c.options.every(o=>o.priceUnit==='per visit'));
});
for(const mode of ['TAX_NONE','TAX_MATERIALS','TAX_ALL'])test('Opus 5: every '+mode+' option states its tax treatment',()=>{
 const {c}=quote(mulch(mode)),expected=mode==='TAX_NONE'?'No tax added.':'Includes applicable tax.';
 assert.equal(c.taxTreatment,expected);assert.ok(c.options.every(o=>o.taxTreatment===expected));
});
for(const {id,key,input}of coverageCases())test('Opus 6: '+id+' reports lead-only scope before activation and in saved service status',()=>{
 assert.equal(engine.generateQuoteVNext(input).resultType,'ESTIMATE_REQUIRES_REVIEW');
 for(const active of [false,true]){input.ownerPricing.active=active;const status=engine.vNextServiceStatus(input.ownerPricing,input.businessDefaults);assert.equal(status.scopeCoverage?.find(x=>x.key===key)?.configurationComplete,false);assert.match(status.scopeCoverage.find(x=>x.key===key).message,/lead/i);}
});
for(const {id,key,input}of coverageCases(true))test('Opus 6 control: '+id+' remains quotable with complete scope setup',()=>{
 quote(input);const status=engine.vNextServiceStatus(input.ownerPricing,input.businessDefaults);assert.equal(status.scopeCoverage?.find(x=>x.key===key)?.configurationComplete,true);
});
for(const [finish,access,labor,total]of [['stamped','difficult',225000,443889],['smooth','difficult',157500,356389],['stamped','easy',180000,398889]])test('Opus 7: access applies to all '+finish+' labor with '+access+' access',()=>{
 const {r}=quote(concrete(finish,access)),s=r.calculationRecord.options[0].scenarios.mid;
 assert.equal(s.lineItems.find(x=>x.name==='Concrete labor').amountCents,labor);
 assert.equal(s.lineItems.find(x=>x.name==='Ready-mix concrete').amountCents,48889);
 assert.equal(s.finalTotalCents,total);
});
