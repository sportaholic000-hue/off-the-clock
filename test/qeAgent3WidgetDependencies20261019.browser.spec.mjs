import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';
import {convertApplicationBook} from '../server/src/quoteDoneBridge.js';
import {auditFixtures} from '../verification/qe-agent3-widget-dependencies-20261019/audit-fixtures.mjs';

const OWNED_SOURCE='client/src/quoteDoneControls.jsx';
const TYPES=['LANDSCAPING_MULCH','CONCRETE_DRIVEWAY','FLOORING_REPLACEMENT','LANDSCAPING_PLANTING','LANDSCAPING_MOWING'];
const STALE_CONFIRMATION='synthetic-stale-intake-confirmation-must-not-survive';
const PRIVATE_PRICE_FIELDS=/ownerId|bookRevision|calculationRecord|mulchMaterialPerYard|laborPerSqft|subfloorAllowancePerSqft|edgingPerLinearFoot|confirmedFacts/i;

const clone=value=>structuredClone(value);
const has=(value,key)=>Object.hasOwn(value||{},key);
function changed(value,assign={},remove=[]){const next=clone(value);Object.assign(next,assign);for(const key of remove)delete next[key];return next;}
function exactOptionCents(row){
  const internal=JSON.parse(row.internalOutcomeJson),result=internal.internalResult;
  const estimate=result?.resultType==='PARTIAL_ESTIMATE_READY'?result.pricedEstimate:result;
  return (estimate?.options||[estimate]).filter(Boolean).map(option=>option.calculationRecord.scenarios.mid.finalTotalCents);
}

test('qe-agent3 public Chromium clears PI-01 through PI-05 dependencies through prepare, final persistence, and correction retries',{timeout:300_000},async t=>{
  assert.equal(OWNED_SOURCE,'client/src/quoteDoneControls.jsx');
  const app=await application(t),owner='synthetic-a',fixtures=auditFixtures();
  fixtures.get('LANDSCAPING_MOWING').ownerPricing.pricing.edgingPerLinearFoot=50;

  async function api(method,url,body,{status=200,publicRequest=false}={}){
    const response=await app.request(url,{method,body,owner:publicRequest?null:owner,publicRequest});
    assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(response.body)}`);
    return response.body;
  }
  const initial=await api('GET','/api/pricebook/'+owner);
  const rawServices=TYPES.map(type=>{
    const fixture=fixtures.get(type),service=clone(fixture.ownerPricing);
    delete service.origin;delete service.quoteDoneApproval;delete service.startingValueState;
    delete service.startingValueAdoptions;delete service.dependentLineState;
    service.service='[SYNTHETIC PI DEPENDENCY] '+type;
    service.validationInputs=clone(fixture.customerInputs);
    service.tiers=[];
    return service;
  });
  const converted=convertApplicationBook({services:rawServices,defaults:{...fixtures.get('LANDSCAPING_MOWING').businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  await api('POST','/api/pricebook/save',{...initial,services:converted.services,defaults:converted.defaults});
  let saved=await api('GET','/api/pricebook/'+owner);
  for(let pass=0;pass<3;pass++){
    const actionable=saved.services.some(service=>Object.keys(service.startingValueState||{}).length||Object.keys(service.dependentLineState||{}).some(id=>!service.dependentLineState[id]?.confirmed||!service.dependentLineState[id]?.reentered));
    if(!actionable)break;
    for(const service of saved.services){
      const start=Object.keys(service.startingValueState||{}),dependent=Object.keys(service.dependentLineState||{});
      if(start.length)service.startingValueActions={confirmPaths:start};
      if(dependent.length)service.dependentLineActions={reenteredIds:dependent,confirmIds:dependent};
    }
    await api('POST','/api/pricebook/save',saved);saved=await api('GET','/api/pricebook/'+owner);
  }
  for(const type of TYPES){
    saved=await api('GET','/api/pricebook/'+owner);
    const service=saved.services.find(item=>item.serviceType===type),validation=await api('POST','/api/pricebook/validate',saved);
    const status=validation.statuses.find(item=>item.serviceId===service.id);
    assert.ok(status,`missing validation status for ${type}`);
    await api('POST','/api/pricebook/services/'+service.id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});
  }
  const access=await api('POST','/api/quotedone/access',{allowedOrigins:[app.base]});
  const publicPath='/api/public/quote/'+access.publicKey,catalog=await api('GET',publicPath,undefined,{publicRequest:true});
  assert.deepEqual(catalog.services.map(service=>service.serviceType).sort(),[...TYPES].sort());
  const byType=new Map(catalog.services.map(service=>[service.serviceType,service]));

  const require=createRequire(import.meta.url),{chromium}=require(process.env.PUBLIC_INTAKE_PLAYWRIGHT_MODULE||'playwright');
  const executablePath=process.env.PUBLIC_INTAKE_BROWSER_EXECUTABLE||process.env.PRICEBOOK_BROWSER_EXECUTABLE||undefined;
  const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox','--disable-dev-shm-usage']});
  t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  t.after(()=>page.close());
  const built=await build({bundle:true,write:false,format:'iife',platform:'browser',
    define:{'process.env.NODE_ENV':JSON.stringify('production'),'import.meta.env':JSON.stringify({})},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {CustomerQuote} from './client/src/quotedone.jsx';
      const publicKey=new URLSearchParams(location.search).get('publicKey');
      createRoot(document.getElementById('root')).render(<CustomerQuote publicKey={publicKey} persistResult/>);
    `}});
  const browserScript=built.outputFiles[0].text,harnessUrl=`${app.base}/qe-agent3-public-widget`;
  await page.route(harnessUrl+'*',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+browserScript.replaceAll('</script','<\\/script')+'</script>'}));
  await page.goto(`${harnessUrl}?publicKey=${encodeURIComponent(access.publicKey)}`,{waitUntil:'networkidle'});
  const cacheKey='quotedone-pending-'+access.publicKey;
  let retryChecked=false,completed=0;

  function counts(){return Object.fromEntries(['quoteSubmissions','quotes','leads','quoteRequests'].map(table=>[table,app.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ownerId=?`).get(owner).n]));}
  function row(requestId){return app.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,requestId);}
  async function restore(type,inputs){
    const service=byType.get(type),original=clone(inputs),draft={
      requestId:crypto.randomUUID(),serviceId:service.id,serviceRequest:service.name,
      customerInputs:clone(inputs),customerFeeSelections:{},additionalWork:[],
      contact:{email:`browser-${type.toLowerCase().replaceAll('_','-')}@example.invalid`},
      intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible',
      intakeConfirmation:STALE_CONFIRMATION,reviewRequested:true,
      intakeClarification:{receipt:STALE_CONFIRMATION,answers:{synthetic:'stale'}}
    };
    await page.evaluate(({key,draft})=>sessionStorage.setItem(key,JSON.stringify({kind:'editable',submission:draft})),{key:cacheKey,draft});
    await page.reload({waitUntil:'networkidle'});
    await page.getByLabel('Service').waitFor();
    assert.equal(await page.getByLabel('Service').inputValue(),service.id);
    return {draft,original};
  }
  async function select(label,value){await page.getByLabel(label,{exact:true}).selectOption(value);}
  async function fill(label,value){await page.getByLabel(label,{exact:true}).fill(String(value));}
  async function prepare(name,expectedStatus='ready'){
    const before=counts(),requestPromise=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname===publicPath+'/prepare');
    await page.getByRole('button',{name:'Submit estimate request',exact:true}).click();
    const request=await requestPromise,response=await request.response();
    assert.ok(response,`${name} prepare had no response`);
    const requestBody=request.postDataJSON(),responseBody=await response.json();
    assert.equal(response.status(),200,`${name} prepare status`);
    assert.equal(responseBody.status,expectedStatus,`${name}: ${JSON.stringify(responseBody)}`);
    assert.equal(requestBody.intakeConfirmation,undefined,`${name} reused a stale confirmation`);
    assert.equal(requestBody.reviewRequested,undefined);
    assert.equal(requestBody.intakeClarification,undefined);
    await page.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
    assert.deepEqual(counts(),before,`${name} prepare persisted a row`);
    assert.equal(row(requestBody.requestId),undefined);
    return {request:requestBody,response:responseBody};
  }
  async function final(name,prepared,expectedInputs,expectedCents){
    const before=counts(),requestPromise=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname===publicPath);
    await page.getByRole('button',{name:'Get estimate',exact:true}).click();
    const request=await requestPromise,response=await request.response();
    assert.ok(response,`${name} final had no response`);
    const requestBody=request.postDataJSON(),responseBody=await response.json();
    assert.equal(response.status(),201,`${name}: ${JSON.stringify(responseBody)}`);
    assert.equal(responseBody.resultType,'INSTANT_ESTIMATE_READY');
    assert.notEqual(requestBody.intakeConfirmation,STALE_CONFIRMATION);
    assert.equal(typeof requestBody.intakeConfirmation,'string');
    assert.deepEqual(requestBody.customerInputs,expectedInputs,`${name} final input body`);
    assert.deepEqual(prepared.request.customerInputs,expectedInputs,`${name} prepare input body`);
    await page.getByRole('heading',{name:'Estimate',exact:true}).waitFor();
    const stored=row(requestBody.requestId);
    assert.ok(stored,`${name} missing saved receipt`);
    assert.deepEqual(JSON.parse(stored.originalSubmissionJson),requestBody);
    assert.deepEqual(JSON.parse(app.db.prepare('SELECT customerInputsJson FROM quotes WHERE ownerId=? AND id=?').get(owner,stored.recordId).customerInputsJson),expectedInputs);
    assert.deepEqual(exactOptionCents(stored),expectedCents,`${name} exact cents`);
    assert.doesNotMatch(JSON.stringify(responseBody),PRIVATE_PRICE_FIELDS);
    assert.doesNotMatch(await page.locator('main').innerText(),PRIVATE_PRICE_FIELDS);
    completed++;
    if(!retryChecked){
      const retryBefore=counts(),retry=await app.request(publicPath,{method:'POST',body:requestBody,publicRequest:true});
      assert.equal(retry.status,200);
      assert.deepEqual(retry.body,responseBody,'exact retry must return the historical customer receipt');
      assert.deepEqual(counts(),retryBefore,'exact retry must not create another receipt');
      assert.deepEqual(JSON.parse(row(requestBody.requestId).originalSubmissionJson),requestBody);
      retryChecked=true;
    }
    assert.deepEqual(counts(),Object.fromEntries(Object.entries(before).map(([key,value])=>[key,value+1])));
    return {request:requestBody,response:responseBody,stored};
  }
  async function editAfterNeedsDetails(){
    await page.getByRole('button',{name:'Change details',exact:true}).click();
    await page.getByLabel('Service').waitFor();
  }
  async function addOutline(points){
    for(let index=0;index<points.length;index++)await page.getByRole('button',{name:'Add measured point',exact:true}).click();
    for(let index=0;index<points.length;index++)for(const axis of ['X','Y'])await page.getByLabel(new RegExp(`point ${index+1} ${axis} \\(ft\\)$`)).fill(String(points[index][axis.toLowerCase()]));
  }

  await t.test('PI-01 public sqft-to-yards does not reinterpret 270 square feet as 270 yards',async()=>{
    const base=fixtures.get('LANDSCAPING_MULCH').customerInputs,{original}=await restore('LANDSCAPING_MULCH',base);
    await select('Mulch quantity method','yards');
    assert.equal(await page.getByLabel('Mulch volume',{exact:true}).inputValue(),'');
    assert.equal(await page.getByLabel('Mulch depth',{exact:true}).count(),0);
    await fill('Mulch volume',2.75);
    const expected=changed(base,{inputMethod:'yards',mulchArea:2.75},['mulchDepth']);
    const prepared=await prepare('mulch sqft to yards');
    await final('mulch sqft to yards',prepared,expected,[32400]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-01 public yards-to-sqft clears the old volume and requires area plus depth',async()=>{
    const base=changed(fixtures.get('LANDSCAPING_MULCH').customerInputs,{inputMethod:'yards',mulchArea:2.75},['mulchDepth']);
    const {original}=await restore('LANDSCAPING_MULCH',base);
    await select('Mulch quantity method','sqft');
    assert.equal(await page.getByLabel('Measured bed area',{exact:true}).inputValue(),'');
    await fill('Measured bed area',270);await fill('Mulch depth',3);
    const expected=changed(base,{inputMethod:'sqft',mulchArea:270,mulchDepth:3});
    const prepared=await prepare('mulch yards to sqft');
    await final('mulch yards to sqft',prepared,expected,[32275]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-02 public exact-to-area-perimeter clears length and width',async()=>{
    const base=fixtures.get('CONCRETE_DRIVEWAY').customerInputs,{original}=await restore('CONCRETE_DRIVEWAY',base);
    await select('Slab measurement method','measured_area_perimeter');
    assert.equal(await page.getByLabel('Measured slab area',{exact:true}).inputValue(),'');
    assert.equal(await page.getByLabel('Measured slab perimeter',{exact:true}).inputValue(),'');
    await fill('Measured slab area',500);await fill('Measured slab perimeter',120);
    const expected=changed(base,{dimensionMethod:'measured_area_perimeter',areaSqft:500,perimeterLF:120},['length','width','outlinePoints']);
    const prepared=await prepare('concrete exact to area perimeter');
    for(const key of ['length','width','outlinePoints'])assert.equal(has(prepared.request.customerInputs,key),false);
    await final('concrete exact to area perimeter',prepared,expected,[892222]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-02 public area-perimeter-to-outline clears area and perimeter',async()=>{
    const base=changed(fixtures.get('CONCRETE_DRIVEWAY').customerInputs,{dimensionMethod:'measured_area_perimeter',areaSqft:500,perimeterLF:120},['length','width','outlinePoints']);
    const {original}=await restore('CONCRETE_DRIVEWAY',base);
    await select('Slab measurement method','measured_outline');
    const points=[{x:0,y:0},{x:50,y:0},{x:50,y:10},{x:0,y:10},{x:0,y:0}];
    await addOutline(points);
    const expected=changed(base,{dimensionMethod:'measured_outline',outlinePoints:points},['length','width','areaSqft','perimeterLF']);
    const prepared=await prepare('concrete area perimeter to outline');
    for(const key of ['length','width','areaSqft','perimeterLF'])assert.equal(has(prepared.request.customerInputs,key),false);
    await final('concrete area perimeter to outline',prepared,expected,[892222]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-02 public outline-to-exact clears coordinates',async()=>{
    const points=[{x:0,y:0},{x:50,y:0},{x:50,y:10},{x:0,y:10},{x:0,y:0}];
    const base=changed(fixtures.get('CONCRETE_DRIVEWAY').customerInputs,{dimensionMethod:'measured_outline',outlinePoints:points},['length','width','areaSqft','perimeterLF']);
    const {original}=await restore('CONCRETE_DRIVEWAY',base);
    await select('Slab measurement method','exact');
    await fill('Measured slab length',50);await fill('Measured slab width',10);
    const expected=changed(base,{dimensionMethod:'exact',length:50,width:10},['areaSqft','perimeterLF','outlinePoints']);
    const prepared=await prepare('concrete outline to exact');
    assert.equal(has(prepared.request.customerInputs,'outlinePoints'),false);
    await final('concrete outline to exact',prepared,expected,[892222]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-03 public subfloor off removes repair area while preserving flooring identity',async()=>{
    const base=fixtures.get('FLOORING_REPLACEMENT').customerInputs,{original}=await restore('FLOORING_REPLACEMENT',base);
    await select('Subfloor issues reported','false');
    assert.equal(await page.getByLabel('Measured subfloor repair area',{exact:true}).count(),0);
    const expected=changed(base,{subfloorIssues:false},['subfloorRepairAreaSqft']);
    const prepared=await prepare('subfloor off');
    assert.deepEqual(prepared.request.customerInputs.confirmedFacts,base.confirmedFacts);
    await final('subfloor off',prepared,expected,[305280]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-03 public subfloor unknown removes repair area and reverse requires a new area',async()=>{
    const base=fixtures.get('FLOORING_REPLACEMENT').customerInputs,{original}=await restore('FLOORING_REPLACEMENT',base);
    await select('Subfloor issues reported','');
    const uncertain=await prepare('subfloor unknown','needs_details');
    assert.equal(has(uncertain.request.customerInputs,'subfloorIssues'),false);
    assert.equal(has(uncertain.request.customerInputs,'subfloorRepairAreaSqft'),false);
    await editAfterNeedsDetails();await select('Subfloor issues reported','true');
    assert.equal(await page.getByLabel('Measured subfloor repair area',{exact:true}).inputValue(),'');
    await fill('Measured subfloor repair area',30);
    const expected=changed(base,{subfloorIssues:true,subfloorRepairAreaSqft:30});
    const prepared=await prepare('subfloor unknown back to on');
    await final('subfloor unknown back to on',prepared,expected,[311280]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-04 public planting mulch off removes quantity, type, and only its confirmation',async()=>{
    const base=fixtures.get('LANDSCAPING_PLANTING').customerInputs,{original}=await restore('LANDSCAPING_PLANTING',base);
    await select('Mulch included','false');
    assert.equal(await page.getByLabel('Measured mulch quantity',{exact:true}).count(),0);
    assert.equal(await page.getByLabel('Mulch type',{exact:true}).count(),0);
    const expected=changed(base,{mulchNeeded:false},['mulchYards','mulchType','confirmedFacts']);
    const prepared=await prepare('planting mulch off');
    await final('planting mulch off',prepared,expected,[12500]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-04 public planting mulch unknown clears receipt and reverse requires new confirmed product',async()=>{
    const base=fixtures.get('LANDSCAPING_PLANTING').customerInputs,{original}=await restore('LANDSCAPING_PLANTING',base);
    await select('Mulch included','');
    const uncertain=await prepare('planting mulch unknown','needs_details');
    for(const key of ['mulchNeeded','mulchYards','mulchType','confirmedFacts'])assert.equal(has(uncertain.request.customerInputs,key),false,`retained ${key}`);
    await editAfterNeedsDetails();await select('Mulch included','true');
    assert.equal(await page.getByLabel('Measured mulch quantity',{exact:true}).inputValue(),'');
    await fill('Measured mulch quantity',2);await fill('Mulch type','Brown');
    await page.getByLabel('I have identified this exact offering.',{exact:true}).check();
    const expected=changed(base,{mulchNeeded:true,mulchYards:2,mulchType:'brown'});
    const prepared=await prepare('planting mulch unknown back to on');
    await final('planting mulch unknown back to on',prepared,expected,[28500]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-05 public mowing edging off removes hidden length',async()=>{
    const base=fixtures.get('LANDSCAPING_MOWING').customerInputs,{original}=await restore('LANDSCAPING_MOWING',base);
    await select('Lawn edging selected','false');
    assert.equal(await page.getByLabel('Measured edging length',{exact:true}).count(),0);
    const expected=changed(base,{edgingIncluded:false},['edgingLengthLF']);
    const prepared=await prepare('mowing edging off');
    await final('mowing edging off',prepared,expected,[11000]);
    assert.deepEqual(base,original);
  });

  await t.test('PI-05 public mowing edging unknown clears length and reverse requires a new length',async()=>{
    const base=fixtures.get('LANDSCAPING_MOWING').customerInputs,{original}=await restore('LANDSCAPING_MOWING',base);
    await select('Lawn edging selected','');
    const uncertain=await prepare('mowing edging unknown','needs_details');
    assert.equal(has(uncertain.request.customerInputs,'edgingIncluded'),false);
    assert.equal(has(uncertain.request.customerInputs,'edgingLengthLF'),false);
    await editAfterNeedsDetails();await select('Lawn edging selected','true');
    assert.equal(await page.getByLabel('Measured edging length',{exact:true}).inputValue(),'');
    await fill('Measured edging length',100);
    const expected=changed(base,{edgingIncluded:true,edgingLengthLF:100});
    const prepared=await prepare('mowing edging unknown back to on');
    await final('mowing edging unknown back to on',prepared,expected,[16000]);
    assert.deepEqual(base,original);
  });

  await t.test('actual public handlers remain fail-closed for all five contradictory bodies and stale proofs',async()=>{
    const contradictions=[
      ['LANDSCAPING_MULCH',changed(fixtures.get('LANDSCAPING_MULCH').customerInputs,{inputMethod:'yards',mulchArea:2.75,mulchDepth:3})],
      ['CONCRETE_DRIVEWAY',changed(fixtures.get('CONCRETE_DRIVEWAY').customerInputs,{dimensionMethod:'measured_area_perimeter',areaSqft:500,perimeterLF:120})],
      ['FLOORING_REPLACEMENT',changed(fixtures.get('FLOORING_REPLACEMENT').customerInputs,{subfloorIssues:false,subfloorRepairAreaSqft:30})],
      ['LANDSCAPING_PLANTING',changed(fixtures.get('LANDSCAPING_PLANTING').customerInputs,{mulchNeeded:false})],
      ['LANDSCAPING_MOWING',changed(fixtures.get('LANDSCAPING_MOWING').customerInputs,{edgingIncluded:false,edgingLengthLF:100})]
    ];
    for(const [type,customerInputs] of contradictions){
      const service=byType.get(type),body={requestId:crypto.randomUUID(),serviceId:service.id,serviceRequest:service.name,customerInputs,customerFeeSelections:{},additionalWork:[],contact:{email:'contradiction-'+type.toLowerCase()+'@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
      const response=await app.request(publicPath+'/prepare',{method:'POST',body,publicRequest:true});
      assert.equal(response.status,200,`${type}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.status,'needs_details',type);
      assert.equal(row(body.requestId),undefined,`${type} contradiction created a receipt`);
    }
    const service=byType.get('LANDSCAPING_MOWING'),original={requestId:crypto.randomUUID(),serviceId:service.id,serviceRequest:service.name,customerInputs:clone(fixtures.get('LANDSCAPING_MOWING').customerInputs),customerFeeSelections:{},additionalWork:[],contact:{email:'stale-proof@example.invalid'},intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible'};
    const prepared=await app.request(publicPath+'/prepare',{method:'POST',body:original,publicRequest:true});
    assert.equal(prepared.status,200);assert.equal(prepared.body.status,'ready');
    const corrected=changed(original.customerInputs,{edgingIncluded:false},['edgingLengthLF']);
    const stale={...original,customerInputs:corrected,intakeConfirmation:prepared.body.confirmation};
    const rejected=await app.request(publicPath,{method:'POST',body:stale,publicRequest:true});
    assert.equal(rejected.status,409,JSON.stringify(rejected.body));
    assert.equal(row(original.requestId),undefined,'stale confirmation created a priced receipt');
  });

  assert.equal(completed,11);
  assert.equal(retryChecked,true);
  assert.deepEqual(pageErrors,[]);
});
