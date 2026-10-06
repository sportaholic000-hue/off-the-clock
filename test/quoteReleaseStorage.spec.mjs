import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {loadPricebook,savePricebook,pricebookDirectory,pricebookSaveUnconfirmed} from '../server/priceBookService.js';
import {bookStatuses,readApplicationBook,bookRevision,approveApplicationService,calculateApplicationQuote} from '../server/src/quoteDoneBridge.js';
import {validServiceIdVNext} from '../server/quote-engine-vnext/contracts.js';
import {mowing} from '../verification/engine-independent/fixtures.mjs';

// Handwritten monetary expectations: specs/QUOTE_RELEASE_CANDIDATE_20261006.md.
const owner=()=> '[SYNTHETIC]-release-'+randomUUID();
const book=()=>({services:[{id:randomUUID(),serviceType:'LANDSCAPING_MOWING',active:false,source:'MANUAL',pricing:{},tiers:[]}],defaults:{}});
const path=id=>join(pricebookDirectory(),id+'.json');
for(const [name,id] of [['omitted',undefined],['undefined',undefined],['null',null],['empty','']])test('release storage: '+name+' new ID receives a UUID',()=>{
 const input=book(),key=owner();if(name==='omitted')delete input.services[0].id;else input.services[0].id=id;
 const before=structuredClone(input),saved=savePricebook(key,input).pricebook;
 assert.ok(validServiceIdVNext(saved.services[0].id));assert.equal(loadPricebook(key).services[0].id,saved.services[0].id);assert.deepEqual(input,before);
});
for(const id of ['not-a-uuid',17,0,false,{},[],'00000000-0000-0000-0000-000000000000'])test('release storage: invalid supplied ID is refused '+JSON.stringify(id),()=>{
 const key=owner(),input=book();savePricebook(key,input);const before=readFileSync(path(key),'utf8');input.services[0].id=id;
 assert.throws(()=>savePricebook(key,input),e=>e.code==='PRICEBOOK_INVALID'&&e.statusCode===400);
 assert.equal(readFileSync(path(key),'utf8'),before);assert.equal(pricebookSaveUnconfirmed(key),false);
});
test('release storage: duplicate UUID casing is refused atomically',()=>{
 const key=owner(),input=book();savePricebook(key,input);const before=readFileSync(path(key),'utf8');input.services.push({...input.services[0],id:input.services[0].id.toUpperCase()});
 assert.throws(()=>savePricebook(key,input),e=>e.code==='PRICEBOOK_INVALID'&&/UUID/.test(e.message));assert.equal(readFileSync(path(key),'utf8'),before);
});
const malformed=[
 ['null service',b=>{b.services=[null];}],['array service',b=>{b.services=[[]];}],['string service',b=>{b.services=['broken'];}],
 ['null pricing',b=>{b.services[0].pricing=null;}],['array pricing',b=>{b.services[0].pricing=[];}],
 ['object tiers',b=>{b.services[0].tiers={};}],['null tiers',b=>{b.services[0].tiers=null;}],
 ['null tier',b=>{b.services[0].tiers=[null];}],['array tier',b=>{b.services[0].tiers=[[]];}],
 ['null overrides',b=>{b.services[0].tiers=[{overrides:null}];}],['array overrides',b=>{b.services[0].tiers=[{overrides:[]}];}],
 ['missing defaults',b=>{delete b.defaults;}],['null defaults',b=>{b.defaults=null;}],['array defaults',b=>{b.defaults=[];}],
 ['object services',b=>{b.services={};}],['missing services',b=>{delete b.services;}]
];
for(const [name,alter] of malformed)test('release storage: '+name+' pauses corrupted saved data and rejects new writes',()=>{
 const key=owner(),input=book();savePricebook(key,input);const accepted=readFileSync(path(key),'utf8');alter(input);
 assert.throws(()=>savePricebook(key,input),e=>e.code==='PRICEBOOK_INVALID'&&e.statusCode===400);
 assert.equal(readFileSync(path(key),'utf8'),accepted);assert.equal(pricebookSaveUnconfirmed(key),false);
 writeFileSync(path(key),JSON.stringify({...input,ownerId:key}));const corrupt=readFileSync(path(key),'utf8');
 for(const read of [()=>loadPricebook(key),()=>readApplicationBook(key)])assert.throws(read,e=>e.code==='PRICEBOOK_UNREADABLE'&&e.statusCode===503&&/Quoting is paused/.test(e.message));
 assert.equal(readFileSync(path(key),'utf8'),corrupt);
});
test('release storage: valid incomplete draft remains readable and cannot quote',()=>{
 const key=owner(),input=book();input.services[0].tiers=[{name:'Draft',overrides:{}}];const saved=savePricebook(key,input).pricebook;
 assert.deepEqual(loadPricebook(key),saved);assert.notEqual(bookStatuses(saved)[0].status,'QUOTING LIVE');
});
test('release storage: omitted optional pricing and tiers remain readable',()=>{
 const key=owner(),input=book();delete input.services[0].pricing;delete input.services[0].tiers;
 assert.deepEqual(loadPricebook(key),{ownerId:key,services:[],defaults:{markupPercent:30,markupMode:'markup',taxMode:'TAX_NONE',taxPercent:0,rangeBufferPercent:10,peakMonths:[],peakSurchargePercent:0}});
 assert.equal(existsSync(path(key)),false);savePricebook(key,input);assert.equal(loadPricebook(key).services.length,1);
});
test('release storage: valid uppercase identity, approval, other owner and $100 quote survive a save',()=>{
 const f=mowing(),key=owner(),other=owner();delete f.ownerPricing.origin;f.ownerPricing.id=f.ownerPricing.id.toUpperCase();
 savePricebook(other,book());const otherBefore=readFileSync(path(other),'utf8');
 savePricebook(key,{services:[f.ownerPricing],defaults:{currency:'CAD',...f.businessDefaults}});
 let saved=loadPricebook(key);approveApplicationService(key,saved.services[0].id,{revision:bookRevision(saved),confirmConfiguration:true,confirmLegacySettings:true});
 saved=loadPricebook(key);const original=structuredClone(saved.services[0]);savePricebook(key,saved);saved=loadPricebook(key);
 assert.deepEqual(saved.services[0],original);assert.equal(saved.services[0].id,f.ownerPricing.id);assert.equal(bookStatuses(saved)[0].approvalCurrent,true);
 const q=calculateApplicationQuote(saved,saved.services[0],{serviceId:saved.services[0].id,customerInputs:f.customerInputs},{ownerId:key});
 assert.equal(q.customerResult.resultType,'INSTANT_ESTIMATE_READY');assert.equal(q.customerResult.midEstimate,100);assert.equal(readFileSync(path(other),'utf8'),otherBefore);
});
