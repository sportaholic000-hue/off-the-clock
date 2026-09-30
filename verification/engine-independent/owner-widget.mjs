import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import http from 'node:http';import crypto from 'node:crypto';import {createRequire} from 'node:module';
import {startApplication,quoteReceiptResponse} from '../../client/test/widget-application-harness.mjs';
import {convertApplicationBook} from '../../server/src/quoteDoneBridge.js';
import {custom,mowing,flooring} from './fixtures.mjs';
const root=path.resolve(process.argv[2]),evidence=path.resolve(process.argv[3]),site='http://127.0.0.1:4682';
const app=await startApplication(root,evidence,{port:4681,browserOrigins:[site]});
const require=createRequire(path.join(root,'package.json')),Database=require('better-sqlite3'),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const rows=[],errors=[];let server,browser,page,db;
try{
 const owner=await app.owner('custom-owner-widget'),call=async(method,url,body)=>{const r=await app.request(method,url,body,owner.token);assert.equal(r.status,200,JSON.stringify(r));return r.result;};
 const c=custom(),m=mowing(),f=flooring('tile',300);m.customerInputs.bagClippings=true;
 const samples=[{id:'fixed',fixture:c,expected:125},{id:'optional-bagging',fixture:m,expected:100},{id:'floor-boundary',fixture:f,expected:2580}];
 let book=await call('GET','/api/pricebook/'+owner.id);
 const b=convertApplicationBook({services:samples.map(s=>s.fixture.ownerPricing),defaults:c.businessDefaults},'toDollars');
 for(const service of b.services){delete service.origin;delete service.confirmedFields;delete service.approvedValues;}
 delete b.services[0].pricing.customChargeClassification;
 book.services=b.services;book.defaults=b.defaults;await call('POST','/api/pricebook/save',book);book=await call('GET','/api/pricebook/'+owner.id);
 for(const s of book.services.slice(1)){await call('POST','/api/pricebook/services/'+s.id+'/approve',{revision:book.revision,confirmConfiguration:true});book=await call('GET','/api/pricebook/'+owner.id);}
 const access=await call('POST','/api/quotedone/access',{allowedOrigins:[site]}),url='/api/public/quote/'+access.publicKey;
 const dist=path.join(root,'client/dist');server=http.createServer((req,res)=>{
  if(req.url==='/synthetic-host.html'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><html><head><title>[SYNTHETIC] Widget</title><script src="/widget.js" data-key="'+access.publicKey+'"></script></head><body><h1>[SYNTHETIC] Business website</h1></body></html>');return;}
  if(req.url.startsWith('/api/')){const proxy=http.request(app.base+req.url,{method:req.method,headers:{...req.headers,host:new URL(app.base).host}},up=>{res.writeHead(up.statusCode,up.headers);up.pipe(res);});proxy.on('error',e=>{res.writeHead(502);res.end(e.message);});req.pipe(proxy);return;}
  if(req.url==='/favicon.ico'){res.writeHead(204);res.end();return;}
  const requested=path.resolve(dist,'.'+new URL(req.url,site).pathname),file=requested.startsWith(dist+path.sep)&&fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');
  res.writeHead(200,{'content-type':({'.js':'text/javascript','.css':'text/css','.html':'text/html'}[path.extname(file)]||'application/octet-stream')});fs.createReadStream(file).pipe(res);
 });await new Promise(resolve=>server.listen(4682,'127.0.0.1',resolve));
 browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});db=new Database(path.join(evidence,'application.sqlite'));
 async function makePage(){const p=await browser.newPage({viewport:{width:1360,height:1000}});p.setDefaultTimeout(60000);p.setDefaultNavigationTimeout(90000);p.on('pageerror',e=>errors.push(String(e.stack)));return p;}
 page=await makePage();await page.addInitScript(token=>localStorage.setItem('otc_token',token),owner.token);await page.goto(site+'/pricebook');
 await page.locator('.service-pick').filter({hasText:c.ownerPricing.service}).click();
 const ownerField=label=>page.locator('.owner-field').filter({has:page.getByText(label,{exact:true})});
 await ownerField('Fixed customer price per configured unit').locator('input').fill('125');
 await ownerField('Custom service charge category').locator('select').selectOption('labor');
 const saved=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await saved).status(),200);
 await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await page.getByRole('checkbox',{name:'I confirm these exact saved prices, units, factors and rules.',exact:true}).check();
 const approved=page.waitForResponse(r=>r.url().endsWith('/services/'+c.ownerPricing.id+'/approve'));await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();assert.equal((await approved).status(),200);
 const preview=page.getByRole('heading',{name:'Project measurements for preview',exact:true}).locator('..');
 const previewReady=page.waitForResponse(async r=>{if(!r.url().endsWith('/api/pricebook/preview')||r.request().method()!=='POST')return false;const body=await r.json();return body.resultType==='INSTANT_ESTIMATE_READY'&&body.midEstimate===125;});
 await preview.getByLabel('Confirmed custom service',{exact:true}).fill(c.ownerPricing.service);await preview.getByLabel('Customer confirmed the matched service',{exact:true}).selectOption('true');await preview.getByLabel('Customer quantity unit',{exact:true}).selectOption('flat');
 rows.push({name:'Owner edits, saves, approves and previews fixed service',result:await(await previewReady).json()});
 await page.reload();await ownerField('Custom service charge category').locator('select').waitFor();assert.equal(await ownerField('Custom service charge category').locator('select').inputValue(),'labor');
 book=await call('GET','/api/pricebook/'+owner.id);const stored=book.services.find(s=>s.id===c.ownerPricing.id);assert.equal(stored.pricing.customChargeClassification,'labor');assert.equal(stored.pricing.price,125);fs.writeFileSync(path.join(evidence,'saved-owner-book.json'),JSON.stringify(book,null,2));
 await page.screenshot({path:path.join(evidence,'owner-fixed.png'),fullPage:true});
 if(process.argv[4]==='fractional'){
  await ownerField('How this custom service is priced').locator('select').selectOption('per_sqft');
  const rate=ownerField('Fixed customer price per configured unit').locator('input');await rate.fill('0.005');
  const state={value:await rate.inputValue(),invalid:await rate.getAttribute('aria-invalid'),text:await ownerField('Fixed customer price per configured unit').innerText()};fs.writeFileSync(path.join(evidence,'fractional-editor-state.json'),JSON.stringify(state,null,2));
  assert.equal(state.invalid,'false','Configured per-square-foot unit rate must retain 0.005 dollars, not reject it as a fixed charge.');
  const saveRate=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await saveRate).status(),200);
  await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await page.getByRole('checkbox',{name:'I confirm these exact saved prices, units, factors and rules.',exact:true}).check();const approveRate=page.waitForResponse(r=>r.url().endsWith('/services/'+c.ownerPricing.id+'/approve'));await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();assert.equal((await approveRate).status(),200);
  const fractionalPreview=page.waitForResponse(async r=>{if(!r.url().endsWith('/api/pricebook/preview')||r.request().method()!=='POST')return false;const body=await r.json();return body.resultType==='INSTANT_ESTIMATE_READY'&&body.midEstimate===5;});
  await preview.getByLabel('Confirmed custom service',{exact:true}).fill(c.ownerPricing.service);await preview.getByLabel('Customer confirmed the matched service',{exact:true}).selectOption('true');await preview.getByLabel('Customer quantity unit',{exact:true}).selectOption('per_sqft');await preview.getByLabel('Measured service area',{exact:true}).fill('1000');rows.push({name:'Owner enters, saves, approves and previews fractional unit rate',result:await(await fractionalPreview).json()});
  const finalBook=await call('GET','/api/pricebook/'+owner.id);assert.equal(finalBook.services.find(s=>s.id===c.ownerPricing.id).pricing.price,0.005);fs.writeFileSync(path.join(evidence,'saved-fractional-book.json'),JSON.stringify(finalBook,null,2));
 }
 await page.close();
 const catalog=await app.request('GET',url,undefined,null,{Origin:site});assert.equal(catalog.status,200);
 for(const sample of (process.argv[4]==='fractional'?[]:samples)){
  page=await makePage();await page.goto(site+'/synthetic-host.html');await page.getByRole('button',{name:'Get an estimate',exact:true}).click();await page.getByLabel('Service',{exact:true}).selectOption(sample.fixture.ownerPricing.id);await page.getByRole('button',{name:'Continue',exact:true}).click();
  const def=catalog.result.services.find(s=>s.id===sample.fixture.ownerPricing.id);assert.ok(def);
  for(const field of def.customerFields.filter(f=>f.type!=='confirmed_facts')){
   const value=sample.fixture.customerInputs[field.name];if(value!==undefined){const input=page.getByLabel(field.label,{exact:true});if(['enum','boolean','integer_or_unknown'].includes(field.type))await input.selectOption(String(value));else await input.fill(String(value));}
   await page.getByRole('button',{name:'Continue',exact:true}).click();
  }
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill('synthetic-widget@example.invalid');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Urgency',{exact:true}).selectOption('flexible');
  const prep=page.waitForResponse(r=>r.url().endsWith(url+'/prepare'));await page.getByRole('button',{name:'Submit estimate request',exact:true}).click();assert.equal((await prep).status(),200);await page.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
  const resultWaiting=page.waitForResponse(r=>r.url().endsWith(url)&&r.request().method()==='POST');await page.getByRole('button',{name:'Get estimate',exact:true}).click();const response=await resultWaiting,result=await response.json(),submission=response.request().postDataJSON();assert.equal(response.status(),201,JSON.stringify(result));assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(result.midEstimate,sample.expected);assert.equal(result.lineItems,undefined);
  if(sample.id==='optional-bagging')assert.ok(result.options[0].disclaimer.includes('Clipping bagging and disposal'));
  const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner.id,submission.requestId);assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),submission);assert.deepEqual(quoteReceiptResponse(app,receipt),result);
  rows.push({name:'Production widget '+sample.id,result,submission,receipt,text:await page.locator('body').innerText()});await page.screenshot({path:path.join(evidence,'widget-'+sample.id+'.png'),fullPage:true});await page.close();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:rows.length}));
}catch(error){fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({error:String(error.stack),errors},null,2));if(page&&!page.isClosed()){await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.html'),await page.content().catch(()=>''));}throw error;}
finally{fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({rows,errors},null,2));await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));db?.close();await app.stop();}
