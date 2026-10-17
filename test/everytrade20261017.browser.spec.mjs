import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {httpFixture} from './leadCaptureRepair20261006HttpFixture.mjs';
// Expected before execution: actual labor400/material300 and approved change200
// persist after reload, original invoice1050 from final1250, margin44%, one job.
test('compiled owner job costs, changes, reload, report coverage and staff privacy',{timeout:90000},async t=>{
 const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
 const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});t.after(()=>browser.close());
 const f=await httpFixture(t),id='synthetic-everytrade-browser-job',owner='synthetic-a',receipt=JSON.stringify({customerResult:{resultType:'INSTANT_ESTIMATE_READY',currency:'CAD',lowEstimate:900,midEstimate:1000,highEstimate:1100,priceDrivers:['[SYNTHETIC] Measured service'],disclaimer:'[SYNTHETIC] Original scope',priceUnit:'per job',taxTreatment:'No tax added.'}});
 f.db.prepare('INSERT INTO quotes(id,ownerId,serviceType,status,resultJson,finalInvoiceAmount,createdAt) VALUES(?,?,?,?,?,?,?)').run(id,owner,'CUSTOM','INVOICED',receipt,125000,'2026-10-17T00:00:00Z');
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(f.base+'/login');await page.evaluate(token=>localStorage.setItem('otc_token',token),f.tokens[owner]);
 await page.goto(f.base+'/quotes?record='+id);await page.getByText('Job costs and approved changes',{exact:true}).click();
 await page.getByLabel('Actual labor hours',{exact:true}).fill('8.5');await page.getByLabel('Actual labor cost (CAD)',{exact:true}).fill('400');await page.getByLabel('Actual material cost (CAD)',{exact:true}).fill('300');await page.getByRole('button',{name:'Add approved change',exact:true}).click();await page.getByLabel('Change 1 amount (CAD)',{exact:true}).fill('200');await page.getByLabel('Change 1 description',{exact:true}).fill('[SYNTHETIC] Added scope');
 await page.getByRole('button',{name:'Save job costs',exact:true}).click();await page.getByText('Job costs saved. Refresh Reports to see the updated figures.',{exact:true}).waitFor();
 await page.reload();await page.getByText('Job costs and approved changes',{exact:true}).click();await page.waitForFunction(()=>document.querySelector('[aria-label="Actual labor cost (CAD)"]')?.value==='400.00');assert.equal(await page.getByLabel('Change 1 description',{exact:true}).inputValue(),'[SYNTHETIC] Added scope');
 await page.goto(f.base+'/reports');await page.getByLabel('Period',{exact:true}).selectOption('all');await page.getByRole('button',{name:'Show report',exact:true}).click();const panel=page.getByRole('region',{name:'Quote accuracy and job costs',exact:true});await panel.getByText('44.00%',{exact:true}).waitFor();assert.match(await panel.innerText(),/1 of 1 jobs/);assert.match(await panel.innerText(),/100.00%/);
 assert.equal(f.db.prepare('SELECT resultJson FROM quotes WHERE ownerId=? AND id=?').get(owner,id).resultJson,receipt);
 await page.evaluate(token=>{localStorage.setItem('otc_token',token);window.dispatchEvent(new Event('otc:session'));},f.tokens['synthetic-staff']);await page.goto(f.base+'/quotes?record='+id);await page.getByRole('heading',{name:'CUSTOM',exact:true}).waitFor();assert.equal(await page.getByText('Job costs and approved changes',{exact:true}).count(),0);assert.doesNotMatch(await page.locator('main').innerText(),/Added scope|Actual labor cost/);assert.deepEqual(errors,[]);
});
