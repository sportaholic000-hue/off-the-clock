import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {customerContractForVNext,validateCustomerInputs,validatePricingStructuresDetailed} from '../server/quote-engine-vnext/contracts.js';
import {surfaceGeometry,coatLaborParts,surfaceOwnerDiagnostics} from '../server/quote-engine-vnext/surfacePricing.js';
import {exactToNumber} from '../server/quote-engine-vnext/exactMath.js';
import {fixture,siding} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {voiceQuestionContract} from '../server/src/voice/voiceQuoteContract.js';
import {projectVoiceQuote} from '../server/src/voice/voiceQuotePresentation.js';
import {discloseQuoteScope} from '../server/src/quoteScopeDisclosure.js';
import {convertApplicationBook,readApplicationBook,saveApplicationBook,approveApplicationService} from '../server/src/quoteDoneBridge.js';
import {migrate} from '../server/src/db.js';
import {randomUUID} from 'node:crypto';

// Handwritten arithmetic and boundary expectations precede every execution.
// See verification/qe-lane-c-20261016/EXPECTED.md; no expectations are generated
// by the implementation under test.
function basic(){
 const f=fixture('INTERIOR_PAINTING',{laborPerWallSqftPerCoat:100,materialPerWallSqftPerCoat:30,minimumJob:0},{areaInputMethod:'wall_sqft',wallAreaSqft:400,wallHeight:'standard',wallScopeUniform:true,surfaceCondition:'good',coats:2,ceilingsIncluded:false,trimIncluded:false});
 f.ownerPricing.priceBasisByCategory.material='sell_price';return f;
}
function quote(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;}
const lines=q=>q.options[0].lineItems;
const amounts=(q,path)=>lines(q).filter(l=>l.calculation.ratePath===path).map(l=>l.amountCents);
const sum=values=>values.reduce((n,v)=>n+v,0);
const house={areaInputMethod:'building_dimensions',buildingPerimeterFeet:140,wallHeightFeet:10,gables:[{widthFeet:30,heightFeet:8},{widthFeet:30,heightFeet:8}],doorCount:2,windowCount:10,garageDoorCount:1,garageDoorWidthFeet:16,garageDoorHeightFeet:7};

for(const [coats,expected] of [[1,[44444]],[2,[44444,35556]],[3,[44444,71111]]])test('surface Oct16: exact wall coat split '+coats,()=>{
 // 400 × 100 × 2/1.8 = 44,444.444...; extra coat(s) 35,555.555... / 71,111.111...
 const f=basic();f.customerInputs.coats=coats;f.ownerPricing.pricing.paintingSettings={wallAdditionalCoatRatio:0.8};
 assert.deepEqual(amounts(quote(f),'laborPerWallSqftPerCoat'),expected);
});
for(const [coats,expected] of [[1,40000],[2,80000],[3,120000]])test('surface Oct16: blank ratio retains linear coats '+coats,()=>{
 const f=basic();f.customerInputs.coats=coats;assert.deepEqual(amounts(quote(f),'laborPerWallSqftPerCoat'),[expected]);
});
test('surface Oct16: converted rates retain exact fractional cents and approved independent rounding',()=>{
 const [first,additional]=coatLaborParts(1,2,0.8);
 assert.deepEqual(first.multipliers[0].exactValue,{numerator:'10',denominator:'9'});
 assert.deepEqual(additional.multipliers[0].exactValue,{numerator:'8',denominator:'9'});
 const f=basic();f.customerInputs.wallAreaSqft=1;f.ownerPricing.pricing.laborPerWallSqftPerCoat=0.25;
 assert.deepEqual(amounts(quote(f),'laborPerWallSqftPerCoat'),[1]);
 f.ownerPricing.pricing.paintingSettings={wallAdditionalCoatRatio:1};
 assert.deepEqual(amounts(quote(f),'laborPerWallSqftPerCoat'),[0,0]);
});
test('surface Oct16: poor wall preparation and good ceiling coats are independent',()=>{
 // Poor wall prep 1000×120=120000; ceiling labor 400×60×1=24000.
 const f=offeringFixture('INTERIOR_PAINTING','itemized'),p=f.ownerPricing.pricing;
 Object.assign(f.customerInputs,{wallAreaSqft:1000,coats:2,surfaceCondition:'poor',ceilingAreaSqft:400,ceilingCoats:1,ceilingSurfaceCondition:'good',trimIncluded:false});delete f.customerInputs.trimLengthLF;
 Object.assign(p.offeringRates,{prepLaborPerSqft_poor:120,prepMaterialPerSqft_poor:10,prepLaborPerSqft_good:20,prepMaterialPerSqft_good:5,ceilingLaborPerSqftPerCoat:60});
 const q=quote(f);assert.deepEqual(amounts(q,'offeringRates.prepLaborPerSqft_poor'),[120000]);assert.deepEqual(amounts(q,'offeringRates.prepLaborPerSqft_good'),[8000]);assert.deepEqual(amounts(q,'offeringRates.ceilingLaborPerSqftPerCoat'),[24000]);
});
test('surface Oct16: basic painting still sends fair and poor walls to review',()=>{
 for(const condition of ['fair','poor']){const f=basic();f.customerInputs.surfaceCondition=condition;assert.notEqual(generateQuoteVNext(f).resultType,'INSTANT_ESTIMATE_READY');}
});
test('surface Oct16: room dimensions separate labor from net paint without blocking a best guess',()=>{
 // 2×(12+12)×8=384; 384−20−2×15=334; ceiling=144; labor76800+paint22044.
 const f=basic();delete f.customerInputs.wallAreaSqft;delete f.customerInputs.wallScopeUniform;
 Object.assign(f.customerInputs,{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2}]});
 const g=surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing);
 assert.deepEqual([g.labor,g.paint,g.ceiling].map(exactToNumber),[384,334,144]);
 const q=quote(f);assert.deepEqual(amounts(q,'laborPerWallSqftPerCoat'),[76800]);assert.deepEqual(amounts(q,'materialPerWallSqftPerCoat'),[22044]);assert.equal(q.options[0].midEstimate,988.44);
 const response=sanitizeForCustomerVNext(q),voice=projectVoiceQuote(response,'[SYNTHETIC]surface-quote',[],{callerMeasurementsEstimated:true});
 assert.ok(voice.voiceSummary.includes('This price is based on the measurements you gave us. The business will confirm them on site.'));
});
for(const [basis,area,cents] of [['openings_left_in',1584,332640],['openings_subtracted',1338,280980]])test('surface Oct16: siding '+basis+' convention and gables',()=>{
 const f=siding();f.customerInputs={...f.customerInputs,...house};delete f.customerInputs.sidingAreaSqft;
 Object.assign(f.ownerPricing.pricing,{laborPerSqft:{vinyl:100},materialPerSqft:{vinyl:100},sidingSettings:{areaConventionByType:{vinyl:basis}}});
 assert.equal(exactToNumber(surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing).labor),area);
 assert.equal(quote(f).options[0].midEstimate,cents/100);
});
test('surface Oct16: exterior labor leaves ordinary openings in and paint subtracts all openings',()=>{
 // Gross1640; garage112 is >100, so labor1528; net material1338.
 const f=offeringFixture('EXTERIOR_PAINTING','itemized');f.customerInputs={...f.customerInputs,...house};delete f.customerInputs.exteriorAreaSqft;
 const g=surfaceGeometry(f.serviceType,f.customerInputs,f.ownerPricing.pricing);assert.deepEqual([g.gross,g.labor,g.paint].map(exactToNumber),[1640,1528,1338]);
 assert.equal(quote(f).resultType,'INSTANT_ESTIMATE_READY');
});
test('surface Oct16: priced door sides and fascia extend once; unpriced requested doors are excluded',()=>{
 const f=basic();f.customerInputs.paintDoorSides=4;f.ownerPricing.pricing.surfaceExtraRates={doorSides:11500};
 assert.deepEqual(amounts(quote(f),'surfaceExtraRates.doorSides'),[46000]);
 delete f.ownerPricing.pricing.surfaceExtraRates;
 const raw=quote(f),q=sanitizeForCustomerVNext(raw);assert.deepEqual(q.options[0].skippedAddons,['Door sides']);assert.equal(q.options[0].midEstimate,1064);
 const contract=customerContractForVNext(f.serviceType,f.ownerPricing.pricing),definition={customerFields:Object.entries(contract.fields).map(([name,d])=>({name,...d}))};
 const presented=discloseQuoteScope(q,f.ownerPricing,definition,{customerInputs:f.customerInputs},1);
 assert.equal(presented.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(presented.fullJobTotal,null);assert.equal(presented.additionalWork[0].description,'Door sides');
 const e=offeringFixture('EXTERIOR_PAINTING','itemized');e.customerInputs.fasciaLengthLF=140;e.ownerPricing.pricing.surfaceExtraRates={fascia:800};assert.deepEqual(amounts(quote(e),'surfaceExtraRates.fascia'),[112000]);
});
test('surface Oct16: owner height bands price each room and ceiling, never height-adjusting trim',()=>{
 // Walls32000+44000=76000; ceilings6000+6600=12600. Trim100LF×200=20000.
 const f=basic(),p=f.ownerPricing.pricing;
 Object.assign(p,{ceilingLaborPerSqftPerCoat:60,ceilingMaterialPerSqftPerCoat:20,trimLaborPerLF:200,trimMaterialPerLF:20,paintingSettings:{heightBands:{standardMaxFeet:8,highMaxFeet:10,vaultedMaxFeet:20}}});
 delete f.customerInputs.wallAreaSqft;delete f.customerInputs.wallHeight;delete f.customerInputs.wallScopeUniform;
 Object.assign(f.customerInputs,{areaInputMethod:'room_dimensions',coats:1,ceilingsIncluded:true,ceilingCoats:1,ceilingSurfaceCondition:'good',trimIncluded:true,trimLengthLF:100,trimCoats:1,trimSurfaceCondition:'good',rooms:[8,10].map(heightFeet=>({lengthFeet:10,widthFeet:10,heightFeet,doorCount:0,windowCount:0}))});
 const q=quote(f);assert.equal(sum(amounts(q,'laborPerWallSqftPerCoat')),76000);assert.equal(sum(amounts(q,'ceilingLaborPerSqftPerCoat')),12600);assert.equal(sum(amounts(q,'trimLaborPerLF')),20000);
});
test('surface Oct16: legacy no-new-input prices keep baseline cents',()=>{
 // Recomputed before detached baseline execution: 106400,328700,247500,1170000.
 // EXPECTED-correction.md preserves why the original stale literals were wrong.
 for(const [f,cents] of [[basic(),106400],[offeringFixture('INTERIOR_PAINTING','itemized'),328700],[offeringFixture('EXTERIOR_PAINTING','itemized'),247500],[siding(),1170000]])assert.equal(quote(f).options[0].midEstimate,cents/100);
});
test('surface Oct16: missing siding convention names owner pricing rather than guessing a basis',()=>{
 const f=siding();f.customerInputs={...f.customerInputs,...house};delete f.customerInputs.sidingAreaSqft;
 const q=generateQuoteVNext(f);assert.notEqual(q.resultType,'INSTANT_ESTIMATE_READY');assert.ok(JSON.stringify(q).includes('sidingSettings.areaConventionByType.vinyl'));
});
test('surface Oct16: malformed new fields and inconsistent measurements cannot quote',()=>{
 for(const bad of [-1,NaN,Infinity]){const f=basic();f.customerInputs.paintDoorSides=bad;assert.notEqual(generateQuoteVNext(f).resultType,'INSTANT_ESTIMATE_READY');}
 for(const bad of [-1,NaN,Infinity,'0.8']){const f=basic();f.ownerPricing.pricing.paintingSettings={wallAdditionalCoatRatio:bad};assert.notEqual(generateQuoteVNext(f).resultType,'INSTANT_ESTIMATE_READY');}
 const f=basic();Object.assign(f.customerInputs,{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2}]});
 assert.equal(validateCustomerInputs(f.serviceType,f.customerInputs,f.ownerPricing.pricing).ok,false,'duplicate direct area must not silently win');
 const p={paintingSettings:{heightBands:{standardMaxFeet:10,highMaxFeet:8,vaultedMaxFeet:20}}};assert.ok(surfaceOwnerDiagnostics('INTERIOR_PAINTING',p).length);assert.ok(validatePricingStructuresDetailed('INTERIOR_PAINTING',p).some(d=>d.path==='paintingSettings.heightBands'));
});
test('surface Oct16: widget and voice expose the same room and per-surface names without private rates',()=>{
 const f=basic(),contract=customerContractForVNext(f.serviceType,f.ownerPricing.pricing);
 const definition={customerFields:Object.entries(contract.fields).map(([name,d])=>({name,...d}))};
 const voice=voiceQuestionContract(f.ownerPricing,definition);
 for(const name of ['rooms','ceilingCoats','ceilingSurfaceCondition','trimCoats','trimSurfaceCondition','paintDoorSides'])assert.ok(voice.fields.some(q=>q.field===name));
 assert.match(voice.fields.find(q=>q.field==='rooms').details.join(' '),/lengthFeet.*widthFeet.*heightFeet/);
 assert.equal(JSON.stringify(voice).includes('wallAdditionalCoatRatio'),false);assert.equal(JSON.stringify(voice).includes('laborPerWallSqftPerCoat'),false);
});

for(const surface of ['ceiling','trim','primer','ceilingPrimer','trimPrimer'])test('surface Oct16: basic '+surface+' has its own exact coat split',()=>{
 // Each uses400 units,100 cents/coat,r0.8 and3coats =>44444+71111, independently.
 const f=basic(),p=f.ownerPricing.pricing,c=f.customerInputs;
 p.paintingSettings={};let path;
 if(surface==='ceiling'||surface==='ceilingPrimer'){
  Object.assign(c,{ceilingsIncluded:true,ceilingAreaSqft:400,ceilingCoats:3,ceilingSurfaceCondition:'good'});
  Object.assign(p,{ceilingLaborPerSqftPerCoat:100,ceilingMaterialPerSqftPerCoat:30});
 }
 if(surface==='trim'||surface==='trimPrimer'){
  Object.assign(c,{trimIncluded:true,trimLengthLF:400,trimCoats:3,trimSurfaceCondition:'good'});Object.assign(p,{trimLaborPerLF:100,trimMaterialPerLF:30});
 }
 if(surface==='ceiling'){p.paintingSettings.ceilingAdditionalCoatRatio=0.8;path='ceilingLaborPerSqftPerCoat';}
 else if(surface==='trim'){p.paintingSettings.trimAdditionalCoatRatio=0.8;path='trimLaborPerLF';}
 else {
  const prefix=surface==='primer'?'primer':surface==='ceilingPrimer'?'ceilingPrimer':'trimPrimer',unit=surface==='trimPrimer'?'LF':'Sqft';
  p.paintingSettings[prefix+'Coats']=3;p.paintingSettings[prefix==='primer'?'primerAdditionalCoatRatio':prefix+'AdditionalCoatRatio']=0.8;
  p.paintingRates={[prefix+'LaborPer'+unit+'PerCoat']:100,[prefix+'MaterialPer'+unit+'PerCoat']:30};path='paintingRates.'+prefix+'LaborPer'+unit+'PerCoat';
 }
 assert.deepEqual(amounts(quote(f),path),[44444,71111]);
});
test('surface Oct16: itemized trim has independent coats and no height adjustment',()=>{
 //400LF×100c first/additional split gives115555c; high walls must not add10%.
 const f=offeringFixture('INTERIOR_PAINTING','itemized'),p=f.ownerPricing.pricing;
 Object.assign(f.customerInputs,{wallHeight:'high',trimLengthLF:400,trimCoats:3,trimSurfaceCondition:'good',ceilingsIncluded:false});delete f.customerInputs.ceilingAreaSqft;
 p.paintingSettings={trimAdditionalCoatRatio:0.8};p.paintingRates={trimLaborPerLFPerCoat:100,trimMaterialPerLFPerCoat:30};
 assert.deepEqual(amounts(quote(f),'paintingRates.trimLaborPerLFPerCoat'),[44444,71111]);
});
test('surface Oct16: mixed-height installed room prices adjust only their labor shares',()=>{
 // Walls192000+254400=446400; ceilings30000+31800=61800 (60% labor, high1.10).
 const f=offeringFixture('INTERIOR_PAINTING','installed'),p=f.ownerPricing.pricing;
 p.paintingSettings={heightBands:{standardMaxFeet:8,highMaxFeet:10,vaultedMaxFeet:20}};
 delete f.customerInputs.wallAreaSqft;delete f.customerInputs.ceilingAreaSqft;delete f.customerInputs.wallHeight;delete f.customerInputs.wallScopeUniform;delete f.customerInputs.trimLengthLF;
 Object.assign(f.customerInputs,{areaInputMethod:'room_dimensions',trimIncluded:false,ceilingCoats:2,ceilingSurfaceCondition:'fair',rooms:[8,10].map(heightFeet=>({lengthFeet:10,widthFeet:10,heightFeet,doorCount:0,windowCount:0}))});
 const q=quote(f);assert.equal(sum(amounts(q,'offeringRates.installedWallPerSqft')),446400);assert.equal(sum(amounts(q,'offeringRates.installedCeilingPerSqft')),61800);
});
for(const unit of ['square_feet','linear_feet'])test('surface Oct16: optional siding soffit unit '+unit,()=>{
 //200 owner-selected units×500c=100000c; fascia140LF×800c=112000c.
 const f=siding();Object.assign(f.customerInputs,{soffitQuantity:200,fasciaLengthLF:140});Object.assign(f.ownerPricing.pricing,{sidingSettings:{soffitUnit:unit},surfaceExtraRates:{soffit:500,fascia:800}});
 const q=quote(f);assert.deepEqual(amounts(q,'surfaceExtraRates.soffit'),[100000]);assert.deepEqual(amounts(q,'surfaceExtraRates.fascia'),[112000]);
});
test('surface Oct16: differing garage openings subtract only openings over100 from painting labor',()=>{
 // Gross1640, normal190, garage112+90=202: labor1528, net1248.
 const f=offeringFixture('EXTERIOR_PAINTING','itemized'),c={...f.customerInputs,...house,garageDoorCount:2,garageOpenings:[{widthFeet:16,heightFeet:7},{widthFeet:10,heightFeet:9}]};
 delete c.exteriorAreaSqft;delete c.garageDoorWidthFeet;delete c.garageDoorHeightFeet;
 const g=surfaceGeometry(f.serviceType,c,f.ownerPricing.pricing);assert.deepEqual([g.labor,g.paint].map(exactToNumber),[1528,1248]);f.customerInputs=c;quote(f);
 c.garageDoorCount=3;assert.equal(validateCustomerInputs(f.serviceType,c,f.ownerPricing.pricing).ok,false);
});
test('surface Oct16: new settings persist, can be approved, and changed content invalidates approval',()=>{
 //400sqft×100c two-coat basis,r.8=>80000c labor; door sides remain11500c each.
 migrate();const owner='[SYNTHETIC]-surface-'+randomUUID(),f=basic(),prior=readApplicationBook(owner);
 f.ownerPricing.pricing.paintingSettings={wallAdditionalCoatRatio:0.8,heightBands:{standardMaxFeet:8,highMaxFeet:10,vaultedMaxFeet:20}};
 f.ownerPricing.pricing.surfaceExtraRates={doorSides:11500};
 const service={serviceType:f.serviceType,source:'MANUAL',service:'[SYNTHETIC] Painting',active:true,pricing:f.ownerPricing.pricing,feeRules:f.ownerPricing.feeRules,priceBasisByCategory:f.ownerPricing.priceBasisByCategory,taxabilityByCategory:f.ownerPricing.taxabilityByCategory,peakMonths:[],peakSurchargePercent:0,tiers:[]};
 const payload=convertApplicationBook({defaults:{...f.businessDefaults,currency:'USD'},services:[service]},'toDollars');
 saveApplicationBook(owner,{...prior,...payload});let book=readApplicationBook(owner);
 assert.equal(book.services[0].pricing.paintingSettings.wallAdditionalCoatRatio,0.8);assert.equal(book.services[0].pricing.surfaceExtraRates.doorSides,115);
 const approved=approveApplicationService(owner,book.services[0].id,{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true});
 assert.equal(approved.statuses[0].status,'QUOTING LIVE',JSON.stringify(approved));
 book=readApplicationBook(owner);book.services[0].pricing.paintingSettings.wallAdditionalCoatRatio=0.7;
 const changed=saveApplicationBook(owner,book);assert.equal(changed.statuses[0].approvalCurrent,false);
});

test('surface Oct16: basic wall and ceiling primer labor follow each room height',()=>{
 // Before execution: areas320/400; primer100c, high1.1 =>32000+44000.
 // Ceilings100/100 at60c =>6000+6600. No trim height factor.
 const f=basic(),p=f.ownerPricing.pricing;
 Object.assign(p,{ceilingLaborPerSqftPerCoat:60,ceilingMaterialPerSqftPerCoat:20,paintingSettings:{primerCoats:1,ceilingPrimerCoats:1,heightBands:{standardMaxFeet:8,highMaxFeet:10,vaultedMaxFeet:20}},paintingRates:{primerLaborPerSqftPerCoat:100,primerMaterialPerSqftPerCoat:10,ceilingPrimerLaborPerSqftPerCoat:60,ceilingPrimerMaterialPerSqftPerCoat:10}});
 delete f.customerInputs.wallAreaSqft;delete f.customerInputs.wallHeight;delete f.customerInputs.wallScopeUniform;
 Object.assign(f.customerInputs,{areaInputMethod:'room_dimensions',coats:1,ceilingsIncluded:true,ceilingCoats:1,ceilingSurfaceCondition:'good',rooms:[8,10].map(heightFeet=>({lengthFeet:10,widthFeet:10,heightFeet,doorCount:0,windowCount:0}))});
 const q=quote(f);assert.deepEqual(amounts(q,'paintingRates.primerLaborPerSqftPerCoat'),[32000,44000]);assert.deepEqual(amounts(q,'paintingRates.ceilingPrimerLaborPerSqftPerCoat'),[6000,6600]);
});
test('surface Oct16: net room paint and trim primer package costs replace component materials',()=>{
 // Netwall334×2coats×1.1/400 =>2packages×5000=10000.
 // Trim100LF×1primer×1.1/100 =>2packages×3000=6000, not +trimPrimerMaterial.
 const f=basic(),p=f.ownerPricing.pricing;
 f.ownerPricing.priceBasisByCategory.material='cost';
 Object.assign(p,{trimLaborPerLF:100,paintingSettings:{trimPrimerCoats:1},paintingRates:{trimPrimerLaborPerLFPerCoat:100,trimPrimerMaterialPerLFPerCoat:50},scopeDetails:{},scopeRates:{}});
 for(const [key,coverage,rate]of [['paint_wall',400,5000],['paint_trim',100,2000],['paint_trim_primer',100,3000]]){p.scopeDetails[key]={mode:'package_cost',productKey:key,coverage,wastePercent:10,description:'[SYNTHETIC] '+key};p.scopeRates[key]=rate;}
 delete f.customerInputs.wallAreaSqft;delete f.customerInputs.wallScopeUniform;
 Object.assign(f.customerInputs,{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2}],trimIncluded:true,trimLengthLF:100,trimCoats:1,trimSurfaceCondition:'good',paintProductsConfirmed:true});
 const q=quote(f);assert.deepEqual(amounts(q,'scopeRates.paint_wall'),[10000]);assert.deepEqual(amounts(q,'scopeRates.paint_trim_primer'),[6000]);assert.deepEqual(amounts(q,'paintingRates.trimPrimerMaterialPerLFPerCoat'),[]);
});

test('surface Oct16: large room openings use their own room height instead of an allocation',()=>{
 // Before execution: room1(320−120)×100 +room2(400×100×1.1)=64000c.
 const f=basic(),p=f.ownerPricing.pricing;p.paintingSettings={heightBands:{standardMaxFeet:8,highMaxFeet:10,vaultedMaxFeet:20}};
 for(const name of ['wallAreaSqft','wallHeight','wallScopeUniform'])delete f.customerInputs[name];
 Object.assign(f.customerInputs,{areaInputMethod:'room_dimensions',coats:1,rooms:[8,10].map(heightFeet=>({lengthFeet:10,widthFeet:10,heightFeet,doorCount:0,windowCount:0}))});
 f.customerInputs.rooms[0].largeOpenings=[{areaSqft:120}];
 const g=surfaceGeometry(f.serviceType,f.customerInputs,p);assert.equal(exactToNumber(g.paint),600);assert.equal(sum(amounts(quote(f),'laborPerWallSqftPerCoat')),64000);
 delete f.customerInputs.rooms[0].largeOpenings;f.customerInputs.largeOpenings=[{areaSqft:120}];
 assert.equal(validateCustomerInputs(f.serviceType,f.customerInputs,p).ok,false);
});
test('surface Oct16: direct wall area can retain labor openings and subtract net paint',()=>{
 // Before execution:400×2×100=80000; (400−20−30)×2×30×1.1=23100c.
 const f=basic();Object.assign(f.customerInputs,{doorCount:1,windowCount:2});
 const q=quote(f);assert.deepEqual(amounts(q,'laborPerWallSqftPerCoat'),[80000]);assert.deepEqual(amounts(q,'materialPerWallSqftPerCoat'),[23100]);
});
test('surface Oct16: explicitly priced good trim preparation is charged without height adjustment',()=>{
 //100LF×20c=2000labor;100LF×10c×1.1=1100material, high walls do not apply.
 const f=basic();Object.assign(f.customerInputs,{wallHeight:'high',trimIncluded:true,trimLengthLF:100,trimCoats:1,trimSurfaceCondition:'good'});
 Object.assign(f.ownerPricing.pricing,{trimLaborPerLF:100,trimMaterialPerLF:10,paintingRates:{trimPrepLaborPerLF_good:20,trimPrepMaterialPerLF_good:10}});
 const q=quote(f);assert.deepEqual(amounts(q,'paintingRates.trimPrepLaborPerLF_good'),[2000]);assert.deepEqual(amounts(q,'paintingRates.trimPrepMaterialPerLF_good'),[1100]);
});
test('surface Oct16: cost-based trim preparation uses its package instead of area-rate material',()=>{
 // Before execution:prep100LF×20c=2000labor;ceil(100×1.1/100)×1000=2000material.
 const f=basic(),p=f.ownerPricing.pricing;f.ownerPricing.priceBasisByCategory.material='cost';
 Object.assign(p,{trimLaborPerLF:100,paintingRates:{trimPrepLaborPerLF_fair:20},scopeDetails:{},scopeRates:{}});
 for(const [key,coverage,rate]of [['paint_wall',400,5000],['paint_trim',100,2000],['paint_trim_prep',100,1000]]){p.scopeDetails[key]={mode:'package_cost',productKey:key,coverage,wastePercent:10,description:'[SYNTHETIC] '+key};p.scopeRates[key]=rate;}
 Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:100,trimCoats:1,trimSurfaceCondition:'fair',paintProductsConfirmed:true});
 const q=quote(f);assert.deepEqual(amounts(q,'paintingRates.trimPrepLaborPerLF_fair'),[2000]);assert.deepEqual(amounts(q,'scopeRates.paint_trim_prep'),[2000]);assert.deepEqual(amounts(q,'paintingRates.trimPrepMaterialPerLF_fair'),[]);
});

test('surface Oct16: basic explicit trim components replace retained prices and split coats',()=>{
 //400LF3coats100c,r.8=>44444+71111labor; material30c×400×3×1.1=39600c.
 const f=basic(),p=f.ownerPricing.pricing;
 Object.assign(f.customerInputs,{trimIncluded:true,trimLengthLF:400,trimCoats:3,trimSurfaceCondition:'good'});
 p.paintingSettings={trimAdditionalCoatRatio:0.8};p.paintingRates={trimLaborPerLFPerCoat:100,trimMaterialPerLFPerCoat:30};
 const q=quote(f);assert.deepEqual(amounts(q,'paintingRates.trimLaborPerLFPerCoat'),[44444,71111]);assert.deepEqual(amounts(q,'paintingRates.trimMaterialPerLFPerCoat'),[39600]);assert.deepEqual(amounts(q,'trimLaborPerLF'),[]);
});
test('surface Oct16: nested room confirmation text uses labels and numbers without mutating signed inputs',async()=>{
 // Presentation expectation written before execution in EXPECTED.md.
 const {customerJobSummary}=await import('../server/src/quoteIntake.js');
 const f=basic(),c={areaInputMethod:'room_dimensions',rooms:[{lengthFeet:12,widthFeet:12,heightFeet:8,doorCount:1,windowCount:2,largeOpenings:[{areaSqft:120}]}]},before=structuredClone(c);
 const definition={customerFields:Object.entries(customerContractForVNext(f.serviceType,f.ownerPricing.pricing).fields).map(([name,d])=>({name,...d}))};
 const value=customerJobSummary(f.ownerPricing,definition,{customerInputs:c},'synthetic-revision').facts.find(row=>row.label==='Room measurements').value;
 assert.match(value,/Large room openings: 1: Opening area 120 square feet/);assert.doesNotMatch(value,/areaSqft| null/);assert.deepEqual(c,before);
});
test('surface Oct16: unpriced siding soffit does not invent a unit or block the priced siding',()=>{
 const f=siding();f.customerInputs.soffitQuantity=200;
 const field=customerContractForVNext(f.serviceType,f.ownerPricing.pricing).fields.soffitQuantity;assert.equal(field.unit,'units (owner must confirm)');
 const q=sanitizeForCustomerVNext(quote(f));assert.equal(q.midEstimate,11700);assert.deepEqual(q.options[0].skippedAddons,['Soffit']);
});
test('surface Oct16: zero net paint uses zero packages while labor still quotes',()=>{
 //40sqft×2coats×100c=8000labor; two ordinary doors leave0net paint/0packages.
 const f=basic(),p=f.ownerPricing.pricing;Object.assign(f.customerInputs,{wallAreaSqft:40,doorCount:2,windowCount:0,paintProductsConfirmed:true});
 f.ownerPricing.priceBasisByCategory.material='cost';p.scopeDetails={paint_wall:{mode:'package_cost',productKey:'[SYNTHETIC]paint',coverage:400,wastePercent:10,description:'[SYNTHETIC] Wall paint'}};p.scopeRates={paint_wall:5000};
 const q=quote(f);assert.deepEqual(amounts(q,'laborPerWallSqftPerCoat'),[8000]);assert.deepEqual(amounts(q,'scopeRates.paint_wall'),[0]);assert.equal(q.midEstimate,80);
});
test('surface Oct16: exact derived wall area survives preparation extension to a safe-integer boundary',()=>{
 //4×1.23456789²×1000000000000002=6096631500076220.5932630001524168c.
 const f=offeringFixture('INTERIOR_PAINTING','itemized'),p=f.ownerPricing.pricing;
 for(const name of ['wallAreaSqft','ceilingAreaSqft','wallScopeUniform','trimLengthLF'])delete f.customerInputs[name];
 Object.assign(f.customerInputs,{areaInputMethod:'room_dimensions',rooms:[{lengthFeet:1.23456789,widthFeet:1.23456789,heightFeet:1.23456789,doorCount:0,windowCount:0}],surfaceCondition:'good',coats:1,ceilingsIncluded:false,trimIncluded:false,wallHeight:'standard'});
 Object.assign(p.offeringRates,{prepLaborPerSqft_good:1000000000000002,prepMaterialPerSqft_good:1});
 assert.deepEqual(amounts(quote(f),'offeringRates.prepLaborPerSqft_good'),[6096631500076221]);
});
