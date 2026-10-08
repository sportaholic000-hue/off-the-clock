import './pricebookTestEnv.mjs';
import test, {before} from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {build} from 'esbuild';
import {JSDOM, VirtualConsole} from 'jsdom';
import {fileURLToPath} from 'node:url';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {migrate} from '../server/src/db.js';

// Hand-written expectations: local $150, remote $110 are a conflict, not
// $260. Independent $110/$220 edits must persist as 11,000/22,000 cents.
// Transport calls below run the REAL bridge against disposable synthetic
// storage. JSDOM runs the actual React editor; only native dialog opening
// and navigation are shimmed. This does not claim Chromium visual coverage.
const root=fileURLToPath(new URL('..',import.meta.url));
let bundle;
before(async()=>{
  migrate();
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':JSON.stringify('development')},
    plugins:[{name:'synthetic-transport',setup(builder){builder.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=async(...args)=>JSON.parse(JSON.stringify(await window.__transport(...args))); export const go=()=>{};export const logout=async()=>{};export const getSessionKey=()=>"[SYNTHETIC]";',loader:'js'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:"import React from 'react';import {createRoot} from 'react-dom/client';import PriceBook from './client/src/pricebook.jsx';window.__root=createRoot(document.getElementById('root'),{onUncaughtError:error=>window.__renderErrors.push(String(error))});window.__root.render(<PriceBook/>);"}});
  bundle=output.outputFiles[0].text;
});
const categories=['labor','material','removal','prep','addon','equipment','travel','disposal','permit','overhead','surcharge'];
const all=value=>Object.fromEntries(categories.map(key=>[key,value]));
const defaults={currency:'CAD',markupPercent:0,markupMode:'markup',overheadFixed:0,minimumJobPrice:0,travelFee:0,disposalFee:0,permitFee:0,taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0,markupApplies:all(true),peakMonths:[],peakSurchargePercent:0};
const service=(name,price)=>({serviceType:'CUSTOM',service:'[SYNTHETIC] '+name,source:'MANUAL',active:true,feeRules:{travel:'not_applicable',disposal:'not_applicable',permit:'not_applicable',overhead:'not_applicable'},priceBasisByCategory:all('cost'),taxabilityByCategory:all(false),pricing:{customPricingMode:'fixed',customChargeClassification:'labor',unit:'flat',price,minimumJob:0},tiers:[]});
async function waitFor(predicate,message='condition',timeout=4000){const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,15));}assert.fail('Timed out waiting for '+message);}
function button(document,label){return [...document.querySelectorAll('button')].find(element=>element.textContent.trim()===label);}
function state(window){const visit=fiber=>{if(!fiber)return null;if(fiber.type?.name==='PriceBook')return fiber;return visit(fiber.child)||visit(fiber.sibling);};let hook=visit(window.__root._internalRoot.current)?.memoizedState;for(let index=0;index<3&&hook;index++)hook=hook.next;assert.ok(hook,'actual PriceBook hook');return {book:hook.memoizedState,change:hook.queue.dispatch};}
async function changeDraft(window,update){const draft=window.structuredClone(state(window).book);update(draft);const next=window.structuredClone(draft);state(window).change(next);await waitFor(()=>state(window).book===next,'draft state update');}
async function setup(t,options={}){
  const owner='[SYNTHETIC]-DOM-recovery-'+crypto.randomUUID();bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),defaults,services:[service('A',100),service('B',200)]});
  const original=bridge.readApplicationBook(owner), calls=[],errors=[];
  const dom=new JSDOM('<!DOCTYPE html><div id="root"></div>',{url:'http://synthetic.invalid/pricebook',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',error=>errors.push(error))});
  const window=dom.window,document=window.document;
  window.__renderErrors=[];
  window.eval('window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));');window.crypto.randomUUID=crypto.randomUUID;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.__transport=async(path,{body,method='GET'}={})=>{
    // Match the actual HTTP JSON boundary, including object prototypes.
    if(body!==undefined)body=JSON.parse(JSON.stringify(body));
    const call={path,method,body:body===undefined?undefined:structuredClone(body)};calls.push(call);
    try {
      if(options.intercept){const result=await options.intercept(path,body,calls);if(result!==undefined)return result;}
      if(path==='/api/dashboard')return {ownerId:owner,operator:{}};
      if(path==='/api/onboarding/state')return {account:{plan:'QuoteDone'},profile:{businessTypes:['CUSTOM']}};
      if(path==='/api/pricebook/meta')return bridge.applicationMetadata();
      if(path==='/api/pricebook/'+owner)return bridge.readApplicationBook(owner);
      if(path==='/api/pricebook/validate')return bridge.validateApplicationDraft(owner,body);
      if(path==='/api/pricebook/save')return bridge.saveApplicationBook(owner,body);
      if(path==='/api/pricebook/preview')return bridge.previewApplicationQuote(owner,body);
      if(path.endsWith('/approve'))return bridge.approveApplicationService(owner,path.split('/').at(-2),body);
      if(path==='/api/quotedone/access')return {publicKey:null,allowedOrigins:[]};
      throw Error('Unexpected synthetic request: '+path);
    }catch(error){call.error=error.message;throw Object.assign(error,{status:error.statusCode||error.status||400});}
  };
  t.after(()=>{window.__root.unmount();window.close();assert.deepEqual(errors,[],'no DOM exceptions');assert.deepEqual(Array.from(window.__renderErrors),[],'no React exceptions');});
  window.eval(bundle);
  await waitFor(()=>button(document,'Save & validate'),'editor loaded');
  return {owner,original,window,document,calls,remoteSave:update=>{const remote=bridge.readApplicationBook(owner);update(remote);bridge.saveApplicationBook(owner,remote);return bridge.readApplicationBook(owner);}};
}
async function chooseLocal(document){const radios=[...document.querySelectorAll('dialog input[type="radio"]')];assert.ok(radios.length>=2);radios[0].click();await waitFor(()=>!button(document,'Accept Merged Price Book')?.disabled,'validated local choice');}

test('Save 409 opens the shared recovery dialog, keeps the draft and locks preview without a generic error',async t=>{
  const env=await setup(t);await changeDraft(env.window,draft=>{draft.services[0].pricing.price=150;});env.remoteSave(remote=>{remote.services[0].pricing.price=110;});button(env.document,'Save & validate').click();
  await waitFor(()=>env.document.querySelector('dialog input[type="radio"]'),'conflict choices');assert.equal(state(env.window).book.services[0].pricing.price,150);assert.equal(button(env.document,'Accept Merged Price Book').disabled,true);assert.ok(env.document.querySelector('fieldset[aria-label="Price book editor"]').disabled);assert.ok(!env.document.querySelector('.notice-error'));
  await chooseLocal(env.document);button(env.document,'Accept Merged Price Book').click();await waitFor(()=>!env.document.querySelector('dialog'),'accepted');assert.equal(state(env.window).book.services[0].pricing.price,150);assert.equal(state(env.window).book.revision,bridge.readApplicationBook(env.owner).revision);button(env.document,'Save & validate').click();await waitFor(()=>bridge.readApplicationBook(env.owner).services[0].pricing.price===150,'merged save');
});
test('Review mismatch reuses its fetched remote book without a second GET and a non-overlap merge saves both edits',async t=>{
  const env=await setup(t);await changeDraft(env.window,draft=>{draft.services[1].pricing.price=220;});env.remoteSave(remote=>{remote.services[0].pricing.price=110;});const before=env.calls.filter(call=>call.path==='/api/pricebook/'+env.owner).length;
  button(env.document,'Review saved configuration').click();await waitFor(()=>button(env.document,'Accept Merged Price Book')&&!button(env.document,'Accept Merged Price Book').disabled,'auto-merged review');assert.equal(env.calls.filter(call=>call.path==='/api/pricebook/'+env.owner).length-before,1);
  button(env.document,'Accept Merged Price Book').click();await waitFor(()=>!env.document.querySelector('dialog'));assert.deepEqual(Array.from(state(env.window).book.services,s=>s.pricing.price),[110,220]);button(env.document,'Save & validate').click();await waitFor(()=>bridge.readApplicationBook(env.owner).services[1].pricing.price===220);assert.deepEqual(bridge.readApplicationBook(env.owner).services.map(s=>s.pricing.price),[110,220]);
});
test('Approval-time 409 enters the same coordinator',async t=>{
  const env=await setup(t);button(env.document,'Review saved configuration').click();await waitFor(()=>button(env.document,'Confirm saved configuration'),'review');
  const ack=[...env.document.querySelectorAll('input[type="checkbox"]')].find(element=>element.parentElement.textContent.includes('I confirm these exact saved prices'));assert.ok(ack);ack.click();await waitFor(()=>!button(env.document,'Confirm saved configuration').disabled);
  env.remoteSave(remote=>{remote.services[0].pricing.price=110;});button(env.document,'Confirm saved configuration').click();await waitFor(()=>env.document.querySelector('dialog'),'approval conflict');assert.equal(state(env.window).book.services[0].pricing.price,100);
});
test('unrelated 409 errors remain ordinary validation errors and do not mount recovery',async t=>{
  const env=await setup(t,{intercept:async path=>{if(path==='/api/pricebook/save')throw Object.assign(Error('[SYNTHETIC] immutable source conflict'),{status:409,details:{field:'source'}});}});button(env.document,'Save & validate').click();await waitFor(()=>env.document.body.textContent.includes('[SYNTHETIC] immutable source conflict'),'ordinary error');assert.ok(!env.document.querySelector('dialog'));
});
test('missing prices and approval warnings do not block acceptance; malformed merged values do',async t=>{
  const env=await setup(t);await changeDraft(env.window,draft=>{delete draft.services[1].pricing.price;});env.remoteSave(remote=>{remote.services[0].pricing.price=110;});button(env.document,'Review saved configuration').click();await waitFor(()=>button(env.document,'Accept Merged Price Book')&&!button(env.document,'Accept Merged Price Book').disabled,'incomplete draft accepted');button(env.document,'Accept Merged Price Book').click();await waitFor(()=>!env.document.querySelector('dialog'));assert.ok(!Object.hasOwn(state(env.window).book.services[1].pricing,'price'));
  await changeDraft(env.window,draft=>{draft.services[1].pricing.unknownPricingField=1;});env.remoteSave(remote=>{remote.services[0].pricing.price=100;});button(env.document,'Review saved configuration').click();await waitFor(()=>env.document.querySelector('dialog .notice-error'),'malformed diagnostics');assert.equal(button(env.document,'Accept Merged Price Book').disabled,true);
  button(env.document,'Return to editing').click();await waitFor(()=>!env.document.querySelector('dialog'));await changeDraft(env.window,draft=>{delete draft.services[1].pricing.unknownPricingField;});button(env.document,'Recover unsaved changes').click();await waitFor(()=>button(env.document,'Accept Merged Price Book')&&!button(env.document,'Accept Merged Price Book').disabled,'corrected draft accepted');
});
test('explicit discard requires confirmation and restores the authoritative remote snapshot',async t=>{
  const env=await setup(t);await changeDraft(env.window,draft=>{draft.services[0].pricing.price=150;});env.remoteSave(remote=>{remote.services[0].pricing.price=110;});button(env.document,'Review saved configuration').click();await waitFor(()=>env.document.querySelector('dialog input[type="radio"]'));button(env.document,'Load saved version').click();await waitFor(()=>button(env.document,'Discard my draft and load saved version'));assert.equal(state(env.window).book.services[0].pricing.price,150);button(env.document,'Discard my draft and load saved version').click();await waitFor(()=>!env.document.querySelector('dialog'));assert.equal(state(env.window).book.services[0].pricing.price,110);
});
test('remote-deleted modified service can be restored and receives a new server identity',async t=>{
  const env=await setup(t);await changeDraft(env.window,draft=>{draft.services[0].pricing.price=150;});env.remoteSave(remote=>{remote.services.shift();});button(env.document,'Review saved configuration').click();await waitFor(()=>env.document.body.textContent.includes('was deleted remotely'));await chooseLocal(env.document);button(env.document,'Accept Merged Price Book').click();await waitFor(()=>!env.document.querySelector('dialog'));const restored=state(env.window).book.services.find(s=>s.pricing.price===150);assert.ok(!restored.id);button(env.document,'Save & validate').click();await waitFor(()=>bridge.readApplicationBook(env.owner).services.some(s=>s.pricing.price===150));assert.notEqual(bridge.readApplicationBook(env.owner).services.find(s=>s.pricing.price===150).id,env.original.services[0].id);
});
test('local additions have stable UI IDs and every actual API payload excludes transient keys',async t=>{
  const env=await setup(t);const select=env.document.querySelector('select[aria-label="New service type"]');select.value='CUSTOM';select.dispatchEvent(new env.window.Event('change',{bubbles:true}));await waitFor(()=>!button(env.document,'Add service').disabled);button(env.document,'Add service').click();await waitFor(()=>state(env.window).book.services.length===3);const added=state(env.window).book.services[2];assert.ok(added.__clientTempId);
  await waitFor(()=>env.calls.some(call=>call.path==='/api/pricebook/preview'&&!call.body.serviceId),'new draft preview');button(env.document,'Save & validate').click();await waitFor(()=>bridge.readApplicationBook(env.owner).services.length===3,'new draft saved');
  for(const call of env.calls.filter(call=>['/api/pricebook/save','/api/pricebook/validate','/api/pricebook/preview'].includes(call.path)))assert.ok(!JSON.stringify(call.body).includes('__clientTempId'),call.path);
});
test('a second edit/save/recovery cycle advances its base instead of resurrecting the initial prices',async t=>{
  const env=await setup(t);await changeDraft(env.window,draft=>{draft.services[1].pricing.price=220;});env.remoteSave(remote=>{remote.services[0].pricing.price=110;});button(env.document,'Review saved configuration').click();await waitFor(()=>button(env.document,'Accept Merged Price Book')&&!button(env.document,'Accept Merged Price Book').disabled);button(env.document,'Accept Merged Price Book').click();await waitFor(()=>!env.document.querySelector('dialog'));button(env.document,'Save & validate').click();await waitFor(()=>state(env.window).book.revision===bridge.readApplicationBook(env.owner).revision&&!button(env.document,'Save & validate').disabled);
  await changeDraft(env.window,draft=>{draft.services[1].pricing.price=200;});env.remoteSave(remote=>{remote.services[0].pricing.price=100;});button(env.document,'Review saved configuration').click();await waitFor(()=>button(env.document,'Accept Merged Price Book')&&!button(env.document,'Accept Merged Price Book').disabled);assert.equal(env.document.querySelectorAll('dialog input[type="radio"]').length,0);button(env.document,'Accept Merged Price Book').click();await waitFor(()=>!env.document.querySelector('dialog'));assert.deepEqual(Array.from(state(env.window).book.services,s=>s.pricing.price),[100,200]);
});
test('an additional remote save after acceptance starts recovery again and preserves the combined draft',async t=>{
  const env=await setup(t);await changeDraft(env.window,draft=>{draft.services[1].pricing.price=220;});env.remoteSave(remote=>{remote.services[0].pricing.price=110;});button(env.document,'Review saved configuration').click();await waitFor(()=>button(env.document,'Accept Merged Price Book')&&!button(env.document,'Accept Merged Price Book').disabled);button(env.document,'Accept Merged Price Book').click();await waitFor(()=>!env.document.querySelector('dialog'));env.remoteSave(remote=>{remote.services[0].service='[SYNTHETIC] newer name';});button(env.document,'Save & validate').click();await waitFor(()=>env.document.querySelector('dialog'));assert.equal(state(env.window).book.services[1].pricing.price,220);assert.equal(bridge.readApplicationBook(env.owner).services[1].pricing.price,200);
});
test('a failed remote fetch permits editing and retry without dropping the draft',async t=>{
  let fail=false;const env=await setup(t,{intercept:async path=>{if(fail&&/^\/api\/pricebook\//.test(path)&&!['/api/pricebook/save','/api/pricebook/validate','/api/pricebook/preview'].includes(path))throw Object.assign(Error('[SYNTHETIC] fetch unavailable'),{status:503});}});
  await changeDraft(env.window,draft=>{draft.services[0].pricing.price=150;});env.remoteSave(remote=>{remote.services[0].pricing.price=110;});fail=true;button(env.document,'Save & validate').click();await waitFor(()=>env.document.querySelector('dialog .notice-error'));assert.equal(state(env.window).book.services[0].pricing.price,150);button(env.document,'Return to editing').click();await waitFor(()=>!env.document.querySelector('dialog'));assert.equal(env.document.querySelector('fieldset[aria-label="Price book editor"]').disabled,false);fail=false;button(env.document,'Recover unsaved changes').click();await waitFor(()=>env.document.querySelector('dialog input[type="radio"]'));await chooseLocal(env.document);
});
test('late validation cannot overwrite a newer recovery after returning to edit',async t=>{
  let hold=false,resolveOld,oldBody;const env=await setup(t,{intercept:async(path,body)=>{if(hold&&path==='/api/pricebook/validate'){hold=false;oldBody=body;return new Promise(resolve=>{resolveOld=resolve;});}}});
  await changeDraft(env.window,draft=>{draft.services[1].pricing.price=220;});env.remoteSave(remote=>{remote.services[0].pricing.price=110;});hold=true;button(env.document,'Review saved configuration').click();await waitFor(()=>resolveOld,'held recovery validation');assert.equal(button(env.document,'Accept Merged Price Book').disabled,true);assert.equal(button(env.document,'Return to editing').disabled,false);button(env.document,'Return to editing').click();await waitFor(()=>!env.document.querySelector('dialog'));await changeDraft(env.window,draft=>{draft.services[1].pricing.price=200;});env.remoteSave(remote=>{remote.services[0].pricing.price=100;});button(env.document,'Recover unsaved changes').click();await waitFor(()=>button(env.document,'Accept Merged Price Book')&&!button(env.document,'Accept Merged Price Book').disabled);
  resolveOld({statuses:[{ownerDiagnostics:[{type:'invalid',message:'[SYNTHETIC] stale validation must be ignored'}]}],validationErrors:['[SYNTHETIC] stale validation must be ignored'],revision:oldBody.revision});await new Promise(resolve=>setTimeout(resolve,30));assert.ok(!env.document.body.textContent.includes('stale validation must be ignored'));button(env.document,'Accept Merged Price Book').click();await waitFor(()=>!env.document.querySelector('dialog'));assert.deepEqual(Array.from(state(env.window).book.services,s=>s.pricing.price),[100,200]);
});
test('competing inherited tiers show their names and prices without requiring index-based choices',async t=>{
  const env=await setup(t);await changeDraft(env.window,draft=>{draft.services[0].tiers=[{name:'Good',overrides:{}}];});env.remoteSave(remote=>{remote.services[0].tiers=[{name:'Better',overrides:{}}];});button(env.document,'Review saved configuration').click();await waitFor(()=>env.document.querySelector('dialog input[type="radio"]'));const text=env.document.querySelector('dialog').textContent;assert.ok(text.includes('Good'));assert.ok(text.includes('Better'));assert.ok(text.includes('Uses the service’s base prices'));await chooseLocal(env.document);
});
