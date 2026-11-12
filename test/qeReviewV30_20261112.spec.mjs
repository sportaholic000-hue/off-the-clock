// Engine v30: the fixes agreed on the v29 review. Every expected amount is
// worked by hand in the comment beside it from the fixture's own prices.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';
import {customerFieldVisible} from '../server/scopeConfiguration.js';
import {CLASS2_HELP} from '../server/priceBookCopy.js';
import {roofPitchInputs} from '../server/quote-engine-vnext/roofSlopeRules.js';
import {reconcilePricebook,CARPET_GROUP_LABEL} from '../client/src/pricebookConflict.js';
import * as E from '../client/src/pricebookEditing.js';
import {fixture,flooring} from '../verification/engine-independent/fixtures.mjs';

const corpus=Object.fromEntries(JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261112b.json',import.meta.url),'utf8')).map(r=>[r.id,r.input]));
const run=f=>generateQuoteVNext(structuredClone(f));
const ready=f=>{const q=run(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason+' '+JSON.stringify([q.missingOwnerFields,q.invalidCustomerFields]));return q;};
const review=f=>{const q=run(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');return q;};
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const lines=q=>Object.fromEntries(q.options[0].lineItems.map(l=>[l.name,l.amountCents]));

// 2,000 sq ft roof = 20 squares, October 16 rules, one storey, one layer, gable.
// Base: labor 20 x 200 = 4,000; field materials 20 x 1.10 x 150 = 3,300; tear-off
// 20 x 60 = 1,200; underlayment 20 x 20 = 400; disposal 20 x 30 = 600. Total 9,500.
const BASE=950000;
// 7/12–9/12 adds installation 20% of 4,000 = 800, removal 26% of 1,200 = 312, disposal 26% of 600 = 156: 10,768.
const STEEP=BASE+80000+31200+15600;
// 10/12–12/12 adds 31% of 4,000 = 1,240, 41% of 1,200 = 492, 41% of 600 = 246: 11,478.
const VERY_STEEP=BASE+124000+49200+24600;
const INVALID='Project details were invalid or internally inconsistent.';

test('corpus: v29 fixes that no frozen input reached',()=>{
  assert.equal(Object.keys(corpus).length,19);
  // R01: 200 sq ft at $3/$5 per sq ft read in yards as $27/$45: labor 22.2 x 27 x 1.10 = 660, materials 22.2 x 1.10 x 45 = 1,100.
  assert.deepEqual(ready(corpus['v30:r01-yard-option-inherits-foot-carpet-prices']).options.map(o=>[o.tierName,cents({options:[o]})]),[['Yard tier',176000]]);
  // $28 per sq yd has no exact foot price: that option is left out; the yard option prices
  // 22.2 x 28 x 1.10 = 684.44 + 22.2 x 1.10 x 45 = 1,100.
  assert.deepEqual(ready(corpus['v30:r01-foot-option-inexact-beside-yard-option']).options.map(o=>[o.tierName,cents({options:[o]})]),[['Yard tier',178444]]);
  // R04 under NBC at 3/12: self-adhered 20 x 45 = 900 replaces the 400 underlayment; double adds 400.
  assert.equal(cents(ready(corpus['v30:r04-nbc-self-adhered-saved'])),1000000);
  assert.equal(cents(ready(corpus['v30:r04-nbc-double-underlayment-saved'])),990000);
  // R05: a 1/12 rise is below the asphalt minimum on any pitch method.
  for(const id of ['v30:r05-area-by-pitch-rise-1','v30:r05-not-sure-rise-1'])assert.match(review(corpus[id]).reviewReason,/^Asphalt shingles are installed only on roofs of 2\/12 or steeper\. A 1\/12 roof/,id);
  // R06: the Canadian postal code decides, whatever the currency.
  assert.match(review(corpus['v30:r06-usd-business-canadian-postal-code-1978-to-1990']).reviewReason,/^Paint in an older home can contain lead/);
  // R07: the removal review text.
  assert.equal(review(corpus['v30:r07-flooring-removal-1978-to-1990']).reviewReason,'Flooring in a building built in 1990 or earlier can contain asbestos, so it is checked before removal. The business will confirm the price.');
  // R10: 10% of flooring labor 660 + overlay preparation 200 = 86 on 2,080.
  const overlay=ready(corpus['v30:r10-overlay-preparation-busy-month']);
  assert.equal(lines(overlay)['Peak season adjustment'],8600);assert.equal(cents(overlay),216600);
});

test('roof pitch: Not sure with a band or rise is priced as whole roof at that pitch',()=>{
  assert.equal(cents(ready(corpus['v30:pitch-not-sure-band-10-to-12'])),VERY_STEEP);
  assert.equal(cents(ready(corpus['v30:pitch-not-sure-rise-8'])),STEEP);
  // 2 to under 4 prices the saved low-slope method, double underlayment +400: 9,900.
  assert.equal(cents(ready(corpus['v30:pitch-not-sure-rise-3-double-underlayment'])),990000);
  const disagree=review(corpus['v30:pitch-not-sure-band-and-rise-disagree']);
  assert.equal(disagree.reviewReason,INVALID);assert.deepEqual(disagree.invalidCustomerFields,['pitchBand']);
  // Footprint 1,800 sq ft at 8/12: 1,800 x sqrt(1 + (8/12)^2) = 2,163.33 sq ft. Labor 4,326.66; field
  // materials 21.6333 x 1.10 x 150 = 3,569.49; tear-off 1,298.00; underlayment 432.67; disposal 649.00;
  // steep installation 20% = 865.33, removal 26% = 337.48, disposal 26% = 168.74. Total 11,647.37.
  const footprint=ready(corpus['v30:pitch-footprint-not-sure-rise-8']);
  assert.equal(cents(footprint),1164737);
  assert.deepEqual([lines(footprint)['Roofing labor'],lines(footprint)['Field materials'],lines(footprint)['Tear-off'],lines(footprint)['Steep-pitch installation']],[432666,356949,129800,86533]);
  // Not sure alone keeps the business's assumed band; Not sure rise is left alone.
  assert.deepEqual(roofPitchInputs({pitchMethod:'not_sure'}),{pitchMethod:'not_sure'});
  assert.deepEqual(roofPitchInputs({pitchMethod:'not_sure',pitchRisePer12:'unknown'}),{pitchMethod:'not_sure',pitchRisePer12:'unknown'});
  assert.deepEqual(roofPitchInputs({pitchMethod:'not_sure',pitchRisePer12:3}),{pitchMethod:'whole_roof',pitchBand:'under_four',pitchRisePer12:3});
  assert.deepEqual(roofPitchInputs({pitchMethod:'not_sure',pitchRisePer12:6}),{pitchMethod:'whole_roof',pitchBand:'up_to_six',pitchRisePer12:6});
  assert.deepEqual(roofPitchInputs({pitchMethod:'not_sure',pitchRisePer12:13}),{pitchMethod:'whole_roof',pitchBand:'over_twelve',pitchRisePer12:13});
});

test('roof pitch: an answer from another method is refused only when it disagrees',()=>{
  const refused=(id,field,message)=>{const q=review(corpus[id]);assert.equal(q.reviewReason,INVALID,id);assert.deepEqual(q.invalidCustomerFields,[field],id);assert.deepEqual(q.validationMessages,[message],id);};
  refused('v30:pitch-whole-roof-area-outside-band','pitchArea10To12Sqft','Roof area at another pitch cannot be supplied when one pitch for the whole roof is the selected pitch method.');
  refused('v30:pitch-area-by-pitch-band-without-area','pitchBand','The whole-roof pitch band must match a pitch with roof area when the area is given by pitch.');
  refused('v30:pitch-area-by-pitch-rise-without-area','pitchRisePer12','The supplied rise per 12 inches must fall in a pitch with roof area when the area is given by pitch.');
  assert.equal(cents(ready(corpus['v30:pitch-whole-roof-area-inside-band'])),BASE);
  // 1,000 sq ft at 4/12–6/12 and 1,000 at 7/12–9/12: steep additions on half: 400 + 156 + 78 = 634.
  assert.equal(cents(ready(corpus['v30:pitch-area-by-pitch-rise-with-area'])),BASE+40000+15600+7800);
});

// ---- The quote form ----
function roofService(){
  const f=fixture('ROOFING_REPLACEMENT',{laborPerSquare:{asphalt_shingle:20000},materialCostPerSquare:{asphalt_shingle:15000},tearOffPerSquare:{asphalt_shingle:6000},underlaymentPerSquare:{asphalt_shingle:2000},underlaymentPriceBasis:{asphalt_shingle:'installed_area_sell_price'},disposalPerSquare:3000,accessoryPricingMode:'per_square_allin',minimumJob:0,unknownPitchBand:'up_to_six',
    pitchInstallationAdder:{seven_to_nine:0.20,ten_to_twelve:0.31},pitchRemovalAdder:{seven_to_nine:0.26,ten_to_twelve:0.41},complexityLaborMultiplier:{simple:1,moderate:1.20,complex:1.40},additionalLayerRemovalFactor:0.70},
    {roofSizeMethod:'roof_measured',roofSizeInput:2000,existingRoofType:'asphalt_shingle',replacementRoofType:'asphalt_shingle',stories:1,existingLayers:1,roofComplexity:'simple',serviceScope:'full'});
  f.ownerPricing.startingValueAdoptions={roofing_replacement_20261016:{mode:'adopted'}};
  for(const field of ['existingRoofType','replacementRoofType'])f.ownerPricing.knownOfferings[field]={...f.ownerPricing.knownOfferings[field],asphalt_shingle:randomUUID()};
  return f;
}
const PITCH_QUESTIONS=['pitchMethod','pitchBand','pitchRisePer12','pitchAreaUnder4Sqft','pitchAreaUpTo6Sqft','pitchArea7To9Sqft','pitchArea10To12Sqft','pitchAreaOver12Sqft'];
test('form: each pitch question shows only for its method',()=>{
  const f=roofService(),fields=applicationServiceDefinition({...f.ownerPricing,serviceType:f.serviceType,pricing:f.ownerPricing.pricing}).customerFields;
  const shown=inputs=>fields.filter(x=>PITCH_QUESTIONS.includes(x.name)&&customerFieldVisible(x,inputs)).map(x=>x.name);
  assert.deepEqual(shown({roofSizeMethod:'roof_measured',pitchMethod:'not_sure'}),['pitchMethod']);
  assert.deepEqual(shown({roofSizeMethod:'roof_measured',pitchMethod:'whole_roof'}),['pitchMethod','pitchBand','pitchRisePer12']);
  assert.deepEqual(shown({roofSizeMethod:'roof_measured',pitchMethod:'area_by_pitch'}),['pitchMethod','pitchAreaUnder4Sqft','pitchAreaUpTo6Sqft','pitchArea7To9Sqft','pitchArea10To12Sqft','pitchAreaOver12Sqft']);
  assert.deepEqual(shown({roofSizeMethod:'footprint',pitchMethod:'not_sure'}),['pitchMethod','pitchRisePer12']);
});
test('form: switching pitch method in the wizard drops the other methods\' answers',async()=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=new URL('..',import.meta.url).pathname;
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},stdin:{resolveDir:root+'client/src',loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {QuoteWizard} from './quoteWizard.jsx';
    function App(){const [values,setValues]=useState(window.initial);window.current=values;return <QuoteWizard services={[window.service]} service={window.service} values={values} change={(k,v)=>setValues(s=>({...s,[k]:v}))} onServiceChange={()=>{}} onSubmit={()=>{window.submitted=true;}} sending={false}/>;}
    createRoot(document.getElementById('root')).render(<App/>);`}});
  async function session(inputs,switchTo){
    const f=roofService();Object.assign(f.customerInputs,inputs);
    const d=applicationServiceDefinition({...f.ownerPricing,serviceType:f.serviceType,pricing:f.ownerPricing.pricing});
    const service={id:'svc',serviceType:f.serviceType,name:'Roof',customerFields:d.customerFields,customerFees:[],knownOfferings:f.ownerPricing.knownOfferings};
    const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window;
    w.eval(`window.initial=${JSON.stringify({serviceId:'svc',inputs:f.customerInputs,contact:{},fees:{},location:{},additionalWork:[]})};window.service=${JSON.stringify(service)};window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));`);
    w.eval(output.outputFiles[0].text);
    const tick=()=>new Promise(r=>setTimeout(r,15));
    for(let i=0;i<300&&!w.document.querySelector('form');i++)await tick();
    for(let s=0;s<40&&w.document.querySelector('h2')?.textContent!=='How the roof pitch is supplied';s++){w.document.querySelector('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();}
    const select=w.document.querySelector('.wizard-fields select');
    Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype,'value').set.call(select,switchTo);select.dispatchEvent(new w.Event('change',{bubbles:true}));await tick();
    const steps=Number(w.document.querySelector('.wizard-progress').textContent.match(/of (\d+)/)[1]);
    const pitch=Object.fromEntries(Object.entries(w.current.inputs).filter(([k])=>PITCH_QUESTIONS.includes(k)));
    w.close();return {steps,pitch};
  }
  assert.deepEqual(await session({pitchMethod:'whole_roof',pitchBand:'ten_to_twelve',pitchRisePer12:11},'not_sure'),{steps:20,pitch:{pitchMethod:'not_sure'}});
  assert.deepEqual(await session({pitchMethod:'area_by_pitch',pitchAreaUpTo6Sqft:2000},'whole_roof'),{steps:22,pitch:{pitchMethod:'whole_roof'}});
  assert.deepEqual(await session({pitchMethod:'not_sure'},'area_by_pitch'),{steps:25,pitch:{pitchMethod:'area_by_pitch'}});
  // A footprint roof needs its rise whatever the method.
  assert.deepEqual(await session({roofSizeMethod:'footprint',roofSizeInput:1800,pitchMethod:'whole_roof',pitchBand:'seven_to_nine',pitchRisePer12:8},'not_sure'),{steps:21,pitch:{pitchMethod:'not_sure',pitchRisePer12:8}});
});

// ---- Conflict recovery ----
test('conflict recovery: same-unit carpet edits merge price by price; a unit change stays one choice',()=>{
  const base=structuredClone(flooring('carpet',200).ownerPricing);base.id='11111111-1111-4111-8111-111111111111';
  base.pricing.laborPerSqft={...base.pricing.laborPerSqft,carpet:300};base.pricing.materialPerSqft={...base.pricing.materialPerSqft,carpet:500};
  const set=(s,field,v)=>E.editServiceField(s,field,{...E.serviceFieldValue(s,field),carpet:v});
  const book=s=>({services:[s],defaults:{},revision:1});
  const carpet=s=>[E.serviceFieldValue(s,'carpetPriceUnit'),E.serviceFieldValue(s,'laborPerSqft').carpet,E.serviceFieldValue(s,'materialPerSqft').carpet];
  // Labor $4 in one session, material $6 in the other, both per sq ft: $4 and $6, no conflict.
  const same=reconcilePricebook(book(base),book(set(base,'laborPerSqft',400)),book(set(base,'materialPerSqft',600)));
  assert.equal(same.conflicts.length,0);assert.deepEqual(carpet(same.draft.services[0]),[undefined,400,600]);
  // Both change labor differently in the same unit: one conflict on that price alone.
  const both=reconcilePricebook(book(base),book(set(base,'laborPerSqft',400)),book(set(base,'laborPerSqft',450)));
  assert.equal(both.conflicts.length,1);assert.notEqual(both.conflicts[0].label,CARPET_GROUP_LABEL);
  // One session converts to yards, the other changes material per sq ft: one grouped choice.
  const unit=reconcilePricebook(book(base),book(E.editCarpetPriceUnit(base,'square_yard')),book(set(base,'materialPerSqft',600)));
  assert.equal(unit.conflicts.length,1);assert.equal(unit.conflicts[0].label,CARPET_GROUP_LABEL);
});

// ---- Help ----
test('help: installed scope prices say a job goes to review until the labor share is set',()=>{
  assert.match(CLASS2_HELP['FLAT_ROOF_REPLACEMENT.accessMultiplier'],/Until the labor share is set, a job that needs an access adjustment and includes an installed insulation or cover-board price goes to you for review\./);
  assert.match(CLASS2_HELP['SIDING_REPLACEMENT.storyMultiplier'],/Until the labor share is set, a job that needs a story adjustment and includes an installed siding trim price goes to you for review\./);
  for(const type of ['CONCRETE_DRIVEWAY','CONCRETE_PATIO_SLAB'])assert.match(CLASS2_HELP[type+'.accessMultiplier'],/Until the labor share is set, a job that needs an access adjustment and includes an installed exposed-aggregate price goes to you for review\./);
});
