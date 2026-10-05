import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {convertApplicationBook} from '../server/src/quoteDoneBridge.js';
import {validateInterviewConfiguration} from '../server/interviewConfiguration.js';
let browser,bundle;
before(async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
 const result=await build({absWorkingDir:process.cwd(),stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Question from './client/src/interviewConfiguration.jsx';function Editor({definition,pricing,initial}){const[value,setValue]=useState(initial);return <><Question definition={definition} pricing={pricing} value={value} onChange={setValue}/><output>{JSON.stringify(value)}</output></>}const root=createRoot(document.getElementById('root'));window.mount=props=>root.render(<Editor {...props}/>);"},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});bundle=result.outputFiles[0].text;
});
after(async()=>browser?.close());
async function pageFor(definition,pricing,initial,run){
 const page=await browser.newPage();try{await page.route('http://quote-config.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'}));await page.goto('http://quote-config.test/');await page.evaluate(props=>window.mount(props),{definition,pricing,initial});await page.locator('output').waitFor();await run(page,async()=>JSON.parse(await page.locator('output').textContent()));}finally{await page.close();}
}
test('interview owner can add separate demolition entries and explicitly choose up-to access',async()=>{
 await pageFor({serviceType:'CONCRETE_PATIO_SLAB',field:'scopeDetails'},{},{},async(page,value)=>{
  for(const reinforcement of ['rebar','none']){
   await page.getByRole('combobox',{name:'Add Additional priced scope',exact:true}).selectOption('demolition');await page.getByRole('button',{name:'Add entry',exact:true}).click();
   const row=page.locator('section.editor-section').last();
   await row.getByLabel('Included work and product specification',{exact:true}).fill('[SYNTHETIC] '+reinforcement+' demolition');
   await row.getByLabel('Pricing method',{exact:true}).selectOption('installed');await row.getByLabel('Installed price charge category',{exact:true}).selectOption('removal');
   await row.getByLabel('Maximum existing slab thickness included',{exact:true}).fill('6');await row.getByLabel('Existing reinforcement covered',{exact:true}).selectOption(reinforcement);
   await row.getByLabel('Demolition access covered',{exact:true}).selectOption('difficult');await row.getByLabel('Demolition access matching',{exact:true}).selectOption('up_to');
   await row.getByLabel('Demolition debris disposal included',{exact:true}).selectOption('true');
  }
  const captured=await value();assert.deepEqual(Object.keys(captured),['demolition','demolition__2']);assert.equal(captured.demolition__2.reinforcement,'none');validateInterviewConfiguration('CONCRETE_PATIO_SLAB','scopeDetails',captured);
 });
});
test('interview rate controls accept 3.5 cents per foot and reject fractional-cent gates',async()=>{
 const f=offeringFixture('FENCING_INSTALL','installed'),pricing=convertApplicationBook({services:[f.ownerPricing],defaults:{}},'toDollars').services[0].pricing;
 await pageFor({serviceType:f.serviceType,field:'offeringRates'},pricing,pricing.offeringRates,async(page,value)=>{
  const measured=page.getByLabel('Installed fence including standard posts and footings',{exact:true}),gate=page.getByLabel('Installed gate: walk',{exact:true});
  await measured.fill('0.035');await measured.blur();assert.equal((await value()).installedFencePerLF,.035);
  await gate.fill('450.005');await gate.blur();assert.equal(await gate.getAttribute('aria-invalid'),'true');
  await gate.fill('450.01');await gate.blur();assert.equal((await value()).gate_walk,450.01);validateInterviewConfiguration(f.serviceType,'offeringRates',await value(),pricing);
 });
});
