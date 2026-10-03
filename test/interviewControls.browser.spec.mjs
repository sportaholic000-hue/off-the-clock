import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let browser,bundle;
before(async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
 const result=await build({absWorkingDir:root,stdin:{loader:'jsx',resolveDir:root,contents:
  "import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Question from './client/src/interviewStructured.jsx';function Editor({definition,initial}){const[value,setValue]=useState(initial);return <><Question definition={definition} value={value} onChange={setValue}/><output data-testid='answer'>{JSON.stringify(value)}</output></>}const root=createRoot(document.getElementById('root'));let version=0;window.mount=(definition,initial)=>root.render(<Editor key={++version} definition={definition} initial={initial}/>);"},
 bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':JSON.stringify('development')}});
 bundle=result.outputFiles[0].text;
});
after(async()=>{await browser?.close();});
async function withQuestion(definition,initial,run){
 const page=await browser.newPage();
 try{
  await page.route('http://interview-controls.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'}));
  await page.goto('http://interview-controls.test/');await page.evaluate(({definition,initial})=>window.mount(definition,initial),{definition,initial});await page.locator('output').waitFor();
  await run(page,async()=>JSON.parse(await page.locator('output').textContent()));
 }finally{await page.close();}
}
test('F11 browser boolean leaves preserve No, unanswered and the exact key',async()=>{
 await withQuestion({type:'json',field:'postsIncludedInMaterial',label:'Posts included',tree:{leafType:'boolean'}},{wood:false},async(page,answer)=>{
  const input=page.getByLabel('Posts included Wood',{exact:true});assert.equal(await input.inputValue(),'false');
  await input.selectOption('');assert.deepEqual(await answer(),{});
  // Re-create the exact owner offering; blank does not become a free/false answer.
  await page.getByLabel('Posts included product name',{exact:true}).fill('wood');await page.getByRole('button',{name:'Add offering',exact:true}).click();
  await input.selectOption('false');assert.deepEqual(await answer(),{wood:false});await input.selectOption('true');assert.deepEqual(await answer(),{wood:true});
 });
});
test('F11/F13 browser depth-three values retain zero, fractional rates and rejected text',async()=>{
 const definition={type:'json',field:'repairHours',label:'Repair hours',tree:{depth:3,leafKeys:['small','medium','large']},shapedKeys:{nested:['small','medium','large']}};
 await withQuestion(definition,{asphalt_shingle:{leak_patch:{small:0,medium:0.0051,large:3}}},async(page,answer)=>{
  const input=page.getByLabel('Repair hours Asphalt shingle Leak patch Medium',{exact:true});
  assert.equal(await input.inputValue(),'0.0051');assert.equal(await page.getByLabel('Repair hours Asphalt shingle Leak patch Small',{exact:true}).inputValue(),'0');
  await input.fill('1.0000000000000001');assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal((await answer()).asphalt_shingle.leak_patch.medium,'1.0000000000000001');
  await input.fill('');assert.equal(Object.hasOwn((await answer()).asphalt_shingle.leak_patch,'medium'),false);
  await input.fill('0.0051');assert.equal((await answer()).asphalt_shingle.leak_patch.medium,0.0051);
  // Switching questions remounts only the question controls, not another field's text.
  await page.evaluate(()=>window.mount({type:'json',label:'Other',tree:{leafType:'boolean'}},{wood:false}));assert.equal(await page.getByLabel('Other Wood',{exact:true}).inputValue(),'false');
 });
});
test('F13 browser legacy flat and two-level controls use the same exact parser',async()=>{
 for(const nested of [false,true]){
  const definition={type:'json',label:'Legacy rate',moneyKind:'unit_rate',shapedKeys:nested?{nested:['small','medium','large']}:{keys:null}};
  await withQuestion(definition,nested?{wood:{small:0,medium:2,large:3}}:{wood:0},async(page,answer)=>{
   const input=page.getByLabel(nested?'Wood Small':'Wood price',{exact:true});
   assert.equal(await input.inputValue(),'0');await input.fill('1.0000000000000001');assert.equal(await input.inputValue(),'1.0000000000000001');assert.equal(await input.getAttribute('aria-invalid'),'true');
   const read=()=>answer().then(value=>nested?value.wood.small:value.wood);
   assert.equal(await read(),'1.0000000000000001');await input.fill('0.0051');assert.equal(await read(),0.0051);
  });
 }
});
