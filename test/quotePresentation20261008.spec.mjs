import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {fixture,concrete,mowing} from '../verification/engine-independent/fixtures.mjs';
import {configuredScope} from './measuredScopeFixtures.mjs';
import {savedDisplayFixture,date} from './quoteDisplayFixtures20261006.mjs';
import {quoteEmailFixture} from './quoteEmailFixture.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook,savePricebook} from '../server/priceBookService.js';
import {editServiceField} from '../client/src/pricebookEditing.js';

// Dollar expectations were written BEFORE execution in
// verification/quote-presentation-20261008/EXPECTATIONS.md.
process.env.JWT_SECRET='SYNTHETIC_PRESENTATION_SIGNING_KEY_NEVER_LIVE';
const notice='Fewer options are available because one or more configured options need owner review.';
const occurrences=(text,value)=>text.split(value).length-1;
const temporary=mkdtempSync(join(process.cwd(),'presentation-render-test-'));
let controls,quoteView,ui,treeBundle;
before(async()=>{
 for(const [name,entry] of [['controls','client/src/quoteDoneControls.jsx'],['quote','client/src/quotedone.jsx'],['ui','client/src/ui.jsx']]){
  const file=join(temporary,name+'.mjs');await build({entryPoints:[entry],bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,logLevel:'silent',define:{'import.meta.env':'{}'}});
  const exports=await import(pathToFileURL(file));if(name==='controls')controls=exports;else if(name==='ui')ui=exports;else quoteView=exports;
 }
 const output=await build({bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {PricingTree} from './client/src/quoteDoneControls.jsx';window.mount=(value,definition)=>{window.root=createRoot(document.getElementById('root'));window.root.render(<PricingTree value={value} definition={definition} onChange={next=>{window.updated=next;window.changed=true;}}/>);};"}});
 treeBundle=output.outputFiles[0].text;
});
after(()=>rmSync(temporary,{recursive:true,force:true}));
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const waitFor=async predicate=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Synthetic DOM did not settle');};
function patio(length=960){
 const f=concrete();Object.assign(f.ownerPricing.pricing,{laborPerSqft:100,concreteCostPerCubicYard:8100,formworkPerLF:100});delete f.ownerPricing.pricing.demolitionPerSqft;
 Object.assign(f.customerInputs,{length:10,width:10,baseNeeded:false,demolitionNeeded:true,demolitionAreaSqft:100,demolitionThickness:4,demolitionReinforcement:'none',demolitionAccessDifficulty:'easy',demolitionScopeConfirmed:true});
 configuredScope(f,'demolition',{description:'[SYNTHETIC] '+ 'D'.repeat(length-12),mode:'installed',category:'removal',maximumThickness:6,reinforcement:'none',accessDifficulty:'easy',disposalIncluded:true},{demolition_installed:200});
 assert.equal(f.ownerPricing.pricing.scopeDetails.demolition.description.length,length);return f;
}
function tiers(){const f=mowing();Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:15});f.ownerPricing.tiers=[{name:'Standard',overrides:{}},{name:'Premium',overrides:{mowingBaseRatePerSqft:3}},{name:'Broken',overrides:{mowingBaseRatePerSqft:0}}];return f;}
function publish(owner,f){const service=structuredClone(f.ownerPricing);delete service.origin;const draft=bridge.convertApplicationBook({services:[service],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision},date);bridge.approveApplicationService(owner,service.id,{revision:bridge.readApplicationBook(owner).revision,confirmConfiguration:true,confirmLegacySettings:true},date);return loadPricebook(owner).services[0];}
async function phone(h,f,additionalWork=[]){
 publish(h.c.ownerId,f);const match=await h.tool('matchService',{query:f.ownerPricing.service});assert.equal(match.status,'matched');
 const customerInputs=structuredClone(f.customerInputs);delete customerInputs.confirmedFacts;
 const args={serviceHandle:match.serviceHandle,customerInputs,customerConfirmed:true,additionalWork,productConfirmations:Object.fromEntries(Object.keys(f.customerInputs.confirmedFacts||{}).map(name=>[name,true]))};
 let result=await h.tool('getQuote',args);
 if(result.questionContract?.fields.some(field=>field.confirmationToken)){
  args.scopeConfirmations=Object.fromEntries(result.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));result=await h.tool('getQuote',args);
 }
 return {match,args,result};
}
for(const length of [959,960,2000])test(`presentation 1: ${length}-character scope saves, speaks, replays and emails complete $450 quote`,async t=>{
 const f=patio(length),a=savedDisplayFixture(f),response=a.quote(f.customerInputs).customerResult,description=f.ownerPricing.pricing.scopeDetails.demolition.description;
 assert.equal(response.midEstimate,450);const fact=response.pricedScope.facts.find(row=>row.details);assert.ok(fact.details.some(detail=>detail.includes(description)));assert.ok(!fact.label.includes(description));
 assert.ok(render(quoteView.QuoteResult,{result:response}).includes(description));
 const h=quoteEmailFixture(t),p=await phone(h,f);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,450);assert.ok(p.result.scopeDetails.some(detail=>detail.includes(description)));assert.ok(occurrences(p.result.quoteNarration,description)>=1);
 const replay=await h.tool('getQuote',p.args);assert.equal(replay.quoteNarration,p.result.quoteNarration);
 const history=(await h.tool('getCustomerContext',{})).recentQuotes[0];assert.equal(history.midEstimate,450);assert.ok(history.scopeDetails.some(detail=>detail.includes(description)));
 const confirmation=await h.tool('prepareQuoteEmail',{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'});await h.tool('sendQuoteEmail',{emailConfirmationHandle:confirmation.emailConfirmationHandle,customerConfirmed:true});await h.emailService().dispatchOnce();
 const row=h.rows()[0],message=JSON.parse(row.messageJson),token=new URL(message.text.split('View your saved quote: ')[1]).pathname.split('/').at(-1);assert.equal(h.emailService().publicQuote(h.c.ownerId,token).narration,p.result.quoteNarration);assert.ok(message.text.includes(description));assert.equal(row.narration,p.result.quoteNarration);assert.ok(occurrences(row.narration,description)>=1);
});
test('presentation 1: save and approval reject oversized full presentation before writing',()=>{
 const f=mowing(),a=savedDisplayFixture(f),before=bridge.readApplicationBook(a.owner),draft=structuredClone(before);draft.services[0].disclaimer='[SYNTHETIC] '+ 'Q'.repeat(65536);
 assert.throws(()=>bridge.saveApplicationBook(a.owner,draft,date),error=>error.statusCode===422&&error.details.code==='INVALID_QUOTE_PRESENTATION');assert.deepEqual(bridge.readApplicationBook(a.owner),before);
 const raw=loadPricebook(a.owner);raw.services[0].disclaimer=draft.services[0].disclaimer;savePricebook(a.owner,raw);const legacy=bridge.readApplicationBook(a.owner);
 assert.equal(bridge.bookStatuses(loadPricebook(a.owner),date)[0].status,'NEEDS PRICING');assert.throws(()=>bridge.approveApplicationService(a.owner,raw.services[0].id,{revision:legacy.revision,confirmConfiguration:true},date),error=>error.statusCode===422);assert.deepEqual(bridge.readApplicationBook(a.owner),legacy);
});
test('presentation 2a: owner sees named withheld option, owner labels and 1-of-3 live chip',()=>{
 const f=tiers(),a=savedDisplayFixture(f);assert.equal(a.status.status,'QUOTING LIVE');assert.equal(controls.priceOptionChipText(a.status),'QUOTING LIVE — 1 of 3 options not offered');
 const html=render(controls.ServiceStatusNotices,{status:a.status});assert.match(html,/Price options not offered to customers/);assert.match(html,/Broken/);assert.doesNotMatch(html,/mowingBaseRatePerSqft|zeroPricePolicy|cents/);assert.match(html,/zero price|positive price/);
 const chip=render(ui.StatusChip,{status:a.status.status,label:controls.priceOptionChipText(a.status)}),dom=new JSDOM(`<style>${readFileSync('client/src/styles.css','utf8')}</style><div class="service-pick">${chip}</div>`);
 assert.ok(dom.window.document.querySelector('.status-chip').classList.contains('status-live'));assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.status-chip')).whiteSpace,'normal');dom.window.close();
 assert.ok(a.status.failedTierDiagnostics[0].ownerFieldLabels.length);for(const label of a.status.failedTierDiagnostics[0].ownerFieldLabels)assert.ok(html.includes(label.replaceAll('&','&amp;')));
 assert.deepEqual(a.quote(f.customerInputs).customerResult.options.map(option=>option.midEstimate),[115,172.5]);
});
for(const partial of [false,true])test(`presentation 2b: withheld notice survives phone/history/requested copy once (${partial?'partial':'complete'})`,async t=>{
 const h=quoteEmailFixture(t),f=tiers(),p=await phone(h,f,partial?['[SYNTHETIC] Separate unpriced tree removal']:[]);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.deepEqual(p.result.options.map(option=>option.midEstimate),[115,172.5]);assert.equal(p.result.optionAvailabilityNotice,notice);assert.equal(occurrences(p.result.voiceSummary,notice),1);assert.equal(occurrences(p.result.quoteNarration,notice),1);
 const history=(await h.tool('getCustomerContext',{})).recentQuotes[0];assert.equal(history.optionAvailabilityNotice,notice);assert.deepEqual(history.options.map(option=>option.midEstimate),[115,172.5]);if(partial)assert.equal(history.fullJobTotal,null);
 const confirmation=await h.tool('prepareQuoteEmail',{quoteHandle:p.result.quoteHandle,email:'caller@example.invalid'});await h.tool('sendQuoteEmail',{emailConfirmationHandle:confirmation.emailConfirmationHandle,customerConfirmed:true});await h.emailService().dispatchOnce();const row=h.rows()[0],message=JSON.parse(row.messageJson),token=new URL(message.text.split('View your saved quote: ')[1]).pathname.split('/').at(-1);assert.equal(occurrences(message.text,notice),1);assert.equal(occurrences(h.emailService().publicQuote(h.c.ownerId,token).narration,notice),1);assert.equal(occurrences(row.narration,notice),1);
});
for(const depth of [1,2,3])test(`presentation 3: actual Remove button prunes an optional map at depth ${depth}`,async t=>{
 const dom=new JSDOM('<div id="root"></div>',{runScripts:'dangerously',pretendToBeVisual:true});t.after(()=>{dom.window.root?.unmount();dom.window.close();});dom.window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));dom.window.eval(treeBundle);
 const value=depth===1?{obsolete:20}:depth===2?{group:{obsolete:20}}:{group:{nested:{obsolete:20}}};dom.window.mount(value,{label:'[SYNTHETIC] Optional map',moneyKind:'unit_rate',tree:{depth}});
 await waitFor(()=>[...dom.window.document.querySelectorAll('button')].some(button=>button.textContent==='Remove Obsolete'));[...dom.window.document.querySelectorAll('button')].find(button=>button.textContent==='Remove Obsolete').click();await waitFor(()=>dom.window.changed);assert.equal(dom.window.updated,undefined);
 const edited=editServiceField({serviceType:'ROOFING_REPLACEMENT',underlaymentPerSquare:value,pricing:{underlaymentPerSquare:value}},'underlaymentPerSquare',dom.window.updated);assert.ok(!Object.hasOwn(edited,'underlaymentPerSquare'));assert.ok(!Object.hasOwn(edited.pricing,'underlaymentPerSquare'));
});
test('presentation 3: omitted obsolete roof map quotes $1020; explicit empty map stays invalid',()=>{
 const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:5000},materialCostPerSquare:{asphalt_shingle:10000},tearOffPerSquare:{asphalt_shingle:4000},underlaymentPriceBasis:{asphalt_shingle:'cost'},underlaymentPerSquare:{asphalt_shingle:999},minimumJob:0,accessoryPricingMode:'per_square_allin'},{roofSizeMethod:'roof_measured',roofSizeInput:500,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',roofUnderlaymentScopeConfirmed:true});
 configuredScope(f,'roof_underlayment_asphalt_shingle',{mode:'package_cost',productKey:'synthetic_roll',coverage:500,wastePercent:0},{roof_underlayment_asphalt_shingle:2000});f.ownerPricing=editServiceField(f.ownerPricing,'underlaymentPerSquare',undefined);
 const a=savedDisplayFixture(f);assert.equal(a.quote(f.customerInputs).customerResult.midEstimate,1020);
 const draft=bridge.readApplicationBook(a.owner);draft.services[0].pricing.underlaymentPerSquare={};const status=bridge.validateApplicationDraft(a.owner,draft,date).statuses[0];assert.equal(status.status,'NEEDS PRICING');assert.ok(status.validationErrors.some(error=>error.includes('non-empty price map')));
});
function cleanup(travel=false){const f=fixture('LANDSCAPING_CLEANUP',{cleanupBaseRatePerSqft:10,debrisPricing:{light:{laborMultiplier:1,disposalFlat:2000},moderate:{laborMultiplier:1,disposalFlat:3000},heavy:{laborMultiplier:1,disposalFlat:4000}},minimumServiceCharge:0},{yardSqft:1000,sqftMethod:'exact',debrisLevel:'light',slope:'flat',haulAway:false});Object.assign(f.businessDefaults,{disposalFee:9900,travelFee:1000});f.ownerPricing.feeRules.disposal='customer_selected';if(travel)f.ownerPricing.feeRules.travel='customer_selected';return f;}
test('presentation 4: engine-covered disposal is never asked or defaulted; cleanup phone quote is $120',async t=>{
 const h=quoteEmailFixture(t),p=await phone(h,cleanup());assert.deepEqual(p.match.questionContract.customerFees,[]);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,120);
 const submission=JSON.parse(h.db.prepare('SELECT originalSubmissionJson FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId).originalSubmissionJson);assert.deepEqual(submission.customerFeeSelections,{});
});
test('presentation 4: applicable travel waits for explicit Yes/No; disposal stays omitted',async t=>{
 const h=quoteEmailFixture(t),p=await phone(h,cleanup(true));assert.equal(p.result.status,'needs_details',JSON.stringify(p.result));assert.deepEqual(p.result.questionContract.customerFees.map(fee=>fee.field),['travel']);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM quoteSubmissions WHERE ownerId=?').get(h.c.ownerId).n,0);
 for(const [answer,expected] of [[false,120],[true,130]]){const result=await h.tool('getQuote',{...p.args,customerFeeSelections:{travel:answer}});assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,expected);}
});
test('presentation 4: priced mowing clippings replace common disposal; phone quotes $110',async t=>{
 const f=mowing();f.customerInputs.bagClippings=true;f.ownerPricing.pricing.baggingSurchargePercent=10;f.ownerPricing.feeRules.disposal='customer_selected';f.businessDefaults.disposalFee=9900;
 const h=quoteEmailFixture(t),p=await phone(h,f);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,110);assert.ok(!p.result.questionContract?.customerFees.some(fee=>fee.field==='disposal'));
});
test('presentation 4: sod preparation covers disposal; changing this request asks the now-applicable fee',async t=>{
 const f=fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:100,sodInstallLaborPerSqft:100,groundPrepPerSqft:50,minimumServiceCharge:0},{sodSqft:100,sqftMethod:'exact',groundPrepNeeded:true,slope:'flat',accessDifficulty:'easy'});f.ownerPricing.feeRules.disposal='customer_selected';f.businessDefaults.disposalFee=9900;
 const h=quoteEmailFixture(t),p=await phone(h,f);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,255);
 const args={...p.args,customerInputs:{...p.args.customerInputs,groundPrepNeeded:false}},unanswered=await h.tool('getQuote',args);assert.equal(unanswered.status,'needs_details');assert.deepEqual(unanswered.questionContract.customerFees.map(fee=>fee.field),['disposal']);
 for(const [answer,expected] of [[false,205],[true,304]]){const result=await h.tool('getQuote',{...args,customerFeeSelections:{disposal:answer}});assert.equal(result.status,'quoted',JSON.stringify(result));assert.equal(result.midEstimate,expected);}
});
test('presentation 4: measured roofing disposal replaces common fee without voice arithmetic',async t=>{
 const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:5000},materialCostPerSquare:{asphalt_shingle:10000},tearOffPerSquare:{asphalt_shingle:4000},underlaymentPriceBasis:{asphalt_shingle:'cost'},disposalPerSquare:300,minimumJob:0,accessoryPricingMode:'per_square_allin'},{roofSizeMethod:'roof_measured',roofSizeInput:500,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full',roofUnderlaymentScopeConfirmed:true});
 configuredScope(f,'roof_underlayment_asphalt_shingle',{mode:'package_cost',productKey:'synthetic_roll',coverage:500,wastePercent:0},{roof_underlayment_asphalt_shingle:2000});f.ownerPricing.feeRules.disposal='customer_selected';f.businessDefaults.disposalFee=9900;
 const h=quoteEmailFixture(t),p=await phone(h,f);assert.equal(p.result.status,'quoted',JSON.stringify(p.result));assert.equal(p.result.midEstimate,1035);
});
