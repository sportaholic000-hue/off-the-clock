import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
// Same React/DOM harness as pricebookConflictRecovery.dom.spec.mjs. Every
// price-book operation here uses the authenticated running application API.
let bundlePromise;
const bundle=()=>bundlePromise??=build({absWorkingDir:fileURLToPath(new URL('../..',import.meta.url)),bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'synthetic-http-transport',setup(builder){builder.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=async(...args)=>JSON.parse(JSON.stringify(await window.__transport(...args)));export const go=()=>{};export const logout=async()=>{};export const getSessionKey=()=>"[SYNTHETIC]";',loader:'js'}));}}],stdin:{resolveDir:fileURLToPath(new URL('../..',import.meta.url)),loader:'jsx',contents:"import React from 'react';import {createRoot} from 'react-dom/client';import PriceBook from './client/src/pricebook.jsx';window.__root=createRoot(document.getElementById('root'),{onUncaughtError:error=>window.__renderErrors.push(String(error))});window.__root.render(<PriceBook/>);"}}).then(output=>output.outputFiles[0].text);
export async function waitFor(predicate,message='condition',timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,15));}assert.fail('Timed out waiting for '+message);}
export const button=(document,label)=>[...document.querySelectorAll('button')].find(element=>element.textContent.trim()===label);
export function state(window){const visit=fiber=>!fiber?null:fiber.type?.name==='PriceBook'?fiber:visit(fiber.child)||visit(fiber.sibling);let hook=visit(window.__root._internalRoot.current)?.memoizedState;for(let index=0;index<3&&hook;index++)hook=hook.next;assert.ok(hook,'actual PriceBook hook');return {book:hook.memoizedState,change:hook.queue.dispatch};}
export async function changeDraft(window,update){const next=window.structuredClone(state(window).book);update(next);state(window).change(next);await waitFor(()=>state(window).book===next,'draft state update');}
export async function render(t,f){
  const errors=[],calls=[],dom=new JSDOM('<!DOCTYPE html><div id="root"></div>',{url:'http://synthetic.invalid/pricebook',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',error=>errors.push(error))});
  const {window}=dom,document=window.document;window.__renderErrors=[];
  window.eval('window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));');window.crypto.randomUUID=randomUUID;
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.__transport=async(path,{body,method='GET'}={})=>{
    if(path==='/api/dashboard')return {ownerId:'synthetic-a',operator:{}};
    if(path==='/api/onboarding/state')return {account:{plan:'QuoteDone'},profile:{businessTypes:['FLOORING_INSTALL']}};
    if(path==='/api/quotedone/access')return {publicKey:null,allowedOrigins:[]};
    assert.ok(path.startsWith('/api/pricebook/'),'Only synthetic price-book HTTP operations');
    const call={path,method,body:body===undefined?undefined:JSON.parse(JSON.stringify(body))};calls.push(call);
    const response=await f.request(path,'synthetic-a',{method,body:call.body});call.status=response.status;
    if(response.status>=400)throw Object.assign(Error(response.body.error),{status:response.status,details:response.body.details});
    return response.body;
  };
  t.after(()=>{window.__root?.unmount();window.close();assert.deepEqual(errors,[],'no DOM exceptions');assert.deepEqual(Array.from(window.__renderErrors),[],'no React exceptions');});
  window.eval(await bundle());await waitFor(()=>button(document,'Save & validate'),'loaded editor');return {window,document,calls};
}
export async function acceptChoice(document,choice='local'){
  await waitFor(()=>document.querySelector('dialog input[type="radio"]'),'rendered conflict choices');
  const radios=[...document.querySelectorAll('dialog input[type="radio"]')];assert.equal(radios.length,2,'one ordinary conflict');radios[choice==='local'?0:1].click();
  await waitFor(()=>button(document,'Accept Merged Price Book')&&!button(document,'Accept Merged Price Book').disabled,'validated choice').catch(error=>{throw Error(error.message+': '+document.querySelector('dialog')?.textContent);});
  button(document,'Accept Merged Price Book').click();await waitFor(()=>!document.querySelector('dialog'),'accepted recovery');
}
