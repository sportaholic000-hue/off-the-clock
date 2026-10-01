import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import Database from 'better-sqlite3';
import {createRequire} from 'node:module';
import {startApplication,quoteReceiptResponse} from './widget-application-harness.mjs';
import {scopeApplicationFixture} from '../../verification/engine-independent/scope-application-fixture.mjs';
import {scopeDefinitions,scopeCustomerFields,customerFieldVisible} from '../../server/scopeConfiguration.js';
const [rootArg,evidenceArg,group]=process.argv.slice(2),root=path.resolve(rootArg),evidence=path.resolve(evidenceArg),site='http://127.0.0.1:4620';
const app=await startApplication(root,evidence,{port:4622,browserOrigins:[site]});
const require=createRequire(path.join(root,'package.json')),{chromium}=require(process.env.PRICEBOOK_BROWSER_MODULE);
const rows=[],wire=[],errors=[];let browser,server,db,page;
try {
  const f=await scopeApplicationFixture(app,'scopes-browser-'+group,site,group),meta=await f.call('GET','/api/pricebook/meta');
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
    if(field.type==='slug'&&!(field.name==='existingFloorType'&&value==='none'))await input.locator('..').getByRole('checkbox',{name:'I have identified this exact offering.',exact:true}).check();
  }
  async function openSection(title){const button=page.locator('button.disclose-summary').filter({hasText:title});if(await button.getAttribute('aria-expanded')!=='true')await button.click();}
  for(const entry of f.cases){
    await page.locator('.service-pick').filter({hasText:entry.name}).click();
    await openSection('Additional priced scope');
    const definitions=scopeDefinitions(entry.type,entry.service.pricing);
    for(const [key,d]of Object.entries(entry.service.pricing.scopeDetails)){
      const def=definitions[key];await page.getByRole('button',{name:'Configure '+def.label,exact:true}).click();
      for(const [name,value]of Object.entries(d)){const field=def.fields[name],input=page.getByLabel(def.label+' — '+field.label,{exact:true});if(['enum','boolean'].includes(field.type))await input.selectOption(String(value));else await input.fill(String(value));}
    }
    for(const [key,value]of Object.entries(entry.service.pricing.scopeRates))await page.getByLabel('Scope price '+key,{exact:true}).fill(String(value));
    if(entry.tier){
      const disclosure=page.locator('button.disclose-summary').filter({hasText:'Good / Better / Best tiers'});
      if(await disclosure.getAttribute('aria-expanded')!=='true')await disclosure.click();
      await page.getByRole('button',{name:'Add tier',exact:true}).click();
      await page.getByRole('button',{name:'Add tier',exact:true}).click();
      const tier=page.locator('.tier-row').nth(1);
      await tier.getByRole('button',{name:'Override a field',exact:true}).click();
      const selector=tier.locator('.override-row select').first();
      assert.ok((await selector.locator('option').evaluateAll(nodes=>nodes.map(n=>n.value))).includes('scopeRates'),'Owner cannot select the additional scope prices for a tier');
      await selector.selectOption('scopeRates');
      const rate=tier.getByLabel('Additional scope prices '+entry.tier.rate.replaceAll('_',' '),{exact:true});
      if(entry.tier.rate==='floor_underlayment_hardwood'){
        await rate.fill('100.001');assert.equal(await rate.getAttribute('aria-invalid'),'true','A package purchase price must reject a fractional cent');
      }
      await rate.fill(String(entry.tier.price));assert.equal(await rate.getAttribute('aria-invalid'),'false');
    }
    const save=async()=>{const saved=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await saved).status(),200);};
    await save();
    await page.getByRole('button',{name:'Review saved configuration',exact:true}).click();await page.getByRole('checkbox',{name:'I confirm these exact saved prices, units, factors and rules.',exact:true}).check();
    const approve=async()=>{const approved=page.waitForResponse(r=>r.url().endsWith('/services/'+entry.id+'/approve'));await page.getByRole('button',{name:'Confirm saved configuration',exact:true}).click();assert.equal((await approved).status(),200);};
    await approve();
    await openSection('Project measurements for preview');
    const previewSection=page.getByRole('heading',{name:'Project measurements for preview',exact:true}).locator('..');
    const previewWaiting=page.waitForResponse(async r=>{if(!r.url().endsWith('/api/pricebook/preview')||r.status()!==200||r.request().postDataJSON().serviceId!==entry.id)return false;const result=await r.json();return result.resultType==='INSTANT_ESTIMATE_READY'&&result.midEstimate===entry.expected;}).catch(error=>({testError:error}));
    const m=meta.services.find(s=>s.serviceType===entry.type),p=entry.service.pricing;const fields=[...(p.offeringMode?m.offeringCustomerFields[p.offeringMode]:m.customerFields),...Object.entries(scopeCustomerFields(entry.type,p,entry.service)).map(([name,field])=>({name,...field}))];for(const field of fields)await answer(previewSection,field,entry.inputs[field.name]);
    const previewResponse=await previewWaiting;if(previewResponse.testError)throw previewResponse.testError;
    const previewResult=await previewResponse.json();
    if(entry.tier)assert.deepEqual(previewResult.options.map(o=>[o.tierName,o.midEstimate]),[['Good',entry.expected],['Better',entry.tier.expected]]);
    rows.push({name:'Owner configured, saved, approved and previewed '+entry.name,response:previewResult});
    console.log(JSON.stringify({completed:rows.at(-1).name}));
  }
  // Save measured preview drafts once, then prove definitions survive reload.
  const finalSave=page.waitForResponse(r=>r.url().endsWith('/api/pricebook/save'));await page.getByRole('button',{name:'Save & validate',exact:true}).click();assert.equal((await finalSave).status(),200);await page.reload();await openSection('Additional priced scope');await page.getByRole('heading',{name:'Additional priced scope',exact:true}).waitFor();
  const reloaded=await f.call('GET','/api/pricebook/'+f.owner.id);for(const entry of f.cases){const stored=reloaded.services.find(s=>s.id===entry.id);assert.deepEqual(stored.pricing.scopeDetails,entry.service.pricing.scopeDetails);assert.deepEqual(stored.pricing.scopeRates,entry.service.pricing.scopeRates);}
  for(const entry of f.cases)if(entry.tier)assert.deepEqual(reloaded.services.find(s=>s.id===entry.id).tiers,[{name:'Good',overrides:{}},{name:'Better',overrides:{scopeRates:{[entry.tier.rate]:entry.tier.price}}}]);
  fs.writeFileSync(path.join(evidence,'saved-book.json'),JSON.stringify(reloaded,null,2));await page.screenshot({path:path.join(evidence,'owner-scopes.png'),fullPage:true});await page.close();
  const catalog=await app.request('GET',f.url,undefined,undefined,f.headers);assert.equal(catalog.result.services.length,f.cases.length,JSON.stringify(catalog));
  for(const kind of ['full-page','widget'])for(const entry of f.cases){
    page=await makePage();await page.goto(site+(kind==='widget'?'/synthetic-host.html':'/quote/'+f.access.publicKey));if(kind==='widget')await page.getByRole('button',{name:'Get an estimate',exact:true}).click();
    await page.getByLabel('Service',{exact:true}).selectOption(entry.id);
    const fields=catalog.result.services.find(s=>s.id===entry.id).customerFields.filter(field=>field.type!=='confirmed_facts'&&customerFieldVisible(field,entry.inputs));
    if(kind==='widget')await page.getByRole('button',{name:'Continue',exact:true}).click();
    for(const field of fields){await answer(page,field,entry.inputs[field.name]);if(kind==='widget')await page.getByRole('button',{name:'Continue',exact:true}).click();}
    if(kind==='widget'){await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();}
    await page.getByLabel('Email',{exact:true}).fill('synthetic-browser@example.invalid');if(kind==='widget')await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByLabel('Urgency',{exact:true}).selectOption('flexible');
    const prepared=page.waitForResponse(r=>r.url().endsWith(f.url+'/prepare'));await page.getByRole('button',{name:'Submit estimate request',exact:true}).click();assert.equal((await prepared).status(),200);await page.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
    const completed=page.waitForResponse(r=>r.url().endsWith(f.url)&&r.request().method()==='POST');await page.getByRole('button',{name:'Get estimate',exact:true}).click();const response=await completed,result=await response.json(),body=response.request().postDataJSON();assert.equal(response.status(),201,JSON.stringify(result));assert.equal(result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(result.midEstimate,entry.expected);assert.equal(result.lineItems,undefined);
    if(entry.tier)assert.deepEqual(result.options.map(o=>[o.tierName,o.midEstimate]),[['Good',entry.expected],['Better',entry.tier.expected]]);
    const receipt=db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(f.owner.id,body.requestId);assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),body);assert.deepEqual(quoteReceiptResponse(app,receipt),result);
    assert.equal(result.pricedScope.facts.some(fact=>fact.label==='Affirmatively identified owner offerings'),false);
    if(entry.type.startsWith('FENCING_')){assert.ok(body.customerInputs.confirmedFacts.fenceType.offeringId);assert.ok(result.pricedScope.facts.find(fact=>fact.label==='Gates by measured opening width').value.includes('2 × walk'))}
    rows.push({name:kind+' quotes '+entry.name,body,result,receipt});console.log(JSON.stringify({completed:kind+' '+entry.name}));if(entry===f.cases[0])await page.screenshot({path:path.join(evidence,kind+'-fence.png'),fullPage:true});if(entry.type==='EXTERIOR_PAINTING'&&entry.mode==='itemized')await page.screenshot({path:path.join(evidence,kind+'-paint.png'),fullPage:true});await page.close();
  }
  assert.deepEqual(errors,[]);assert.equal(db.prepare('SELECT COUNT(*) n FROM quotes WHERE ownerId=?').get(f.owner.id).n,f.cases.length*2);console.log(JSON.stringify({passed:true,checks:rows.length}));
}catch(error){fs.writeFileSync(path.join(evidence,'failure.json'),JSON.stringify({rows,error:String(error.stack),errors},null,2));if(page&&!page.isClosed()){await page.screenshot({path:path.join(evidence,'failure.png'),fullPage:true}).catch(()=>{});fs.writeFileSync(path.join(evidence,'failure.html'),await page.content().catch(()=>''));}throw error;}
finally {fs.writeFileSync(path.join(evidence,'results.json'),JSON.stringify({rows,errors},null,2));fs.writeFileSync(path.join(evidence,'browser-http.json'),JSON.stringify(wire,null,2));await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));db?.close();await app.stop();}
