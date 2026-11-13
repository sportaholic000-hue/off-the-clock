// Engine v32: the four items of the audit of 61fd41fb. Expected amounts are
// worked by hand in the comments, from the fixture's own prices, before the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {reconcilePricebook} from '../client/src/pricebookConflict.js';
import {exactCarpetConversion} from '../server/quote-engine-vnext/carpetUnitConversion.js';
import * as E from '../client/src/pricebookEditing.js';
import {flooring,concrete} from '../verification/engine-independent/fixtures.mjs';
import {FT,YD,other,D,C,JOB,ready,review,cents,startBook,quotes,meaning,expectedQuotes,CASES,optionUnitOf,sameMeaning,combined} from './carpetTableFixture.mjs';

const bridge=await import('../server/src/quoteDoneBridge.js');
const METADATA=bridge.applicationMetadata().services;
const book=(s,defaults={})=>({services:[s],defaults,revision:1});

// ---------------------------------------------------------------------------
// Item 1: tax on a job in the other country
// ---------------------------------------------------------------------------
// 200 sq ft of tile: labor 200 x 3 x 1.10 = 660 + material 200 x 1.12 x 5 = 1,120 = 1,780.00 before tax.
// Ontario 13% = 2,011.40; Quebec (owner rate) 14.975% = 2,046.555, to the cent 2,046.56;
// Manhattan zone 8.875% = 1,937.975, to the cent 1,937.98; business rate 5% = 1,869.00.
const CODES={'Canadian fixed-rate province (K1A 0B1)':'K1A 0B1','Canadian owner-rate province (H2X 1Y4, Quebec)':'H2X 1Y4','US ZIP in a zone (10001)':'10001','US ZIP outside every zone (98101)':'98101','none':undefined,'invalid (1234)':'1234'};
const OUTSIDE={CA:'Jobs outside Canada are priced by the business directly.',US:'Jobs outside the United States are priced by the business directly.'};
function taxJob({currency,country,code,outside}){
  const f=flooring('tile',200);
  Object.assign(f.businessDefaults,{currency,taxMode:'TAX_ALL',taxPercent:5,taxByJobLocation:true,provinceTaxPercent:{QC:14.975},taxZones:[{name:'Manhattan',codes:'100',percent:8.875}],...(outside?{taxOutsideZones:outside}:{}),...(country?{businessCountry:country}:{})});
  f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,labor:true,material:true};
  if(code!==undefined)f.customerInputs.postalCode=code;
  return f;
}
// The rule, written independently of the code: the job's country from its code,
// the business's from onboarding, else the currency.
function expectedTax({currency,country,code,outside}){
  const business=country||(currency==='USD'?'US':'CA');
  if(code===undefined)return 'review: A postal or ZIP code is needed for the sales tax on this job.';
  if(code==='1234')return 'review: Enter a valid Canadian postal code or 5-digit US ZIP code.';
  const job=/^[A-Z]/.test(code)?'CA':'US';
  if(job!==business)return 'review: '+OUTSIDE[business];
  if(code==='K1A 0B1')return 201140;
  if(code==='H2X 1Y4')return 204656;
  if(code==='10001')return 193798;
  return outside==='business_rate'?186900:'review: This job is outside the areas the business has set tax rates for; the business will confirm the tax.';
}
const TAX_ROWS=[];
for(const currency of ['CAD','USD'])for(const country of ['CA','US',undefined])for(const [codeName,code] of Object.entries(CODES))for(const outside of ['review','business_rate'])
  TAX_ROWS.push({currency,country,codeName,code,outside});
test('item 1: every combination of currency, business country, job code and outside-zones setting',()=>{
  const table=[];
  for(const row of TAX_ROWS){
    const q=generateQuoteVNext(structuredClone(taxJob(row)));
    const got=q.resultType==='INSTANT_ESTIMATE_READY'?cents(q):'review: '+q.reviewReason;
    table.push(`${row.currency} | ${row.country??'not set'} | ${row.codeName} | outside zones: ${row.outside} | ${got}`);
    assert.equal(got,expectedTax(row),JSON.stringify(row));
    if(String(got).startsWith('review: Jobs outside'))assert.equal(q.ownerDecisionRequired[0].kind,'tax_outside_country');
  }
  assert.equal(table.length,72);
  console.log('TAX TABLE\n'+table.join('\n'));
});

// ---------------------------------------------------------------------------
// Item 2: options follow the base carpet price
// ---------------------------------------------------------------------------
const FIELDS=['laborPerSqft','materialPerSqft'];
const ownCarpet=(s,field)=>{const o=s.tiers?.[0]?.overrides?.[field];return !!o&&typeof o==='object'&&Object.hasOwn(o,'carpet');};
// What an inheriting option's labor reads from the base, per sq ft, independently of the code.
function inheritedLabor(dollars){
  const s=C(dollars),p=E.servicePricing(s),bu=p.carpetPriceUnit===YD?YD:FT,o=s.tiers[0].overrides||{},ou=o.carpetPriceUnit===undefined?bu:o.carpetPriceUnit===YD?YD:FT;
  const raw=p.laborPerSqft?.carpet;if(raw===undefined)return undefined;
  const v=exactCarpetConversion(raw,bu,ou);return v===null?undefined:ou===YD?v/9:v;
}
const rename=s=>{const tiers=E.keepTierCarpetRatesInUnit(s,s.tiers.map(t=>({...t,name:t.name+' renamed'})));return tiers&&{...s,tiers};};
const addRow=s=>{const tiers=E.keepTierCarpetRatesInUnit(s,s.tiers.map(t=>({...t,overrides:{...t.overrides,minimumJob:0}})));return tiers&&{...s,tiers};};
// Base labor raised by $1 per sq ft ($9 per sq yd), entered in the base unit.
const raiseBase=s=>{const v=E.serviceFieldValue(s,'laborPerSqft');return E.editServiceField(s,'laborPerSqft',{...v,carpet:v.carpet+(E.serviceFieldValue(s,'carpetPriceUnit')===YD?9:1)});};
const UNIT_ACTIONS={
  'change the base unit':(s,c)=>E.editCarpetPriceUnit(s,other(c.base)),
  'set the option unit to square feet':s=>E.editTierCarpetPriceUnit(s,0,FT),
  'set the option unit to square yards':s=>E.editTierCarpetPriceUnit(s,0,YD),
  'remove the option unit':s=>E.editTierCarpetPriceUnit(s,0,undefined),
  'rename the option':rename,
  'add another override to the option':addRow
};
test('item 2: the reported case: rename the option, raise the base to $4, and both quote $1,980',()=>{
  // Base $3/$5 per sq ft, option in sq yd. $4 + $5 = 220 x 9 = $1,980 on both.
  const s=startBook({storage:'pricing',base:FT,option:'different',prices:'inherited',inexact:false});
  const after=raiseBase(rename(s));
  assert.deepEqual(after.tiers[0].overrides,{carpetPriceUnit:YD});
  assert.deepEqual(quotes(after),[198000,198000]);
});
test('item 2: no action copies a base carpet price into an option, no unit action changes a quote, and every inheriting option follows a later base price change',()=>{
  let checked=0,refusals=0;
  for(const c of CASES)for(const [name,action] of Object.entries(UNIT_ACTIONS)){
    const start=startBook(c),after=action(start,c);
    if(after===null){
      // Refused only for an exact price that could not stay exact: the base's own or the
      // option's own $28 per sq yd moved to sq ft, or an inherited $28 the option reads today.
      assert.ok(c.inexact,c.name+' '+name+' refused');refusals++;continue;
    }
    for(const field of FIELDS)assert.equal(ownCarpet(after,field),ownCarpet(start,field),`${c.name} ${name}: ${field} copied or dropped`);
    const [baseBefore,optionBefore]=quotes(start),[baseAfter,optionAfter]=quotes(after);
    assert.equal(baseAfter,baseBefore,c.name+' '+name);
    if(optionBefore==='unpriced')assert.ok(optionAfter==='unpriced'||optionAfter===178444,c.name+' '+name);
    else assert.equal(optionAfter,optionBefore,c.name+' '+name);
    // Then the base labor rises by $1 per sq ft: every price the option inherits moves with it.
    const raised=raiseBase(after);
    assert.deepEqual(quotes(raised),expectedQuotes(raised),c.name+' '+name+' then base raised');
    const [baseRaised,optionRaised]=quotes(raised);
    if(baseAfter!=='unpriced'&&baseRaised!=='unpriced')assert.equal(baseRaised,baseAfter+22000,c.name+' '+name);
    if(!ownCarpet(raised,'laborPerSqft')&&optionAfter!=='unpriced'&&optionRaised!=='unpriced')assert.equal(optionRaised,optionAfter+22000,c.name+' '+name+': the option did not follow the base');
    if(ownCarpet(raised,'laborPerSqft'))assert.equal(optionRaised,optionAfter,c.name+' '+name+': an own price moved');
    checked++;
  }
  assert.equal(checked+refusals,CASES.length*Object.keys(UNIT_ACTIONS).length);
  console.log(`ITEM2 actions checked: ${checked}, refused (all $28 cases): ${refusals}`);
});
test('item 2: two-session recovery never drops a base price change for an inheriting option',()=>{
  const ACTIONS={...UNIT_ACTIONS};
  for(const c of CASES)for(const [name,action] of Object.entries(ACTIONS)){
    const start=startBook(c),A=action(start,c),B=raiseBase(start);
    if(!A)continue;
    for(const [local,remote,order] of [[A,B,'A local'],[B,A,'B local']]){
      const first=reconcilePricebook(book(start),book(local),book(remote),{},METADATA);
      const want=combined(start,local,remote);
      if(!first.conflicts.length){
        assert.ok(want,`${c.name} ${name} ${order}`);
        assert.deepEqual(meaning(first.draft.services[0]),want,`${c.name} ${name} ${order}: a base price change was dropped`);
        // An option that inherited labor at the start still inherits it, and reads the
        // merged (raised) base labor in its own unit.
        if(!ownCarpet(start,'laborPerSqft')){
          const merged=first.draft.services[0];
          assert.equal(ownCarpet(merged,'laborPerSqft'),false,`${c.name} ${name} ${order}: a base price was copied into the option`);
          assert.deepEqual(meaning(merged)[1][0],inheritedLabor(merged),`${c.name} ${name} ${order}: the option does not read the merged base`);
        }
        continue;
      }
      for(const pick of ['local','remote']){
        const choices=Object.fromEntries(first.conflicts.map(row=>[row.key,pick]));
        const m=meaning(reconcilePricebook(book(start),book(local),book(remote),choices,METADATA).draft.services[0]);
        assert.ok([meaning(local),meaning(remote),...(want?[want]:[])].some(x=>sameMeaning(x,m)),`${c.name} ${name} ${order} ${pick}`);
      }
    }
  }
});

// ---- The real tier screen ----
const bundles=new Map();
async function render(entry,globals,setup=''){
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  if(!bundles.has(entry))bundles.set(entry,await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-exports',setup(b){
      b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {TierBuilder,PricingContext,OwnerField,EaveProtectionNotice};',loader:'jsx'}));
      b.onResolve({filter:/^\.\/api\.js$/},()=>({path:'synthetic-api',namespace:'synthetic'}));
      b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`export * from ${JSON.stringify(root+'client/src/api.js')};export async function api(path,options){return window.apiMock(path,options);}`,loader:'js',resolveDir:root}));
    }}],
    stdin:{resolveDir:root,loader:'jsx',contents:entry}}));
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  w.eval(Object.entries(globals).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('')+'window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));'+setup);
  w.eval(bundles.get(entry).outputFiles[0].text);
  return w;
}
const until=async(cond,n=500)=>{for(let i=0;i<n&&!cond();i++)await new Promise(r=>setTimeout(r,10));};
const fromWindow=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(r=>setTimeout(r,25));
function setValue(w,element,value){
  const proto=element.tagName==='SELECT'?w.HTMLSelectElement.prototype:w.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(element,value);
  element.dispatchEvent(new w.Event(element.tagName==='SELECT'?'change':'input',{bubbles:true}));
}

test('item 2: renaming an option on the real tier screen copies nothing, and the option follows a later base price change',async t=>{
  const meta=METADATA.find(s=>s.serviceType==='FLOORING_INSTALL');
  const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {TierBuilder,PricingContext} from './client/src/pricebook.jsx';import {offeringTierFields} from './client/src/offeringEditor.jsx';
    function App(){const [service,setService]=useState(window.initial);window.current=service;return <PricingContext.Provider value={service}><TierBuilder tiers={service.tiers} definitions={overrides=>offeringTierFields(window.meta,service,overrides)} onChange={tiers=>{const next={...service,tiers};window.current=next;setService(next);}}/></PricingContext.Provider>;}
    createRoot(document.getElementById('root')).render(<App/>);`;
  for(const c of CASES){
    const start=startBook(c);
    const w=await render(entry,{initial:start,meta});t.after(()=>w.close());
    await until(()=>w.document.querySelector('input[aria-label="Tier 1 name"]'));
    setValue(w,w.document.querySelector('input[aria-label="Tier 1 name"]'),'Renamed');await tick();
    const after=fromWindow(w.current);w.close();
    // The edit is refused only where an option on its own unit reads a $28 per sq yd base price per sq ft.
    if(after.tiers[0].name!=='Renamed'){assert.ok(c.inexact&&c.base===YD&&optionUnitOf(c)===FT&&c.option!=='none',c.name);continue;}
    for(const field of FIELDS)assert.equal(ownCarpet(after,field),ownCarpet(start,field),c.name+' '+field);
    assert.deepEqual(quotes(after),quotes(start),c.name);
    const raised=raiseBase(after);
    assert.deepEqual(quotes(raised),expectedQuotes(raised),c.name);
  }
});

// ---------------------------------------------------------------------------
// Item 3: a choice from one session never goes with a number from the other
// ---------------------------------------------------------------------------
// Every choice-type (select) setting in the price book metadata, both storage forms,
// both save orders, each answer. Session A changes the choice; session B changes a price.
const SELECTS=METADATA.flatMap(meta=>meta.fields.filter(f=>f.type==='select'&&f.options?.length>1).map(f=>({serviceType:meta.serviceType,field:f.field,options:f.options})));
function choiceService({serviceType,field,options},storage){
  const p={[field]:options[0],minimumJob:100};
  const s={id:randomUUID(),serviceType,service:'[SYNTHETIC] '+serviceType,tiers:[]};
  return storage==='root'?{...s,...p}:{...s,pricing:p};
}
const effective=(s,field)=>E.servicePricing(s)[field];
test('item 3: every choice-type setting: sessions ending on different choices get one keep-mine or keep-saved choice for the service',()=>{
  assert.ok(SELECTS.length>=50,String(SELECTS.length));
  for(const sel of SELECTS)for(const storage of ['pricing','root']){
    const start=choiceService(sel,storage),A=E.editServiceField(start,sel.field,sel.options[1]),B=E.editServiceField(start,'minimumJob',250);
    for(const [local,remote,order] of [[A,B,'A local'],[B,A,'B local']]){
      const first=reconcilePricebook(book(start),book(local),book(remote),{},METADATA);
      const label=`${sel.serviceType}.${sel.field} ${storage} ${order}`;
      if(sel.field==='carpetPriceUnit'){
        // The carpet unit keeps its own rule (unit and carpet prices as one value);
        // it does not change what minimumJob means, so the two still merge.
        assert.equal(first.conflicts.length,0,label);
        assert.deepEqual([effective(first.draft.services[0],sel.field),effective(first.draft.services[0],'minimumJob')],[sel.options[1],250],label);
        continue;
      }
      assert.equal(first.conflicts.length,1,label);assert.equal(first.conflicts[0].kind,'service',label);
      for(const pick of ['local','remote']){
        const merged=reconcilePricebook(book(start),book(local),book(remote),{[first.conflicts[0].key]:pick},METADATA).draft.services[0];
        const kept=pick==='local'?local:remote;
        assert.deepEqual([effective(merged,sel.field),effective(merged,'minimumJob')],[effective(kept,sel.field),effective(kept,'minimumJob')],label+' '+pick);
      }
    }
    // Only numbers differ: they still merge, with no choice.
    const n=reconcilePricebook(book(start),book(E.editServiceField(start,'minimumJob',250)),book(E.editServiceField(start,'laborHourlyRate',7)),{},METADATA);
    assert.equal(n.conflicts.length,0);assert.deepEqual([effective(n.draft.services[0],'minimumJob'),effective(n.draft.services[0],'laborHourlyRate')],[250,7]);
    // One session changes only the choice, the other changes nothing in this service: no choice.
    const only=reconcilePricebook(book(start),book(A),book(start),{},METADATA);
    assert.equal(only.conflicts.length,0);assert.equal(effective(only.draft.services[0],sel.field),sel.options[1]);
  }
});
test('item 3: a choice set in a price option counts too',()=>{
  const start={...choiceService({serviceType:'FLOORING_INSTALL',field:'furnitureMovingPriceUnit',options:['flat','per_room']},'pricing'),tiers:[{name:'Good',overrides:{}}]};
  const A=E.editServiceTiers(start,[{name:'Good',overrides:{furnitureMovingPriceUnit:'per_room'}}]),B=E.editServiceField(start,'minimumJob',250);
  const r=reconcilePricebook(book(start),book(A),book(B),{},METADATA);
  assert.equal(r.conflicts.length,1);assert.equal(r.conflicts[0].kind,'service');
});
test('item 3: the reported cases',()=>{
  // Custom: per hour (A) and $2.50 per sq ft (B).
  const custom={id:randomUUID(),serviceType:'CUSTOM',service:'[SYNTHETIC] Custom',tiers:[],pricing:{customPricingMode:'fixed',unit:'per_sqft',price:2}};
  const cA=E.editServiceField(custom,'unit','per_hour'),cB=E.editServiceField(custom,'price',2.5);
  const c1=reconcilePricebook(book(custom),book(cA),book(cB),{},METADATA);
  assert.equal(c1.conflicts.length,1);
  for(const pick of ['local','remote']){const m=reconcilePricebook(book(custom),book(cA),book(cB),{[c1.conflicts[0].key]:pick},METADATA).draft.services[0].pricing;assert.deepEqual([m.unit,m.price],pick==='local'?['per_hour',2]:['per_sqft',2.5]);}
  // Furniture moving: per room at $75 (A) and flat $250 (B). Keeping the saved one gives flat $250.
  const fm={id:randomUUID(),serviceType:'FLOORING_INSTALL',service:'[SYNTHETIC] Floor',tiers:[],pricing:{furnitureMovingPriceUnit:'flat',furnitureMovingPrice:150}};
  const fA=E.editServiceField(E.editServiceField(fm,'furnitureMovingPriceUnit','per_room'),'furnitureMovingPrice',75),fB=E.editServiceField(fm,'furnitureMovingPrice',250);
  const f1=reconcilePricebook(book(fm),book(fA),book(fB),{},METADATA);
  const saved=reconcilePricebook(book(fm),book(fA),book(fB),{[f1.conflicts[0].key]:'remote'},METADATA).draft.services[0].pricing;
  assert.deepEqual([saved.furnitureMovingPriceUnit,saved.furnitureMovingPrice],['flat',250]);
});
const DEFAULTS={markupMode:'markup',markupPercent:20,taxMode:'TAX_ALL',taxPercent:5,currency:'CAD',minimumJobPrice:0};
test('item 3: business defaults: markup mode, tax mode and currency',()=>{
  const s={id:randomUUID(),serviceType:'CUSTOM',service:'[SYNTHETIC] Custom',tiers:[],pricing:{price:1}};
  const other={markupMode:'margin',taxMode:'TAX_MATERIALS',currency:'USD'};
  const number={markupMode:['markupPercent',50],taxMode:['taxPercent',13],currency:['minimumJobPrice',100]};
  for(const field of ['markupMode','taxMode','currency']){
    const A={...DEFAULTS,[field]:other[field]},B={...DEFAULTS,[number[field][0]]:number[field][1]};
    for(const [local,remote,order] of [[A,B,'A local'],[B,A,'B local']]){
      const first=reconcilePricebook(book(s,DEFAULTS),book(s,local),book(s,remote),{},METADATA);
      assert.equal(first.conflicts.length,1,field+' '+order);assert.equal(first.conflicts[0].kind,'defaults');
      for(const pick of ['local','remote'])assert.deepEqual(reconcilePricebook(book(s,DEFAULTS),book(s,local),book(s,remote),{[first.conflicts[0].key]:pick},METADATA).draft.defaults,pick==='local'?local:remote,field+' '+order+' '+pick);
    }
  }
  // Numbers only still merge.
  const n=reconcilePricebook(book(s,DEFAULTS),book(s,{...DEFAULTS,markupPercent:50}),book(s,{...DEFAULTS,taxPercent:13}),{},METADATA);
  assert.equal(n.conflicts.length,0);assert.deepEqual([n.draft.defaults.markupPercent,n.draft.defaults.taxPercent],[50,13]);
});
test('item 3: the patio quotes one session\'s markup intention, never 50% margin',()=>{
  const f=concrete();
  const at=defaults=>cents(ready({...f,businessDefaults:{...f.businessDefaults,...defaults}}));
  const base={...f.businessDefaults,markupMode:'markup',markupPercent:20};
  const A={...base,markupMode:'margin',markupPercent:30},B={...base,markupPercent:50};
  const s={...f.ownerPricing};
  const first=reconcilePricebook(book(s,base),book(s,A),book(s,B),{},METADATA);
  assert.equal(first.conflicts.length,1);
  // Cost x 1.5 (50% markup) or cost / 0.7 (30% margin); 50% margin would be cost / 0.5.
  const intentions=[at(A),at(B)],wrong=at({...base,markupMode:'margin',markupPercent:50});
  for(const pick of ['local','remote']){
    const merged=reconcilePricebook(book(s,base),book(s,A),book(s,B),{[first.conflicts[0].key]:pick},METADATA).draft.defaults;
    const q=at(merged);assert.ok(intentions.includes(q));assert.notEqual(q,wrong);
  }
});

const conflictEntry=`import React,{useMemo,useState} from 'react';import {createRoot} from 'react-dom/client';import {PricebookConflict} from './client/src/pricebookConflict.jsx';import {reconcilePricebook} from './client/src/pricebookConflict.js';
  function App(){const [choices,setChoices]=useState({});const merge=useMemo(()=>reconcilePricebook(window.base,window.local,window.remote,choices,window.metadata),[choices]);window.merge=merge;
    return <PricebookConflict state={{phase:'ready'}} merge={merge} metadata={window.metadata} onChoice={(key,value)=>setChoices(c=>({...c,[key]:value}))} onAccept={()=>{}} onEdit={()=>{}} onRetry={()=>{}} onDiscard={()=>{}}/>;}
  createRoot(document.getElementById('root')).render(<App/>);`;
test('item 3: the real recovery screen shows one choice for the service and one for the business settings',async t=>{
  for(const storage of ['pricing','root']){
    const s=choiceService({serviceType:'CUSTOM',field:'unit',options:['per_sqft','per_hour']},storage);
    const A=E.editServiceField(s,'unit','per_hour'),B=E.editServiceField(s,'minimumJob',250);
    for(const pick of ['local','remote']){
      const w=await render(conflictEntry,{base:book(s,DEFAULTS),local:book(A,{...DEFAULTS,markupMode:'margin'}),remote:book(B,{...DEFAULTS,markupPercent:50}),metadata:METADATA});t.after(()=>w.close());
      await until(()=>w.merge);
      const sets=[...w.document.querySelectorAll('fieldset.conflict-choice')];
      assert.equal(sets.length,2,storage);
      const legends=sets.map(f=>f.querySelector('legend').textContent);
      assert.deepEqual(legends,['[SYNTHETIC] CUSTOM · Every setting of this service: the two versions use different pricing choices','Business settings · Every business setting: the two versions use different pricing choices']);
      for(const f of sets){f.querySelectorAll('input[type=radio]')[pick==='local'?0:1].dispatchEvent(new w.MouseEvent('click',{bubbles:true}));await tick();}
      const merge=fromWindow(w.merge);w.close();
      assert.equal(merge.unresolved.length,0);
      const svc=merge.draft.services[0];
      assert.deepEqual([effective(svc,'unit'),effective(svc,'minimumJob'),merge.draft.defaults.markupMode,merge.draft.defaults.markupPercent],pick==='local'?['per_hour',100,'margin',20]:['per_sqft',250,'markup',50]);
    }
  }
});

// ---------------------------------------------------------------------------
// Item 4: screens
// ---------------------------------------------------------------------------
test('item 4: the custom busy-season notice reads the materials share in either storage form',async t=>{
  const meta=METADATA.find(s=>s.serviceType==='CUSTOM');
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {ServiceRules} from './client/src/quoteDoneControls.jsx';
    createRoot(document.getElementById('root')).render(<ServiceRules service={window.service} meta={window.meta} defaults={window.defaults} categories={[]} feeNames={[]} feeModes={[]} onService={()=>{}} onDefault={()=>{}}/>);`;
  const notice=/This custom service has no materials share/;
  for(const storage of ['pricing','root'])for(const share of [true,false]){
    const p={customPricingMode:'fixed',unit:'flat',price:100,...(share?{installedMaterialsPercent:{price:30}}:{})};
    const service={id:randomUUID(),serviceType:'CUSTOM',service:'[SYNTHETIC] Custom',tiers:[],...(storage==='root'?p:{pricing:p})};
    const w=await render(entry,{service,meta,defaults:DEFAULTS});t.after(()=>w.close());
    await until(()=>w.document.body.textContent.includes('Quote configuration'));
    assert.equal(notice.test(w.document.body.textContent),!share,storage+' '+share);w.close();
  }
});
test('item 4: the approval box lists the fence offerings in either storage form',async t=>{
  const meta=METADATA.find(s=>s.serviceType==='FENCING_REPLACEMENT');
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {SavedApproval} from './client/src/quoteDoneControls.jsx';
    createRoot(document.getElementById('root')).render(<SavedApproval meta={window.meta} ownerId="owner" serviceId={window.book.services[0].id} draft={window.book}/>);`;
  for(const storage of ['pricing','root']){
    const offerings={fenceOfferings:{wood:{tiers:[{name:'Good',overrides:{}},{name:'Better',overrides:{}}]}}};
    const service={id:randomUUID(),serviceType:'FENCING_REPLACEMENT',service:'[SYNTHETIC] Fence',tiers:[],...(storage==='root'?offerings:{pricing:offerings})};
    const b={revision:1,defaults:DEFAULTS,services:[service]};
    const w=await render(entry,{meta,book:b},`window.apiMock=async path=>path==='/api/pricebook/validate'?{statuses:[{serviceId:window.book.services[0].id,legacySettings:[]}]}:window.book;`);t.after(()=>w.close());
    const button=label=>[...w.document.querySelectorAll('button')].find(x=>x.textContent===label);
    await until(()=>button('Review saved configuration'));await tick();
    button('Review saved configuration').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    await until(()=>button('Edit explicit zero classification'));await tick();
    assert.ok(button('Edit explicit zero classification'),storage+': review did not open: '+w.document.body.textContent.slice(0,300));
    button('Edit explicit zero classification').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    await until(()=>/Entire base offering explicitly free/.test(w.document.body.textContent));
    const labels=[...w.document.querySelectorAll('label')].map(l=>l.textContent.trim());
    assert.ok(labels.includes('Entire wood — Good offering explicitly free')&&labels.includes('Entire wood — Better offering explicitly free'),storage+' '+JSON.stringify(labels));w.close();
  }
});
test('item 4: tax location and eave protection follow the business country, not the currency',async t=>{
  const taxEntry=`import React from 'react';import {createRoot} from 'react-dom/client';import {TaxLocationSettings} from './client/src/taxLocationEditor.jsx';
    createRoot(document.getElementById('root')).render(<TaxLocationSettings defaults={window.defaults} businessCountry={window.country} onDefault={()=>{}}/>);`;
  const eaveEntry=`import React from 'react';import {createRoot} from 'react-dom/client';import {EaveProtectionNotice} from './client/src/pricebook.jsx';
    createRoot(document.getElementById('root')).render(<EaveProtectionNotice country={window.country} currency={window.currency}/>);`;
  for(const [country,currency] of [['CA','USD'],['US','CAD'],['CA','CAD'],['US','USD'],[undefined,'USD'],[undefined,'CAD']]){
    const expected=country||(currency==='USD'?'US':'CA');
    const w=await render(taxEntry,{defaults:{...DEFAULTS,currency,taxByJobLocation:true},country:country??null});t.after(()=>w.close());
    await until(()=>w.document.querySelector('[data-testid="tax-location-settings"]'));
    const text=w.document.body.textContent;
    assert.equal(/Quebec rate/.test(text),expected==='CA',country+' '+currency);
    assert.equal(/Jobs outside every zone/.test(text),expected==='US',country+' '+currency);w.close();
    const e=await render(eaveEntry,{country:country??null,currency});t.after(()=>e.close());
    await until(()=>e.document.body.textContent.length>0);
    assert.match(e.document.body.textContent,expected==='CA'?/NBC 9\.26\.5\.1/:/R905\.1\.2/,country+' '+currency);e.close();
  }
});
test('item 4: the cemented low-slope method is offered only under the Canadian code, in either storage form',async t=>{
  const meta=METADATA.find(s=>s.serviceType==='ROOFING_REPLACEMENT'),definition=meta.fields.find(f=>f.field==='lowSlopeAssembly');
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {OwnerField,PricingContext} from './client/src/pricebook.jsx';
    createRoot(document.getElementById('root')).render(<PricingContext.Provider value={window.service}><OwnerField definition={window.definition} value={window.value} onChange={()=>{}}/></PricingContext.Provider>);`;
  for(const storage of ['pricing','root'])for(const code of ['nbc','irc'])for(const value of [undefined,'nbc_low_slope_application']){
    const p={roofBuildingCode:code};
    const service={id:randomUUID(),serviceType:'ROOFING_REPLACEMENT',service:'[SYNTHETIC] Roof',tiers:[],...(storage==='root'?p:{pricing:p})};
    const w=await render(entry,{service,definition,value:value??null});t.after(()=>w.close());
    await until(()=>w.document.querySelector('select'));
    const options=[...w.document.querySelector('select').options].map(o=>o.value).filter(Boolean);
    // A saved cemented choice under the US code stays visible (so it can be changed), but is not offered otherwise.
    const want=code==='nbc'||value?['double_underlayment','self_adhered_underlayment','nbc_low_slope_application']:['double_underlayment','self_adhered_underlayment'];
    assert.deepEqual(options,want,storage+' '+code+' '+value);w.close();
  }
});

// ---------------------------------------------------------------------------
// The frozen inputs added for this round (corpus-additions-20261113b.json)
// ---------------------------------------------------------------------------
test('corpus: frozen inputs for items 1 to 3, as worked by hand',()=>{
  const rows=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261113b.json',import.meta.url),'utf8'));
  const by=Object.fromEntries(rows.map(r=>[r.id,r.input]));
  // Item 1: a USD business (no onboarding country) with a Toronto job, and a CA business
  // with a US ZIP outside its zones on "use my rate": both go to the business.
  assert.equal(review(by['v32:item1-usd-business-toronto-job']).reviewReason,OUTSIDE.US);
  assert.equal(review(by['v32:item1-ca-business-us-zip-business-rate']).reviewReason,OUTSIDE.CA);
  // A USD book whose onboarding country is Canada, Toronto job: Ontario 13% = 2,011.40.
  assert.equal(cents(ready(by['v32:item1-ca-business-usd-book-toronto-job'])),201140);
  // Item 2: base raised to $4 after renaming a square-yard option: $4 + $5 = $1,980.
  assert.deepEqual(ready(by['v32:item2-renamed-yard-option-follows-base']).options.map(o=>o.calculationRecord.scenarios.mid.finalTotalCents),[198000]);
  // Item 3: A changed the custom unit to per hour, B the flat price to $250; keeping the saved
  // version gives flat $250.00, never per hour at $250.
  assert.equal(cents(ready(by['v32:item3-custom-kept-saved'])),25000);
});
