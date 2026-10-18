import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';

// Real Chromium interaction with the unchanged shared React editor input.
// The field props come from actual server editor metadata. Expected first:
// invalid1.005 stays visible as raw text/aria-invalid=true; valid1.01 commits
// as a number; measured1.005 remains a number, with no precision error.
let browser,bundle;
before(async()=>{
  const {chromium}=createRequire(import.meta.url)(process.env.PRICEBOOK_BROWSER_MODULE||'playwright');
  browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PRICEBOOK_BROWSER_EXECUTABLE?{executablePath:process.env.PRICEBOOK_BROWSER_EXECUTABLE}:{})});
  const fields=applicationMetadata().services.find(row=>row.serviceType==='ROOFING_REPLACEMENT').fields;
  const selected=Object.fromEntries(['pipeJackEach','valleyPerLF'].map(key=>[key,fields.find(row=>row.field===key)]));
  bundle=(await build({bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},stdin:{resolveDir:process.cwd(),loader:'jsx',contents:`
    import React,{useState} from 'react';import{createRoot}from'react-dom/client';
    import {ExactNumericInput} from './client/src/pricebookInputs.jsx';
    const fields=${JSON.stringify(selected)};
    function App(){const [values,setValues]=useState({base:1,tier:1,measured:1});window.__values=values;
      return <>{[['base','pipeJackEach'],['tier','pipeJackEach'],['measured','valleyPerLF']].map(([key,field])=><ExactNumericInput key={key} aria-label={key} value={values[key]} kind={fields[field].moneyKind} wholeCents={fields[field].wholeCents} onChange={value=>setValues(before=>({...before,[key]:value}))}/>)}</>;}
    createRoot(document.getElementById('root')).render(<App/>);`}})).outputFiles[0].text;
});
after(async()=>{await browser?.close();});

test('Agent 2 F16 Chromium: fixed each input rejects fractional cents without rounding; measured input retains them',async()=>{
  const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle});
    for(const label of ['base','tier']){
      const input=page.getByRole('textbox',{name:label,exact:true});
      await input.fill('1.005');
      assert.equal(await input.inputValue(),'1.005');
      assert.equal(await input.getAttribute('aria-invalid'),'true');
      assert.equal(await page.evaluate(key=>window.__values[key],label),'1.005','invalid text must remain in the draft');
      assert.match(await page.getByRole('alert').last().textContent(),/whole.cent|precision/i);
      await input.fill('1.01');
      assert.equal(await input.getAttribute('aria-invalid'),'false');
      assert.equal(await page.evaluate(key=>window.__values[key],label),1.01);
    }
    const measured=page.getByRole('textbox',{name:'measured',exact:true});await measured.fill('1.005');
    assert.equal(await measured.inputValue(),'1.005');assert.equal(await measured.getAttribute('aria-invalid'),'false');
    assert.equal(await page.evaluate(()=>window.__values.measured),1.005);
    assert.equal(await page.getByRole('alert').count(),0);assert.deepEqual(errors,[]);
  }finally{await page.close();}
});
