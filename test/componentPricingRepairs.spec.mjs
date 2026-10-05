import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {includedFixture} from './quoteEngineVNextFixtures.mjs';
import {mowing} from '../verification/engine-independent/fixtures.mjs';
import {applicationMetadata,applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';
const get=id=>structuredClone(measuredScopeCases().find(r=>r.id===id).input);
function ready(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;}
const line=(q,path)=>q.lineItems.find(l=>l.calculation?.ratePath===path);

for(const stories of [1,2,3])test('component siding removal price already covers '+stories+' stories',()=>{
 const f=get('siding-removal-itemized');f.ownerPricing.pricing.scopeDetails.siding_removal.stories=stories;
 f.ownerPricing.pricing.scopeRates.siding_removal_removal=120;
 Object.assign(f.customerInputs,{stories,sidingRemovalStories:stories,sidingRemovalAreaSqft:1000});
 // 1000 sqft *120 cents, with no second story adjustment.
 assert.equal(line(ready(f),'scopeRates.siding_removal_removal').amountCents,120000);
 f.customerInputs.sidingRemovalStories=stories===1?2:1;
 assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
for(const mode of ['installed','itemized'])for(const wallHeight of ['standard','high','vaulted'])test('component '+mode+' trim is independent of '+wallHeight+' wall height',()=>{
 const f=offeringFixture('INTERIOR_PAINTING',mode),p=f.ownerPricing.pricing;
 p.offeringRates.installedTrimPerLF=210;p.installedLaborPercent['offeringRates.installedTrimPerLF']=70;p.installedMaterialsPercent['offeringRates.installedTrimPerLF']=30;
 f.customerInputs.wallHeight=wallHeight;
 assert.equal(line(ready(f),'offeringRates.installedTrimPerLF').amountCents,21000);
 delete p.installedLaborPercent['offeringRates.installedTrimPerLF'];
 assert.equal(line(ready(f),'offeringRates.installedTrimPerLF').amountCents,21000);
});
for(const [access,factor]of [['easy',[92500,46250]],['moderate',[106375,53188]],['difficult',[120250,60125]]])test('component insulation and coverboard follow '+access+' roof access',()=>{
 const f=get('commercial-itemized');Object.assign(f.customerInputs,{roofSqft:1850,insulationAreaSqft:1850,coverboardAreaSqft:1850,accessDifficulty:access});
 // 1850*50 and 1850*25 cents, adjusted and rounded separately.
 const q=ready(f);assert.equal(line(q,'scopeRates.insulation_labor').amountCents,factor[0]);assert.equal(line(q,'scopeRates.coverboard_labor').amountCents,factor[1]);
 assert.equal(line(q,'scopeRates.insulation_material').amountCents,277500);assert.equal(line(q,'scopeRates.coverboard_material').amountCents,138750);
});
for(const [stories,cents]of [[1,50400],[2,55440],[3,60480]])test('component siding trim labor follows '+stories+' stories',()=>{
 const f=get('siding-trim-itemized');Object.assign(f.customerInputs,{stories,trimLengthLF:240});f.ownerPricing.pricing.scopeRates.siding_trim_labor=210;
 const q=ready(f);assert.equal(line(q,'scopeRates.siding_trim_labor').amountCents,cents);assert.equal(line(q,'scopeRates.siding_trim_material').amountCents,36000);
});
for(const type of ['laminate','hardwood','carpet'])for(const basis of ['cost','sell_price'])test('component included '+type+' underlayment supports '+basis,()=>{
 const f=get('floor-'+type+'-installed'),p=f.ownerPricing.pricing,key='floor_underlayment_'+type;
 p.scopeRates[key]=0;f.ownerPricing.priceBasisByCategory.material=basis;
 f.ownerPricing=includedFixture(f.ownerPricing,{['scopeRates.'+key]:'materialPerSqft.'+type});
 assert.equal(ready(f).midEstimate,type==='laminate'?1740:1760);
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
});
for(const type of ['laminate','hardwood','carpet'])test('component explicit included mode needs no zero price or internal inclusion path: '+type,()=>{
 const f=get('floor-'+type+'-installed'),p=f.ownerPricing.pricing,key='floor_underlayment_'+type;
 p.scopeDetails[key].mode='included_in_floor_price';delete p.scopeRates[key];
 f.businessDefaults.markupPercent=20;f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;f.ownerPricing.taxabilityByCategory.material=true;
 // Labor 66000*1.2; material (108000 or110000)*1.2 plus 10% material tax.
 assert.equal(ready(f).midEstimate,type==='laminate'?2217.6:2244);
 const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(status.status,'QUOTING LIVE');assert.equal(status.scopeCoverage.find(s=>s.key===key).configurationComplete,true);
});
for(const [type,mode,changes]of [['EXTERIOR_PAINTING','installed',{stories:2}],['EXTERIOR_PAINTING','installed',{stories:3}],['FENCING_INSTALL','itemized',{terrainSlope:'moderate'}],['FENCING_INSTALL','itemized',{terrainSlope:'steep'}]])test('component owner sees review coverage for '+type+' '+JSON.stringify(changes),()=>{
 const f=offeringFixture(type,mode);if(type==='EXTERIOR_PAINTING')f.ownerPricing.pricing.offeringDetails.stories=1;delete f.ownerPricing.pricing.installedLaborPercent;
 const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(status.status,'QUOTING LIVE');
 assert.equal(status.laborAdjustmentCoverage.some(row=>Object.entries(changes).every(([key,value])=>row.selection[key]===value)&&row.missingOwnerFields.length>0),true);
 Object.assign(f.customerInputs,changes);assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
test('component permit decisions are owner-controlled; legacy customer rules need an owner choice',()=>{
 const f=mowing();f.businessDefaults.permitFee=5000;
 for(const mode of ['when_scope_selected','customer_selected']){f.ownerPricing.feeRules.permit=mode;for(const answer of [undefined,false,true]){f.customerInputs.permitRequired=answer;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');}assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).ownerDiagnostics.some(d=>d.path==='feeRules.permit'),true);}
 f.ownerPricing.feeRules.permit='owner_selected';
 for(const owner of [false,true])for(const answer of [false,true]){f.feeSelections={owner:{permit:owner},customer:{}};f.customerInputs.permitRequired=answer;assert.equal(ready(f).midEstimate,owner?150:100);}
 const fields=applicationServiceDefinition(f.ownerPricing).customerFields;assert.equal(fields.some(field=>field.name==='permitRequired'),false);
});
test('component arbitrary fence heights retain exact offering matching',()=>{
 const f=offeringFixture('FENCING_INSTALL','itemized');f.ownerPricing.pricing.offeringDetails.fenceHeight=5+3.65/12;f.customerInputs.fenceHeight=5+3.65/12;ready(f);f.customerInputs.fenceHeight=6;
 // Owner ruling (Oct 3): any requested height quotes, scaled from the priced height.
 const scaled=generateQuoteVNext(f);assert.equal(scaled.resultType,'INSTANT_ESTIMATE_READY');assert.match(scaled.disclaimer,/scaled to the requested 6 ft height/);
});
test('component retired scalar prices no longer appear in the current entry list',()=>{
 const metadata=applicationMetadata();for(const [type,field]of [['FLOORING_INSTALL','perStepPrice'],['SIDING_REPLACEMENT','removalPerSqft'],['FLAT_ROOF_REPLACEMENT','insulationPerSqft'],['CONCRETE_PATIO_SLAB','demolitionPerSqft']])assert.equal(metadata.services.find(s=>s.serviceType===type).fields.some(f=>f.field===field),false);
});
test('component customer reviews explain missing measurements and inspection without owner details',()=>{
 const f=mowing();delete f.customerInputs.yardSqft;const missing=sanitizeForCustomerVNext(generateQuoteVNext(f));assert.match(missing.customerMessage,/measurement|size/i);
 const legacy=offeringFixture('EXTERIOR_PAINTING','installed');delete legacy.ownerPricing.pricing.offeringDetails.baselinePricesConfirmed;const setup=sanitizeForCustomerVNext(generateQuoteVNext(legacy));assert.notEqual(setup.customerMessage,missing.customerMessage);assert.doesNotMatch(setup.customerMessage,/labor|markup|baseline|offeringRates|UUID/i);
});

for(const basis of ['cost','sell_price'])test('component legacy included underlayment with materials tax does not need a fictitious installed share: '+basis,()=>{
 const f=get('floor-laminate-installed'),p=f.ownerPricing.pricing;
 p.scopeRates.floor_underlayment_laminate=0;delete p.installedMaterialsPercent;f.ownerPricing.priceBasisByCategory.material=basis;
 f.ownerPricing=includedFixture(f.ownerPricing,{'scopeRates.floor_underlayment_laminate':'materialPerSqft.laminate'});
 f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=10;f.ownerPricing.taxabilityByCategory.material=true;
 assert.equal(ready(f).midEstimate,1848); //660 labor +1080 material +108 materials tax.
});
test('component included underlayment retains an earlier separate price and never charges it',()=>{
 const f=get('floor-laminate-installed'),p=f.ownerPricing.pricing;p.scopeDetails.floor_underlayment_laminate.mode='included_in_floor_price';
 const saved=p.scopeRates.floor_underlayment_laminate;assert.equal(ready(f).midEstimate,1740);assert.equal(p.scopeRates.floor_underlayment_laminate,saved);
});

test('component customer wording preserves stated mulch quantity and explains bed preparation',async()=>{
 const {fixture}=await import('../verification/engine-independent/fixtures.mjs');
 const f=fixture('LANDSCAPING_MULCH',{minimumServiceCharge:0,mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:2000,bedPrepLaborPerSqft:{needs_weeding:100,overgrown:200}},{inputMethod:'yards',mulchArea:6,mulchType:'brown',bedCondition:'needs_weeding',bedSqft:820,edgingNeeded:false,accessDifficulty:'easy'});
 const q=ready(f);assert.equal(q.midEstimate,1240);const drivers=q.priceDrivers.join(' ');assert.match(drivers,/6.00 customer-stated cubic yards/);assert.match(drivers,/820 square feet of bed preparation: weeding/);assert.doesNotMatch(drivers,/calculated cubic yards|needs weeding bed/);
});
test('component stair confirmation uses ordinary inclusion wording',()=>{
 const f=get('stairs-itemized'),fields=applicationServiceDefinition(f.ownerPricing).customerFields,details=fields.find(field=>field.name==='stairScopeConfirmed').details.join(' ');
 assert.match(details,/Underlayment is included/);assert.doesNotMatch(details,/: true|: false/);
});
test('component readable approval preserves fractional prices, percentages and factor units',async()=>{
 const {reviewRows,priceChoices,reviewLabel}=await import('../client/src/pricebookReview.js');const {convertApplicationBook}=await import('../server/src/quoteDoneBridge.js');
 const f=offeringFixture('INTERIOR_PAINTING','itemized'),book=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars'),service=book.services[0],meta=applicationMetadata().services.find(s=>s.serviceType==='INTERIOR_PAINTING');
 service.pricing.offeringRates.installedTrimPerLF=2.105;service.pricing.installedLaborPercent['offeringRates.installedTrimPerLF']=70;
 const rows=reviewRows(service,{...book.defaults,markupPercent:30,rangeBufferPercent:10},meta),text=JSON.stringify(rows);
 assert.ok(rows.some(r=>r.value==='$2.105'));assert.ok(rows.some(r=>r.value==='70%'&&/Labor portion/.test(r.label)));assert.ok(rows.some(r=>r.value==='10%'&&/waste/i.test(r.label)));assert.ok(rows.some(r=>r.value==='1.1 ×'));
 assert.doesNotMatch(text,/priceBasisByCategory|offeringRates|quoteDoneApproval|"origin"/);assert.ok(priceChoices(service,meta).every(row=>!row.path.startsWith('installedLaborPercent')));assert.equal(reviewLabel('priceBasisByCategory',service,meta),'Price meaning by category');
});
test('component customer review fallback does not execute diagnostic accessors',()=>{
 let reads=0;const fields=[];Object.defineProperty(fields,0,{enumerable:true,get(){reads++;throw Error('must not run');}});fields.length=1;
 const result={resultType:'ESTIMATE_REQUIRES_REVIEW',quoteId:'synthetic',missingCustomerFields:fields};assert.equal(sanitizeForCustomerVNext(result).resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(reads,0);
});
