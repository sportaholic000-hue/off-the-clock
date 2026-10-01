import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import Database from 'better-sqlite3';
import {createRequire} from 'node:module';
import {startApplication,quoteReceiptResponse} from './widget-application-harness.mjs';
import {offeringApplicationFixture} from '../../verification/quotedone/offering-application-fixture.mjs';
const [rootArg,evidenceArg]=process.argv.slice(2),root=path.resolve(rootArg),evidence=path.resolve(evidenceArg),site='http://127.0.0.1:4620';
const app=await startApplication(root,evidence,{port:4622,browserOrigins:[site]});
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const rows=[],wire=[],errors=[];let browser,server,db,page;
try {
  const f=await offeringApplicationFixture(app,'offering-browser',site),meta=await f.call('GET','/api/pricebook/meta');
  const heightArg=process.argv.find(arg=>arg.startsWith('--fence-height='));
  if(heightArg){const height=Number(heightArg.split('=')[1]);assert.ok(Number.isFinite(height)&&height>0);for(const entry of f.cases)if(entry.type.startsWith('FENCING_')){entry.service.pricing.offeringDetails.fenceHeight=height;entry.inputs.fenceHeight=height;}}
  // Owner configures each offering through the UI from a saved blank price entry.
  const blank=await f.call('GET','/api/pricebook/'+f.owner.id);for(const service of blank.services)service.pricing={minimumJob:0};await f.call('POST','/api/pricebook/save',blank);
  const dist=path.join(root,'client/dist');
  server=http.createServer(async(req,res)=>{
    try {
      const url=new URL(req.url,site);
      if(url.pathname==='/synthetic-host.html'){res.setHeader('content-type','text/html');res.end('<!doctype html><html><head><title>[SYNTHETIC] Widget test</title><script src="/widget.js" data-key="'+f.access.publicKey+'"></script></head><body><h1>[SYNTHETIC] Customer website</h1></body></html>');return;}
      if(url.pathname.startsWith('/api/')){
        const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks),headers={};
        for(const name of ['origin','content-type','authorization','referer','sec-fetch-site','idempotency-key'])if(req.headers[name])headers[name]=req.headers[name];
        const response=await fetch(app.base+req.url,{method:req.method,headers,redirect:'manual',...(!['GET','HEAD'].includes(req.method)&&body.length?{body}:{})});const reply=await response.text();let json;try{json=JSON.parse(reply);}catch{json={text:reply};}
        wire.push({method:req.method,path:req.url,authenticated:!!headers.authorization,body:body.length?JSON.parse(body):null,status:response.status,response:json});res.statusCode=response.status;response.headers.forEach((value,key)=>{if(!['content-length','connection','transfer-encoding','content-encoding'].includes(key))res.setHeader(key,value);});res.end(reply);return;
      }
      const file=path.resolve(dist,!path.extname(url.pathname)?'index.html':'.'+url.pathname);if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
      res.setHeader('content-type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.setHeader('cache-control','no-store');res.end(fs.readFileSync(file));
    }catch(error){res.writeHead(500,{'content-type':'text/plain'}).end(String(error));}
  });
  await new Promise(resolve=>server.listen(4620,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE,timeout:180000});db=new Database(path.join(evidence,'application.sqlite'));
  const makePage=async()=>{const p=await browser.newPage({viewport:{width:1360,height:960}});p.setDefaultTimeout(45000);p.on('pageerror',error=>errors.push(String(error.stack)));return p;};
  page=await makePage();await page.addInitScript(token=>localStorage.setItem('otc_token',token),f.owner.token);await page.goto(site+'/pricebook');
  async function answer(container,field,value){
    if(value===undefined||field.type==='confirmed_facts')return;
    if(field.type==='offering_counts'){for(const [key,count] of Object.entries(value))await container.getByLabel('Gate count '+key,{exact:true}).fill(String(count));if(!Object.keys(value).length)await container.getByRole('button',{name:'No gates',exact:true}).click();return;}
    const input=container.getByLabel(field.label,{exact:true});
    if(['enum','boolean','integer_or_unknown'].includes(field.type))await input.selectOption(String(value));else await input.fill(String(value));
    if(field.type==='slug')await container.getByRole('checkbox',{name:'I have identified this exact offering.',exact:true}).check();
  }
  const labels={description:'Included job description',fenceType:'Offered fence type',fenceHeight:'Offered fence height (ft)',terrainSlope:'Offered terrain',postFootingDescription:'Standard posts, footings and digging included',removalOffered:'Offer fence removal',removalDescription:'Removal work included',removalIncludesDisposal:'Removal price includes disposal',substrate:'Paintable surface covered',coating:'Coating and product system',finishCoats:'Wall finish coats',surfaceCondition:'Surface condition covered',preparation:'Preparation work included or measured separately',primerCoats:'Wall primer coats included',wallHeight:'Wall height covered',ceilingsOffered:'Offer ceiling painting',trimOffered:'Offer trim painting',ceilingCoats:'Ceiling finish coats',ceilingPrimerCoats:'Ceiling primer coats',trimDescription:'Trim coats, preparation and primer included',stories:'Building stories covered'};
  async function checkPendingReload(name,action){
    let release,arrive,finish,routeError;const pending=new Promise(resolve=>{release=resolve}),arrived=new Promise(resolve=>{arrive=resolve}),handled=new Promise(resolve=>{finish=resolve}),url=site+'/api/pricebook/'+f.owner.id;
    await page.route(url,async route=>{try{const response=await route.fetch();arrive();await pending;await route.fulfill({response});}catch(error){routeError=error;arrive();}finally{finish();}});
    try {await action();await arrived;assert.equal(await page.getByLabel('Offering price installedFencePerLF',{exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Measured fence length excluding gate openings',{exact:true}).isDisabled(),true);rows.push({name,passed:true});}
    finally {release();await handled;await page.unroute(url);if(routeError)throw routeError;}
  }
  async function openSection(title){const button=page.locator('button.disclose-summary').filter({hasText:title});if(await button.getAttribute('aria-expanded')!=='true')await button.click();}
  for(const entry of f.cases){
    await page.locator('.service-pick').filter({hasText:entry.name}).click();await page.getByLabel('Offering pricing',{exact:true}).selectOption(entry.mode);
    for(const [key,value] of Object.entries(entry.service.pricing.offeringDetails)){
      if(key==='gates'){
        for(const [gateName,gate] of Object.entries(value)){await page.getByLabel('New gate name',{exact:true}).fill(gateName);await page.getByRole('button',{name:'Add gate offering',exact:true}).click();await page.getByLabel('Gate opening width '+gateName,{exact:true}).fill(String(gate.widthLF));await page.getByLabel('Gate description '+gateName,{exact:true}).fill(gate.description);await page.getByLabel('Gate posts included '+gateName,{exact:true}).selectOption(String(gate.postsAndFootingsIncluded));}continue;
      }
      const input=page.getByLabel(labels[key],{exact:true}),tag=await input.evaluate(el=>el.tagName);if(tag==='SELECT')await input.selectOption(String(value));else await input.fill(String(value));
    }
    for(const [key,value] of Object.entries(entry.service.pricing.offeringRates))await page.getByLabel('Offering price '+key,{exact:true}).fill(String(value));
    await openSection('Project measurements for preview');
    const save=async()=>{const saved=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await saved).status(),200);};
    if(entry===f.cases[0])await checkPendingReload('Save refresh prevents edits until saved prices reload',save);else await save();
    await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await page.getByRole('checkbox',{name:'I confirm these exact saved prices, units, factors and rules.',exact:true}).check();
    const approve=async()=>{const approved=page.waitForResponse(r=>r.url().endsWith('/services/'+entry.id+'/approve'));await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();assert.equal((await approved).status(),200);};
    if(entry===f.cases[0])await checkPendingReload('Approval refresh prevents lost measurements and prices',approve);else await approve();
    await openSection('Project measurements for preview');
    const previewSection=page.getByRole('heading',{name:'Project measurements for preview',exact:true}).locator('..');
    const previewWaiting=page.waitForResponse(async r=>{if(!r.url().endsWith('/api/pricebook/preview')||r.status()!==200||r.request().postDataJSON().serviceId!==entry.id)return false;const result=await r.json();return result.resultType==='INSTANT_ESTIMATE_READY'&&result.midEstimate===entry.expected;});
    const fields=meta.services.find(s=>s.serviceType===entry.type).offeringCustomerFields[entry.mode];for(const field of fields)await answer(previewSection,field,entry.inputs[field.name]);
    const previewResponse=await previewWaiting;
    rows.push({name:'Owner configured, saved, approved and previewed '+entry.name,response:await previewResponse.json()});
    console.log(JSON.stringify({completed:rows.at(-1).name}));
  }
  // Save measured preview drafts once, then prove definitions survive reload.
  const finalSave=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save'));await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await finalSave).status(),200);await page.reload();await page.getByLabel('Offering pricing',{exact:true}).waitFor();
  const reloaded=await f.call('GET','/api/pricebook/'+f.owner.id);for(const entry of f.cases){const stored=reloaded.services.find(s=>s.id===entry.id);assert.deepEqual(stored.pricing.offeringDetails,entry.service.pricing.offeringDetails);assert.deepEqual(stored.pricing.offeringRates,entry.service.pricing.offeringRates);}
  fs.writeFileSync(path.join(evidence,'saved-book.json'),JSON.stringify(reloaded,null,2));await page.screenshot({path:path.join(evidence,'owner-offerings.png'),fullPage:true});await page.close();
  const catalog=await app.request('GET',f.url,undefined,undefined,f.headers);assert.equal(catalog.result.services.length,8,JSON.stringify(catalog));
  for(const kind of ['full-page','widget'])for(const entry of f.cases){
    page=await makePage();await page.goto(site+(kind==='widget'?'/synthetic-host.html':'/quote/'+f.access.publicKey));if(kind==='widget')await page.getByRole('button',{name:'Get an estimate',exact:true}).click();
    await page.getByLabel('Service',{exact:true}).selectOption(entry.id);await page.getByText('What this offering covers',{exact:true}).waitFor();
    const fields=catalog.result.services.find(s=>s.id===entry.id).customerFields.filter(field=>field.type!=='confirmed_facts');
    if(kind==='widget')await page.getByRole('button',{name:'Continue',exact:true}).click();
    for(const field of fields){await answer(page,field,entry.inputs[field.name]);if(kind==='widget')await page.getByRole('button',{name:'Continue',exact:true}).click();}
    if(kind==='widget'){await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();}
    await page.getByLabel('Email',{exact:true}).fill('synthetic-browser@example.invalid');if(kind==='widget')await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Urgency',{exact:true}).selectOption('flexible');
    const prepared=page.waitForResponse(r=>r.url().endsWith(f.url+'/prepare'));await page.getByRole('button',{name:'Submit estimate request',exact:true}).click();assert.equal((await prepared).status(),200);await page.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
    const completed=page.waitForResponse(r=>r.url().endsWith(f.url)&&r.request().method()==='POST');await page.getByRole('button',{name:'Get estimate',exact:true}).click();const response=await completed,result=await response.json(),body=response.request().postDataJSON();assert.equal(response.status(),201,JSON.stringify(result));assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(result.midEstimate,entry.expected);assert.equal(result.lineItems,undefined);
    const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);assert.deepEqual(quoteReceiptResponse(app,receipt),result);
    assert.equal(result.pricedScope.facts.some(fact=>fact.label==='Affirmatively identified owner offerings'),false);
    if(entry.type.startsWith('FENCING_')){assert.ok(body.customerInputs.confirmedFacts.fenceType.offeringId);assert.ok(result.pricedScope.facts.find(fact=>fact.label==='Gates by measured opening width').value.includes('2 × walk'))}
    rows.push({name:kind+' quotes '+entry.name,body,result,receipt});if(entry.type==='FENCING_INSTALL'&&entry.mode==='installed')await page.screenshot({path:path.join(evidence,kind+'-fence.png'),fullPage:true});if(entry.type==='EXTERIOR_PAINTING'&&entry.mode==='itemized')await page.screenshot({path:path.join(evidence,kind+'-paint.png'),fullPage:true});await page.close();
  }
  assert.deepEqual(errors,[]);assert.equal(db.prepare('SELECT COUNT(*) n FROM quotes WHERE ownerId=?').get(f.owner.id).n,16);console.log(JSON.stringify({passed:true,checks:rows.length}));
}catch(error){fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({rows,error:String(error.stack),errors},null,2));if(page&&!page.isClosed()){await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.html'),await page.content().catch(()=>''));}throw error;}
finally {fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({rows,errors},null,2));fs.writeFileSync(path.join(evidence,'browser-http.json'),JSON.stringify(wire,null,2));await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));db?.close();await app.stop();}
