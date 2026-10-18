import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {randomUUID} from 'node:crypto';
import {concreteFixture,sodFixture,customPlantFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {loadPricebook} from '../server/priceBookService.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
const date={timeZone:'UTC',quoteInstant:'2026-10-16T15:00:00.000Z'};
let browser,ownerScript,customerScript;
before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  const bundle=async contents=>(await build({bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env.VITE_API_URL':'"http://concrete-owner.test"','import.meta.env':'{}','process.env.NODE_ENV':'"production"'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents}})).outputFiles[0].text;
  ownerScript=await bundle("import React from'react';import{createRoot}from'react-dom/client';import PriceBook from'./client/src/pricebook.jsx';createRoot(document.getElementById('root')).render(<PriceBook/>);");
  customerScript=await bundle("import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CustomerMeasurements}from'./client/src/quoteDoneControls.jsx';function Form({fields,inputs}){const[v,set]=useState(inputs);return <><CustomerMeasurements fields={fields} value={v} onChange={set}/><output>{JSON.stringify(v)}</output></>;}window.mount=props=>createRoot(document.getElementById('root')).render(<Form {...props}/>);");
});
after(async()=>browser?.close());
function seed(f){const owner='concrete-landscape-browser-'+randomUUID(),service=structuredClone(f.ownerPricing);delete service.origin;
  const draft=bridge.convertApplicationBook({services:[service],defaults:f.businessDefaults},'toDollars');bridge.saveApplicationBook(owner,{...draft,revision:bridge.readApplicationBook(owner).revision},date);return owner;}
async function ownerPage(t,owner,type){
  const page=await browser.newPage();t.after(()=>page.close());const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const r=route.request(),u=new URL(r.url());assert.equal(u.origin,'http://concrete-owner.test');
    if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+ownerScript.replaceAll('</script','<\\/script')+'</script>'});
    const body=r.postData()?JSON.parse(r.postData()):undefined;let payload,status=200;
    try{if(u.pathname==='/api/dashboard')payload={ownerId:owner,operator:{simulated:true,enabled:false}};else if(u.pathname==='/api/onboarding/state')payload={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:[type]}};else if(u.pathname==='/api/pricebook/meta')payload=bridge.applicationMetadata();else if(u.pathname==='/api/pricebook/'+owner)payload=bridge.readApplicationBook(owner);else if(u.pathname==='/api/pricebook/validate')payload=bridge.validateApplicationDraft(owner,body,date);else if(u.pathname==='/api/pricebook/save')payload=bridge.saveApplicationBook(owner,body,date);else if(u.pathname==='/api/pricebook/preview')payload=bridge.previewApplicationQuote(owner,body,date);else throw Error('Unexpected endpoint '+u.pathname);}catch(e){status=e.statusCode||400;payload={error:e.message,details:e.details};}
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
  });await page.goto('http://concrete-owner.test');await page.getByRole('heading',{name:'Price book',exact:true}).waitFor();return{page,errors};
}
async function save(page){const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST'),page.getByRole('button',{name:'Save & validate',exact:true}).click()]);assert.equal(response.ok(),true,await response.text());}
async function customerPage(t,f){const page=await browser.newPage();t.after(()=>page.close());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:customerScript});await page.evaluate(props=>window.mount(props),{fields:bridge.applicationServiceDefinition(f.ownerPricing).customerFields,inputs:f.customerInputs});return page;}
const output=async page=>JSON.parse(await page.locator('output').textContent());

test('concrete browser owner saves dollar rates and unscaled depths, warns about spacing and reloads',async t=>{
  // Expected before execution:40->4000c;1500->150000c;1.50->150c;
  // threshold5/depth4/compaction.2 remain physical values. Warning15>10ft.
  const f=concreteFixture(),owner=seed(f),{page,errors}=await ownerPage(t,owner,f.serviceType);
  await page.getByRole('button',{name:/Optional prices and add-on charges/}).click();
  for(const [field,value] of [['shortLoadThresholdCubicYards','5'],['shortLoadPerYard','40'],['controlJointSpacingFt','15'],['sawCutPerLF','1.50'],['slabLaborMinThicknessInches','4'],['slabLaborMaxThicknessInches','6'],['baseDepthInches','4'],['baseCompactionAllowance','0.2'],['baseGravelPerCubicYard','45'],['baseExcavationGradingPerSqft','1.20']])await page.locator('#field-'+field+' input').fill(value);
  await page.locator('#field-controlJointPricing select').selectOption('excluded');await page.getByLabel('Placement flat charge ($ per pour) Pump',{exact:true}).fill('1500');await page.locator('#field-uncertainPlacementMethod select').selectOption('pump');
  await save(page);const p=loadPricebook(owner).services[0].pricing;assert.equal(p.shortLoadPerYard,4000);assert.equal(p.placementFlat.pump,150000);assert.equal(p.sawCutPerLF,150);assert.equal(p.baseDepthInches,4);assert.equal(p.baseCompactionAllowance,.2);assert.deepEqual(errors,[]);
  await page.reload();await page.getByRole('button',{name:/Optional prices and add-on charges/}).click();assert.equal(await page.locator('#field-shortLoadPerYard input').inputValue(),'40');
  // Reloaded prices render before the asynchronous validation response.
  await page.getByText(/Control-joint spacing of 15 feet exceeds the configured spacing limit of 10 feet/).waitFor();
  assert.match(await page.locator('body').innerText(),/15 feet.*10 feet/);
});
test('planting browser edits owner size names and per-plant prices and persists both',async t=>{
  //Expected before execution:edit#5 to#7 with container7; labor$50=>5000c.
  const f=customPlantFixture(),owner=seed(f),{page,errors}=await ownerPage(t,owner,f.serviceType);
  await page.getByRole('button',{name:/Optional prices and add-on charges/}).click();
  await page.getByLabel('Customer size name 1',{exact:true}).fill('#7 shrub, container');await page.getByLabel('Container number 1',{exact:true}).fill('7');
  await page.locator('#field-plantingLaborPerPlant input').first().fill('50');await save(page);
  const p=loadPricebook(owner).services[0].pricing;assert.equal(p.plantSizes.shrub_5.name,'#7 shrub, container');assert.equal(p.plantSizes.shrub_5.containerNumber,7);assert.equal(p.plantingLaborPerPlant.shrub_5,5000);assert.deepEqual(errors,[]);
});
test('customer browser answers Not sure for chute/topsoil and uses exact custom size names',async t=>{
  //Expected before execution:unknown chute retains187000c;
  //unknown topsoil2in produces18519c soil plus205000c sod=223519c.
  const c=concreteFixture(),cp=await customerPage(t,c);await cp.getByLabel('Can the concrete truck get its chute to the pour?',{exact:true}).selectOption('unknown');const ci=await output(cp);assert.equal(ci.chuteAccess,'unknown');assert.equal(generateQuoteVNext({...c,customerInputs:ci}).midEstimate,1870);
  const s=sodFixture();Object.assign(s.ownerPricing.pricing,{topsoilPerCubicYard:3000,topsoilTargetDepthInches:4,topsoilTypicalImportDepthInches:2});const sp=await customerPage(t,s);await sp.getByLabel('Not sure — About how many inches of usable topsoil are already there?',{exact:true}).check();const si=await output(sp);assert.equal(si.usableTopsoilDepthInches,'unknown');assert.equal(generateQuoteVNext({...s,customerInputs:si}).midEstimate,2235.19);
  const f=customPlantFixture(),pp=await customerPage(t,f);await pp.getByLabel('Measured plant count by size #5 shrub, container',{exact:true}).fill('4');assert.equal(await pp.getByText('2 in. caliper tree, balled and burlapped',{exact:true}).count(),1);assert.equal(generateQuoteVNext({...f,customerInputs:await output(pp)}).midEstimate,300);
});
