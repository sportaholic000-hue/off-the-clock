import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {fenceFixture} from './fenceLaneB20261016Fixture.mjs';
import {mowingFixture,cleanupFixture} from './landscapeLaneB20261016Fixture.mjs';
import {applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
let browser,script;
before(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
 const built=await build({bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import {FenceOfferingEditor} from './client/src/FenceOfferingEditor.jsx';import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';import {QuoteResult} from './client/src/quotedone.jsx';
 function Form({service,fields,inputs,mode,result}){const [value,setValue]=useState(mode==='owner'?service:inputs);return <>{mode==='owner'?<FenceOfferingEditor service={value} onChange={setValue}/>:mode==='quote'?<QuoteResult result={result}/>:<CustomerMeasurements fields={fields} value={value} onChange={setValue} knownOfferings={service.knownOfferings}/>}<output>{JSON.stringify(value)}</output></>;}
 window.mount=props=>createRoot(document.getElementById('root')).render(<Form {...props}/>);`}});script=built.outputFiles[0].text;
});
after(async()=>{await browser?.close();});
async function pageFor(t,f,mode='inputs',result){const page=await browser.newPage();t.after(()=>page.close());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:script});await page.evaluate(props=>window.mount(props),{service:f.ownerPricing,fields:applicationServiceDefinition(f.ownerPricing).customerFields,inputs:f.customerInputs,mode,result});return page;}
const output=async page=>JSON.parse(await page.locator('output').textContent());
test('Oct16 follow-up Chromium: lower fence bound uses whole feet and decimal inches; terminal/line unit labels are singular',async t=>{
 // Expected BEFORE execution: lower bound4ft6.25in =4+6.25/12 ft; row prices unchanged.
 const f=fenceFixture(),page=await pageFor(t,f,'owner');
 await page.getByLabel('Height over — wood six whole feet',{exact:true}).fill('4');await page.getByLabel('Height over — wood six inches',{exact:true}).fill('6.25');
 const saved=await output(page);assert.equal(saved.pricing.fenceOfferings.wood.heightRows.six.minimumHeight,4+6.25/12);
 assert.deepEqual(saved.pricing.fenceOfferings.wood.heightRows.six.offeringRates,f.ownerPricing.pricing.fenceOfferings.wood.heightRows.six.offeringRates);
 assert.equal(await page.getByLabel('Terminal post materials ($ per terminal post)',{exact:true}).count(),2);assert.equal(await page.getByLabel('Line post materials ($ per line post)',{exact:true}).count(),2);
 assert.doesNotMatch(await page.locator('body').innerText(),/\$ per terminal posts|\$ per line posts/);
});
test('Oct16 follow-up Chromium: actual widget result shows recurring5000 cents and first7500 cents separately',async t=>{
 // Expected BEFORE execution: recurring $50, first visit $75; actual QuoteResult component.
 const f=mowingFixture(),q=sanitizeForCustomerVNext(generateQuoteVNext(f)),page=await pageFor(t,f,'quote',q);
 assert.match(await page.locator('article').innerText(),/Recurring: \$50 per visit/);assert.equal(await page.locator('.quote-first-visit').innerText(),'First visit: $75');
 assert.doesNotMatch(await page.locator('article').innerText(),/\$75 per visit/);
});
test('Oct16 follow-up Chromium: cleanup optional exact questions accept a stated count or Not sure without guessing',async t=>{
 // Expected BEFORE execution:12bags*800=9600 ->10000 minimum; unknownbags+3loads ->36000 disposal.
 const f=cleanupFixture(),page=await pageFor(t,f);
 await page.getByLabel('About how many bags of yard waste?',{exact:true}).fill('12');let inputs=await output(page);assert.equal(inputs.wasteBags,12);
 let q=generateQuoteVNext({...f,customerInputs:inputs});assert.equal(q.lineItems.find(l=>l.name==='Debris disposal').amountCents,10000);
 await page.getByLabel('Not sure — About how many bags of yard waste?',{exact:true}).check();await page.getByLabel('About how many pickup-truck loads?',{exact:true}).fill('3');inputs=await output(page);assert.equal(inputs.wasteBags,'unknown');assert.equal(inputs.wasteLoads,3);
 q=generateQuoteVNext({...f,customerInputs:inputs});assert.equal(q.lineItems.find(l=>l.name==='Debris disposal').amountCents,36000);
 await page.getByLabel('Not sure — About how many pickup-truck loads?',{exact:true}).check();inputs=await output(page);assert.equal(inputs.wasteLoads,'unknown');q=generateQuoteVNext({...f,customerInputs:inputs});assert.equal(q.lineItems.find(l=>l.name==='Debris disposal').amountCents,60000);assert.match(q.disclaimer,/load count.*confirmed on site/i);
});
