import './pricebookTestEnv.mjs';
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import {fixture} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {applicationMetadata,convertApplicationBook} from '../server/src/quoteDoneBridge.js';

// Hand-calculated $100 mowing / $110 flat repair expectations precede execution
// in specs/QUOTE_AUDIT_REPAIRS_20261006.md. Render real owner JSX and API metadata
// with synthetic initial state; this is SSR, not browser-interaction coverage.
const root=resolve('.'),temporary=mkdtempSync(join(tmpdir(),'synthetic-addon-guidance-'));
const meta=applicationMetadata();let render;
before(async()=>{
  const source=readFileSync(join(root,'client/src/pricebook.jsx'),'utf8').split('export default function PriceBook() {')[1].split('  async function load()')[0];
  const names=[...source.matchAll(/const\s+\[\s*(\w+)\s*,[^\]]+\]\s*=\s*useState\s*\(/g)].map(m=>m[1]);
  const react=JSON.stringify(join(root,'node_modules/react/index.js'));
  const file=join(temporary,'render.cjs');
  await build({stdin:{contents:`import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import PriceBook from './client/src/pricebook.jsx';import {reset} from 'synthetic-state';export const render=state=>{reset(state);return renderToStaticMarkup(<PriceBook/>);};`,resolveDir:root,loader:'jsx'},bundle:true,platform:'node',format:'cjs',outfile:file,logLevel:'silent',plugins:[{
    name:'synthetic-owner-initial-state',setup(b){
      b.onResolve({filter:/^\//,namespace:'synthetic'},args=>({path:args.path,namespace:'file'}));
      b.onResolve({filter:/^synthetic-state$/},()=>({path:'owner',namespace:'synthetic'}));
      b.onResolve({filter:/^react$/},args=>args.importer.endsWith('/pricebook.jsx')?{path:'owner',namespace:'synthetic'}:args.importer.endsWith('/reference.jsx')?{path:'opened',namespace:'synthetic'}:undefined);
      b.onLoad({filter:/.*/,namespace:'synthetic'},args=>({contents:`import React from ${react};export * from ${react};export default React;`+(args.path==='opened'?`export const useState=initial=>React.useState(typeof initial==='boolean'?true:initial);`:`let values={},index=0;const names=${JSON.stringify(names)};export const reset=state=>{values=state;index=0;};export const useState=initial=>{const name=names[index++];return React.useState(Object.hasOwn(values,name)?values[name]:initial);};`),loader:'js'}));
    }
  }]});
  render=createRequire(import.meta.url)(file).render;
});
after(()=>rmSync(temporary,{recursive:true,force:true}));
function mowing(){return fixture('LANDSCAPING_MOWING',{mowingBaseRatePerSqft:100,minimumServiceCharge:0,frequencyMultipliers:{weekly:1,biweekly:1,monthly:1,one_time:1},overgrowthMultipliers:{maintained:1,overgrown:1,severe:1}},{yardSqft:100,sqftMethod:'exact',serviceFrequency:'weekly',grassCondition:'maintained',bagClippings:false,edgingIncluded:false});}
function repair(){return fixture('FLAT_ROOF_REPAIR',{laborHourlyRate:10000,repairMinimum:0,patchRepairHours:{epdm:{seam_patch:{small:1,medium:1,large:1}}},patchMaterialAllowance:{epdm:{seam_patch:{small:1000,medium:1000,large:1000}}}},{repairType:'seam_patch',affectedArea:10,membraneType:'epdm',leakPresent:false,pondingWater:true,accessDifficulty:'easy'});}
for(const [field,make,selected,dollars,name] of [
  ['baggingSurchargePercent',mowing,{bagClippings:true},100,'Clipping bagging and disposal'],
  ['edgingPerLinearFoot',mowing,{edgingIncluded:true,edgingLengthLF:20},100,'Lawn edging'],
  ['pondingWaterSurcharge',repair,{pondingWater:true},110,'Ponding water surcharge']
])test('owner optional guidance agrees with blank and zero '+field,()=>{
  const f=make();Object.assign(f.customerInputs,selected);
  const book=convertApplicationBook({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars');
  const html=render({dashboard:{ownerId:'synthetic-owner',operator:{}},onboarding:{account:{plan:'QuoteDone'},profile:{businessTypes:[f.serviceType]}},metadata:meta.services,book,selectedType:f.ownerPricing.id,statuses:[{status:'QUOTING LIVE',missingOwnerFields:[]}],contract:meta});
  assert.match(html,/Missing scope prices require review\. Unpriced optional extras are excluded from the estimate and disclosed to the customer/);
  const definition=meta.services.find(s=>s.serviceType===f.serviceType).fields.find(d=>d.field===field);
  assert.match(definition.help,/[Mm]issing pricing keeps the main quote and explicitly excludes/);assert.match(definition.help,/explicit zero .*free/);
  assert.ok(html.includes(definition.help));assert.ok(html.includes(definition.label));
  const excluded=sanitizeForCustomerVNext(generateQuoteVNext(f));
  assert.equal(excluded.resultType,'INSTANT_ESTIMATE_READY');assert.equal(excluded.midEstimate,dollars);
  assert.ok(excluded.options[0].disclaimer.includes('This estimate does not include: '+name+'.'));
  f.ownerPricing.pricing[field]=0;
  const included=sanitizeForCustomerVNext(generateQuoteVNext(f));
  assert.equal(included.resultType,'INSTANT_ESTIMATE_READY');assert.equal(included.midEstimate,dollars);
  assert.ok(!included.options[0].disclaimer.includes(name));
});
test('mulch edging keeps its required-scope guidance',()=>{
  const help=meta.services.find(s=>s.serviceType==='LANDSCAPING_MULCH').fields.find(f=>f.field==='edgingPerLinearFoot').help;
  assert.doesNotMatch(help,/Leave blank to exclude|no extra charge/);
});
