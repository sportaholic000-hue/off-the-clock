import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext,vNextServiceStatus,approveVNextValues} from '../server/quote-engine-vnext/index.js';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {concrete,flatRoof,flooring} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {convertApplicationBook,readApplicationBook,saveApplicationBook} from '../server/src/quoteDoneBridge.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';
import {validateInterviewValue,interpretInterviewAnswer} from '../server/src/priceBookAI.js';
import {scopeOverlapDiagnostics,scopeKeysForRequest,scopeCustomerFields,customerFieldForInputs} from '../server/scopeConfiguration.js';
import {customerSummaryValue} from '../server/src/customerSummary.js';
import {productKeyFromName} from '../client/src/pricebookFormatting.js';
const get=id=>structuredClone(measuredScopeCases().find(row=>row.id===id).input);
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));return q;};
const lines=q=>q.options[0].calculationRecord.scenarios.mid.lineItems;
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const line=(q,path)=>lines(q).find(x=>x.calculation?.ratePath===path);
test('ordinary overlay product names use the registry key and quote the matching work',()=>{
 const f=get('overlay-installed');f.ownerPricing.pricing.scopeDetails.floor_overlay.existingFloorType=productKeyFromName('Vinyl plank').key;
 assert.equal(line(ready(f),'scopeRates.floor_overlay_installed').amountCents,40000); //200 sqft *200 cents
});
test('noncanonical overlay names are rejected before an interview can claim complete setup',()=>{
 const f=get('overlay-installed'),scopeDetails=f.ownerPricing.pricing.scopeDetails;scopeDetails.floor_overlay.existingFloorType='Vinyl plank';
 assert.throws(()=>validateInterviewValue(f.serviceType,'scopeDetails',scopeDetails,f.ownerPricing.pricing));
 assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
// Expected charges authored before execution. Base flat roof: 500000 labor +
// 770000 waste-adjusted membrane + 200000 tear-off = 1470000 cents.
for(const buildingType of ['residential','commercial'])for(const insulationNeeded of [false,true])for(const coverboardNeeded of [false,true])test('independent layers '+JSON.stringify({buildingType,insulationNeeded,coverboardNeeded}),()=>{
 const f=get('commercial-installed');Object.assign(f.customerInputs,{buildingType,insulationNeeded,coverboardNeeded});
 if(!insulationNeeded){delete f.customerInputs.insulationAreaSqft;delete f.ownerPricing.pricing.scopeRates.insulation_installed;delete f.ownerPricing.pricing.scopeDetails.insulation.insulationSystem;}
 if(!coverboardNeeded){delete f.customerInputs.coverboardAreaSqft;delete f.ownerPricing.pricing.scopeRates.coverboard_installed;delete f.ownerPricing.pricing.scopeDetails.insulation.coverboardSystem;}
 if(!insulationNeeded&&!coverboardNeeded)delete f.customerInputs.insulationScopeConfirmed;
 assert.equal(cents(ready(f)),1470000+(insulationNeeded?160000:0)+(coverboardNeeded?60000:0));
});
for(const field of ['insulationNeeded','coverboardNeeded'])test('missing '+field+' never infers No from building type',()=>{const f=flatRoof();delete f.customerInputs[field];assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');});
test('commercial roof can retain all insulation without any scope configured',()=>{const f=flatRoof();f.customerInputs.buildingType='commercial';assert.equal(cents(ready(f)),1470000);});
for(const field of ['insulationAreaSqft','coverboardAreaSqft'])for(const value of [undefined,0,-1,1001])test('selected layer rejects '+field+' '+value,()=>{const f=get('commercial-installed');if(value===undefined)delete f.customerInputs[field];else f.customerInputs[field]=value;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');});
const variants=[
 ['siding-removal-installed','siding_removal',{stories:2},{sidingRemovalStories:2},500,250000],
 ['siding-removal-installed','siding_removal',{existingSidingType:'wood'},{existingSidingType:'wood'},500,250000],
 ['demolition-installed','demolition',{reinforcement:'none'},{demolitionReinforcement:'none'},700,140000],
 ['demolition-installed','demolition',{accessDifficulty:'moderate'},{demolitionAccessDifficulty:'moderate'},700,140000],
 ['overlay-installed','floor_overlay',{existingFloorType:'tile'},{existingFloorType:'tile'},400,80000],
 ['overlay-installed','floor_overlay',{newFlooringType:'vinyl_plank'},{newFlooringType:'vinyl_plank'},400,80000],
 ['stairs-installed','stairs',{flooringType:'vinyl_plank'},{newFlooringType:'vinyl_plank'},20000,100000]
];
for(const [id,key,details,customer,rate,expected] of variants)test('selects exact alternative '+JSON.stringify(details),()=>{
 const f=get(id),p=f.ownerPricing.pricing,alias=key+'__second';p.scopeDetails[alias]={...p.scopeDetails[key],...details};p.scopeRates[alias+'_installed']=rate;
 Object.assign(f.customerInputs,customer);if(customer.existingFloorType)f.customerInputs=confirmedFixtureInputs(f.customerInputs);if(customer.newFlooringType){p.laborPerSqft[customer.newFlooringType]=300;p.materialPerSqft[customer.newFlooringType]=500;f.customerInputs=confirmedFixtureInputs(f.customerInputs);}
 const q=ready(f);assert.equal(line(q,'scopeRates.'+alias+'_installed').amountCents,expected);assert.equal(line(q,'scopeRates.'+key+'_installed'),undefined);
 assert.ok(vNextServiceStatus(f.ownerPricing,f.businessDefaults).scopeCoverage.some(row=>row.key===alias&&row.configurationComplete));
});
for(const explicit of [undefined,'exact','up_to'])test('demolition access matching '+explicit,()=>{
 const f=get('demolition-installed');if(explicit)f.ownerPricing.pricing.scopeDetails.demolition.accessMatch=explicit;f.customerInputs.demolitionAccessDifficulty='moderate';
 assert.equal(generateQuoteVNext(f).resultType,explicit==='up_to'?'INSTANT_ESTIMATE_READY':'ESTIMATE_REQUIRES_REVIEW');
});
for(const [id,key] of [['stairs-installed','stairs'],['overlay-installed','floor_overlay'],['siding-removal-installed','siding_removal'],['demolition-installed','demolition']])for(const tier of [false,true])test('overlapping '+key+' rejected before saving '+(tier?'tier':'base'),()=>{
 const f=get(id),owner='synthetic-overlap-'+randomUUID();delete f.ownerPricing.origin;savePricebook(owner,{services:[f.ownerPricing],defaults:f.businessDefaults});
 const book=readApplicationBook(owner),before=loadPricebook(owner),service=book.services[0],copy=structuredClone(service.pricing.scopeDetails[key]);
 if(tier)service.tiers=[{name:'Plus',overrides:{scopeDetails:{[key+'__duplicate']:copy}}}];else service.pricing.scopeDetails[key+'__duplicate']=copy;
 assert.throws(()=>saveApplicationBook(owner,book),/overlap/i);assert.deepEqual(loadPricebook(owner),before);
});
test('explicit access-up-to overlap cannot shadow an easier exact entry',()=>{const f=get('demolition-installed'),p=f.ownerPricing.pricing;p.scopeDetails.demolition.accessMatch='up_to';p.scopeDetails.demolition__easy={...p.scopeDetails.demolition,accessMatch:'exact',accessDifficulty:'easy'};assert.equal(scopeOverlapDiagnostics(f.serviceType,p).length,1);assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');});
for(const method of ['exact','measured_area_perimeter','measured_outline'])test('12 by 16 slab subtracts 16 adjoining feet with '+method,()=>{
 const f=concrete();Object.assign(f.customerInputs,{dimensionMethod:method,length:12,width:16,adjoinsExistingConcrete:true,adjoiningEdgeLF:16});
 if(method!=='exact'){delete f.customerInputs.length;delete f.customerInputs.width;Object.assign(f.customerInputs,method==='measured_outline'?{outlinePoints:[{x:0,y:0},{x:12,y:0},{x:12,y:16},{x:0,y:16},{x:0,y:0}]}:{areaSqft:192,perimeterLF:56});}
 // 56 perimeter -16 adjoining =40 feet *2500 cents =100000 cents.
 assert.equal(line(ready(f),'formworkPerLF').amountCents,100000);
 f.customerInputs.adjoiningEdgeLF=56;assert.equal(line(ready(f),'formworkPerLF').amountCents,0);
 for(const value of [undefined,-1,0,56.001]){const bad=structuredClone(f);bad.customerInputs.adjoiningEdgeLF=value;if(value===undefined)delete bad.customerInputs.adjoiningEdgeLF;assert.equal(generateQuoteVNext(bad).resultType,'ESTIMATE_REQUIRES_REVIEW');}
});
test('concrete requires explicit adjoining-edge choice and rejects contradictory No',()=>{const f=concrete();delete f.customerInputs.adjoinsExistingConcrete;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');Object.assign(f.customerInputs,{adjoinsExistingConcrete:false,adjoiningEdgeLF:3});assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');});
test('base 3.5-cent measured rate saves and extends exactly once',()=>{
 const f=concrete();f.ownerPricing.pricing.laborPerSqft=3.5;const b={services:[f.ownerPricing],defaults:f.businessDefaults};assert.deepEqual(convertApplicationBook(convertApplicationBook(b,'toDollars'),'toCents'),b);assert.equal(lines(ready(f)).find(l=>l.name==='Concrete labor').amountCents,700); //200*3.5
});
for(const mode of ['installed','itemized'])for(const key of (['gate_walk','postMaterialEach','footingLaborEach','footingMaterialEach']))test('whole-cent item '+mode+' '+key,()=>{
 const f=offeringFixture('FENCING_INSTALL',mode);f.ownerPricing.pricing.offeringRates[key]=45000.5;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
 const displayed=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');assert.equal(displayed.services[0].pricing.offeringRates[key],450.005);assert.throws(()=>convertApplicationBook(displayed,'toCents')); // retained invalid data stays visible for explicit correction
});
test('fixed stair/package prices reject fractions; measured scope prices preserve them',()=>{for(const [id,key] of [['stairs-installed','stairs_installed'],['floor-hardwood-packages','floor_underlayment_hardwood']]){const f=get(id);f.ownerPricing.pricing.scopeRates[key]=3.5;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');}const f=get('siding-removal-installed');f.ownerPricing.pricing.scopeRates.siding_removal_installed=3.5;assert.equal(line(ready(f),'scopeRates.siding_removal_installed').amountCents,1750);});
for(const [id,expected] of [['commercial-itemized',756000],['siding-removal-itemized',450000],['demolition-itemized',180000]])test('peak includes declared removal labor '+id,()=>{
 const f=get(id);f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=10;
 // Flat:500000 install +40000 insulation +15000 board +200000 removal=755000.
 // Siding:400000 install +50000 removal=450000. Demo:120000+60000=180000.
 const labor=id==='commercial-itemized'?755000:expected;
 const surcharge=lines(ready(f)).filter(l=>l.category==='surcharge').reduce((sum,l)=>sum+l.amountCents,0);assert.equal(surcharge,labor/10);
});
for(const share of [undefined,0,40,100])test('installed removal peak uses only declared labor '+share,()=>{const f=get('demolition-installed');f.ownerPricing.peakMonths=[1];f.ownerPricing.peakSurchargePercent=10;if(share!==undefined)f.ownerPricing.pricing.installedLaborPercent={'scopeRates.demolition_installed':share};const sum=lines(ready(f)).filter(l=>l.category==='surcharge').reduce((n,l)=>n+l.amountCents,0);assert.equal(sum,12000+(share??0)*100);});
for(const type of ['FENCING_INSTALL','FENCING_REPLACEMENT','EXTERIOR_PAINTING'])test('AI interview captures a complete '+type+' offering without manual setup',async()=>{
 const f=offeringFixture(type,'installed'),dollars=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars').services[0].pricing,captured={};
 for(const field of ['offeringMode','offeringDetails','offeringRates','minimumJob']){
  const value=dollars[field];captured[field]=await interpretInterviewAnswer({serviceType:type,field,answer:'[SYNTHETIC] Explicit owner definition and prices',pricing:captured},{env:{GEMINI_API_KEY:'synthetic',PRICEBOOK_GEMINI_MODEL:'synthetic-text'},fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({value})}]}}]})})});
 }
 const centsBook=convertApplicationBook({services:[{serviceType:type,pricing:captured}],defaults:{}},'toCents');Object.assign(f.ownerPricing.pricing,centsBook.services[0].pricing);assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');ready(f);
});
for(const id of ['floor-hardwood-installed','floor-laminate-installed','floor-carpet-installed','stairs-installed','overlay-installed','siding-removal-installed','demolition-installed','commercial-installed'])test('AI interview preserves '+id+' scope and prices',()=>{
 const f=get(id),dollars=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars').services[0].pricing,p={...dollars};delete p.scopeDetails;delete p.scopeRates;
 p.scopeDetails=validateInterviewValue(f.serviceType,'scopeDetails',dollars.scopeDetails,p);p.scopeRates=validateInterviewValue(f.serviceType,'scopeRates',dollars.scopeRates,p);assert.deepEqual(p,dollars);
});
test('AI rejects scope overlap, unknown properties and fractional gates',()=>{
 const f=offeringFixture('FENCING_INSTALL','installed'),p=f.ownerPricing.pricing;
 assert.throws(()=>validateInterviewValue(f.serviceType,'offeringDetails',{...p.offeringDetails,active:true},p));assert.throws(()=>validateInterviewValue(f.serviceType,'offeringRates',{gate_walk:450.005},p));
 const d=get('demolition-installed').ownerPricing.pricing;assert.throws(()=>validateInterviewValue('CONCRETE_PATIO_SLAB','scopeDetails',{...d.scopeDetails,demolition__duplicate:d.scopeDetails.demolition},d),/overlap/);
});
test('summary units and special fence height remain explicit',()=>{assert.equal(customerSummaryValue({name:'thickness',unit:'inches'},4,String),'4 inches');assert.equal(customerSummaryValue({name:'fenceHeight',unit:'feet'},6,String),'6 ft');});
test('retired calculations are absent from the active calculator',()=>{const source=readFileSync(new URL('../server/quote-engine-vnext/templates.js',import.meta.url),'utf8');for(const field of ['p.perStepPrice','p.demolitionPerSqft','p.insulationPerSqft','p.removalPerSqft,','calculateExteriorPainting'])assert.ok(!source.includes(field),field);});

test('roof-layer coverage reports each independent product accurately',()=>{
 const f=get('commercial-installed');delete f.ownerPricing.pricing.scopeRates.coverboard_installed;delete f.ownerPricing.pricing.scopeDetails.insulation.coverboardSystem;
 const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);assert.equal(status.scopeCoverage.find(r=>r.key==='insulation').configurationComplete,true);assert.equal(status.scopeCoverage.find(r=>r.key==='coverboard').configurationComplete,false);
});
test('interview product registration is explicit, separate from prices, and survives saving and approval',async()=>{
 const {materializeInterviewFields}=await import('../server/interviewConfiguration.js');
 const {approveApplicationService,bookRevision,applicationStatus,calculateApplicationQuote}=await import('../server/src/quoteDoneBridge.js');
 const f=offeringFixture('FENCING_INSTALL','installed'),p=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars').services[0].pricing;
 const fields={...p,knownOfferings:validateInterviewValue(f.serviceType,'knownOfferings',{fenceType:{wood:true}},p)};
 const materialized=materializeInterviewFields(f.serviceType,fields,randomUUID);
 assert.deepEqual(materializeInterviewFields(f.serviceType,p,randomUUID).knownOfferings,{}); // price keys never register a product implicitly
 assert.throws(()=>validateInterviewValue(f.serviceType,'knownOfferings',{fenceType:{wood:randomUUID()}},p));
 const owner='synthetic-ai-complete-'+randomUUID(),raw={...f.ownerPricing,...materialized,source:'AI_INTERVIEW'};delete raw.origin;delete raw.id;raw.confirmedFields={};delete raw.approvedValues;
 const empty=readApplicationBook(owner);saveApplicationBook(owner,{...empty,services:[raw],defaults:{...empty.defaults,...f.businessDefaults,currency:'CAD'}});
 let book=loadPricebook(owner),service=book.services[0],status=applicationStatus(service,book);assert.notEqual(status.status,'QUOTING LIVE');
 approveApplicationService(owner,service.id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields});
 book=loadPricebook(owner);service=book.services[0];assert.equal(applicationStatus(service,book).status,'QUOTING LIVE',JSON.stringify(applicationStatus(service,book)));
 const input=structuredClone(f.customerInputs);input.confirmedFacts.fenceType.offeringId=service.knownOfferings.fenceType.wood;
 const q=calculateApplicationQuote(book,service,{serviceId:service.id,customerInputs:input},{ownerId:owner});assert.equal(cents(q.internalResult),450000);
});
