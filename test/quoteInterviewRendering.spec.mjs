import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {describeInterviewConfiguration} from '../server/interviewConfiguration.js';
const temporary=mkdtempSync(join(resolve('.'),'quote-ui-test-'));
let Component;
test.before(async()=>{const file=join(temporary,'interview.mjs');await build({entryPoints:['client/src/interviewConfiguration.jsx'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:file,logLevel:'silent'});Component=(await import(pathToFileURL(file))).default;});
test.after(()=>rmSync(temporary,{recursive:true,force:true}));
for(const serviceType of ['FENCING_INSTALL','EXTERIOR_PAINTING'])test('renders complete '+serviceType+' interview definitions and prices',()=>{
 const pricing=offeringFixture(serviceType,'installed').ownerPricing.pricing;
 for(const field of ['offeringMode','offeringDetails','offeringRates']){
  const html=renderToStaticMarkup(React.createElement(Component,{definition:{serviceType,field},pricing,value:pricing[field],onChange:()=>{}}));
  assert.match(html,/<(?:select|textarea|input)/);assert.doesNotMatch(html,/\[object Object\]|undefined/);
  const description=describeInterviewConfiguration(serviceType,field,pricing[field],pricing);assert.doesNotMatch(description,/\[object Object\]|undefined|"offeringRates"/);
 }
});
test('renders additional scope entries with explicit access matching and per-item prices',()=>{
 for(const id of ['demolition-installed','stairs-installed','commercial-installed']){
  const f=measuredScopeCases().find(r=>r.id===id).input,pricing=f.ownerPricing.pricing;
  const html=renderToStaticMarkup(React.createElement(Component,{definition:{serviceType:f.serviceType,field:'scopeDetails'},pricing,value:pricing.scopeDetails,onChange:()=>{}}));
  if(id==='demolition-installed'){assert.match(html,/Demolition access matching/);assert.match(html,/up to/);}
  if(id==='commercial-installed'){assert.match(html,/Insulation system/);assert.match(html,/Coverboard system/);}
  assert.doesNotMatch(html,/\[object Object\]|undefined/);
 }
});
test('renders explicit named-product registration separately from money',()=>{
 const html=renderToStaticMarkup(React.createElement(Component,{definition:{serviceType:'FENCING_INSTALL',field:'knownOfferings'},pricing:{},value:{fenceType:{wood:true}},onChange:()=>{}}));assert.match(html,/This product is offered/);assert.match(html,/wood/);assert.doesNotMatch(html,/rateCents/);
});
