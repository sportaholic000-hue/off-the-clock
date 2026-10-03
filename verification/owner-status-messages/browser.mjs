// Actual built editor and authenticated/public HTTP workflows; synthetic local data only.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import Database from 'better-sqlite3';
import {startApplication} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {offeringFixture} from '../../test/configuredOfferingsFixtures.mjs';

const root=process.cwd(),out=path.resolve(process.argv[2]),pub=path.join(out,'public'),base='http://127.0.0.1:5310';
fs.mkdirSync(pub,{recursive:true});
const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE);
const checks=[],errors=[],wire=[];
const safe=value=>JSON.parse(JSON.stringify(value,(k,v)=>['password','passwordHash','token','bookingToken','bookingTokenReceipt','bookingTokenHash'].includes(k)?'[SYNTHETIC SECRET OMITTED]':v));
const save=(name,value)=>fs.writeFileSync(path.join(pub,name),JSON.stringify(safe(value),null,2));
let app,db,browser,page,proxy;
async function check(name,fn){try{await fn();checks.push({name,passed:true});}catch(e){checks.push({name,passed:false,error:e.stack});}finally{if(page&&!page.isClosed()){await page.screenshot({path:path.join(pub,name+'.png')});save(name+'-screen.json',{text:await page.locator('body').innerText()});}console.log('OWNER_STATUS_BROWSER_CHECK '+JSON.stringify(checks.at(-1)));}}
async function setup(label,input){
 const owner=await app.owner(label),call=async(method,url,body,status=200)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,status,JSON.stringify(r));return r.result;};
 const converted=convertApplicationBook({services:[input.ownerPricing],defaults:input.businessDefaults},'toDollars'),service=converted.services[0];
 for(const key of ['origin','confirmedFields','approvedValues'])delete service[key];service.id=crypto.randomUUID();service.service='[SYNTHETIC] '+label;service.validationInputs=input.customerInputs;
 let book=await call('GET','/api/pricebook/'+owner.id);Object.assign(book,{services:[service],defaults:converted.defaults});await call('POST','/api/pricebook/save',book);
 await call('GET','/api/onboarding/state');db.prepare('UPDATE businessProfiles SET businessTypesJson=? WHERE ownerId=?').run(JSON.stringify([service.serviceType]),owner.id);
 const result={owner,service,input,call,read:()=>call('GET','/api/pricebook/'+owner.id)};await approve(result);return result;
}
async function approve(f){const book=await f.read(),validation=await f.call('POST','/api/pricebook/validate',book),status=validation.statuses.find(s=>s.serviceId===f.service.id);return f.call('POST','/api/pricebook/services/'+f.service.id+'/approve',{revision:book.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});}
async function open(f){await page.goto(base+'/login');await page.evaluate(token=>{localStorage.setItem('otc_token',token);sessionStorage.clear();},f.owner.token);await page.goto(base+'/pricebook');await page.locator('.service-pick').filter({hasText:f.service.service}).click();}
async function section(name){const button=page.getByRole('button',{name:new RegExp('^'+name)}).first();if(await button.getAttribute('aria-expanded')==='false')await button.click();}
async function uiSave(){const response=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await response).status(),200);await page.waitForFunction(()=>!document.querySelector('fieldset[disabled]'));}
async function publicQuote(f){const access=await f.call('POST','/api/quotedone/access',{allowedOrigins:[base]});const r=await app.request('POST','/api/public/quote/'+access.publicKey,{requestId:crypto.randomUUID(),serviceId:f.service.id,customerInputs:f.input.customerInputs,contact:{email:'synthetic-followup@example.invalid'}},undefined,{Origin:base});assert.equal(r.status,201,JSON.stringify(r));return r.result;}
try{
 app=await startApplication(root,path.join(out,'private'),{port:5312,browserOrigins:[base]});db=new Database(path.join(out,'private/application.sqlite'));
 const dist=path.join(root,'client/dist');
 proxy=http.createServer(async(req,res)=>{try{
  if(req.url.startsWith('/api/')){const chunks=[];for await(const c of req)chunks.push(c);const b=Buffer.concat(chunks),headers={};for(const k of ['origin','content-type','authorization','cookie','referer','sec-fetch-site','idempotency-key'])if(req.headers[k])headers[k]=req.headers[k];const r=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&b.length?{body:b}:{})}),text=await r.text();wire.push({method:req.method,path:req.url,request:b.length?JSON.parse(b):null,status:r.status,response:JSON.parse(text||'null')});res.statusCode=r.status;r.headers.forEach((v,k)=>{if(!['content-length','content-encoding','connection','transfer-encoding'].includes(k))res.setHeader(k,v);});res.end(text);return;}
  const pathname=new URL(req.url,base).pathname,file=!path.extname(pathname)?path.join(dist,'index.html'):path.resolve(dist,'.'+pathname);if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));
 }catch(e){errors.push(e.message);res.writeHead(500).end('{}');}});await new Promise(r=>proxy.listen(5310,'127.0.0.1',r));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,args:['--no-sandbox']});page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));

 await check('B01-required-blocker-and-unpriced-conditions',async()=>{
  const input=offeringFixture('EXTERIOR_PAINTING','itemized');delete input.ownerPricing.pricing.offeringDetails.baselinePricesConfirmed;
  const f=await setup('owner-status-exterior',input),book=await f.read();
  const beforeStatus=(await f.call('POST','/api/pricebook/validate',book)).statuses[0];
  assert.equal(beforeStatus.status,'NEEDS PRICING');assert.equal(beforeStatus.validationErrors.length,1);assert.match(beforeStatus.validationErrors[0],/baseline/i);
  const before=await publicQuote(f);assert.equal(before.resultType,'ESTIMATE_REQUIRES_REVIEW');
  await open(f);await page.locator('.service-pick.active').filter({hasText:'NEEDS PRICING'}).waitFor();
  const coverage=page.getByRole('region',{name:'Surface condition pricing',exact:true});await coverage.waitFor();
  for(const name of ['Good','Poor']){const row=coverage.getByRole('listitem').filter({has:page.getByText(name,{exact:true})});assert.match(await row.innerText(),/Not yet priced. Requests for this condition go to review./);}
  assert.doesNotMatch(await page.locator('body').innerText(),/(good|poor) surface preparation (labor|materials) is required/i);
  const confirmation=page.getByLabel('I confirm these are baseline prices for one-story building',{exact:true});assert.equal(await confirmation.isChecked(),false);
  await coverage.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(pub,'B01-blocked.png')});save('B01-blocked-screen.json',{text:await page.locator('body').innerText()});
  await confirmation.check();await uiSave();await approve(f);await open(f);await page.locator('.service-pick.active').filter({hasText:'QUOTING LIVE'}).waitFor();await coverage.waitFor();
  assert.equal(await coverage.getByText('Not yet priced. Requests for this condition go to review.',{exact:true}).count(),2);
  const after={};for(const name of ['fair','good','poor']){f.input.customerInputs.surfaceCondition=name;after[name]=await publicQuote(f);assert.equal(after[name].resultType,name==='fair'?'INSTANT_ESTIMATE_READY':'ESTIMATE_REQUIRES_REVIEW');if(name==='fair')assert.equal(after[name].midEstimate,2475);else assert.equal(after[name].midEstimate,undefined);}
  const saved=await f.read();assert.deepEqual(saved.services[0].pricing.offeringRates,book.services[0].pricing.offeringRates);
  save('B01-evidence.json',{beforeStatus,before,after,saved});await coverage.scrollIntoViewIfNeeded();
 });
}catch(e){checks.push({name:'setup',passed:false,error:e.stack});}
finally{
 if(browser)await browser.close();if(proxy)await new Promise(r=>proxy.close(r));if(db)db.close();if(app){await app.stop();save('http.json',app.requests);fs.copyFileSync(path.join(out,'private/source-binding.json'),path.join(pub,'source-binding.json'));}
 save('browser-wire.json',wire);const result={scope:'Owner required-blocker messages and condition coverage: real built editor and authenticated/public HTTP',checks,errors,passed:checks.every(c=>c.passed)&&errors.length===0};save('result.json',result);console.log('OWNER_STATUS_BROWSER_RESULT '+JSON.stringify(result));if(!result.passed)process.exitCode=1;
}
