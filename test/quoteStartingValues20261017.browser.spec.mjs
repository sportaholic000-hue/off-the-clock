import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {readFileSync} from 'node:fs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';

let browser,ownerBundle;
const date={timeZone:'UTC',quoteInstant:'2026-10-16T15:00:00.000Z'};

before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  ownerBundle=(await build({bundle:true,write:false,outfile:'starting-owner.js',format:'iife',platform:'browser',loader:{'.js':'jsx'},
    define:{'import.meta.env.VITE_API_URL':JSON.stringify('http://starting-owner.test'),'process.env.NODE_ENV':JSON.stringify('production')},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import{createRoot}from'react-dom/client';import PriceBook from './client/src/pricebook.jsx';createRoot(document.getElementById('root')).render(<PriceBook/>);"}})).outputFiles[0].text;
});
after(async()=>{await browser?.close();});

async function openOwner(owner,type){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://starting-owner.test')throw Error('Unexpected browser request '+url.href);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script>'+ownerBundle.replaceAll('</script','<\\/script')+'</script></body></html>'});
    const body=request.postData()?JSON.parse(request.postData()):undefined;let payload,status=200;
    try{
      if(url.pathname==='/api/dashboard')payload={ownerId:owner,operator:{simulated:true,enabled:false}};
      else if(url.pathname==='/api/onboarding/state')payload={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:[type]}};
      else if(url.pathname==='/api/pricebook/meta')payload=bridge.applicationMetadata();
      else if(url.pathname==='/api/pricebook/'+owner)payload=bridge.readApplicationBook(owner);
      else if(url.pathname==='/api/pricebook/validate')payload=bridge.validateApplicationDraft(owner,body,date);
      else if(url.pathname==='/api/pricebook/save')payload=bridge.saveApplicationBook(owner,body,date);
      else if(/^\/api\/pricebook\/services\/[^/]+\/approve$/.test(url.pathname))payload=bridge.approveApplicationService(owner,url.pathname.split('/').at(-2),body,date);
      else throw Error('Unexpected endpoint '+request.method()+' '+url.pathname);
    }catch(error){status=error.statusCode||400;payload={error:error.message,code:error.code,details:error.details};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.goto('http://starting-owner.test/');await page.getByRole('heading',{name:'Price book',exact:true}).waitFor();
  return {context,page,errors};
}

const historical=JSON.parse(readFileSync(new URL('./quoteStartingValues20261017Legacy.json',import.meta.url)));
async function save(page){
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST'),page.getByRole('button',{name:'Save & validate',exact:true}).click()]);
  assert.equal(response.ok(),true,await response.text());
}
for(const [name,group,count] of [['painting','painting_coats_20261017',1],['flooring','flooring_patterns_20261017',3]]){
  test(name+' Chromium: one adoption preserves owner values and the saved approval',async()=>{
    // Expected BEFORE execution: source/assumption groups 1 painting, 3 flooring;
    // pending values remain outside pricing, no individual confirmation button;
    // one adoption confirms all system leaves and retains a current approval.
    const book=structuredClone(historical.cases[name].book),owner=book.ownerId;savePricebook(owner,book);
    const opened=await openOwner(owner,book.services[0].serviceType);
    try{
      await opened.page.getByRole('button',{name:/Quantity assumptions/}).click();
      await opened.page.getByText('New '+name+' starting values are available.',{exact:true}).waitFor();
      assert.equal(await opened.page.getByText('Source:',{exact:true}).count(),count);
      assert.equal(await opened.page.getByText('Assumption:',{exact:true}).count(),count);
      assert.equal(await opened.page.locator('.starting-value-note').getByRole('button',{name:/^Confirm /}).count(),0);
      assert.deepEqual(loadPricebook(owner).services[0].pricing,book.services[0].pricing);
      const [response]=await Promise.all([opened.page.waitForResponse(r=>/\/approve$/.test(r.url())&&r.request().method()==='POST'),opened.page.getByRole('button',{name:'Adopt new '+name+' rules and starting values',exact:true}).click()]);
      assert.equal(response.ok(),true,await response.text());
      const stored=loadPricebook(owner);
      assert.equal(stored.services[0].startingValueAdoptions[group].mode,'adopted');
      assert.ok(Object.values(stored.services[0].startingValueState).every(row=>row.confirmed===true&&!row.pendingAdoption));
      assert.equal(bridge.applicationStatus(stored.services[0],stored,date).approvalCurrent,true);
      assert.deepEqual(opened.errors,[]);
    }finally{await opened.context.close();}
  });
  test(name+' Chromium: new proposals show source and assumption and require explicit confirmation',async()=>{
    // Expected BEFORE execution: 3 painting / 11 flooring unconfirmed leaves.
    // Editing only LVP diagonal from 4 to 5 points removes that one provenance
    // record, leaving the other 10 false; explicit confirmation saves them true.
    const book=structuredClone(historical.cases[name].book),owner='synthetic-starting-browser-'+randomUUID(),service=book.services[0];
    for(const key of ['origin','quoteDoneApproval','approvedValues','startingValueState','startingValueAdoptions'])delete service[key];
    const draft=bridge.convertApplicationBook({services:[service],defaults:book.defaults},'toDollars');
    bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision},date);
    const opened=await openOwner(owner,service.serviceType),page=opened.page;
    try{
      await page.getByRole('button',{name:/Quantity assumptions/}).click();
      await page.getByText('Starting value — waiting for your confirmation',{exact:true}).first().waitFor();
      assert.equal(await page.getByText('Source:',{exact:true}).count(),count);
      assert.equal(await page.getByText('Assumption:',{exact:true}).count(),count);
      assert.equal(await page.getByRole('button',{name:'Adopt new '+name+' rules and starting values',exact:true}).count(),0);
      let expected=name==='painting'?3:11;
      assert.equal(await page.locator('.starting-value-note').getByRole('button',{name:/^Confirm /}).count(),expected);
      if(name==='flooring'){
        await page.getByRole('button',{name:/Optional prices and add-on charges/}).click();
        await page.getByLabel('Vinyl plank Diagonal additional waste by flooring type',{exact:true}).fill('5');
        await save(page);
        const saved=loadPricebook(owner).services[0];
        assert.equal(saved.pricing.diagonalWasteAdderByType.vinyl_plank,.05);
        assert.equal(saved.startingValueState['diagonalWasteAdderByType.vinyl_plank'],undefined);
        assert.equal(Object.values(saved.startingValueState).length,10);
        assert.ok(Object.values(saved.startingValueState).every(row=>row.confirmed===false));
        await page.reload();await page.getByRole('button',{name:/Quantity assumptions/}).click();expected=10;
      }
      for(let i=0;i<expected;i++)await page.locator('.starting-value-note').getByRole('button',{name:/^Confirm /}).first().click();
      await save(page);
      assert.ok(Object.values(loadPricebook(owner).services[0].startingValueState).every(row=>row.confirmed===true));
      assert.deepEqual(opened.errors,[]);
    }finally{await opened.context.close();}
  });
}
