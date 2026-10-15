import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import express from 'express';
import {gates,webQuote,publicCopy,quoteEmailFixture,phone} from './quoteDeliveryBatch20261015Fixture.mjs';
import {mowing} from '../verification/engine-independent/fixtures.mjs';
import {installQuoteEmailRoutes} from '../server/src/quoteEmailRoutes.js';

let browser,script;
before(async()=>{
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  const bundle=await build({bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {QuoteResult} from './client/src/quotedone.jsx';import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
function Form({fields,inputs,result}){const [value,setValue]=useState(inputs);return <><CustomerMeasurements fields={fields} value={value} onChange={setValue}/><output>{JSON.stringify(value)}</output><QuoteResult result={result}/></>;}
window.mount=(props)=>createRoot(document.getElementById('root')).render(<Form {...props}/>);`}});
  script=bundle.outputFiles[0].text;
});
after(async()=>{await browser?.close();});
test('QE-004/015 Chromium: full multi-gate widget choices, phone quote, saved scope, and owner copy agree',async t=>{
  const f=gates(2000,3,'界'),web=webQuote(f),h=quoteEmailFixture(t),p=await phone(h,f);
  assert.equal(web.result.midEstimate,4750);assert.equal(p.result.midEstimate,4750);
  const page=await browser.newPage();t.after(()=>page.close());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:script});
  await page.evaluate(props=>window.mount(props),{fields:web.definition.customerFields,inputs:f.customerInputs,result:web.result});
  await page.getByLabel('Gate count walk_3',{exact:true}).waitFor();
  for(const gate of Object.values(f.ownerPricing.pricing.offeringDetails.gates)){
    assert.ok((await page.locator('body').innerText()).includes(gate.description));assert.ok(p.result.quoteNarration.includes(gate.description));
  }
  await page.getByLabel('Gate count walk_2',{exact:true}).fill('2');
  await page.waitForFunction(()=>JSON.parse(document.querySelector('output').textContent).gates.walk_2===2);
  assert.equal(JSON.parse(await page.locator('output').textContent()).gates.walk_1,1);
  web.email.enqueueSavedQuote({ownerId:web.owner,quoteId:web.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  const {copy}=publicCopy(web.email,web.rows()[0]);for(const gate of Object.values(f.ownerPricing.pricing.offeringDetails.gates))assert.ok(copy.narration.includes(gate.description));
});
test('QE-005 Chromium: actual saved partial public page keeps measurement, unpriced work, and exact cents',async t=>{
  const f=mowing();f.ownerPricing.pricing.mowingBaseRatePerSqft=2.0098;
  const work='[SYNTHETIC] Unpriced stump <roots> & removal',h=webQuote(f,[work]);assert.equal(h.result.pricedEstimate.midEstimate,100.49);
  h.email.enqueueSavedQuote({ownerId:h.owner,quoteId:h.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  const {token}=publicCopy(h.email,h.rows()[0]),app=express();installQuoteEmailRoutes(app,{service:h.email});
  const server=app.listen(0,'127.0.0.1');t.after(()=>new Promise(resolve=>server.close(resolve)));await new Promise(resolve=>server.once('listening',resolve));
  const page=await browser.newPage();t.after(()=>page.close());await page.goto(`http://127.0.0.1:${server.address().port}/quote-copy/${h.owner}/${token}`);
  const text=await page.locator('body').innerText();assert.ok(text.includes(work));assert.match(text,/5000 square feet/);assert.match(text,/\$100\.49 CAD per visit/);assert.match(text,/total for all requested work is not available/i);
  assert.equal(await page.locator('script').count(),0);
});
