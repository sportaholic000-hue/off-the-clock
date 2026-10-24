import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {SERVICE_TYPES} from '../../server/quote-engine-vnext/contracts.js';
import {customerFieldForInputs} from '../../server/scopeConfiguration.js';
import {serviceApplication} from './application.mjs';
import {CASES,VIEWPORTS,fixtures,ADDITIONAL,QUANTITY_TEXT} from './cases.mjs';

const root=path.resolve(process.argv[2]||'.'),out=path.resolve(process.argv[3]);
assert.equal(fs.existsSync(out),false,'Use a fresh evidence directory');fs.mkdirSync(out,{recursive:true});
const write=(dir,name,value)=>fs.writeFileSync(path.join(dir,name),JSON.stringify(value,null,2));
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const all=fixtures(),results=[],PRIVATE=/ownerId|bookRevision|calculationRecord|laborPerSqft|materialPerSqft|installedLaborPercent|confirmedFacts/i;
const source={head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),node:process.version,
 files:Object.fromEntries(['client/public/widget.js','client/dist/widget.js','client/dist/widget-app.js','client/src/widget-entry.jsx','client/src/quoteWizard.jsx','client/src/quotedone.jsx','client/src/quoteDoneControls.jsx','verification/qe-agent1-widget-entry-review-20261019/EXPECTED.md','verification/qe-agent1-widget-entry-review-20261019/browser-entry.mjs','verification/qe-agent1-widget-entry-review-20261019/application.mjs','verification/qe-agent1-widget-entry-review-20261019/cases.mjs'].map(file=>[file,hash(path.join(root,file))]))};
assert.equal(source.files['client/public/widget.js'],source.files['client/dist/widget.js'],'Built loader differs from source');
assert.deepEqual(CASES.map(c=>c.type).sort(),[...SERVICE_TYPES].sort());write(out,'expectations.json',CASES);write(out,'source-binding.json',source);
const money=cents=>'$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2});
let browser;

async function runService(spec){
 const {type}=spec,dir=path.join(out,type);fs.mkdirSync(dir);const f=all.get(type);let service;
 const rows=[];let page,context;
 async function check(view,stage,fn){
  const row={type,viewport:view.name,stage,expectedCents:spec.cents,status:'running',started:new Date().toISOString()};
  try{await fn(row);row.status='passed';}catch(error){row.status='failed';row.error={message:error.message,stack:error.stack};}
  if(page)try{row.visibleText=await page.locator('.panel').innerText({timeout:2000});}catch(error){row.textCaptureError=error.message;}
  if(page&&row.status==='failed')try{
   row.screenshot=`${view.name}-${stage}.png`;await page.screenshot({path:path.join(dir,row.screenshot),fullPage:true,timeout:5000});
   row.controls=await page.locator('input,select,textarea,button').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,type:n.type,label:n.getAttribute('aria-label'),text:n.textContent,value:n.value,checked:n.checked,visible:!!n.getClientRects().length})));
  }catch(error){row.captureError=error.message;}
  row.finished=new Date().toISOString();rows.push(row);results.push(row);write(dir,'results.json',rows);write(out,'results.json',results);
  console.log(JSON.stringify({type,viewport:view.name,stage,status:row.status,error:row.error?.message}));return row;
 }
 try{
  service=await serviceApplication(root,dir,type,f,all.get('CUSTOM').businessDefaults);
  const {catalog,publicPath}=service;
  async function fresh(view){
   if(context)await context.close();
   context=await browser.newContext({viewport:{width:view.width,height:view.height},isMobile:view.mobile,hasTouch:view.mobile});
   assert.deepEqual(await context.cookies(),[]);page=await context.newPage();page.setDefaultTimeout(8000);
   const errors=[],assets=[];page.on('pageerror',error=>errors.push(error.message));
   page.on('response',r=>{if(/\/widget(?:-app)?\.js$/.test(new URL(r.url()).pathname))assets.push({url:r.url(),status:r.status()});});
   await page.goto(service.embedOrigin,{waitUntil:'networkidle'});
   const storage=await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}));assert.deepEqual(storage,{local:[],session:[]});
   await page.getByRole('button',{name:'Get an estimate',exact:true}).click();
   await page.getByLabel('Service',{exact:true}).waitFor();
   await page.getByLabel('Service',{exact:true}).selectOption(catalog.id);
   assert.equal(await page.locator('form.quote-wizard').count(),1,'Real progressive wizard missing');
   const box=await page.locator('dialog.panel').boundingBox();assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=view.width+1&&box.y+box.height<=view.height+1,'Widget panel exceeds viewport');
   assert.equal(assets.length,2,JSON.stringify(assets));assert.ok(assets.every(a=>a.status===200));
   for(const detail of catalog.offeringSummary||[])assert.ok((await page.locator('.panel').innerText()).includes(detail),'Missing offering scope: '+detail);
   return {storage,assets,errors,box};
  }
  async function enter(field,value){
   const label=field.label,control=page.getByLabel(label,{exact:true});
   if(field.name==='fenceHeight'){
    await page.getByLabel(label+' whole feet',{exact:true}).fill(String(Math.floor(value)));
    await page.getByLabel(label+' inches',{exact:true}).fill(String((value-Math.floor(value))*12));
   }else if(['boolean','enum','integer_or_unknown'].includes(field.type))await control.selectOption(String(value));
   else if(field.type==='offering_counts')for(const [key,n]of Object.entries(value))await page.getByLabel('Gate count '+key,{exact:true}).fill(String(n));
   else if(field.type==='plant_counts')for(const [key,n]of Object.entries(value)){
    const suffix=field.options?.[key]||key.replaceAll('_',' ').replace(/^./,s=>s.toUpperCase());
    await page.getByLabel(label+' '+suffix,{exact:true}).fill(String(n));
   }else if(field.type==='multi_enum')for(const key of value)await page.getByLabel(field.optionLabels?.[key]||key,{exact:true}).check();
   else if(['string','number','number_or_unknown','slug'].includes(field.type)){
    await control.fill(String(value));
    if(field.type==='slug'&&catalog.knownOfferings?.[field.name]?.[value])await page.getByLabel('I have identified this exact offering.',{exact:true}).check();
   }else throw Error('Audit control not implemented: '+field.type+' '+field.name);
  }
  async function scopeFacts(facts){
   const shown=await page.locator('.panel dt').evaluateAll(nodes=>nodes.map(node=>({label:node.textContent,value:node.nextElementSibling?.textContent,visible:node.checkVisibility()})));
   for(const fact of facts){
    const matches=shown.filter(row=>row.label===fact.label&&row.visible);
    assert.ok(matches.some(row=>row.value?.includes(fact.value)),`Visible scope label/value pair missing: ${fact.label}: ${fact.value}`);
    for(const detail of fact.details||[])assert.ok(matches.some(row=>row.value?.includes(detail)),`Scope detail missing: ${fact.label}: ${detail}`);
   }
  }
  async function walk(view,{omit}={}){
   const steps=[],visited=new Set();
   for(let i=0;i<120;i++){
    const wizard=page.locator('form.quote-wizard');await wizard.waitFor();
    const title=await wizard.locator('h2').innerText(),progress=await wizard.locator('.wizard-progress').textContent();
    const field=catalog.customerFields.filter(x=>x.type!=='confirmed_facts').map(x=>customerFieldForInputs(x,f.customerInputs)).find(x=>x.label===title);
    const step={title,progress,field:field?.name};steps.push(step);
    const trace=()=>write(dir,view.name+'-'+(omit?'required':'valid')+'-wizard.json',steps);trace();
    if(field){visited.add(field.name);step.unit=field.unit;
     if(Object.hasOwn(f.customerInputs,field.name)&&field.name!==omit){step.answer=f.customerInputs[field.name];await enter(field,step.answer);}
     else step.answer='[left blank]';
    }else if(title==='How can the business reach you?')await page.getByLabel('Email',{exact:true}).fill('synthetic-widget-entry@example.invalid');
    else if(title==='When do you need the work?')await page.getByLabel('Urgency',{exact:true}).selectOption('flexible');
    else if(title==='Additional work for on-site estimate'&&view.mobile)await page.getByLabel('Additional work for on-site estimate',{exact:true}).fill(ADDITIONAL);
    step.completed=true;trace();
    const submit=wizard.getByRole('button',{name:'Submit estimate request',exact:true});
    if(await submit.count()){
     const before=service.counts(),waiting=page.waitForResponse(r=>new URL(r.url()).pathname===publicPath+'/prepare'&&r.request().method()==='POST');
     await submit.click();const response=await waiting,request=response.request().postDataJSON(),body=await response.json();
     assert.equal(response.status(),200,JSON.stringify(body));assert.deepEqual(service.counts(),before,'Preparation persisted rows');
     await page.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
     return {steps,visited:[...visited],request,response:body,status:response.status()};
    }
    const beforeContinue=await wizard.locator('.wizard-progress').textContent();
    await wizard.getByRole('button',{name:'Continue',exact:true}).click();
    await page.waitForFunction(old=>{const host=document.querySelector('[data-otc-widget]');return host?.shadowRoot?.querySelector('.wizard-progress')?.textContent!==old;},beforeContinue);
   }
   throw Error('Wizard did not finish within 120 visible steps');
  }
  for(const view of VIEWPORTS){let initial,missing,prepared,saved;
   await check(view,'required-question',async row=>{
    initial=await fresh(view);row.entry=initial;missing=await walk(view,{omit:spec.required});row.prepared=missing;
    assert.ok(missing.visited.includes(spec.required),'Required question was not visible');
    assert.equal(Object.hasOwn(missing.request.customerInputs,spec.required),false,'Blank answer became a value');
    assert.equal(missing.response.status,'needs_details',JSON.stringify(missing.response));
    assert.ok(missing.response.followUps?.length,'Missing required answer has no follow-up');
    assert.equal(missing.response.confirmation,undefined);assert.equal(await page.getByRole('button',{name:'Get estimate',exact:true}).count(),0);
    assert.equal(service.receipt(missing.request.requestId),undefined);
   });
   await check(view,'valid-quote-and-scope',async row=>{
    if(await page?.getByRole('button',{name:'Change details',exact:true}).count())await page.getByRole('button',{name:'Change details',exact:true}).click();
    else initial=await fresh(view);
    prepared=await walk(view);row.prepared=prepared;row.entry=initial;
    assert.equal(prepared.response.status,'ready',JSON.stringify(prepared.response));
    for(const field of catalog.customerFields){
     if(field.type==='confirmed_facts'||!Object.hasOwn(f.customerInputs,field.name))continue;
     assert.ok(prepared.visited.includes(field.name),'Supplied scope question was not shown: '+field.name);
     assert.deepEqual(prepared.request.customerInputs[field.name],f.customerInputs[field.name],'Entered scope was discarded: '+field.name);
    }
    await scopeFacts(prepared.response.summary.facts);
    const before=service.counts(),waiting=page.waitForResponse(r=>new URL(r.url()).pathname===publicPath&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Get estimate',exact:true}).click();const response=await waiting,request=response.request().postDataJSON(),body=await response.json();
    assert.equal(response.status(),201,JSON.stringify(body));
    const receipt=service.receipt(request.requestId);assert.ok(receipt);const quote=service.quote(receipt);assert.ok(quote);
    saved={request,response:body,receipt,quote};row.saved=saved;
    assert.deepEqual(JSON.parse(receipt.originalSubmissionJson),request);assert.deepEqual(request.customerInputs,prepared.request.customerInputs);
    assert.deepEqual(JSON.parse(quote.customerInputsJson),request.customerInputs);
    const internal=JSON.parse(receipt.internalOutcomeJson).internalResult;
    assert.deepEqual((internal.options?.length?internal.options:[internal]).map(o=>o.calculationRecord.scenarios.mid.finalTotalCents),[spec.cents]);
    const estimate=view.mobile?body.pricedEstimate:body;
    assert.equal(body.resultType,view.mobile?'PARTIAL_ESTIMATE_READY':'INSTANT_ESTIMATE_READY');
    assert.deepEqual((estimate.options?.length?estimate.options:[estimate]).map(o=>o.midEstimate),[spec.cents/100]);
    assert.equal(body.fullJobTotal,null);assert.ok(body.scopeNotice);
    if(view.mobile){assert.equal(body.midEstimate,undefined);assert.equal(body.lowEstimate,undefined);assert.equal(body.highEstimate,undefined);assert.equal(body.options,undefined);assert.ok(body.additionalWork.some(w=>w.description===ADDITIONAL));}
    await page.getByRole('heading',{name:view.mobile?'Estimate for selected work':'Estimate',exact:true}).waitFor();
    const text=await page.locator('.panel').innerText();assert.ok(text.includes(money(spec.cents)),'Exact price missing from rendered widget');
    assert.ok(text.includes(body.scopeNotice),'Scope boundary missing');
    await scopeFacts(body.pricedScope.facts);
    assert.match(text,QUANTITY_TEXT[type],'Independent quantity/unit disclosure missing');
    assert.match(text,/Canadian dollars \(CAD\)/);assert.match(text,/No tax/i);
    if(view.mobile){assert.ok(text.includes(ADDITIONAL));assert.ok(text.includes('Total for all requested work: not yet available.'));assert.ok(text.includes(body.customerMessage));}
    if(type==='LANDSCAPING_MOWING')assert.ok(text.includes('per visit'));
    assert.doesNotMatch(JSON.stringify(body),PRIVATE);assert.doesNotMatch(text,PRIVATE);
    assert.deepEqual(service.counts(),Object.fromEntries(Object.entries(before).map(([key,n])=>[key,n+1])));
    assert.deepEqual(initial.errors,[]);row.screenshot=view.name+'-valid.png';await page.screenshot({path:path.join(dir,row.screenshot),fullPage:true});
   });
   await check(view,'original-receipt-replay',async row=>{
    assert.ok(saved,'No genuine priced receipt available to replay');const before=service.counts();
    const response=await service.app.request(publicPath,{method:'POST',body:saved.request,publicRequest:true});
    row.requestId=saved.request.requestId;row.response=response;
    assert.equal(response.status,200);assert.deepEqual(response.body,saved.response);assert.deepEqual(service.receipt(saved.request.requestId),saved.receipt);assert.deepEqual(service.quote(saved.receipt),saved.quote);assert.deepEqual(service.counts(),before);
    assert.deepEqual(await service.api('GET','/api/pricebook/'+service.owner),service.approved,'Quoting or replay changed saved prices/approval');
   });
   if(context){await context.close();context=null;page=null;}
  }
 }catch(error){
  write(dir,'setup-failure.json',{message:error.message,stack:error.stack});
  for(const view of VIEWPORTS)for(const stage of ['required-question','valid-quote-and-scope','original-receipt-replay'])if(!rows.some(r=>r.viewport===view.name&&r.stage===stage))await check(view,stage,()=>{throw error;});
 }finally{if(context)await context.close();if(service)await service.stop();}
}
try{
 const require=createRequire(import.meta.url),{chromium}=require(process.env.PUBLIC_INTAKE_PLAYWRIGHT_MODULE||'playwright');
 browser=await chromium.launch({headless:true,executablePath:process.env.PUBLIC_INTAKE_BROWSER_EXECUTABLE||process.env.PRICEBOOK_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 source.browser=await browser.version();write(out,'source-binding.json',source);
 let index=0;await Promise.all(Array.from({length:4},async()=>{while(index<CASES.length)await runService(CASES[index++]);}));
 const failed=results.filter(r=>r.status!=='passed').length;write(out,'result.json',{status:failed?'failed':'passed',services:CASES.length,viewports:VIEWPORTS,caseCount:results.length,passed:results.length-failed,failed});
 write(out,'coverage.json',CASES.map(c=>({...c,results:results.filter(r=>r.type===c.type).map(({viewport,stage,status,error})=>({viewport,stage,status,error}))})));
 if(failed)process.exitCode=1;
}catch(error){write(out,'fatal.json',{message:error.message,stack:error.stack});write(out,'result.json',{status:'fatal',caseCount:results.length,error:error.stack});console.error(error.stack);process.exitCode=1;}
finally{write(out,'results.json',results);await browser?.close();}
