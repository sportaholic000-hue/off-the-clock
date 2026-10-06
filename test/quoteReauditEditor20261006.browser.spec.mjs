import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {applicationMetadata,convertApplicationBook} from '../server/src/quoteDoneBridge.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
// Handwritten before execution: 100 LF × $40 = $4,000, unchanged by removing
// an unselected $250 gate. No tax, markup, fees or minimum adjustment.
let browser,bundle,book,fixture;
before(async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
 fixture=offeringFixture('FENCING_INSTALL','installed');fixture.customerInputs.gates={};
 book=convertApplicationBook({services:[fixture.ownerPricing],defaults:fixture.businessDefaults},'toDollars');
 const meta=applicationMetadata().services.find(row=>row.serviceType===fixture.serviceType);
 const result=await build({bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'},loader:{'.js':'jsx'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {OfferingEditor} from './client/src/offeringEditor.jsx';
const initial=${JSON.stringify(book.services[0])},meta=${JSON.stringify(meta)};
function App(){const [service,setService]=useState(initial);return <><OfferingEditor service={service} meta={meta} onChange={setService}/><output data-testid="draft">{JSON.stringify(service)}</output></>;}
createRoot(document.getElementById('root')).render(<App/>);
`}});bundle=result.outputFiles[0].text;
});
after(async()=>{await browser?.close();});
test('re-audit browser: Remove gate offering yields a coherent saveable draft and unchanged no-gate price',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.route('http://synthetic-gate-removal.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'}));
  await page.goto('http://synthetic-gate-removal.test/');
  await page.getByRole('button',{name:'Remove gate offering',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'Remove gate offering',exact:true}).count(),0);
  assert.equal(await page.getByText('Prices outside this selection',{exact:true}).count(),0);
  const draft=JSON.parse(await page.getByTestId('draft').textContent());
  assert.deepEqual(draft.pricing.offeringDetails.gates,{});assert.equal(draft.pricing.offeringRates.gate_walk,undefined);
  const cents=convertApplicationBook({...book,services:[draft]},'toCents'),q=generateQuoteVNext({...fixture,ownerPricing:cents.services[0]});
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(q));assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,400000);assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
