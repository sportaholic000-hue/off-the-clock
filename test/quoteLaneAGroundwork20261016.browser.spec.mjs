import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import express from 'express';
import {fixture,flooring} from '../verification/engine-independent/fixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';
import {webQuote,publicCopy} from './quoteDeliveryBatch20261015Fixture.mjs';
import {installQuoteEmailRoutes} from '../server/src/quoteEmailRoutes.js';

const date={timeZone:'UTC',quoteInstant:'2026-10-16T15:00:00.000Z'};
let browser,ownerBundle,resultBundle;

before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  ownerBundle=(await build({bundle:true,write:false,outfile:'lane-a-owner.js',format:'iife',platform:'browser',loader:{'.js':'jsx'},
    define:{'import.meta.env.VITE_API_URL':JSON.stringify('http://lane-a-owner.test'),'process.env.NODE_ENV':JSON.stringify('production')},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import{createRoot}from'react-dom/client';import PriceBook from './client/src/pricebook.jsx';createRoot(document.getElementById('root')).render(<PriceBook/>);"}})).outputFiles[0].text;
  resultBundle=(await build({bundle:true,write:false,outfile:'lane-a-result.js',format:'iife',platform:'browser',loader:{'.js':'jsx'},
    define:{'process.env.NODE_ENV':JSON.stringify('production'),'import.meta.env':'{}'},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import{createRoot}from'react-dom/client';import{QuoteResult}from'./client/src/quotedone.jsx';const root=createRoot(document.getElementById('root'));window.mount=result=>root.render(<QuoteResult result={result}/>);"}})).outputFiles[0].text;
});
after(async()=>{await browser?.close();});

function sod(){
  return fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:40,sodInstallLaborPerSqft:100,minimumServiceCharge:0},{sodSqft:520,sqftMethod:'exact',groundPrepNeeded:false,slope:'flat',accessDifficulty:'easy'});
}

function seed(input,{source='MANUAL'}={}){
  const owner='lane-a-browser-'+randomUUID(),service=structuredClone(input.ownerPricing);
  service.source=source;delete service.origin;delete service.quoteDoneApproval;delete service.approvedValues;
  service.validationInputs=structuredClone(input.customerInputs);
  const initial=bridge.readApplicationBook(owner),draft=bridge.convertApplicationBook({services:[service],defaults:{...input.businessDefaults,currency:'USD',quoteTimeZone:'UTC'}},'toDollars');
  bridge.saveApplicationBook(owner,{...draft,revision:initial.revision},date);
  const saved=bridge.readApplicationBook(owner),stored=loadPricebook(owner),status=bridge.bookStatuses(stored,date)[0];
  bridge.approveApplicationService(owner,saved.services[0].id,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,...(source==='MANUAL'?{}:{fields:status.confirmationFields})},date);
  return owner;
}

async function openOwner(owner,type){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://lane-a-owner.test')throw Error('Unexpected browser request '+url.href);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script>'+ownerBundle.replaceAll('</script','<\\/script')+'</script></body></html>'});
    const body=request.postData()?JSON.parse(request.postData()):undefined;
    let payload,status=200;
    try{
      if(url.pathname==='/api/dashboard')payload={ownerId:owner,operator:{simulated:true,enabled:false}};
      else if(url.pathname==='/api/onboarding/state')payload={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:[type]}};
      else if(url.pathname==='/api/pricebook/meta')payload=bridge.applicationMetadata();
      else if(url.pathname==='/api/pricebook/'+owner)payload=bridge.readApplicationBook(owner);
      else if(url.pathname==='/api/pricebook/validate')payload=bridge.validateApplicationDraft(owner,body,date);
      else if(url.pathname==='/api/pricebook/save')payload=bridge.saveApplicationBook(owner,body,date);
      else if(url.pathname==='/api/pricebook/preview')payload=bridge.previewApplicationQuote(owner,body,date);
      else if(/^\/api\/pricebook\/services\/[^/]+\/approve$/.test(url.pathname))payload=bridge.approveApplicationService(owner,url.pathname.split('/').at(-2),body,date);
      else throw Error('Unexpected endpoint '+request.method()+' '+url.pathname);
    }catch(error){status=error.statusCode||400;payload={error:error.message,code:error.code,details:error.details};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.goto('http://lane-a-owner.test/');
  await page.getByRole('heading',{name:'Price book',exact:true}).waitFor();
  return {context,page,errors};
}

async function save(page){
  const response=await Promise.all([
    page.waitForResponse(item=>item.url().endsWith('/api/pricebook/save')&&item.request().method()==='POST'),
    page.getByRole('button',{name:'Save & validate',exact:true}).click()
  ]).then(([item])=>item);
  assert.equal(response.ok(),true,await response.text());
}

test('lane A Chromium: owner package, freshness, validity and source controls save and reload exactly',async()=>{
  // Written before execution: the owner enters a 450-sq-ft pallet, a 90-day
  // reminder, 30-day validity, and supplier Q-21. Labor remains exactly $1.00
  // per square foot, and changing the quote-affecting fields invalidates the
  // previously current approval.
  const owner=seed(sod()),opened=await openOwner(owner,'LANDSCAPING_SOD');
  try{
    await opened.page.getByRole('button',{name:/Optional prices and add-on charges/}).click();
    const palletField=opened.page.locator('#field-sodPalletSizeSqft');
    await palletField.getByText('Sod pallet coverage',{exact:true}).waitFor();
    const pallet=palletField.locator('input');await pallet.fill('450');
    await opened.page.getByRole('button',{name:/Price dates and sources/}).click();
    await opened.page.getByLabel(/Sod material per sqft price source/i).fill('[SYNTHETIC] Supplier Q-21');
    await opened.page.getByRole('button',{name:/Price freshness and quote validity/}).click();
    await opened.page.getByLabel('Flag prices older than days',{exact:true}).fill('90');
    await opened.page.getByLabel('Quotes valid for days',{exact:true}).fill('30');
    await save(opened.page);
    const display=bridge.readApplicationBook(owner),stored=loadPricebook(owner);
    assert.equal(display.services[0].pricing.sodPalletSizeSqft,450);
    assert.equal(display.services[0].pricing.sodInstallLaborPerSqft,1);
    assert.equal(display.defaults.stalePriceThresholdDays,90);assert.equal(display.defaults.quoteValidityDays,30);
    assert.equal(stored.services[0].priceMetadata.sodMaterialPerSqft.sourceNote,'[SYNTHETIC] Supplier Q-21');
    assert.equal(bridge.bookStatuses(stored,date)[0].approvalCurrent,false);
    assert.deepEqual(opened.errors,[]);
    const reloaded=await openOwner(owner,'LANDSCAPING_SOD');
    try{
      await reloaded.page.getByRole('button',{name:/Optional prices and add-on charges/}).click();
      assert.equal(await reloaded.page.locator('#field-sodPalletSizeSqft input').inputValue(),'450');
      await reloaded.page.getByRole('button',{name:/Price freshness and quote validity/}).click();
      assert.equal(await reloaded.page.getByLabel('Flag prices older than days',{exact:true}).inputValue(),'90');
      assert.equal(await reloaded.page.getByLabel('Quotes valid for days',{exact:true}).inputValue(),'30');
      await reloaded.page.getByRole('button',{name:/Price dates and sources/}).click();
      assert.equal(await reloaded.page.getByLabel(/Sod material per sqft price source/i).inputValue(),'[SYNTHETIC] Supplier Q-21');
      assert.deepEqual(reloaded.errors,[]);
    }finally{await reloaded.context.close();}
  }finally{if(opened.context.pages().length)await opened.context.close();}
});

test('lane A Chromium: an unchanged confirmed AI number stays marked until This is my price is saved',async()=>{
  // Written before execution: ordinary AI field confirmation is not cost
  // verification. The unchanged sod material rate remains an AI placeholder;
  // the explicit owner-adoption control clears only that leaf after reload.
  const owner=seed(sod(),{source:'AI_SUGGESTED'}),opened=await openOwner(owner,'LANDSCAPING_SOD');
  try{
    await opened.page.getByText('AI placeholder prices',{exact:true}).waitFor();
    await opened.page.getByText(/Confirmation does not verify cost/i).waitFor();
    await opened.page.getByRole('button',{name:/Price dates and sources/}).click();
    const source=opened.page.getByLabel(/Sod material per sqft price source/i),row=opened.page.locator('.owner-field').filter({has:source});
    await row.getByRole('button',{name:'This is my price',exact:true}).click();
    await save(opened.page);
    assert.equal(loadPricebook(owner).services[0].priceMetadata.sodMaterialPerSqft.aiPlaceholder,false);
    const reloaded=await openOwner(owner,'LANDSCAPING_SOD');
    try{
      await reloaded.page.getByRole('button',{name:/Price dates and sources/}).click();
      const adoptedSource=reloaded.page.getByLabel(/Sod material per sqft price source/i);
      const adopted=reloaded.page.locator('.owner-field').filter({has:adoptedSource});
      assert.equal(await adopted.getByRole('button',{name:'This is my price',exact:true}).count(),0);
      assert.ok((await reloaded.page.getByText('AI placeholder prices',{exact:true}).count())===1,'other unchanged AI prices remain visibly marked');
      assert.deepEqual(reloaded.errors,[]);
    }finally{await reloaded.context.close();}
  }finally{if(opened.context.pages().length)await opened.context.close();}
});

test('lane A Chromium: widget and actual public page show frozen validity, while blank stays silent',async t=>{
  // Written before execution: 2026-10-16 + 30 local calendar days is
  // 2026-11-15. The exact sentence appears in the real widget and public-page
  // components. With a blank validity setting, the widget emits no sentence.
  const statement='This quote is valid for 30 days, until November 15, 2026.',f=flooring('tile',200);f.businessDefaults.quoteValidityDays=30;
  const saved=webQuote(f,[],date.quoteInstant);saved.email.enqueueSavedQuote({ownerId:saved.owner,quoteId:saved.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  const {token}=publicCopy(saved.email,saved.rows()[0]),app=express();installQuoteEmailRoutes(app,{service:saved.email});
  const server=app.listen(0,'127.0.0.1');t.after(()=>new Promise(resolve=>server.close(resolve)));await new Promise(resolve=>server.once('listening',resolve));
  const page=await browser.newPage();t.after(()=>page.close());
  await page.setContent('<div id="root"></div>');await page.addScriptTag({content:resultBundle});await page.evaluate(result=>window.mount(result),saved.result);
  await page.getByText(statement,{exact:false}).waitFor();
  await page.goto(`http://127.0.0.1:${server.address().port}/quote-copy/${saved.owner}/${token}`);await page.getByText(statement,{exact:false}).waitFor();
  const blank=webQuote(flooring('tile',200),[],date.quoteInstant);
  await page.goto('about:blank');
  await page.setContent('<div id="root"></div>');await page.addScriptTag({content:resultBundle});await page.evaluate(result=>window.mount(result),blank.result);
  assert.equal(await page.getByText(/quote is valid for/i).count(),0);
});
