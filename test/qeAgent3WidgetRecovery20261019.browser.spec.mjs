import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {build} from 'esbuild';
import {application} from './fixtures/bookingCalendarApplication20261006.mjs';
import {convertApplicationBook} from '../server/src/quoteDoneBridge.js';
import {auditFixtures} from '../verification/qe-agent3-widget-dependencies-20261019/audit-fixtures.mjs';

// Independent arithmetic was recorded in EXPECTED.md before this suite ran.
const EXPECTED={original:{cents:16000,range:'$144 – $176',area:5000},corrected:{cents:27000,range:'$243 – $297',area:10000},
  revised:{cents:21500,range:'$193.50 – $236.50',area:5000},cleanup:{cents:40000,range:'$360 – $440',area:1000}};
const MOWING='LANDSCAPING_MOWING',CLEANUP='LANDSCAPING_CLEANUP';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const copy=value=>structuredClone(value);

test('qe-agent3 widget request races and persisted recovery through real public HTTP',{timeout:240_000},async t=>{
  const app=await application(t),owner='synthetic-a',fixtures=auditFixtures(),evidence={node:process.version,expected:EXPECTED,cases:[],sources:{}};
  for(const file of ['client/src/quotedone.jsx','client/src/quoteSubmission.js',path.relative(process.cwd(),new URL(import.meta.url).pathname)])
    evidence.sources[file]=crypto.createHash('sha256').update(readFileSync(file)).digest('hex');
  const output=process.env.A3_RECOVERY_EVIDENCE;
  const record=()=>{if(output){mkdirSync(output,{recursive:true});writeFileSync(path.join(output,'results.json'),JSON.stringify(evidence,null,2)+'\n');}};
  async function ownerApi(method,url,body){
    const res=await app.request(url,{method,body,owner});
    assert.equal(res.status,200,`${method} ${url}: ${JSON.stringify(res.body)}`);return res.body;
  }
  async function approveAll(){
    let saved=await ownerApi('GET','/api/pricebook/'+owner);
    for(let pass=0;pass<3;pass++){
      const actionable=saved.services.some(s=>Object.keys(s.startingValueState||{}).length||Object.values(s.dependentLineState||{}).some(v=>!v.confirmed||!v.reentered));
      if(!actionable)break;
      for(const s of saved.services){
        const start=Object.keys(s.startingValueState||{}),dependent=Object.keys(s.dependentLineState||{});
        if(start.length)s.startingValueActions={confirmPaths:start};
        if(dependent.length)s.dependentLineActions={reenteredIds:dependent,confirmIds:dependent};
      }
      await ownerApi('POST','/api/pricebook/save',saved);saved=await ownerApi('GET','/api/pricebook/'+owner);
    }
    for(const type of [MOWING,CLEANUP]){
      saved=await ownerApi('GET','/api/pricebook/'+owner);
      const service=saved.services.find(s=>s.serviceType===type),validation=await ownerApi('POST','/api/pricebook/validate',saved);
      const status=validation.statuses.find(s=>s.serviceId===service.id);
      await ownerApi('POST',`/api/pricebook/services/${service.id}/approve`,{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true,fields:status.confirmationFields||[]});
    }
  }
  const initial=await ownerApi('GET','/api/pricebook/'+owner);
  const services=[MOWING,CLEANUP].map(type=>{
    const s=copy(fixtures.get(type).ownerPricing);
    for(const k of ['origin','quoteDoneApproval','startingValueState','startingValueAdoptions','dependentLineState'])delete s[k];
    s.service='[SYNTHETIC A3 RECOVERY] '+type;s.validationInputs=copy(fixtures.get(type).customerInputs);s.tiers=[];return s;
  });
  const book=convertApplicationBook({services,defaults:{...fixtures.get(MOWING).businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}},'toDollars');
  await ownerApi('POST','/api/pricebook/save',{...initial,services:book.services,defaults:book.defaults});await approveAll();
  const {publicKey}=await ownerApi('POST','/api/quotedone/access',{allowedOrigins:[app.base]});
  const publicPath='/api/public/quote/'+publicKey,cacheKey='quotedone-pending-'+publicKey;
  const catalog=(await app.request(publicPath,{publicRequest:true})).body,byType=new Map(catalog.services.map(s=>[s.serviceType,s]));
  assert.equal(byType.size,2);
  const require=createRequire(import.meta.url),{chromium}=require(process.env.PUBLIC_INTAKE_PLAYWRIGHT_MODULE||'playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.PUBLIC_INTAKE_BROWSER_EXECUTABLE||process.env.PRICEBOOK_BROWSER_EXECUTABLE||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  evidence.chromium=browser.version();t.after(async()=>{record();t.diagnostic('A3_RECOVERY_EVIDENCE_GZIP_BASE64 '+gzipSync(JSON.stringify(evidence)).toString('base64'));await browser.close();});
  const bundle=await build({bundle:true,write:false,format:'iife',platform:'browser',
    define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
      import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
      import {CustomerQuote} from './client/src/quotedone.jsx';
      import {createWidgetRequest} from './client/src/widgetTransport.js';
      const config=JSON.parse(document.getElementById('config').textContent);
      const transport=createWidgetRequest(location.origin);window.a3Settled=[];
      const request=async(path,options)=>{try{return await transport(path,options);}finally{window.a3Settled.push({path,body:options?.body});}};
      function Harness(){const [key,setKey]=useState(config.publicKey);window.a3SetKey=setKey;
        return <>{Array.from({length:config.two?2:1},(_,i)=><section id={'widget-'+i} key={i}>
          <CustomerQuote publicKey={key} request={request} persistResult progressive={config.progressive} renderNextSteps={()=>null}/>
        </section>)}</>;}
      createRoot(document.getElementById('root')).render(<Harness/>);
    `}});
  const script=bundle.outputFiles[0].text;
  function counts(){return Object.fromEntries(['quoteSubmissions','quotes','leads','quoteRequests'].map(table=>[table,app.db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ownerId=?`).get(owner).n]));}
  function receipt(id){return app.db.prepare('SELECT * FROM quoteSubmissions WHERE ownerId=? AND requestId=?').get(owner,id);}
  function assertAdded(before,n){assert.deepEqual(counts(),Object.fromEntries(Object.entries(before).map(([k,v])=>[k,v+n])));}
  const draft=(type=MOWING,patch={})=>({requestId:crypto.randomUUID(),serviceId:byType.get(type).id,serviceRequest:byType.get(type).name,
    customerInputs:copy(fixtures.get(type).customerInputs),customerFeeSelections:{},additionalWork:[],contact:{email:'a3-recovery@example.invalid'},
    intakeFlow:'job-details-v1',context:'',explicitUnknowns:'',urgency:'flexible',...patch});

  async function scenario(name,run,config={}){
    await t.test(name,{timeout:35_000},async()=>{
      const ctx=await browser.newContext(),page=await ctx.newPage(),log={name,requests:[],before:counts()},barriers=[];
      evidence.cases.push(log);page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
      const url=app.base+'/a3-widget-recovery';
      await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script id="config" type="application/json">'+JSON.stringify({publicKey,...config})+'</script><script>'+script.replaceAll('</script','<\\/script')+'</script>'}));
      if(!config.two)await ctx.addInitScript(({cacheKey,draft})=>{if(!sessionStorage.getItem('a3-seeded')){sessionStorage.setItem(cacheKey,JSON.stringify({kind:'editable',submission:draft}));sessionStorage.setItem('a3-seeded','yes');}},{cacheKey,draft:draft()});
      // Every API response comes from the production HTTP server; these barriers
      // only control delivery AFTER its handler has returned/committed.
      await page.route('**/api/public/quote/**',async route=>{
        const req=route.request(),row={method:req.method(),path:new URL(req.url()).pathname,raw:req.postData(),request:req.postDataJSON()};
        log.requests.push(row);
        // Preserve native Fetch Metadata on same-origin catalogue GETs. The
        // public origin guard intentionally rejects APIRequestContext GETs.
        if(req.method()==='GET'){await route.continue();return;}
        const barrier=barriers.find(b=>!b.used&&b.match(row));if(barrier)barrier.used=true;
        try{
          const response=await route.fetch();row.status=response.status();row.response=await response.json();
          if(barrier){barrier.row=row;barrier.arrived.resolve(row);const action=await barrier.release.promise;if(action==='abort'){await route.abort('failed');return;}}
          await route.fulfill({response});
        }catch(e){row.transportError=e.message;if(!page.isClosed())await route.abort().catch(()=>{});}
      });
      const widget=i=>page.locator('#widget-'+i),main=widget(0);
      const h={page,main,widget,log,counts,receipt,draft,byType,
        barrier(pathname=publicPath+'/prepare',method='POST'){
          const b={match:r=>r.path===pathname&&r.method===method,arrived:deferred(),release:deferred(),used:false};barriers.push(b);return b;
        },
        async settled(row){await page.waitForFunction(({path,id})=>window.a3Settled.some(r=>r.path===path&&r.body?.requestId===id),{path:row.path,id:row.request?.requestId});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));},
        async release(b,action){b.release.resolve(action);if(action!=='abort')await h.settled(b.row);},
        async request(body,pathname=publicPath){return page.evaluate(async({pathname,body})=>{const r=await fetch(pathname,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};},{pathname,body});},
        async fill(type,inputs=fixtures.get(type).customerInputs,root=main){
          const service=byType.get(type);await root.getByLabel('Service',{exact:true}).selectOption(service.id);
          const entries=Object.entries(inputs).sort(([a],[b])=>Number(b==='sqftMethod')-Number(a==='sqftMethod'));
          for(const [key,value] of entries){
            const field=service.customerFields.find(f=>f.name===key);if(!field||key==='confirmedFacts')continue;
            const control=root.getByLabel(field.label,{exact:true});
            if(typeof value==='boolean'||field.type==='enum')await control.selectOption(String(value));else await control.fill(String(value));
          }
          await root.getByLabel('Email',{exact:true}).fill('a3-recovery@example.invalid');
        },
        async submit(root=main){
          for(let step=0;step<25&&await root.getByRole('button',{name:'Continue',exact:true}).count();step++)await root.getByRole('button',{name:'Continue',exact:true}).click();
          const before=log.requests.length;await root.getByRole('button',{name:'Submit estimate request',exact:true}).click();
          await root.getByRole('heading',{name:'Check your job details',exact:true}).waitFor();
          const row=log.requests.slice(before).find(r=>r.path===publicPath+'/prepare'&&r.method==='POST');assert.equal(row.status,200);assert.equal(row.response.status,'ready');return row;
        },
        async confirm(expected=EXPECTED.original,root=main){
          const before=log.requests.length;await root.getByRole('button',{name:'Get estimate',exact:true}).click();
          await root.getByRole('heading',{name:'Estimate',exact:true}).waitFor();
          const row=log.requests.slice(before).find(r=>r.path===publicPath&&r.method==='POST');h.assertSaved(row,expected);await h.display(expected,root);return row;
        },
        assertSaved(row,expected){
          assert.equal(row.status,201);assert.equal(row.response.resultType,'INSTANT_ESTIMATE_READY');
          const saved=receipt(row.request.requestId);assert.ok(saved);assert.deepEqual(JSON.parse(saved.originalSubmissionJson),row.request);
          assert.equal(JSON.parse(saved.customerResponseJson).quoteId,row.response.quoteId);
          const internal=JSON.parse(saved.internalOutcomeJson).internalResult;
          assert.deepEqual(internal.options.map(option=>option.calculationRecord.scenarios.mid.finalTotalCents),[expected.cents]);
          assert.equal(row.response.midEstimate,expected.cents/100);
          assert.equal(row.request.customerInputs.yardSqft,expected.area);
          const storedInputs=app.db.prepare('SELECT customerInputsJson FROM quotes WHERE ownerId=? AND id=?').get(owner,saved.recordId);
          assert.deepEqual(JSON.parse(storedInputs.customerInputsJson),row.request.customerInputs);
        },
        async display(expected,root=main){
          const text=await root.innerText();assert.ok(text.includes(expected.range),text);assert.match(text,/No tax added/i);
          assert.match(text,new RegExp(String(expected.area)+'(?: measured)? square feet'));
          if(expected!==EXPECTED.cleanup)assert.match(text,/per visit/);
          assert.doesNotMatch(text,/bookRevision|calculationRecord|mowingBaseRatePerSqft/);
        }
      };
      try{
        await page.goto(url,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelectorAll('select[aria-label="Service"] option').length>=3);
        if(!config.progressive&&!config.two)assert.equal(await main.getByLabel('Service',{exact:true}).inputValue(),byType.get(MOWING).id);
        await run(h);assert.deepEqual(errors,[]);log.passed=true;
      }catch(e){log.passed=false;log.failure=e.stack;throw e;}
      finally{
        log.display=await page.locator('#root').innerText().catch(()=>null);log.pageErrors=errors;
        log.after=counts();log.storage=await page.evaluate(()=>Object.fromEntries(Object.keys(sessionStorage).map(k=>[k,sessionStorage.getItem(k)]))).catch(()=>null);
        if(output){mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,name.split(' ')[0]+'.png'),fullPage:true}).catch(()=>{});}
        for(const b of barriers)b.release.resolve('abort');record();await ctx.close();
      }
    });
  }

  await scenario('R01 rapid double preparation and confirmation create one immutable receipt',async h=>{
    const before=counts(),prep=h.barrier();
    await h.main.getByRole('button',{name:'Submit estimate request',exact:true}).evaluate(b=>{b.click();b.click();});
    await prep.arrived.promise;assertAdded(before,0);await h.release(prep);
    assert.equal(h.log.requests.filter(r=>r.path.endsWith('/prepare')).length,1);
    const save=h.barrier(publicPath);
    await h.main.getByRole('button',{name:'Get estimate',exact:true}).evaluate(b=>{b.click();b.click();});
    const row=await save.arrived.promise;assertAdded(before,1);await h.release(save);
    assert.equal(h.log.requests.filter(r=>r.method==='POST'&&r.path===publicPath).length,1);
    h.assertSaved(row,EXPECTED.original);await h.display(EXPECTED.original);
    const stored=copy(receipt(row.request.requestId)),retry=await h.request(row.request);
    assert.equal(retry.status,200);assert.deepEqual(retry.body,row.response);assert.deepEqual(receipt(row.request.requestId),stored);assertAdded(before,1);
    h.log.saved=stored;
  });
  for(const reload of [false,true])await scenario(`R02${reload?'b':'a'} saved response lost then ${reload?'reload and ':''}retry recovers identical payload and receipt`,async h=>{
    const before=counts();await h.submit();const lost=h.barrier(publicPath);
    await h.main.getByRole('button',{name:'Get estimate',exact:true}).click();const row=await lost.arrived.promise;
    h.assertSaved(row,EXPECTED.original);const stored=copy(receipt(row.request.requestId));assertAdded(before,1);
    await h.release(lost,'abort');await h.main.getByRole('alert').waitFor();
    if(reload){await h.page.reload({waitUntil:'domcontentloaded'});await h.main.getByRole('button',{name:'Retry saved request',exact:true}).waitFor();}
    await h.main.getByRole('button',{name:'Retry saved request',exact:true}).click();await h.main.getByRole('heading',{name:'Estimate',exact:true}).waitFor();
    const retried=h.log.requests.filter(r=>r.method==='POST'&&r.path===publicPath).at(-1);
    assert.equal(retried.raw,row.raw);assert.equal(retried.status,200);assert.deepEqual(retried.response,row.response);assert.deepEqual(receipt(row.request.requestId),stored);assertAdded(before,1);await h.display(EXPECTED.original);
  },{progressive:reload});
  await scenario('R03 delayed preparation cannot replace a corrected measured area',async h=>{
    const before=counts(),old=h.barrier();await h.main.getByRole('button',{name:'Submit estimate request',exact:true}).click();await old.arrived.promise;
    const label=byType.get(MOWING).customerFields.find(f=>f.name==='yardSqft').label;
    await h.main.getByLabel(label,{exact:true}).fill('10000');await h.release(old);
    assert.equal(await h.main.getByRole('heading',{name:'Check your job details',exact:true}).count(),0,'old prepared summary replaced a newer edit');
    assert.equal(await h.main.getByLabel(label,{exact:true}).inputValue(),'10000');assertAdded(before,0);
    const fresh=await h.submit();assert.equal(fresh.request.customerInputs.yardSqft,10000);assert.notEqual(fresh.request.requestId,old.row.request.requestId);
    await h.confirm(EXPECTED.corrected);assertAdded(before,1);
  });
  await scenario('R04 delayed preparation cannot replace a different selected service',async h=>{
    const before=counts(),old=h.barrier();await h.main.getByRole('button',{name:'Submit estimate request',exact:true}).click();await old.arrived.promise;
    await h.fill(CLEANUP);await h.release(old);
    assert.equal(await h.main.getByRole('heading',{name:'Check your job details',exact:true}).count(),0,'old service summary replaced the selected service');
    assert.equal(await h.main.getByLabel('Service',{exact:true}).inputValue(),byType.get(CLEANUP).id);assertAdded(before,0);
    const fresh=await h.submit();assert.equal(fresh.request.serviceId,byType.get(CLEANUP).id);await h.confirm(EXPECTED.cleanup);assertAdded(before,1);
  });
  await scenario('R05 superseded response cannot unlock a newer in-flight preparation',async h=>{
    const before=counts(),old=h.barrier();await h.main.getByRole('button',{name:'Submit estimate request',exact:true}).click();await old.arrived.promise;
    const label=byType.get(MOWING).customerFields.find(f=>f.name==='yardSqft').label;await h.main.getByLabel(label,{exact:true}).fill('10000');
    const next=h.barrier();const button=h.main.getByRole('button',{name:'Submit estimate request',exact:true});
    assert.equal(await button.count(),1,'correction must permit a fresh preparation while the obsolete one is blocked');await button.click();await next.arrived.promise;
    await h.release(old);assert.equal(await h.main.getByRole('heading',{name:'Check your job details',exact:true}).count(),0);
    assert.equal(await h.main.getByRole('button',{name:'Checking request',exact:true}).isDisabled(),true,'obsolete finally cleared the newer request lock');
    await h.release(next);assert.match(await h.main.innerText(),/10000/);assertAdded(before,0);await h.confirm(EXPECTED.corrected);assertAdded(before,1);
  });
  await scenario('R06 same-key widget instances preserve independent completed and pending recovery on reload',async h=>{
    const before=counts(),a=h.widget(0),b=h.widget(1);await h.fill(MOWING,fixtures.get(MOWING).customerInputs,a);await h.fill(CLEANUP,fixtures.get(CLEANUP).customerInputs,b);
    const prepA=await h.submit(a),prepB=await h.submit(b);assert.notEqual(prepA.request.requestId,prepB.request.requestId);
    const savedA=await h.confirm(EXPECTED.original,a),lost=h.barrier(publicPath);await b.getByRole('button',{name:'Get estimate',exact:true}).click();const savedB=await lost.arrived.promise;
    h.assertSaved(savedB,EXPECTED.cleanup);assert.notEqual(savedA.response.quoteId,savedB.response.quoteId);await h.release(lost,'abort');await b.getByRole('alert').waitFor();assertAdded(before,2);
    const rows=[copy(receipt(savedA.request.requestId)),copy(receipt(savedB.request.requestId))];
    await h.page.reload({waitUntil:'domcontentloaded'});await h.page.waitForFunction(()=>document.querySelectorAll('main[aria-busy="false"]').length===2);
    assert.equal(await a.getByRole('heading',{name:'Estimate',exact:true}).count(),1,'first instance lost its completed receipt to the other instance');await h.display(EXPECTED.original,a);
    await b.getByRole('button',{name:'Retry saved request',exact:true}).click();await b.getByRole('heading',{name:'Estimate',exact:true}).waitFor();await h.display(EXPECTED.cleanup,b);
    assert.deepEqual([receipt(savedA.request.requestId),receipt(savedB.request.requestId)],rows);assertAdded(before,2);
    await a.getByRole('button',{name:'Start another request',exact:true}).click();await h.display(EXPECTED.cleanup,b);
  },{two:true});
  await scenario('R05b obsolete success cannot replace a newer completed preparation',async h=>{
    const before=counts(),old=h.barrier();await h.main.getByRole('button',{name:'Submit estimate request',exact:true}).click();await old.arrived.promise;
    const label=byType.get(MOWING).customerFields.find(f=>f.name==='yardSqft').label;await h.main.getByLabel(label,{exact:true}).fill('10000');
    assert.equal(await h.main.getByRole('button',{name:'Submit estimate request',exact:true}).count(),1);
    const fresh=await h.submit();await h.release(old);assert.match(await h.main.innerText(),/10000/);assertAdded(before,0);
    const saved=await h.confirm(EXPECTED.corrected);assert.equal(saved.request.requestId,fresh.request.requestId);assertAdded(before,1);
  });
  await scenario('R05c obsolete real validation error cannot overwrite a corrected preparation',async h=>{
    const before=counts();await h.main.getByLabel('Email',{exact:true}).fill('invalid');const old=h.barrier();
    await h.main.getByRole('button',{name:'Submit estimate request',exact:true}).click();await old.arrived.promise;assert.equal(old.row.status,422);
    await h.main.getByLabel('Email',{exact:true}).fill('corrected@example.invalid');
    assert.equal(await h.main.getByRole('button',{name:'Submit estimate request',exact:true}).count(),1);
    await h.submit();await h.release(old);assert.equal(await h.main.getByRole('alert').count(),0,'obsolete rejection appeared after corrected details were prepared');
    assert.match(await h.main.innerText(),/corrected@example.invalid/);assertAdded(before,0);await h.confirm();assertAdded(before,1);
  });
  await scenario('R07 public-key replacement rejects a delayed saved result without losing original recovery',async h=>{
    const before=counts();await h.submit();const save=h.barrier(publicPath);await h.main.getByRole('button',{name:'Get estimate',exact:true}).click();await save.arrived.promise;
    await h.page.evaluate(()=>window.a3SetKey('synthetic-missing-public-key'));await h.main.getByRole('alert').waitFor();await h.release(save);
    assert.equal(await h.main.getByRole('heading',{name:'Estimate',exact:true}).count(),0,'previous key response appeared in replacement widget');
    assert.equal(await h.page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)).kind,cacheKey),undefined,'old response must leave the pending recovery intact after unmount');
    await h.page.evaluate(key=>window.a3SetKey(key),publicKey);await h.main.getByRole('button',{name:'Retry saved request',exact:true}).click();await h.main.getByRole('heading',{name:'Estimate',exact:true}).waitFor();await h.display(EXPECTED.original);assertAdded(before,1);
  });
  await scenario('R08 owner revision rejects stale confirmation and historical retries stay immutable',async h=>{
    const before=counts();await h.submit();const original=await h.confirm();const originalRow=copy(receipt(original.request.requestId));
    await h.main.getByRole('button',{name:'Start another request',exact:true}).click();await h.fill(MOWING);const stale=await h.submit();
    const saved=await ownerApi('GET','/api/pricebook/'+owner);saved.services.find(s=>s.serviceType===MOWING).pricing.mowingBaseRatePerSqft=0.03;
    await ownerApi('POST','/api/pricebook/save',saved);await approveAll();
    await h.main.getByRole('button',{name:'Get estimate',exact:true}).click();await h.main.getByRole('alert').waitFor();
    const rejected=h.log.requests.filter(r=>r.method==='POST'&&r.path===publicPath).at(-1);assert.equal(rejected.status,409);assert.match(rejected.response.error,/pricing changed/);assert.equal(receipt(stale.request.requestId),undefined);assertAdded(before,1);
    const fresh=await h.submit();assert.notEqual(fresh.request.requestId,stale.request.requestId);assert.notDeepEqual(fresh.response.confirmation,stale.response.confirmation);await h.confirm(EXPECTED.revised);assertAdded(before,2);
    const retry=await h.request(original.request);assert.equal(retry.status,200);assert.deepEqual(retry.body,original.response);
    for(const patch of [{customerInputs:{...original.request.customerInputs,yardSqft:10000}},{contact:{email:'changed@example.invalid'}},{serviceId:byType.get(CLEANUP).id}]){
      const conflict=await h.request({...original.request,...patch});assert.equal(conflict.status,409);assert.match(conflict.body.error,/different submitted details/);
    }
    assert.deepEqual(receipt(original.request.requestId),originalRow);assertAdded(before,2);h.log.historicalReceipt=originalRow;
    const restore=await ownerApi('GET','/api/pricebook/'+owner);restore.services.find(s=>s.serviceType===MOWING).pricing.mowingBaseRatePerSqft=0.02;await ownerApi('POST','/api/pricebook/save',restore);await approveAll();
  });
});
