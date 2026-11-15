// Astra round 2 on d54a6e6d, step 1: the real onboarding interview shows each question's own
// help, and a choice question is confirmed as an answer, not a number.
import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {BUILDING_AGE_OWNER_COPY} from '../server/quote-engine-vnext/buildingAgeRules.js';

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

async function question(type,fieldName,answer){
  const service=applicationMetadata().services.find(s=>s.serviceType===type),field=service.fields.find(f=>f.field===fieldName);
  assert.ok(field,type+' '+fieldName);
  const draft={id:'[SYNTHETIC]-draft',revision:'revision-1',fields:{[type]:{}},confirmedFields:{[type]:[]}};
  const page=await browser.newPage();
  try{
    await page.route('http://pricebook-interview.test/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      const json=body=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'});
      if(request.method()==='GET')return json(url.pathname==='/api/pricebook/interview'?{drafts:[]}:{draft});
      return json({draft});
    });
    await page.goto('http://pricebook-interview.test/');
    await page.evaluate(({service,field})=>window.mount({state:{account:{id:'[SYNTHETIC]-owner',plan:'QuoteDone'},profile:{businessTypes:[service.serviceType]}},metadata:[{...service,fields:[field],interviewFields:[]}],back:()=>{},next:()=>{}}),{service,field});
    await page.getByRole('button',{name:'Start interview',exact:true}).click();
    await page.locator('.field-label',{hasText:field.label}).first().waitFor();
    const help=await page.locator('.field-help').allTextContents();
    await answer(page,field);
    await page.getByRole('button',{name:'Read it back',exact:true}).click();
    const buttons=await page.getByRole('button').allTextContents();
    return {field,help,buttons};
  }finally{await page.close();}
}

for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING'])test(`interview: ${type} lead-paint question shows its help and is confirmed as an answer`,async()=>{
  const {field,help,buttons}=await question(type,'leadSafePainting',async page=>{await page.locator('select').last().selectOption('review_before_1978');});
  assert.equal(field.label,BUILDING_AGE_OWNER_COPY.leadSafePainting.label);
  assert.ok(help.includes(BUILDING_AGE_OWNER_COPY.leadSafePainting.help),JSON.stringify(help));
  assert.match(help.join(' '),/Health Canada says homes built before 1960 probably have lead paint and paint from 1960 to 1990 may contain lead/);
  assert.ok(buttons.includes('Yes, save this answer'),JSON.stringify(buttons));
  assert.ok(!buttons.includes('Yes, save this number'));
});
test('interview: a number question shows its own help and keeps "Yes, save this number"',async()=>{
  const {field,help,buttons}=await question('CUSTOM','minimumJob',async page=>{await page.locator('.interview-field input').first().fill('25');});
  assert.ok(field.help,'metadata help exists');
  assert.ok(help.includes(field.help),JSON.stringify(help));
  assert.ok(buttons.includes('Yes, save this number'),JSON.stringify(buttons));
});
