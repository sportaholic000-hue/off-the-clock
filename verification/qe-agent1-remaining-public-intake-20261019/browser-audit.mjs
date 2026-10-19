import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {application} from '../../test/fixtures/bookingCalendarApplication20261006.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {SERVICE_TYPES} from '../../server/quote-engine-vnext/contracts.js';
import {A3_COVERED,CASES,fixtures,corrected,invalid} from './cases.mjs';

const root=path.resolve(process.argv[2]||'.'),out=path.resolve(process.argv[3]||'a1-browser-evidence');
if(fs.existsSync(out))throw Error('Refusing to overwrite evidence: '+out);
fs.mkdirSync(out,{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
const clone=value=>structuredClone(value),cleanup=[],t={after:fn=>cleanup.unshift(fn)};
const owner='synthetic-a',f=fixtures(),results=[],http=[],history=new Map(),pendingProofs=new Map();
const STALE='SYNTHETIC-STALE-PROOF-MUST-BE-DISCARDED';
const PRIVATE=/ownerId|bookRevision|calculationRecord|laborPerSqft|materialPerSqft|installedLaborPercent|confirmedFacts/i;
let app,browser,page,publicPath,byType,cacheKey,current,initialApprovedBook;
// Respect the real 60/minute public limiter; never disable or reset it.
let nextPublicAt=0,publicQueue=Promise.resolve();
let syntheticStart,wallStart;
function pace(){const task=publicQueue.then(async()=>{const delay=Math.max(0,nextPublicAt-Date.now());if(delay)await new Promise(r=>setTimeout(r,delay));nextPublicAt=Date.now()+1100;app.changeProvider({now:new Date(syntheticStart+Date.now()-wallStart).toISOString()});});publicQueue=task;return task;}
write('expectations.json',CASES);
function counts(){return Object.fromEntries(['quoteSubmissions','quotes','leads','quoteRequests'].map(table=>[table,app.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ownerId=?`).get(owner).n]));}
function receipt(id){return app.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,id);}
function storedQuote(row){return app.db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(owner,row.recordId);}
function recordHttp(method,url,request,response){const entry={method,url,request:clone(request),status:response.status,response:clone(response.body)};http.push(entry);current?.http.push(entry);return entry;}
async function api(method,url,body,{status=200,publicRequest=false}={}){
 if(publicRequest)await pace();
 const response=await app.request(url,{method,body,owner:publicRequest?null:owner,publicRequest});
 recordHttp(method,url,body,response);assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(response.body)}`);return response.body;
}
async function check(type,stage,fn){
 const entry={type,stage,status:'running',http:[],started:new Date().toISOString()};current=entry;
 try{await fn(entry);entry.status='passed';}catch(error){entry.status='failed';entry.error={message:error.message,stack:error.stack};}
 if(page)try{entry.visibleText=await page.locator('body').innerText({timeout:2000});entry.screenshot=`${type}-${stage}.png`;await page.screenshot({path:path.join(out,entry.screenshot),fullPage:true,timeout:5000});}catch(error){entry.screenshotError=error.message;}
 entry.finished=new Date().toISOString();results.push(entry);write('results.json',results);current=null;
 console.log(JSON.stringify({type,stage,status:entry.status,...(entry.error?{error:entry.error.message}: {})}));
}
function body(type,inputs=f.get(type).customerInputs){const service=byType.get(type);assert.ok(service,`${type} missing from public catalog`);return {requestId:crypto.randomUUID(),serviceId:service.id,serviceRequest:service.name,customerInputs:clone(inputs),customerFeeSelections:{},additionalWork:[],contact:{email:'synthetic-a1-'+type.toLowerCase()+'@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};}
async function restore(type,inputs=f.get(type).customerInputs){
 const draft={...body(type,inputs),intakeConfirmation:STALE,reviewRequested:true,intakeClarification:{receipt:STALE,answers:{synthetic:'stale'}}};
 await page.evaluate(({key,draft})=>sessionStorage.setItem(key,JSON.stringify({kind:'editable',submission:draft})),{key:cacheKey,draft});
 await page.reload({waitUntil:'networkidle'});await page.getByLabel('Service',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Service',{exact:true}).inputValue(),draft.serviceId);
 return draft;
}
async function field(type,name,value){
 const meta=byType.get(type).customerFields.find(x=>x.name===name);assert.ok(meta,`${type}: missing customer field ${name}`);
 const control=page.getByLabel(meta.label,{exact:true});
 if(meta.type==='boolean'||meta.type==='enum'||meta.type==='integer_or_unknown')await control.selectOption(value===undefined?'':String(value));
 else await control.fill(value===undefined?'':String(value));
}
async function prepare(expected='ready'){
 const before=counts(),waiting=page.waitForRequest(r=>r.method()==='POST'&&new URL(r.url()).pathname===publicPath+'/prepare');
 await page.getByRole('button',{name:'Submit estimate request',exact:true}).click();
 const request=await waiting,response=await request.response();assert.ok(response,'prepare response missing');
 const sent=request.postDataJSON(),received=await response.json();recordHttp('POST',publicPath+'/prepare',sent,{status:response.status(),body:received});
 assert.equal(response.status(),200);assert.deepEqual(counts(),before,'prepare persisted rows');assert.equal(receipt(sent.requestId),undefined);
 for(const key of ['intakeConfirmation','reviewRequested','intakeClarification'])assert.equal(Object.hasOwn(sent,key),false,`editable draft retained ${key}`);
 await page.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
 if(expected!==null)assert.equal(received.status,expected,JSON.stringify(received));
 return {request:sent,response:received};
}
async function changeDetails(){await page.getByRole('button',{name:'Change details',exact:true}).click();await page.getByLabel('Service',{exact:true}).waitFor();}
function centsOf(row){const result=JSON.parse(row.internalOutcomeJson).internalResult;return (result.options?.length?result.options:[result]).map(o=>o.calculationRecord.scenarios.mid.finalTotalCents);}
async function final(type,prepared,inputs,cents,{original=false}={}){
 const before=counts(),waiting=page.waitForRequest(r=>r.method()==='POST'&&new URL(r.url()).pathname===publicPath);
 await page.getByRole('button',{name:'Get estimate',exact:true}).click();
 const request=await waiting,response=await request.response();assert.ok(response,'final response missing');
 const sent=request.postDataJSON(),received=await response.json();recordHttp('POST',publicPath,sent,{status:response.status(),body:received});
 assert.equal(response.status(),201,JSON.stringify(received));
 const row=receipt(sent.requestId);assert.ok(row,'no durable receipt');const quote=storedQuote(row);
 const saved={request:sent,response:received,row:clone(row),quote:clone(quote)};
 if(original)history.set(type,saved);current.saved=saved;
 assert.equal(received.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(received));
 assert.deepEqual(sent.intakeConfirmation,prepared.response.confirmation);
 assert.deepEqual(prepared.request.customerInputs,inputs,'prepare scope differs');assert.deepEqual(sent.customerInputs,inputs,'final scope differs');
 assert.deepEqual(JSON.parse(row.originalSubmissionJson),sent);assert.deepEqual(JSON.parse(quote.customerInputsJson),inputs);
 assert.deepEqual(centsOf(row),[cents],'saved exact cents differ');
 const options=received.options?.length?received.options:[received];assert.deepEqual(options.map(o=>o.midEstimate),[cents/100],'customer cents differ');
 assert.deepEqual(counts(),Object.fromEntries(Object.entries(before).map(([key,n])=>[key,n+1])));
 await page.getByRole('heading',{name:'Estimate',exact:true}).waitFor();
 const text=await page.locator('main').innerText();assert.doesNotMatch(JSON.stringify(received),PRIVATE);assert.doesNotMatch(text,PRIVATE);
 const displayed='$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2});
 assert.ok(text.includes(displayed),`missing exact displayed amount ${displayed}: ${text}`);
 return saved;
}
async function replay(type){
 const old=history.get(type);assert.ok(old,'no genuine original receipt captured');const before=counts();
 const response=await api('POST',publicPath,old.request,{publicRequest:true});assert.deepEqual(response,old.response,'historical public receipt changed');
 assert.deepEqual(receipt(old.request.requestId),old.row,'historical durable receipt changed');assert.deepEqual(storedQuote(old.row),old.quote,'historical quote changed');
 assert.deepEqual(counts(),before,'replay duplicated rows');current.originalRequestId=old.request.requestId;
}

try{
 assert.deepEqual([...CASES.map(r=>r.type),...A3_COVERED].sort(),[...SERVICE_TYPES].sort());
 app=await application(t);
 syntheticStart=Date.parse(app.provider().now);wallStart=Date.now();
 const initial=await api('GET','/api/pricebook/'+owner);
 const services=CASES.map(({type})=>{const fixture=f.get(type),service=clone(fixture.ownerPricing);for(const key of ['origin','quoteDoneApproval','startingValueState','startingValueAdoptions','dependentLineState'])delete service[key];service.service='[SYNTHETIC PUBLIC INTAKE] '+type;service.validationInputs=clone(fixture.customerInputs);service.tiers=[];return service;});
 const converted=convertApplicationBook({services,defaults:{...f.get('CUSTOM').businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
 await api('POST','/api/pricebook/save',{...initial,services:converted.services,defaults:converted.defaults});
 let saved=await api('GET','/api/pricebook/'+owner);
 for(let pass=0;pass<3;pass++){
  if(!saved.services.some(s=>Object.keys(s.startingValueState||{}).length||Object.keys(s.dependentLineState||{}).some(id=>!s.dependentLineState[id]?.confirmed||!s.dependentLineState[id]?.reentered)))break;
  for(const s of saved.services){const start=Object.keys(s.startingValueState||{}),dep=Object.keys(s.dependentLineState||{});if(start.length)s.startingValueActions={confirmPaths:start};if(dep.length)s.dependentLineActions={reenteredIds:dep,confirmIds:dep};}
  await api('POST','/api/pricebook/save',saved);saved=await api('GET','/api/pricebook/'+owner);
 }
 for(const {type} of CASES){saved=await api('GET','/api/pricebook/'+owner);const service=saved.services.find(s=>s.serviceType===type),validation=await api('POST','/api/pricebook/validate',saved),status=validation.statuses.find(s=>s.serviceId===service.id);assert.ok(status);await api('POST','/api/pricebook/services/'+service.id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});}
 initialApprovedBook=await api('GET','/api/pricebook/'+owner);write('approved-book.json',initialApprovedBook);
 const access=await api('POST','/api/quotedone/access',{allowedOrigins:[app.base]});publicPath='/api/public/quote/'+access.publicKey;
 const catalog=await api('GET',publicPath,undefined,{publicRequest:true});write('catalog.json',catalog);byType=new Map(catalog.services.map(s=>[s.serviceType,s]));cacheKey='quotedone-pending-'+access.publicKey;
 const require=createRequire(import.meta.url),{chromium}=require(process.env.PUBLIC_INTAKE_PLAYWRIGHT_MODULE||'playwright');
 const executablePath=process.env.PUBLIC_INTAKE_BROWSER_EXECUTABLE||process.env.PRICEBOOK_BROWSER_EXECUTABLE||undefined;
 browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);
 await page.route(app.base+'/api/public/quote/**',async route=>{await pace();await route.continue();});
 const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 const built=await build({absWorkingDir:root,bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':JSON.stringify('production'),'import.meta.env':JSON.stringify({})},stdin:{loader:'jsx',resolveDir:root,contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {CustomerQuote} from './client/src/quotedone.jsx';createRoot(document.getElementById('root')).render(<CustomerQuote publicKey={new URLSearchParams(location.search).get('publicKey')} persistResult/>);`}});
 const script=built.outputFiles[0].text,url=app.base+'/qe-agent1-remaining-widget';
 await page.route(url+'*',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+script.replaceAll('</script','<\\/script')+'</script>'}));
 await page.goto(url+'?publicKey='+encodeURIComponent(access.publicKey),{waitUntil:'networkidle'});
 write('source-binding.json',{head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,browser:await browser.version(),executablePath:executablePath||'playwright default',fixtureAuthority:'A3 approved 1f8b1a20e1b910c7787a05dd820814894b01a961',publicOrigin:app.base,liveProviders:false});
 for(const row of CASES){const {type}=row,base=f.get(type).customerInputs;
  await check(type,'valid',async()=>{await restore(type);const p=await prepare();await final(type,p,base,row.cents,{original:true});});
  await check(type,'correction',async()=>{await restore(type,type==='CUSTOM'?invalid(row,base):base);if(type==='CUSTOM'){await prepare('needs_details');await changeDetails();}await field(type,row.field,row.value);const p=await prepare();await final(type,p,corrected(row,base),row.correctedCents);});
  await check(type,'invalid-and-recovery',async()=>{await restore(type);const invalidInputs=invalid(row,base),key=type==='LANDSCAPING_CLEANUP'?'yardSqft':type==='LANDSCAPING_SOD'?'sodSqft':row.field;await field(type,key,invalidInputs[key]);await prepare('needs_details');await changeDetails();await field(type,key,base[key]);const p=await prepare();await final(type,p,base,row.cents);});
  await check(type,'stale-scope-proof',async()=>{const original=body(type),before=counts(),p=await api('POST',publicPath+'/prepare',original,{publicRequest:true});assert.equal(p.status,'ready');pendingProofs.set(type,{...original,intakeConfirmation:p.confirmation});const stale={...original,customerInputs:type==='CUSTOM'?invalid(row,base):corrected(row,base),intakeConfirmation:p.confirmation};await api('POST',publicPath,stale,{status:409,publicRequest:true});assert.deepEqual(counts(),before);assert.equal(receipt(original.requestId),undefined);});
  await check(type,'original-replay-after-correction',()=>replay(type));
 }
 await check('FENCING_REPLACEMENT','removal-off-dependency',async()=>{await restore('FENCING_REPLACEMENT');await field('FENCING_REPLACEMENT','oldFenceRemoval',false);const p=await prepare(null);assert.equal(Object.hasOwn(p.request.customerInputs,'removalLengthLF'),false,'hidden old-fence length retained after removal was deselected');assert.equal(p.response.status,'ready');const c=clone(f.get('FENCING_REPLACEMENT').customerInputs);c.oldFenceRemoval=false;delete c.removalLengthLF;await final('FENCING_REPLACEMENT',p,c,450000);});
 await check('FLAT_ROOF_REPLACEMENT','partial-to-full-dependency',async()=>{await restore('FLAT_ROOF_REPLACEMENT',{...f.get('FLAT_ROOF_REPLACEMENT').customerInputs,serviceScope:'partial',partialAreaSqft:500});await field('FLAT_ROOF_REPLACEMENT','serviceScope','full');const p=await prepare(null);for(const key of ['partialAreaSqft','partialPercent'])assert.equal(Object.hasOwn(p.request.customerInputs,key),false,'hidden partial scope retained: '+key);assert.equal(p.response.status,'ready');await final('FLAT_ROOF_REPLACEMENT',p,f.get('FLAT_ROOF_REPLACEMENT').customerInputs,1805000);});
 await check('CONCRETE_PATIO_SLAB','measurement-method-correction',async()=>{await restore('CONCRETE_PATIO_SLAB');await field('CONCRETE_PATIO_SLAB','dimensionMethod','measured_area_perimeter');await field('CONCRETE_PATIO_SLAB','areaSqft',200);await field('CONCRETE_PATIO_SLAB','perimeterLF',60);const p=await prepare(),c={...f.get('CONCRETE_PATIO_SLAB').customerInputs,dimensionMethod:'measured_area_perimeter',areaSqft:200,perimeterLF:60};delete c.length;delete c.width;await final('CONCRETE_PATIO_SLAB',p,c,353889);});
 await check('FLOORING_INSTALL','selected-unpriced-removal',async()=>{const c={...f.get('FLOORING_INSTALL').customerInputs,removalNeeded:true,existingFloorType:'vinyl',removalAreaSqft:100,confirmedFacts:{existingFloorType:{status:'identified',field:'existingFloorType',value:'vinyl',offeringId:f.get('FLOORING_INSTALL').ownerPricing.knownOfferings.existingFloorType.vinyl}}},before=counts(),p=await api('POST',publicPath+'/prepare',body('FLOORING_INSTALL',c),{publicRequest:true});assert.equal(p.status,'needs_details');assert.deepEqual(counts(),before);});
 write('original-receipts.json',Object.fromEntries(history));
 const edited=await api('GET','/api/pricebook/'+owner);
 for(const row of CASES){let price=edited.services.find(s=>s.serviceType===row.type).pricing;const keys=row.pricePath.split('.'),leaf=keys.pop();for(const key of keys)price=price[key];assert.equal(typeof price[leaf],'number');price[leaf]+=1;}
 await api('POST','/api/pricebook/save',edited);const changedBook=await api('GET','/api/pricebook/'+owner);write('price-edited-book.json',changedBook);
 const changedCatalog=await api('GET',publicPath,undefined,{publicRequest:true});write('stale-catalog.json',changedCatalog);
 for(const {type} of CASES)await check(type,'book-stale-proof-and-original-replay',async()=>{assert.equal(changedCatalog.services.some(s=>s.serviceType===type),false,'price save silently retained live approval');const before=counts(),proof=pendingProofs.get(type);assert.ok(proof);await api('POST',publicPath,proof,{status:409,publicRequest:true});assert.deepEqual(counts(),before);await replay(type);});
 await app.restartApplication();
 for(const {type} of CASES)await check(type,'original-replay-after-restart',()=>replay(type));
 assert.deepEqual(pageErrors,[],'uncaught browser errors');
 const failed=results.filter(r=>r.status!=='passed');write('result.json',{status:failed.length?'failed':'passed',serviceCount:CASES.length,caseCount:results.length,passed:results.length-failed.length,failed:failed.length,pageErrors});
 write('coverage.json',{a3BrowserCovered:A3_COVERED,a1Reviewed:CASES.map(r=>r.type),registered:SERVICE_TYPES,untestedServices:SERVICE_TYPES.filter(type=>![...A3_COVERED,...CASES.map(r=>r.type)].includes(type)),stages:Object.fromEntries(CASES.map(r=>[r.type,results.filter(x=>x.type===r.type).map(x=>({stage:x.stage,status:x.status}))]))});
 if(failed.length)process.exitCode=1;
}catch(error){write('fatal.json',{message:error.message,stack:error.stack});write('result.json',{status:'fatal',caseCount:results.length,error:error.stack});console.error(error.stack);process.exitCode=1;}
finally{write('http.json',http);write('results.json',results);try{await browser?.close();}catch(error){console.error(error);process.exitCode=1;}for(const fn of cleanup)try{await fn();}catch(error){console.error(error);process.exitCode=1;}}
