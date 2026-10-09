import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {build} from 'esbuild';
import {applicationMetadata} from '../server/src/quoteDoneBridge.js';
import {repairSizeFromAffectedArea} from '../server/quote-engine-vnext/contracts.js';

// Owner-approved wording 2026-10-08. Expected text written by hand before running.
const ROOF='small is under 50 sq ft, medium is 50 to 200 sq ft, large is over 200 sq ft.';
const SMALL='small is under 20 sq ft, medium is 20 to 80 sq ft, large is over 80 sq ft.';
const expected={
  'ROOFING_REPAIR.repairHours':['Roof repair labor hours by repair type and project size','Enter labor hours for each roof repair type and size of affected area: '+ROOF],
  'ROOFING_REPAIR.repairMaterialAllowance':['Roof repair material allowance by repair type and project size','Material allowance added for each roof repair type and size of affected area before the final site inspection: '+ROOF],
  'FLAT_ROOF_REPAIR.patchRepairHours':['Flat-roof repair labor hours by repair type and project size','Enter labor hours for each repair type and size of affected area: '+SMALL],
  'FLAT_ROOF_REPAIR.patchMaterialAllowance':['Flat-roof repair material allowance by repair type and project size','Enter the material allowance for each repair type and size of affected area: '+SMALL],
  'SIDING_REPAIR.repairHours':['Siding repair labor hours by damage level and project size','Enter labor hours for each damage level and size of affected area: '+SMALL],
  'SIDING_REPAIR.materialAllowance':['Siding repair material allowance by damage level and project size','Material allowance for each damage level and size of affected area: '+SMALL]
};
const boxes={
  ROOFING_REPAIR:{small:'Small (under 50 sq ft)',medium:'Medium (50 to 200 sq ft)',large:'Large (over 200 sq ft)'},
  FLAT_ROOF_REPAIR:{small:'Small (under 20 sq ft)',medium:'Medium (20 to 80 sq ft)',large:'Large (over 80 sq ft)'},
  SIDING_REPAIR:{small:'Small (under 20 sq ft)',medium:'Medium (20 to 80 sq ft)',large:'Large (over 80 sq ft)'}
};
const fieldsOf=type=>{const meta=applicationMetadata();return (meta.services||meta).find(s=>(s.serviceType||s.type)===type).fields;};

for(const [key,[label,help]] of Object.entries(expected))test(`repair size limits are stated to the owner: ${key}`,()=>{
  const [type,name]=key.split('.'),field=fieldsOf(type).find(f=>f.field===name);
  assert.equal(field.label,label);assert.equal(field.help,help);
  assert.deepEqual(field.tree.leafLabels,boxes[type]);
});

test('the stated limits are the limits the engine uses',()=>{
  for(const [type,[a,b]] of [['ROOFING_REPAIR',[50,200]],['FLAT_ROOF_REPAIR',[20,80]],['SIDING_REPAIR',[20,80]]]){
    assert.equal(repairSizeFromAffectedArea(type,a-0.01),'small');
    assert.equal(repairSizeFromAffectedArea(type,a),'medium');
    assert.equal(repairSizeFromAffectedArea(type,b),'medium');
    assert.equal(repairSizeFromAffectedArea(type,b+0.01),'large');
  }
});

test('the price boxes in the editor and the AI interview show each size limit',async t=>{
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dir=mkdtempSync(path.join(tmpdir(),'synthetic-tree-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const definition={field:'repairHours',label:'Roof repair labor hours',type:'json',tree:{depth:3,leafKeys:['small','medium','large'],leafLabels:boxes.ROOFING_REPAIR}};
  const out=await build({absWorkingDir:root,bundle:true,write:false,format:'cjs',platform:'node',define:{'process.env.NODE_ENV':JSON.stringify('production')},
    stdin:{loader:'jsx',resolveDir:root,contents:"import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {PricingTree} from './client/src/quoteDoneControls.jsx';export const html=renderToStaticMarkup(<PricingTree definition={"+JSON.stringify(definition)+"} value={{asphalt_shingle:{leak_patch:{small:3,medium:5,large:8}}}} onChange={()=>{}}/>);"}});
  const file=path.join(dir,'tree.cjs');writeFileSync(file,out.outputFiles[0].text);
  const {html}=createRequire(import.meta.url)(file);
  for(const text of Object.values(boxes.ROOFING_REPAIR))assert.ok(html.includes(text),text);
});
