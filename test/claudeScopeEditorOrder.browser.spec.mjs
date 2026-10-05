import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
// Rendered check: scope entries of the same kind stay together and are named
// by the facts they match (stories, thickness band, reinforcement, access).
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let browser,bundle;
before(async()=>{
 const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
 browser=await chromium.launch({headless:true,...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
 const result=await build({absWorkingDir:root,bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"production"'},loader:{'.js':'jsx'},stdin:{loader:'jsx',resolveDir:root,contents:`
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {ScopeEditor} from './client/src/scopeEditor.jsx';
const siding={id:'s1',serviceType:'SIDING_REPLACEMENT',service:'Siding',pricing:{laborPerSqft:{vinyl:2.5},materialPerSqft:{vinyl:3},minimumJob:0,
 scopeDetails:{siding_removal:{description:'Remove one layer of vinyl siding',mode:'itemized',existingSidingType:'vinyl',stories:1,disposalIncluded:true},
  siding_removal__2:{description:'Remove one layer of vinyl siding',mode:'itemized',existingSidingType:'vinyl',stories:2,disposalIncluded:true}},
 scopeRates:{siding_removal_removal:0.8,siding_removal_disposal:0.2,siding_removal__2_removal:1.1,siding_removal__2_disposal:0.2}}};
const concrete={id:'c1',serviceType:'CONCRETE_DRIVEWAY',service:'Driveway',pricing:{laborPerSqft:6,concreteCostPerCubicYard:180,formworkPerLF:3,minimumJob:0,
 scopeDetails:{demolition:{description:'Break out and haul',mode:'itemized',maximumThickness:4,reinforcement:'wire_mesh',accessDifficulty:'easy',disposalIncluded:true},
  demolition__2:{description:'Break out and haul',mode:'itemized',minimumThickness:4,maximumThickness:6,reinforcement:'wire_mesh',accessDifficulty:'easy',disposalIncluded:true}},
 scopeRates:{demolition_removal:3,demolition_disposal:1,demolition__2_removal:4,demolition__2_disposal:1}}};
function One({initial}){const [s,setS]=useState(initial);return <ScopeEditor service={s} onChange={setS}/>;}
createRoot(document.getElementById('root')).render(<div style={{maxWidth:900,fontFamily:'sans-serif'}}><One initial={siding}/><hr/><One initial={concrete}/></div>);
`}});
 bundle=result.outputFiles[0].text;
});
after(async()=>{await browser?.close();});
test('scope editor groups entries of the same kind and names them by their matching facts',async()=>{
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.route('http://scope-editor-order.test/',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.replaceAll('</script','<\\/script')+'</script>'}));
  await page.goto('http://scope-editor-order.test/');
  await page.locator('h3').first().waitFor();
  assert.deepEqual(await page.locator('h3').allInnerTexts(),['Existing siding removal: vinyl, 1 story','Existing siding removal: vinyl, 2 stories','Siding trim installation','Existing slab demolition: up to 4 in, wire mesh, easy','Existing slab demolition: over 4 up to 6 in, wire mesh, easy','Additional exposed-aggregate finishing']);
  assert.equal(await page.getByText(/Covers slabs thicker than/).count(),2);
  assert.deepEqual(errors,[]);
 }finally{await page.close();}
});
