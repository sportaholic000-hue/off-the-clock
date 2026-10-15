import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import * as bridge from '../server/src/quoteDoneBridge.js';
import * as onboarding from '../server/src/onboardingService.js';
import {db,migrate} from '../server/src/db.js';
import {randomUUID} from 'node:crypto';

let browser,bundle;
before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const onboardingSource=readFileSync(new URL('../client/src/onboarding.jsx',import.meta.url),'utf8');
  const built=await build({bundle:true,write:false,outfile:'owner-batch-interview.js',format:'iife',platform:'browser',loader:{'.js':'jsx'},
    define:{'process.env.NODE_ENV':JSON.stringify('production'),'import.meta.env.VITE_API_URL':JSON.stringify('')},
    plugins:[{name:'expose-pricebook-step',setup(build){build.onLoad({filter:/[/\\]onboarding\.jsx$/},()=>({contents:onboardingSource.replace('function PriceBookStep(', 'export function PriceBookStep('),loader:'jsx',resolveDir:new URL('../client/src/',import.meta.url).pathname}));}}],
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
      import React,{useState}from'react';import{createRoot}from'react-dom/client';
      import Question from './client/src/interviewStructured.jsx';
      import{interviewDefinition}from'./client/src/interviewStructuredValue.js';
      import{PriceBookStep}from'./client/src/onboarding.jsx';
      function App(props){if(props.full)return <PriceBookStep state={props.state} metadata={props.metadata} back={()=>{}} next={()=>{}}/>;const[value,setValue]=useState(props.initial);const resolved=interviewDefinition(props.definition,props.pricing);return <><Question definition={resolved} value={value} onChange={setValue}/><output>{JSON.stringify(value)}</output></>};
      const root=createRoot(document.getElementById('root'));window.mount=props=>root.render(<App key={props.mountKey||'default'} {...props}/>);`}});
  bundle=built.outputFiles[0].text;
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
after(async()=>{await browser?.close();});

test('QE-016 owner decision: guided name rejects 81 without saving and resumes an exact 80-character Unicode name',async()=>{
  migrate();
  const owner='synthetic-name-browser-'+randomUUID(),now='2026-10-15T12:00:00.000Z';
  db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'UTC','owner',now);
  let draft=onboarding.createInterviewDraft(owner,{serviceTypes:['CUSTOM']});
  draft=onboarding.saveInterviewDraft(owner,draft.id,{revision:draft.revision,currentField:'CUSTOM.service'});
  const metadata=[bridge.applicationMetadata().services.find(s=>s.serviceType==='CUSTOM')];
  const state={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:['CUSTOM']},preview:{telephonySimulated:true}};
  const page=await browser.newPage(),errors=[];let saves=0;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://owner-batch-interview.test')throw Error('Unexpected browser request '+url.href);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'});
    let payload;
    if(url.pathname==='/api/pricebook/interview'&&request.method()==='GET')payload={drafts:onboarding.listInterviewDrafts(owner)};
    else if(url.pathname===`/api/pricebook/interview/${draft.id}`&&request.method()==='GET')payload={draft:onboarding.getInterviewDraft(owner,draft.id)};
    else if(url.pathname===`/api/pricebook/interview/${draft.id}`&&request.method()==='PUT'){
      saves++;payload={draft:onboarding.saveInterviewDraft(owner,draft.id,JSON.parse(request.postData()))};
    }else throw Error('Unexpected endpoint '+request.method()+' '+url.pathname);
    await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
  });
  try{
    await page.goto('http://owner-batch-interview.test/');
    await page.evaluate(props=>window.mount(props),{full:true,mountKey:'name',state,metadata});
    await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();
    const field=page.getByRole('textbox',{name:'Offering name',exact:true});
    await field.fill('X'.repeat(81));
    await page.getByRole('button',{name:'Read it back',exact:true}).click();
    await page.getByText('Enter a service name of 1–80 characters.',{exact:true}).waitFor();
    assert.equal(saves,0);assert.equal(onboarding.getInterviewDraft(owner,draft.id).fields.CUSTOM?.service,undefined);
    const name='é'.repeat(78)+'🏠';await field.fill(name);
    await page.getByRole('button',{name:'Read it back',exact:true}).click();
    await Promise.all([page.waitForResponse(r=>r.request().method()==='PUT'),page.getByRole('button',{name:'Yes, save these settings',exact:true}).click()]);
    draft=onboarding.getInterviewDraft(owner,draft.id);assert.equal(draft.fields.CUSTOM.service,name);
    draft=onboarding.saveInterviewDraft(owner,draft.id,{revision:draft.revision,currentField:'CUSTOM.service'});
    await page.evaluate(props=>window.mount(props),{full:true,mountKey:'resumed-name',state,metadata});
    await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();
    assert.equal(await field.inputValue(),name);assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

async function open(props,run){
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.route('http://owner-batch-interview.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'}));
    await page.goto('http://owner-batch-interview.test/');await page.evaluate(value=>window.mount(value),props);await page.locator('output').waitFor();
    const value=async()=>JSON.parse(await page.locator('output').textContent());
    await run(page,value,errors);
  }finally{await page.close();}
}

test('QE-008: Chromium guided allocation control preserves an exact dotted path and percentage',async()=>{
  const definition=bridge.applicationMetadata().services.find(item=>item.serviceType==='ROOFING_REPLACEMENT').fields.find(item=>item.field==='installedLaborPercent');
  const pricing={underlaymentPerSquare:{product_0:1500},underlaymentPriceBasis:{product_0:'installed_area_sell_price'}};
  await open({definition:{...definition,serviceType:'ROOFING_REPLACEMENT'},pricing,initial:{}},async(page,value,errors)=>{
    const path='underlaymentPerSquare.product_0';
    const selector=page.getByLabel(definition.label+' product name',{exact:true});
    await selector.waitFor();
    assert.deepEqual(await selector.locator('option').allTextContents(),['Choose','Underlayment per square.product 0']);
    await selector.selectOption(path);
    await page.getByRole('button',{name:'Add offering',exact:true}).click();
    const input=page.getByLabel(definition.label+' Underlayment per square.product 0',{exact:true});
    await input.fill('40');
    assert.deepEqual(await value(),{[path]:40});
    assert.deepEqual(errors,[]);
  });
});

test('QE-008: Chromium guided allocation control represents explicit no-allocation as an empty map',async()=>{
  const definition=bridge.applicationMetadata().services.find(item=>item.serviceType==='CUSTOM').fields.find(item=>item.field==='installedMaterialsPercent');
  await open({definition:{...definition,serviceType:'CUSTOM'},pricing:{},initial:{}},async(page,value,errors)=>{
    await page.getByText(/No installed prices currently need a materials or labor allocation/i).waitFor();
    assert.deepEqual(await value(),{});
    assert.equal(await page.getByRole('button',{name:'Add offering',exact:true}).count(),0);
    assert.deepEqual(errors,[]);
  });
});

test('QE-008: full guided interview persists and resumes exact paths and explicit empty allocation answers',async()=>{
  migrate();
  const owner='qe008-browser-'+randomUUID(),now='2026-10-15T12:00:00.000Z';
  db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'UTC','owner',now);
  const type='ROOFING_REPLACEMENT',path='underlaymentPerSquare.product_0';
  let draft=onboarding.createInterviewDraft(owner,{mode:'browser',serviceTypes:[type]});
  draft=onboarding.saveInterviewDraft(owner,draft.id,{
    revision:draft.revision,
    fields:{[type]:{
      underlaymentPerSquare:{product_0:15},underlaymentPriceBasis:{product_0:'installed_area_sell_price'},installedLaborPercent:{}
    }},
    confirmedFields:{[type]:['underlaymentPerSquare','underlaymentPriceBasis']},
    currentField:type+'.installedLaborPercent'
  });
  const metadata=[bridge.applicationMetadata().services.find(service=>service.serviceType===type)];
  const definition=metadata[0].fields.find(field=>field.field==='installedLaborPercent');
  const state={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:[type]},preview:{telephonySimulated:true}};
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://owner-batch-interview.test')throw Error('Unexpected browser request '+url.href);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'});
    const body=request.postData()?JSON.parse(request.postData()):undefined;
    let payload;
    if(url.pathname==='/api/pricebook/interview'&&request.method()==='GET')payload={drafts:onboarding.listInterviewDrafts(owner)};
    else if(url.pathname===`/api/pricebook/interview/${draft.id}`&&request.method()==='GET')payload={draft:onboarding.getInterviewDraft(owner,draft.id)};
    else if(url.pathname===`/api/pricebook/interview/${draft.id}`&&request.method()==='PUT')payload={draft:onboarding.saveInterviewDraft(owner,draft.id,body)};
    else throw Error('Unexpected endpoint '+request.method()+' '+url.pathname);
    await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
  });
  try{
    await page.goto('http://owner-batch-interview.test/');
    await page.evaluate(props=>window.mount(props),{full:true,mountKey:'first',state,metadata});
    await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();
    const selector=page.getByLabel(definition.label+' product name',{exact:true});
    await selector.selectOption(path);
    await page.getByRole('button',{name:'Add offering',exact:true}).click();
    await page.getByLabel(definition.label+' Underlayment per square.product 0',{exact:true}).fill('40');
    await page.getByRole('button',{name:'Read it back',exact:true}).click();
    await Promise.all([
      page.waitForResponse(response=>response.url().endsWith('/api/pricebook/interview/'+draft.id)&&response.request().method()==='PUT'),
      page.getByRole('button',{name:'Yes, save these prices',exact:true}).click()
    ]);
    draft=onboarding.getInterviewDraft(owner,draft.id);
    assert.deepEqual(draft.fields[type].installedLaborPercent,{[path]:40});
    assert.ok(draft.confirmedFields[type].includes('installedLaborPercent'));

    draft=onboarding.saveInterviewDraft(owner,draft.id,{revision:draft.revision,currentField:type+'.installedLaborPercent'});
    await page.evaluate(props=>window.mount(props),{full:true,mountKey:'resume-path',state,metadata});
    await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();
    assert.equal(await page.getByLabel(definition.label+' Underlayment per square.product 0',{exact:true}).inputValue(),'40');

    draft=onboarding.saveInterviewDraft(owner,draft.id,{
      revision:draft.revision,fields:{[type]:{installedMaterialsPercent:{}}},currentField:type+'.installedMaterialsPercent'
    });
    await page.evaluate(props=>window.mount(props),{full:true,mountKey:'resume-empty',state,metadata});
    await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();
    await page.getByText(/No allocation percentages entered.*empty allocation map can be saved explicitly/i).waitFor();
    await page.getByRole('button',{name:'Read it back',exact:true}).click();
    await Promise.all([
      page.waitForResponse(response=>response.url().endsWith('/api/pricebook/interview/'+draft.id)&&response.request().method()==='PUT'),
      page.getByRole('button',{name:'Yes, save these prices',exact:true}).click()
    ]);
    draft=onboarding.getInterviewDraft(owner,draft.id);
    assert.deepEqual(draft.fields[type].installedMaterialsPercent,{});
    assert.ok(draft.confirmedFields[type].includes('installedMaterialsPercent'));
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});

test('QE-009: full guided interview switches roof modes without confirming or reviewing inactive accessory fields',async()=>{
  migrate();
  const owner='qe009-browser-'+randomUUID(),now='2026-10-15T12:00:00.000Z',type='ROOFING_REPLACEMENT';
  db.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,emailVerifiedAt,timezone,role,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(owner,owner+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active',now,'UTC','owner',now);
  let draft=onboarding.createInterviewDraft(owner,{mode:'browser',serviceTypes:[type]});
  const captured={accessoryPricingMode:'itemized',materialCostPerSquare:{asphalt_shingle:100},materialAccessoryBasis:'excludes_itemized_accessories',starterPerLF:1,dripEdgePerLF:2,ridgeCapPerLF:3};
  draft=onboarding.saveInterviewDraft(owner,draft.id,{
    revision:draft.revision,fields:{[type]:captured},confirmedFields:{[type]:Object.keys(captured)},currentField:type+'.accessoryPricingMode'
  });
  const metadata=[bridge.applicationMetadata().services.find(service=>service.serviceType===type)];
  const modeDefinition=metadata[0].fields.find(field=>field.field==='accessoryPricingMode');
  const state={account:{id:owner,plan:'QuoteDone'},profile:{businessTypes:[type]},preview:{telephonySimulated:true}};
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin!=='http://owner-batch-interview.test')throw Error('Unexpected browser request '+url.href);
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'});
    const body=request.postData()?JSON.parse(request.postData()):undefined;
    let payload;
    if(url.pathname==='/api/pricebook/interview'&&request.method()==='GET')payload={drafts:onboarding.listInterviewDrafts(owner)};
    else if(url.pathname===`/api/pricebook/interview/${draft.id}`&&request.method()==='GET')payload={draft:onboarding.getInterviewDraft(owner,draft.id)};
    else if(url.pathname===`/api/pricebook/interview/${draft.id}`&&request.method()==='PUT')payload={draft:onboarding.saveInterviewDraft(owner,draft.id,body)};
    else throw Error('Unexpected endpoint '+request.method()+' '+url.pathname);
    await route.fulfill({contentType:'application/json',body:JSON.stringify(payload)});
  });
  const saveMode=async(value)=>{
    await page.getByText(modeDefinition.label,{exact:true}).waitFor();
    const select=page.locator('.interview-field select');
    assert.equal(await select.count(),1,'the accessory-mode question has one choice control');
    await select.selectOption(value);
    await page.getByRole('button',{name:'Read it back',exact:true}).click();
    await Promise.all([
      page.waitForResponse(response=>response.url().endsWith('/api/pricebook/interview/'+draft.id)&&response.request().method()==='PUT'),
      page.getByRole('button',{name:/Yes, save/,exact:false}).click()
    ]);
    draft=onboarding.getInterviewDraft(owner,draft.id);
  };
  try{
    await page.goto('http://owner-batch-interview.test/');
    await page.evaluate(props=>window.mount(props),{full:true,mountKey:'itemized',state,metadata});
    await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();
    await saveMode('per_square_allin');
    assert.equal(draft.fields[type].starterPerLF,1,'inactive draft value remains recoverable');
    for(const field of ['materialCostPerSquare','materialAccessoryBasis','starterPerLF','dripEdgePerLF','ridgeCapPerLF'])assert.ok(!draft.confirmedFields[type].includes(field),field);
    assert.deepEqual(onboarding.draftReviewPayload(owner,draft.id).services[0].fields,{accessoryPricingMode:'per_square_allin',materialCostPerSquare:{asphalt_shingle:100}});

    draft=onboarding.saveInterviewDraft(owner,draft.id,{revision:draft.revision,currentField:type+'.accessoryPricingMode'});
    await page.evaluate(props=>window.mount(props),{full:true,mountKey:'all-in',state,metadata});
    await page.getByRole('button',{name:'Resume saved draft',exact:true}).click();
    await saveMode('itemized');
    const review=onboarding.draftReviewPayload(owner,draft.id).services[0].fields;
    assert.equal(review.accessoryPricingMode,'itemized');
    assert.equal(review.materialAccessoryBasis,'excludes_itemized_accessories');
    assert.equal(review.starterPerLF,1);
    assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
