import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
process.env.PRICEBOOK_PATH=fs.mkdtempSync(path.join(os.tmpdir(),'quote-trade-'));
process.env.JWT_SECRET='[SYNTHETIC] quote-trade-regression';
const bridge=await import('../server/src/quoteDoneBridge.js');
const {savePricebook,loadPricebook,validatePricebookShape}=await import('./legacy/priceBookService.js');
const {flooring,mowing,concrete,flatRoof,flatRepair}=await import('../verification/engine-independent/fixtures.mjs');
const {generateQuoteVNext,vNextServiceStatus,sanitizeForCustomerVNext}=await import('../server/quote-engine-vnext/index.js');
const {offeringFixture}=await import('./configuredOfferingsFixtures.mjs');
const {fixture}=await import('../verification/engine-independent/fixtures.mjs');
function cents(f,expected){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,expected);assert.equal(sanitizeForCustomerVNext(q).resultType,'INSTANT_ESTIMATE_READY');return q;}
function saved(f){
 const id='[SYNTHETIC]-'+crypto.randomUUID(),raw=structuredClone(f.ownerPricing);delete raw.origin;savePricebook(id,{services:[raw],defaults:{currency:'CAD',...f.businessDefaults}});
 let b=loadPricebook(id),s=bridge.applicationStatus(b.services[0],b);
 bridge.approveApplicationService(id,b.services[0].id,{revision:bridge.bookRevision(b),confirmConfiguration:true,confirmLegacySettings:true,fields:s.confirmationFields});
 return {id,book:loadPricebook(id)};
}
for(const other of ['vinyl_plank','hardwood'])test('T01 complete tile remains live beside incomplete '+other,()=>{
 const f=flooring();f.ownerPricing.pricing.laborPerSqft[other]=300;f.ownerPricing.pricing.materialPerSqft[other]=500;f.ownerPricing.pricing.vinylPlankUnderlaymentRule='owner_review';
 const {book,id}=saved(f),raw=book.services[0];assert.equal(bridge.applicationStatus(raw,book).status,'QUOTING LIVE');
 const out=bridge.calculateApplicationQuote(book,raw,{serviceId:raw.id,customerInputs:f.customerInputs},{ownerId:id});
 assert.equal(out.customerResult.midEstimate,1780);
});
test('T02 customer output excludes owner buffer, revision and internal service identity',()=>{
 const f=flooring(),{book,id}=saved(f),raw=book.services[0];const out=bridge.calculateApplicationQuote(book,raw,{serviceId:raw.id,customerInputs:f.customerInputs},{ownerId:id}).customerResult;
 for(const key of ['rangeBufferUsed','bookRevision','serviceId'])assert.equal(JSON.stringify(out).includes('"'+key+'"'),false,key);
});
test('T03 configured peak season does not disable service',()=>{
 const f=mowing();delete f.ownerPricing.peakMonths;delete f.ownerPricing.peakSurchargePercent;Object.assign(f.businessDefaults,{peakMonths:[3],peakSurchargePercent:10});
 const {book}=saved(f);assert.equal(bridge.applicationStatus(book.services[0],book).status,'QUOTING LIVE');
});
test('T03 local quote month determines labor surcharge across UTC month boundary',()=>{
 const f=mowing();delete f.ownerPricing.peakMonths;delete f.ownerPricing.peakSurchargePercent;Object.assign(f.businessDefaults,{peakMonths:[3],peakSurchargePercent:10});
 const {book,id}=saved(f),raw=book.services[0],body={serviceId:raw.id,customerInputs:f.customerInputs};
 const date={ownerId:id,quoteInstant:new Date('2026-04-01T00:30:00Z')};
 assert.equal(bridge.calculateApplicationQuote(book,raw,body,{...date,timeZone:'America/Los_Angeles'}).customerResult.midEstimate,110);
 assert.equal(bridge.calculateApplicationQuote(book,raw,body,{...date,timeZone:'Asia/Tokyo'}).customerResult.midEstimate,100);
 assert.equal(bridge.previewApplicationQuote(id,{revision:bridge.bookRevision(book),...body},{...date,timeZone:'America/Los_Angeles'}).midEstimate,110);
});
test('T04 fence derives 18 posts, waste on infill only and terrain on labor only',()=>{
 const f=offeringFixture('FENCING_INSTALL','itemized');Object.assign(f.customerInputs,{cornerCount:2,gates:{walk:1}});
 const q=cents(f,399000);assert.equal(q.lineItems.find(line=>line.calculation?.ratePath==='offeringRates.postMaterialEach').calculation.quantity,18);
 f.customerInputs.terrainSlope='moderate';cents(f,417330);
 f.ownerPricing.pricing.offeringDetails.gates.walk.postsAndFootingsIncluded=true;cents(f,411210);
});
test('T05 patterned flooring changes labor and retains existing additive material waste',()=>{
 const f=flooring();cents(f,178000);f.customerInputs.layoutPattern='diagonal_or_pattern';cents(f,198200);
});
test('T06 membrane waste does not increase labor or tear-off',()=>{cents(flatRoof(),1470000);});
test('T06 flat repair access affects labor, not fixed material allowance',()=>{
 const f=flatRepair();cents(f,36000);f.customerInputs.accessDifficulty='moderate';cents(f,40500);
});
test('T07 measured concrete area and perimeter match rectangular control; impossible geometry stays review-only',()=>{
 const f=concrete();Object.assign(f.customerInputs,{dimensionMethod:'measured_area_perimeter',areaSqft:200,perimeterLF:60});delete f.customerInputs.length;delete f.customerInputs.width;
 cents(f,353889);f.customerInputs.reinforcement='rebar';cents(f,397889);
 f.customerInputs.perimeterLF=40;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('T08 stated mulch yards are used as-is; only derived yards receive ordering overage',()=>{
 const f=fixture('LANDSCAPING_MULCH',{minimumServiceCharge:0,mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:2000},{inputMethod:'yards',mulchArea:10,mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy'});
 cents(f,70000);f.customerInputs.accessDifficulty='moderate';cents(f,72000);
 Object.assign(f.customerInputs,{inputMethod:'sqft',mulchArea:1080,mulchDepth:3});cents(f,79500);
});
test('T09 a minimum-priced job shows one exact price including applicable tax',()=>{
 const f=mowing();Object.assign(f.businessDefaults,{minimumJobPrice:25001,rangeBufferPercent:10,taxMode:'TAX_ALL',taxPercent:10});
 const q=cents(f,27501);assert.deepEqual([q.lowEstimate,q.midEstimate,q.highEstimate],[275.01,275.01,275.01]);
});
test('T10 itemized painting uses the entire painted area for condition preparation and wastes materials only',()=>{
 const f=offeringFixture('INTERIOR_PAINTING','itemized');cents(f,328700);
 f.customerInputs.wallHeight='high';cents(f,352200); // Trim stays 20000; wall/ceiling labor adds 23500.
 f.customerInputs.wallHeight='standard';f.customerInputs.coats=1;cents(f,240700);
 f.customerInputs.coats=3;cents(f,416700);
 f.customerInputs.surfaceCondition='poor';assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
 Object.assign(f.ownerPricing.pricing.offeringRates,{prepLaborPerSqft_poor:200,prepMaterialPerSqft_poor:40});cents(f,502100);
});
test('T11 installed materials-only tax uses the explicit share; tax-all and no-tax totals stay unchanged',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed');f.customerInputs.gates={};f.ownerPricing.pricing.offeringRates.installedFencePerLF=1000;
 Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:8});delete f.ownerPricing.pricing.installedMaterialsPercent;
 assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
 f.ownerPricing.pricing.installedMaterialsPercent={'offeringRates.installedFencePerLF':40};cents(f,103200);
 f.businessDefaults.taxMode='TAX_ALL';cents(f,108000);
 Object.assign(f.businessDefaults,{taxMode:'TAX_NONE',taxPercent:0});cents(f,100000);
});
test('T12 installed labor-only adjustments preserve materials and produce one customer total',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed');f.customerInputs.gates={};f.ownerPricing.pricing.offeringRates.installedFencePerLF=1000;
 f.ownerPricing.pricing.terrainLaborMultiplier.moderate=1.25;f.customerInputs.terrainSlope='moderate';
 cents(f,115000);Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:8});cents(f,118200);
 f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=10;cents(f,125700); // 75000 adjusted labor × 10%; material tax remains3200.
 const q=sanitizeForCustomerVNext(generateQuoteVNext(f));for(const word of ['installedLabor','installedMaterial','lineItems','rateCents','taxCents'])assert.equal(JSON.stringify(q).includes(word),false);
 delete f.ownerPricing.pricing.installedLaborPercent;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('T13 asphalt remains quotable beside incomplete metal; complete control stays 599000 cents',()=>{
 const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:8500,metal:8500},materialCostPerSquare:{asphalt_shingle:12000,metal:12000},tearOffPerSquare:{asphalt_shingle:4500,metal:4500},underlaymentPerSquare:{asphalt_shingle:1800,metal:1800},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price',metal:'installed_area_sell_price'},accessoryPricingMode:'per_square_allin',minimumJob:0},{roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'medium',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
 cents(f,599000);f.ownerPricing.pricing.underlaymentPriceBasis.metal='cost';
 const {book,id}=saved(f),raw=book.services[0];assert.equal(bridge.applicationStatus(raw,book).status,'QUOTING LIVE');
 const result=bridge.calculateApplicationQuote(book,raw,{serviceId:raw.id,customerInputs:f.customerInputs},{ownerId:id});assert.equal(result.customerResult.midEstimate,5990);
 assert.equal(JSON.stringify(result.customerResult.pricedScope).includes('asphalt_shingle'),false);
});

test('T14 saved quote timezone survives reload, overrides profile zone, and rejects invalid zones',()=>{
 const f=mowing();delete f.ownerPricing.peakMonths;delete f.ownerPricing.peakSurchargePercent;
 Object.assign(f.businessDefaults,{peakMonths:[3],peakSurchargePercent:10,quoteTimeZone:'America/Los_Angeles'});
 const {book,id}=saved(f);assert.equal(book.defaults.quoteTimeZone,'America/Los_Angeles');
 const out=bridge.calculateApplicationQuote(book,book.services[0],{serviceId:book.services[0].id,customerInputs:f.customerInputs},{ownerId:id,timeZone:'Asia/Tokyo',quoteInstant:new Date('2026-04-01T00:30Z')});assert.equal(out.customerResult.midEstimate,110);
 for(const zone of ['',null,'Mars/Olympus',17]){const changed=structuredClone(book);changed.defaults.quoteTimeZone=zone;assert.throws(()=>validatePricebookShape(bridge.convertApplicationBook(changed,'toDollars')),/time zone/i);}
 assert.deepEqual(loadPricebook(id),book);
});
test('T15 waste rates are independently editable; accessories and decking have distinct quantity rules',()=>{
 const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:100},materialCostPerSquare:{asphalt_shingle:100},tearOffPerSquare:{asphalt_shingle:100},underlaymentPerSquare:{asphalt_shingle:100},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},minimumJob:0,accessoryPricingMode:'itemized',materialAccessoryBasis:'excludes_itemized_accessories',starterPerLF:100,dripEdgePerLF:200,ridgeCapPerLF:300,deckingPerSheet:400},{roofSizeMethod:'roof_measured',roofSizeInput:100,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',starterLengthLF:10,dripEdgeLengthLF:10,ridgeCapLengthLF:10,deckingSheets:2});
 const q=cents(f,7810); //410 base +1100 starter +2200 drip +3300 ridge +800 sheets.
 assert.equal(q.lineItems.find(x=>x.name==='Decking replacement').amountCents,800);
 f.ownerPricing.pricing.accessoryWasteFactor={starterPerLF:0,dripEdgePerLF:.2,ridgeCapPerLF:.3};cents(f,8510);
});
test('T16 concrete wire and stamped material each add quantity waste without multiplying labor twice',()=>{
 const f=concrete();f.customerInputs.reinforcement='wire_mesh';cents(f,386889); //353889+200*1.1*150.
 f.customerInputs.reinforcement='none';f.customerInputs.finishType='stamped';
 cents(f,479889); //Labor180000 + concrete48889 +forms150000 +prep35000 +stamped66000.
});
test('T17 planting uses access on labor, direct mulch yards, and no waste on plant counts',()=>{
 const f=fixture('LANDSCAPING_PLANTING',{minimumServiceCharge:0,plantingLaborPerPlant:{small:1000,medium:2000,large:3000},plantMaterialAllowance:{small:500,medium:1000,large:1500},mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:2000},{plantsBySize:{small:2,medium:0,large:0},bedCondition:'clean',mulchNeeded:true,mulchYards:2,mulchType:'brown',accessDifficulty:'easy'});
 cents(f,17000);f.customerInputs.accessDifficulty='moderate';cents(f,17600); //6000labor*1.1 +11000 materials.
});
test('T18 installed shares preserve fractional-cent allocation until tax rounding and reject impossible splits',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed'),p=f.ownerPricing.pricing;
 Object.assign(p.offeringRates,{installedFencePerLF:.005,gate_walk:2});f.customerInputs.gates={walk:1};
 p.installedLaborPercent={'offeringRates.installedFencePerLF':50,'offeringRates.gate_walk':50};p.installedMaterialsPercent=structuredClone(p.installedLaborPercent);
 Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:100});cents(f,5); //billed lines 1+2=3; materials are half of the billed lines = 1.5, kept exact until tax; 100% tax = 1.5 -> 2 (half up).
 for(const value of [-1,101,NaN,Infinity,60]){p.installedMaterialsPercent['offeringRates.installedFencePerLF']=value;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');}
});
test('T19 installed underlayment also uses an explicit materials share',()=>{
 const f=flooring('hardwood');f.ownerPricing.pricing.scopeDetails={floor_underlayment_hardwood:{description:'[SYNTHETIC] Complete underlayment',mode:'installed_area_sell_price'}};
 f.ownerPricing.pricing.scopeRates={floor_underlayment_hardwood:100};f.customerInputs.underlaymentScopeConfirmed=true;
 f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;
 assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
 f.ownerPricing.pricing.installedMaterialsPercent={'scopeRates.floor_underlayment_hardwood':40};cents(f,196800); //176000floor+20000installed+800tax; ordinary category taxability is explicitlyfalse.
});
test('T20 customer field contracts exclude post count and preparation area, and require new measured facts',async()=>{
 const {offeringContract}=await import('../server/quote-engine-vnext/configuredOfferings.js');
 const {MEASUREMENT_CONTRACTS}=await import('../server/quote-engine-vnext/contracts.js');
 for(const type of ['FENCING_INSTALL','FENCING_REPLACEMENT','INTERIOR_PAINTING','EXTERIOR_PAINTING'])for(const mode of ['installed','itemized']){
  const f=offeringFixture(type,mode),c=offeringContract(type,f.ownerPricing.pricing);
  assert.equal(Object.hasOwn(c.fields,'postCount'),false);assert.equal(Object.hasOwn(c.fields,'prepAreaSqft'),false);
  if(type.startsWith('FENCING_'))assert.ok(c.fields.cornerCount);else assert.ok(c.fields.surfaceCondition);
 }
 for(const type of ['FLAT_ROOF_REPAIR','LANDSCAPING_MULCH','LANDSCAPING_PLANTING'])assert.ok(MEASUREMENT_CONTRACTS[type].fields.accessDifficulty);
});
test('T21 owner percentage display scales exactly and preserves invalid text',async()=>{
 const {scaleOwnerDecimal}=await import('../server/priceBookMoney.js');
 for(const fraction of [0,.1,.123456789,.5])assert.equal(scaleOwnerDecimal(scaleOwnerDecimal(fraction,2),-2),fraction);
 assert.equal(scaleOwnerDecimal(.1,2),10);assert.equal(scaleOwnerDecimal('bad',-2),'bad');
});

test('T22 labor-only peak surcharge includes explicitly priced preparation labor without changing its markup category',()=>{
 const f=offeringFixture('INTERIOR_PAINTING','itemized');f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=10;
 const q=cents(f,353400); //328700 +10%*(wall100000+primer25000+prep70000+ceiling32000+ceilingprimer8000+trimlabor12000).
 assert.equal(q.lineItems.find(line=>line.calculation?.ratePath==='offeringRates.prepLaborPerSqft').category,'prep');
});

test('T23 complete painting condition remains live without unused exact-match owner settings',()=>{
 const f=offeringFixture('INTERIOR_PAINTING','itemized'),p=f.ownerPricing.pricing;
 for(const key of ['surfaceCondition','wallHeight','finishCoats','ceilingCoats'])delete p.offeringDetails[key];
 delete p.offeringRates.prepLaborPerSqft;delete p.offeringRates.prepMaterialPerSqft;
 Object.assign(p.offeringRates,{prepLaborPerSqft_poor:200,prepMaterialPerSqft_poor:40});Object.assign(f.customerInputs,{surfaceCondition:'poor',coats:3});cents(f,502100);
 const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(status.status,'QUOTING LIVE');assert.equal(status.productCoverage.filter(product=>product.configurationComplete).length,1);
});
