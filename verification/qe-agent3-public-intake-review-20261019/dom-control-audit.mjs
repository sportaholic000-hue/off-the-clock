import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import {auditFixtures} from './audit-fixtures.mjs';

const root=path.resolve(process.argv[2]||'.');
const catalogPath=path.resolve(process.argv[3]||path.join(root,'verification/qe-agent3-public-intake-review-20261019/http-evidence/public-catalog.json'));
const out=path.resolve(process.argv[4]||path.join(root,'verification/qe-agent3-public-intake-review-20261019/dom-evidence'));
if(fs.existsSync(out))throw Error('Evidence directory already exists: '+out);
fs.mkdirSync(out,{recursive:true});
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2));
const catalog=JSON.parse(fs.readFileSync(catalogPath,'utf8')),fixtures=auditFixtures(),cases=[],findings=[],errors=[];
const bundle=(await build({bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"','import.meta.env':'{}'},stdin:{resolveDir:root,loader:'jsx',contents:`
  import React,{useState}from'react';import{createRoot}from'react-dom/client';import{CustomerMeasurements}from'./client/src/quoteDoneControls.jsx';
  function Form({service,initial,mountKey}){const[value,setValue]=useState(initial);window.__value=value;return <><CustomerMeasurements fields={service.customerFields} value={value} onChange={setValue} knownOfferings={service.knownOfferings}/><output>{JSON.stringify(value)}</output></>}
  const root=createRoot(document.getElementById('root'));window.mount=(service,initial,mountKey)=>root.render(<Form key={mountKey} service={service} initial={initial} mountKey={mountKey}/>);
`}})).outputFiles[0].text;
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://synthetic.invalid/quote/synthetic-a',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:new VirtualConsole().on('jsdomError',error=>errors.push(String(error)))});
const w=dom.window,d=w.document;
w.structuredClone=structuredClone;w.eval(bundle);
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
let mountKey=0;
const byType=new Map(catalog.services.map(service=>[service.serviceType,service]));
async function mount(type){w.mount(byType.get(type),structuredClone(fixtures.get(type).customerInputs),++mountKey);await tick();await tick();return value();}
function value(){return JSON.parse(d.querySelector('output').textContent);}
async function select(label,next){const element=d.querySelector(`select[aria-label="${label}"]`);assert.ok(element,'missing select '+label);element.value=next;element.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();}
async function fill(label,next){const element=d.querySelector(`input[aria-label="${label}"]`);assert.ok(element,'missing input '+label);const setter=Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype,'value').set;setter.call(element,next);element.dispatchEvent(new w.Event('input',{bubbles:true}));element.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();}
async function click(text){const element=[...d.querySelectorAll('button')].find(button=>button.textContent.trim()===text);assert.ok(element,'missing button '+text);element.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await tick();}
function record(id,type,pattern,before,after,expected){cases.push({id,serviceType:type,pattern,before,after,expected});}
function hiddenFinding(id,type,title,keys,after){const retained=keys.filter(key=>Object.hasOwn(after,key));if(retained.length)findings.push({id,severity:'actionable',serviceType:type,boundary:'actual React control in JSDOM (not real-browser coverage)',title,retainedFields:retained,expected:'Changing the controlling visible answer removes values that are no longer applicable.',actual:`The rendered control hides the dependent field(s) but state still contains ${retained.join(', ')}. The HTTP audit separately shows the public prepare handler rejects the contradictory body without saving a priced receipt.`});return retained;}

try{
  let before=await mount('FENCING_INSTALL');await fill('Fence height whole feet','5');await fill('Fence height inches','3.65');let after=value();assert.equal(after.fenceHeight,5+3.65/12);record('D01','FENCING_INSTALL','decimal inches to decimal feet',before,after,{fenceHeight:5+3.65/12});
  before=await mount('FENCING_INSTALL');await click('Use section measurements');after=value();for(const key of ['linearFeet','gates','cornerCount','lfMethod','fenceRuns'])assert.equal(Object.hasOwn(after,key),false);record('D02','FENCING_INSTALL','total-to-section hidden fields cleared',before,after,{omitted:['linearFeet','gates','cornerCount','lfMethod','fenceRuns']});
  before=await mount('ROOFING_REPAIR');await fill('Roof repair type','Shingle patch revised');after=value();assert.equal(Object.hasOwn(after.confirmedFacts||{},'repairType'),false);assert.equal(Object.hasOwn(after.confirmedFacts||{},'roofType'),true);record('D03','ROOFING_REPAIR','edited product clears only its receipt',before,after,{repairTypeConfirmation:'omitted',roofTypeConfirmation:'retained'});

  before=await mount('LANDSCAPING_MULCH');await select('Mulch quantity method','yards');await fill('Mulch volume','2.75');after=value();record('D04','LANDSCAPING_MULCH','area-to-volume hidden dependency',before,after,{omitted:['mulchDepth']});hiddenFinding('PI-01','LANDSCAPING_MULCH','Mulch method change retains hidden depth',['mulchDepth'],after);
  before=await mount('CONCRETE_DRIVEWAY');await select('Slab measurement method','measured_area_perimeter');await fill('Measured slab area','500');await fill('Measured slab perimeter','120');after=value();record('D05','CONCRETE_DRIVEWAY','dimension-method hidden dependency',before,after,{omitted:['length','width']});hiddenFinding('PI-02','CONCRETE_DRIVEWAY','Concrete method change retains hidden length and width',['length','width'],after);
  before=await mount('FLOORING_REPLACEMENT');await select('Subfloor issues reported','false');after=value();record('D06','FLOORING_REPLACEMENT','subfloor-no hidden dependency',before,after,{omitted:['subfloorRepairAreaSqft']});hiddenFinding('PI-03','FLOORING_REPLACEMENT','Subfloor correction retains hidden repair area',['subfloorRepairAreaSqft'],after);
  before=await mount('LANDSCAPING_PLANTING');await select('Mulch included','false');after=value();record('D07','LANDSCAPING_PLANTING','mulch removal hidden dependency',before,after,{omitted:['mulchYards','mulchType'],confirmation:'mulchType omitted'});const plantRetained=hiddenFinding('PI-04','LANDSCAPING_PLANTING','Planting mulch removal retains hidden quantities and product',['mulchYards','mulchType'],after);if(Object.hasOwn(after.confirmedFacts||{},'mulchType')){plantRetained.push('confirmedFacts.mulchType');findings.find(row=>row.id==='PI-04').retainedFields=plantRetained;findings.find(row=>row.id==='PI-04').actual=`The rendered control hides the mulch fields but state still contains ${plantRetained.join(', ')}. The HTTP audit separately shows the contradictory body is rejected without a priced receipt.`;}
  before=await mount('LANDSCAPING_MOWING');await select('Lawn edging selected','false');after=value();record('D08','LANDSCAPING_MOWING','edging-no hidden dependency',before,after,{omitted:['edgingLengthLF']});hiddenFinding('PI-05','LANDSCAPING_MOWING','Edging removal retains hidden length',['edgingLengthLF'],after);

  before=await mount('LANDSCAPING_MOWING');await fill('Measured mowable lawn area','');const omitted=value();assert.equal(Object.hasOwn(omitted,'yardSqft'),false);before=await mount('LANDSCAPING_MOWING');await fill('Measured mowable lawn area','0');const zero=value();assert.equal(zero.yardSqft,0);record('D09','LANDSCAPING_MOWING','omitted versus explicit zero',before,{omitted,zero},{omitted:'property absent',zero:0});
  assert.deepEqual(errors,[]);
  write('cases.json',cases);write('findings.json',findings);write('result.json',{status:'passed',surface:'JSDOM actual React controls; explicitly not real-browser coverage',caseCount:cases.length,actionableFindings:findings.length});
  console.log(JSON.stringify({status:'passed',domCases:cases.length,findings:findings.length}));
}catch(error){
  write('cases.partial.json',cases);write('findings.json',findings);write('result.json',{status:'failed',error:error.stack,errors});console.error(error.stack);process.exitCode=1;
}finally{dom.window.close();}
