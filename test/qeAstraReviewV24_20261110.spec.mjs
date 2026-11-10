import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext} from '../server/quote-engine-vnext/index.js';
import {mergePricingVNext,mergePricingForValidationVNext} from '../server/quote-engine-vnext/pricingMerge.js';
import {customerQuoteFields} from '../server/customerQuoteFields.js';
import {flooring} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {migrate} from '../server/src/db.js';
import {convertPricebookMoney} from '../server/priceBookMoney.js';
import {servicePricing} from '../client/src/pricebookEditing.js';
import {inactiveQuantityAssumption} from '../server/quote-engine-vnext/surfacePricing.js';
import {VINYL_PLANK_INSTALL_METHOD_DECISION} from '../server/quote-engine-vnext/flooringPricing.js';
import {customerFieldVisible,customerFieldForInputs,withoutInapplicableFloorAnswers,FLOOR_STAY_LABEL,FLOOR_SUPPORT_LABEL,FLOOR_SUPPORT_QUESTIONS} from '../server/scopeConfiguration.js';

// November 10, 2026: Astra's review of v24 and her refinements (engine v25).
// Expected values worked out by hand before running:
// - Flooring, 200 sq ft laminate or floating vinyl plank: labor 200 x 3.00 x
//   1.10 = 660.00; material 200 x 5.00 x 1.08 = 1,080.00; total 1,740.00.
//   Removal of the old floor at 1.00 per sq ft adds 200 x 1.00 = 200.00:
//   1,940.00. The construction conditions add no line; they decide whether
//   the job is priced (ready), priced with the construction left for the site
//   (partial), refused, or asks its question.
// - Wood-floor readings once the wood floor is removed: glued to concrete leaves
//   the bare slab (meets both conditions); laid on or fastened to concrete may
//   or may not leave plywood or boards on the slab (direct-over-concrete
//   unresolved); sleepers stay (break the sleeper condition; leave
//   direct-over-concrete unresolved, as when kept).
// - Painting: installed interior 3,800; installed exterior 3,180; itemized
//   exterior with the fixture's 10% allowances: material 500 x 1.10 = 550, total
//   2,475. Neither total reads the exterior fair-condition preparation hours,
//   and installed totals read no waste allowance or coat ratio.
const L={laminateInstallInstructions:'[SYNTHETIC] Laminate X rev. 2025'},V={vinylPlankInstallInstructions:'[SYNTHETIC] Plank Y rev. 2025',vinylPlankInstallMethod:'floating'};
const OVER={laminate:'laminateFloatsOver',vinyl_plank:'vinylPlankFloatsOver'},SET={laminate:'laminateFloatConditions',vinyl_plank:'vinylPlankFloatConditions'};
const ALL_FLOATABLE={wood:true,resilient_sheet:true,resilient_tile_plank:true,laminate:true,ceramic_stone_tile:true,concrete:true};
const rulesFor=product=>product==='laminate'?{...L}:{...V};
const floor=(product,name,pricing={},answers={},type='FLOORING_INSTALL')=>{
  const f=flooring(product);f.serviceType=type;f.ownerPricing.serviceType=type;if(f.ownerPricing.origin)f.ownerPricing.origin={...f.ownerPricing.origin,serviceType:type};
  Object.assign(f.ownerPricing.pricing,{scopeDetails:product==='laminate'?{floor_underlayment_laminate:{description:'[SYNTHETIC] Pad',mode:'included_in_floor_price'}}:{},...pricing});
  if(name!=='none'){
    if(!f.ownerPricing.knownOfferings.existingFloorType[name])f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[name]:randomUUID()};
    f.ownerPricing.pricing.removalPerSqft={...(f.ownerPricing.pricing.removalPerSqft||{}),[name]:100};
  }
  f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:name,removalNeeded:false,...(product==='laminate'?{underlaymentScopeConfirmed:true}:{}),...(type==='FLOORING_REPLACEMENT'?{subfloorIssues:false}:{}),...answers});
  if(name!=='none')f.customerInputs.confirmedFacts={...(f.customerInputs.confirmedFacts||{}),existingFloorType:{status:'identified',field:'existingFloorType',value:name,offeringId:f.ownerPricing.knownOfferings.existingFloorType[name]}};
  return f;
};
const register=(f,...names)=>{for(const n of names)if(!f.ownerPricing.knownOfferings.existingFloorType[n]){f.ownerPricing.knownOfferings.existingFloorType={...f.ownerPricing.knownOfferings.existingFloorType,[n]:randomUUID()};f.ownerPricing.pricing.removalPerSqft={...(f.ownerPricing.pricing.removalPerSqft||{}),[n]:100};}return f;};
const outcome=q=>q.resultType==='INSTANT_ESTIMATE_READY'
  ?(q.options[0].skippedAddons.includes(FLOOR_SUPPORT_LABEL)?'partial-support':q.options[0].skippedAddons.includes(FLOOR_STAY_LABEL)?'partial-stay':'ready')
  :q.missingCustomerFields?.length?'asks:'+q.missingCustomerFields.join(','):q.invalidCustomerFields?.length?'invalid:'+q.invalidCustomerFields.map(e=>e.field||e).join(','):'refused';
const form=f=>customerQuoteFields({...f.ownerPricing,serviceType:f.serviceType},f.ownerPricing.pricing);
const shown=(fields,name,inputs)=>{const field=fields.find(x=>x.name===name);return !!field&&customerFieldVisible(field,inputs);};
const stay={removalNeeded:false,existingFloorSound:'yes'},remove={removalNeeded:true,removalAreaSqft:200};

// The expected readings, written out per condition and per question.
const EXPECTED={
  no_sleeper_construction:{
    wood:{stay:{joists:'ready',glued_to_concrete:'ready',direct_on_concrete:'ready',sleepers:'refused',not_sure:'partial-stay'},
      remove:{joists:'ready',glued_to_concrete:'ready',direct_on_concrete:'ready',sleepers:'refused',not_sure:'partial-support'}},
    support:{stay:{joists:'ready',wood_on_concrete:'ready',sleepers:'refused',concrete_slab:'ready',not_sure:'partial-stay'},
      remove:{joists:'ready',wood_on_concrete:'ready',sleepers:'refused',concrete_slab:'ready',not_sure:'partial-support'}}
  },
  wood_not_directly_over_concrete:{
    wood:{stay:{joists:'ready',glued_to_concrete:'refused',direct_on_concrete:'refused',sleepers:'partial-stay',not_sure:'partial-stay'},
      remove:{joists:'ready',glued_to_concrete:'ready',direct_on_concrete:'partial-support',sleepers:'partial-support',not_sure:'partial-support'}},
    support:{stay:{joists:'ready',wood_on_concrete:'refused',sleepers:'partial-stay',concrete_slab:'ready',not_sure:'partial-stay'},
      remove:{joists:'ready',wood_on_concrete:'refused',sleepers:'partial-support',concrete_slab:'ready',not_sure:'partial-support'}}
  }
};
// Existing coverings by name: oak (wood), sheet_vinyl, vct (vinyl tile), laminate,
// ceramic_tile, concrete. Carpet and an unclassified name only when removed.
const COVERINGS=['oak','sheet_vinyl','vct','laminate','ceramic_tile','concrete'];

test('1: each construction condition, every covering, kept and removed, and no existing floor, both products and both services',()=>{
  for(const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT'])for(const product of ['laminate','vinyl_plank'])for(const condition of Object.keys(EXPECTED)){
    const pricing={...rulesFor(product),[OVER[product]]:{...ALL_FLOATABLE},[SET[product]]:{[condition]:true}};
    const jobs=[
      ...COVERINGS.flatMap(name=>[[name,'stay',stay],[name,'remove',remove]]),
      ['carpet','remove',remove],['mystery_floor','remove',remove],['none','none',{removalNeeded:false}]
    ];
    for(const [name,scenario,base] of jobs){
      const wood=name==='oak',question=wood?'woodFloorAssembly':'floorSupportConstruction',other=wood?'floorSupportConstruction':'woodFloorAssembly';
      const label=`${type} ${product} ${condition} ${name} ${scenario}`;
      const blank=floor(product,name,pricing,base,type),fields=form(blank);
      // The question is shown, worded for the scenario, and required.
      assert.equal(shown(fields,question,blank.customerInputs),true,label+' shown');
      assert.equal(shown(fields,other,blank.customerInputs),false,label+' other question hidden');
      if(!wood)assert.equal(customerFieldForInputs(fields.find(f=>f.name===question),blank.customerInputs).label,FLOOR_SUPPORT_QUESTIONS[scenario],label+' wording');
      assert.equal(outcome(generateQuoteVNext(blank)),'asks:'+question,label+' unanswered');
      const table=EXPECTED[condition][wood?'wood':'support'][scenario==='none'?'remove':scenario];
      for(const [answer,expected] of Object.entries(table)){
        const q=generateQuoteVNext(floor(product,name,pricing,{...base,[question]:answer},type));
        // No existing floor reads like a removed one, without the removal charge.
        const want=scenario==='none'&&expected==='partial-stay'?'partial-support':expected;
        assert.equal(outcome(q),want,label+' '+answer);
        if(want!=='refused')assert.equal(q.options[0].midEstimate,scenario==='remove'?1940:1740,label+' '+answer+' total');
        else{
          assert.doesNotMatch(q.reviewReason,/has to come out first/,label+' '+answer);
          assert.match(q.reviewReason,scenario==='remove'?/remains after the existing floor is removed/:scenario==='none'?/it would be laid on/:/including whether removing the existing floor is enough/,label+' '+answer);
          assert.match(q.reviewReason,condition==='no_sleeper_construction'?/sleeper construction/:/laid directly over concrete/,label+' '+answer);
        }
      }
    }
  }
});

test('1: a construction condition the owner has not turned on asks nothing and quotes in full',()=>{
  for(const product of ['laminate','vinyl_plank']){
    // Only the glue condition (about the wood covering itself): it does not follow removal.
    const glueOnly={...rulesFor(product),[OVER[product]]:{wood:true},[SET[product]]:{wood_not_glued_to_concrete:true}};
    for(const [name,base,total] of [['oak',remove,1940],['sheet_vinyl',remove,1940],['none',{removalNeeded:false},1740]]){
      const f=floor(product,name,glueOnly,base),fields=form(f);
      assert.equal(shown(fields,'woodFloorAssembly',f.customerInputs)||shown(fields,'floorSupportConstruction',f.customerInputs),false,product+' '+name);
      const q=generateQuoteVNext(f);assert.equal(outcome(q),'ready',product+' '+name);assert.equal(q.options[0].midEstimate,total);
    }
    // No conditions at all.
    for(const [name,base,total] of [['ceramic_tile',{...stay},1740],['ceramic_tile',remove,1940],['none',{removalNeeded:false},1740]]){
      const f=floor(product,name,{...rulesFor(product),[OVER[product]]:{...ALL_FLOATABLE}},base);
      assert.equal(outcome(generateQuoteVNext(f)),'ready',product+' '+name);assert.equal(generateQuoteVNext(f).options[0].midEstimate,total);
    }
  }
  // A glue-down vinyl plank is not floated: the floating-product conditions do not apply.
  const glue=floor('vinyl_plank','ceramic_tile',{vinylPlankInstallInstructions:'[SYNTHETIC] P',vinylPlankInstallMethod:'glue_down',vinylPlankFloatConditions:{no_sleeper_construction:true}},remove);
  assert.equal(outcome(generateQuoteVNext(glue)),'ready');
});

test('1: removing the old floor never drops a known construction answer (shared cleanup, both directions, restored drafts)',()=>{
  for(const product of ['laminate','vinyl_plank']){
    const pricing={...rulesFor(product),[OVER[product]]:{...ALL_FLOATABLE},[SET[product]]:{no_sleeper_construction:true}};
    for(const [name,question] of [['oak','woodFloorAssembly'],['ceramic_tile','floorSupportConstruction']]){
      const kept=floor(product,name,pricing,{...stay,[question]:'sleepers'}),fields=form(kept);
      assert.equal(outcome(generateQuoteVNext(kept)),'refused');
      // Keep -> remove: the construction answer stays; the soundness answer goes.
      const removed=withoutInapplicableFloorAnswers(fields,{...kept.customerInputs,...remove});
      assert.equal(removed[question],'sleepers',product+' '+name);
      assert.equal(Object.hasOwn(removed,'existingFloorSound'),false);
      const {confirmedFacts:_,...answers}=removed;
      assert.equal(outcome(generateQuoteVNext(floor(product,name,pricing,answers))),'refused',product+' '+name+' removed');
      // Remove -> keep: still kept, still refused.
      const back=withoutInapplicableFloorAnswers(fields,{...removed,removalNeeded:false,removalAreaSqft:undefined,existingFloorSound:'yes'});
      assert.equal(back[question],'sleepers');
      // A restored draft that already says removal keeps its answer in the payload.
      assert.equal(withoutInapplicableFloorAnswers(fields,{...kept.customerInputs,...remove,[question]:'sleepers'})[question],'sleepers');
    }
    // Switching the covering's material changes which question describes it:
    // the wood answer goes and the other question is asked.
    const fields=form(floor(product,'oak',pricing,stay));
    const f2=floor(product,'oak',pricing,stay);register(f2,'ceramic_tile');
    const switched=withoutInapplicableFloorAnswers(form(f2),{...f2.customerInputs,woodFloorAssembly:'sleepers',existingFloorType:'ceramic_tile'});
    assert.equal(Object.hasOwn(switched,'woodFloorAssembly'),false);
    assert.equal(shown(form(f2),'floorSupportConstruction',switched),true);
    assert.ok(fields);
  }
});

test('1: an answer to the other kind of floor\'s question is refused, never read beside the real one',()=>{
  for(const product of ['laminate','vinyl_plank']){
    const pricing={...rulesFor(product),[OVER[product]]:{...ALL_FLOATABLE},[SET[product]]:{no_sleeper_construction:true,wood_not_directly_over_concrete:true}};
    // Wood floor: a met wood answer plus a breaking other answer, and the reverse.
    for(const scenario of [stay,remove]){
      assert.equal(outcome(generateQuoteVNext(floor(product,'oak',pricing,{...scenario,woodFloorAssembly:'joists',floorSupportConstruction:'sleepers'}))),'invalid:floorSupportConstruction');
      assert.equal(outcome(generateQuoteVNext(floor(product,'oak',pricing,{...scenario,woodFloorAssembly:'sleepers',floorSupportConstruction:'joists'}))),'invalid:floorSupportConstruction');
      assert.equal(outcome(generateQuoteVNext(floor(product,'ceramic_tile',pricing,{...scenario,floorSupportConstruction:'joists',woodFloorAssembly:'sleepers'}))),'invalid:woodFloorAssembly');
    }
    assert.equal(outcome(generateQuoteVNext(floor(product,'none',pricing,{removalNeeded:false,floorSupportConstruction:'joists',woodFloorAssembly:'direct_on_concrete'}))),'invalid:woodFloorAssembly');
    // The earlier glue answer is read only while the wood floor stays.
    assert.equal(outcome(generateQuoteVNext(floor(product,'oak',pricing,{...remove,woodFloorAssembly:'joists',woodAdheredToConcrete:'no'}))),'invalid:woodAdheredToConcrete');
    const fields=form(floor(product,'oak',pricing,remove));
    assert.equal(Object.hasOwn(withoutInapplicableFloorAnswers(fields,{...floor(product,'oak',pricing,remove).customerInputs,woodAdheredToConcrete:'no'}),'woodAdheredToConcrete'),false);
  }
});

test('1: a visible concrete surface is not proof of a slab: concrete is asked what it is laid on',()=>{
  const pricing={...L,laminateFloatsOver:{concrete:true},laminateFloatConditions:{wood_not_directly_over_concrete:true}};
  assert.equal(outcome(generateQuoteVNext(floor('laminate','concrete',pricing,stay))),'asks:floorSupportConstruction');
  assert.equal(outcome(generateQuoteVNext(floor('laminate','concrete',pricing,{...stay,floorSupportConstruction:'concrete_slab'}))),'ready');
  // A cementitious topping over plywood fastened to concrete.
  assert.equal(outcome(generateQuoteVNext(floor('laminate','concrete',pricing,{...stay,floorSupportConstruction:'wood_on_concrete'}))),'refused');
  // Gypsum or cement underlayment over a framed floor.
  assert.equal(outcome(generateQuoteVNext(floor('laminate','concrete',pricing,{...stay,floorSupportConstruction:'joists'}))),'ready');
});

// ---- Through the real form component ----
async function render(entry,globals){
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const output=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},stdin:{resolveDir:root,loader:'jsx',contents:entry}});
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.eval(Object.entries(globals).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('')+'window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(output.outputFiles[0].text);
  return w;
}
const until=async(cond,n=500)=>{for(let i=0;i<n&&!cond();i++)await new Promise(r=>setTimeout(r,10));};
const formEntry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {CustomerMeasurements} from './client/src/quoteDoneControls.jsx';
  function App(){const [value,setValue]=useState(window.initial);window.current=value;return <CustomerMeasurements fields={window.fields.filter(f=>f.name===window.parent)} scopeFields={window.fields} value={value} onChange={v=>{window.current=v;setValue(v);}}/>;}
  createRoot(document.getElementById('root')).render(<App/>);`;
async function choose(w,value){
  let select;await until(()=>select=w.document.querySelector('select'));
  assert.ok(select,'parent control rendered');
  const option=[...select.options].find(o=>o.value===String(value));assert.ok(option,'option '+value);
  select.value=option.value;select.dispatchEvent(new w.Event('change',{bubbles:true}));
  await new Promise(r=>setTimeout(r,30));
}

test('1: Astra\'s sleeper case through the real form: keep -> remove -> keep, both products and both services',async t=>{
  for(const type of ['FLOORING_INSTALL','FLOORING_REPLACEMENT'])for(const product of ['laminate','vinyl_plank']){
    const pricing={...rulesFor(product),[OVER[product]]:{wood:true},[SET[product]]:{no_sleeper_construction:true}};
    const f=floor(product,'oak',pricing,{...stay,woodFloorAssembly:'sleepers'},type),fields=form(f);
    assert.equal(outcome(generateQuoteVNext(f)),'refused');
    const w=await render(formEntry,{initial:f.customerInputs,fields,parent:'removalNeeded'});t.after(()=>w.close());
    const current=()=>JSON.parse(JSON.stringify(w.current));
    await choose(w,true);
    assert.equal(current().woodFloorAssembly,'sleepers',type+' '+product+' kept on removal');
    // 200 sq ft of removal supplied: still refused, never the 1,940 estimate.
    assert.equal(outcome(generateQuoteVNext({...f,customerInputs:{...current(),removalAreaSqft:200}})),'refused',type+' '+product);
    await choose(w,false);
    assert.equal(current().woodFloorAssembly,'sleepers');
    assert.equal(outcome(generateQuoteVNext({...f,customerInputs:{...current(),existingFloorSound:'yes'}})),'refused');
  }
});

// ---- Finding 3: earlier condition names at each level ----
test('3: tier precedence holds whichever name each level uses, in the form, the normalized and the raw service',()=>{
  const directions=[];
  for(const [baseName,tierName] of [['wood_not_glued_to_concrete','wood_not_on_concrete'],['wood_not_on_concrete','wood_not_glued_to_concrete'],['wood_not_on_concrete','wood_not_on_concrete'],['wood_not_glued_to_concrete','wood_not_glued_to_concrete']])
    for(const tierValue of [true,false])directions.push([baseName,!tierValue,tierName,tierValue]);
  for(const product of ['laminate','vinyl_plank'])for(const [baseName,baseValue,tierName,tierValue] of directions){
    const pricing={...rulesFor(product),[OVER[product]]:{wood:true},[SET[product]]:{[baseName]:baseValue}};
    const make=answers=>{const f=floor(product,'oak',pricing,{...stay,...answers});f.ownerPricing.tiers=[{name:'Only',overrides:{[SET[product]]:{[tierName]:tierValue}}}];return f;};
    const label=`${product} base ${baseName}:${baseValue} tier ${tierName}:${tierValue}`;
    const raw=make({}),before=JSON.stringify(raw.ownerPricing);
    const normalized=answers=>{const f=make(answers);f.ownerPricing=bridge.withRenamedFloatConditions(f.ownerPricing);return f;};
    // The tier's value decides: shown and required exactly when it is true.
    assert.equal(shown(form(raw),'woodFloorAssembly',raw.customerInputs),tierValue,label+' form');
    for(const f of [make({}),normalized({})])assert.equal(outcome(generateQuoteVNext(f)),tierValue?'asks:woodFloorAssembly':'ready',label);
    for(const f of [make({woodFloorAssembly:'glued_to_concrete'}),normalized({woodFloorAssembly:'glued_to_concrete'})])assert.equal(outcome(generateQuoteVNext(f)),tierValue?'refused':'ready',label+' glued');
    // The owner's preview and saved-book checks read the same.
    const preview=customerQuoteFields({...raw.ownerPricing,serviceType:raw.serviceType},raw.ownerPricing.pricing);
    assert.equal(shown(preview,'woodFloorAssembly',raw.customerInputs),tierValue,label+' preview');
    assert.equal(JSON.stringify(raw.ownerPricing),before,label+' input not modified');
  }
});

test('3: the shared merge reads each level under current names without modifying either input',()=>{
  const base={laminateFloatConditions:{wood_not_glued_to_concrete:false,no_sleeper_construction:true}},tier={laminateFloatConditions:{wood_not_on_concrete:true}};
  const snapshot=JSON.stringify([base,tier]);
  for(const merge of [mergePricingVNext,mergePricingForValidationVNext]){
    assert.deepEqual(JSON.parse(JSON.stringify(merge(base,tier))).laminateFloatConditions,{wood_not_glued_to_concrete:true,no_sleeper_construction:true});
    // Empty overrides and an explicit false in the tier.
    assert.deepEqual(JSON.parse(JSON.stringify(merge({laminateFloatConditions:{wood_not_on_concrete:true}},{}))).laminateFloatConditions,{wood_not_glued_to_concrete:true});
    assert.deepEqual(JSON.parse(JSON.stringify(merge({laminateFloatConditions:{wood_not_glued_to_concrete:true}},{laminateFloatConditions:{wood_not_on_concrete:false}}))).laminateFloatConditions,{wood_not_glued_to_concrete:false});
    // Both names within one level: the current name keeps its value (unchanged behavior).
    assert.deepEqual(JSON.parse(JSON.stringify(merge({vinylPlankFloatConditions:{wood_not_on_concrete:true,wood_not_glued_to_concrete:false}},{}))).vinylPlankFloatConditions,{wood_not_glued_to_concrete:false});
    // Pricing without either set is untouched.
    assert.deepEqual(JSON.parse(JSON.stringify(merge({materialPerSqft:{laminate:500}},{materialPerSqft:{laminate:600}}))),{materialPerSqft:{laminate:600}});
  }
  assert.equal(JSON.stringify([base,tier]),snapshot);
  // With no tiers, the single level is read under its current name.
  const f=floor('laminate','oak',{...L,laminateFloatsOver:{wood:true},laminateFloatConditions:{wood_not_on_concrete:true}},stay);
  assert.equal(outcome(generateQuoteVNext(f)),'asks:woodFloorAssembly');
});

// ---- Finding 4: the returned owner diagnostic ----
test('4: the returned install-method decision matches the help, in all three places',()=>{
  const f=floor('vinyl_plank','oak',{vinylPlankInstallInstructions:'[SYNTHETIC] P',vinylPlankFloatsOver:{wood:false}},stay);
  const q=generateQuoteVNext(f);
  assert.ok(q.ownerDiagnostics.some(d=>d.message===VINYL_PLANK_INSTALL_METHOD_DECISION),'ownerDiagnostics');
  assert.ok(JSON.stringify(q.ownerDecisionRequired).includes(JSON.stringify(VINYL_PLANK_INSTALL_METHOD_DECISION).slice(1,-1)),'ownerDecisionRequired');
  assert.ok(q.validationMessages.includes(VINYL_PLANK_INSTALL_METHOD_DECISION),'validationMessages');
  assert.doesNotMatch(JSON.stringify(q),/quotes as a standard install/);
  assert.match(VINYL_PLANK_INSTALL_METHOD_DECISION,/only where the substrates and conditions you set for it allow/);
  assert.match(VINYL_PLANK_INSTALL_METHOD_DECISION,/An overlay or preparation price doesn't make an install compatible/);
  const help=bridge.applicationMetadata().services.find(s=>s.serviceType==='FLOORING_INSTALL').fields?.find?.(x=>x.field==='vinylPlankInstallMethod')?.help;
  if(help)assert.match(help,/never makes an incompatible install quote/);
});

// ---- Finding 2: painting quantity assumptions ----
const painting=(type,mode,extra={})=>{const f=offeringFixture(type,mode);
  if(type==='INTERIOR_PAINTING'){Object.assign(f.customerInputs,{ceilingCoats:2,ceilingSurfaceCondition:'good',trimCoats:1,trimSurfaceCondition:'good'});if(mode==='itemized'){const r=f.ownerPricing.pricing.offeringRates;Object.assign(r,{prepLaborPerSqft_good:r.prepLaborPerSqft,prepMaterialPerSqft_good:r.prepMaterialPerSqft});}}
  Object.assign(f.ownerPricing.pricing,extra);return f;};
test('2: values the method does not read change no quote',()=>{
  for(const [mode,total] of [['installed',3180],['itemized',2475]])for(const prep of [{fair:0.008},{fair:0.1}])
    assert.equal(generateQuoteVNext(painting('EXTERIOR_PAINTING',mode,{prepHoursPerSqft:prep})).options[0].midEstimate,total,'exterior '+mode);
  for(const [type,total] of [['INTERIOR_PAINTING',3800],['EXTERIOR_PAINTING',3180]])for(const ratio of [0.5,2])for(const waste of [0,0.5])
    assert.equal(generateQuoteVNext(painting(type,'installed',{paintingSettings:{wallAdditionalCoatRatio:ratio,ceilingAdditionalCoatRatio:ratio,trimAdditionalCoatRatio:ratio},paintWasteFactor:waste,primerWasteFactor:waste,prepMaterialWasteFactor:waste})).options[0].midEstimate,total,type);
  // Still read: wall height (vaulted) and stories under installed pricing.
  assert.equal(generateQuoteVNext(painting('EXTERIOR_PAINTING','installed',{storyMultiplier:{1:2,2:2,3:2}})).options[0].midEstimate>3180,true);
  assert.equal(inactiveQuantityAssumption('EXTERIOR_PAINTING',{offeringMode:'installed'},'storyMultiplier'),null);
  assert.equal(inactiveQuantityAssumption('INTERIOR_PAINTING',{offeringMode:'installed'},'wallHeightLaborMultiplier'),null);
  assert.equal(inactiveQuantityAssumption('INTERIOR_PAINTING',{offeringMode:'itemized'},'paintWasteFactor'),null);
  assert.equal(inactiveQuantityAssumption('INTERIOR_PAINTING',{},'paintWasteFactor'),null);
  assert.ok(inactiveQuantityAssumption('EXTERIOR_PAINTING',{offeringMode:'itemized'},'prepHoursPerSqft'));
});

// The complete price-book screen, from a saved book.
async function priceBookScreen(t,type,mode,extra){
  const {build}=await import('esbuild'),{JSDOM,VirtualConsole}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  migrate();
  const bundle=(await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'t',setup(b){b.onLoad({filter:/[\\/]client[\\/]src[\\/]api\.js$/},()=>({contents:'export const api=async(...args)=>JSON.parse(JSON.stringify(await window.__transport(...args)));export const go=()=>{};export const logout=async()=>{};export const getSessionKey=()=>"[SYNTHETIC]";',loader:'js'}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:"import React from 'react';import {createRoot} from 'react-dom/client';import PriceBook from './client/src/pricebook.jsx';window.__root=createRoot(document.getElementById('root'));window.__root.render(<PriceBook/>);"}})).outputFiles[0].text;
  const owner='[SYNTHETIC]-v25-'+randomUUID();
  const f=offeringFixture(type,mode);Object.assign(f.ownerPricing.pricing,extra);
  const {origin,id,...op}=f.ownerPricing;
  bridge.saveApplicationBook(owner,{...bridge.readApplicationBook(owner),services:[convertPricebookMoney({...op,serviceType:type,source:'MANUAL',active:true},'toDollars')]});
  const dom=new JSDOM('<!DOCTYPE html><div id="root"></div>',{url:'http://synthetic.invalid/pricebook',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
  const w=dom.window,d=w.document,saved=[];
  w.eval('window.structuredClone=v=>v===undefined?undefined:JSON.parse(JSON.stringify(v));');w.crypto.randomUUID=randomUUID;w.HTMLElement.prototype.scrollIntoView=function(){};
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.__transport=async(path,{body}={})=>{body=body&&JSON.parse(JSON.stringify(body));
    if(path==='/api/dashboard')return {ownerId:owner,operator:{}};
    if(path==='/api/onboarding/state')return {account:{plan:'QuoteDone',planStatus:'active'},profile:{businessTypes:[type]}};
    if(path==='/api/pricebook/meta')return bridge.applicationMetadata();
    if(path==='/api/pricebook/'+owner)return bridge.readApplicationBook(owner);
    if(path==='/api/pricebook/validate')return bridge.validateApplicationDraft(owner,body);
    if(path==='/api/pricebook/preview')return bridge.previewApplicationQuote(owner,body);
    if(path==='/api/pricebook/save'){saved.push(body);return {statuses:[]};}
    if(path==='/api/quotedone/access')return {publicKey:null,allowedOrigins:[]};
    throw Error('unexpected path '+path);};
  w.eval(bundle);
  t.after(()=>{w.__root.unmount();w.close();});
  const button=text=>[...d.querySelectorAll('button')].find(b=>b.textContent.includes(text));
  await until(()=>button('Quantity assumptions'));
  const disclosure=button('Quantity assumptions');assert.ok(disclosure,'Quantity assumptions shown');
  if(disclosure.getAttribute('aria-expanded')!=='true')disclosure.click();
  await until(()=>d.querySelectorAll('.assumption-row').length>0);
  const row=label=>[...d.querySelectorAll('.assumption-row')].find(r=>r.querySelector('.assumption-label')?.textContent===label);
  return {w,d,row,button,saved};
}
const WASTE=['Finish paint material waste','Primer material waste','Preparation material waste'];
const savedPricing=screen=>servicePricing(screen.saved.at(-1).services[0]);

test('2: installed painting shows every unread assumption read-only and unused; Reset all leaves them as saved',async t=>{
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING']){
    const extra={paintWasteFactor:0.25,primerWasteFactor:0.25,prepMaterialWasteFactor:0.25,...(type==='EXTERIOR_PAINTING'?{prepHoursPerSqft:{fair:0.05},storyMultiplier:{1:1,2:1.3,3:1.5}}:{wallHeightLaborMultiplier:{standard:1,high:1.3,vaulted:1.5}})};
    const screen=await priceBookScreen(t,type,'installed',extra);
    const inactive=[...WASTE,'Painting additional-coat labor ratios',...(type==='EXTERIOR_PAINTING'?['Exterior fair-condition preparation labor hours']:[])];
    for(const label of inactive){
      const r=screen.row(label);assert.ok(r,type+' '+label);
      assert.equal(r.querySelectorAll('input,button').length,0,type+' '+label+' read-only');
      assert.match(r.textContent,/Saved, but not used by/,type+' '+label);
      assert.doesNotMatch(r.textContent,/Edit these values in the service fields above/);
    }
    for(const label of WASTE)assert.match(screen.row(label).textContent,/Saved value: 25%/);
    if(type==='EXTERIOR_PAINTING')assert.match(screen.row('Exterior fair-condition preparation labor hours').textContent,/Saved value: Fair 0\.05/);
    // Still read: editable.
    const active=type==='EXTERIOR_PAINTING'?'Exterior story labor multiplier':'Wall-height labor multiplier';
    assert.ok(screen.row(active).querySelectorAll('input').length>0,type+' '+active);
    assert.match(screen.d.body.textContent,/does not read are shown as saved and unused/);
    // Reset all: the active value returns to its default; the unused values keep theirs.
    screen.button('Reset all to default').click();await new Promise(r=>setTimeout(r,50));
    for(const label of WASTE)assert.match(screen.row(label).textContent,/Saved value: 25%/,type+' after reset');
    screen.button('Save & validate').click();await until(()=>screen.saved.length>0);
    const p=savedPricing(screen);
    for(const field of ['paintWasteFactor','primerWasteFactor','prepMaterialWasteFactor'])assert.equal(p[field],0.25,type+' '+field);
    if(type==='EXTERIOR_PAINTING'){assert.deepEqual(p.prepHoursPerSqft,{fair:0.05});assert.deepEqual(p.storyMultiplier,{1:1,2:1.1,3:1.2});}
    else assert.deepEqual(p.wallHeightLaborMultiplier,{standard:1,high:1.1,vaulted:1.25});
  }
});

test('2: itemized exterior is the control: allowances editable and reset; preparation hours unused; switching methods keeps saved values',async t=>{
  const screen=await priceBookScreen(t,'EXTERIOR_PAINTING','itemized',{paintWasteFactor:0.25,primerWasteFactor:0.25,prepMaterialWasteFactor:0.25,prepHoursPerSqft:{fair:0.05}});
  for(const label of WASTE){const input=screen.row(label).querySelector('input');assert.ok(input,label);assert.equal(input.value,'25');assert.equal(input.disabled,false);}
  assert.equal(screen.row('Exterior fair-condition preparation labor hours').querySelectorAll('input').length,0);
  // Switch to installed and back: the three allowances keep 25% throughout.
  const method=()=>screen.d.querySelector('select[aria-label="Offering pricing"]');
  const pick=async value=>{const s=method();s.value=value;s.dispatchEvent(new screen.w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,50));};
  await pick('installed');
  for(const label of WASTE)assert.match(screen.row(label).textContent,/Saved value: 25%/,'installed '+label);
  await pick('itemized');
  for(const label of WASTE)assert.equal(screen.row(label).querySelector('input').value,'25','itemized again '+label);
  // Reset all under itemized: the allowances return to their defaults; the unused hours stay.
  screen.button('Reset all to default').click();await new Promise(r=>setTimeout(r,50));
  screen.button('Save & validate').click();await until(()=>screen.saved.length>0);
  const p=savedPricing(screen);
  const defaults=bridge.applicationMetadata().services.find(s=>s.serviceType==='EXTERIOR_PAINTING').class2Fields;
  for(const field of ['paintWasteFactor','primerWasteFactor','prepMaterialWasteFactor'])assert.equal(p[field],defaults.find(x=>x.field===field).defaultValue,field);
  assert.deepEqual(p.prepHoursPerSqft,{fair:0.05});
});
