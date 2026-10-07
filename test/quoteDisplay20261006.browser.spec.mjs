import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {previewExport} from './quoteDisplayRender20261006.mjs';
import {roofingDisplayFixture,mowingDisplayFixture,missingFloorDisplayFixture,savedDisplayFixture} from './quoteDisplayFixtures20261006.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {bindVoiceQuoteInputs} from '../server/src/voice/voiceQuoteContract.js';
import {conciseVoiceSummary} from '../server/src/voice/voiceQuotePresentation.js';

let browser,script;
before(async()=>{
 const bundle=await build({bundle:true,write:false,format:'iife',plugins:[previewExport],define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
import {QuoteResult,QuoteRecordsList} from './client/src/quotedone.jsx';
import {TestPreview} from './client/src/pricebook.jsx';import Dashboard from './client/src/dashboard.jsx';
function Products(props){const [inputs,setInputs]=useState(props.value||{}),[result,setResult]=useState(null);return <><CustomerMeasurements {...props} value={inputs} onChange={setInputs}/><output id="inputs">{JSON.stringify(inputs)}</output><button onClick={async()=>setResult(await window.runQuote(inputs))}>Calculate synthetic quote</button><section id="result"><QuoteResult result={result}/></section></>;}
function Surfaces({result,preview,phone}){return <><section id="customer"><QuoteResult result={result}/></section><section id="records"><QuoteRecordsList rows={[{id:'synthetic-row',result}]} kind="quotes"/></section><section id="preview"><TestPreview preview={preview}/></section><p id="phone">{phone}</p></>;}
const root=createRoot(document.getElementById('root'));let key=0;window.showDisplay=(kind,props)=>flushSync(()=>root.render(React.createElement({products:Products,surfaces:Surfaces,dashboard:Dashboard,preview:TestPreview}[kind],{...props,key:++key})));`}});
 script=bundle.outputFiles[0].text;
 const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
});
after(async()=>{await browser?.close();});
async function pageFor(run){
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('http://quote-display.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+script.replaceAll('</script','<\\/script')+'</script>'}));
 await page.goto('http://quote-display.test/');
 const show=async(kind,props)=>{await page.evaluate(({kind,props})=>window.showDisplay(kind,props),{kind,props});};
 try{await run(page,show);assert.deepEqual(errors,[]);}finally{await page.close();}
}

test('display browser: all 15 product fields select names, invalidate confirmations, and roofing quotes $2520',async()=>pageFor(async(page,show)=>{
 const fields=bridge.applicationMetadata().services.flatMap(service=>service.customerFields.filter(field=>field.type==='slug').map(field=>({...field,serviceType:service.serviceType})));
 assert.equal(fields.length,15);
 for(const field of fields){
  const registered={asphalt_shingle:'00000000-0000-4000-8000-000000000001',other_product:'00000000-0000-4000-8000-000000000002',asphalt_shingle_premium:'00000000-0000-4000-8000-000000000003'},knownOfferings={[field.name]:registered};
  await show('products',{fields:[field],value:{[field.name]:''},knownOfferings});
  const input=page.getByLabel(field.label,{exact:true});await input.waitFor();
  assert.deepEqual(await page.locator('datalist option').evaluateAll(options=>options.map(option=>option.value)),['Asphalt shingle','Other product','Asphalt shingle premium']);
  await input.fill('Asphalt shingle');
  assert.equal(JSON.parse(await page.locator('#inputs').textContent())[field.name],'Asphalt shingle',field.serviceType+'.'+field.name+' must retain typed text');
  const confirmation=page.getByRole('checkbox');assert.equal(await confirmation.isChecked(),false);
  await confirmation.check();
  const expected=bindVoiceQuoteInputs({knownOfferings},{customerFields:[field]},{customerInputs:{[field.name]:'Asphalt shingle'},productConfirmations:{[field.name]:true}}).customerInputs;
  assert.deepEqual(JSON.parse(await page.locator('#inputs').textContent()),expected);
  await input.fill('Other product');assert.equal(await confirmation.isChecked(),false);
  let inputs=JSON.parse(await page.locator('#inputs').textContent());assert.equal(inputs.confirmedFacts?.[field.name],undefined);
  await confirmation.check();await confirmation.uncheck();inputs=JSON.parse(await page.locator('#inputs').textContent());assert.equal(inputs.confirmedFacts?.[field.name],undefined);
  await input.fill('Unregistered product');assert.equal(await page.getByRole('checkbox').count(),0);
  await input.fill('');await input.pressSequentially('Asphalt shingle premium');
  assert.equal(await input.inputValue(),'Asphalt shingle premium');await page.getByRole('checkbox').check();
  assert.equal(JSON.parse(await page.locator('#inputs').textContent())[field.name],'asphalt_shingle_premium');
 }
 const f=roofingDisplayFixture(),a=savedDisplayFixture(f),value={...f.customerInputs,existingRoofType:'',replacementRoofType:''};delete value.confirmedFacts;
 await page.exposeFunction('runQuote',inputs=>a.quote(inputs).customerResult);
 await show('products',{fields:a.definition.customerFields,value,knownOfferings:a.service.knownOfferings});
 for(const name of ['existingRoofType','replacementRoofType']){
  const field=a.definition.customerFields.find(f=>f.name===name),input=page.getByLabel(field.label,{exact:true});await input.fill('Asphalt shingle');
  await input.locator('..').getByRole('checkbox').check();
 }
 await page.getByRole('button',{name:'Calculate synthetic quote'}).click();await page.locator('#result strong').waitFor();
 assert.equal(await page.locator('#result strong').textContent(),'$2,520');
}));

test('display browser: actual dashboard and owner preview show production missing-price labels',async()=>pageFor(async(page,show)=>{
 const f=missingFloorDisplayFixture(),a=savedDisplayFixture(f,{approve:false}),expected='Material price per square foot by flooring type. · Tile';
 await page.route('http://quote-display.test/api/dashboard',route=>route.fulfill({json:{role:'staff',operator:{enabled:false,eligible:false,missing:[]},pricebookStatuses:[a.status]}}));
 await page.route('http://quote-display.test/api/onboarding/state',route=>route.fulfill({json:{profile:{knowledgeBase:{},calendar:{status:'not_connected'}}}}));
 await show('dashboard',{});await page.getByText(expected,{exact:true}).waitFor();
 assert.ok(!(await page.locator('main').textContent()).includes('materialPerSqft.tile'));
 await show('preview',{preview:a.preview(f.customerInputs)});await page.getByText(expected,{exact:true}).waitFor();
 assert.ok(!(await page.locator('aside').textContent()).includes('materialPerSqft.tile'));
}));

test('display browser: $172.50 minimum appears on all four surfaces and equal preview endpoints collapse',async()=>pageFor(async(page,show)=>{
 const f=mowingDisplayFixture(),a=savedDisplayFixture(f),result=a.quote(f.customerInputs).customerResult,preview=a.preview(f.customerInputs),phone=conciseVoiceSummary(result);
 await show('surfaces',{result,preview,phone});await page.locator('#customer strong').waitFor();
 for(const id of ['customer','records'])assert.equal(await page.locator('#'+id+' strong').textContent(),'$172.50 per visit');
 assert.equal(await page.locator('#preview .quote-low').textContent(),'$172.50');
 assert.equal(await page.locator('#preview .quote-high, #preview .quote-dash, #preview .quote-midpoint-row').count(),0);
 assert.equal(((await page.locator('#preview').textContent()).match(/\$172\.50/g)||[]).length,1);
 assert.ok((await page.locator('#phone').textContent()).includes('$172.50 CAD per visit. Includes applicable tax.'));
 assert.ok(!(await page.locator('#phone').textContent()).includes('..'));
}));
