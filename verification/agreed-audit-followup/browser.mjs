import fs from 'node:fs';import assert from 'node:assert/strict';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PRICEBOOK_BROWSER_MODULE?pathToFileURL(path.join(process.env.PRICEBOOK_BROWSER_MODULE,'index.mjs')).href:'playwright');
import {siding} from '../../verification/engine-independent/fixtures.mjs';
import {applicationMetadata,convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),f=siding();
const output=path.resolve(process.argv[2]||'verification-output/agreed-followup-browser');fs.mkdirSync(output,{recursive:true});
const book={...convertApplicationBook({ownerId:'synthetic-owner',services:[{...f.ownerPricing,service:'[SYNTHETIC] Siding',tiers:[],validationInputs:{}}],defaults:f.businessDefaults},'toDollars'),revision:'synthetic-revision'};
const meta=applicationMetadata();
const built=await build({absWorkingDir:root,stdin:{contents:"import React from 'react';import {createRoot} from 'react-dom/client';import PriceBook from './client/src/pricebook.jsx';createRoot(document.getElementById('root')).render(<PriceBook/>);",resolveDir:root,loader:'jsx'},bundle:true,write:false,format:'iife',platform:'browser',define:{'import.meta.env.VITE_API_URL':JSON.stringify('https://audit.test'),'process.env.NODE_ENV':JSON.stringify('development')}});
const browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
const context=await browser.newContext(),page=await context.newPage(),errors=[],results={};page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let body={};if(req.isNavigationRequest())return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+built.outputFiles[0].text+'</script>'});
 if(path==='/api/dashboard')body={ownerId:book.ownerId,operator:{enabled:false}};
 else if(path==='/api/onboarding/state')body={account:{plan:'QuoteDone'},profile:{businessTypes:['SIDING_REPLACEMENT'],country:'CA',region:'NS'}};
 else if(path==='/api/pricebook/meta')body=meta;
 else if(path==='/api/pricebook/'+book.ownerId)body=book;
 else if(path==='/api/pricebook/validate')body={statuses:book.services.map(s=>({serviceId:s.id,status:'NEEDS PRICING',missingOwnerFields:[],missingOwnerLabels:[],confirmationFields:[],legacySettings:[]})),validationErrors:[]};
 else if(path==='/api/quotedone/access')body={publicKey:null,allowedOrigins:[]};
 else if(path==='/api/pricebook/preview')body={resultType:'ESTIMATE_REQUIRES_REVIEW',reviewReason:'[SYNTHETIC] UI-only transport'};
 else throw Error('Unexpected route '+path);
 await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
});
try{
 await page.goto('https://audit.test');const input=page.locator('#field-laborPerSqft input[aria-label$="vinyl"]');await input.waitFor();
 await input.fill('2.555');assert.equal(await input.getAttribute('aria-invalid'),'true');const message=await page.locator('#field-laborPerSqft').getByRole('alert').textContent();assert.match(message,/whole.cent/i);assert.equal(await input.inputValue(),'2.555');
 results.invalid={raw:await input.inputValue(),message};await page.screenshot({path:path.join(output,'siding-invalid-rate.png'),fullPage:true});
 await input.fill('2.55');assert.equal(await input.getAttribute('aria-invalid'),'false');assert.equal(await page.locator('#field-laborPerSqft').getByRole('alert').count(),0);results.corrected=await input.inputValue();assert.deepEqual(errors,[]);results.passed=true;
}catch(e){results.error=e.stack;process.exitCode=1;}
finally{results.pageErrors=errors;fs.writeFileSync(path.join(output,'browser.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));await browser.close();}
