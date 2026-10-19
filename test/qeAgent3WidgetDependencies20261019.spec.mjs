import './pricebookTestEnv.mjs';
import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {MEASUREMENT_CONTRACTS} from '../server/quote-engine-vnext/contracts.js';

let bundle;

before(async()=>{
  const built=await build({
    bundle:true,write:false,format:'iife',platform:'browser',
    define:{'process.env.NODE_ENV':JSON.stringify('production'),'import.meta.env':JSON.stringify({})},
    stdin:{loader:'jsx',resolveDir:process.cwd(),contents:`
      import React,{useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {flushSync} from 'react-dom';
      import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
      function Form({fields,inputs,knownOfferings}){
        const [value,setValue]=useState(inputs);
        window.__agent3Value=value;
        return <CustomerMeasurements fields={fields} scopeFields={fields} value={value}
          knownOfferings={knownOfferings||{}} onChange={next=>{window.__agent3Value=next;setValue(next);}}/>;
      }
      window.__agent3Mount=props=>{
        if(window.__agent3Root)flushSync(()=>window.__agent3Root.unmount());
        window.__agent3Root=createRoot(document.getElementById('root'));
        flushSync(()=>window.__agent3Root.render(<Form {...props}/>));
      };
    `}
  });
  bundle=built.outputFiles[0].text;
});

const fields=serviceType=>Object.entries(MEASUREMENT_CONTRACTS[serviceType].fields).map(([name,field])=>({name,...field}));
const clone=value=>structuredClone(value);

async function rendered(t,serviceType,inputs,{knownOfferings={}}={}){
  const errors=[],original=clone(inputs);
  const dom=new JSDOM('<div id="root"></div>',{
    url:'https://qe-agent3.invalid',runScripts:'dangerously',pretendToBeVisual:true,
    virtualConsole:new VirtualConsole().on('jsdomError',error=>errors.push(String(error)))
  });
  t.after(()=>{dom.window.__agent3Root?.unmount();dom.window.close();});
  dom.window.structuredClone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  dom.window.eval(bundle);
  dom.window.__agent3Mount({fields:fields(serviceType),inputs,knownOfferings});
  const select=async(label,value)=>{
    const node=dom.window.document.querySelector(`select[aria-label="${label}"]`);
    assert.ok(node,`missing rendered select ${label}`);
    node.value=value;node.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    await new Promise(resolve=>dom.window.setTimeout(resolve,0));
  };
  return {dom,original,errors,select,value:()=>clone(dom.window.__agent3Value)};
}

test('qe-agent3 PI-01 rendered mulch methods clear prior unit quantity and depth in both directions',async t=>{
  const unrelated={status:'identified',field:'mulchType',value:'brown',offeringId:'synthetic-mulch'};
  for(const row of [
    {before:{inputMethod:'sqft',mulchArea:270,mulchDepth:3,mulchType:'brown',confirmedFacts:{mulchType:unrelated},bedCondition:'clean',edgingNeeded:false},next:'yards'},
    {before:{inputMethod:'yards',mulchArea:2.75,mulchType:'brown',confirmedFacts:{mulchType:unrelated},bedCondition:'clean',edgingNeeded:false},next:'sqft'}
  ]){
    await t.test(`${row.before.inputMethod} to ${row.next}`,async t=>{
      const view=await rendered(t,'LANDSCAPING_MULCH',row.before,{knownOfferings:{mulchType:{brown:'synthetic-mulch'}}});
      await view.select('Mulch quantity method',row.next);
      const actual=view.value();
      assert.equal(Object.hasOwn(actual,'mulchArea'),false);
      assert.equal(Object.hasOwn(actual,'mulchDepth'),false);
      assert.equal(actual.inputMethod,row.next);
      assert.equal(actual.mulchType,'brown');
      assert.deepEqual(actual.confirmedFacts,row.before.confirmedFacts);
      assert.deepEqual(row.before,view.original,'the prior state must remain immutable');
      assert.deepEqual(view.errors,[]);
    });
  }
});

test('qe-agent3 PI-02 rendered concrete methods clear every prior geometry representation forward and reverse',async t=>{
  const rows=[
    {before:{dimensionMethod:'exact',length:50,width:10,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:false,adjoinsExistingConcrete:true,adjoiningEdgeLF:10},next:'measured_area_perimeter'},
    {before:{dimensionMethod:'measured_area_perimeter',areaSqft:500,perimeterLF:120,thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:false,adjoinsExistingConcrete:true,adjoiningEdgeLF:10},next:'measured_outline'},
    {before:{dimensionMethod:'measured_outline',outlinePoints:[{x:0,y:0},{x:5,y:0},{x:5,y:2},{x:0,y:2},{x:0,y:0}],thickness:4,finishType:'broom',demolitionNeeded:false,reinforcement:'none',accessDifficulty:'easy',baseNeeded:false,adjoinsExistingConcrete:true,adjoiningEdgeLF:10},next:'exact'}
  ];
  for(const row of rows)await t.test(`${row.before.dimensionMethod} to ${row.next}`,async t=>{
    const view=await rendered(t,'CONCRETE_DRIVEWAY',row.before);
    await view.select('Slab measurement method',row.next);
    const actual=view.value();
    for(const key of ['length','width','areaSqft','perimeterLF','outlinePoints'])assert.equal(Object.hasOwn(actual,key),false,`retained ${key}`);
    assert.equal(actual.adjoiningEdgeLF,10,'unrelated adjoining-edge scope must survive');
    assert.equal(actual.dimensionMethod,row.next);
    assert.deepEqual(row.before,view.original);
    assert.deepEqual(view.errors,[]);
  });
});

test('qe-agent3 PI-03 rendered subfloor off and unknown clear repair area and reverse requires re-entry',async t=>{
  for(const next of ['false',''])await t.test(next||'unknown',async t=>{
    const before={sqft:300,sqftMethod:'exact',newFlooringType:'tile',existingFloorType:'none',removalNeeded:false,roomCount:2,layoutPattern:'straight',stairSteps:0,subfloorIssues:true,subfloorRepairAreaSqft:30};
    const view=await rendered(t,'FLOORING_REPLACEMENT',before);
    await view.select('Subfloor issues reported',next);
    let actual=view.value();
    assert.equal(Object.hasOwn(actual,'subfloorRepairAreaSqft'),false);
    assert.equal(actual.roomCount,2);
    await view.select('Subfloor issues reported','true');
    actual=view.value();
    assert.equal(Object.hasOwn(actual,'subfloorRepairAreaSqft'),false,'reverse transition must require a new area');
    assert.deepEqual(before,view.original);
    assert.deepEqual(view.errors,[]);
  });
});

test('qe-agent3 PI-04 rendered planting mulch off and unknown clear product receipt only and reverse requires re-entry',async t=>{
  const mulchFact={status:'identified',field:'mulchType',value:'brown',offeringId:'synthetic-brown'};
  const plantFact={status:'identified',field:'plantVariety',value:'maple',offeringId:'synthetic-maple'};
  for(const next of ['false',''])await t.test(next||'unknown',async t=>{
    const before={plantsBySize:{small:2},bedCondition:'clean',mulchNeeded:true,mulchYards:2,mulchType:'brown',accessDifficulty:'easy',confirmedFacts:{mulchType:mulchFact,plantVariety:plantFact}};
    const view=await rendered(t,'LANDSCAPING_PLANTING',before,{knownOfferings:{mulchType:{brown:'synthetic-brown'}}});
    await view.select('Mulch included',next);
    let actual=view.value();
    assert.equal(Object.hasOwn(actual,'mulchYards'),false);
    assert.equal(Object.hasOwn(actual,'mulchType'),false);
    assert.equal(Object.hasOwn(actual.confirmedFacts,'mulchType'),false);
    assert.deepEqual(actual.confirmedFacts.plantVariety,plantFact,'unrelated confirmation must survive');
    await view.select('Mulch included','true');
    actual=view.value();
    assert.equal(Object.hasOwn(actual,'mulchYards'),false);
    assert.equal(Object.hasOwn(actual,'mulchType'),false);
    assert.deepEqual(actual.confirmedFacts,{plantVariety:plantFact});
    assert.deepEqual(before,view.original);
    assert.deepEqual(view.errors,[]);
  });
});

test('qe-agent3 PI-05 rendered mowing edging off and unknown clear length, preserve explicit zero elsewhere, and reverse requires re-entry',async t=>{
  for(const next of ['false',''])await t.test(next||'unknown',async t=>{
    const before={yardSqft:0,sqftMethod:'exact',serviceFrequency:'biweekly',grassCondition:'maintained',bagClippings:true,edgingIncluded:true,edgingLengthLF:100};
    const view=await rendered(t,'LANDSCAPING_MOWING',before);
    await view.select('Lawn edging selected',next);
    let actual=view.value();
    assert.equal(Object.hasOwn(actual,'edgingLengthLF'),false);
    assert.equal(actual.yardSqft,0,'an unrelated explicit zero must not become omission');
    await view.select('Lawn edging selected','true');
    actual=view.value();
    assert.equal(Object.hasOwn(actual,'edgingLengthLF'),false);
    assert.equal(actual.yardSqft,0);
    assert.deepEqual(before,view.original);
    assert.deepEqual(view.errors,[]);
  });
});
