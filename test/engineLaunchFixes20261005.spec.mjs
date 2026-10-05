import './pricebookTestEnv.mjs';
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, existsSync, readFileSync, readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {fixture, flooring} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {generateQuoteVNext, sanitizeForCustomerVNext, vNextServiceStatus, ENGINE_VERSION} from '../server/quote-engine-vnext/index.js';
import {MEASUREMENT_CONTRACTS} from '../server/quote-engine-vnext/contracts.js';
import {scopeCustomerErrors} from '../server/quote-engine-vnext/scopePricing.js';
import {BASIC_PAINT_PREPARATION_NOTICE, scopeDefinitions} from '../server/scopeConfiguration.js';
import {validateInterviewConfiguration, materializeInterviewFields} from '../server/interviewConfiguration.js';
import {validateInterviewValue} from '../server/src/priceBookAI.js';
import {productKeyFromName} from '../server/productNames.js';
import {productKeyFromName as editorProductKey} from '../client/src/pricebookFormatting.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook, savePricebook} from '../server/priceBookService.js';

// All dollar expectations were written before execution, with arithmetic in
// specs/QUOTE_LAUNCH_DECISIONS_20261005.md. Configuration/UI/review checks
// produce no dollar estimate. Never derive expectations from actual results.
const ready = input => {const q=generateQuoteVNext(input);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;};
const amount = (q,name) => q.lineItems.find(line=>line.name===name)?.amountCents;
const caseInput = id => structuredClone(measuredScopeCases().find(row=>row.id===id).input);
function paint(condition='good') {
  const input=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:90,materialPerWallSqftPerCoat:20,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:800,wallHeight:'standard',surfaceCondition:condition,wallScopeUniform:true,coats:2,ceilingsIncluded:false,trimIncluded:false});
  input.ownerPricing.priceBasisByCategory.material='sell_price';
  return input;
}
const temporary=mkdtempSync(join(resolve('.'),'launch-render-test-'));let controls,scopeEditor;
before(async()=>{
  for(const [name,entry] of [['controls','client/src/quoteDoneControls.jsx'],['scope','client/src/scopeEditor.jsx']]) {
    const file=join(temporary,name+'.mjs');
    await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,logLevel:'silent',define:{'import.meta.env':'{}'}});
    const exports=await import(pathToFileURL(file));if(name==='controls')controls=exports;else scopeEditor=exports;
  }
});
after(()=>rmSync(temporary,{recursive:true,force:true}));
const render=(Component,props)=>renderToStaticMarkup(React.createElement(Component,props));

test('launch 1: basic painting stays live with an explicit owner limitation; good walls cost $1792',()=>{
  const f=paint(),status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(status.status,'QUOTING LIVE');
  assert.deepEqual(status.statusNotices,[BASIC_PAINT_PREPARATION_NOTICE]);
  assert.ok(render(controls.ServiceStatusNotices,{status}).includes(BASIC_PAINT_PREPARATION_NOTICE));
  const q=ready(f);assert.equal(amount(q,'Wall labor'),144000);assert.equal(amount(q,'Wall paint and materials'),35200);assert.equal(q.midEstimate,1792);
});
for(const condition of ['fair','poor'])test('launch 1: basic '+condition+' walls explain itemized preparation',()=>{
  const q=generateQuoteVNext(paint(condition));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(q.reviewReason,BASIC_PAINT_PREPARATION_NOTICE);
});
test('launch 1: preparation product hidden in basic scope editor and visible in itemized mode',()=>{
  const service=paint().ownerPricing,props={service,onChange:()=>{}};
  assert.ok(!render(scopeEditor.ScopeEditor,props).includes('Preparation materials'));
  service.pricing.offeringMode='itemized';assert.ok(render(scopeEditor.ScopeEditor,props).includes('Preparation materials'));
  assert.deepEqual(vNextServiceStatus(service,paint().businessDefaults).statusNotices,[]);
});

for(const buildingType of [undefined,'residential','commercial'])test('launch 2: flat roof $14700 with building type '+buildingType,()=>{
  const f=fixture('FLAT_ROOF_REPLACEMENT',{laborPerSqft:{epdm:500,tpo:500},membraneCostPerSqft:{epdm:700,tpo:700},tearOffPerSqft:{epdm:200,tpo:200},minimumJob:0},{roofSqft:1000,sqftMethod:'exact',membraneType:'epdm',replacementMembraneType:'tpo',existingLayers:1,accessDifficulty:'easy',serviceScope:'full',insulationNeeded:false,coverboardNeeded:false,...(buildingType?{buildingType}:{})});
  const q=ready(f);assert.equal(q.midEstimate,14700);assert.deepEqual(q.lineItems.map(line=>line.amountCents),[500000,770000,200000]);
  assert.ok(!MEASUREMENT_CONTRACTS.FLAT_ROOF_REPLACEMENT.required(f.customerInputs).includes('buildingType'));
});

for(const [name,key] of [['vinyl plank','vinyl_plank'],['Ceramic tile','ceramic_tile'],['Cedar privacy','cedar_privacy']])test('launch 3: interview and editor agree on '+name,()=>{
  assert.equal(editorProductKey,productKeyFromName);assert.deepEqual(productKeyFromName(name),{key});
  const registry=validateInterviewValue('FLOORING_INSTALL','knownOfferings',{existingFloorType:{[name]:true}});
  assert.deepEqual(registry,{existingFloorType:{[key]:true}});
  assert.deepEqual(validateInterviewConfiguration('FENCING_INSTALL','offeringDetails',{fenceType:name},{offeringMode:'itemized'}),{fenceType:key});
  const result=materializeInterviewFields('FLOORING_INSTALL',{knownOfferings:{existingFloorType:{[name]:true}}},()=> 'synthetic-offering-id');
  assert.deepEqual(result.knownOfferings,{existingFloorType:{[key]:'synthetic-offering-id'}});
});
for(const pair of [['vinyl plank','vinyl_plank'],['Ceramic tile','ceramic-tile'],['Cédar privacy','Cedar privacy']])test('launch 3: reject normalized collision '+pair.join('/'),()=>{
  assert.throws(()=>validateInterviewValue('FLOORING_INSTALL','knownOfferings',{existingFloorType:Object.fromEntries(pair.map(name=>[name,true]))}),/already listed/);
});
test('launch 3: gate names normalize, canonical scope aliases stay unchanged, and collisions never overwrite',()=>{
  const gates={'Walk gate':{widthLF:3,description:'[SYNTHETIC] Gate',postsAndFootingsIncluded:true}};
  assert.deepEqual(Object.keys(validateInterviewConfiguration('FENCING_INSTALL','offeringDetails',{gates}).gates),['walk_gate']);
  assert.throws(()=>validateInterviewConfiguration('FENCING_INSTALL','offeringDetails',{gates:{...gates,walk_gate:gates['Walk gate']}}),/already listed/);
  const detail={description:'[SYNTHETIC]',existingFloorType:'Ceramic tile'};
  assert.deepEqual(validateInterviewConfiguration('FLOORING_INSTALL','scopeDetails',{floor_overlay__2:detail}),{floor_overlay__2:{...detail,existingFloorType:'ceramic_tile'}});
});

test('launch 4: real peak controls show optional/off explanation and month names at both levels',()=>{
  const f=paint();f.ownerPricing.peakMonths=[1];
  const html=render(controls.ServiceRules,{service:f.ownerPricing,meta:{},defaults:f.businessDefaults,onService:()=>{},onDefault:()=>{}});
  assert.ok(html.includes('Optional busy-season labor surcharge'));
  assert.ok(html.includes('Off unless set; 0 means off; adds the entered percentage to labor in the chosen months.'));
  for(const month of ['January','February','March','April','May','June','July','August','September','October','November','December'])assert.ok(html.includes('This service month '+month)&&html.split(month).length>=3,month);
  assert.ok(!html.includes('This service month 1"'));
});

for(const preview of [false,true])test('launch 5: never-approved '+(preview?'owner preview':'quote')+' names missing approval',()=>{
  const f=paint();delete f.ownerPricing.origin;f.ownerPricing.active=false;f.allowInactiveOwnerPreview=preview;
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(q.reviewReason,'This service has not been approved for quoting yet.');
});
test('launch 5: an active service with a conflicting creation receipt still fails identity checks',()=>{
  const f=paint();f.ownerPricing.origin.serviceType='CUSTOM';
  assert.equal(generateQuoteVNext(f).reviewReason,'Service identity and type do not agree.');
});

test('launch 6: slab below the only demolition band has only a thickness error',()=>{
  const f=caseInput('demolition-itemized'),p=f.ownerPricing.pricing;
  p.scopeDetails.demolition.minimumThickness=4;f.customerInputs.demolitionThickness=3;
  const errors=scopeCustomerErrors(f.serviceType,f.customerInputs,p,f.ownerPricing);
  assert.deepEqual(errors.map(error=>error.field),['demolitionThickness']);
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.invalidCustomerFields,['demolitionThickness']);
});
test('launch 6: genuinely mismatching demolition access is still reported',()=>{
  const f=caseInput('demolition-itemized');f.ownerPricing.pricing.scopeDetails.demolition.minimumThickness=4;f.customerInputs.demolitionThickness=3;f.customerInputs.demolitionAccessDifficulty='easy';
  assert.deepEqual(scopeCustomerErrors(f.serviceType,f.customerInputs,f.ownerPricing.pricing,f.ownerPricing).map(error=>error.field),['demolitionThickness','demolitionAccessDifficulty']);
});
for(const mode of ['installed','itemized'])test('launch 7: capitalized layer disclosures keep the $16900 total '+mode,()=>{
  const q=ready(caseInput('commercial-'+mode));assert.equal(q.midEstimate,16900);
  const customer=sanitizeForCustomerVNext(q);assert.match(customer.disclaimer,/Insulation: /);assert.match(customer.disclaimer,/Coverboard: /);assert.doesNotMatch(customer.disclaimer,/(?:^|\. )(?:insulation|coverboard): /);
});

test('launch 8: production has no retired calculators or legacy status API; shared metadata remains usable',async()=>{
  for(const path of ['server/quoteEngine.js','server/quoteTemplates.js'])assert.equal(existsSync(path),false,path);
  const storage=await import('../server/priceBookService.js');
  for(const key of ['pricebookServiceStatus','pricebookStatuses','pricebookDraftValidation','pricebookDraftStatuses','saveValidatedPricebook'])assert.equal(key in storage,false,key);
  const walk=directory=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&!['node_modules','dist','data'].includes(entry.name)?walk(join(directory,entry.name)):entry.isFile()?[join(directory,entry.name)]:[]);
  for(const file of [...walk('server'),...walk('client/src')].filter(file=>/\.(?:m?js|jsx)$/.test(file)))assert.doesNotMatch(readFileSync(file,'utf8'),/(?:from\s*|import\s*\(|require\s*\()\s*['"][^'"]*(?:quoteEngine\.js|quoteTemplates\.js|test\/legacy)/,file);
  const metadata=await import('../server/priceBookLegacyFields.js');assert.deepEqual(metadata.getRequiredOwnerFields('FLAT_ROOF_REPLACEMENT',{buildingType:'residential'}),['laborPerSqft','membraneCostPerSqft','tearOffPerSqft','minimumJob']);
});

function peak(regular=10005,installed=10005) {
  const f=caseInput('overlay-installed'),p=f.ownerPricing.pricing;
  f.customerInputs.sqft=1;f.customerInputs.roomCount=1;p.roomComplexityMultiplier={small:1,medium:1,large:1};
  p.laborPerSqft.tile=regular;p.materialPerSqft.tile=100;p.scopeRates.floor_overlay_installed=installed;
  p.installedLaborPercent={'scopeRates.floor_overlay_installed':100};
  f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=10;
  return f;
}
for(const [regular,installed,regularPeak,installedPeak,total] of [[10005,10005,1001,1000,22123],[10006,10005,1001,1000,22124],[10005,10006,1000,1001,22124],[10004,10004,1001,1000,22121],[10009,10009,1001,1001,22132]])test('launch rounding: '+regular+'/'+installed+' labor yields '+total+' cents',()=>{
  const q=ready(peak(regular,installed));assert.equal(amount(q,'Peak season adjustment'),regularPeak);assert.equal(amount(q,'Peak season adjustment on installed prices'),installedPeak);assert.equal(q.midEstimate,total/100);
  assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');
  const tampered=structuredClone(q);tampered.lineItems.find(line=>line.category==='surcharge').amountCents++;
  assert.equal(sanitizeForCustomerVNext(tampered).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('launch rounding: allocated installed-price surcharge receives no additional markup ($232.24)',()=>{
  const f=peak();f.businessDefaults.markupPercent=10;f.businessDefaults.markupApplies=Object.fromEntries(Object.keys(f.businessDefaults.markupApplies).map(key=>[key,['labor','surcharge'].includes(key)]));
  const q=ready(f);assert.equal(q.midEstimate,232.24);assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');
});
for(const off of ['zero','month'])test('launch peak off '+off+' leaves $201.22',()=>{
  const f=peak();if(off==='zero')f.ownerPricing.peakSurchargePercent=0;else f.currentMonth=2;
  const q=ready(f);assert.equal(q.midEstimate,201.22);assert.ok(q.lineItems.every(line=>line.category!=='surcharge'));
});
for(const [sqft,band,labor,total] of [[450,'small',162000,4050],[900,'medium',297000,7830]])test('launch room maximum inclusive: '+sqft+'/3 -> '+band,()=>{
  const f=flooring('vinyl_plank',sqft);f.customerInputs.roomCount=3;
  const q=ready(f);assert.equal(amount(q,'Flooring labor'),labor);assert.equal(q.midEstimate,total);assert.equal(q.options[0].calculationRecord.ruleApplications.find(rule=>rule.name==='averageRoomComplexityBand').result,band);
});
test('launch arithmetic version invalidates v5 approvals; reapproval restores the $221.23 quote',()=>{
  const f=peak(),owner='synthetic-launch-'+randomUUID(),service=structuredClone(f.ownerPricing);delete service.origin;
  const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'USD',quoteTimeZone:'UTC'}},'toDollars');
  bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),...draft});
  const approve=()=>bridge.approveApplicationService(owner,service.id,{revision:bridge.bookRevision(loadPricebook(owner)),confirmConfiguration:true,confirmLegacySettings:true});
  approve();let book=loadPricebook(owner);book.services[0].quoteDoneApproval.engineVersion='quote-engine-vnext-audit-repairs-20261005-v5';savePricebook(owner,book);
  book=loadPricebook(owner);assert.equal(bridge.applicationStatus(book.services[0],book).approvalCurrent,false);assert.notEqual(ENGINE_VERSION,'quote-engine-vnext-audit-repairs-20261005-v5');
  approve();book=loadPricebook(owner);assert.equal(bridge.applicationStatus(book.services[0],book).approvalCurrent,true);
  const q=bridge.calculateApplicationQuote(book,book.services[0],{customerInputs:f.customerInputs,requestId:randomUUID()},{ownerId:owner,preparingIntake:true,quoteInstant:new Date('2026-01-05T12:00:00Z')});
  assert.equal(q.internalResult.midEstimate,221.23);assert.equal(q.customerResult.resultType,'INSTANT_ESTIMATE_READY');
});
test('launch labels equal the owner-approved wording',()=>{
  const flat=MEASUREMENT_CONTRACTS.FLAT_ROOF_REPLACEMENT.fields;
  assert.equal(flat.insulationNeeded.label,'New insulation needed');assert.equal(flat.coverboardNeeded.label,'New coverboard needed');
  assert.equal(MEASUREMENT_CONTRACTS.CONCRETE_PATIO_SLAB.fields.adjoinsExistingConcrete.label,'Does any edge touch a house foundation, garage foundation, or existing concrete?');
  assert.equal(scopeDefinitions('CONCRETE_PATIO_SLAB').demolition.fields.minimumThickness.label,'Covers slabs thicker than (optional lower limit)');
  assert.equal(scopeDefinitions('FLOORING_INSTALL').stairs.fields.minimumWidthLF.label,'Covers treads wider than (optional lower limit)');
});
