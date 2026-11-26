// November 26, 2026 (v58). Audit of v57, editor part: changing any
// business-wide setting un-approves every service, and the editor said nothing.
//
// Handwritten expectations BEFORE execution, on a saved, approved, live service:
// - On load there is no business-wide notice, and the service is QUOTING LIVE
//   with a current approval.
// - Changing the markup percent in the draft shows the notice; changing it
//   back removes it.
// - Changing only "Flag prices older than (days)" does not show it: that
//   reminder is not part of the approval.
// - After saving a changed markup, the saved service's approval is no longer
//   current and its status asks for confirmation, as the notice said; the
//   notice is gone because the draft matches the saved book again.
// - The markup column in a service's Quote configuration is labelled
//   "(all services)".
// Real React + real bridge/storage; only the HTTP transport is synthetic.
import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {migrate} from '../server/src/db.js';

const root=fileURLToPath(new URL('..',import.meta.url));
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(false),peakMonths:[],peakSurchargePercent:0};
const custom=()=>({serviceType:'CUSTOM',service:'[SYNTHETIC] Visit',source:'MANUAL',active:true,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price:100,minimumJob:0},tiers:[]});
const NOTICE='You changed a business-wide setting. It applies to every service. After you save, each service you had confirmed must be confirmed again before it gives instant quotes.';
const CONFIRM='Confirm this exact saved configuration before enabling customer quotes.';
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
async function changeDraft(h,change){const edited=h.window.structuredClone(draftState(h.window).book);change(edited);const next=h.window.structuredClone(edited);draftState(h.window).change(next);await waitFor(()=>draftState(h.window).book===next,'draft update');}
async function setup(t){
 const owner='[SYNTHETIC]-business-wide-'+randomUUID();
 bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),defaults,services:[custom()]});
 const saved=bridge.readApplicationBook(owner);
 bridge.approveApplicationService(owner,saved.services[0].id,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true});
 const calls=[],errors=[],dom=new JSDOM('<!DOCTYPE html><div id="root"></div>',{url:'http://synthetic.invalid/pricebook',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',e=>errors.push(String(e)))});
 const window=dom.window,document=window.document;window.__errors=[];
 window.eval('window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));');window.crypto.randomUUID=randomUUID;
 window.HTMLElement.prototype.scrollIntoView=function(){};
 window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 function execute(path,body){
  if(path==='/api/dashboard')return {ownerId:owner,operator:{}};
  if(path==='/api/onboarding/state')return {account:{plan:'QuoteDone',planStatus:'active'},profile:{businessTypes:['CUSTOM']}};
  if(path==='/api/pricebook/meta')return bridge.applicationMetadata();
  if(path==='/api/pricebook/'+owner)return bridge.readApplicationBook(owner);
  if(path==='/api/pricebook/validate')return bridge.validateApplicationDraft(owner,body);
  if(path==='/api/pricebook/preview')return bridge.previewApplicationQuote(owner,body);
  if(path==='/api/pricebook/save')return bridge.saveApplicationBook(owner,body);
  if(path.endsWith('/approve'))return bridge.approveApplicationService(owner,path.split('/').at(-2),body);
  if(path==='/api/quotedone/access')return {publicKey:null,allowedOrigins:[]};
  throw Error('Unexpected synthetic path '+path);
 }
 window.__transport=async(path,{body}={})=>{
  body=body===undefined?undefined:copy(body);const call={path,body};calls.push(call);
  try{const result=execute(path,body);call.status=200;return result;}
  catch(e){call.status=e.statusCode||e.status||400;call.message=e.message;throw Object.assign(e,{status:call.status});}
 };
 t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[]);assert.deepEqual(Array.from(window.__errors),[]);});
 window.eval(bundle);await waitFor(()=>button(document,'Save & validate'),'editor loaded');
 return {owner,window,document,calls};
}
const notice=h=>h.document.querySelector('[data-business-settings-changed]');
const savedStatus=owner=>{const book=bridge.readApplicationBook(owner);return bridge.validateApplicationDraft(owner,book).statuses.find(status=>status.serviceId===book.services[0].id);};

test('fix 5 (editor): a changed business-wide setting shows the notice, and saving it does un-approve the service',async t=>{
 const h=await setup(t);
 await waitFor(()=>h.calls.some(c=>c.path.endsWith('/validate')&&c.status),'first validation');await pause(60);
 // On load: live, approved, no notice.
 const before=savedStatus(h.owner);
 assert.equal(before.status,'QUOTING LIVE');assert.equal(before.approvalCurrent,true);
 assert.equal(notice(h),null);
 // Open the collapsed "Quote configuration" section of the service.
 [...h.document.querySelectorAll('button.disclose-summary')].find(node=>node.querySelector('.disclose-title')?.textContent==='Quote configuration').click();
 await waitFor(()=>/Choose each rate meaning/.test(h.document.body.textContent),'quote configuration opened');
 assert.match(h.document.body.textContent,/Apply markup \/ margin \(all services\)/);
 assert.match(h.document.body.textContent,/The markup \/ margin column, currency, fixed charges, travel areas, estimate range, busy-season surcharge and time zone are business-wide and change every service\./);
 // The price-age reminder is not part of the approval.
 await changeDraft(h,book=>{book.defaults.stalePriceThresholdDays=90;});await pause(30);
 assert.equal(notice(h),null);
 await changeDraft(h,book=>{delete book.defaults.stalePriceThresholdDays;});
 // The markup percent is.
 await changeDraft(h,book=>{book.defaults.markupPercent=10;});await waitFor(()=>notice(h),'notice shown');
 assert.equal(notice(h).textContent,NOTICE);
 await changeDraft(h,book=>{book.defaults.markupPercent=0;});await waitFor(()=>!notice(h),'notice removed');
 // Save the change: the server no longer treats the approval as current.
 await changeDraft(h,book=>{book.defaults.markupPercent=10;});await waitFor(()=>notice(h),'notice shown again');
 button(h.document,'Save & validate').click();
 await waitFor(()=>h.calls.some(c=>c.path.endsWith('/save')&&c.status===200),'save');
 await waitFor(()=>draftState(h.window).book.revision===bridge.readApplicationBook(h.owner).revision,'saved revision applied');
 await waitFor(()=>!notice(h),'notice gone after save');
 const after=savedStatus(h.owner);
 assert.equal(bridge.readApplicationBook(h.owner).defaults.markupPercent,10);
 assert.equal(after.approvalCurrent,false);assert.equal(after.status,'NEEDS PRICING');
 assert.ok(after.applicationIssues.includes(CONFIRM),JSON.stringify(after.applicationIssues));
});
