import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';

// The actual onboarding price-book component, controls, API client and React.
// Only expose its existing local component to the test entry; HTTP is deferred
// to exercise the interval between owner confirmation and the save response.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=readFileSync(path.join(root,'client/src/onboarding.jsx'),'utf8');
let browser,bundle;
before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  const result=await build({absWorkingDir:root,stdin:{loader:'jsx',resolveDir:root,contents:
    "import React from 'react';import{createRoot}from'react-dom/client';import{PriceBookStep}from'./client/src/onboarding.jsx';const root=createRoot(document.getElementById('root'));window.mount=props=>root.render(<PriceBookStep {...props}/>);"},
    plugins:[{name:'expose-pricebook-step',setup(build){build.onLoad({filter:/[/\\]onboarding\.jsx$/},()=>({contents:source.replace('function PriceBookStep(', 'export function PriceBookStep('),loader:'jsx',resolveDir:path.join(root,'client/src')}));}}],
    bundle:true,write:false,outfile:path.join(root,'onboarding-test.js'),format:'iife',platform:'browser',define:{'import.meta.env.VITE_API_URL':'"http://pricebook-interview.test"','process.env.NODE_ENV':'"development"'},logLevel:'silent'});
  bundle=result.outputFiles[0].text;
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
after(async()=>{await browser?.close();});

async function interview({structured=false,failure=false}={},run){
  const type=structured?'LANDSCAPING_MOWING':'CUSTOM',service=applicationMetadata().services.find(s=>s.serviceType===type);
  const first=service.fields.find(f=>f.field===(structured?'frequencyMultipliers':'price'));
  const second=service.fields.find(f=>f.field===(structured?'minimumServiceCharge':'minimumJob'));
  let draft={id:'[SYNTHETIC]-draft',fields:{[type]:structured?{frequencyMultipliers:{weekly:1,biweekly:1.2,monthly:1.5,one_time:1.8}}:{unit:'flat',customPricingMode:'fixed'}},confirmedFields:{[type]:[]}};
  const requests=[];let release,started;const pending=new Promise(resolve=>{release=resolve;}),waiting=new Promise(resolve=>{started=resolve;});
  const page=await browser.newPage();
  try{
    await page.route('http://pricebook-interview.test/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'});
      if(request.method()==='GET')return json(url.pathname==='/api/pricebook/interview'?{drafts:structured?[draft]:[]}:{draft});
      if(request.method()==='POST')return json({draft});
      if(request.method()==='PUT'){
        const body=request.postDataJSON();requests.push(body);if(requests.length===1){started();await pending;}
        if(failure&&requests.length===1)return json({error:'[SYNTHETIC] save was not accepted'},409);
        draft={...draft,fields:{...draft.fields,[type]:{...draft.fields[type],...body.fields[type]}},confirmedFields:body.confirmedFields,currentField:body.currentField};
        return json({draft});
      }
      throw Error('Unexpected request '+request.method()+' '+url.pathname);
    });
    await page.goto('http://pricebook-interview.test/');
    await page.evaluate(({service,first,second})=>window.mount({state:{account:{id:'[SYNTHETIC]-owner',plan:'QuoteDone'},profile:{businessTypes:[service.serviceType]}},metadata:[{...service,fields:[first,second]}],back:()=>{},next:()=>{}}),{service,first,second});
    await page.getByRole('button',{name:structured?'Resume saved draft':'Start interview',exact:true}).click();
    const input=page.locator('.interview-field input').first();await input.waitFor();
    if(!structured)await input.fill('25');
    await page.getByRole('button',{name:'Read it back',exact:true}).click();
    const confirm=page.getByRole('button',{name:structured?'Yes, save these prices':'Yes, save this number',exact:true});
    await confirm.click();await waiting;
    await run({page,input,confirm,release,requests,first,second,type,draft:()=>draft});
  } finally {release();await page.close();}
}

test('pending manual save preserves a newer numeric edit and its question',async()=>{
  await interview({},async({page,input,release,requests,first,second,type})=>{
    await input.fill('50');release();
    await page.waitForFunction(()=>!document.querySelector('button:disabled')||[...document.querySelectorAll('button')].some(b=>b.textContent==='Read it back'&&!b.disabled));
    assert.equal(await input.inputValue(),'50');assert.equal(await page.getByText('1 / 2', {exact:false}).count(),1);
    assert.equal(requests[0].fields[type][first.field],25);
    await page.getByRole('button',{name:'Read it back',exact:true}).click();
    await page.getByRole('button',{name:'Yes, save this number',exact:true}).click();
    await page.getByLabel(second.label,{exact:true}).waitFor();
    assert.equal(requests.length,2);assert.equal(requests[1].fields[type][first.field],50);
  });
});
test('pending manual save preserves a newer structured price-map edit',async()=>{
  await interview({structured:true},async({page,input,release,requests,type})=>{
    await input.fill('1.25');release();
    await page.getByRole('button',{name:'Read it back',exact:true}).waitFor();
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Read it back'&&!b.disabled));
    assert.equal(await input.inputValue(),'1.25');assert.equal(requests[0].fields[type].frequencyMultipliers.weekly,1);
    assert.equal(await page.getByText('1 / 2',{exact:false}).count(),1);
  });
});
test('pending manual save prevents duplicate confirmation and premature review',async()=>{
  await interview({},async({page,confirm,release,requests,second})=>{
    assert.equal(await confirm.isDisabled(),true);
    assert.equal(await page.getByRole('button',{name:'Review captured values in editor',exact:true}).isDisabled(),true);
    assert.equal(requests.length,1);release();await page.getByLabel(second.label,{exact:true}).waitFor();
  });
});
test('unchanged confirmed value saves once and advances normally',async()=>{
  await interview({},async({page,release,requests,first,second,type,draft})=>{
    release();await page.getByLabel(second.label,{exact:true}).waitFor();
    assert.equal(requests.length,1);assert.equal(draft().fields[type][first.field],25);
    assert.equal(await page.getByLabel(second.label,{exact:true}).inputValue(),'');
  });
});
test('failed manual save keeps the confirmed value available for retry',async()=>{
  await interview({failure:true},async({page,input,confirm,release,requests,second})=>{
    release();await page.getByText('[SYNTHETIC] save was not accepted',{exact:true}).waitFor();
    assert.equal(await input.inputValue(),'25');assert.equal(await confirm.isDisabled(),false);
    await confirm.click();await page.getByLabel(second.label,{exact:true}).waitFor();assert.equal(requests.length,2);
  });
});
