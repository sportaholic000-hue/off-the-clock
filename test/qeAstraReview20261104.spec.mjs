import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {editCarpetPriceUnit,editTierCarpetPriceUnit,keepTierCarpetRatesInUnit} from '../client/src/pricebookEditing.js';
import {convertPricebookMoney} from '../server/priceBookMoney.js';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {interpretInterviewAnswer} from '../server/src/priceBookAI.js';

// November 4, 2026: Astra's review of edee1982 (F01 pinned-rate removal, F08
// key normalization and required unit). Expected values worked out by hand
// before the run: 200 sq ft of carpet at 3.00 labor and 5.00 material per sq ft
// is 660.00 + 1,100.00 = 1,760.00 in every case below; 27.00/45.00 per sq yd is
// the same price.
function carpetBook(tiers,pricing={}){
  const f=flooring('carpet',200);delete f.ownerPricing.pricing.perStepPrice;
  Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true});
  Object.assign(f.ownerPricing.pricing,{scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}},...pricing});
  f.ownerPricing.tiers=tiers;return f;
}
const mids=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);return q.options.map(o=>o.midEstimate);};
const withTiers=(f,service,tiers)=>({...f,ownerPricing:{...service,tiers}});
const drop=(tier,...fields)=>{const overrides={...tier.overrides};for(const field of fields)delete overrides[field];return {...tier,overrides};};

test('F01: a tier on its own carpet unit keeps the base price in its unit when its price row is removed, renamed or emptied',()=>{
  // Base switches to square yards (27/45); the square-foot tier is pinned at 3/5.
  const f=carpetBook([{name:'Own foot',overrides:{carpetPriceUnit:'square_foot'}}]);
  const yard=editCarpetPriceUnit(f.ownerPricing,'square_yard');
  assert.deepEqual(mids(withTiers(f,yard,yard.tiers)),[1760]);
  for(const [what,edit] of [
    ['material removed',tier=>drop(tier,'materialPerSqft')],
    ['labor removed',tier=>drop(tier,'laborPerSqft')],
    ['both removed',tier=>drop(tier,'laborPerSqft','materialPerSqft')],
    ['labor renamed to another field',tier=>({...drop(tier,'laborPerSqft'),overrides:{...drop(tier,'laborPerSqft').overrides,minimumJob:undefined}})],
    ['labor emptied of carpet',tier=>({...tier,overrides:{...tier.overrides,laborPerSqft:{tile:400}}})]]){
    const kept=keepTierCarpetRatesInUnit(yard,[edit(yard.tiers[0])]);
    assert.equal(kept[0].overrides.laborPerSqft.carpet,300,what);assert.equal(kept[0].overrides.materialPerSqft.carpet,500,what);
    const {minimumJob,...priced}=kept[0].overrides;
    assert.deepEqual(mids(withTiers(f,yard,[{...kept[0],overrides:priced}])),[1760],what);
  }
  // The other direction: square-foot base, square-yard tier keeps 27/45.
  const g=carpetBook([{name:'Inherits',overrides:{}}]);
  const yardTier=editTierCarpetPriceUnit(g.ownerPricing,0,'square_yard');
  const keptYard=keepTierCarpetRatesInUnit(yardTier,[drop(yardTier.tiers[0],'laborPerSqft','materialPerSqft')]);
  assert.deepEqual([keptYard[0].overrides.laborPerSqft.carpet,keptYard[0].overrides.materialPerSqft.carpet],[2700,4500]);
  assert.deepEqual(mids(withTiers(g,yardTier,keptYard)),[1760]);
  // A tier on the base's own unit inherits directly; nothing is pinned.
  const same=keepTierCarpetRatesInUnit(g.ownerPricing,[{name:'Same unit',overrides:{carpetPriceUnit:'square_foot'}}]);
  assert.deepEqual(same[0].overrides,{carpetPriceUnit:'square_foot'});
  // 30.00 per sq yd is 3.333... per sq ft: the edit is refused, the tiers untouched.
  const odd=carpetBook([{name:'Own foot',overrides:{carpetPriceUnit:'square_foot',laborPerSqft:{carpet:333}}}],{carpetPriceUnit:'square_yard',laborPerSqft:{carpet:3000},materialPerSqft:{carpet:4500}});
  const tiersBefore=structuredClone(odd.ownerPricing.tiers);
  assert.equal(keepTierCarpetRatesInUnit(odd.ownerPricing,[drop(odd.ownerPricing.tiers[0],'laborPerSqft')]),null);
  assert.deepEqual(odd.ownerPricing.tiers,tiersBefore);
});

test('F01: the real tier editor Remove override button keeps the square-foot tier at 1,760.00',async t=>{
  const root=fileURLToPath(new URL('..',import.meta.url));
  const f=carpetBook([{name:'Own foot',overrides:{carpetPriceUnit:'square_foot'}}]);
  const uiService=editCarpetPriceUnit(convertPricebookMoney(f.ownerPricing,'toDollars'),'square_yard');
  const definitions=applicationMetadata().services.find(s=>s.serviceType==='FLOORING_INSTALL').fields.filter(d=>['carpetPriceUnit','laborPerSqft','materialPerSqft','minimumJob'].includes(d.field));
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-exports',setup(b){b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {TierBuilder,PricingContext};',loader:'jsx'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TierBuilder,PricingContext} from './client/src/pricebook.jsx';
      function App(){const [service,setService]=useState(window.initial);window.current=service;
        return <PricingContext.Provider value={service}><TierBuilder tiers={service.tiers} definitions={()=>window.definitions} onChange={tiers=>{const next={...service,tiers};window.current=next;setService(next);}}/></PricingContext.Provider>;}
      createRoot(document.getElementById('root')).render(<App/>);`}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  const w=dom.window,d=w.document;
  // Initial objects are created in the page's own realm (the editor's plain-object checks).
  w.eval('window.initial='+JSON.stringify(uiService)+';window.definitions='+JSON.stringify(definitions)+';window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(output.outputFiles[0].text);
  const wait=async check=>{for(let i=0;i<500;i++){if(check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('Synthetic tier editor condition timed out');};
  await wait(()=>d.querySelectorAll('.override-row').length===3);
  const quote=service=>mids(withTiers(f,convertPricebookMoney(service,'toCents'),convertPricebookMoney(service,'toCents').tiers));
  assert.deepEqual(quote(JSON.parse(JSON.stringify(w.current))),[1760]);
  const row=[...d.querySelectorAll('.override-row')].find(r=>r.querySelector('select')?.value==='materialPerSqft');assert.ok(row,'material row');
  row.querySelector('button[aria-label="Remove override"]').click();
  // The material row comes back holding the base 45.00/sq yd as 5.00/sq ft.
  await wait(()=>w.current.tiers[0].overrides.materialPerSqft?.carpet===5&&w.current!==undefined);
  const after=JSON.parse(JSON.stringify(w.current));
  assert.equal(after.tiers[0].overrides.carpetPriceUnit,'square_foot');assert.equal(after.tiers[0].overrides.materialPerSqft.carpet,5);
  assert.deepEqual(quote(after),[1760]);
});

const env={GEMINI_API_KEY:'SYNTHETIC-TEST-KEY',GEMINI_TEXT_MODEL:'synthetic-text-model'};
const provider=value=>({env,fetchImpl:async()=>({ok:true,json:async()=>({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(value)}]}}]})})});
const interview=(unit,answer,field='laborPerSqft')=>interpretInterviewAnswer({serviceType:'FLOORING_INSTALL',field,answer:'[SYNTHETIC] owner answer',pricing:{carpetPriceUnit:unit}},provider(answer));
const clarify=e=>e.statusCode===422&&/clear value/.test(e.message);

test('F08: product-name spellings of carpet are converted like the canonical key, and the unit is required',async()=>{
  // $3 per sq ft for a square-yard field = $27 per sq yd, whatever the key's spelling.
  for(const key of ['carpet','Carpet',' CARPET '])for(const field of ['laborPerSqft','materialPerSqft']){
    assert.deepEqual(await interview('square_yard',{value:{[key]:3,tile:5},carpetSourceUnit:'square_foot'},field),{carpet:27,tile:5},key+' '+field);
  }
  // $27 per sq yd for a square-foot field = $3 per sq ft.
  assert.deepEqual(await interview('square_foot',{value:{Carpet:27},carpetSourceUnit:'square_yard'}),{carpet:3});
  // Explicit null: no unit stated, the draft's unit applies.
  assert.deepEqual(await interview('square_yard',{value:{Carpet:27},carpetSourceUnit:null}),{carpet:27});
  // A missing unit or an unknown unit asks again, for any spelling of carpet.
  await assert.rejects(interview('square_yard',{value:{carpet:3}}),clarify);
  await assert.rejects(interview('square_yard',{value:{Carpet:3}}),clarify);
  await assert.rejects(interview('square_yard',{value:{Carpet:3},carpetSourceUnit:'square_metre'}),clarify);
  // An inexact conversion asks again: 10.00 per sq yd is 1.111... per sq ft.
  await assert.rejects(interview('square_foot',{value:{' CARPET ':10},carpetSourceUnit:'square_yard'}),clarify);
  // No carpet entry: no unit is needed and other entries are untouched.
  assert.deepEqual(await interview('square_yard',{value:{tile:5}}),{tile:5});
});
