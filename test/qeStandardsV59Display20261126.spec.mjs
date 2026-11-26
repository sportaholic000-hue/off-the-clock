// November 26, 2026 (v59). Internal field names shown on owner and customer
// screens (found while reading the remaining editor and widget files).
//
// Expectations written before execution:
// - A saved painting price that the chosen pricing method does not use is
//   listed under "Prices outside this selection" by its editor label and a
//   dollar amount, never by its stored field name.
// - Plant size prices name an unnamed size "Unnamed plant size N" and a retired
//   one "Retired plant size N", never "size_N".
// - The widget's appointment check labels the customer's details Name, Email
//   and Phone, not name, email and phone.
import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';
import * as bridge from '../server/src/quoteDoneBridge.js';

const root=fileURLToPath(new URL('..',import.meta.url));
let view;
before(async()=>{
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'node',format:'cjs',define:{'process.env.NODE_ENV':'"production"'},
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';
      import {OfferingEditor} from './client/src/offeringEditor.jsx';import {PlantSizePrices} from './client/src/PlantSizesEditor.jsx';import {WidgetBooking} from './client/src/widgetBooking.jsx';
      export const offering=props=>renderToStaticMarkup(<OfferingEditor {...props} onChange={()=>{}}/>);
      export const plants=props=>renderToStaticMarkup(<PlantSizePrices {...props} onChange={()=>{}}/>);
      export const booking=props=>renderToStaticMarkup(<WidgetBooking {...props}/>);`}});
  // The bundle is CommonJS (react-dom/server requires Node built-ins): load it from a scratch file.
  const directory=mkdtempSync(join(tmpdir(),'qe-v59-display-'));
  try{const file=join(directory,'view.cjs');writeFileSync(file,output.outputFiles[0].text);view=createRequire(import.meta.url)(file);}
  finally{rmSync(directory,{recursive:true,force:true});}
});
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ');

test('an unused painting price is listed by its label and dollar amount, not its stored field name',()=>{
  const meta=bridge.applicationMetadata().services.find(m=>m.serviceType==='INTERIOR_PAINTING');
  const installed=Object.keys(meta.offeringRateFields.installed),itemized=meta.offeringRateFields.itemized;
  const key=Object.keys(itemized).find(name=>!installed.includes(name)&&!['prepLaborPerSqft','prepMaterialPerSqft'].includes(name)&&!/^(?:primer|ceiling|installedCeiling)/.test(name));
  assert.ok(key,'an itemized-only price exists');
  const service={serviceType:'INTERIOR_PAINTING',pricing:{offeringMode:'installed',offeringDetails:{wallHeight:'standard',finishCoats:2,ceilingCoats:2},offeringRates:{[installed[0]]:2,[key]:1.5,someRetiredPricePerSqft:3}}};
  const shown=text(view.offering({service,meta}));
  assert.match(shown,/Prices outside this selection/);
  assert.ok(shown.includes(itemized[key].label+': $1.5'),shown.slice(shown.indexOf('Prices outside')));
  assert.ok(!shown.includes(key+':'),'the stored field name is not shown');
  // A price with no current definition falls back to plain words.
  assert.ok(!shown.includes('someRetiredPricePerSqft'));assert.match(shown,/: \$3 /);
});
test('plant size prices never show a stored size key',()=>{
  const shown=view.plants({pricing:{plantSizes:{size_1:{name:'Small shrub'},size_2:{}}},field:{label:'Planting labor'},value:{size_1:10,size_2:20,size_9:5}});
  const plain=text(shown);
  for(const label of ['Small shrub','Unnamed plant size 2','Retired plant size 9'])assert.ok(plain.includes(label),label+' in '+plain);
  assert.doesNotMatch(shown,/size_\d/);
  assert.match(plain,/Remove retired size price/);
});
test('the widget appointment check labels the customer details in plain words',()=>{
  const held={holdId:'h',slot:{slotId:'s',label:'Tuesday 9:00 AM',startUtc:'2027-06-01T13:00:00Z',endUtc:'2027-06-01T15:00:00Z'},timezone:'America/Toronto',bookingMode:'book_job'};
  const store=new Map();globalThis.sessionStorage={getItem:key=>store.get(key)??null,setItem:(key,value)=>store.set(key,value),removeItem:key=>store.delete(key)};
  store.set('p:booking-q1',JSON.stringify({token:'t',held,draft:{customer:{name:'Sam Lee',email:'sam@example.invalid',phone:'+15065550123'},location:{city:'Moncton'}}}));
  try{
    const plain=text(view.booking({result:{quoteId:'q1',bookingToken:'t',resultType:'INSTANT_ESTIMATE_READY',lowEstimate:1,highEstimate:1},request:async()=>({}),cachePrefix:'p:',initialContact:{}}));
    assert.match(plain,/Check your appointment details/);
    for(const label of ['Name Sam Lee','Email sam@example.invalid','Phone +15065550123','City Moncton'])assert.ok(plain.includes(label),label+' in '+plain);
    assert.doesNotMatch(plain,/ name Sam| email sam| phone \+/);
  }finally{delete globalThis.sessionStorage;}
});
