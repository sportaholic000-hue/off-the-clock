// Astra round 2 on d54a6e6d (engine stays v33: no amount or review reason changes): the agreed items of Astra's round-2 reply on d54a6e6d, with the
// reviewer's refinements. Expected amounts and sentences are written before the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {BUILDING_AGE_OWNER_COPY,CANADIAN_LEAD_EXCLUSION} from '../server/quote-engine-vnext/buildingAgeRules.js';
import {PLACEMENT_EXTRA_NOTE} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
import {editServiceField} from '../client/src/pricebookEditing.js';
import {surchargeLaborNotice,installedPricesWithoutLaborPortion} from '../client/src/surchargeLaborNotice.js';
import {installedPriceDefinitions} from '../server/installedPriceConfiguration.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {concreteFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {webQuote,publicCopy} from './quoteDeliveryBatch20261015Fixture.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';

const METADATA=bridge.applicationMetadata().services;
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function rootForm(service){const s=structuredClone(service);if(record(s.pricing)){Object.assign(s,s.pricing);delete s.pricing;}return s;}
const inForm=(service,form)=>form==='root'?rootForm(service):structuredClone(service);
const RECEIPTS=['confirmedFields','approvedValues','startingValueState','dependentLineState'];
const engineService=(raw,defaults={})=>({...bridge.approvalContent(raw,{defaults,services:[raw]}).service,...Object.fromEntries(RECEIPTS.filter(k=>Object.hasOwn(raw,k)).map(k=>[k,structuredClone(raw[k])])),active:true});
const cents=q=>q.options?.[0]?.calculationRecord.scenarios.mid.finalTotalCents;

// ---------------------------------------------------------------------------
// Step 1: lead-paint policy visible and correctly described in every painting mode
// ---------------------------------------------------------------------------
const bundles=new Map();
async function render(entry,globals){
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  if(!bundles.has(entry))bundles.set(entry,await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'test-exports',setup(b){
      b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async args=>({contents:(await readFile(args.path,'utf8'))+'\nexport {OwnerField,PricingContext};',loader:'jsx'}));
      b.onResolve({filter:/^\.\/api\.js$/},()=>({path:'synthetic-api',namespace:'synthetic'}));
      b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`export * from ${JSON.stringify(root+'client/src/api.js')};export async function api(){return {};}`,loader:'js',resolveDir:root}));
    }}],
    stdin:{resolveDir:root,loader:'jsx',contents:entry}}));
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;
  w.eval(Object.entries(globals).map(([k,v])=>`window.${k}=${JSON.stringify(v)};`).join('')+'window.structuredClone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));');
  w.eval(bundles.get(entry).outputFiles[0].text);
  return w;
}
const until=async(cond,n=300)=>{for(let i=0;i<n&&!cond();i++)await new Promise(r=>setTimeout(r,10));};
// Ordinary interior setup (no offering mode), and both offering modes of both painting services.
function paintingSetups(){
  const out=[];
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING'])for(const mode of ['installed','itemized'])out.push({name:`${type} ${mode} offering`,type,service:offeringFixture(type,mode).ownerPricing});
  const ordinary=structuredClone(offeringFixture('INTERIOR_PAINTING','installed').ownerPricing);delete ordinary.pricing.offeringMode;delete ordinary.pricing.offeringDetails;delete ordinary.pricing.offeringRates;
  out.push({name:'INTERIOR_PAINTING ordinary setup',type:'INTERIOR_PAINTING',service:ordinary});
  return out;
}
test('step 1: the editor shows the lead-paint policy with its label and help in every painting setup, both storage forms',async t=>{
  const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {editorServiceFields,OwnerField,PricingContext} from './client/src/pricebook.jsx';
    const field=editorServiceFields(window.meta,window.service).find(f=>f.field==='leadSafePainting');window.found=!!field;
    createRoot(document.getElementById('root')).render(field?<PricingContext.Provider value={window.service}><OwnerField definition={field} value={window.value} onChange={()=>{}}/></PricingContext.Provider>:<p>none</p>);`;
  const rows=[];
  for(const setup of paintingSetups())for(const form of ['pricing','root']){
    const service=inForm({...setup.service,pricing:{...setup.service.pricing,leadSafePainting:'review_before_1978'}},form);
    const meta=METADATA.find(s=>s.serviceType===setup.type);
    const w=await render(entry,{meta,service,value:'review_before_1978'});t.after(()=>w.close());
    await until(()=>w.document.getElementById('root').textContent.length>0);
    const text=w.document.getElementById('root').textContent;
    rows.push(`${setup.name} ${form}: ${w.found?'shown':'hidden'}`);
    assert.equal(w.found,true,setup.name+' '+form);
    assert.match(text,new RegExp(BUILDING_AGE_OWNER_COPY.leadSafePainting.label),setup.name);
    assert.match(text,/Health Canada says homes built before 1960 probably have lead paint/,setup.name);
    assert.doesNotMatch(text,/review only|legacy scalar/,setup.name);
    w.close();
  }
  console.log('v34 editor lead-paint control:\n'+rows.join('\n'));
});
test('step 1: switching the pricing method keeps the saved lead-paint policy and its control',async()=>{
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING'])for(const form of ['pricing','root']){
    let service=inForm({...offeringFixture(type,'installed').ownerPricing},form);
    service=editServiceField(service,'leadSafePainting','review_before_1978');
    for(const mode of ['itemized','installed',undefined]){
      service=editServiceField(service,'offeringMode',mode);
      const p=form==='root'&&!record(service.pricing)?service:{...service,...service.pricing};
      assert.equal(p.leadSafePainting,'review_before_1978',`${type} ${form} after ${mode}`);
    }
  }
});
test('step 1: owner metadata: exterior lead policy has its real label and help; no field says "legacy scalar"',()=>{
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING']){
    const field=METADATA.find(s=>s.serviceType===type).fields.find(f=>f.field==='leadSafePainting');
    assert.equal(field.label,BUILDING_AGE_OWNER_COPY.leadSafePainting.label,type);
    assert.equal(field.help,BUILDING_AGE_OWNER_COPY.leadSafePainting.help,type);
    assert.notEqual(field.reviewOnly,true,type);
  }
  const leaks=METADATA.flatMap(s=>(s.fields||[]).filter(f=>/legacy scalar/i.test(f.help||'')||/legacy scalar/i.test(f.label||'')).map(f=>s.serviceType+'.'+f.field));
  assert.deepEqual(leaks,[]);
  // The four review-only prices keep their review explanation in plain words.
  for(const [type,name] of [['SIDING_REPLACEMENT','disposalPerSqft'],['SIDING_REPLACEMENT','trimPerLinearFoot'],['CONCRETE_DRIVEWAY','disposalPerSqft'],['CONCRETE_PATIO_SLAB','disposalPerSqft']]){
    const f=METADATA.find(s=>s.serviceType===type).fields.find(x=>x.field===name);
    assert.ok(f,type+' '+name);assert.match(f.help,/this one price does not describe the work on its own\. Configure the work under Additional priced scope/,type+' '+name);
  }
});
// The saved policy changes customer outcomes in these setups (Canadian home built 1978 to 1990).
test('step 1: the policy shown in the editor is the one quotes use, in every painting setup and both forms',()=>{
  const rows=[];
  for(const setup of paintingSetups().filter(s=>s.name.includes('offering')))for(const form of ['pricing','root']){
    const f=setup.type==='INTERIOR_PAINTING'?offeringFixture(setup.type,setup.name.includes('itemized')?'itemized':'installed'):offeringFixture(setup.type,setup.name.includes('itemized')?'itemized':'installed');
    const job=policy=>{const g=structuredClone(f);if(policy)g.ownerPricing.pricing.leadSafePainting=policy;else delete g.ownerPricing.pricing.leadSafePainting;
      Object.assign(g.customerInputs,{buildingAge:'1978_to_1989',postalCode:'M5V 2T6'});Object.assign(g.businessDefaults,{currency:'CAD'});
      return generateQuoteVNext({...g,ownerPricing:engineService(inForm(g.ownerPricing,form),g.businessDefaults)});};
    const blank=job(undefined),early=job('review_before_1978'),late=job('review_before_1990'),included=job('included');
    rows.push(`${setup.name} ${form}: blank ${blank.resultType}, 1978 ${cents(early)}, 1990 ${late.resultType}, included ${cents(included)}`);
    assert.equal(blank.resultType,'ESTIMATE_REQUIRES_REVIEW',setup.name);assert.equal(late.resultType,'ESTIMATE_REQUIRES_REVIEW',setup.name);
    assert.equal(early.resultType,'INSTANT_ESTIMATE_READY',setup.name+' '+early.reviewReason);assert.equal(cents(early),cents(included),setup.name);
  }
  console.log('v34 painting outcomes:\n'+rows.join('\n'));
});

// ---------------------------------------------------------------------------
// Step 5: Canadian 1978-1990 disclosure under an explicit 1978 choice
// ---------------------------------------------------------------------------
function painting(type,mode,{policy='review_before_1978',age='1978_to_1989',code='M5V 2T6',currency='CAD',country}={},form='pricing'){
  const f=offeringFixture(type,mode);
  if(policy)f.ownerPricing.pricing.leadSafePainting=policy;else delete f.ownerPricing.pricing.leadSafePainting;
  Object.assign(f.customerInputs,{buildingAge:age});if(code)f.customerInputs.postalCode=code;else delete f.customerInputs.postalCode;
  f.businessDefaults.currency=currency;if(country)f.businessDefaults.businessCountry=country;
  return {...f,ownerPricing:engineService(inForm(f.ownerPricing,form),f.businessDefaults)};
}
const disclosed=q=>(q.disclaimer||'').includes(CANADIAN_LEAD_EXCLUSION);
test('step 5: the lead-paint exclusion is stated exactly for Canada, an explicit 1978 choice and a home built 1978 to 1990',()=>{
  let checks=0;
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING'])for(const mode of ['installed','itemized'])for(const form of ['pricing','root'])
  for(const policy of ['review_before_1978','review_before_1990','included',null])for(const age of ['before_1978','1978_to_1989','1990_or_later','not_sure'])
  for(const [code,country] of [['M5V 2T6',undefined],['10001',undefined],[null,'CA'],[null,'US']]){
    const q=generateQuoteVNext(painting(type,mode,{policy,age,code,currency:country==='US'?'USD':'CAD',country},form));checks++;
    const canada=code?/^[A-Z]/.test(code):country==='CA';
    const want=policy==='review_before_1978'&&age==='1978_to_1989'&&canada;
    const tag=`${type} ${mode} ${form} ${policy} ${age} ${code||country}`;
    assert.equal(disclosed(q),want,tag+' '+q.resultType+' '+q.reviewReason);
    if(want){assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',tag);assert.ok(sanitizeForCustomerVNext(q).disclaimer.includes(CANADIAN_LEAD_EXCLUSION),tag);}
  }
  console.log(`v34 Canadian lead disclosure: ${checks} painting quotes`);
});
test('step 5: the lead-paint exclusion reaches the written quote and the saved public copy',()=>{
  const f=offeringFixture('EXTERIOR_PAINTING','installed');f.ownerPricing.pricing.leadSafePainting='review_before_1978';Object.assign(f.customerInputs,{buildingAge:'1978_to_1989',postalCode:'M5V 2T6'});
  const w=webQuote(f);
  assert.equal(w.result.resultType,'INSTANT_ESTIMATE_READY',w.result.reviewReason);
  assert.ok(JSON.stringify(w.result).includes(CANADIAN_LEAD_EXCLUSION));
  w.email.enqueueSavedQuote({ownerId:w.owner,quoteId:w.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
  assert.ok(publicCopy(w.email,w.rows()[0]).copy.narration.includes(CANADIAN_LEAD_EXCLUSION));
});

// ---------------------------------------------------------------------------
// Step 5: unknown chute access
// ---------------------------------------------------------------------------
test('step 5: unknown chute access is said to the customer and recorded as an assumption; yes and no are unchanged',()=>{
  // Same 100 sq ft patio, 1,870.00, in every case: the sentence prices nothing.
  for(const access of ['unknown',undefined,'yes']){
    const f=concreteFixture();if(access===undefined)delete f.customerInputs.chuteAccess;else f.customerInputs.chuteAccess=access;
    const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',access+' '+q.reviewReason);assert.equal(q.midEstimate,1870);
    const assumptions=q.options[0].calculationRecord.assumptions;
    if(access==='yes'){assert.ok(!q.disclaimer.includes(PLACEMENT_EXTRA_NOTE));assert.deepEqual(assumptions,[]);}
    else{assert.ok(sanitizeForCustomerVNext(q).disclaimer.includes(PLACEMENT_EXTRA_NOTE),String(access));assert.deepEqual(assumptions.map(a=>[a.name,a.statement]),[['chutePlacement',PLACEMENT_EXTRA_NOTE]]);
      assert.notEqual(q.resultType,'PARTIAL_ESTIMATE_READY');assert.ok(!(q.options[0].calculationRecord.exclusions||[]).some(x=>JSON.stringify(x).includes('chute')));}
  }
  // A confirmed no-access answer with no placement priced still goes to review.
  const no=concreteFixture();no.customerInputs.chuteAccess='no';assert.equal(generateQuoteVNext(no).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

// ---------------------------------------------------------------------------
// Step 5: busy-season warning for installed prices with no labor portion
// ---------------------------------------------------------------------------
test('step 5: the busy-season warning lists installed prices with no labor portion, after inheritance; an entered 0 is not listed',()=>{
  const f=offeringFixture('EXTERIOR_PAINTING','installed'),service=structuredClone(f.ownerPricing);
  delete service.pricing.installedLaborPercent;delete service.peakMonths;delete service.peakSurchargePercent;
  const prices=installedPricesWithoutLaborPortion(service);
  assert.ok(prices.length>0,'the installed wall price has no labor portion');
  const defaults={peakSurchargePercent:20,peakMonths:[6,7]};
  assert.deepEqual(surchargeLaborNotice(service,defaults),{percent:20,prices});
  // No surcharge, no months, or a 0 surcharge: no warning.
  for(const d of [{},{peakSurchargePercent:20,peakMonths:[]},{peakSurchargePercent:0,peakMonths:[6]}])assert.equal(surchargeLaborNotice(service,d),null,JSON.stringify(d));
  // The service's own settings win over the business's.
  assert.equal(surchargeLaborNotice({...service,peakSurchargePercent:0},defaults),null);
  // An entered labor portion of 0 is the owner's answer: not listed.
  const zero=structuredClone(service);
  zero.pricing.installedLaborPercent=Object.fromEntries(Object.keys(installedPriceDefinitions(service.serviceType,service.pricing)).map(path=>[path,0]));
  assert.deepEqual(installedPricesWithoutLaborPortion(zero),[]);
  // A price option inherits the base labor portions; one that inherits none is listed by its name.
  assert.deepEqual(installedPricesWithoutLaborPortion({...zero,tiers:[{name:'Premium',overrides:{}}]}),[]);
  assert.ok(installedPricesWithoutLaborPortion({...service,tiers:[{name:'Premium',overrides:{}}]}).some(p=>p.endsWith('(Premium)')));
  // Custom services keep their own existing notice.
  assert.equal(surchargeLaborNotice({serviceType:'CUSTOM',pricing:{}},defaults),null);
});

// ---------------------------------------------------------------------------
// Step 5: planting label
// ---------------------------------------------------------------------------
test('step 5: planting asks for "Mulch to install" in cubic yards; amounts unchanged',()=>{
  const field=METADATA.find(s=>s.serviceType==='LANDSCAPING_PLANTING').customerFields.find(f=>f.name==='mulchYards'||f.field==='mulchYards');
  assert.equal(field.label,'Mulch to install');assert.equal(field.unit,'cubic yards');
});
