import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {startApplication,quoteReceiptResponse} from '../../client/test/widget-application-harness.mjs';
import {mowingFixture} from '../quotedone/repair-fixture.mjs';
import {customerFieldVisible} from '../../server/scopeConfiguration.js';

// Real built client, real API and a fresh SQLite store. Only the local host/asset
// servers and synthetic owner price book are fixtures; no live providers or data.
const [root,out]=process.argv.slice(2).map(value=>path.resolve(value));
const evidence=path.join(out,'private'),published=path.join(out,'public');
fs.mkdirSync(published,{recursive:true});
const require=createRequire(path.join(root,'package.json'));
const {chromium}=require(process.env.WIDGET_BROWSER_MODULE),Database=require('better-sqlite3');
const assets='http://127.0.0.1:4790',site='http://127.0.0.1:4791',denied='http://127.0.0.1:4793';
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
assert.equal(sourceCommit,process.env.WIDGET_SOURCE_SHA||sourceCommit);
const rows=[],wire=[],pageErrors=[],servers=[],pages=new Set();
const omitted=new Set(['password','passwordHash','authorization','cookie','set-cookie','token','bookingToken','bookingTokenReceipt','bookingTokenHash']);
const safe=value=>JSON.parse(JSON.stringify(value,(key,value)=>omitted.has(key)?'[SYNTHETIC SECRET OMITTED]':typeof value==='string'?value.replace(/\/api\/public\/bookings\/[^/\s?]+/g,'/api/public/bookings/[SYNTHETIC TOKEN OMITTED]'):value));
function save(name,value){fs.writeFileSync(path.join(published,name),JSON.stringify(safe(value),null,2));}
function slug(name){return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'');}
async function listen(server,port){servers.push(server);await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));}
let app,db,browser,f,snippet,fields,catalog,book;
async function check(name,action){
 const start=Date.now();let p;
 try {
  const detail=await action(async(width=1280)=>{p=await browser.newPage({viewport:{width,height:900}});pages.add(p);p.setDefaultTimeout(10000);p.on('pageerror',error=>pageErrors.push({test:name,error:String(error.stack)}));return p;});
  rows.push({name,passed:true,durationMs:Date.now()-start,detail});
 }catch(error){
  let screenshot;
  if(p&&!p.isClosed()){screenshot=slug(name)+'-failure.png';await p.screenshot({path:path.join(published,screenshot)}).catch(()=>{});}
  rows.push({name,passed:false,durationMs:Date.now()-start,error:String(error.stack),screenshot});
 }finally{if(p){await p.close();pages.delete(p);}}
 console.log('WIDGET_CASE '+JSON.stringify(rows.at(-1)));
}
async function hostOkay(p){
 if(await p.getByRole('dialog').count())await p.keyboard.press('Escape');
 await p.locator('#host-button').click();
 assert.equal(await p.locator('#host-count').textContent(),'1');
 assert.equal(await p.locator('#host-button').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 0, 255)');
}
async function open(p,url=site){
 await p.goto(url,{waitUntil:'domcontentloaded'});
 await p.locator('.launcher').waitFor();
 assert.equal(await p.locator('[data-otc-widget]').count(),1);
 await p.locator('.launcher').click();
 await p.getByLabel('Service',{exact:true}).waitFor();
 // The wizard itself renders before its asynchronously loaded catalog.
 await p.getByLabel('Service',{exact:true}).locator('option[value="'+f.id+'"]').waitFor({state:'attached'});
}
async function geometry(p){
 return p.evaluate(()=>{
  const root=document.querySelector('[data-otc-widget]').shadowRoot;
  const rect=el=>{const b=el.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
  const scroll=root.querySelector('.widget-scroll');
  return {width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth,panel:rect(root.querySelector('dialog')),close:rect(root.querySelector('.close')),launcher:rect(root.querySelector('.launcher')),scroll:{width:scroll.clientWidth,content:scroll.scrollWidth}};
 });
}
function fits(value,includeLauncher=false){
 assert.ok(value.pageWidth<=value.width+1,JSON.stringify(value));
 assert.ok(value.panel.x>=0&&value.panel.right<=value.width+1&&value.panel.y>=0&&value.panel.bottom<=value.height+1,JSON.stringify(value));
 assert.ok(value.close.x>=value.panel.x&&value.close.right<=value.panel.right&&value.close.bottom<=value.panel.bottom,JSON.stringify(value));
 assert.ok(value.scroll.content<=value.scroll.width+1,JSON.stringify(value));
 if(includeLauncher)assert.ok(value.launcher.x>=0&&value.launcher.right<=value.width+1,JSON.stringify(value));
}
async function controlsReachable(p){
 const controls=p.getByRole('dialog').locator('button,input,select,textarea,a[href]');
 for(let i=0;i<await controls.count();i++){
  const control=controls.nth(i);if(!await control.isVisible()||!await control.isEnabled())continue;
  await control.scrollIntoViewIfNeeded();
  const box=await control.boundingBox(),viewport=p.viewportSize();
  assert.ok(box&&box.x>=-1&&box.x+box.width<=viewport.width+1&&box.y>=-1&&box.y+box.height<=viewport.height+1,'Unreachable control: '+await control.evaluate(el=>el.outerHTML));
  assert.ok(await control.evaluate(el=>!!(el.labels?.length||el.getAttribute('aria-label')||el.textContent.trim())),'Control has no accessible label');
 }
 fits(await geometry(p));
}
async function fill(p,{inputs=f.inputs,additional=''}={}){
 await p.getByLabel('Service',{exact:true}).selectOption(f.id);await p.getByRole('button',{name:'Continue',exact:true}).click();
 for(const field of fields.filter(field=>customerFieldVisible(field,inputs))){
  const value=inputs[field.name],control=p.getByLabel(field.label,{exact:true});
  if(value!==undefined){if(['number','string','slug'].includes(field.type))await control.fill(String(value));else await control.selectOption(String(value));}
  await controlsReachable(p);
  await p.getByRole('button',{name:'Continue',exact:true}).click();
 }
 await p.getByLabel('Additional project details',{exact:true}).fill('');
 await p.getByRole('button',{name:'Continue',exact:true}).click();
 await p.getByLabel('Additional work for on-site estimate',{exact:true}).fill(additional);
 await p.getByRole('button',{name:'Continue',exact:true}).click();
 await p.getByLabel('Email',{exact:true}).fill('synthetic-widget@example.invalid');
 await p.getByRole('button',{name:'Continue',exact:true}).click();
 await p.getByLabel('Urgency',{exact:true}).selectOption('flexible');
 await controlsReachable(p);
}
async function prepare(p){
 const next=p.waitForResponse(r=>r.url()===assets+f.url+'/prepare'&&r.request().method()==='POST');
 await p.getByRole('button',{name:'Submit estimate request',exact:true}).click();
 const response=await next,value=await response.json();assert.equal(response.status(),200,JSON.stringify(value));
 await p.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
 return value;
}
async function finish(p,prepared){
 const next=p.waitForResponse(r=>r.url()===assets+f.url&&r.request().method()==='POST');
 await p.getByRole('button',{name:prepared.status==='ready'?'Get estimate':'Send request for review',exact:true}).click();
 const response=await next,body=response.request().postDataJSON(),result=await response.json();
 assert.equal(response.status(),201,JSON.stringify(result));
 const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);
 assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);
 assert.deepEqual(quoteReceiptResponse(app,receipt),result);
 return {body,result,receipt};
}
function comparable(value){
 // Owner preview intentionally includes private calculation records. Compare
 // every customer price/disclosure field, including each option, recursively.
 const fields=['resultType','tierName','lowEstimate','midEstimate','highEstimate','priceUnit','taxTreatment','priceDrivers','disclaimer','skippedAddons','rangeBufferUsed','options','pricedEstimate','fullJobTotal','scopeLabel','partialOptionsNotice'];
 return Object.fromEntries(fields.filter(key=>Object.hasOwn(value,key)).map(key=>[key,key==='options'?value[key].map(comparable):key==='pricedEstimate'?comparable(value[key]):value[key]]));
}
async function preview(saved){
 const response=await app.request('POST','/api/pricebook/preview',{...saved.body,revision:(await f.read()).revision},f.owner.token);
 assert.equal(response.status,200,JSON.stringify(response));
 assert.deepEqual(comparable(response.result),comparable(saved.result));
 return response;
}
try{
 app=await startApplication(root,evidence,{port:4792,browserOrigins:[assets]});
 f=await mowingFixture(app,'embed-'+sourceCommit.slice(0,10),[site,assets]);
 db=new Database(path.join(evidence,'application.sqlite'));
 catalog=(await app.request('GET',f.url,undefined,undefined,f.headers)).result;
 assert.equal(catalog.contractVersion,'2026-09-29.1');
 fields=catalog.services.find(service=>service.id===f.id).customerFields.filter(field=>field.type!=='confirmed_facts');
 book=await f.read();
 const dist=path.join(root,'client/dist');
 // Test-only origins, independently bound ports. Production static serving,
 // deployment and proxy configuration are deliberately not modified.
 await listen(http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,assets);
   if(url.pathname.startsWith('/api/')){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);
    const headers={};for(const key of ['origin','content-type','authorization','referer','sec-fetch-site','idempotency-key','access-control-request-method','access-control-request-headers'])if(req.headers[key])headers[key]=req.headers[key];
    const response=await fetch(app.base+req.url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});
    const text=await response.text();
    wire.push({method:req.method,path:req.url,origin:req.headers.origin,authenticated:!!req.headers.authorization,request:body.length?JSON.parse(body):null,status:response.status,headers:Object.fromEntries(response.headers),response:JSON.parse(text||'null')});
    res.statusCode=response.status;response.headers.forEach((value,key)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(key))res.setHeader(key,value);});
    res.end(text);return;
   }
   const file=url.pathname==='/'||!path.extname(url.pathname)?path.join(dist,'index.html'):path.resolve(dist,'.'+url.pathname);
   if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}
   res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cache-Control','no-store');
   res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
   res.end(fs.readFileSync(file));
  }catch(error){res.writeHead(500,{'content-type':'text/plain'}).end(String(error));}
 }),4790);
 const host=(req,res)=>{
  const hostile=!req.url.includes('plain');
  const css=hostile?'html{font-size:48px!important}*{box-sizing:content-box!important}body,div,section,main,form,fieldset{margin:0!important;padding:0!important}button,input,select,textarea,a{background:magenta!important;color:red!important;font:32px serif!important;line-height:2!important;border:7px solid blue!important}dialog{display:none!important}[data-otc-widget]{position:static!important;padding:100px!important;margin:100px!important;font-size:60px!important}':'';
  res.setHeader('content-type','text/html');
  res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>[SYNTHETIC] Contractor</title><style>body{background:#eee;color:#111;font:16px serif}h1{font:24px serif;overflow-wrap:anywhere}#host-button{background:magenta;max-width:200px;font-size:16px!important}#host-count{font-size:16px}'+css+'</style>'+snippet+'</head><body><h1>[SYNTHETIC] Contractor website</h1><button id="host-button" onclick="document.getElementById(\'host-count\').textContent=Number(document.getElementById(\'host-count\').textContent)+1">Host button</button><span id="host-count">0</span><p style="font-size:16px">The website remains interactive.</p>'+snippet+'</body></html>');
 };
 await listen(http.createServer(host),4791);await listen(http.createServer(host),4793);
 browser=await chromium.launch({headless:true,timeout:120000});
 save('runtime.json',{sourceCommit,node:process.version,abi:process.versions.modules,browser:browser.version(),playwright:require(path.join(process.env.WIDGET_BROWSER_MODULE,'package.json')).version,origins:{assets,site,api:app.base},syntheticOnly:true,liveProviderTraffic:false});
 const owner=await browser.newPage();owner.setDefaultTimeout(30000);
 await owner.goto(assets+'/login');await owner.getByRole('button',{name:'Sign in',exact:true}).first().click();
 await owner.getByLabel('Email',{exact:true}).fill(f.owner.email);await owner.getByLabel('Password',{exact:true}).fill(f.owner.password);
 await owner.locator('button[type=submit]').click();await owner.waitForFunction(()=>!!localStorage.getItem('otc_token'));
 await owner.goto(assets+'/pricebook');
 snippet=await owner.getByRole('textbox',{name:/^Widget code/}).inputValue();
 assert.equal(snippet,'<script src="'+assets+'/widget.js" data-key="'+f.access.publicKey+'" async></script>');
 assert.ok(!snippet.includes(f.owner.token)&&!snippet.includes(f.owner.password));
 save('owner-snippet.json',{snippet,source:'Rendered owner price-book installation textarea',publicKeyOnly:true});
 await owner.screenshot({path:path.join(published,'owner-installation.png'),fullPage:true});await owner.close();
 rows.push({name:'Exact snippet copied from owner interface, async, public key only',passed:true});

 await check('Native dialog keyboard control',async page=>{
  const p=await page();await p.setContent('<button id="outside">Outside dialog</button><dialog id="modal"><button id="close">Close</button><input aria-label="Native input"><button id="last">Last</button></dialog>');
  await p.evaluate(()=>document.querySelector('dialog').showModal());await p.locator('#close').focus();
  const trace=[];
  for(let i=0;i<10;i++){await p.keyboard.press('Tab');trace.push(await p.evaluate(()=>({inside:document.querySelector('dialog').contains(document.activeElement),documentHasFocus:document.hasFocus(),active:document.activeElement?.outerHTML.slice(0,200)})));}
  assert.ok(trace.every(state=>state.inside||!state.documentHasFocus));
  save('native-dialog-focus.json',trace);return trace;
 });
 for(const width of [320,375,768,1280]){
  await check('Quote and capture on hostile host at '+width+'px',async page=>{
   const p=await page(width);await open(p);
   assert.notEqual(await p.getByLabel('Service',{exact:true}).evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 0, 255)');
   assert.equal(await p.getByLabel('Service',{exact:true}).evaluate(el=>getComputedStyle(el).boxSizing),'border-box');
   fits(await geometry(p));
   await p.screenshot({path:path.join(published,'widget-'+width+'-form.png')});
   await fill(p);const prepared=await prepare(p),saved=await finish(p,prepared);
   assert.equal(saved.result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(saved.result.midEstimate,50);
   assert.equal(saved.result.priceUnit,'per visit');
   assert.doesNotMatch(JSON.stringify(saved.result),/"(?:lineItems|calculationRecord|rateCents|markupPercent|priceBasisByCategory)"\s*:/);await p.getByText('$50 per visit',{exact:true}).waitFor();
   await p.getByText('No tax added.',{exact:true}).waitFor();
   assert.ok(!/\bmarkup\b|\bmargin\b|mowingBaseRatePerSqft|0\.005/.test(await p.getByRole('dialog').innerText()));
   const ownerPreview=await preview(saved);
   await controlsReachable(p);
   await p.getByText('$50 per visit',{exact:true}).scrollIntoViewIfNeeded();
   await p.screenshot({path:path.join(published,'widget-'+width+'-quote.png')});
   const accessibility=await p.getByRole('dialog').ariaSnapshot();
   save('quote-'+width+'.json',{prepared,saved,ownerPreview,geometry:await geometry(p),accessibility});
   assert.equal((await p.getByRole('dialog').getAttribute('aria-label')),'Request an estimate');
   // Native modal traps keyboard navigation, then Escape restores launcher focus.
   await p.getByRole('button',{name:'Close estimate form',exact:true}).focus();
   const focusTrace=[];
   for(let i=0;i<40;i++){
    await p.keyboard.press('Tab');
    focusTrace.push(await p.evaluate(()=>{const root=document.querySelector('[data-otc-widget]').shadowRoot;const active=root.activeElement;return {inside:root.querySelector('dialog').contains(active),documentHasFocus:document.hasFocus(),documentActive:document.activeElement?.outerHTML.slice(0,200),shadowActive:active?.outerHTML.slice(0,200)||null};}));
   }
   save('focus-'+width+'.json',focusTrace);
   // Chromium permits Tab into browser chrome even for a plain native modal.
   // While the document has focus, it must stay inside the widget dialog.
   assert.equal(focusTrace.every(state=>state.inside||(!state.documentHasFocus&&state.shadowActive===null)),true,'Focus reached the host page: '+JSON.stringify(focusTrace.filter(state=>!state.inside)));
   await p.keyboard.press('Escape');
   assert.equal(await p.evaluate(()=>{const root=document.querySelector('[data-otc-widget]').shadowRoot;return root.activeElement===root.querySelector('.launcher');}),true);
   await hostOkay(p);
   return {midEstimate:saved.result.midEstimate,ownerParity:true,requestId:saved.body.requestId,quoteId:saved.result.quoteId,stored:true};
  });
 }
 await check('Decimal, partial scope and unknown measurement controls',async page=>{
  const p=await page(375),controls=[];
  for(const scenario of [
   {name:'decimal',inputs:{...f.inputs,yardSqft:125.125},price:.63,type:'INSTANT_ESTIMATE_READY'},
   {name:'additional work',additional:'[SYNTHETIC] Inspect the separate retaining wall.',price:50,type:'PARTIAL_ESTIMATE_READY'},
   {name:'unknown area',inputs:{...f.inputs,yardSqft:undefined},type:'ESTIMATE_REQUIRES_REVIEW'}
  ]){
   await p.goto(site);await p.evaluate(()=>sessionStorage.clear());await open(p);
   await fill(p,scenario);const prepared=await prepare(p),saved=await finish(p,prepared);
   assert.equal(saved.result.resultType,scenario.type);
   if(scenario.type==='PARTIAL_ESTIMATE_READY'){assert.equal(saved.result.pricedEstimate.midEstimate,scenario.price);assert.equal(saved.result.fullJobTotal,null);}
   else if(scenario.price!==undefined)assert.equal(saved.result.midEstimate,scenario.price);
   else assert.equal(saved.result.midEstimate,undefined);
   controls.push({scenario,prepared,saved,ownerPreview:await preview(saved)});
  }
  save('price-controls.json',controls);return controls.map(({scenario,saved})=>({name:scenario.name,type:saved.result.resultType}));
 });
 await check('Preferred-time request persists from actual embedded flow',async page=>{
  const p=await page(320);await open(p);await fill(p);const saved=await finish(p,await prepare(p));
  await p.getByLabel('Name',{exact:true}).fill('[SYNTHETIC] Widget customer');
  await p.getByLabel('Project location',{exact:true}).fill('[SYNTHETIC] 123 Example Street');
  await p.getByLabel('City',{exact:true}).fill('Halifax');await p.getByLabel('State / province',{exact:true}).fill('NS');
  await p.getByLabel('Postal / ZIP code',{exact:true}).fill('B3J 1A1');await p.getByLabel('Country',{exact:true}).fill('CA');
  await p.getByLabel('Have the work or measurements changed since this estimate?',{exact:true}).selectOption('UNCHANGED');
  await p.getByRole('button',{name:'Book it',exact:true}).click();
  await p.getByRole('heading',{name:'Request a preferred time',exact:true}).waitFor();
  const date=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
  await p.getByLabel('Preferred date 1',{exact:true}).fill(date);await p.getByLabel('Preferred time 1',{exact:true}).selectOption('morning');
  await controlsReachable(p);
  const next=p.waitForResponse(r=>r.url().endsWith('/preference')&&r.request().method()==='POST');
  await p.getByRole('button',{name:'Request preferred time',exact:true}).click();
  const response=await next,result=await response.json();assert.ok(response.ok(),JSON.stringify(result));
  assert.equal(result.status,'REQUESTED');await p.getByText('Preferred time requested',{exact:true}).waitFor();
  await p.getByText('An appointment has not been booked.',{exact:true}).waitFor();
  const record=db.prepare('SELECT * FROM bookingPreferences WHERE ownerId=? AND id=?').get(f.owner.id,result.preferenceRequestId);
  assert.equal(record.status,'REQUESTED');assert.deepEqual(JSON.parse(record.preferredWindowsJson),[{date,timeOfDay:'morning'}]);
  assert.equal(JSON.parse(record.customerJson).name,'[SYNTHETIC] Widget customer');
  save('preferred-time.json',{saved,request:response.request().postDataJSON(),response:result,record});
  await p.screenshot({path:path.join(published,'widget-320-preferred-time.png')});
  return {status:result.status,stored:!!record};
 });
 await check('Lost quote response retries the same stored request once',async page=>{
  const p=await page(375);await open(p);await fill(p);await prepare(p);
  const before=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
  let lost;
  await p.route(assets+f.url,async route=>{
   if(route.request().method()!=='POST'){await route.continue();return;}
   const response=await route.fetch();
   lost={body:route.request().postDataJSON(),status:response.status(),response:await response.json()};
   await route.abort('failed');
  });
  await p.getByRole('button',{name:'Get estimate',exact:true}).click();
  await p.getByRole('button',{name:'Retry saved request',exact:true}).waitFor();
  assert.equal(lost.status,201);assert.equal(await p.getByRole('alert').count(),1);
  assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before+1);
  await p.unroute(assets+f.url);
  const next=p.waitForResponse(r=>r.url()===assets+f.url&&r.request().method()==='POST');
  await p.getByRole('button',{name:'Retry saved request',exact:true}).click();
  const response=await next,result=await response.json();
  assert.equal(response.status(),200);assert.deepEqual(response.request().postDataJSON(),lost.body);assert.deepEqual(result,lost.response);
  assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before+1);
  await p.getByText('$50 per visit',{exact:true}).waitFor();
  save('lost-response-retry.json',{lost,retry:{status:response.status(),body:response.request().postDataJSON(),response:result},record:db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,lost.body.requestId)});
  return {responseLostAfterStored:true,recordsCreated:1,retryStatus:response.status()};
 });
 await check('Rejected contact remains editable and correction quotes',async page=>{
  const p=await page(320);await open(p);await fill(p);
  await p.getByRole('button',{name:'Back',exact:true}).click();
  await p.getByLabel('Email',{exact:true}).fill('synthetic-invalid-email');
  await p.getByRole('button',{name:'Continue',exact:true}).click();
  const before=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
  const next=p.waitForResponse(r=>r.url()===assets+f.url+'/prepare'&&r.request().method()==='POST');
  await p.getByRole('button',{name:'Submit estimate request',exact:true}).click();
  const rejected=await next;assert.equal(rejected.status(),422);
  await p.getByRole('alert').waitFor();
  assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before);
  await p.getByRole('button',{name:'Back',exact:true}).click();
  await p.getByLabel('Email',{exact:true}).fill('synthetic-corrected@example.invalid');
  await p.getByRole('button',{name:'Continue',exact:true}).click();
  const saved=await finish(p,await prepare(p));
  assert.equal(saved.result.midEstimate,50);
  save('editable-rejection.json',{rejected:{status:rejected.status(),body:rejected.request().postDataJSON(),response:await rejected.json()},saved});
  return {rejectionStatus:422,editable:true,correctedEstimate:50};
 });
 await check('Unreachable API offers retry and announces the error',async page=>{
  const p=await page(375);await p.route(assets+f.url,route=>route.abort('failed'));
  await p.goto(site);await p.locator('.launcher').click();
  await p.getByRole('button',{name:'Retry loading services',exact:true}).waitFor();
  const message=await p.getByRole('dialog').innerText();
  save('unreachable-api.json',{message,accessibility:await p.getByRole('dialog').ariaSnapshot()});
  assert.match(message,/could not connect|could not be reached|unable to connect/i);
  assert.doesNotMatch(message,/Failed to fetch|NetworkError|Load failed/);
  assert.equal(await p.getByRole('alert').count(),1);
  await p.unroute(assets+f.url);await p.getByRole('button',{name:'Retry loading services',exact:true}).click();
  await p.getByLabel('Service',{exact:true}).locator('option[value="'+f.id+'"]').waitFor({state:'attached'});
  await hostOkay(p);return {message,recovered:true};
 });
 await check('Slow API times out, announces error, then retries',async page=>{
  const p=await page();await p.clock.install();
  let release,started;const waiting=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  await p.route(assets+f.url,async route=>{started();await gate;await route.abort().catch(()=>{});});
  try{
   await p.goto(site);await p.locator('.launcher').click();await waiting;await p.clock.runFor(20001);
   await p.getByRole('button',{name:'Retry loading services',exact:true}).waitFor();
   assert.match(await p.getByRole('dialog').innerText(),/response has not arrived/i);
   assert.equal(await p.getByRole('alert').count(),1);
  }finally{release();await p.unroute(assets+f.url);}
  await p.getByRole('button',{name:'Retry loading services',exact:true}).click();
  await p.getByLabel('Service',{exact:true}).locator('option[value="'+f.id+'"]').waitFor({state:'attached'});
  await hostOkay(p);return {timeoutMs:20000,recovered:true};
 });
 await check('Unavailable module offers retry without reload',async page=>{
  const p=await page(375);await p.route('**/widget-app.js*',route=>route.abort('failed'));
  await p.goto(site);await p.locator('.launcher').click();
  await p.getByRole('button',{name:'Retry loading form',exact:true}).waitFor();
  await p.unroute('**/widget-app.js*');
  await p.getByRole('button',{name:'Retry loading form',exact:true}).click();
  await p.getByLabel('Service',{exact:true}).waitFor({timeout:4000});
  await hostOkay(p);return {recovered:true};
 });
 await check('Slow module has a deadline and stale completion never mounts twice',async page=>{
  const p=await page(320);await p.clock.install();
  let release,started;const waiting=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  await p.route('**/widget-app.js*',async route=>{started();await gate;await route.continue().catch(()=>{});});
  try{
   await p.goto(site);await p.locator('.launcher').click();await waiting;await p.clock.runFor(20001);
   await p.getByRole('button',{name:'Retry loading form',exact:true}).waitFor({timeout:2500});
   assert.equal(await p.getByRole('alert').count(),1);
   release();await p.unroute('**/widget-app.js*');
   await p.getByRole('button',{name:'Retry loading form',exact:true}).click();
   await p.getByLabel('Service',{exact:true}).waitFor();
   assert.equal(await p.locator('.widget-content').count(),1);
   assert.equal(await p.locator('[data-otc-widget]').count(),1);
   await hostOkay(p);return {timeoutMs:20000,mounts:1};
  }finally{release();await p.unroute('**/widget-app.js*');}
 });
 await check('Delayed async snippet does not block host parsing or interaction',async page=>{
  const p=await page(320);let release;const gate=new Promise(resolve=>release=resolve);
  await p.route('**/widget.js',async route=>{await gate;await route.continue().catch(()=>{});});
  try{
   await p.goto(site,{waitUntil:'domcontentloaded'});
   await hostOkay(p);assert.equal(await p.locator('[data-otc-widget]').count(),0);
  }finally{release();await p.unroute('**/widget.js');}
  await p.locator('.launcher').waitFor();assert.equal(await p.locator('[data-otc-widget]').count(),1);
  return {hostInteractiveBeforeWidgetDownloaded:true,duplicateSnippets:2,mounts:1};
 });
 await check('Maximum valid branding fits at 320px',async page=>{
  const oldName=db.prepare('SELECT businessName FROM users WHERE id=?').get(f.owner.id).businessName;
  const oldWidget=db.prepare('SELECT * FROM widgetSettings WHERE ownerId=?').get(f.owner.id);
  db.prepare('UPDATE users SET businessName=? WHERE id=?').run('SyntheticBusiness'+('X'.repeat(103)),f.owner.id);
  db.prepare('INSERT OR REPLACE INTO widgetSettings (ownerId,accentColor,launcherLabel,updatedAt) VALUES (?,?,?,?)').run(f.owner.id,'#16A34A','X'.repeat(40),new Date().toISOString());
  try{
   const p=await page(320);await open(p);
   const value=await geometry(p);save('maximum-branding.json',value);
   await p.screenshot({path:path.join(published,'widget-320-long-branding.png')});fits(value,true);
   await p.getByRole('button',{name:'Close estimate form',exact:true}).click();
   assert.equal(await p.getByRole('dialog').count(),0);
   return value;
  }finally{
   db.prepare('UPDATE users SET businessName=? WHERE id=?').run(oldName,f.owner.id);
   db.prepare('DELETE FROM widgetSettings WHERE ownerId=?').run(f.owner.id);
   if(oldWidget)db.prepare('INSERT INTO widgetSettings (ownerId,accentColor,launcherLabel,clickToCallNumber,updatedAt) VALUES (@ownerId,@accentColor,@launcherLabel,@clickToCallNumber,@updatedAt)').run(oldWidget);
  }
 });
 await check('Owner not live shows explicit unavailability; host stays functional',async page=>{
  db.prepare("UPDATE users SET planStatus='inactive' WHERE id=?").run(f.owner.id);
  try{
   const p=await page(375);await p.goto(site);await p.locator('.launcher').click();
   await p.getByRole('button',{name:'Retry loading services',exact:true}).waitFor();
   const text=await p.getByRole('dialog').innerText();
   assert.match(text,/unavailable|not active|not available|not enabled|subscription/i);
   assert.equal(await p.getByRole('button',{name:'Get estimate',exact:true}).count(),0);
   save('owner-not-live.json',{text});await hostOkay(p);return {text};
  }finally{db.prepare("UPDATE users SET planStatus='active' WHERE id=?").run(f.owner.id);}
 });
 await check('Service not offered gives clear no-services state',async page=>{
  const current=await f.read();current.services[0].active=false;await f.call('POST','/api/pricebook/save',current);
  try{
   const p=await page(375);await p.goto(site);await p.locator('.launcher').click();
   await p.getByText('No services are currently available for online estimates. Please contact the business.',{exact:true}).waitFor();
   assert.equal(await p.getByRole('button',{name:'Continue',exact:true}).isDisabled(),true);
   await hostOkay(p);
  }finally{const restored=await f.read();restored.services[0].active=true;await f.call('POST','/api/pricebook/save',restored);await f.approve();}
 });
 await check('Service removed after loading cannot save an obsolete quote',async page=>{
  const p=await page(375);await open(p);await fill(p);
  const current=await f.read();current.services[0].active=false;await f.call('POST','/api/pricebook/save',current);
  const before=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
  try{
   const next=p.waitForResponse(r=>r.url()===assets+f.url+'/prepare'&&r.request().method()==='POST');
   await p.getByRole('button',{name:'Submit estimate request',exact:true}).click();
   const response=await next,value=await response.json();
   assert.equal(response.status(),200,JSON.stringify(value));assert.equal(value.status,'needs_details');
   assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before);
   assert.equal(await p.getByRole('button',{name:'Get estimate',exact:true}).count(),0);
   await p.getByText('Some details need checking',{exact:true}).waitFor();
   const saved=await finish(p,value);
   assert.equal(saved.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(saved.result.midEstimate,undefined);
   save('stale-service.json',{status:response.status(),value,body:response.request().postDataJSON(),saved});
   await hostOkay(p);
  }finally{const restored=await f.read();restored.services[0].active=true;await f.call('POST','/api/pricebook/save',restored);await f.approve();}
 });
 await check('Unapproved host origin is rejected',async page=>{
  const p=await page();await p.goto(denied);await p.locator('.launcher').click();
  await p.getByRole('button',{name:'Retry loading services',exact:true}).waitFor();
  assert.equal(wire.some(row=>row.origin===denied&&row.status===403),true);
  await hostOkay(p);
 });
 await check('No widget exceptions escape to the host page',async()=>assert.deepEqual(pageErrors,[]));
}catch(error){rows.push({name:'Harness setup',passed:false,error:String(error.stack)});}
finally{
 for(const p of pages)await p.close().catch(()=>{});
 if(browser)await browser.close();
 if(db){
  save('stored-records.json',{
   quotes:db.prepare('SELECT * FROM quotes WHERE ownerId=?').all(f.owner.id),
   submissions:db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=?').all(f.owner.id),
   leads:db.prepare('SELECT * FROM leads WHERE ownerId=?').all(f.owner.id),
   preferences:db.prepare('SELECT * FROM bookingPreferences WHERE ownerId=?').all(f.owner.id)
  });db.close();
 }
 await Promise.all(servers.map(server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})));
 if(app){await app.stop();save('application-http.json',app.requests);}
 save('browser-http.json',wire);save('page-errors.json',pageErrors);
 const hashes={};
 for(const name of ['client/public/widget.js','client/src/widget-entry.jsx','client/src/widget.css','client/src/widgetTransport.js','client/src/quotedone.jsx','verification/widget-embed/browser.mjs','.github/workflows/widget-embed-verification.yml','package-lock.json']){
  hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
 }
 save('results.json',{sourceCommit,syntheticOnly:true,liveProviderTraffic:false,expectedBeforeExecution:{mowing10000Sqft:50,mowing125_125Sqft:.63,rate:.005,markup:0,tax:'TAX_NONE',separateWorkDoesNotChangeSelectedSubtotal:true},passed:rows.every(row=>row.passed),tests:rows.length,pass:rows.filter(row=>row.passed).length,fail:rows.filter(row=>!row.passed).length,rows,hashes});
 console.log('WIDGET_RESULT '+fs.readFileSync(path.join(published,'results.json'),'utf8').replace(/\n/g,''));
 // Portable retrieval through the repository connector when the local workspace
 // is read-only. Only synthetic, sanitized evidence in public/ is exported.
 for(const name of fs.readdirSync(published)){
  const data=fs.readFileSync(path.join(published,name));const base64=data.toString('base64');
  for(let offset=0;offset<base64.length;offset+=24000)console.log('WIDGET_FILE '+JSON.stringify({name,offset,total:base64.length,base64:base64.slice(offset,offset+24000)}));
 }
}
process.exitCode=rows.every(row=>row.passed)?0:1;
