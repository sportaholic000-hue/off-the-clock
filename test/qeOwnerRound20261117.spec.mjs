// November 17, 2026: fourteen decided items on 02dde9d2. Engine stays v33: no
// amount, result type or review reason changes. Expected values are written
// before the run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';
import {ROOF_REMOVAL_EXCLUSION,CANADIAN_LEAD_EXCLUSION,BUILDING_AGE_OWNER_COPY} from '../server/quote-engine-vnext/buildingAgeRules.js';
import {FIELD_COPY} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
import {resolveJurisdiction} from '../server/taxJurisdiction.js';
import {ownerMoneyEntries} from '../server/priceBookMoney.js';
import {answerDefinitionIssuesVNext,answerDefinitionFieldsVNext,ANSWER_DEFINITION_STARTING_TEXT} from '../server/quote-engine-vnext/answerDefinitions.js';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
import {productKeyFromName,registeredProductKey,productNameFromKey,keyLabel} from '../server/productNames.js';
import {humanPricingKey} from '../server/priceBookLabels.js';
import {surfaceOwnerDiagnostics} from '../server/quote-engine-vnext/surfacePricing.js';
import {wholeRequestIssues} from '../server/src/quoteRequestScope.js';
import {laborPortionReviewRows} from '../client/src/surchargeLaborNotice.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {concreteFixture} from './quoteConcreteLandscape20261016Fixture.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {webQuote,publicCopy,quoteEmailFixture,publish} from './quoteDeliveryBatch20261015Fixture.mjs';
import {corpusInputs} from '../verification/engine-fingerprint/fingerprint.mjs';
import {custom,flooring,fixture} from '../verification/engine-independent/fixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';

const METADATA=bridge.applicationMetadata().services;
const meta=type=>METADATA.find(s=>s.serviceType===type);
const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const cents=q=>q.options?.[0]?.calculationRecord.scenarios.mid.finalTotalCents;
const corpus=id=>structuredClone(corpusInputs().find(r=>r.id===id).input);
function rootForm(service){const s=structuredClone(service);if(record(s.pricing)){Object.assign(s,s.pricing);delete s.pricing;}return s;}
// Every customer channel: web result (what the widget shows), saved public copy (written quote and email link) and the phone narration.
async function channels(t,f){
  const w=webQuote(structuredClone(f));
  const web=JSON.stringify(w.result);
  let saved=null;
  if(['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(w.result.resultType)){w.email.enqueueSavedQuote({ownerId:w.owner,quoteId:w.row.recordId,email:'caller@example.invalid',customerConfirmed:true});saved=JSON.stringify(publicCopy(w.email,w.rows()[0]).copy);}
  const h=quoteEmailFixture(t);publish(h.c.ownerId,structuredClone(f));
  const match=await h.tool('matchService',{query:f.ownerPricing.service});
  // On a call, product identity is the caller's confirmation, not a saved fact.
  const {confirmedFacts,...voiceInputs}=f.customerInputs;
  const voice=match.status==='matched'?await h.tool('getQuote',{serviceHandle:match.serviceHandle,customerInputs:voiceInputs,customerConfirmed:true,callerMeasurementsEstimated:true,productConfirmations:Object.fromEntries(Object.keys(confirmedFacts||{}).map(k=>[k,true])),additionalWork:[]}):match;
  return {web,saved,voice:JSON.stringify(voice),result:w.result,voiceResult:voice};
}

// ---------------------------------------------------------------------------
// 1. Labor share warning
// ---------------------------------------------------------------------------
const CONDITIONS={FENCING_INSTALL:['terrainSlope',['flat','moderate','steep']],FENCING_REPLACEMENT:['terrainSlope',['flat','moderate','steep']],INTERIOR_PAINTING:['wallHeight',['standard','high','vaulted']],EXTERIOR_PAINTING:['stories',[1,2,3]]};
test('1: the labor share warning lists exactly the answers that go to review, for every service it applies to, both forms, base and options',()=>{
  const rows=[];
  for(const [type,[field,values]] of Object.entries(CONDITIONS))for(const mode of ['installed','itemized'])for(const form of ['pricing','root'])for(const options of [false,true]){
    const f=offeringFixture(type,mode);delete f.ownerPricing.pricing.installedLaborPercent;
    if(options)f.ownerPricing.tiers=[{name:'Good',overrides:{}},{name:'Best',overrides:{}}];
    const service=form==='root'?rootForm(f.ownerPricing):f.ownerPricing;
    const warned=laborPortionReviewRows(service,meta(type));
    // Independent check: quote each answer; the warning lists an answer exactly when that job goes to review for the labor portion.
    const reviewed=values.filter(value=>{const g=structuredClone(f);g.customerInputs[field]=value;const q=generateQuoteVNext(g);return q.resultType!=='INSTANT_ESTIMATE_READY'&&JSON.stringify(q).includes('installedLaborPercent');});
    const listed=new Set(warned.flatMap(row=>values.filter(value=>new RegExp(`(?:: [^:]*?|, )${String(humanPricingKey(String(value))).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}(?:,|$)`).test(row)).map(String)));
    rows.push(`${type} ${mode} ${form}${options?' options':''}: warned ${[...listed].join('/')||'none'}; review ${reviewed.join('/')||'none'}`);
    assert.deepEqual([...listed].sort(),reviewed.map(String).sort(),`${type} ${mode} ${form} ${options}: ${JSON.stringify(warned)}`);
    if(options)assert.ok(warned.every(row=>/\((Good|Best)\):/.test(row)),JSON.stringify(warned));
    // The service stays live: the warning does not block.
    assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'QUOTING LIVE',type);
    // An entered 0 is an answer: no warning.
    const zero=structuredClone(service);const p=form==='root'?zero:zero.pricing;
    p.installedLaborPercent=Object.fromEntries(Object.keys(f.ownerPricing.pricing.installedMaterialsPercent||{}).map(k=>[k,0]));
    assert.deepEqual(laborPortionReviewRows(zero,meta(type)),[],type+' entered 0');
  }
  console.log('labor share warning:\n'+rows.join('\n'));
  // Fixtures use the starting labor adjustments; the reported cases are warned.
  const fence=offeringFixture('FENCING_INSTALL','installed');delete fence.ownerPricing.pricing.installedLaborPercent;
  assert.match(laborPortionReviewRows(fence.ownerPricing,meta('FENCING_INSTALL')).join(' '),/Terrain slope Moderate, Steep/);
  // An answer whose adjustment is 1 is not listed.
  fence.ownerPricing.pricing.terrainLaborMultiplier={...fence.ownerPricing.pricing.terrainLaborMultiplier,moderate:1};
  assert.match(laborPortionReviewRows(fence.ownerPricing,meta('FENCING_INSTALL')).join(' '),/Terrain slope Steep$/);
});
test('1: the warning is shown in Quote configuration next to the busy-season warning',async t=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const out=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'api',setup(b){b.onResolve({filter:/^\.\/api\.js$/},()=>({path:'synthetic-api',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`export * from ${JSON.stringify(root+'client/src/api.js')};export async function api(){return {};}`,loader:'js',resolveDir:root}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ServiceRules} from './client/src/quoteDoneControls.jsx';
      createRoot(document.getElementById('root')).render(<ServiceRules service={window.service} meta={window.meta} defaults={window.defaults} categories={[]} feeNames={[]} feeModes={[]} onService={()=>{}} onDefault={()=>{}}/>);`}});
  for(const type of Object.keys(CONDITIONS)){
    const f=offeringFixture(type,'installed');delete f.ownerPricing.pricing.installedLaborPercent;
    const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
    dom.window.eval(`window.service=${JSON.stringify(f.ownerPricing)};window.meta=${JSON.stringify(meta(type))};window.defaults=${JSON.stringify({...f.businessDefaults,currency:'CAD'})};window.structuredClone=x=>JSON.parse(JSON.stringify(x));`);
    dom.window.eval(out.outputFiles[0].text);
    for(let i=0;i<200&&!dom.window.document.body.textContent.includes('Until you enter');i++)await new Promise(r=>setTimeout(r,10));
    const text=dom.window.document.body.textContent;
    assert.match(text,/Until you enter the labor portion of these installed prices, jobs with the answers listed go to you for review:/,type);
    assert.ok(text.indexOf('Until you enter')>text.indexOf('Optional busy-season labor surcharge'),type);
  }
});

// ---------------------------------------------------------------------------
// 2. Concrete priced scope shows the owner's specification
// ---------------------------------------------------------------------------
test('2: concrete priced scope shows the spec charged, with the contract labels, for every option, both forms and both concrete services',()=>{
  let checks=0;
  const thicknessLabel=customerContractForVNext('CONCRETE_PATIO_SLAB',{}).fields.thickness.label;
  for(const type of ['CONCRETE_PATIO_SLAB','CONCRETE_DRIVEWAY'])for(const form of ['pricing','root'])
  for(const thickness of [undefined,4,6])for(const reinforcement of [undefined,'none','wire_mesh','rebar'])for(const base of [undefined,'included','not_included']){
    const f=concreteFixture();f.serviceType=type;f.ownerPricing.serviceType=type;
    Object.assign(f.ownerPricing.pricing,{wireReinforcementPerSqft:50,rebarReinforcementPerSqft:90,wireMeshDescription:'[SYNTHETIC] mesh',rebarDescription:'[SYNTHETIC] rebar',baseDepthInches:4,baseCompactionAllowance:0.2,baseGravelPerCubicYard:4500,baseExcavationGradingPerSqft:120});
    if(thickness)f.ownerPricing.pricing.defaultSlabThicknessInches=thickness;
    if(reinforcement)f.ownerPricing.pricing.defaultReinforcement=reinforcement;
    if(base)f.ownerPricing.pricing.newSlabBase=base;
    // The customer submits different answers; the owner's are charged.
    Object.assign(f.customerInputs,{thickness:5,reinforcement:'wire_mesh',baseNeeded:false});
    if(form==='root')f.ownerPricing=rootForm(f.ownerPricing);
    const def=bridge.applicationServiceDefinition(f.ownerPricing);
    const summary=bridge.applicationServiceDefinition&&def;
    const facts=bridgeFacts(f,def);checks++;
    const fact=label=>facts.find(x=>x.label===label)?.value;
    assert.equal(fact(thicknessLabel),thickness?thickness+' inches':'5 inches',`${type} ${form} thickness`);
    assert.equal(fact('Reinforcement'),reinforcement?{none:'None',wire_mesh:'Wire mesh',rebar:'Rebar'}[reinforcement]:'Wire mesh',`${type} ${form} reinforcement`);
    assert.equal(fact('Base preparation requested'),base?(base==='included'?'Yes':'No'):'No',`${type} ${form} base`);
    // No raw keys anywhere in the priced scope.
    for(const x of facts)assert.ok(!/^[a-z]+[A-Z]|^[a-z]+$/.test(x.label)||/^[A-Z]/.test(x.label),`raw label ${x.label}`);
    assert.ok(!facts.some(x=>['thickness','reinforcement','baseNeeded'].includes(x.label)));
  }
  console.log(`concrete priced scope: ${checks} combinations`);
});
import {customerJobSummary} from '../server/src/quoteIntake.js';
function bridgeFacts(f,def){return customerJobSummary(f.ownerPricing,def,{customerInputs:f.customerInputs},'r').facts;}
test('2: through the real quote path the priced scope, saved copy and phone narration show 4 inches, not the submitted 6',async t=>{
  const f=concreteFixture();Object.assign(f.ownerPricing.pricing,{defaultSlabThicknessInches:4,defaultReinforcement:'none',newSlabBase:'not_included'});f.customerInputs.thickness=6;
  const c=await channels(t,f);
  assert.equal(c.result.resultType,'INSTANT_ESTIMATE_READY');
  const facts=c.result.pricedScope.facts;
  assert.deepEqual(facts.find(x=>x.label==='Concrete thickness'),{label:'Concrete thickness',value:'4 inches'});
  assert.ok(!facts.some(x=>x.value==='6'||x.value==='6 inches'||x.label==='thickness'));
  assert.ok(c.saved.includes('4 inches')&&!/"thickness"/.test(c.saved));
});

// ---------------------------------------------------------------------------
// 3. Busy-season sentence only when the off-season price is lower
// ---------------------------------------------------------------------------
const BUSY=/Priced at the busy-season rate because no work month was given/;
function busyJob(price,minimum){const f=custom();Object.assign(f.ownerPricing.pricing,{price,minimumJob:minimum});f.ownerPricing.peakMonths=[6,7];f.ownerPricing.peakSurchargePercent=20;f.businessDefaults.currency='CAD';return f;}
test('3: the busy-season sentence appears only when the off-season total is lower',async t=>{
  // $100 job, 20% busy-season labor charge = $120, under a $500 minimum: $500 in every month. No sentence.
  const flat=generateQuoteVNext(busyJob(10000,50000));assert.equal(cents(flat),50000);assert.doesNotMatch(flat.disclaimer,BUSY);
  // $1,000 job: $1,200 busy, $1,000 off-season. Sentence.
  const lower=generateQuoteVNext(busyJob(100000,0));assert.equal(cents(lower),120000);assert.match(lower.disclaimer,BUSY);
  // $450 job: busy $540 over a $500 minimum, off-season $500. Still lower off-season: sentence.
  const edge=generateQuoteVNext(busyJob(45000,50000));assert.equal(cents(edge),54000);assert.match(edge.disclaimer,BUSY);
  // A chosen month never gets the sentence.
  const chosen=busyJob(100000,0);chosen.customerInputs.workMonth='june';assert.doesNotMatch(generateQuoteVNext(chosen).disclaimer,BUSY);
  // Every channel agrees for the no-sentence and the sentence case.
  for(const [f,want] of [[busyJob(10000,50000),false],[busyJob(100000,0),true]]){
    const c=await channels(t,f);for(const [name,text] of [['web',c.web],['saved',c.saved],['voice',c.voice]])assert.equal(BUSY.test(text),want,name);
  }
});

// ---------------------------------------------------------------------------
// 4. Removal sentences
// ---------------------------------------------------------------------------
const SIDING_REMOVAL='Removal does not include testing for or removing asbestos or lead paint. Older siding can contain them; if found, that work is priced separately.';
const FLOORING_REMOVAL='Removal does not include testing for or removing asbestos or lead paint. Older flooring can contain them; if found, that work is priced separately.';
function removalJob(type,policy,age,removal=true){
  let f;
  if(type==='SIDING_REPLACEMENT'){f=structuredClone(measuredScopeCases().find(c=>c.id==='siding-removal-itemized').input);f.customerInputs.oldSidingRemoval=removal;}
  else{f=flooring('tile',200);f.ownerPricing.pricing.removalPerSqft={vinyl:100};f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:'vinyl',removalNeeded:removal,...(removal?{removalAreaSqft:250}:{})});}
  if(policy)f.ownerPricing.pricing.olderMaterialRemoval=policy;else delete f.ownerPricing.pricing.olderMaterialRemoval;
  if(age)f.customerInputs.buildingAge=age;else delete f.customerInputs.buildingAge;
  return f;
}
test('4: the removal sentence for every policy, age and removal choice, siding and flooring',()=>{
  const rows=[];
  for(const type of ['SIDING_REPLACEMENT','FLOORING_INSTALL'])for(const policy of [undefined,'review_before_1990','exclude'])for(const age of [undefined,'before_1978','1978_to_1989','1990_or_later','not_sure'])for(const removal of [true,false]){
    const q=generateQuoteVNext(removalJob(type,policy,age,removal)),sentence=type==='SIDING_REPLACEMENT'?SIDING_REMOVAL:FLOORING_REMOVAL;
    const ready=q.resultType==='INSTANT_ESTIMATE_READY';
    const want=removal&&ready&&(policy==='exclude'||age==='1990_or_later');
    rows.push(`${type} ${policy||'blank'} ${age||'-'} removal=${removal}: ${ready?'quoted':'review'}${(q.disclaimer||'').includes(sentence)?' + sentence':''}`);
    assert.equal((q.disclaimer||'').includes(sentence),want,rows.at(-1));
  }
  console.log('removal sentences:\n'+rows.join('\n'));
});
test('4: roof and flat-roof replacement quotes with tear-off state the roofing exclusion; no question, no review',()=>{
  for(const id of ['v29:priced-roofing-earlier-rules','case:flat-roof-residential-control','v31:item6-nbc-cemented-application-chosen']){
    const f=corpus(id),q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',id);
    assert.ok(q.disclaimer.includes(ROOF_REMOVAL_EXCLUSION),id);
    assert.ok(!q.options[0].lineItems.some(l=>l.name.includes('test')),id);
    assert.ok(!JSON.stringify(customerContractForVNext(f.serviceType,f.ownerPricing.pricing,f.ownerPricing).fields).includes('asbestos'),id);
  }
  // Without tear-off (roof repair, siding) the roofing sentence is never added.
  for(const id of ['geometry:repair-area-0102','v29:priced-siding'])assert.ok(!(generateQuoteVNext(corpus(id)).disclaimer||'').includes(ROOF_REMOVAL_EXCLUSION),id);
});
test('4: the removal sentences reach the widget result, saved copy and phone narration',async t=>{
  const roof=corpus('case:flat-roof-residential-control');
  const flooringJob=removalJob('FLOORING_INSTALL',undefined,'1990_or_later');
  for(const [f,sentence] of [[roof,ROOF_REMOVAL_EXCLUSION],[flooringJob,FLOORING_REMOVAL]]){
    const c=await channels(t,f);
    assert.ok(['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(c.result.resultType),c.result.reviewReason);
    for(const [name,text] of [['web',c.web],['saved',c.saved],['voice',c.voice]])assert.ok(text?.includes(sentence),name+' '+c.result.resultType+' '+sentence.slice(-40)+' '+String(text).slice(0,300));
  }
});
test('4: owner help and comment carry the new WorkSafeBC sentence',async()=>{
  const sentence="WorkSafeBC requires a qualified person to inspect for hazardous materials before renovation or demolition, whatever the building's age; asbestos has been found in buildings built as recently as 2018.";
  assert.ok(BUILDING_AGE_OWNER_COPY.olderMaterialRemoval.help.includes(sentence));
  assert.ok(!BUILDING_AGE_OWNER_COPY.olderMaterialRemoval.help.includes('before renovating a building built before 1990'));
  const source=await readFile(new URL('../server/quote-engine-vnext/buildingAgeRules.js',import.meta.url),'utf8');
  assert.match(source,/a qualified person to inspect for hazardous materials before renovation or\n\/\/ demolition, whatever the building's age; asbestos has been found in\n\/\/ buildings built as recently as 2018\./);
  assert.doesNotMatch(source,/hazardous-materials survey/);
});

// ---------------------------------------------------------------------------
// 5. Canadian lead exclusion recorded as an assumption
// ---------------------------------------------------------------------------
test('5: the Canadian lead exclusion is recorded in assumptions exactly when it is disclosed',()=>{
  for(const type of ['INTERIOR_PAINTING','EXTERIOR_PAINTING'])for(const policy of ['review_before_1978','review_before_1990','included'])for(const age of ['1978_to_1989','1990_or_later'])for(const code of ['M5V 2T6','10001']){
    const f=offeringFixture(type,'installed');f.ownerPricing.pricing.leadSafePainting=policy;Object.assign(f.customerInputs,{buildingAge:age,postalCode:code});f.businessDefaults.currency='CAD';
    const q=generateQuoteVNext(f),disclosed=(q.disclaimer||'').includes(CANADIAN_LEAD_EXCLUSION);
    const recorded=(q.options||[]).some(o=>o.calculationRecord.assumptions.some(a=>a.name==='canadianLeadPaintExcluded'&&a.statement===CANADIAN_LEAD_EXCLUSION));
    assert.equal(recorded,disclosed,`${type} ${policy} ${age} ${code}`);
    assert.equal(disclosed,policy==='review_before_1978'&&age==='1978_to_1989'&&code==='M5V 2T6');
  }
});

// ---------------------------------------------------------------------------
// 6-10. Wording, tax prefill, minimum flag, categories, answer descriptions
// ---------------------------------------------------------------------------
test('6: rebar example names US and Canadian bar sizes; the rest of the sentence is kept',()=>{
  assert.equal(FIELD_COPY.rebarDescription.help,'The bar size and spacing your rebar price is for, for example #3 bars (US) or 10M bars (Canada) at 18 inches each way on chairs. It is shown on the quote. Quotes with rebar go to you for review until it is set.');
});
test('7: Saskatchewan prefills 11% on the whole job with owner confirmation; BC and Manitoba stay 5%',()=>{
  const sk=resolveJurisdiction('CA','SK');
  assert.deepEqual([sk.taxMode,sk.taxPercent,sk.needsOwnerConfirmation],['TAX_ALL',11,true]);
  for(const r of ['BC','MB'])assert.deepEqual([resolveJurisdiction('CA',r).taxPercent,resolveJurisdiction('CA',r).needsOwnerConfirmation],[5,true]);
  assert.equal(resolveJurisdiction('CA','QC').taxPercent,14.975);
  assert.match(sk.note,/^Your province has PST or QST in addition to GST\. The prefilled rate is GST alone, GST plus QST in Quebec, or GST plus PST in Saskatchewan\. PST on contractor work varies by province and job type, so confirm your combined rate with your accountant\.$/);
});
test('8: under TAX_ALL the minimum line is flagged taxable; amounts and other modes unchanged',()=>{
  // $100 custom labor job under a $500 minimum: $400 top-up. 13% on $500 = $65.00 -> $565.00.
  for(const [mode,taxable,total] of [['TAX_ALL',true,56500],['TAX_NONE',false,50000]]){
    const f=custom();Object.assign(f.ownerPricing.pricing,{price:10000,minimumJob:50000});f.businessDefaults.taxMode=mode;f.businessDefaults.taxPercent=mode==='TAX_NONE'?0:13;
    f.ownerPricing.taxabilityByCategory=Object.fromEntries(Object.keys(f.ownerPricing.taxabilityByCategory).map(k=>[k,true]));
    const q=generateQuoteVNext(f),line=q.options[0].lineItems.find(l=>l.name==='Minimum price adjustment');
    assert.equal(line.amountCents,40000);assert.equal(line.taxable,taxable,mode);assert.equal(cents(q),total,mode);
  }
});
test('9: price-book categories match the quote line each price produces',()=>{
  const cases=[['LANDSCAPING_SOD','sodRemovalPerSqft','labor'],['LANDSCAPING_MOWING','mowingVisitCharge','labor'],['FLAT_ROOF_REPLACEMENT','flatRoofDeckPerSheet','material']];
  for(const [type,field,want] of cases)assert.equal(ownerMoneyEntries({serviceType:type,pricing:{[field]:1000}})[0].category,want,field);
  // The quote lines: mowing visit charge and flat-roof deck replacement (material-only basis).
  const mow=corpus('case:mowing-control');mow.ownerPricing.pricing.mowingVisitCharge=2500;
  assert.equal(generateQuoteVNext(mow).options[0].lineItems.find(l=>l.calculation?.ratePath==='mowingVisitCharge').category,'labor');
  const roof=corpus('case:flat-roof-residential-control');roof.ownerPricing.pricing.flatRoofDeckPerSheet=5000;roof.ownerPricing.pricing.flatRoofItemBasis={...roof.ownerPricing.pricing.flatRoofItemBasis};delete roof.ownerPricing.pricing.flatRoofItemBasis.flatRoofDeckPerSheet;roof.customerInputs.deckSheets=2;
  const deck=generateQuoteVNext(roof).options?.[0]?.lineItems.find(l=>l.calculation?.ratePath==='flatRoofDeckPerSheet');
  if(deck)assert.equal(deck.category,'material');
});
test('10: every built-in answer description is accepted unchanged; pitch ratios "N in 12" and "N/12" pass',()=>{
  const roofing=corpus('v29:priced-roofing-earlier-rules');
  for(const [set,lines] of Object.entries(ANSWER_DEFINITION_STARTING_TEXT))for(const [value,text] of Object.entries(lines)){
    // A one-question check against the field that uses this set.
    const fields={probe:{type:'enum',label:'Probe',values:[value]}};
    const issues=answerDefinitionIssuesVNext({answerDefinitions:{probe:{[value]:text}}},null,{});
    assert.deepEqual(issues,[],`${set}.${value}: ${text}`);
  }
  // Through the real roofing pitch question.
  const fields=customerContractForVNext('ROOFING_REPLACEMENT',roofing.ownerPricing.pricing,roofing.ownerPricing).fields;
  const pitch=answerDefinitionFieldsVNext(fields,roofing.ownerPricing.pricing).find(f=>f.name==='pitch');
  if(pitch){const saved=Object.fromEntries(pitch.choices.map(c=>[c.value,ANSWER_DEFINITION_STARTING_TEXT.pitch[c.value]]).filter(([,t])=>t));
    assert.deepEqual(answerDefinitionIssuesVNext({answerDefinitions:{pitch:saved}},fields,roofing.ownerPricing.pricing),[]);}
  for(const ok of ['Under 4/12, easy to walk on.','From 4 in 12 to 6 in 12.','2.5/12 or less'])assert.deepEqual(answerDefinitionIssuesVNext({answerDefinitions:{x:{y:ok}}},null,{}),[],ok);
  for(const bad of ['About 12 of them.','Under 4 in 10 pitch','12'])assert.notDeepEqual(answerDefinitionIssuesVNext({answerDefinitions:{x:{y:bad}}},null,{}),[],bad);
});

// ---------------------------------------------------------------------------
// 11. Product names starting with a digit
// ---------------------------------------------------------------------------
test('11: digit-first names are accepted, shown exactly as typed, stored with a letter-first key, and never collide',()=>{
  const names=['3-tab shingle','30 year shingle','6 ft cedar','3 tab shingle','3-Tab Shingle','2x4 Cedar (rough)'];
  const keys=names.map(n=>productKeyFromName(n).key);
  for(const [i,key] of keys.entries()){
    assert.match(key,/^[a-z][a-z0-9_]*$/,names[i]);
    assert.equal(productNameFromKey(key),names[i]);assert.equal(humanPricingKey(key),names[i]);assert.equal(keyLabel(key),names[i]);
  }
  assert.equal(new Set(keys).size,keys.length,'every typed name is its own product');
  // No letter-first name can produce one of these keys (a typed name never has a double underscore).
  for(const n of ['n 332d746162','N__33','n_3_tab'])assert.ok(!keys.includes(productKeyFromName(n).key));
  // A customer's typing matches the way other names do; two names that read the same match neither.
  assert.equal(registeredProductKey('3 TAB SHINGLE',[keys[1],keys[2]]),null);
  assert.equal(registeredProductKey('30-Year shingle',[keys[1],keys[2]]),keys[1]);
  assert.equal(registeredProductKey('3 tab shingle',[keys[0],keys[3]]),keys[3],'exact typed name wins');
  assert.equal(registeredProductKey('3 tab  shingle!',[keys[0]]),keys[0]);
  assert.equal(registeredProductKey('3-tab shingle',[keys[0],keys[4]]),keys[0]);
  assert.equal(registeredProductKey('3 TAB shingle',[keys[0],keys[4]]),null,'two registered names read the same');
  // Letter-first names are unchanged.
  assert.equal(productKeyFromName('Vinyl (D4)').key,'vinyl_d4');assert.equal(keyLabel('vinyl_d4'),'vinyl d4');
});
test('11: a digit-first roof product quotes end to end, and the customer sees the name as typed',async t=>{
  const f=corpus('v29:priced-roofing-earlier-rules'),p=f.ownerPricing.pricing,old='asphalt_shingle',key=productKeyFromName('3-tab shingle').key;
  // Rename the product (keys, and the customer's product answers); the product class stays asphalt_shingle.
  const rename=obj=>{if(Array.isArray(obj))return obj.map(rename);if(!record(obj))return obj;return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k===old?key:k,rename(v)]));};
  f.ownerPricing=rename(f.ownerPricing);f.customerInputs=rename(f.customerInputs);
  for(const field of ['existingRoofType','replacementRoofType']){if(f.customerInputs[field]===old)f.customerInputs[field]=key;if(f.customerInputs.confirmedFacts?.[field]?.value===old)f.customerInputs.confirmedFacts[field].value=key;}
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  const text=JSON.stringify(sanitizeForCustomerVNext(q));
  assert.ok(text.includes('3-tab shingle'),'customer sees the typed name');assert.ok(!text.includes(key)&&!text.includes('n  33'),'no stored key');
});

// ---------------------------------------------------------------------------
// 12. Exterior painting height bands
// ---------------------------------------------------------------------------
test('12: height bands are refused on exterior painting and accepted on interior painting',()=>{
  const bands={standardMaxFeet:9,highMaxFeet:12,vaultedMaxFeet:20};
  assert.deepEqual(surfaceOwnerDiagnostics('EXTERIOR_PAINTING',{paintingSettings:{heightBands:bands}}).map(d=>[d.path,d.message]),[['paintingSettings.heightBands','Wall height bands apply to interior painting only.']]);
  assert.deepEqual(surfaceOwnerDiagnostics('INTERIOR_PAINTING',{paintingSettings:{heightBands:bands}}),[]);
  const f=offeringFixture('EXTERIOR_PAINTING','installed');f.ownerPricing.pricing.paintingSettings={heightBands:bands};
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
});

// ---------------------------------------------------------------------------
// 13. Roof building code follows the saved business country
// ---------------------------------------------------------------------------
import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
test('13: a saved code that does not match the saved country is an owner setup item; matching or no country is unchanged',async()=>{
  const database=await import('../server/src/db.js');database.migrate();
  const {saveJurisdictionProfile}=await import('../server/src/onboardingService.js');
  const {registerQuoteDateDatabase}=await import('../server/src/quoteDate.js');registerQuoteDateDatabase(database.db);
  const store=await import('../server/priceBookService.js');
  const message=code=>`The saved building code does not match your business country. Under "Building code your roofs follow", choose ${code==='nbc'?'Canada: National Building Code (and provincial codes based on it)':'United States: International Residential Code'}.`;
  for(const country of ['CA','US',null])for(const code of ['nbc','irc'])for(const form of ['pricing','root']){
    const id='synthetic-r13-'+randomUUID();
    database.db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-17T00:00:00Z');
    if(country)saveJurisdictionProfile(id,{country,region:country==='CA'?'ON':'NY'});
    const f=corpus('v29:priced-roofing-earlier-rules');f.ownerPricing.pricing.roofBuildingCode=code;
    const raw={...(form==='root'?rootForm(f.ownerPricing):f.ownerPricing),id:randomUUID(),active:true};delete raw.origin;
    store.savePricebook(id,{services:[raw],defaults:{...f.businessDefaults,currency:'CAD'}});
    const book=store.loadPricebook(id),status=bridge.applicationStatus(book.services[0],book);
    const expected=country==='CA'?'nbc':country==='US'?'irc':null,mismatch=expected&&code!==expected;
    assert.equal(status.applicationIssues.includes(message(expected)),!!mismatch,`${country} ${code} ${form}`);
  }
});
test('13: the editor offers only the matching code; both with no saved country; a saved mismatch stays visible',async t=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const out=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'x',setup(b){b.onLoad({filter:/client[\\/]src[\\/]pricebook\.jsx$/},async a=>({contents:(await readFile(a.path,'utf8'))+'\nexport {OwnerField,PricingContext,BusinessCountryContext};',loader:'jsx'}));
      b.onResolve({filter:/^\.\/api\.js$/},()=>({path:'synthetic-api',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`export * from ${JSON.stringify(root+'client/src/api.js')};export async function api(){return {};}`,loader:'js',resolveDir:root}));}}],
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {OwnerField,PricingContext,BusinessCountryContext} from './client/src/pricebook.jsx';
      createRoot(document.getElementById('root')).render(<BusinessCountryContext.Provider value={window.country}><PricingContext.Provider value={window.service}><OwnerField definition={window.definition} value={window.value} onChange={()=>{}}/></PricingContext.Provider></BusinessCountryContext.Provider>);`}});
  const definition=meta('ROOFING_REPLACEMENT').fields.find(f=>f.field==='roofBuildingCode');
  for(const [country,value,want] of [['CA',null,['nbc']],['US',null,['irc']],[null,null,['nbc','irc']],['CA','irc',['nbc','irc']],['US','irc',['irc']]]){
    const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
    dom.window.eval(`window.country=${JSON.stringify(country)};window.value=${JSON.stringify(value)};window.definition=${JSON.stringify(definition)};window.service=${JSON.stringify({serviceType:'ROOFING_REPLACEMENT',pricing:{}})};window.structuredClone=x=>JSON.parse(JSON.stringify(x));`);
    dom.window.eval(out.outputFiles[0].text);
    for(let i=0;i<200&&!dom.window.document.querySelector('select');i++)await new Promise(r=>setTimeout(r,10));
    const options=[...dom.window.document.querySelectorAll('select option')].map(o=>o.value).filter(Boolean);
    assert.deepEqual(options,want,`${country} ${value}`);
  }
});

// ---------------------------------------------------------------------------
// 14. Postal code given twice
// ---------------------------------------------------------------------------
test('14: a postal code given twice must agree after normalizing',()=>{
  const twice='The postal or ZIP code was given twice with different values.';
  for(const [top,inner,want] of [['M5V 2T6','m5v2t6',false],['10001','10001',false],['10001','10001-1234',true],['10001','10002',true],['M5V 2T6','M5V 2T7',true],['M5V 2T6',undefined,false],[undefined,'10001',false]]){
    const s={...(top!==undefined?{postalCode:top}:{}),customerInputs:inner!==undefined?{postalCode:inner}:{}};
    assert.equal(wholeRequestIssues(s,'x').includes(twice),want,`${top} / ${inner}`);
  }
});
