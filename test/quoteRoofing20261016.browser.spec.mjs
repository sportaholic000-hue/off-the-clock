import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {savePricebook,loadPricebook} from '../server/priceBookService.js';

let browser,ownerBundle;
const date={timeZone:'UTC',quoteInstant:'2026-10-16T15:00:00.000Z'};

before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  ownerBundle=(await build({bundle:true,write:false,outfile:'roof-owner.js',format:'iife',platform:'browser',loader:{'.js':'jsx'},
    define:{'import.meta.env.VITE_API_URL':JSON.stringify('http://roof-owner.test'),'process.env.NODE_ENV':JSON.stringify('production')},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import{createRoot}from'react-dom/client';import PriceBook from './client/src/pricebook.jsx';createRoot(document.getElementById('root')).render(<PriceBook/>);"}})).outputFiles[0].text;
});
after(async()=>{await browser?.close();});

function seedHistoricalRoof(){
  const owner='roof-browser-'+randomUUID(),input=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},
    underlaymentPerSquare:{asphalt_shingle:1000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},
    disposalPerSquare:2000,accessoryPricingMode:'per_square_allin',minimumJob:0
  },{roofSizeInput:1000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'very_steep',stories:3,existingLayers:1,roofComplexity:'moderate',serviceScope:'full'});
  const service=structuredClone(input.ownerPricing);service.id=randomUUID();service.origin={...service.origin,ownerId:owner,serviceId:service.id};
  service.source='MANUAL';service.active=true;delete service.startingValueAdoptions;delete service.startingValueState;
  for(const field of ['pitchInstallationAdder','pitchRemovalAdder','complexityLaborMultiplier','additionalLayerRemovalFactor'])delete service.pricing[field];
  const book={ownerId:owner,services:[service],defaults:{currency:'USD',...input.businessDefaults}};
  service.quoteDoneApproval={ownerId:owner,serviceId:service.id,operationId:randomUUID(),approvedAt:'2026-10-15T12:00:00.000Z',engineVersion:bridge.ENGINE_VERSION,moneyUnitVersion:'roof-minimum-cents-v1',operation:'owner_confirmed_quotedone_registration',contentDigest:bridge.digest(bridge.approvalContent(service,book,{forceLegacyStartingValues:true}))};
  savePricebook(owner,book);return {owner,serviceId:service.id};
}

async function openOwner(owner){
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://roof-owner.test')throw Error('Unexpected browser request '+url.href);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script>'+ownerBundle.replaceAll('</script','<\\/script')+'</script></body></html>'});
    const body=request.postData()?JSON.parse(request.postData()):undefined;let payload,status=200;
    try{
      if(url.pathname==='/api/dashboard')payload={ownerId:owner,operator:{simulated:true,enabled:false}};
      else if(url.pathname==='/api/onboarding/state')payload={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:['ROOFING_REPLACEMENT']}};
      else if(url.pathname==='/api/pricebook/meta')payload=bridge.applicationMetadata();
      else if(url.pathname==='/api/pricebook/'+owner)payload=bridge.readApplicationBook(owner);
      else if(/^\/api\/pricebook\/services\/[^/]+\/approve$/.test(url.pathname))payload=bridge.approveApplicationService(owner,url.pathname.split('/').at(-2),body,date);
      else throw Error('Unexpected endpoint '+request.method()+' '+url.pathname);
    }catch(error){status=error.statusCode||400;payload={error:error.message,code:error.code,details:error.details};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.goto('http://roof-owner.test/');await page.getByRole('heading',{name:'Price book',exact:true}).waitFor();
  return {context,page,errors};
}

test('roofing Chromium: historical service shows sources and adopts every new starting value in one action',async()=>{
  // Written before execution: the approved historical service remains in
  // legacy mode while four source/assumption notices are visible. One owner
  // action persists adopted mode and confirms every system-owned leaf.
  const {owner}=seedHistoricalRoof(),opened=await openOwner(owner);
  try{
    await opened.page.getByRole('button',{name:/Quantity assumptions/}).click();
    await opened.page.getByText('New roofing starting values are available.',{exact:true}).waitFor();
    assert.equal(await opened.page.getByText('Source:',{exact:true}).count(),4);
    assert.equal(await opened.page.getByText('Assumption:',{exact:true}).count(),4);
    const response=await Promise.all([
      opened.page.waitForResponse(item=>/\/approve$/.test(item.url())&&item.request().method()==='POST'),
      opened.page.getByRole('button',{name:'Adopt new roofing rules and starting values',exact:true}).click()
    ]).then(([item])=>item);
    assert.equal(response.ok(),true,await response.text());
    const stored=loadPricebook(owner).services[0];
    assert.equal(stored.startingValueAdoptions.roofing_replacement_20261016.mode,'adopted');
    assert.ok(Object.values(stored.startingValueState).every(row=>row.confirmed===true));
    assert.deepEqual(opened.errors,[]);
  }finally{await opened.context.close();}
});
