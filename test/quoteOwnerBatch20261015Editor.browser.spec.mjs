import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {custom,concrete,fixture} from '../verification/engine-independent/fixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';

const date={timeZone:'UTC',quoteInstant:'2026-10-15T12:00:00.000Z'};
let browser,bundle;

before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const built=await build({bundle:true,write:false,outfile:'owner-batch-editor.js',format:'iife',platform:'browser',loader:{'.js':'jsx'},
    define:{'import.meta.env.VITE_API_URL':JSON.stringify('http://owner-batch-editor.test'),'process.env.NODE_ENV':JSON.stringify('production')},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import{createRoot}from'react-dom/client';import PriceBook from './client/src/pricebook.jsx';createRoot(document.getElementById('root')).render(<PriceBook/>);"}});
  bundle=built.outputFiles[0].text;
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
after(async()=>{await browser?.close();});

function seed(input,{approve=true}={}) {
  const owner='synthetic-owner-batch-'+randomUUID();
  const service=structuredClone(input.ownerPricing);
  service.validationInputs=structuredClone(input.customerInputs||{});
  const policy=service.zeroPricePolicy;
  delete service.origin;delete service.approvedValues;delete service.quoteDoneApproval;delete service.zeroPricePolicy;
  const initial=bridge.readApplicationBook(owner);
  const draft=bridge.convertApplicationBook({services:[service],defaults:{currency:'USD',quoteTimeZone:'UTC',...input.businessDefaults}},'toDollars');
  bridge.saveApplicationBook(owner,{...draft,revision:initial.revision},date);
  if(approve){const saved=bridge.readApplicationBook(owner);bridge.approveApplicationService(owner,saved.services[0].id,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,...(policy?{zeroClassification:{freeCompleteService:policy.freeCompleteService,freeTiers:policy.freeTiers,includedPrices:policy.includedPrices}}:{})},date);}
  return owner;
}

async function openEditor(owner,type) {
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  let lastPreview=null;
  page.on('pageerror',error=>errors.push(error.stack||error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://owner-batch-editor.test')throw Error('Unexpected browser request '+url.href);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script></body></html>'});
    const body=request.postData()?JSON.parse(request.postData()):undefined;
    let payload,status=200;
    try{
      if(url.pathname==='/api/dashboard')payload={ownerId:owner,operator:{simulated:true,enabled:false}};
      else if(url.pathname==='/api/onboarding/state')payload={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:[type]}};
      else if(url.pathname==='/api/pricebook/meta')payload=bridge.applicationMetadata();
      else if(url.pathname==='/api/pricebook/'+owner)payload=bridge.readApplicationBook(owner);
      else if(url.pathname==='/api/pricebook/validate')payload=bridge.validateApplicationDraft(owner,body,date);
      else if(url.pathname==='/api/pricebook/save')payload=bridge.saveApplicationBook(owner,body,date);
      else if(url.pathname==='/api/pricebook/preview'){payload=bridge.previewApplicationQuote(owner,body,date);lastPreview=payload;}
      else if(/^\/api\/pricebook\/services\/[^/]+\/approve$/.test(url.pathname))payload=bridge.approveApplicationService(owner,url.pathname.split('/').at(-2),body,date);
      else throw Error('Unexpected endpoint '+request.method()+' '+url.pathname);
    }catch(error){status=error.statusCode||400;payload={error:error.message,code:error.code,details:error.details};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
  });
  await page.goto('http://owner-batch-editor.test/');
  await page.getByRole('heading',{name:'Price book',exact:true}).waitFor();
  return {context,page,errors,lastPreview:()=>lastPreview};
}

async function save(page) {
  const response=await Promise.all([
    page.waitForResponse(item=>item.url().endsWith('/api/pricebook/save')&&item.request().method()==='POST'),
    page.getByRole('button',{name:'Save & validate',exact:true}).click()
  ]).then(([item])=>item);
  assert.equal(response.ok(),true,await response.text());
}

test('QE-017: complete owner preview shows the authoritative withheld-option notice exactly once',async()=>{
  const input=custom();
  input.ownerPricing.tiers=[
    {name:'Ready',overrides:{price:15000}},
    {name:'Needs price A',overrides:{price:0}},
    {name:'Needs price B',overrides:{price:0}}
  ];
  const owner=seed(input),opened=await openEditor(owner,'CUSTOM');
  try{
    const expected='Fewer options are available because one or more configured options need owner review.';
    await opened.page.getByText(expected,{exact:true}).waitFor();
    assert.equal(await opened.page.getByText(expected,{exact:true}).count(),1);
    await opened.page.getByText('$150.00',{exact:true}).waitFor();
    assert.equal(opened.lastPreview().optionAvailabilityNotice,expected);
    assert.deepEqual(opened.lastPreview().options.map(option=>option.midEstimate),[150]);
    assert.equal(opened.lastPreview().failedTierDiagnostics.length,2);
    assert.deepEqual(opened.errors,[]);
  }finally{await opened.context.close();}
});

test('QE-017: one withheld option preserves the ready amount and the same authoritative notice',async()=>{
  const input=custom();
  input.ownerPricing.tiers=[{name:'Ready',overrides:{price:15000}},{name:'Needs price',overrides:{price:0}}];
  const owner=seed(input),opened=await openEditor(owner,'CUSTOM');
  try{
    const expected='Fewer options are available because one or more configured options need owner review.';
    await opened.page.getByText(expected,{exact:true}).waitFor();
    assert.equal(await opened.page.getByText(expected,{exact:true}).count(),1);
    assert.deepEqual(opened.lastPreview().options.map(option=>option.midEstimate),[150]);
    assert.equal(opened.lastPreview().failedTierDiagnostics.length,1);
    assert.deepEqual(opened.errors,[]);
  }finally{await opened.context.close();}
});

test('QE-017: all unavailable options remain review-only and do not invent an availability notice',async()=>{
  const input=custom();
  input.ownerPricing.tiers=[{name:'Needs price A',overrides:{price:0}},{name:'Needs price B',overrides:{price:0}}];
  const owner=seed(input,{approve:false}),opened=await openEditor(owner,'CUSTOM');
  try{
    await opened.page.getByText('This job would go to you for review.',{exact:true}).waitFor();
    assert.equal(opened.lastPreview().resultType,'ESTIMATE_REQUIRES_REVIEW');
    assert.equal(opened.lastPreview().optionAvailabilityNotice,undefined);
    assert.equal(await opened.page.getByText(/Fewer options are available because/i).count(),0);
    assert.deepEqual(opened.errors,[]);
  }finally{await opened.context.close();}
});

test('QE-018: percent-entry waste help, conversion, save/reload, and concrete amount agree',async()=>{
  const input=concrete(),owner=seed(input),opened=await openEditor(owner,'CONCRETE_PATIO_SLAB');
  try{
    await opened.page.getByRole('button',{name:/Quantity assumptions/}).click();
    const waste=opened.page.getByLabel('Concrete ordering waste allowance',{exact:true});
    await waste.waitFor();
    assert.equal(await waste.inputValue(),'10');
    const wasteRow=waste.locator('xpath=ancestor::div[contains(@class,"assumption-row")]');
    await wasteRow.getByText(/Enter 10 for 10%.*saved calculation factor is 0\.10/i).waitFor();
    await waste.fill('12');
    await save(opened.page);
    const stored=bridge.readApplicationBook(owner);
    assert.equal(stored.services[0].pricing.concreteWasteFactor,0.12);
    assert.equal(bridge.bookStatuses(loadPricebook(owner),date)[0].approvalCurrent,false);
    await opened.context.close();

    const reloaded=await openEditor(owner,'CONCRETE_PATIO_SLAB');
    try{
      await reloaded.page.getByRole('button',{name:/Quantity assumptions/}).click();
      assert.equal(await reloaded.page.getByLabel('Concrete ordering waste allowance',{exact:true}).inputValue(),'12');
      await reloaded.page.waitForFunction(()=>document.body.textContent.includes('$3,547.78'));
      assert.equal(reloaded.lastPreview().midEstimate,3547.78);
      assert.deepEqual(reloaded.errors,[]);
    }finally{await reloaded.context.close();}
  }finally{if(!opened.context.pages().length){}else await opened.context.close();}
});

function roof() {
  const input=fixture('ROOFING_REPLACEMENT',{
    laborPerSquare:{asphalt_shingle:5000},materialCostPerSquare:{asphalt_shingle:10000},
    tearOffPerSquare:{asphalt_shingle:2000},underlaymentPerSquare:{asphalt_shingle:1500},
    underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},
    installedLaborPercent:{'underlaymentPerSquare.asphalt_shingle':0},installedMaterialsPercent:{'underlaymentPerSquare.asphalt_shingle':100},
    accessoryPricingMode:'per_square_allin',minimumJob:0
  },{roofSizeMethod:'roof_measured',roofSizeInput:1000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',pitch:'low',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
  input.ownerPricing.priceBasisByCategory.material='sell_price';
  return input;
}

test('QE-019: rendered roof material copy changes completely with accessory mode and restores exactly',async()=>{
  const owner=seed(roof()),opened=await openEditor(owner,'ROOFING_REPLACEMENT');
  try{
    const allIn='Your all-in installed material price per square, INCLUDING starter, drip edge, ridge cap, flashing, and vents.';
    await opened.page.getByText(allIn,{exact:true}).waitFor();
    await opened.page.getByRole('button',{name:/Optional prices and add-on charges/}).click();
    const mode=opened.page.locator('#field-accessoryPricingMode select');
    await mode.selectOption('itemized');
    await opened.page.getByText(/base roofing material price per square/i,{exact:true}).waitFor();
    await opened.page.getByText(/EXCLUD(?:E|ING).*starter.*drip edge.*ridge cap.*flashing.*vents/i).waitFor();
    assert.equal(await opened.page.getByText(allIn,{exact:true}).count(),0);
    await save(opened.page);
    assert.equal(bridge.readApplicationBook(owner).services[0].pricing.accessoryPricingMode,'itemized');
    assert.equal(bridge.bookStatuses(loadPricebook(owner),date)[0].approvalCurrent,false);
    assert.deepEqual(opened.errors,[]);
    await opened.context.close();

    const reloaded=await openEditor(owner,'ROOFING_REPLACEMENT');
    try{
      await reloaded.page.getByText(/EXCLUD(?:E|ING).*starter.*drip edge.*ridge cap.*flashing.*vents/i).waitFor();
      await reloaded.page.getByRole('button',{name:/Optional prices and add-on charges/}).click();
      const reloadedMode=reloaded.page.locator('#field-accessoryPricingMode select');
      await reloadedMode.selectOption('per_square_allin');
      await reloaded.page.getByText(allIn,{exact:true}).waitFor();
      await save(reloaded.page);
      assert.equal(bridge.readApplicationBook(owner).services[0].pricing.accessoryPricingMode,'per_square_allin');
      assert.equal(bridge.bookStatuses(loadPricebook(owner),date)[0].approvalCurrent,true);
      assert.deepEqual(reloaded.errors,[]);
    }finally{await reloaded.context.close();}
  }finally{if(opened.context.pages().length)await opened.context.close();}
});

test('QE-011/QE-012: tier allocations use exact paths and structured scope never renders as a decimal',async()=>{
  const input=structuredClone(measuredScopeCases().find(item=>item.id==='stairs-installed').input);
  input.ownerPricing.pricing.installedLaborPercent={'scopeRates.stairs_installed':70};
  input.ownerPricing.pricing.installedMaterialsPercent={'scopeRates.stairs_installed':30};
  input.ownerPricing.tiers=[{name:'Premium',overrides:{
    scopeDetails:{stairs:{...input.ownerPricing.pricing.scopeDetails.stairs,description:'[SYNTHETIC] Premium stairs'}},
    scopeRates:{stairs_installed:17500},
    installedLaborPercent:{'scopeRates.stairs_installed':65},
    installedMaterialsPercent:{'scopeRates.stairs_installed':35}
  }}];
  input.businessDefaults.taxMode='TAX_MATERIALS';
  input.businessDefaults.taxPercent=10;
  const owner=seed(input),opened=await openEditor(owner,'FLOORING_INSTALL');
  try{
    await opened.page.getByText('[SYNTHETIC] Premium stairs',{exact:false}).waitFor();
    assert.equal(await opened.page.getByText('[object Object]',{exact:false}).count(),0);
    assert.equal(await opened.page.getByText(/enter a decimal/i).count(),0);
    const labor=opened.page.getByLabel(/Labor portion of installed prices.*Scope rates\.stairs installed/i);
    const materials=opened.page.getByLabel(/Materials share of installed prices.*Scope rates\.stairs installed/i);
    await labor.waitFor();await materials.waitFor();
    assert.equal(await labor.inputValue(),'65');
    assert.equal(await materials.inputValue(),'35');
    await labor.fill('60');await materials.fill('40');await save(opened.page);
    const saved=bridge.readApplicationBook(owner).services[0].tiers[0].overrides;
    assert.equal(saved.installedLaborPercent['scopeRates.stairs_installed'],60);
    assert.equal(saved.installedMaterialsPercent['scopeRates.stairs_installed'],40);
    await opened.context.close();
    const reloaded=await openEditor(owner,'FLOORING_INSTALL');
    try{
      assert.equal(await reloaded.page.getByLabel(/Labor portion of installed prices.*Scope rates\.stairs installed/i).inputValue(),'60');
      assert.equal(await reloaded.page.getByLabel(/Materials share of installed prices.*Scope rates\.stairs installed/i).inputValue(),'40');
      const book=bridge.readApplicationBook(owner),service=book.services[0];
      bridge.approveApplicationService(owner,service.id,{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
      const stored=loadPricebook(owner),result=bridge.calculateApplicationQuote(stored,stored.services[0],{customerInputs:input.customerInputs,customerFeeSelections:{}},{...date,preparingIntake:true});
      assert.equal(result.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result.internalResult));
      const scenario=result.internalResult.options[0].calculationRecord.scenarios.mid;
      // Five stairs * $175 = $875 installed. A 40% materials share is $350;
      // 10% materials tax is $35. Pretax $2,655 + $35 = $2,690.
      assert.equal(scenario.tax.taxableSubtotalCents,35000);
      assert.equal(scenario.tax.taxCents,3500);
      assert.equal(scenario.finalTotalCents,269000);
      assert.deepEqual(reloaded.errors,[]);
    }finally{await reloaded.context.close();}
    assert.deepEqual(opened.errors,[]);
  }finally{if(opened.context.pages().length)await opened.context.close();}
});

test('QE-013: real remove control saves cleanup while a complete tier remains quotable',async()=>{
  const input=structuredClone(measuredScopeCases().find(item=>item.id==='stairs-installed').input),complete=structuredClone(input.ownerPricing.pricing.scopeDetails.stairs);
  input.ownerPricing.tiers=[
    {name:'Dependent',overrides:{scopeDetails:{stairs:{description:'[SYNTHETIC] dependent'}},scopeRates:{stairs_installed:16000}}},
    {name:'Independent',overrides:{scopeDetails:{stairs:{...complete,description:'[SYNTHETIC] independent'}},scopeRates:{stairs_installed:17500}}}
  ];
  const owner=seed(input),opened=await openEditor(owner,'FLOORING_INSTALL');
  try{
    const scopeDisclosure=opened.page.getByRole('button',{name:/Additional priced scope/}).first();
    if((await scopeDisclosure.getAttribute('aria-expanded'))!=='true')await scopeDisclosure.click();
    await opened.page.getByRole('button',{name:'Remove Complete stair work configuration and prices',exact:true}).click();
    await opened.page.getByText(/Independent.*remains available|remains available.*Independent/i).waitFor();
    await save(opened.page);
    const saved=bridge.readApplicationBook(owner),service=saved.services[0];
    assert.equal(service.pricing.scopeDetails?.stairs,undefined);
    assert.equal(service.tiers[0].overrides.scopeDetails?.stairs,undefined);
    assert.equal(service.tiers[1].overrides.scopeDetails.stairs.description,'[SYNTHETIC] independent');
    bridge.approveApplicationService(owner,service.id,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true},date);
    const stored=loadPricebook(owner),result=bridge.calculateApplicationQuote(stored,stored.services[0],{customerInputs:input.customerInputs,customerFeeSelections:{}},{...date,preparingIntake:true});
    assert.equal(result.internalResult.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result.internalResult));
    assert.deepEqual(result.internalResult.options.map(option=>option.tierName),['Independent']);
    assert.equal(result.internalResult.options[0].calculationRecord.scenarios.mid.finalTotalCents,265500);
    assert.deepEqual(opened.errors,[]);
  }finally{await opened.context.close();}
});
