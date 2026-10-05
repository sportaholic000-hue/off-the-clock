import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {buildSync} from 'esbuild';
process.env.PRICEBOOK_PATH=fs.mkdtempSync(path.join(os.tmpdir(),'quote-decision-followup-'));
const bridge=await import('../server/src/quoteDoneBridge.js');
const {savePricebook,loadPricebook}=await import('../server/priceBookService.js');
const {fixture,mowing,flooring}=await import('../verification/engine-independent/fixtures.mjs');
const {offeringFixture}=await import('./configuredOfferingsFixtures.mjs');
const {generateQuoteVNext,vNextServiceStatus,sanitizeForCustomerVNext}=await import('../server/quote-engine-vnext/index.js');
const {applicationQuoteMonth}=await import('../server/src/quoteDate.js');
const {applicationMetadata}=bridge;

function roof(){return fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:8500},materialCostPerSquare:{asphalt_shingle:12000},tearOffPerSquare:{asphalt_shingle:4500},underlaymentPerSquare:{asphalt_shingle:1800},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},accessoryPricingMode:'per_square_allin',minimumJob:0},{roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'medium',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});}
function peak(f,months=[10]){delete f.ownerPricing.peakMonths;delete f.ownerPricing.peakSurchargePercent;Object.assign(f.businessDefaults,{peakMonths:months,peakSurchargePercent:10});f.currentMonth=10;return f;}
function ready(f,total){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,total);assert.equal(sanitizeForCustomerVNext(q).midEstimate,total/100);return q;}
function save(f){const id='[SYNTHETIC]-'+crypto.randomUUID(),raw=structuredClone(f.ownerPricing);delete raw.origin;savePricebook(id,{services:[raw],defaults:{currency:'CAD',...f.businessDefaults}});return {id,book:loadPricebook(id)};}
function approve(id){let book=loadPricebook(id),s=book.services[0];bridge.approveApplicationService(id,s.id,{revision:bridge.bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true,fields:bridge.applicationStatus(s,book).confirmationFields});return loadPricebook(id);}
function quote(book,id,inputs,quoteInstant='2026-10-03T12:00Z',timeZone='America/Halifax'){return bridge.calculateApplicationQuote(book,book.services[0],{serviceId:book.services[0].id,customerInputs:inputs},{ownerId:id,quoteInstant:new Date(quoteInstant),timeZone});}

test('G1 roof stays live throughout the year without an installed-underlayment labor share',()=>{
 const f=peak(roof(),[7]),{id}=save(f),book=approve(id);
 assert.equal(bridge.applicationStatus(book.services[0],book).status,'QUOTING LIVE');
 for(let month=1;month<=12;month++){const q=quote(book,id,f.customerInputs,`2026-${String(month).padStart(2,'0')}-15T12:00Z`);assert.equal(q.customerResult.midEstimate,month===7?6289:5990);}
 f.businessDefaults.peakMonths=[10];ready(f,628900);
 f.ownerPricing.pricing.installedLaborPercent={'underlaymentPerSquare.asphalt_shingle':60};ready(f,631060);
});
test('G1 peak uses explicit fence labor plus only the entered installed-gate labor share',()=>{
 const f=peak(offeringFixture('FENCING_INSTALL','itemized'));Object.assign(f.customerInputs,{cornerCount:2,gates:{walk:1}});
 delete f.ownerPricing.pricing.installedLaborPercent;ready(f,409720);
 f.ownerPricing.pricing.installedLaborPercent={'offeringRates.gate_walk':60};const q=ready(f,411220);
 // Explicit labor and the installed gate's labor share each get their surcharge line; the installed one is a selling price (never marked up).
 const explicit=q.lineItems.find(l=>l.name==='Peak season adjustment'),installed=q.lineItems.find(l=>l.name==='Peak season adjustment on installed prices');
 assert.equal(explicit.calculation.basisAmountCents+installed.calculation.basisAmountCents,122200);assert.equal(explicit.amountCents+installed.amountCents,12220);
 assert.equal(installed.calculation.basisAmountCents,15000);assert.equal(installed.priceBasis,'sell_price');
});
for(const [type,mode,total] of [['FENCING_INSTALL','installed',450000],['FENCING_INSTALL','itemized',434720],['FENCING_REPLACEMENT','installed',490000],['FENCING_REPLACEMENT','itemized',474720],['INTERIOR_PAINTING','installed',380000],['INTERIOR_PAINTING','itemized',352200],['EXTERIOR_PAINTING','installed',300000],['EXTERIOR_PAINTING','itemized',247500]])test('G1 missing installed labor allocation never blocks peak '+type+' '+mode,()=>{
 const f=peak(offeringFixture(type,mode));delete f.ownerPricing.pricing.installedLaborPercent;
 if(type==='EXTERIOR_PAINTING'){f.customerInputs.stories=1;f.ownerPricing.pricing.offeringDetails.stories=1;}
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');ready(f,total);
});
test('G1 materials-only tax remains independent of missing installed labor share',()=>{
 const f=peak(offeringFixture('FENCING_INSTALL','installed'));delete f.ownerPricing.pricing.installedLaborPercent;Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:15});ready(f,477000);
});
test('G1 installed floor underlayment and additional installed scopes do not require a seasonal labor share',()=>{
 const vinyl=peak(flooring('vinyl_plank'));Object.assign(vinyl.ownerPricing.pricing,{vinylPlankUnderlaymentRule:'always_included',underlaymentPriceBasis:'installed_area_sell_price',underlaymentPerSqft:100});
 ready(vinyl,200600);assert.equal(vNextServiceStatus(vinyl.ownerPricing,vinyl.businessDefaults).status,'QUOTING LIVE');
 const hardwood=peak(flooring('hardwood'));Object.assign(hardwood.ownerPricing.pricing,{scopeDetails:{floor_underlayment_hardwood:{description:'[SYNTHETIC] Installed underlayment',mode:'installed_area_sell_price'}},scopeRates:{floor_underlayment_hardwood:100}});hardwood.customerInputs.underlaymentScopeConfirmed=true;
 ready(hardwood,202600);assert.equal(vNextServiceStatus(hardwood.ownerPricing,hardwood.businessDefaults).status,'QUOTING LIVE');
 hardwood.ownerPricing.pricing.installedLaborPercent={'scopeRates.floor_underlayment_hardwood':0};ready(hardwood,202600);
});

const migrations=[['FENCING_INSTALL','itemized','terrainSlope','moderate',444580],['FENCING_INSTALL','itemized','terrainSlope','steep',465160],['FENCING_INSTALL','installed','terrainSlope','steep',531000],['INTERIOR_PAINTING','itemized','wallHeight','high',352200],['INTERIOR_PAINTING','itemized','wallHeight','vaulted',387450],['INTERIOR_PAINTING','installed','wallHeight','high',401600],['EXTERIOR_PAINTING','itemized','stories',2,247500],['EXTERIOR_PAINTING','itemized','stories',3,265000],['EXTERIOR_PAINTING','installed','stories',2,318000],['EXTERIOR_PAINTING','installed','stories',3,336000]];
for(const [type,mode,field,value,total] of migrations)test('G2 old '+type+' '+mode+' '+value+' requires explicit baseline confirmation',()=>{
 const f=offeringFixture(type,mode),p=f.ownerPricing.pricing;p.offeringDetails[field]=value;delete p.offeringDetails.baselinePricesConfirmed;f.customerInputs[field]=value;
 const prices=structuredClone(p.offeringRates),q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(JSON.stringify(q.ownerDecisionRequired),/baseline/i);assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
 p.offeringDetails.baselinePricesConfirmed=true;ready(f,total);assert.deepEqual(p.offeringRates,prices);
});
test('G2 saving or approving a legacy offering cannot silently confirm its baseline; explicit confirmation persists',()=>{
 const f=offeringFixture('EXTERIOR_PAINTING','itemized');delete f.ownerPricing.pricing.offeringDetails.baselinePricesConfirmed;
 const {id}=save(f);let book=approve(id);assert.equal(bridge.applicationStatus(book.services[0],book).status,'NEEDS PRICING');assert.equal(quote(book,id,f.customerInputs).customerResult.resultType,'ESTIMATE_REQUIRES_REVIEW');
 const prices=structuredClone(book.services[0].pricing.offeringRates),draft=bridge.readApplicationBook(id);draft.services[0].pricing.offeringDetails.baselinePricesConfirmed=true;
 bridge.saveApplicationBook(id,draft);book=loadPricebook(id);assert.equal(bridge.applicationStatus(book.services[0],book).approvalCurrent,false);
 book=approve(id);assert.equal(bridge.applicationStatus(book.services[0],book).status,'QUOTING LIVE');assert.equal(quote(book,id,f.customerInputs).customerResult.midEstimate,2475);assert.deepEqual(book.services[0].pricing.offeringRates,prices);assert.equal(book.services[0].pricing.offeringDetails.stories,2);
});
test('G2 baseline offerings need no migration confirmation; strings cannot counterfeit confirmation',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed');delete f.ownerPricing.pricing.offeringDetails.baselinePricesConfirmed;ready(f,450000);
 f.ownerPricing.pricing.offeringDetails.terrainSlope='steep';for(const flag of [false,'true',1,null]){f.ownerPricing.pricing.offeringDetails.baselinePricesConfirmed=flag;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');}
});

test('G3 missing quote/profile zone keeps quoting while explicit Atlantic choice respects the local month',()=>{
 const f=peak(mowing()),{id}=save(f),book=approve(id);
 assert.equal(quote(book,id,f.customerInputs,'2026-10-03T12:00Z',null).customerResult.midEstimate,110);
 assert.equal(applicationQuoteMonth(f.ownerPricing,f.businessDefaults,{quoteInstant:new Date('2026-10-03T12:00Z')}),10);
 for(const timeZone of ['UTC',null,'invalid'])assert.equal(applicationQuoteMonth(f.ownerPricing,{...f.businessDefaults,quoteTimeZone:'America/Halifax'},{timeZone,quoteInstant:new Date('2026-11-01T01:30:00Z')}),10);
 const local=structuredClone(book);local.defaults.quoteTimeZone='America/Halifax';savePricebook(id,local);const approved=approve(id);
 assert.equal(quote(approved,id,f.customerInputs,'2026-11-01T01:30Z','UTC').customerResult.midEstimate,110);
 assert.equal(quote(approved,id,f.customerInputs,'2026-11-01T04:30Z','UTC').customerResult.midEstimate,100);
});

let rendered;
function renderers(){if(rendered)return rendered;const temp=fs.mkdtempSync(path.join(os.tmpdir(),'quote-followup-render-')),file=path.join(temp,'render.cjs');buildSync({stdin:{contents:"import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {OfferingEditor} from './client/src/offeringEditor.jsx';import {ServiceRules} from './client/src/quoteDoneControls.jsx';export const offering=props=>renderToStaticMarkup(<OfferingEditor {...props} onChange={()=>{}}/>);export const rules=props=>renderToStaticMarkup(<ServiceRules {...props} onService={()=>{}} onDefault={()=>{}}/>);",resolveDir:process.cwd(),loader:'jsx'},bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent'});rendered=createRequire(import.meta.url)(file);return rendered;}
test('G2 actual offering component states baseline conditions beside prices and shows legacy notice',()=>{
 const meta=applicationMetadata().services;
 for(const [type,baseline,field,value] of [['FENCING_INSTALL','flat ground','terrainSlope','steep'],['INTERIOR_PAINTING','standard-height walls','wallHeight','vaulted'],['EXTERIOR_PAINTING','one-story building','stories',3]]){
  const f=offeringFixture(type,'itemized');f.ownerPricing.pricing.offeringDetails[field]=value;delete f.ownerPricing.pricing.offeringDetails.baselinePricesConfirmed;
  const html=renderers().offering({service:f.ownerPricing,meta:meta.find(m=>m.serviceType===type)});assert.match(html,new RegExp(baseline));assert.match(html,/confirm.*baseline prices/i);assert.match(html,/does not quote until/i);
 }
});
test('G3 actual quote controls ask for time zone with business or service peak months and never auto-select one',()=>{
 const f=mowing(),render=defaults=>renderers().rules({service:f.ownerPricing,defaults,meta:{}});
 assert.doesNotMatch(render(f.businessDefaults),/Choose a business time zone for peak pricing/);
 assert.match(render({...f.businessDefaults,peakMonths:[7]}),/Choose a business time zone for peak pricing/);
 f.ownerPricing.peakMonths=[10];assert.match(render(f.businessDefaults),/Choose a business time zone for peak pricing/);
 assert.doesNotMatch(render({...f.businessDefaults,quoteTimeZone:'UTC'}),/Choose a business time zone for peak pricing/);
});

test('Locked independent roof and tile product controls remain 599000 and 178000 cents',()=>{ready(roof(),599000);const f=flooring();Object.assign(f.ownerPricing.pricing.laborPerSqft,{vinyl_plank:300});Object.assign(f.ownerPricing.pricing.materialPerSqft,{vinyl_plank:500});f.ownerPricing.pricing.vinylPlankUnderlaymentRule='owner_review';ready(f,178000);});
