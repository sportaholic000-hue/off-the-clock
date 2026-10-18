// Deliberately failing review reproduction, outside the normal test selection.
// Expected values below were independently written BEFORE this execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/engine.js';
import {validateClass2FactorsDetailed} from '../../server/quote-engine-vnext/contracts.js';
const plan=JSON.parse(readFileSync(new URL('./expected-cases-first.json',import.meta.url)));
const pitch=()=>structuredClone(plan.cases.find(c=>c.id==='roof-adopted-upper-pitch').active);
const layers=()=>structuredClone(plan.cases.find(c=>c.id==='roof-additional-layer-factor').active);
const rows=[
 ['positive proposal control',pitch,()=>{},485800],
 ['zero installation addition accepted by contract must not block quote',pitch,f=>{f.ownerPricing.pricing.pitchInstallationAdder.ten_to_twelve=0;},423800],
 ['zero removal addition accepted by contract must not block quote',pitch,f=>{f.ownerPricing.pricing.pitchRemovalAdder.ten_to_twelve=0;},453000],
 ['zero additional-layer factor accepted by contract must not block quote',layers,f=>{f.ownerPricing.pricing.additionalLayerRemovalFactor=0;},431000]
];
// Pitch base391000. Positive: +62000 install +32800 removal. Zero install:
// 391000+32800. Zero removal:391000+62000. Three layers, no steepness:
// base391000 +2*10*2000 disposal + zero additional tear-off =431000.
for(const [name,fixture,change,expected] of rows)test(name,()=>{
 const f=fixture();change(f);
 const diagnostics=validateClass2FactorsDetailed(f.serviceType,f.ownerPricing.pricing);
 assert.deepEqual(diagnostics,[],'all factors must pass the actual stored-factor validator');
 const q=generateQuoteVNext(f);
 console.log(JSON.stringify({case:name,class2Diagnostics:diagnostics,expectedCents:expected,resultType:q.resultType,invalidOwnerFields:q.invalidOwnerFields??[],actualCents:q.lineItems?.reduce((s,l)=>s+l.amountCents,0)??null}));
 assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
 assert.equal(q.lineItems.reduce((s,l)=>s+l.amountCents,0),expected);
});
