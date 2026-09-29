import {submitCustomerForm} from './customer-intake-browser-helpers.mjs';
import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {createRequire} from 'node:module';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {startApplication} from './application-harness.mjs';import {mowingFixture} from './repair-fixture.mjs';
const [root,evidence]=process.argv.slice(2).map(v=>path.resolve(v));
const app=await startApplication(root,evidence,{port:4491}),require=createRequire(path.join(root,'package.json'));
const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE),Database=require('better-sqlite3');
const checks=[],logs=[],children=[],wireHeaders=[],responses=[];let browser,proxy,database,dropNextResponse=false;
try {
 const cross='http://127.0.0.1:4492',same='http://127.0.0.1:4493';
 const f=await mowingFixture(app,'repair-browser',[cross,same]),{id,owner,call,read,approve,meta,url,submission}=f;
 database=new Database(path.join(evidence,'application.sqlite'));
 const rows=body=>database.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').all(owner.id,body.requestId);
 async function vite(port,api){const p=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:path.join(root,'client'),env:{...app.env,VITE_API_URL:api},windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(p);p.stdout.on('data',v=>logs.push(String(v)));p.stderr.on('data',v=>logs.push(String(v)));for(let i=0;i<1200;i++){if(p.exitCode!==null)throw Error('Vite exited: '+logs.join(''));try{if((await fetch('http://127.0.0.1:'+port)).ok)return;}catch{}await delay(100);}throw Error('Vite startup timeout');}
 await vite(4492,app.base);await vite(4494,''); // Explicit empty API URL means same origin.
 proxy=http.createServer((req,res)=>{
  const isApi=req.url.startsWith('/api/'),base=isApi?app.base:'http://127.0.0.1:4494';
  if(isApi)wireHeaders.push({method:req.method,url:req.url,headers:{origin:req.headers.origin,referer:req.headers.referer,fetchSite:req.headers['sec-fetch-site']}});
  const drop=dropNextResponse&&req.method==='POST'&&req.url===url; // Keep the outage active through Chromium's automatic transport retries.
  const upstream=http.request(base+req.url,{method:req.method,headers:{...req.headers,host:new URL(base).host}},reply=>{
   if(drop){reply.resume();reply.on('end',()=>res.destroy());}
   else {res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);}
  });upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
 });await new Promise(resolve=>proxy.listen(4493,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE});
 async function page(){const p=await browser.newPage({viewport:{width:1300,height:950}});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(120000);p.on('pageerror',e=>logs.push('PAGE ERROR '+e.stack));p.on('response',async r=>{if(r.url().includes('/api/public/quote/')){let result;try{result=await r.json();}catch{}responses.push({method:r.request().method(),status:r.status(),result});}});return p;}
 const cacheKey='quotedone-pending-'+f.access.publicKey;
 async function form(p,base=cross){await p.goto(base+'/quote/'+f.access.publicKey);await p.getByRole('combobox',{name:'Service',exact:true}).selectOption(id);for(const [key,value]of Object.entries(f.inputs)){const field=meta.services.find(s=>s.serviceType==='LANDSCAPING_MOWING').customerFields.find(field=>field.name===key);if(field.type==='number')await p.getByLabel(field.label,{exact:true}).fill(String(value));else await p.getByRole('combobox',{name:field.label,exact:true}).selectOption(String(value));}await p.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');await p.getByLabel('Name',{exact:true}).fill('[SYNTHETIC] Retry customer');await p.getByLabel('Project location',{exact:true}).fill('[SYNTHETIC] 123 Example Street');}
 async function send(p,name='Submit estimate request',expected=201){const r=await submitCustomerForm(p,url,{button:name});assert.equal(r.status(),expected);return {result:await r.json(),body:r.request().postDataJSON()};}
 async function seed(p,body,base=cross){await p.goto(base+'/quote/'+f.access.publicKey);await p.evaluate(({key,body})=>sessionStorage.setItem(key,JSON.stringify(body)),{key:cacheKey,body});await p.reload();await p.getByRole('button',{name:'Retry saved request',exact:true}).waitFor();}
 const p=await page();
 let book=await read();book.services[0].tiers=[{name:'Supported',overrides:{}},{name:'Needs price',overrides:{mowingBaseRatePerSqft:null}}];await call('POST','/api/pricebook/save',book);await approve();
 await form(p);let sent=await send(p);await p.getByRole('heading',{name:'Estimate',exact:true}).waitFor();assert.equal(sent.result.midEstimate,50);assert.equal(sent.result.options.length,1);await p.getByText(sent.result.optionAvailabilityNotice,{exact:true}).waitFor();await p.screenshot({path:path.join(evidence,'partial-options-disclosed.png'),fullPage:true});
 book=await read();book.services[0].tiers[1].overrides={mowingBaseRatePerSqft:.01};await call('POST','/api/pricebook/save',book);await approve();await form(p);sent=await send(p);await p.getByRole('heading',{name:'Estimate',exact:true}).waitFor();assert.deepEqual(sent.result.options.map(o=>o.midEstimate),[50,100]);assert.equal(sent.result.optionAvailabilityNotice,undefined);assert.ok(!(await p.locator('body').innerText()).includes('Fewer options'));
 book=await read();for(const tier of book.services[0].tiers)tier.overrides={mowingBaseRatePerSqft:null};await call('POST','/api/pricebook/save',book);await approve();await form(p);sent=await send(p);await p.getByText('Request saved for review',{exact:true}).waitFor();assert.equal(sent.result.midEstimate,undefined);
 book=await read();book.services[0].tiers=[];await call('POST','/api/pricebook/save',book);await approve();
 checks.push('Real browser partial options display the engine notice; all valid tiers show $50/$100 without notice; all review tiers release no estimate');
 await form(p);await p.getByLabel('Measurements or facts you do not know',{exact:true}).fill('The entered 10000 is a guess.');sent=await send(p);assert.equal(sent.result.resultType,'ESTIMATE_REQUIRES_REVIEW');await p.getByText('Request saved for review',{exact:true}).waitFor();assert.equal(rows(sent.body).length,1);assert.equal(JSON.parse(rows(sent.body)[0].originalSubmissionJson).explicitUnknowns,'The entered 10000 is a guess.');
 checks.push('Actual customer textarea unknown overrides apparently complete numeric answers; original request is stored for review');
 // Owner ruling: contact is required for every submission, including a complete
 // instant estimate. The server rejects before writes, and the browser restores
 // the form so contact can be added without losing project measurements.
 for(const review of [false,true]) {
  const q=await page();await form(q);await q.getByLabel('Email',{exact:true}).fill('not-an-email');
  if(review)await q.getByLabel('Measurements or facts you do not know',{exact:true}).fill('Please verify the measurements.');
  const rejected=await send(q,'Submit estimate request',422);assert.equal(rows(rejected.body).length,0);await q.getByLabel('Email',{exact:true}).waitFor();assert.equal(await q.getByLabel('Email',{exact:true}).inputValue(),'not-an-email');
  await q.reload();await q.getByLabel('Email',{exact:true}).waitFor();await q.getByLabel('Email',{exact:true}).fill('');await q.getByLabel('Phone',{exact:true}).fill('+1 (902) 555-0123');
  const fixed=await send(q);assert.notEqual(fixed.body.requestId,rejected.body.requestId);assert.equal(fixed.result.resultType,review?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY');assert.deepEqual(fixed.body.customerInputs,f.inputs);await q.close();
 }
 checks.push('Actual 422 for malformed contact: both quote and review forms retain measurements across reload; phone-only correction succeeds with a new ID');
 // Cached requests reproduce genuine server rejections, including old browser
 // caches created before the repair. No Playwright request/response substitution.
 for(const status of [400,409,413]) {
  const q=await page(),body=submission({location:'[SYNTHETIC] retained location',urgency:'[SYNTHETIC] retained urgency'});
  if(status===400)body.requestId='invalid-request-id';
  if(status===409){const prior={...body,location:'',urgency:''};const receipt=await call('POST',url,prior,201,null,f.headers);assert.equal(receipt.midEstimate,50);body.customerInputs.yardSqft=11000;}
  if(status===413)body.context='[SYNTHETIC] oversized details. '.repeat(40000);
  await seed(q,body);await send(q,'Retry saved request',status);
  await q.getByLabel('Service',{exact:true}).waitFor();assert.equal(await q.getByLabel('Project location',{exact:true}).inputValue(),body.location);assert.equal(await q.getByLabel('Urgency',{exact:true}).inputValue(),body.urgency);
  assert.equal(await q.getByLabel('Additional project details',{exact:true}).inputValue(),body.context||'');
  await q.reload();await q.getByLabel('Service',{exact:true}).waitFor();assert.equal(await q.getByLabel('Project location',{exact:true}).inputValue(),body.location);await q.getByLabel('Service',{exact:true}).locator('option[value="'+id+'"]').waitFor({state:'attached'});assert.equal(await q.getByLabel('Service',{exact:true}).inputValue(),id);
  await q.getByLabel('Additional project details',{exact:true}).fill('');const corrected=await send(q);assert.notEqual(corrected.body.requestId,body.requestId);assert.equal(corrected.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(corrected.result.midEstimate,undefined);assert.equal(corrected.body.location,body.location);assert.equal(corrected.body.urgency,body.urgency);assert.equal(rows(corrected.body).length,1);assert.deepEqual(JSON.parse(rows(corrected.body)[0].originalSubmissionJson),corrected.body);await q.getByText('Request saved for review',{exact:true}).waitFor();
  if(status===409){assert.equal(rows(body).length,1);assert.equal(JSON.parse(rows(body)[0].customerResponseJson).midEstimate,50);}else assert.equal(rows(body).length,0);
  await q.screenshot({path:path.join(evidence,'corrected-'+status+'.png'),fullPage:true});await q.close();
 }
 checks.push('Actual 400/409/413 restore all original form fields and survive reload; corrections use fresh UUIDs and retain untriaged text for review; conflicting old $50 receipt is immutable');
 const large=await page();await form(large);await large.getByLabel('Additional project details',{exact:true}).fill('x'.repeat(1048576));let posts=0;large.on('request',r=>{if(r.url().includes(url)&&r.method()==='POST')posts++;});await large.getByRole('button',{name:'Submit estimate request',exact:true}).click();await large.getByText('Your request is too large. Shorten the additional project details before submitting.',{exact:true}).waitFor();assert.equal(posts,0);assert.equal(await large.getByLabel('Service',{exact:true}).count(),1);await large.close();
 checks.push('New oversized request stays editable and is rejected locally before submission');
 const failed=await page();await form(failed);database.exec("CREATE TRIGGER repair_synthetic_failure BEFORE INSERT ON quoteSubmissions BEGIN SELECT RAISE(ABORT,'synthetic disk failure'); END");
 const attempt=await send(failed,'Submit estimate request',500);assert.equal(rows(attempt.body).length,0);await failed.getByRole('button',{name:'Retry saved request',exact:true}).waitFor();await failed.reload();await failed.getByRole('button',{name:'Retry saved request',exact:true}).waitFor();database.exec('DROP TRIGGER repair_synthetic_failure');
 const recovered=await send(failed,'Retry saved request');assert.deepEqual(recovered.body,attempt.body);assert.equal(recovered.result.midEstimate,50);assert.equal(rows(attempt.body).length,1);await failed.close();
 checks.push('Real SQLite abort: uncertain 500 retains exact payload and ID across reload; retry after fault removal commits exactly once');
 const samePage=await page();await form(samePage,same);sent=await send(samePage);assert.equal(sent.result.midEstimate,50);assert.ok(wireHeaders.some(r=>r.method==='GET'&&r.url===url&&r.headers.origin===undefined&&r.headers.fetchSite==='same-origin'));await samePage.screenshot({path:path.join(evidence,'same-origin-working.png'),fullPage:true});
 checks.push('Real same-origin proxy: browser catalog GET omits Origin and succeeds; POST quotes $50; explicit empty API URL is honored');
 await form(samePage,same);dropNextResponse=true;await samePage.getByRole('button',{name:'Submit estimate request',exact:true}).click();await samePage.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();await samePage.getByRole('button',{name:'Get estimate',exact:true}).click();await samePage.getByRole('button',{name:'Retry saved request',exact:true}).waitFor();await samePage.getByText('Failed to fetch',{exact:true}).waitFor();
 dropNextResponse=false;const lost=await samePage.evaluate(key=>JSON.parse(sessionStorage.getItem(key)),cacheKey);assert.equal(rows(lost).length,1);const lostReceipt=JSON.parse(rows(lost)[0].customerResponseJson);await samePage.reload();const retried=await send(samePage,'Retry saved request',200);assert.deepEqual(retried.body,lost);assert.deepEqual(retried.result,lostReceipt);assert.equal(rows(lost).length,1);
 checks.push('Real proxy drops a committed response: reload/retry recovers the identical stored outcome, no duplicate quote');
 const taxPage=await page();await taxPage.goto(cross);await taxPage.getByRole('button',{name:'Sign in',exact:true}).first().click();await taxPage.getByLabel('Email',{exact:true}).fill(owner.email);await taxPage.getByLabel('Password',{exact:true}).fill(owner.password);await taxPage.locator('button[type=submit]').click();await taxPage.waitForFunction(()=>!!localStorage.getItem('otc_token'));await taxPage.goto(cross+'/onboarding?step=3');
 await taxPage.getByLabel('Country',{exact:false}).selectOption('US');await taxPage.getByLabel('State code',{exact:true}).fill('NY');await taxPage.getByLabel('I charge sales tax on the entire job.',{exact:true}).check();
 const taxBefore=await read(),taxResults=[];
 for(const [raw,status] of [['1.0000000000000001',400],['7.5',200]]) {
  await taxPage.getByLabel('Sales tax rate (%)',{exact:true}).fill(raw);const response=taxPage.waitForResponse(r=>r.url().endsWith('/api/business/jurisdiction')&&r.request().method()==='POST');await taxPage.getByRole('button',{name:'Continue',exact:true}).click();const wire=await response;assert.equal(wire.status(),status);assert.equal(wire.request().postDataJSON().taxPercent,raw);taxResults.push({request:wire.request().postDataJSON(),status,result:await wire.json()});
  if(status===400){assert.deepEqual(await read(),taxBefore);assert.equal(await taxPage.getByLabel('Sales tax rate (%)',{exact:true}).inputValue(),raw);}else assert.equal((await read()).defaults.taxPercent,7.5);
 }
 fs.writeFileSync(path.join(evidence,'tax-browser.json'),JSON.stringify(taxResults,null,2));
 checks.push('Real owner tax UI retains raw decimal text; lossy tax value rejects without write, editable correction to 7.5 saves exactly');
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks,transport:'Actual HTTP, SQLite and Chromium; only fault injection is a SQLite abort and a dropped real upstream response'},null,2));console.log(JSON.stringify({passed:true,checks},null,2));
}catch(error){if(browser)for(const [i,p] of browser.contexts().flatMap(c=>c.pages()).entries()){fs.writeFileSync(path.join(evidence,'failure-'+i+'.txt'),await p.locator('body').innerText().catch(()=>''));await p.screenshot({path:path.join(evidence,'failure-'+i+'.png'),fullPage:true}).catch(()=>{});}throw error;}
finally {if(browser)await browser.close();if(proxy)await new Promise(r=>proxy.close(r));for(const p of children)if(p.exitCode===null){const closed=new Promise(r=>p.once('close',r));p.kill();await closed;}if(database)database.close();await app.stop();fs.writeFileSync(path.join(evidence,'browser-responses.json'),JSON.stringify(responses,null,2));fs.writeFileSync(path.join(evidence,'proxy-headers.json'),JSON.stringify(wireHeaders,null,2));fs.writeFileSync(path.join(evidence,'browser.log'),logs.join('\n'));}
