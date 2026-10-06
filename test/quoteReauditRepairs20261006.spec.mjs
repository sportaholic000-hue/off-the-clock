import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {flooring,custom,fixture} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {includedFixture,confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {reviewRows,priceChoices} from '../client/src/pricebookReview.js';
import * as editing from '../client/src/pricebookEditing.js';

// Expected dollars are written BEFORE execution in
// specs/QUOTE_REAUDIT_REPAIRS_20261006.md. Literal cents below are independent
// expected answers, never obtained from the implementation under test.
const date={timeZone:'UTC',quoteInstant:'2026-10-06T12:00:00.000Z'};
function floor(type='tile') {const f=flooring(type);delete f.ownerPricing.pricing.perStepPrice;return f;}
function ready(f,cents){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,cents);return q;}
function review(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',JSON.stringify(q));assert.equal(q.options,undefined);return q;}
function saveApproved(f){
 const owner='synthetic-reaudit-repair-'+randomUUID(),s=structuredClone(f.ownerPricing);delete s.origin;delete s.id;
 const initial=bridge.readApplicationBook(owner),draft=bridge.convertApplicationBook({services:[s],defaults:{currency:'USD',...f.businessDefaults}},'toDollars');
 bridge.saveApplicationBook(owner,{...draft,revision:initial.revision},date);
 const saved=bridge.readApplicationBook(owner);
 bridge.approveApplicationService(owner,saved.services[0].id,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
 const book=loadPricebook(owner),service=book.services[0];
 return {book,service,status:bridge.bookStatuses(book,date)[0],quote:inputs=>bridge.calculateApplicationQuote(book,service,{customerInputs:inputs,customerFeeSelections:{}},{preparingIntake:true,...date}).internalResult};
}
function expectApplication(f,cents,key){
 const a=saveApproved(f);assert.equal(a.status.approvalCurrent,true);assert.equal(a.status.status,'QUOTING LIVE',JSON.stringify(a.status));
 assert.equal(a.status.scopeCoverage.find(row=>row.key===key)?.configurationComplete,false,JSON.stringify(a.status.scopeCoverage));
 const q=a.quote(f.customerInputs);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,cents);return a;
}

test('re-audit: unfinished flooring removal stays optional in saved approved books',()=>{
 const f=floor();f.ownerPricing.pricing.removalPerSqft={carpet:0};ready(f,178000);
 const a=expectApplication(f,178000,'floor_removal_carpet');
 const selected=confirmedFixtureInputs({...f.customerInputs,existingFloorType:'carpet',removalNeeded:true,removalAreaSqft:200});
 assert.equal(a.quote(selected).resultType,'ESTIMATE_REQUIRES_REVIEW');
 f.customerInputs=selected;review(f);f.ownerPricing.pricing.removalPerSqft.carpet=100;ready(f,198000);
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).scopeCoverage.find(row=>row.key==='floor_removal_carpet').configurationComplete,true);
});
for(const rule of ['customer_selectable_addon','subfloor_condition'])test('re-audit: declined conditional underlayment remains live — '+rule,()=>{
 const f=floor('vinyl_plank');f.ownerPricing.pricing.vinylPlankUnderlaymentRule=rule;
 const field=rule==='customer_selectable_addon'?'underlaymentSelected':'subfloorCondition';
 f.customerInputs[field]=rule==='customer_selectable_addon'?false:'does_not_require_underlayment';
 ready(f,174000);const a=expectApplication(f,174000,'vinyl_underlayment_prices');
 const selected={...f.customerInputs,[field]:rule==='customer_selectable_addon'?true:'requires_underlayment'};
 assert.equal(a.quote(selected).resultType,'ESTIMATE_REQUIRES_REVIEW');
 Object.assign(f.ownerPricing.pricing,{underlaymentPerSqft:100,underlaymentPriceBasis:'installed_area_sell_price'});f.customerInputs=selected;ready(f,194000);
 assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).scopeCoverage.find(row=>row.key==='vinyl_underlayment_prices').configurationComplete,true);
});
test('re-audit: optional underlayment material share does not block an unselected taxed job',()=>{
 const f=floor('vinyl_plank');Object.assign(f.ownerPricing.pricing,{vinylPlankUnderlaymentRule:'customer_selectable_addon',underlaymentPerSqft:100,underlaymentPriceBasis:'installed_area_sell_price'});
 f.customerInputs.underlaymentSelected=false;Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10});f.ownerPricing.taxabilityByCategory.material=true;
 ready(f,184800);const a=expectApplication(f,184800,'vinyl_underlayment_prices');
 assert.equal(a.quote({...f.customerInputs,underlaymentSelected:true}).resultType,'ESTIMATE_REQUIRES_REVIEW');
 f.customerInputs.underlaymentSelected=true;review(f);f.ownerPricing.pricing.installedMaterialsPercent={underlaymentPerSqft:50};ready(f,205800);
});
test('re-audit: malformed unselected flooring prices still fail closed',()=>{
 for(const path of ['removalPerSqft','underlaymentPerSqft']){
  const f=floor('vinyl_plank');f.ownerPricing.pricing.vinylPlankUnderlaymentRule='customer_selectable_addon';f.customerInputs.underlaymentSelected=false;
  f.ownerPricing.pricing[path]=path==='removalPerSqft'?{carpet:-1}:-1;
  review(f);assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
 }
});
test('re-audit: mandatory underlayment stays required for activation',()=>{
 for(const type of ['hardwood','laminate','carpet','vinyl_plank']){
  const f=floor(type);f.ownerPricing.pricing.vinylPlankUnderlaymentRule='always_included';
  review(f);assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
 }
});
test('re-audit: unfinished replacement-floor allowance does not disable base work',()=>{
 const base=floor('vinyl_plank'),f=fixture('FLOORING_REPLACEMENT',{...base.ownerPricing.pricing,subfloorAllowancePerSqft:0},{...base.customerInputs,subfloorIssues:false});
 ready(f,174000);const a=expectApplication(f,174000,'subfloor_repair_prices');
 f.customerInputs={...f.customerInputs,subfloorIssues:true,subfloorRepairAreaSqft:200};
 assert.equal(a.quote(f.customerInputs).resultType,'ESTIMATE_REQUIRES_REVIEW');review(f);
 f.ownerPricing.pricing.subfloorAllowancePerSqft=100;ready(f,194000);
});
function includedVinyl(){
 const f=floor('vinyl_plank');Object.assign(f.ownerPricing.pricing,{underlaymentPerSqft:0,underlaymentPriceBasis:'installed_area_sell_price',vinylPlankUnderlaymentRule:'always_included'});
 f.ownerPricing.priceBasisByCategory.material='sell_price';f.ownerPricing=includedFixture(f.ownerPricing,{'underlaymentPerSqft':'materialPerSqft.vinyl_plank'});return f;
}
for(const tax of [false,true])for(const allocation of [undefined,0])test(`re-audit: included zero vinyl tax=${tax} allocation=${allocation}`,()=>{
 const f=includedVinyl();if(tax){Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10});f.ownerPricing.taxabilityByCategory.material=true;}
 if(allocation!==undefined)f.ownerPricing.pricing.installedMaterialsPercent={underlaymentPerSqft:allocation};
 ready(f,tax?184800:174000);assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE');
});
test('re-audit: zero underlayment still requires valid same-basis inclusion',()=>{
 const f=includedVinyl();Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10});f.ownerPricing.taxabilityByCategory.material=true;
 delete f.ownerPricing.zeroPricePolicy;review(f);
 const wrong=includedVinyl();wrong.ownerPricing.priceBasisByCategory.material='cost';review(wrong);
});
test('re-audit: positive tier underlayment still requires its material allocation',()=>{
 const f=includedVinyl();Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:10});f.ownerPricing.taxabilityByCategory.material=true;
 f.ownerPricing.tiers=[{name:'Included',overrides:{}},{name:'Paid',overrides:{underlaymentPerSqft:100}}];
 const q=ready(f,184800);assert.deepEqual(q.options.map(o=>o.tierName),['Included']);
 assert.ok(q.failedTierDiagnostics.some(d=>d.tierName==='Paid'&&d.missingOwnerFields.includes('installedMaterialsPercent.underlaymentPerSqft')));
});
function packageFloor(){
 const f=floor('hardwood');f.ownerPricing.pricing.wasteFactorByType.hardwood=0.05;
 f.ownerPricing.pricing.scopeDetails={floor_underlayment_hardwood:{description:'[SYNTHETIC] Underlayment',mode:'installed_area_sell_price'}};
 f.ownerPricing.pricing.scopeRates={floor_underlayment_hardwood:100};f.customerInputs.underlaymentScopeConfirmed=true;return f;
}
test('re-audit: tier approval and inclusion choices use effective package units',()=>{
 const f=packageFloor();ready(f,191000);
 f.ownerPricing.tiers=[{name:'Package',overrides:{scopeDetails:{floor_underlayment_hardwood:{mode:'package_cost',productKey:'synthetic_roll',coverage:100,wastePercent:0}},scopeRates:{floor_underlayment_hardwood:5000}}}];ready(f,181000);
 const b=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars'),s=b.services[0],meta=bridge.applicationMetadata().services.find(m=>m.serviceType===f.serviceType);
 const before=JSON.stringify(s),rows=reviewRows(s,b.defaults,meta);
 assert.ok(rows.some(r=>r.label==='Price option: Package · hardwood underlayment (per purchased packages)'&&r.value==='$50'),JSON.stringify(rows));
 const choices=priceChoices(s,meta).filter(r=>r.path==='scopeRates.floor_underlayment_hardwood');
 assert.match(choices.find(r=>!r.option).label,/per installed square feet/);assert.match(choices.find(r=>r.option==='Package').label,/per purchased packages/);
 assert.equal(JSON.stringify(s),before);
});
for(const placement of ['nested','root','mixed'])test('re-audit: removing one gate cleans its pricing across placements and tiers — '+placement,()=>{
 const f=offeringFixture('FENCING_INSTALL','installed');f.customerInputs.gates={};ready(f,400000);
 const p=f.ownerPricing.pricing;p.offeringDetails.gates.drive={...p.offeringDetails.gates.walk};p.offeringRates.gate_drive=30000;
 p.installedMaterialsPercent={'offeringRates.gate_walk':50,'offeringRates.gate_drive':60};p.installedLaborPercent={'offeringRates.gate_walk':30,'offeringRates.gate_drive':40};
 f.ownerPricing.tiers=[{name:'Good',overrides:{offeringRates:{gate_walk:27500},installedMaterialsPercent:{'offeringRates.gate_walk':55}}}];
 if(placement!=='nested')for(const key of ['offeringDetails','offeringRates','installedMaterialsPercent','installedLaborPercent']){f.ownerPricing[key]=p[key];if(placement==='root'||key==='offeringDetails')delete p[key];}
 const b=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars'),before=JSON.stringify(b.services[0]);
 const s=editing.removeGateOffering(b.services[0],'walk');assert.equal(JSON.stringify(b.services[0]),before);
 const effective=editing.servicePricing(s);assert.equal(effective.offeringDetails.gates.walk,undefined);assert.equal(effective.offeringRates.gate_walk,undefined);assert.equal(effective.offeringRates.gate_drive,300);
 for(const name of ['installedMaterialsPercent','installedLaborPercent'])assert.equal(effective[name]['offeringRates.gate_walk'],undefined);
 assert.equal(s.tiers[0].overrides.offeringRates.gate_walk,undefined);assert.equal(s.tiers[0].overrides.installedMaterialsPercent['offeringRates.gate_walk'],undefined);
 const converted=bridge.convertApplicationBook({services:[s],defaults:b.defaults},'toCents');f.ownerPricing=converted.services[0];
 const a=saveApproved(f);assert.equal(a.status.status,'QUOTING LIVE');
 for(const [gates,total] of [[{},400000],[{drive:1},430000]]){const q=a.quote({...f.customerInputs,gates});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,total);}
});
for(const id of [0,false])test('re-audit: invalid supplied ID rejects atomically at both saves — '+JSON.stringify(id),()=>{
 const owner='synthetic-invalid-id-'+randomUUID(),f=custom(),s=structuredClone(f.ownerPricing);delete s.origin;delete s.id;
 const fresh=bridge.readApplicationBook(owner),draft=bridge.convertApplicationBook({services:[s],defaults:f.businessDefaults},'toDollars');
 bridge.saveApplicationBook(owner,{...draft,revision:fresh.revision},date);const saved=bridge.readApplicationBook(owner),before=JSON.stringify(loadPricebook(owner));
 const invalid=structuredClone(saved);invalid.services[0].id=id;assert.throws(()=>bridge.saveApplicationBook(owner,invalid,date),/UUID/);
 assert.equal(JSON.stringify(loadPricebook(owner)),before);
 assert.throws(()=>savePricebook(owner,{services:[{...s,id}],defaults:f.businessDefaults}),/UUID/);assert.equal(JSON.stringify(loadPricebook(owner)),before);
});
for(const id of [undefined,null,''])test('re-audit: missing service ID gets a UUID — '+String(id),()=>{
 const f=custom();ready(f,12500);delete f.ownerPricing.origin;f.ownerPricing.id=id;
 const owner='synthetic-new-id-'+randomUUID(),fresh=bridge.readApplicationBook(owner),draft=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');
 bridge.saveApplicationBook(owner,{...draft,revision:fresh.revision},date);const saved=loadPricebook(owner);assert.match(saved.services[0].id,/^[a-f0-9-]{36}$/i);
 const same=saved.services[0].id,book=bridge.readApplicationBook(owner);bridge.saveApplicationBook(owner,book,date);assert.equal(loadPricebook(owner).services[0].id,same);
});
for(const [prep,selection,cents,scope] of [[false,undefined,30500,'common_fee_rule'],[false,false,20500,null],[false,true,30500,'separate_project_debris'],[true,undefined,30500,null],[true,true,40500,'separate_project_debris']])test(`re-audit: sod disposal evidence agrees with unchanged fee rule prep=${prep} selection=${selection}`,()=>{
 const f=fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:100,sodInstallLaborPerSqft:100,groundPrepPerSqft:100,minimumServiceCharge:0},{sodSqft:100,sqftMethod:'exact',groundPrepNeeded:prep,slope:'flat',accessDifficulty:'easy'});
 f.ownerPricing.feeRules.disposal='always';f.businessDefaults.disposalFee=10000;
 if(selection!==undefined){f.ownerPricing.disposalScope='separate_project_debris';f.customerInputs.separateDisposalSelected=selection;}
 const q=ready(f,cents),rule=q.options[0].calculationRecord.ruleApplications.find(r=>r.name==='sodDisposalOwnership');
 assert.equal(rule.result.commonDisposalScope,scope);assert.match(rule.rule,/Without ground preparation or a separate disposal scope, the configured common fee rule applies/);
});
