import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
const pause=()=>new Promise(resolve=>setTimeout(resolve,15));
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await pause();}assert.fail('Synthetic DOM condition timed out');}
const root=new URL('..',import.meta.url).pathname;

// The ZIP codes shown for a tax zone are always the ZIP codes priced: typing
// edits them, and a recovered or reloaded price book replaces them while the
// section stays mounted.
test('tax zone ZIP codes follow the price book after it is replaced while mounted',async t=>{
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    stdin:{resolveDir:root,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TaxLocationSettings} from './client/src/taxLocationEditor.jsx';
function App(){const [defaults,setDefaults]=useState(window.__defaults);window.__current=defaults;window.__replace=next=>setDefaults(next);
return <TaxLocationSettings defaults={defaults} onDefault={(field,value)=>setDefaults(previous=>({...previous,[field]:value}))}/>;}
createRoot(document.getElementById('root')).render(<App/>);`}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only'});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;w.eval('window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));');
  w.__defaults={currency:'USD',taxMode:'TAX_ALL',taxPercent:6,taxByJobLocation:true,taxZones:[{name:'[SYNTHETIC] Metro',codes:['98101'],percent:10}]};
  w.eval(output.outputFiles[0].text);
  const zip=()=>d.querySelector('[aria-label="Tax zone 1 ZIP codes"]');
  await until(()=>zip());
  assert.equal(zip().value,'98101');
  // Typing keeps the owner's text, including a trailing comma, and saves the codes.
  Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set.call(zip(),'98101, 981');
  zip().dispatchEvent(new w.Event('input',{bubbles:true}));await pause();
  assert.equal(zip().value,'98101, 981');assert.equal(JSON.stringify(w.__current.taxZones[0].codes),'["98101","981"]');
  // The server copy replaces the book: its ZIP is shown, not the old text.
  w.__replace({...w.__defaults,taxZones:[{name:'[SYNTHETIC] Spokane',codes:['99201'],percent:9}]});await pause();
  assert.equal(zip().value,'99201');assert.equal(JSON.stringify(w.__current.taxZones[0].codes),'["99201"]');
  // A removed row and a new row start from the book too.
  w.__replace({...w.__defaults,taxZones:[]});await pause();assert.equal(zip(),null);
  w.__replace({...w.__defaults,taxZones:[{name:'[SYNTHETIC] Downtown',codes:['98104'],percent:10.25}]});await pause();
  assert.equal(zip().value,'98104');
});
