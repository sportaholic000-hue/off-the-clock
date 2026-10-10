import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';
import {migrate} from '../server/src/db.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';

// Handwritten expectations BEFORE execution:
// - A fresh GET's revision is reused unchanged; a read/validation cannot change it.
// - Nine disabled draft services show zero internal paths or camelCase keys.
// - After three services are entered and saved, all displayed diagnostics are
//   owner labels; no synthetic "tier pricing" failure is shown for missing fees.
// - Prices are stored exactly: fence $25.98/LF = 2598 cents/LF, mowing $0.10/sqft
//   = 10 cents/sqft, paint labor $2 = 200 cents, paint material $1 = 100 cents.
// - A local save/approval advances revision R0 -> R1. Already dispatched R0
//   background reads may receive 409, but must open ZERO recovery dialogs.
// - An unchanged reload sends R1 and receives no REVISION_CONFLICT.
// - Two real editor instances: $150 local vs $110 saved remains an explicit
//   conflict. Neither may become $260; saved value stays 11000 cents.
// Real React + real bridge/storage; only HTTP scheduling is controlled. This
// test is DOM behavior evidence; the separate production rehearsal is visual.
const root=fileURLToPath(new URL('..',import.meta.url));
const types=['INTERIOR_PAINTING','EXTERIOR_PAINTING','FENCING_INSTALL','FENCING_REPLACEMENT','LANDSCAPING_CLEANUP','LANDSCAPING_MULCH','LANDSCAPING_SOD','LANDSCAPING_PLANTING','LANDSCAPING_MOWING'];
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(false),peakMonths:[],peakSurchargePercent:0};
const custom=()=>({serviceType:'CUSTOM',service:'[SYNTHETIC] Visit',source:'MANUAL',active:true,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},tiers:[]});
let bundle;
before(async()=>{
 migrate();
 const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
  plugins:[{name:'synthetic-transport',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=async(...args)=>JSON.parse(JSON.stringify(await window.__transport(...args)));export const go=()=>{};export const logout=async()=>{};export const getSessionKey=()=>"[SYNTHETIC]";',loader:'js'}));}}],
  stdin:{resolveDir:root,loader:'jsx',contents:"import React from 'react';import {createRoot} from 'react-dom/client';import PriceBook from './client/src/pricebook.jsx';window.__root=createRoot(document.getElementById('root'),{onUncaughtError:error=>window.__errors.push(String(error))});window.__root.render(<PriceBook/>);"}});
 bundle=output.outputFiles[0].text;
});
const copy=value=>JSON.parse(JSON.stringify(value));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(predicate,label='condition'){for(let n=0;n<300;n++){if(predicate())return;await pause(15);}assert.fail('Timed out: '+label);}
const button=(document,label)=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===label);
function draftState(window){
 const find=n=>!n?null:n.type?.name==='PriceBook'?n:find(n.child)||find(n.sibling);
 let h=find(window.__root._internalRoot.current)?.memoizedState;
 for(let i=0;i<3&&h;i++)h=h.next;
 return {book:h?.memoizedState,change:h?.queue.dispatch};
}
async function changeDraft(h,change){const next=h.window.structuredClone(draftState(h.window).book);change(next);draftState(h.window).change(next);await waitFor(()=>draftState(h.window).book===next,'draft update');}
function rawKeys(node){
 const walker=node.ownerDocument.createTreeWalker(node,4);const parts=[];while(walker.nextNode())parts.push(walker.currentNode.textContent);const text=parts.join(" ");
 // Ignore actual URLs/emails and the approved product name QuoteDone. Do not
 // whitelist any pricing field: new camelCase/path leaks must fail this test.
 const words=text.replace(/https?:\/\/\S+|\S+@\S+|\bQuoteDone\b/g,'');
 return [...new Set(words.match(/\b[A-Za-z]\w*(?:\.[A-Za-z_]\w*)+\b|\b[a-z]+[A-Z][A-Za-z0-9]*\b/g)||[])];
}
async function setup(t,{owner='[SYNTHETIC]-first-visit-'+randomUUID(),prepared=false,intercept}={}){
 if(prepared)bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),defaults,services:[custom()]});
 const calls=[],errors=[],dom=new JSDOM('<!DOCTYPE html><div id="root"></div>',{url:'http://synthetic.invalid/pricebook',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
 const window=dom.window,document=window.document;window.__errors=[];
 window.eval('window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));');window.crypto.randomUUID=randomUUID;
 window.HTMLElement.prototype.scrollIntoView=function(){};
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 function execute(path,body){
  if(path==='/api/dashboard')return {ownerId:owner,operator:{}};
  if(path==='/api/onboarding/state')return {account:{plan:'QuoteDone'},profile:{businessTypes:prepared?['CUSTOM']:types}};
  if(path==='/api/pricebook/meta')return bridge.applicationMetadata();
  if(path==='/api/pricebook/'+owner)return bridge.readApplicationBook(owner);
  if(path==='/api/pricebook/validate')return bridge.validateApplicationDraft(owner,body);
  if(path==='/api/pricebook/preview')return bridge.previewApplicationQuote(owner,body);
  if(path==='/api/pricebook/save')return bridge.saveApplicationBook(owner,body);
  if(path.endsWith('/approve'))return bridge.approveApplicationService(owner,path.split('/').at(-2),body);
  if(path==='/api/quotedone/access')return {publicKey:null,allowedOrigins:[]};
  throw Error('Unexpected synthetic path '+path);
 }
 window.__transport=async(path,{body,method='GET'}={})=>{
  body=body===undefined?undefined:copy(body);
  const call={path,method,submittedRevision:body?.revision,body};calls.push(call);
  try{
   const run=()=>execute(path,body);
   const result=intercept?await intercept({path,body,call,calls,run,owner}):run();
   call.status=200;call.returnedRevision=result?.revision;return result;
  }catch(e){call.status=e.statusCode||e.status||400;call.code=e.details?.code;call.message=e.message;throw Object.assign(e,{status:call.status});}
 };
 t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);if(process.env.PRICEBOOK_FIRST_VISIT_EVIDENCE){mkdirSync(process.env.PRICEBOOK_FIRST_VISIT_EVIDENCE,{recursive:true});writeFileSync(join(process.env.PRICEBOOK_FIRST_VISIT_EVIDENCE,t.name.replace(/[^a-z0-9]+/gi,'-')+'.json'),JSON.stringify(calls,null,2));}});
 window.eval(bundle);await waitFor(()=>button(document,'Save & validate'),'editor loaded');
 return {owner,window,document,calls};
}
async function settled(h){await waitFor(()=>h.calls.some(c=>c.path.endsWith('/validate')&&c.status),'validation response');await pause(60);}
function rates(service){
 if(service.serviceType==='FENCING_INSTALL'){
  const f=offeringFixture('FENCING_INSTALL','installed').ownerPricing;
  service.pricing=copy(f.pricing);service.knownOfferings=copy(f.knownOfferings);service.pricing.offeringRates.installedFencePerLF=25.98;
 }else if(service.serviceType==='LANDSCAPING_MOWING')service.pricing={mowingBaseRatePerSqft:0.10,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}};
 else if(service.serviceType==='INTERIOR_PAINTING')service.pricing={laborPerWallSqftPerCoat:2,materialPerWallSqftPerCoat:1,minimumJob:0,paintWasteFactor:0};
 else return;
 service.active=true;
}

test('first visit: fresh GET revision validates unchanged with no price-book fixture writes',async()=>{
 const owner='[SYNTHETIC]-read-only-'+randomUUID(),first=bridge.readApplicationBook(owner),second=bridge.readApplicationBook(owner);
 assert.equal(second.revision,first.revision);
 assert.equal(bridge.validateApplicationDraft(owner,first).revision,first.revision);
 assert.deepEqual(loadPricebook(owner).services,[]);
});
test('first visit: new owner with nine disabled services sees no raw keys or false tier warning',async t=>{
 const h=await setup(t);await settled(h);
 assert.equal(draftState(h.window).book.services.length,9);
 assert.deepEqual(rawKeys(h.document.body),[]);
 assert.doesNotMatch(h.document.body.textContent,/Tier pricing contains values|Unnamed option/);
 assert.equal(h.calls.filter(c=>c.code==='REVISION_CONFLICT').length,0);
});
test('first visit: three entered services before and after save have readable actionable rules',async t=>{
 const h=await setup(t);await settled(h);
 await changeDraft(h,book=>{book.services.forEach(rates);book.defaults.currency='CAD';});await waitFor(()=>h.calls.some(c=>c.path.endsWith('/validate')&&c.body?.services?.filter(s=>s.active).length===3&&c.status===200),'three active services validated');await pause(60);
 assert.deepEqual(rawKeys(h.document.body),[],'before first save');
 assert.doesNotMatch(h.document.body.textContent,/Tier pricing contains values/);
 assert.match(h.document.body.textContent,/Choose each rate meaning, tax treatment and charge rule/);
 button(h.document,'Save & validate').click();await waitFor(()=>h.calls.some(c=>c.path.endsWith('/save')&&c.status===200),'save');await waitFor(()=>draftState(h.window).book.revision===bridge.readApplicationBook(h.owner).revision,'saved revision applied');await pause(600);
 assert.deepEqual(rawKeys(h.document.body),[],'after save');
 const saved=loadPricebook(h.owner),find=type=>saved.services.find(s=>s.serviceType===type);
 assert.equal(find('FENCING_INSTALL').pricing.offeringRates.installedFencePerLF,2598);
 assert.equal(find('LANDSCAPING_MOWING').pricing.mowingBaseRatePerSqft,10);
 assert.equal(find('INTERIOR_PAINTING').pricing.laborPerWallSqftPerCoat,200);
 assert.equal(find('INTERIOR_PAINTING').pricing.materialPerWallSqftPerCoat,100);
 assert.equal(saved.services.filter(s=>s.active===false).length,6);
});
for(const operation of ['save','approval'])test('first visit: own '+operation+' ignores old background revision responses',async t=>{
 const held=new Map();let changed=false,releaseGet;
 const h=await setup(t,{prepared:true,intercept:async({path,call,run})=>{
  if(['/api/pricebook/validate','/api/pricebook/preview'].includes(path)&&!held.has(path))return new Promise((resolve,reject)=>held.set(path,()=>{try{resolve(run());}catch(e){reject(e);}}));
  if(path==='/api/pricebook/save'||path.endsWith('/approve')){const result=run();changed=true;return result;}
  if(changed&&call.method==='GET'&&/^\/api\/pricebook\/\[SYNTHETIC\]/.test(path)){changed=false;return new Promise(resolve=>{releaseGet=()=>resolve(run());});}
  return run();
 }});
 await waitFor(()=>held.size===2,'both original background reads held');
 const original=draftState(h.window).book.revision;
 if(operation==='save')button(h.document,'Save & validate').click();
 else{
  button(h.document,'Review saved configuration').click();await waitFor(()=>button(h.document,'Confirm saved configuration'),'review');
  [...h.document.querySelectorAll('input[type=checkbox]')].find(n=>n.parentElement.textContent.includes('I confirm these exact saved prices')).click();
  button(h.document,'Confirm saved configuration').click();
 }
 await waitFor(()=>releaseGet,'saved mutation waiting on GET');
 const current=bridge.readApplicationBook(h.owner).revision;assert.notEqual(current,original);
 for(const release of held.values())release();await pause(80);
 // Old POSTs legitimately fail against the newly saved book; neither may
 // reclassify this same editor's successful mutation as another-session work.
 assert.equal(h.calls.filter(c=>c.code==='REVISION_CONFLICT'&&c.submittedRevision===original).length,2);
 assert.equal(h.document.querySelectorAll('dialog').length,0);
 releaseGet();await waitFor(()=>draftState(h.window).book.revision===current,'new revision installed');await pause(450);
 assert.equal(h.document.querySelectorAll('dialog').length,0);
 assert.doesNotMatch(h.document.body.textContent,/Your draft has unsaved changes against an older saved version/);
 const fresh=await setup(t,{owner:h.owner});await settled(fresh);
 assert.equal(draftState(fresh.window).book.revision,current);
 assert.equal(fresh.calls.filter(c=>c.code==='REVISION_CONFLICT').length,0);
});
test('first visit: two actual editor tabs retain the exact conflict recovery flow',async t=>{
 const first=await setup(t,{prepared:true});await settled(first);
 const second=await setup(t,{owner:first.owner});await settled(second);
 await changeDraft(first,book=>{book.services[0].pricing.price=150;});
 await changeDraft(second,book=>{book.services[0].pricing.price=110;});
 button(second.document,'Save & validate').click();await waitFor(()=>loadPricebook(first.owner).services[0].pricing.price===11000,'other tab save');
 button(first.document,'Save & validate').click();await waitFor(()=>first.document.querySelector('dialog input[type=radio]'),'real conflict');
 assert.equal(draftState(first.window).book.services[0].pricing.price,150);
 assert.equal(loadPricebook(first.owner).services[0].pricing.price,11000);
 assert.match(first.document.querySelector('dialog').textContent,/Recover your unsaved changes/);
 assert.deepEqual(rawKeys(first.document.querySelector('dialog')),[]);
});
