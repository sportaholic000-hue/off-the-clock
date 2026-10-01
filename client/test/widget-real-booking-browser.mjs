import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {startApplication,quoteReceiptResponse} from './widget-application-harness.mjs';
import {mowingFixture} from '../../verification/quotedone/repair-fixture.mjs';
import {catalogMode,pricingEnvelope} from '../src/widgetTransport.js';

const [root,evidence]=process.argv.slice(2).map(value=>path.resolve(value));
const assets='http://127.0.0.1:4590',site='http://127.0.0.1:4591',denied='http://127.0.0.1:4593';
const app=await startApplication(root,evidence,{port:4592,calendarFixture:true,browserOrigins:[assets]});
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(evidence,'executed-widget-browser.mjs'));
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE),Database=require('better-sqlite3');
const rows=[],wire=[],errors=[],servers=[];
let browser,db,f;
const bytes=value=>Buffer.from(value||'');
function listen(server,port){servers.push(server);return new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));}
try{
 f=await mowingFixture(app,'widget-browser',[site,assets]);db=new Database(path.join(evidence,'application.sqlite'));
 const book=await f.read();book.services[0].pricing.edgingPerLinearFoot=2;await f.call('POST','/api/pricebook/save',book);await f.approve();
 const publicCatalog=await app.request('GET',f.url,undefined,undefined,f.headers);assert.equal(publicCatalog.status,200);
 const liveMode=catalogMode(publicCatalog.result);
 async function apiSubmission(scenario={}){
  const raw=f.submission({intakeFlow:'job-details-v1',customerInputs:{...f.inputs,...scenario.inputs},contact:scenario.noCallback?{}:{email:'synthetic@example.invalid'},location:liveMode==='legacy'?{addressLine1:'[SYNTHETIC] 123 Example Street'}:{},context:'',explicitUnknowns:'',urgency:'flexible',customerFeeSelections:{},additionalWork:scenario.additional?[scenario.additional]:[]});
  const submission=JSON.parse(JSON.stringify(pricingEnvelope(raw,liveMode)));
  const before=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
  const prepared=await app.request('POST',f.url+'/prepare',submission,undefined,f.headers);
  if(scenario.noCallback&&[400,422].includes(prepared.status)){
   assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before);
   return {mode:liveMode,submission,prepared,rejected:true};
  }
  assert.equal(prepared.status,200,JSON.stringify(prepared));
  const body={...submission,...(prepared.result.status==='ready'?{intakeConfirmation:prepared.result.confirmation}:{reviewRequested:true})};
  const saved=await app.request('POST',f.url,body,undefined,f.headers);
  if(scenario.noCallback){
   assert.ok([400,422].includes(saved.status),JSON.stringify(saved));
   assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before);
   return {mode:liveMode,submission,prepared,body,saved,rejected:true};
  }
  assert.equal(saved.status,201,JSON.stringify(saved));
  const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
  assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);assert.deepEqual(quoteReceiptResponse(app,receipt),saved.result);
  if(scenario.review){assert.equal(saved.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(saved.result.midEstimate,undefined);}
  else{
   const amount=scenario.additional?saved.result.pricedEstimate:saved.result;assert.equal(amount.midEstimate,scenario.price??50);
   if(scenario.additional){assert.equal(saved.result.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(saved.result.fullJobTotal,null);assert.equal(saved.result.midEstimate,undefined);}
   else assert.equal(saved.result.resultType,'INSTANT_ESTIMATE_READY');
  }
  return {mode:liveMode,submission,prepared,body,saved,receipt};
 }
 for(const scenario of [
  {name:'Complete job without a name',price:50},
  {name:'Selected work with separately declared additional work',price:50,additional:'[SYNTHETIC] Remove the hedge beside the driveway.'},
  {name:'Configured edging and separate work',price:70,inputs:{edgingIncluded:true,edgingLengthLF:10},additional:'[SYNTHETIC] Assess the retaining wall.'},
  {name:'Exact decimal measurement',price:.63,inputs:{yardSqft:125.125}},
  {name:'Unmeasured selected work remains unpriced',inputs:{yardSqft:undefined},review:true},
  {name:'Missing callback is rejected without storing a quote',noCallback:true},
  {name:'A complete callback correction quotes',price:50}
 ]){
  const control=await apiSubmission(scenario);
  rows.push({name:'API control: '+scenario.name,passed:true,surface:'real-api-using-advertised-form-format',control});
 }
 const originalControl=rows[0].control;
 const retryBefore=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
 const replay=await app.request('POST',f.url,originalControl.body,undefined,f.headers);
 assert.equal(replay.status,200);assert.deepEqual(replay.result,originalControl.saved.result);
 assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,retryBefore);
 rows.push({name:'API control: exact retry reuses the saved response and record',passed:true,surface:'real-api-using-advertised-form-format',replay});
 fs.writeFileSync(path.join(evidence,'api-controls.json'),JSON.stringify({passed:true,catalog:publicCatalog.result,rows},null,2));
 const dist=path.join(root,'client/dist');
 await listen(http.createServer(async(req,res)=>{
  try {
   const url=new URL(req.url,assets);
   if(url.pathname.startsWith('/api/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);
    const body=Buffer.concat(chunks);
    const headers={};for(const name of ['origin','content-type','authorization','referer','sec-fetch-site','idempotency-key','access-control-request-method','access-control-request-headers'])if(req.headers[name])headers[name]=req.headers[name];
    const received=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});
    const reply=await received.text();
    wire.push({method:req.method,path:req.url,origin:req.headers.origin,authenticated:!!req.headers.authorization,preflight:{method:req.headers['access-control-request-method'],headers:req.headers['access-control-request-headers']},body:body.length?JSON.parse(body.toString()):null,status:received.status,responseHeaders:Object.fromEntries(received.headers),response:JSON.parse(reply||'null')});
    res.statusCode=received.status;received.headers.forEach((value,key)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(key))res.setHeader(key,value);});
    res.end(reply);return;
   }
   const file=url.pathname==='/'||!path.extname(url.pathname)?path.join(dist,'index.html'):path.join(dist,url.pathname.slice(1));
   if(!file.startsWith(dist+path.sep)&&file!==path.join(dist,'index.html')){res.writeHead(403).end();return;}
   if(!fs.existsSync(file)){res.writeHead(404).end();return;}
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
   res.end(fs.readFileSync(file));
  }catch(error){res.writeHead(500,{'content-type':'text/plain'}).end(String(error));}
 }),4590);
 const host=(req,res)=>{res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>[SYNTHETIC] Host website</title><style>body{background:#eee;color:#111;font:18px serif}button,input,select,textarea{background:magenta!important;color:red!important;font:30px serif!important}h1{font-size:32px}</style><script src="'+assets+'/widget.js" data-key="'+f.access.publicKey+'"></script></head><body><h1>[SYNTHETIC] Host website</h1><button id="host-button">Host page button</button><p>Host content remains unchanged.</p><script src="'+assets+'/widget.js" data-key="'+f.access.publicKey+'" async></script></body></html>');};
 await listen(http.createServer(host),4591);await listen(http.createServer(host),4593);
 fs.writeFileSync(path.join(evidence,'browser-runtime-requested.json'),JSON.stringify({executable:process.env.PRICEBOOK_BROWSER_EXECUTABLE,module:process.env.PRICEBOOK_BROWSER_MODULE}));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:300000});
 fs.writeFileSync(path.join(evidence,'browser-runtime.json'),JSON.stringify({executable:process.env.PRICEBOOK_BROWSER_EXECUTABLE,version:browser.version()}));
 const fields=f.meta.services.find(item=>item.serviceType==='LANDSCAPING_MOWING').customerFields.filter(field=>field.type!=='confirmed_facts');
 async function page(viewport={width:1280,height:900}){const p=await browser.newPage({viewport});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(120000);p.on('pageerror',error=>errors.push(String(error.stack)));return p;}
 async function open(p,url=site){await p.goto(url);assert.equal(await p.locator('[data-otc-widget]').count(),1);await p.getByRole('button',{name:'Get an estimate',exact:true}).click();const loaded=await Promise.race([p.getByLabel('Service',{exact:true}).waitFor().then(()=>true),p.getByRole('button',{name:'Retry loading form',exact:true}).waitFor().then(()=>false)]);if(!loaded){const failure=await p.evaluate(url=>import(url).then(()=>'Module imported').catch(error=>String(error.stack)),assets+'/widget-app.js');throw Error('Production widget module failed: '+failure);}}
 async function fill(p,{inputs={},additional='',details='',email='synthetic@example.invalid',pricingOnly=liveMode==='pricing-only-v2'}={}){
  await p.getByLabel('Service',{exact:true}).selectOption(f.id);await p.getByRole('button',{name:'Continue',exact:true}).click();
  for(const field of fields){
   const value=Object.hasOwn(inputs,field.name)?inputs[field.name]:f.inputs[field.name];
   if(value!==undefined){
    const control=p.getByLabel(field.label,{exact:true});
    if(['number','string','slug'].includes(field.type))await control.fill(String(value));else await control.selectOption(String(value));
   }
   await p.getByRole('button',{name:'Continue',exact:true}).click();
  }
  await p.getByLabel('Additional project details',{exact:true}).fill(details);
  await p.getByRole('button',{name:'Continue',exact:true}).click();
  await p.getByLabel('Additional work for on-site estimate',{exact:true}).fill(additional);
  await p.getByRole('button',{name:'Continue',exact:true}).click();
  await p.getByLabel('Email',{exact:true}).fill(email);
  await p.getByRole('button',{name:'Continue',exact:true}).click();
  if(!pricingOnly)await p.getByLabel('Project location',{exact:true}).fill('[SYNTHETIC] 123 Example Street');
  await p.getByLabel('Urgency',{exact:true}).selectOption('flexible');
 }
 async function prepare(p){
  const waiting=p.waitForResponse(response=>response.url()===assets+f.url+'/prepare'&&response.request().method()==='POST');
  await p.getByRole('button',{name:'Submit estimate request',exact:true}).click();
  const response=await waiting,result=await response.json();assert.equal(response.status(),200,JSON.stringify(result));
  await p.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
  return result;
 }
 async function finish(p,prepared){
  const waiting=p.waitForResponse(response=>response.url()===assets+f.url&&response.request().method()==='POST');
  await p.getByRole('button',{name:prepared.status==='ready'?'Get estimate':'Send request for review',exact:true}).click();
  const response=await waiting,body=response.request().postDataJSON(),result=await response.json();
  assert.equal(response.status(),201,JSON.stringify(result));
  const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
  assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);assert.deepEqual(quoteReceiptResponse(app,receipt),result);
  return {body,result,receipt};
 }
 const smoke=await page({width:390,height:844});await open(smoke);
 assert.equal(await smoke.locator('#host-button').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 0, 255)');
 assert.notEqual(await smoke.getByLabel('Service',{exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 0, 255)');
 const box=await smoke.getByRole('dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844);
 assert.equal(await smoke.locator('vite-error-overlay').count(),0);assert.equal(errors.length,0);
 await smoke.screenshot({path:path.join(evidence,'mobile-launcher-open.png')});
 await smoke.keyboard.press('Escape');assert.equal(await smoke.getByRole('dialog').count(),0);
 assert.equal(await smoke.evaluate(()=>{const root=document.querySelector('[data-otc-widget]').shadowRoot;return root.activeElement===root.querySelector('.launcher');}),true);
 rows.push({name:'Production embed loads from a different origin, once, in the head; mobile sizing, style isolation and Escape focus pass',passed:true});await smoke.close();

 for(const scenario of [
  {name:'Complete measured work without a name',price:50},
  {name:'Separate work keeps the selected price',price:50,additional:'[SYNTHETIC] Remove the hedge beside the driveway.',partial:true},
  {name:'Configured edging and separate work',price:70,inputs:{edgingIncluded:true,edgingLengthLF:10},additional:'[SYNTHETIC] Assess the retaining wall.',partial:true},
  {name:'Decimal measurements remain exact',price:.63,inputs:{yardSqft:125.125}},
  {name:'Unknown main measurement requires review',inputs:{yardSqft:undefined},additional:'[SYNTHETIC] Separate hedge work.',review:true}
 ]){
  const p=await page(scenario.partial?{width:390,height:844}:undefined);await open(p);await fill(p,scenario);const prepared=await prepare(p);const saved=await finish(p,prepared);
  if(scenario.review){assert.equal(saved.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(saved.result.midEstimate,undefined);await p.getByText('Request saved for review',{exact:true}).waitFor();}
  else{
   const estimate=scenario.partial?saved.result.pricedEstimate:saved.result;assert.equal(estimate.midEstimate,scenario.price);
   await p.getByText('$'+scenario.price+' per visit',{exact:true}).waitFor();
   assert.equal(estimate.priceUnit,'per visit');await p.getByText('No tax added.',{exact:true}).waitFor();
   if(scenario.partial){assert.equal(saved.result.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(saved.result.fullJobTotal,null);assert.equal(saved.result.midEstimate,undefined);await p.getByText('Total for all requested work: not yet available.',{exact:true}).waitFor();}
  }
  assert.equal(await p.getByRole('button',{name:'Book it',exact:true}).count(),saved.result.bookingToken?1:0);
  await p.screenshot({path:path.join(evidence,scenario.name.toLowerCase().replaceAll(' ','-')+'.png'),fullPage:true});
  rows.push({name:scenario.name,passed:true,prepared,saved});await p.close();
 }

 const retry=await page();await open(retry);await fill(retry,{additional:'[SYNTHETIC] Inspect the wall.'});await prepare(retry);
 let committed;const before=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
 await retry.route(assets+f.url,async route=>{const response=await route.fetch();committed={body:route.request().postDataJSON(),result:await response.json(),status:response.status()};await route.abort('failed');});
 await retry.getByRole('button',{name:'Get estimate',exact:true}).click();await retry.getByRole('button',{name:'Retry saved request',exact:true}).waitFor();
 assert.equal(committed.status,201);await retry.unroute(assets+f.url);await retry.reload();await retry.getByRole('button',{name:'Get an estimate',exact:true}).click();
 const waiting=retry.waitForResponse(response=>response.url()===assets+f.url&&response.request().method()==='POST');
 await retry.getByRole('button',{name:'Retry saved request',exact:true}).click();const retried=await waiting;
 assert.equal(retried.status(),200);assert.deepEqual(retried.request().postDataJSON(),committed.body);assert.deepEqual(await retried.json(),committed.result);
 assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before+1);
 await retry.getByText('$50 per visit',{exact:true}).waitFor();await retry.reload();await retry.getByRole('button',{name:'Get an estimate',exact:true}).click();await retry.getByText('$50 per visit',{exact:true}).waitFor();
 rows.push({name:'Real committed response loss survives reload and exact retry, then the saved result survives reload',passed:true,committed});await retry.close();

 const rejected=await page();await open(rejected);await fill(rejected,{email:''});
 const rejectionBefore=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
 const deniedPrepare=rejected.waitForResponse(response=>response.url()===assets+f.url+'/prepare'&&response.request().method()==='POST');
 await rejected.getByRole('button',{name:'Submit estimate request',exact:true}).click();
 const deniedResponse=await deniedPrepare,rejection={status:deniedResponse.status(),body:deniedResponse.request().postDataJSON(),result:await deniedResponse.json()};
 assert.equal(rejection.status,422);assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,rejectionBefore);
 await rejected.getByText(rejection.result.error,{exact:true}).waitFor();
 await rejected.getByRole('button',{name:'Back',exact:true}).click();await rejected.getByLabel('Email',{exact:true}).fill('synthetic@example.invalid');
 await rejected.getByRole('button',{name:'Continue',exact:true}).click();
 const corrected=await prepare(rejected),correctedSave=await finish(rejected,corrected);
 assert.equal(correctedSave.result.resultType,'INSTANT_ESTIMATE_READY');assert.deepEqual(correctedSave.body.customerInputs,rejection.body.customerInputs);assert.deepEqual(correctedSave.body.location,rejection.body.location);
 rows.push({name:'Callback rejection remains editable and the corrected request quotes',passed:true,rejection,saved:correctedSave});await rejected.close();

 const blocked=await page();await blocked.goto(denied);await blocked.getByRole('button',{name:'Get an estimate',exact:true}).click();
 await blocked.getByText('This website is not authorized for this quote link.',{exact:true}).waitFor();await blocked.getByRole('button',{name:'Retry loading services',exact:true}).waitFor();
 assert.equal(await blocked.getByRole('option',{name:'[SYNTHETIC] Mowing'}).count(),0);rows.push({name:'Unapproved website is denied by the real backend',passed:true});await blocked.close();

 const owner=await page();await owner.goto(assets+'/login');await owner.getByRole('button',{name:'Sign in',exact:true}).first().click();
 await owner.getByLabel('Email',{exact:true}).fill(f.owner.email);await owner.getByLabel('Password',{exact:true}).fill(f.owner.password);await owner.locator('button[type=submit]').click();await owner.waitForFunction(()=>!!localStorage.getItem('otc_token'));
 await owner.goto(assets+'/pricebook');await owner.getByRole('heading',{name:'Install your website widget',exact:true}).waitFor();
 assert.ok((await owner.getByRole('textbox',{name:/^Widget code/}).inputValue()).includes('data-key="'+f.access.publicKey+'"'));
 await owner.getByLabel('Website to check',{exact:true}).selectOption(site);
 const popupPromise=owner.waitForEvent('popup');await owner.getByRole('button',{name:'Check installation',exact:true}).click();const popup=await popupPromise;
 await owner.getByText('Installation detected ✓ — the launcher and service connection were verified. Open the form and complete an estimate to check the full flow.',{exact:true}).waitFor();
 await owner.screenshot({path:path.join(evidence,'owner-installation-check.png'),fullPage:true});rows.push({name:'Owner copies the actual tenant snippet and the installation check receives a real allowed-origin handshake',passed:true});await popup.close();await owner.close();


 // Real widget -> application -> SQLite -> provider adapter. Only Google's network boundary is synthetic.
 const oauth=await app.request('GET','/api/onboarding/calendar/google/start',undefined,f.owner.token);
 assert.equal(oauth.status,200);const oauthState=new URL(oauth.result.authorizationUrl).searchParams.get('state');
 const oauthCallback=await fetch(app.base+'/api/onboarding/calendar/google/callback?state='+encodeURIComponent(oauthState)+'&code=SYNTHETIC-CODE',{redirect:'manual'});assert.equal(oauthCallback.status,302);
 await f.call('POST','/api/onboarding/knowledge-base',{sections:[],serviceArea:{mode:'cities',cities:[{city:'Halifax',region:'NS',country:'CA'}]}});
 await f.call('PUT','/api/booking/settings',{timezone:'America/Halifax',weeklyAvailability:Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'09:00',end:'17:00'}]])),blackouts:[],bookingHorizonDays:14,minimumNoticeMinutes:0,slotIncrementMinutes:30,bufferBeforeMinutes:0,bufferAfterMinutes:0,directBookingEnabled:true});
 await f.call('PUT','/api/booking/policies/'+f.id,{bookingMode:'site_visit_first',durationMinutes:60,enabled:true});
 const providerFile=path.join(evidence,'synthetic-calendar-provider.json');
 const provider=()=>JSON.parse(fs.readFileSync(providerFile,'utf8'));
 const providerMode=mode=>{const state=provider();state.mode=mode;fs.writeFileSync(providerFile,JSON.stringify(state,null,2));};
 const bookingPage=await page(),prior=rows.find(row=>row.name==='Complete measured work without a name').saved;
 const bookingBase=assets+'/api/public/bookings/'+prior.result.bookingToken,savedKey='otc-widget:'+assets+':'+f.access.publicKey+':pending-'+f.access.publicKey;
 await bookingPage.addInitScript(({key,result,submission})=>sessionStorage.setItem(key,JSON.stringify({kind:'completed',result,submission})),{key:savedKey,result:prior.result,submission:prior.body});
 await bookingPage.goto(site);await bookingPage.getByRole('button',{name:'Get an estimate',exact:true}).click();
 for(const[label,value]of Object.entries({Name:'[SYNTHETIC] Real Booking Customer','Project location':'[SYNTHETIC] 123 Example Street',City:'Toronto','State / province':'ON','Postal / ZIP code':'B3H 0A1',Country:'CA'}))await bookingPage.getByLabel(label,{exact:true}).fill(value);
 await bookingPage.getByLabel('Have the work or measurements changed since this estimate?',{exact:true}).selectOption('UNCHANGED');
 const outsideWaiting=bookingPage.waitForResponse(r=>r.url()===bookingBase+'/availability'&&r.request().method()==='POST');await bookingPage.getByRole('button',{name:'Book it',exact:true}).click();const outsideResponse=await outsideWaiting,outside=await outsideResponse.json();assert.equal(outside.status,'PREFERRED_TIME_ONLY');assert.equal(outside.reason,'OUT_OF_AREA');assert.equal(await bookingPage.getByRole('radio').count(),0);
 await bookingPage.getByLabel('City',{exact:true}).fill('Halifax');await bookingPage.getByLabel('State / province',{exact:true}).fill('NS');
 const availableWaiting=bookingPage.waitForResponse(r=>r.url()===bookingBase+'/availability'&&r.request().method()==='POST');await bookingPage.getByRole('button',{name:'Book it',exact:true}).click();const availableResponse=await availableWaiting,available=await availableResponse.json();assert.equal(available.status,'AVAILABLE');
 await bookingPage.getByRole('radio').first().check();const holdWaiting=bookingPage.waitForResponse(r=>r.url()===bookingBase+'/holds');await bookingPage.getByRole('button',{name:'Review appointment',exact:true}).click();const held=await(await holdWaiting).json();assert.equal(held.status,'HELD');
 const releaseWaiting=bookingPage.waitForResponse(r=>r.url()===bookingBase+'/holds/'+held.holdId&&r.request().method()==='DELETE');await bookingPage.getByRole('button',{name:'Change appointment details',exact:true}).click();assert.equal((await(await releaseWaiting).json()).status,'RELEASED');assert.equal(db.prepare('SELECT status FROM bookingHolds WHERE ownerId=? AND id=?').get(f.owner.id,held.holdId).status,'RELEASED');
 await bookingPage.getByRole('button',{name:'Book it',exact:true}).click();await bookingPage.getByRole('radio').first().check();await bookingPage.getByRole('button',{name:'Review appointment',exact:true}).click();
 await bookingPage.getByLabel('I confirm this appointment, contact information and job site.',{exact:true}).check();
 providerMode('ambiguous');let lost;
 await bookingPage.route(bookingBase+'/confirm',async route=>{const response=await route.fetch();lost={key:route.request().headers()['idempotency-key'],body:route.request().postDataJSON(),status:response.status(),result:await response.json()};await route.abort('failed');});
 await bookingPage.getByRole('button',{name:'Confirm appointment',exact:true}).click();await bookingPage.getByRole('button',{name:'Retry booking request',exact:true}).waitFor();assert.equal(lost.status,202);assert.equal(lost.result.status,'PENDING_CONFIRMATION');
 await bookingPage.unroute(bookingBase+'/confirm');await app.restart();await bookingPage.reload();await bookingPage.getByRole('button',{name:'Get an estimate',exact:true}).click();
 const retryWaiting=bookingPage.waitForResponse(r=>r.url()===bookingBase+'/confirm');await bookingPage.getByRole('button',{name:'Retry booking request',exact:true}).click();const retryResponse=await retryWaiting,bookingRetry=await retryResponse.json();assert.equal(retryResponse.status(),202);assert.deepEqual(retryResponse.request().postDataJSON(),lost.body);assert.equal(retryResponse.request().headers()['idempotency-key'],lost.key);assert.deepEqual(bookingRetry,lost.result);
 await bookingPage.getByText('Confirmation pending',{exact:true}).waitFor();assert.equal(await bookingPage.getByText('Site visit booked',{exact:true}).count(),0);
 const storedPending=db.prepare('SELECT * FROM appointments WHERE ownerId=? AND id=?').get(f.owner.id,lost.result.appointmentId);assert.equal(storedPending.status,'PENDING_CONFIRMATION');
 const originalEvents=structuredClone(provider().events);
 for(const variant of ['wrong-day','wrong-duration']){
  const altered=provider();altered.mode='normal';altered.events=structuredClone(originalEvents);
  for(const event of Object.values(altered.events)){if(variant==='wrong-day')event.start.dateTime=new Date(Date.parse(event.start.dateTime)+86400000).toISOString();event.end.dateTime=new Date(Date.parse(event.end.dateTime)+(variant==='wrong-day'?86400000:1800000)).toISOString();}
  const checked=bookingPage.waitForResponse(r=>r.url().includes(bookingBase+'/confirmations/')&&r.request().method()==='GET');fs.writeFileSync(providerFile,JSON.stringify(altered,null,2));
  const result=await(await checked).json();assert.equal(result.status,'PENDING_CONFIRMATION');await bookingPage.getByText('Confirmation pending',{exact:true}).waitFor();assert.equal(await bookingPage.getByText('Site visit booked',{exact:true}).count(),0);
  const appointment=db.prepare('SELECT * FROM appointments WHERE ownerId=? AND id=?').get(f.owner.id,lost.result.appointmentId);assert.equal(appointment.status,'PENDING_CONFIRMATION');assert.equal(db.prepare("SELECT count(*) n FROM outboxEvents WHERE ownerId=? AND aggregateId=? AND eventType='appointment.booked'").get(f.owner.id,appointment.id).n,0);
  rows.push({name:'Widget preserves pending confirmation for '+variant,passed:true,result,appointment,providerEvents:altered.events});
 }
 const restored=provider();restored.events=originalEvents;fs.writeFileSync(providerFile,JSON.stringify(restored,null,2));
 providerMode('normal');await bookingPage.getByText('Site visit booked',{exact:true}).waitFor();const storedConfirmed=db.prepare('SELECT * FROM appointments WHERE ownerId=? AND id=?').get(f.owner.id,lost.result.appointmentId);assert.equal(storedConfirmed.status,'CONFIRMED');
 assert.equal(provider().calls.filter(c=>c.method==='POST'&&new URL(c.url).pathname.endsWith('/events')).length,1);
 await bookingPage.screenshot({path:path.join(evidence,'real-widget-confirmed-synthetic-calendar.png'),fullPage:true});
 const bookingInterface={passed:true,fixtureOnly:false,providerFixtureOnly:true,realBookingRoutesVerified:true,outside,available,held,lost,bookingRetry,storedPending,storedConfirmed,provider:provider()};
 rows.push({name:'Real widget service area, hold release, lost confirmation, application restart, exact retry and provider reconciliation',passed:true,bookingInterface});await bookingPage.close();
 const version={};

 const v2=await page();
 await v2.route(assets+f.url,async route=>{
  if(route.request().method()!=='GET'){await route.continue();return;}
  const received=await route.fetch();await route.fulfill({response:received,json:{...await received.json(),...version}});
 });
 await open(v2);await fill(v2,{pricingOnly:true});const v2Prepared=await prepare(v2),v2Saved=await finish(v2,v2Prepared);
 assert.equal(v2Saved.result.midEstimate,50);assert.equal(Object.hasOwn(v2Saved.body,'location'),false);assert.equal(Object.hasOwn(v2Saved.body.contact,'name'),false);
 rows.push({name:'Versioned pricing-only form sends real quote facts and preserves the stored response',passed:true,catalogCapabilityFixture:true,saved:v2Saved});
 await v2.getByRole('button',{name:'Change job details',exact:true}).click();await v2.getByLabel('Service',{exact:true}).waitFor();
 assert.equal(await v2.getByLabel('Service',{exact:true}).inputValue(),f.id);
 await v2.getByRole('button',{name:'Continue',exact:true}).click();
 if(await v2.getByLabel('Requested work',{exact:true}).count())await v2.getByRole('button',{name:'Continue',exact:true}).click();
 const areaLabel=fields.find(field=>field.name==='yardSqft').label;
 assert.equal(await v2.getByLabel(areaLabel,{exact:true}).inputValue(),'10000');
 rows.push({name:'Change job details returns to retained measurements for re-quoting',passed:true});await v2.close();

 const unknown=await page();await unknown.route(assets+f.url,async route=>{const received=await route.fetch();await route.fulfill({response:received,json:{...await received.json(),contractVersion:'unknown-future-version'}});});
 await unknown.goto(site);await unknown.getByRole('button',{name:'Get an estimate',exact:true}).click();
 await unknown.getByText('This form needs an update to match the business. Reload the page before continuing.',{exact:true}).waitFor();
 assert.equal(await unknown.getByRole('option',{name:'[SYNTHETIC] Mowing'}).count(),0);rows.push({name:'Unknown advertised form version is rejected explicitly',passed:true,metadataFixture:true});await unknown.close();

 assert.equal(errors.length,0,JSON.stringify(errors));
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks:rows.length,rows,wire,errors,bookingInterface,realBookingRoutesVerified:true,liveProviderVerified:false,hostingBoundary:'Local test static server proxies unchanged real API, preserving request origins. No production hosting configured.'},null,2));
 console.log(JSON.stringify({passed:true,checks:rows.length}));
}catch(error){
 if(browser)for(const [index,p]of browser.contexts().flatMap(context=>context.pages()).entries()){
  await p.screenshot({path:path.join(evidence,'failure-'+index+'.png'),fullPage:true}).catch(()=>{});
  fs.writeFileSync(path.join(evidence,'failure-'+index+'.txt'),(await p.locator('body').innerText().catch(()=>''))+'\n'+(await p.getByRole('dialog').innerText().catch(()=>'')));
 }
 fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,error:String(error.stack),rows,wire,errors},null,2));throw error;
}finally{
 if(browser)await browser.close();if(db)db.close();for(const server of servers)await new Promise(resolve=>server.close(resolve));await app.stop();
}
