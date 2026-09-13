import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, join, dirname, delimiter} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {getServiceMetadata} from '../server/priceBookMetadata.js';
// Controlled transport is used ONLY to reproduce response ordering. This is
// a real React/browser regression, not authenticated application acceptance.
const root=fileURLToPath(new URL('..',import.meta.url));
const evidence=process.env.QUOTEDONE_EVIDENCE_DIR || mkdtempSync(join(tmpdir(),'otc-preview-order-'));
mkdirSync(evidence,{recursive:true});
const metadata=getServiceMetadata();
const ids={A:'46666e01-d67d-4c8d-939c-0062782e880b',B:'c98563b8-f22b-4edb-8c4a-d84456488a7b'};
const service=(id,rate)=>({id:ids[id],serviceType:'LANDSCAPING_MOWING',service:'Synthetic mowing '+id,
  active:false,source:'MANUAL',pricing:{mowingBaseRatePerSqft:rate,minimumServiceCharge:0,
  frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},
  overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}},tiers:[],
  validationInputs:{yardSqft:10000,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false}});
const book={ownerId:'synthetic-owner',revision:'starting-revision',services:[service('A',0.005),service('B',0.0051)],
  defaults:{markupPercent:0,markupMode:'markup',taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:0}};
let browser,bundle;
const previewSource=process.env.QUOTEDONE_PREVIEW_SOURCE || join(root,'client/src/pricebook.jsx');
const testedPreview=readFileSync(previewSource,'utf8');
before(async()=>{const require=createRequire(import.meta.url);const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE || 'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  const output=await build({absWorkingDir:root,nodePaths:(process.env.NODE_PATH || "").split(delimiter).filter(Boolean),plugins:[{name:'exact-preview-source',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]pricebook\.jsx$/},args=>({contents:testedPreview,loader:'jsx',resolveDir:dirname(args.path)}));}}],stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import PriceBook from './client/src/pricebook.jsx';createRoot(document.getElementById('root')).render(<PriceBook/>);",resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env.VITE_API_URL':JSON.stringify('http://preview-order.test'),'process.env.NODE_ENV':JSON.stringify('development')}});bundle=output.outputFiles[0].text;
});
after(async()=>{await browser?.close();});
const ready=label=>({resultType:'INSTANT_ESTIMATE_READY',quoteId:label,options:[{tierName:null,lowEstimate:50,midEstimate:50,highEstimate:50,priceDrivers:[],disclaimer:'Synthetic ordering control'}]});
async function scenario(name,run){
 const context=await browser.newContext();const page=await context.newPage();const pending=[],responses=[],snapshots=[];
 await context.addInitScript(()=>{window.__REACT_DEVTOOLS_GLOBAL_HOOK__={supportsFiber:true,inject(){return 1;},onCommitFiberRoot(_id,root){window.__testRoot=root;}};});
 await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());let body={};
  if(req.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle+'</script>'});
  if(url.pathname==='/api/pricebook/preview'){pending.push({route,body:req.postDataJSON()});return;}
  if(url.pathname==='/api/dashboard')body={ownerId:book.ownerId,operator:{enabled:false,simulated:true}};
  else if(url.pathname==='/api/onboarding/state')body={account:{plan:'QuoteDone'},profile:{businessTypes:['LANDSCAPING_MOWING']}};
  else if(url.pathname==='/api/pricebook/meta')body={services:metadata};
  else if(url.pathname==='/api/pricebook/'+book.ownerId)body=book;
  else if(url.pathname==='/api/pricebook/validate')body={statuses:[],validationErrors:[]};
  else throw Error('Unexpected endpoint '+url.pathname);
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 const state=()=>page.evaluate(()=>{function find(n){if(!n)return null;if(n.type?.name==='PriceBook')return n;return find(n.child)||find(n.sibling);}const f=find(window.__testRoot?.current),v=[];for(let h=f?.memoizedState;h;h=h.next)v.push(h.memoizedState);return {book:v[3],selected:v[4],preview:v[9],loading:v[10],text:document.body.innerText};});
 const wait=async check=>{for(let i=0;i<120;i++){if(await check())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out awaiting controlled browser condition');};
 const capture=async label=>{const value=await state();snapshots.push({label,...value});return value;};
 const release=async(index,body,status=200)=>{const p=pending[index];assert.ok(p,'Expected preview request '+index);responses.push({request:p.body,response:body,status});await p.route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
 let failure;
 try{await page.goto('http://preview-order.test');await wait(()=>pending.length===1);await run({page,pending,release,state,wait,capture});}
 catch(e){failure=e;}
 finally{writeFileSync(join(evidence,name+'.json'),JSON.stringify({name,method:'Actual browser/React; explicitly controlled response ordering',previewSource,previewSha256:createHash('sha256').update(testedPreview).digest('hex'),requests:pending.map(p=>p.body),responses,snapshots,failure:failure?.stack},null,2));await context.close();}
 if(failure)throw failure;
}
for(const oldStatus of [200,400])test('late '+oldStatus+' response cannot replace a new service preview',async()=>scenario('late-'+oldStatus,async h=>{
 await h.page.locator('.service-pick').filter({hasText:'Synthetic mowing B'}).click();await h.wait(()=>h.pending.length===2);
 await h.release(1,ready('B'));await h.wait(async()=>(await h.state()).preview?.quoteId==='B');await h.capture('current-B');
 await h.release(0,oldStatus===200?ready('A'):{error:'Old A error'},oldStatus);
 const result=await h.capture('after-late-A');assert.equal(result.selected,ids.B);assert.deepEqual(result.preview,ready('B'));assert.equal(result.loading,false);
}));
test('old completion cannot clear current loading and invalid input cannot retain old ready',async()=>scenario('loading-invalid',async h=>{
 await h.page.locator('#field-mowingBaseRatePerSqft input').fill('0.0051');await h.wait(()=>h.pending.length===2);
 await h.release(0,ready('old'));const pending=await h.capture('current-request-pending');assert.equal(pending.loading,true);assert.equal(pending.preview,null);
 await h.release(1,ready('current'));await h.wait(async()=>(await h.state()).preview?.quoteId==='current');
 const input=h.page.locator('#field-mowingBaseRatePerSqft input');await input.fill('invalid');await h.wait(async()=>(await h.state()).preview?.resultType==='ESTIMATE_REQUIRES_REVIEW');
 const invalid=await h.capture('invalid');assert.equal(invalid.loading,false);assert.equal(invalid.book.services[0].pricing.mowingBaseRatePerSqft,'invalid');assert.equal(invalid.preview.quoteId,undefined);
}));
test('invalid replacement rejects an old delayed success and unchanged focus blur does not request again',async()=>scenario('invalid-late-control',async h=>{
 const input=h.page.locator('#field-mowingBaseRatePerSqft input');await input.fill('invalid');await h.wait(async()=>(await h.state()).preview?.resultType==='ESTIMATE_REQUIRES_REVIEW');
 const invalid=await h.capture('invalid-before-late');await h.release(0,ready('old'));const late=await h.capture('invalid-after-late');assert.deepEqual(late.preview,invalid.preview);
 await input.fill('0.005');await h.wait(()=>h.pending.length===2);await h.release(1,ready('corrected'));await h.wait(async()=>(await h.state()).preview?.quoteId==='corrected');
 const before=await h.capture('before-focus');await input.focus();await h.page.getByRole('heading',{name:'Price book',exact:true}).click();await new Promise(r=>setTimeout(r,450));const after=await h.capture('after-blur');assert.equal(h.pending.length,2);assert.deepEqual(after.book,before.book);assert.deepEqual(after.preview,before.preview);
}));
