import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
let browser,bundle;
before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  const result=await build({stdin:{loader:'jsx',resolveDir:process.cwd(),contents:"import React from 'react';import {createRoot} from 'react-dom/client';import {KnowledgeStep} from './client/src/onboarding.jsx';const root=createRoot(document.getElementById('root'));window.mount=state=>root.render(<KnowledgeStep state={state} refresh={async()=>{window.refreshes++}} back={()=>{}} next={()=>{window.saved=true}}/>);window.refreshes=0;"},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'\"development\"','import.meta.env':'{}'},logLevel:'silent'});bundle=result.outputFiles[0].text;
});
after(async()=>browser?.close());
async function screen(t,draft){
  const page=await browser.newPage(),writes=[];t.after(()=>page.close());
  await page.route('http://knowledge.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'}));
  await page.route('http://knowledge.test/api/onboarding/knowledge-base**',route=>{
    const request=route.request();writes.push({url:request.url(),body:request.postDataJSON()});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(request.url().endsWith('/draft')?{status:'DRAFT',knowledgeBase:draft}:{profile:{knowledgeBase:request.postDataJSON()}})});
  });
  await page.goto('http://knowledge.test/');await page.evaluate(()=>window.mount({profile:{knowledgeBase:{about:'[SYNTHETIC] Business',hours:'Weekdays',prices:'[SYNTHETIC] Existing: $8',website:'https://business.example/'}}}));
  await page.getByRole('button',{name:'Draft from my business',exact:true}).waitFor();return {page,writes};
}
const excerpt='[SYNTHETIC] Cover charge: $20 Friday and Saturday.';
// Expected $8 and $20 were handwritten before execution in the website spec.
test('website owner screen shows an unsaved draft, literal prices and source; saves only on review',async t=>{
  const {page,writes}=await screen(t,{prices:excerpt,draft:true,websiteImport:{entries:[{excerpt,sourceUrl:'https://business.example/prices'}],message:'Website prices are a draft. Review before saving.'}});
  await page.getByRole('button',{name:'Draft from my business',exact:true}).click();
  await page.getByText('Website prices are a draft. Review before saving.',{exact:true}).waitFor();
  assert.equal(await page.getByLabel(/^Your prices/).inputValue(),'[SYNTHETIC] Existing: $8\n\n'+excerpt);
  assert.equal(await page.getByRole('link',{name:'https://business.example/prices'}).getAttribute('href'),'https://business.example/prices');
  assert.equal(writes.length,1);assert.ok(writes[0].url.endsWith('/draft'));assert.equal(await page.evaluate(()=>window.refreshes),0);
  await page.getByRole('button',{name:'Review and save',exact:true}).click();await page.waitForFunction(()=>window.saved===true);
  assert.equal(writes.length,2);assert.equal(writes[1].body.prices,'[SYNTHETIC] Existing: $8\n\n'+excerpt);
});
test('website owner screen says no prices found and preserves the current prices',async t=>{
  const {page,writes}=await screen(t,{prices:'',draft:true,websiteImport:{entries:[],message:'No literal prices were found in the pages read. Your saved prices have not changed.'}});
  await page.getByRole('button',{name:'Draft from my business',exact:true}).click();await page.getByText(/No literal prices were found/).waitFor();
  assert.equal(await page.getByLabel(/^Your prices/).inputValue(),'[SYNTHETIC] Existing: $8');assert.equal(writes.length,1);
});
