import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';

test('QP-02 rendered owner measurements collect tier-only hardwood confirmation and preview $1960',async()=>{
 const f=structuredClone(measuredScopeCases().find(c=>c.id==='floor-hardwood-installed').input),p=f.ownerPricing.pricing;
 f.ownerPricing.tiers=[{name:'Best',overrides:{scopeDetails:p.scopeDetails,scopeRates:p.scopeRates}}];delete p.scopeDetails;delete p.scopeRates;delete f.ownerPricing.origin;
 const owner='synthetic-preview-'+randomUUID(),draft=bridge.convertApplicationBook({services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'USD',quoteTimeZone:'UTC'}},'toDollars');
 bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),...draft});
 bridge.approveApplicationService(owner,f.ownerPricing.id,{revision:bridge.readApplicationBook(owner).revision,confirmConfiguration:true,confirmLegacySettings:true});
 const book=bridge.readApplicationBook(owner),service=book.services[0],meta=bridge.applicationMetadata().services.find(m=>m.serviceType===f.serviceType);
 const inputs={...f.customerInputs};delete inputs.underlaymentScopeConfirmed;
 const bundle=await build({bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},loader:{'.js':'jsx'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';import {offeringPreviewFields} from './client/src/offeringEditor.jsx';
const service=${JSON.stringify(service)},meta=${JSON.stringify(meta)};
function Preview(){const [inputs,setInputs]=useState(${JSON.stringify(inputs)}),[result,setResult]=useState(null),[completed,setCompleted]=useState(0);return <><CustomerMeasurements fields={offeringPreviewFields(meta,service)} value={inputs} onChange={setInputs} knownOfferings={service.knownOfferings}/><button onClick={async()=>{setResult(await window.runPreview(inputs));setCompleted(n=>n+1);}}>Preview measured job</button><output data-completed={completed}>{JSON.stringify(result)}</output></>;}
createRoot(document.getElementById('root')).render(<Preview/>);`}});
 const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
 const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeFunction('runPreview',customerInputs=>bridge.previewApplicationQuote(owner,{revision:book.revision,serviceId:service.id,customerInputs}));
  await page.route('http://tier-preview.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'}));
  await page.goto('http://tier-preview.test/');
  const confirmation=page.getByRole('combobox',{name:/Confirm hardwood underlayment/});await confirmation.waitFor();
  await page.getByRole('button',{name:'Preview measured job'}).click();await page.waitForFunction(()=>document.querySelector('output').dataset.completed==='1');
  assert.equal(JSON.parse(await page.locator('output').innerText()).resultType,'ESTIMATE_REQUIRES_REVIEW');
  await confirmation.selectOption('true');await page.getByRole('button',{name:'Preview measured job'}).click();await page.waitForFunction(()=>document.querySelector('output').dataset.completed==='2');
  const result=JSON.parse(await page.locator('output').innerText());assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(result));assert.equal(result.midEstimate,1960);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
