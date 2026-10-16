import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {fenceFixture,fourTypes} from './fenceLaneB20261016Fixture.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
let browser,script;
before(async()=>{
 browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
 const result=await build({bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
 import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
 import {FenceOfferingEditor} from './client/src/FenceOfferingEditor.jsx';import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
 function Form({service,fields,inputs,owner}){const [value,setValue]=useState(owner?service:inputs);return <>{owner?<FenceOfferingEditor service={value} onChange={setValue}/>:<CustomerMeasurements fields={fields} value={value} onChange={setValue} knownOfferings={service.knownOfferings}/>}<output>{JSON.stringify(value)}</output></>;}
 window.mount=(props)=>createRoot(document.getElementById('root')).render(<Form {...props}/>);`}});script=result.outputFiles[0].text;
});
after(async()=>{await browser?.close();});
async function pageFor(t,f,owner=false){const page=await browser.newPage();t.after(()=>page.close());await page.setContent('<div id="root"></div>');await page.addScriptTag({content:script});
 const inputs=structuredClone(f.customerInputs);if(!owner)for(const k of ['linearFeet','lfMethod','gates','cornerCount','fenceRuns','fenceRunCount'])delete inputs[k];
 await page.evaluate(props=>window.mount(props),{service:f.ownerPricing,fields:applicationServiceDefinition(f.ownerPricing).customerFields,inputs,owner});return page;}
const output=async page=>JSON.parse(await page.locator('output').textContent());
test('Oct16 Chromium: two separate 9 ft runs enter the verbatim questions and quote 6 posts / 75600 cents',async t=>{
 // 18*$10 + 18*1.1*$20 + 6*($20+$4+$6) = $756.00.
 const f=fenceFixture(),page=await pageFor(t,f);await page.getByLabel('How many separate fence runs?',{exact:true}).fill('2');
 for(let i=1;i<=2;i++){await page.getByLabel('Does this run connect back to where it starts? — run '+i,{exact:true}).selectOption('false');await page.getByLabel('Length of each straight section, in feet, between ends, corners and gates — run '+i+', section 1',{exact:true}).fill('9');}
 const c=await output(page);assert.equal(c.fenceRunCount,2);assert.deepEqual(c.fenceRuns,[{closed:false,sections:[{lengthLF:9}]},{closed:false,sections:[{lengthLF:9}]}]);
 assert.equal(await page.getByLabel('Fence corners',{exact:true}).count(),0);assert.equal(c.cornerCount,undefined);assert.equal(c.linearFeet,undefined);
 const q=generateQuoteVNext({...f,customerInputs:c});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,75600);
 // Reducing the number cannot erase a previously measured run. Removing the
 // chosen run explicitly leaves 9 LF and 3 posts: 9000+19800+9000=37800 cents.
 await page.getByLabel('How many separate fence runs?',{exact:true}).fill('1');let edited=await output(page);
 assert.equal(edited.fenceRuns.length,2);assert.equal(generateQuoteVNext({...f,customerInputs:edited}).resultType,'ESTIMATE_REQUIRES_REVIEW');
 await page.getByRole('button',{name:'Remove run 2',exact:true}).click();edited=await output(page);assert.equal(edited.fenceRuns.length,1);assert.equal(edited.fenceRunCount,1);
 assert.equal(generateQuoteVNext({...f,customerInputs:edited}).options[0].calculationRecord.scenarios.mid.finalTotalCents,37800);
});
test('Oct16 Chromium: one gate between 7 and 9 ft sections quotes 5 posts / 91200 cents; total-only fallback asks runs',async t=>{
 const f=fenceFixture(),page=await pageFor(t,f);await page.getByLabel('How many separate fence runs?',{exact:true}).fill('1');await page.getByLabel('Does this run connect back to where it starts? — run 1',{exact:true}).selectOption('false');
 await page.getByLabel('Length of each straight section, in feet, between ends, corners and gates — run 1, section 1',{exact:true}).fill('7');await page.getByRole('button',{name:'Add straight section',exact:true}).click();
 await page.getByLabel('Length of each straight section, in feet, between ends, corners and gates — run 1, section 2',{exact:true}).fill('9');await page.getByLabel('Gate after run 1, section 1',{exact:true}).selectOption('walk');
 const c=await output(page),q=generateQuoteVNext({...f,customerInputs:c});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,91200);
 // Opening a loop cannot erase its closing gate; removing a section cannot
 // erase a gate on the section that remains. Both conflicts require review.
 const closure=page.getByLabel('Does this run connect back to where it starts? — run 1',{exact:true});
 await closure.selectOption('true');await page.getByLabel('Gate after run 1, section 2',{exact:true}).selectOption('walk');await closure.selectOption('false');
 let edited=await output(page);assert.equal(edited.fenceRuns[0].sections[1].gateAfter,'walk');assert.equal(generateQuoteVNext({...f,customerInputs:edited}).resultType,'ESTIMATE_REQUIRES_REVIEW');
 await page.getByLabel('Gate after run 1, section 2',{exact:true}).selectOption('');
 await page.getByRole('button',{name:'Remove section 2',exact:true}).click();edited=await output(page);assert.equal(edited.fenceRuns[0].sections[0].gateAfter,'walk');assert.equal(generateQuoteVNext({...f,customerInputs:edited}).resultType,'ESTIMATE_REQUIRES_REVIEW');
 await page.getByRole('button',{name:'Add straight section',exact:true}).click();await page.getByLabel('Length of each straight section, in feet, between ends, corners and gates — run 1, section 2',{exact:true}).fill('9');
 assert.equal(generateQuoteVNext({...f,customerInputs:await output(page)}).options[0].calculationRecord.scenarios.mid.finalTotalCents,91200);
 await page.getByRole('button',{name:'I only know the total length',exact:true}).click();assert.equal((await output(page)).fenceRuns,undefined);assert.equal(await page.getByLabel('Fence corners',{exact:true}).count(),1);assert.equal(await page.getByLabel('How many separate fence runs?',{exact:true}).count(),1);
});
test('Oct16 Chromium: four fence offerings retain twelve tiers; editing aluminum eight changes only its row spacing',async t=>{
 const f=fourTypes(),page=await pageFor(t,f,true);assert.equal(await page.locator('[data-fence-type]').count(),4);assert.equal(await page.getByRole('button',{name:'Add price option',exact:true}).count(),4);
 for(const button of await page.getByRole('button',{name:'Add price option',exact:true}).all())assert.equal(await button.isDisabled(),true);
 await page.locator('[data-fence-type="aluminum"] [data-height-row="eight"]').getByLabel('Post spacing (ft) — aluminum eight',{exact:true}).fill('6');
 const service=await output(page);assert.equal(service.pricing.fenceOfferings.aluminum.heightRows.eight.postSpacingLF,6);assert.equal(service.pricing.fenceOfferings.wood.heightRows.eight.postSpacingLF,4);assert.equal(Object.values(service.pricing.fenceOfferings).reduce((n,o)=>n+o.tiers.length,0),12);
 assert.doesNotMatch(await page.locator('body').innerText(),/in proportion to height|scale by the requested height/);
});
test('Oct16 Chromium: existing saved offering displays one exact-height row and the add-other-heights notice without mutating its prices',async t=>{
 const f=offeringFixture('FENCING_INSTALL','installed'),page=await pageFor(t,f,true);assert.deepEqual(await output(page),f.ownerPricing);assert.match(await page.locator('body').innerText(),/Only the saved fence height is priced/);assert.equal(await page.locator('[data-height-row="saved_height"]').count(),1);
 // Existing saved 6 ft: 100 LF*$40 + 2*$250 = 450000 cents. 8 ft has no row.
 assert.equal(generateQuoteVNext(f).options[0].calculationRecord.scenarios.mid.finalTotalCents,450000);f.customerInputs.fenceHeight=8;assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});
