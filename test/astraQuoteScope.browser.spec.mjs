import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let browser,bundle;
before(async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
 const result=await build({absWorkingDir:root,stdin:{loader:'jsx',resolveDir:root,contents:
  "import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CustomerMeasurements}from'./client/src/quoteDoneControls.jsx';import{QuoteWizard}from'./client/src/quoteWizard.jsx';function Form({service,initial,wizard}){const[v,setV]=useState({inputs:initial,serviceId:'synthetic',fees:{},contact:{},location:{},context:'',unknowns:''});return <>{wizard?<QuoteWizard pricingOnly services={[{id:'synthetic',name:'[SYNTHETIC] Flooring'}]} service={service} values={v} change={(k,value)=>setV(old=>({...old,[k]:value}))} onServiceChange={()=>{}} onSubmit={()=>{}} sending={false}/>:<CustomerMeasurements fields={service.customerFields} value={v.inputs} onChange={inputs=>setV({...v,inputs})} knownOfferings={service.knownOfferings}/>}<output>{JSON.stringify(v.inputs)}</output></>}const root=createRoot(document.getElementById('root'));let key=0;window.mount=(service,initial,wizard)=>root.render(<Form key={++key} service={service} initial={initial} wizard={wizard}/>);"},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':JSON.stringify('development')}});
 bundle=result.outputFiles[0].text;
});
after(async()=>{await browser?.close();});
const fixture=()=>structuredClone(measuredScopeCases().find(x=>x.id==='floor-hardwood-installed').input);
async function withForm(f,wizard,run){
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{await page.route('http://astra-quote-scope.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'}));await page.goto('http://astra-quote-scope.test/');const service={...applicationServiceDefinition(f.ownerPricing),knownOfferings:f.ownerPricing.knownOfferings};await page.evaluate(({service,initial,wizard})=>window.mount(service,initial,wizard),{service,initial:f.customerInputs,wizard});await page.locator('output').waitFor();await run(page,async()=>JSON.parse(await page.locator('output').textContent()));assert.deepEqual(errors,[]);}finally{await page.close();}
}
for(const wizard of [false,true])test('Astra 2 browser: tier-only confirmation can be answered in '+(wizard?'customer wizard':'measurement form'),async()=>{
 const f=fixture(),p=f.ownerPricing.pricing;f.ownerPricing.tiers=[{name:'Best',overrides:{scopeDetails:p.scopeDetails,scopeRates:p.scopeRates}}];delete p.scopeDetails;delete p.scopeRates;delete f.customerInputs.underlaymentScopeConfirmed;
 await withForm(f,wizard,async(page,answer)=>{
  if(wizard)for(let i=0;i<25&&await page.getByLabel(/Confirm hardwood underlayment/).count()===0;i++)await page.getByRole('button',{name:'Continue',exact:true}).click();
  const confirmation=page.getByLabel(/Confirm hardwood underlayment/);assert.equal(await confirmation.count(),1);await confirmation.selectOption('true');const inputs=await answer();assert.equal(inputs.underlaymentScopeConfirmed,true);const q=generateQuoteVNext({...f,customerInputs:inputs});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,196000);
 });
});
test('Astra 4 browser: product change shows its own confirmation and clears the old Yes',async()=>{
 const f=fixture(),p=f.ownerPricing.pricing;p.scopeDetails.floor_underlayment_hardwood.description='[SYNTHETIC] Hardwood felt.';p.scopeDetails.floor_underlayment_vinyl_plank={description:'[SYNTHETIC] Vinyl plank foam.',mode:'installed_area_sell_price'};p.scopeRates.floor_underlayment_vinyl_plank=120;p.vinylPlankUnderlaymentRule='always_included';
 await withForm(f,false,async(page,answer)=>{
  const hardwood=page.getByLabel(/Confirm hardwood underlayment/);assert.equal(await hardwood.inputValue(),'true');assert.equal(await page.getByLabel(/Confirm vinyl plank underlayment/).count(),0);assert.doesNotMatch(await page.locator('body').innerText(),/Vinyl plank foam/);
  await page.getByLabel('New flooring type',{exact:true}).selectOption('vinyl_plank');const vinyl=page.getByLabel(/Confirm vinyl plank underlayment/);assert.equal(await vinyl.count(),1);assert.equal(await vinyl.inputValue(),'');assert.equal((await answer()).underlaymentScopeConfirmed,undefined);assert.equal(await page.getByLabel(/Confirm hardwood underlayment/).count(),0);await vinyl.selectOption('true');assert.equal((await answer()).underlaymentScopeConfirmed,true);
  await page.getByLabel('New flooring type',{exact:true}).selectOption('hardwood');assert.equal(await hardwood.inputValue(),'');assert.equal((await answer()).underlaymentScopeConfirmed,undefined);
 });
});
