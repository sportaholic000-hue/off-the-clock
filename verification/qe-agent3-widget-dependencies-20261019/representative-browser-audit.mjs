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
import {auditFixtures,expectedCents} from './audit-fixtures.mjs';

const root=path.resolve(process.argv[2]||'.');
const out=path.resolve(process.argv[3]||path.join(root,'verification/qe-agent3-public-intake-review-20261019/browser-evidence'));
if(fs.existsSync(out))throw Error('Evidence directory already exists: '+out);
fs.mkdirSync(out,{recursive:true});
const safe=value=>JSON.parse(JSON.stringify(value,(key,item)=>['password','passwordHash','token','bookingToken','bookingTokenReceipt','intakeConfirmation'].includes(key)?'[SYNTHETIC SECRET OMITTED]':item));
const write=(name,value)=>fs.writeFileSync(path.join(out,name),typeof value==='string'?value:JSON.stringify(safe(value),null,2));
const cleanup=[];
const t={after:fn=>cleanup.unshift(fn)};
const fixtures=auditFixtures(),setupLog=[],cases=[],findings=[];
const browserCovered=new Set();
let app,browser,page;

function counts(owner='synthetic-a'){
  return Object.fromEntries(['quoteSubmissions','quotes','leads','quoteRequests'].map(table=>[table,app.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ownerId=?`).get(owner).n]));
}
function requestRows(requestId,owner='synthetic-a'){
  return {
    submission:app.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,requestId),
    quote:app.db.prepare('SELECT * FROM quotes WHERE ownerId=? AND id=(SELECT recordId FROM quoteSubmissions WHERE ownerId=? AND requestId=?)').get(owner,owner,requestId)
  };
}
function midValues(result){
  const estimate=result.resultType==='PARTIAL_ESTIMATE_READY'?result.pricedEstimate:result;
  return Array.isArray(estimate?.options)&&estimate.options.length?estimate.options.map(option=>option.midEstimate):[estimate?.midEstimate];
}
function has(object,key){return Object.hasOwn(object||{},key);}

try{
  app=await application(t);
  const owner='synthetic-a';
  async function api(method,url,body,{status=200,publicRequest=false}={}){
    const response=await app.request(url,{method,body,owner:publicRequest?null:owner,publicRequest});
    setupLog.push({method,url,status:response.status,response:response.body});
    assert.equal(response.status,status,`${method} ${url}: ${JSON.stringify(response.body)}`);
    return response.body;
  }

  const initial=await api('GET','/api/pricebook/'+owner);
  const rawServices=SERVICE_TYPES.map(type=>{
    const fixture=fixtures.get(type),service=structuredClone(fixture.ownerPricing);
    delete service.origin;delete service.quoteDoneApproval;delete service.startingValueState;delete service.startingValueAdoptions;delete service.dependentLineState;
    service.service='[SYNTHETIC PUBLIC INTAKE] '+type;
    service.validationInputs=structuredClone(fixture.customerInputs);
    service.tiers=[];
    return service;
  });
  const converted=convertApplicationBook({services:rawServices,defaults:{...fixtures.get('CUSTOM').businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
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
  for(const type of SERVICE_TYPES){
    saved=await api('GET','/api/pricebook/'+owner);
    const service=saved.services.find(item=>item.serviceType===type),validation=await api('POST','/api/pricebook/validate',saved);
    const status=validation.statuses.find(item=>item.serviceId===service.id);
    await api('POST','/api/pricebook/services/'+service.id+'/approve',{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});
  }
  const access=await api('POST','/api/quotedone/access',{allowedOrigins:[app.base]});
  const publicKey=access.publicKey,publicPath='/api/public/quote/'+publicKey;
  const catalog=await api('GET',publicPath,undefined,{publicRequest:true});
  assert.deepEqual(catalog.services.map(service=>service.serviceType).sort(),[...SERVICE_TYPES].sort());
  const byType=new Map(catalog.services.map(service=>[service.serviceType,service]));

  // Keep the preserved case logic but mount the production CustomerQuote
  // directly at the synthetic server origin. This still uses the real public
  // HTTP handlers while avoiding unrelated owner-app routing and built-asset
  // state in the representative browser harness.
  const built=await build({absWorkingDir:root,bundle:true,write:false,format:'iife',platform:'browser',
    define:{'process.env.NODE_ENV':JSON.stringify('production'),'import.meta.env':JSON.stringify({})},
    stdin:{loader:'jsx',resolveDir:root,contents:`
      import React from 'react';
      import {createRoot} from 'react-dom/client';
      import {CustomerQuote} from './client/src/quotedone.jsx';
      const publicKey=new URLSearchParams(location.search).get('publicKey');
      createRoot(document.getElementById('root')).render(<CustomerQuote publicKey={publicKey} persistResult/>);
    `}});
  const browserScript=built.outputFiles[0].text;

  const require=createRequire(import.meta.url);
  const playwrightModule=process.env.PUBLIC_INTAKE_PLAYWRIGHT_MODULE||'playwright';
  const playwright=require(playwrightModule),browserName=process.env.PUBLIC_INTAKE_BROWSER||'chromium';
  const browserType=playwright[browserName];
  assert.ok(browserType,`Unsupported Playwright browser: ${browserName}`);
  const browserExecutable=process.env.PUBLIC_INTAKE_BROWSER_EXECUTABLE||process.env.PUBLIC_INTAKE_CHROMIUM||undefined;
  browser=await browserType.launch({headless:true,executablePath:browserExecutable,...(browserName==='chromium'?{args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  page=await context.newPage();
  const harnessUrl=`${app.base}/qe-agent3-representative-widget`;
  await page.route(harnessUrl+'*',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+browserScript.replaceAll('</script','<\\/script')+'</script>'}));
  await page.goto(`${harnessUrl}?publicKey=${encodeURIComponent(publicKey)}`,{waitUntil:'networkidle'});
  const cacheKey='quotedone-pending-'+publicKey;

  function restoredSubmission(type,inputs,extra={}){
    const service=byType.get(type);
    return {
      requestId:crypto.randomUUID(),serviceId:service.id,serviceRequest:service.name,
      customerInputs:structuredClone(inputs),customerFeeSelections:{},additionalWork:[],
      contact:{email:`browser-${type.toLowerCase().replaceAll('_','-')}@example.invalid`},
      intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',...extra
    };
  }
  async function restore(type,inputs=fixtures.get(type).customerInputs,extra={}){
    const submission=restoredSubmission(type,inputs,extra);
    await page.evaluate(({key,submission})=>sessionStorage.setItem(key,JSON.stringify({kind:'editable',submission})),{key:cacheKey,submission});
    await page.reload({waitUntil:'networkidle'});
    await page.getByLabel('Service',{exact:true}).waitFor();
    assert.equal(await page.getByLabel('Service',{exact:true}).inputValue(),submission.serviceId);
    browserCovered.add(type);
    return submission;
  }
  async function clickPrepare(name){
    const before=counts();
    const requestPromise=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname===publicPath+'/prepare');
    await page.getByRole('button',{name:'Submit estimate request'}).click();
    const request=await requestPromise,response=await request.response();
    assert.ok(response,name+' did not receive a response');
    const requestBody=request.postDataJSON(),responseBody=await response.json();
    assert.equal(response.status(),200,name+' prepare HTTP status');
    await page.getByRole('heading',{name:'Check your job details'}).waitFor();
    assert.deepEqual(counts(),before,name+' prepare must not persist quote rows');
    assert.equal(requestRows(requestBody.requestId).submission,undefined,name+' prepare created a priced receipt');
    return {request:requestBody,response:responseBody,httpStatus:response.status()};
  }
  async function screenshot(name){
    const file=name.replace(/[^a-z0-9-]/gi,'-').toLowerCase()+'.png';
    await page.screenshot({path:path.join(out,file),fullPage:true});
    return file;
  }
  async function savePrepared(name){
    const requestPromise=page.waitForRequest(request=>request.method()==='POST'&&new URL(request.url()).pathname===publicPath);
    await page.getByRole('button',{name:'Get estimate'}).click();
    const request=await requestPromise,response=await request.response();
    assert.ok(response,name+' final request had no response');
    const requestBody=request.postDataJSON(),responseBody=await response.json();
    assert.equal(response.status(),201,name+' final HTTP status: '+JSON.stringify(responseBody));
    await page.getByRole('heading',{name:/^Estimate(?: for selected work)?$/}).waitFor();
    const rows=requestRows(requestBody.requestId);
    assert.ok(rows.submission&&rows.quote,name+' did not persist quote and receipt');
    assert.deepEqual(JSON.parse(rows.submission.originalSubmissionJson),requestBody,name+' persisted original request');
    assert.deepEqual(JSON.parse(rows.quote.customerInputsJson),requestBody.customerInputs,name+' persisted customer inputs');
    return {request:requestBody,response:responseBody,httpStatus:response.status(),recordId:rows.submission.recordId};
  }

  // Decimal inches are converted by the rendered fence control to decimal feet.
  await restore('FENCING_INSTALL');
  await page.getByLabel('Fence height whole feet').fill('5');
  await page.getByLabel('Fence height inches').fill('3.65');
  let observed=await clickPrepare('fence decimal conversion');
  assert.equal(observed.request.customerInputs.fenceHeight,5+3.65/12);
  cases.push({id:'B01',serviceType:'FENCING_INSTALL',pattern:'decimal inches to decimal feet',expected:{feet:5,inches:3.65,decimalFeet:5+3.65/12},observed,screenshot:await screenshot('B01-fence-decimal')});

  // Changing from total length to run measurements must remove every hidden total-only value.
  await restore('FENCING_INSTALL');
  await page.getByRole('button',{name:'Use section measurements'}).click();
  observed=await clickPrepare('fence total-to-sections');
  for(const key of ['linearFeet','gates','cornerCount','lfMethod','fenceRuns'])assert.equal(has(observed.request.customerInputs,key),false,'fence mode retained '+key);
  cases.push({id:'B02',serviceType:'FENCING_INSTALL',pattern:'hidden total fields cleared on run mode',expected:{omitted:['linearFeet','gates','cornerCount','lfMethod','fenceRuns']},observed,screenshot:await screenshot('B02-fence-hidden-fields')});

  // Editing a registered product clears only that product's stale identity receipt.
  await restore('ROOFING_REPAIR');
  await page.getByLabel('Roof repair type').fill('Shingle patch revised');
  observed=await clickPrepare('roof product edit');
  assert.equal(has(observed.request.customerInputs.confirmedFacts,'repairType'),false);
  assert.equal(has(observed.request.customerInputs.confirmedFacts,'roofType'),true);
  cases.push({id:'B03',serviceType:'ROOFING_REPAIR',pattern:'edited offering clears stale confirmation',expected:{repairTypeConfirmation:'omitted',roofTypeConfirmation:'retained'},observed,screenshot:await screenshot('B03-roof-confirmation')});

  async function hiddenDependentCase({id,type,selectLabel,selectValue,fill=[],staleKeys,title}){
    await restore(type);
    await page.getByLabel(selectLabel).selectOption(selectValue);
    for(const [label,value] of fill)await page.getByLabel(label).fill(value);
    const result=await clickPrepare(title),retained=staleKeys.filter(key=>has(result.request.customerInputs,key));
    if(retained.length){
      assert.equal(result.response.status,'needs_details',title+' hidden stale fields should be rejected');
      findings.push({id:`PI-${id.slice(1)}`,severity:'actionable',serviceType:type,boundary:'browser -> public prepare',title,retainedFields:retained,reproduction:[`Open ${type} with the recorded valid inputs.`,`Change ${selectLabel} to ${selectValue}.`,'Submit without being able to edit the now-hidden dependent field(s).'],expected:'The widget omits dependent values that no longer apply, allowing the corrected visible scope to be evaluated.',actual:`The request retains ${retained.join(', ')}; the public handler returns needs_details and creates no priced receipt.`});
    }
    const row={id,serviceType:type,pattern:'hidden dependent field transition',expected:{omitted:staleKeys},retained,observed:result,screenshot:await screenshot(id+'-'+type)};
    cases.push(row);return row;
  }

  await hiddenDependentCase({id:'B04',type:'LANDSCAPING_MULCH',selectLabel:'Mulch quantity method',selectValue:'yards',fill:[['Mulch volume','2.75']],staleKeys:['mulchDepth'],title:'mulch area-to-volume clears hidden depth'});
  await hiddenDependentCase({id:'B05',type:'CONCRETE_DRIVEWAY',selectLabel:'Slab measurement method',selectValue:'measured_area_perimeter',fill:[['Measured slab area','500'],['Measured slab perimeter','120']],staleKeys:['length','width'],title:'concrete method switch clears hidden dimensions'});
  await hiddenDependentCase({id:'B06',type:'FLOORING_REPLACEMENT',selectLabel:'Subfloor issues reported',selectValue:'false',staleKeys:['subfloorRepairAreaSqft'],title:'subfloor no clears hidden repair area'});
  await hiddenDependentCase({id:'B07',type:'LANDSCAPING_PLANTING',selectLabel:'Mulch included',selectValue:'false',staleKeys:['mulchYards','mulchType'],title:'planting mulch removal clears hidden scope'});
  await hiddenDependentCase({id:'B08',type:'LANDSCAPING_MOWING',selectLabel:'Lawn edging selected',selectValue:'false',staleKeys:['edgingLengthLF'],title:'mowing edging removal clears hidden length'});

  // Exact numeric input distinguishes omitted text from an explicit zero.
  await restore('LANDSCAPING_MOWING');
  await page.getByLabel('Measured mowable lawn area').fill('');
  const omitted=await clickPrepare('mowing omitted quantity');
  assert.equal(has(omitted.request.customerInputs,'yardSqft'),false);
  assert.equal(omitted.response.status,'needs_details');
  await restore('LANDSCAPING_MOWING');
  await page.getByLabel('Measured mowable lawn area').fill('0');
  const zero=await clickPrepare('mowing zero quantity');
  assert.equal(zero.request.customerInputs.yardSqft,0);
  assert.equal(zero.response.status,'needs_details');
  cases.push({id:'B09',serviceType:'LANDSCAPING_MOWING',pattern:'omitted versus zero numeric value',expected:{omitted:'property absent',zero:0},observed:{omitted,zero},screenshot:await screenshot('B09-omitted-vs-zero')});

  // Complete a one-time mowing correction through the rendered prepare and final pages.
  const oneTime={...fixtures.get('LANDSCAPING_MOWING').customerInputs,serviceFrequency:'one_time'};
  await restore('LANDSCAPING_MOWING',oneTime);
  const oneTimePrepared=await clickPrepare('one-time mowing');
  assert.equal(oneTimePrepared.response.status,'ready');
  const oneTimeSaved=await savePrepared('one-time mowing');
  assert.ok(midValues(oneTimeSaved.response).includes(248));
  assert.match(await page.locator('main').innerText(),/\$248\.00/);
  cases.push({id:'B10',serviceType:'LANDSCAPING_MOWING',pattern:'recurring-to-one-time completed customer path',expected:{cents:24800,frequency:'one_time'},observed:{prepare:oneTimePrepared,final:oneTimeSaved},screenshot:await screenshot('B10-mowing-one-time-result')});

  // Edit declared separate work in the widget, then verify partial output and persistence.
  await restore('FLAT_ROOF_REPAIR',fixtures.get('FLAT_ROOF_REPAIR').customerInputs,{additionalWork:['Synthetic detached shed inspection']});
  await page.getByLabel('Additional work for on-site estimate').fill('Synthetic detached garage inspection');
  const optionalPrepared=await clickPrepare('optional work changed');
  assert.equal(optionalPrepared.response.status,'ready');
  assert.deepEqual(optionalPrepared.request.additionalWork,['Synthetic detached garage inspection']);
  const optionalSaved=await savePrepared('optional work changed');
  assert.equal(optionalSaved.response.resultType,'PARTIAL_ESTIMATE_READY');
  assert.ok(midValues(optionalSaved.response).includes(expectedCents.FLAT_ROOF_REPAIR/100));
  assert.match(JSON.stringify(optionalSaved.response.additionalWork),/Synthetic detached garage inspection/);
  const optionalText=await page.locator('main').innerText();
  assert.match(optionalText,/Total for all requested work: not yet available\./);
  assert.match(optionalText,/Synthetic detached garage inspection/);
  cases.push({id:'B11',serviceType:'FLAT_ROOF_REPAIR',pattern:'optional work edited and completed partial path',expected:{pricedServiceCents:expectedCents.FLAT_ROOF_REPAIR,additionalWork:'separate; no fabricated total'},observed:{prepare:optionalPrepared,final:optionalSaved},screenshot:await screenshot('B11-optional-work-partial-result')});

  const browserUntested=SERVICE_TYPES.filter(type=>!browserCovered.has(type));
  write('setup-log.json',setupLog);
  write('browser-cases.json',cases);
  write('findings.json',findings);
  write('coverage.json',{httpCoveredElsewhere:[...SERVICE_TYPES],browserCovered:[...browserCovered],browserUntested});
  write('source-binding.json',{
    head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    branch:execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim(),
    node:process.version,abi:process.versions.modules,playwrightModule,browserName,browserExecutable:browserExecutable||'playwright default',
    publicOrigin:app.base,liveProviders:false,registeredServices:[...SERVICE_TYPES]
  });
  write('result.json',{status:'passed',caseCount:cases.length,browserServiceCount:browserCovered.size,browserUntested,actionableFindings:findings.length});
  console.log(JSON.stringify({status:'passed',caseCount:cases.length,browserServices:browserCovered.size,findings:findings.length}));
}catch(error){
  findings.push({severity:'harness-or-assertion',message:error.message,stack:error.stack});
  write('browser-cases.partial.json',cases);write('findings.json',findings);write('result.json',{status:'failed',error:error.stack,caseCount:cases.length});
  console.error(error.stack);process.exitCode=1;
}finally{
  try{await browser?.close();}catch(error){console.error('browser cleanup:',error.stack);process.exitCode=1;}
  for(const fn of cleanup)try{await fn();}catch(error){console.error('cleanup:',error.stack);process.exitCode=1;}
}
