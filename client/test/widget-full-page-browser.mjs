// Original accepted seven full-page/owner cases, using the bounded widget harness. Expected results unchanged.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {startApplication,quoteReceiptResponse} from './widget-application-harness.mjs';
import {mowingFixture} from '../../verification/quotedone/repair-fixture.mjs';
import {catalogMode} from '../src/widgetTransport.js';
const [root,evidence]=process.argv.slice(2).map(value=>path.resolve(value)),app=await startApplication(root,evidence,{port:4535});
fs.copyFileSync(fileURLToPath(import.meta.url),path.join(evidence,'executed-full-page-browser.mjs'));
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE),Database=require('better-sqlite3');
const ui='http://127.0.0.1:4536',rows=[],wire=[],logs=[];let browser,vite,db;
try{
 const f=await mowingFixture(app,'partial-browser',[ui]);db=new Database(path.join(evidence,'application.sqlite'));
 const book=await f.read();book.services[0].pricing.edgingPerLinearFoot=2;await f.call('POST','/api/pricebook/save',book);await f.approve();
 const publicCatalog=await app.request('GET',f.url,undefined,undefined,f.headers);assert.equal(publicCatalog.status,200);const liveMode=catalogMode(publicCatalog.result);
 vite=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','4536','--strictPort'],{cwd:path.join(root,'client'),env:{...app.env,VITE_API_URL:app.base},windowsHide:true,stdio:['ignore','pipe','pipe']});
 vite.stdout.on('data',data=>logs.push(String(data)));vite.stderr.on('data',data=>logs.push(String(data)));
 let live=false;for(let i=0;i<1200;i++){if(vite.exitCode!==null)throw Error(logs.join(''));try{if((await fetch(ui)).ok){live=true;break;}}catch{}await delay(100);}assert.ok(live);
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:300000});
 const meta=f.meta.services.find(service=>service.serviceType==='LANDSCAPING_MOWING'),areaLabel=meta.customerFields.find(field=>field.name==='yardSqft').label;
 async function page(){const p=await browser.newPage({viewport:{width:1440,height:1450}});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(120000);p.on('pageerror',error=>logs.push('PAGE ERROR '+error.stack));return p;}
 async function fill(p,changes={},inputChanges={}){
  await p.goto(ui+'/quote/'+f.access.publicKey);await p.getByLabel('Service',{exact:true}).selectOption(f.id);
  for(const [key,value]of Object.entries({...f.inputs,...inputChanges})){const field=meta.customerFields.find(item=>item.name===key);if(field.type==='number')await p.getByLabel(field.label,{exact:true}).fill(String(value));else await p.getByLabel(field.label,{exact:true}).selectOption(String(value));}
  const contactFields=liveMode==='legacy'?{Name:'[SYNTHETIC] Alex Smith',Email:'synthetic@example.invalid','Project location':'[SYNTHETIC] 123 Example Street'}:{Email:'synthetic@example.invalid'};
  for(const [label,value]of Object.entries({...contactFields,...changes}))await p.getByLabel(label,{exact:true}).fill(value);
  await p.getByLabel('Urgency',{exact:true}).selectOption('flexible');
 }
 async function prepare(p,button='Submit estimate request'){
  const waiting=p.waitForResponse(response=>response.url().endsWith(f.url+'/prepare')&&response.request().method()==='POST');
  await p.getByRole('button',{name:button,exact:true}).click();const response=await waiting,body=response.request().postDataJSON(),result=await response.json();
  assert.equal(response.status(),200,JSON.stringify(result));wire.push({phase:'prepare',body,result});await p.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();return {body,result};
 }
 async function finish(p,prepared){
  const waiting=p.waitForResponse(response=>response.url().endsWith(f.url)&&response.request().method()==='POST');
  await p.getByRole('button',{name:prepared.result.status==='ready'?'Get estimate':'Send request for review',exact:true}).click();const response=await waiting,body=response.request().postDataJSON(),result=await response.json();
  assert.equal(response.status(),201,JSON.stringify(result));wire.push({phase:'submit',body,result});
  const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);assert.deepEqual(quoteReceiptResponse(app,receipt),result);return {body,result,receipt};
 }
 for(const c of [
  {name:'Normal complete request',fields:{},price:50,partial:false},
  {name:'Separate hedge work',fields:{'Additional work for on-site estimate':'[SYNTHETIC] Remove the hedge by the driveway.'},price:50,partial:true},
  {name:'Configured lawn edging plus separate work',fields:{'Additional work for on-site estimate':'[SYNTHETIC] Assess the garden wall.'},inputs:{edgingIncluded:true,edgingLengthLF:10},price:70,partial:true},
  {name:'Context explicitly identifies separate work',fields:{'Additional project details':'[SYNTHETIC] Relocate the old play structure.'},answer:'additional_work',price:50,partial:true},
  {name:'Unknown main area with separate work',fields:{'Additional work for on-site estimate':'[SYNTHETIC] Remove the hedge.'},missing:true},
 ]){
  const p=await page();await fill(p,c.fields,c.inputs);if(c.missing)await p.getByLabel(areaLabel,{exact:true}).fill('');
  const initial=await prepare(p);let checked=initial;
  if(c.answer){const question=initial.result.clarification.questions.find(item=>item.field==='context');await p.getByLabel(question.text,{exact:true}).selectOption(c.answer);checked=await prepare(p,'Check answers');}
  if(c.partial){assert.equal(checked.result.status,'ready');await p.getByText('Additional work for on-site estimate',{exact:true}).waitFor();await p.reload();await p.getByRole('button',{name:'Get estimate',exact:true}).waitFor();}
  const saved=await finish(p,checked);
  if(c.missing){assert.equal(saved.result.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(saved.result.pricedEstimate,undefined);assert.equal(await p.getByText('$50',{exact:true}).count(),0);}
  else if(c.partial){
   assert.equal(saved.result.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(saved.result.pricedEstimate.midEstimate,c.price);assert.equal(saved.result.midEstimate,undefined);assert.equal(saved.result.fullJobTotal,null);
   await p.getByRole('heading',{name:'Estimate for selected work',exact:true}).waitFor();await p.getByText('$'+c.price,{exact:true}).waitFor();await p.getByText('Total for all requested work: not yet available.',{exact:true}).waitFor();
   for(const item of saved.result.additionalWork)assert.ok((await p.locator('main').innerText()).includes(item.description));
   const lead=db.prepare('SELECT * FROM leads WHERE ownerId=? AND id=?').get(f.owner.id,saved.receipt.recordId),quote=db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=?').get(f.owner.id,saved.receipt.recordId);assert.equal(lead.type,'additional_work');assert.equal(quote.status,'PARTIAL');saved.lead=lead;saved.quote=quote;
  }else {assert.equal(saved.result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(saved.result.midEstimate,50);await p.getByRole('heading',{name:'Estimate',exact:true}).waitFor();}
  await p.screenshot({path:path.join(evidence,c.name.toLowerCase().replaceAll(' ','-')+'.png'),fullPage:true});rows.push({name:c.name,initial,checked,saved,passed:true});await p.close();
 }
 // Lost acknowledgement: the real server commits, the first response is lost,
 // then the ordinary retry button sends the same body and receives that receipt.
 const retryPage=await page();await fill(retryPage,{'Additional work for on-site estimate':'[SYNTHETIC] Inspect the retaining wall.'});const pending=await prepare(retryPage);let committed;
 await retryPage.route(app.base+f.url,async route=>{const response=await route.fetch();committed={body:route.request().postDataJSON(),status:response.status(),result:await response.json()};await route.abort('failed');});
 const before=db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n;
 await retryPage.getByRole('button',{name:'Get estimate',exact:true}).click();await retryPage.getByRole('button',{name:'Retry saved request',exact:true}).waitFor();assert.equal(committed.status,201);
 await retryPage.unroute(app.base+f.url);await retryPage.reload();const retryResponse=retryPage.waitForResponse(response=>response.url().endsWith(f.url)&&response.request().method()==='POST');await retryPage.getByRole('button',{name:'Retry saved request',exact:true}).click();const received=await retryResponse;
 assert.equal(received.status(),200);assert.deepEqual(received.request().postDataJSON(),committed.body);assert.deepEqual(await received.json(),committed.result);assert.equal(db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(f.owner.id).n,before+1);await retryPage.getByText('$50',{exact:true}).waitFor();
 rows.push({name:'Lost partial-estimate acknowledgement survives reload and exact retry',pending,committed,retry:{status:received.status(),body:received.request().postDataJSON(),result:await received.json()},passed:true});await retryPage.screenshot({path:path.join(evidence,'partial-retry.png'),fullPage:true});await retryPage.close();
 const owner=await page();await owner.goto(ui+'/login');await owner.getByRole('button',{name:'Sign in',exact:true}).first().click();await owner.getByLabel('Email',{exact:true}).fill(f.owner.email);await owner.getByLabel('Password',{exact:true}).fill(f.owner.password);await owner.locator('button[type=submit]').click();await owner.waitForFunction(()=>!!localStorage.getItem('otc_token'));
 await owner.goto(ui+'/leads');await owner.getByText('[SYNTHETIC] Remove the hedge by the driveway.',{exact:true}).waitFor();assert.ok((await owner.locator('main').innerText()).includes('additional work needs its own on-site price'));await owner.getByText('[SYNTHETIC] Remove the hedge.',{exact:true}).waitFor();const reviewSection=owner.locator('section.editor-section').filter({has:owner.getByText('[SYNTHETIC] Remove the hedge.',{exact:true})});assert.equal(await reviewSection.count(),1);assert.match(await reviewSection.innerText(),/The selected job still needs review/);assert.doesNotMatch(await reviewSection.innerText(),/is saved in Quotes/);await owner.screenshot({path:path.join(evidence,'owner-additional-work-leads.png'),fullPage:true});
 await owner.goto(ui+'/quotes');await owner.getByRole('heading',{name:'Estimate for selected work',exact:true}).first().waitFor();assert.ok((await owner.locator('main').innerText()).includes('Total for all requested work: not yet available.'));await owner.screenshot({path:path.join(evidence,'owner-partial-quotes.png'),fullPage:true});rows.push({name:'Owner signs in and sees additional-work follow-ups and separately scoped quotes',passed:true});await owner.close();
 fs.writeFileSync(path.join(evidence,'result.json'),JSON.stringify({passed:true,checks:rows.length,rows,wire},null,2));console.log(JSON.stringify({passed:true,checks:rows.length}));
}catch(error){if(browser)for(const [index,p]of browser.contexts().flatMap(context=>context.pages()).entries()){await p.screenshot({path:path.join(evidence,'failure-'+index+'.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure-'+index+'.txt'),await p.locator('body').innerText().catch(()=>''));}fs.writeFileSync(path.join(evidence,'failed-results.json'),JSON.stringify({passed:false,rows,wire,error:String(error.stack)},null,2));throw error;}
finally{fs.writeFileSync(path.join(evidence,'browser.log'),logs.join('\n'));if(browser)await browser.close();if(db)db.close();if(vite&&vite.exitCode===null){const done=new Promise(resolve=>vite.once('close',resolve));vite.kill();await done;}await app.stop();}
