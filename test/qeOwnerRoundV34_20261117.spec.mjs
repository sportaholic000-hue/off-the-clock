// November 17, 2026, second owner round on 55b13052: ten decided items, engine
// v34. Expected values are worked by hand in the comments before each run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {generateQuoteVNext,sanitizeForCustomerVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';
import {vNextServiceStatus,getVNextPriceBookMetadata} from '../server/quote-engine-vnext/priceBook.js';
import {customerContractForVNext} from '../server/quote-engine-vnext/contracts.js';
// The four siding types (contracts.js SIDING_TYPES).
const SIDING_TYPES=['vinyl','fiber_cement','wood','metal'];
import {answerDefinitionIssuesVNext} from '../server/quote-engine-vnext/answerDefinitions.js';
import {productKeyFromName,productNameFromKey,keyLabel,productNameTaken,duplicateTypedProductKeys,DUPLICATE_NAME_MESSAGE} from '../server/productNames.js';
import {validatePriceBookTree} from '../server/priceBookTree.js';
import {validateInterviewConfiguration} from '../server/interviewConfiguration.js';
import {validatePricebookReceptionistSettings} from '../server/src/voice/receptionistSettings.js';
import {otherProvinceJobTax,PROVINCE_BY_LETTER,FIXED_PROVINCE_RATES,OWNER_RATE_PROVINCES,CANADIAN_PROVINCES} from '../server/taxJurisdiction.js';
import {EXPECTED_QUOTE_ENGINE_VERSION} from '../server/src/runtimeConfig.js';
import {customerSummaryValue} from '../server/src/customerSummary.js';
import {FENCE_GATE_CORNER_QUESTION} from '../server/quote-engine-vnext/fencePricing.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {measuredScopeCases} from './measuredScopeFixtures.mjs';
import {webQuote,publicCopy,quoteEmailFixture,publish} from './quoteDeliveryBatch20261015Fixture.mjs';
import {corpusInputs,engineFingerprint} from '../verification/engine-fingerprint/fingerprint.mjs';
import {siding,flooring,custom,flatRepair} from '../verification/engine-independent/fixtures.mjs';
import * as bridge from '../server/src/quoteDoneBridge.js';

const record=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
import {withClass2Defaults} from '../server/quote-engine-vnext/contracts.js';
// Lane B, November 19, 2026. Fix B10: frozen flat-roof inputs predate the "Insulation and
// cover board waste" quantity assumption, which the price book fills at load
// (materializeVNextService); they are quoted with it filled, as the application does.
// Fix B2: the frozen v29 roof prices 2 decking sheets as material only, which now needs its
// installation labor price (25.00 per sheet here).
const corpus=id=>{
  const input=structuredClone(corpusInputs().find(r=>r.id===id).input);
  if(input.serviceType==='FLAT_ROOF_REPLACEMENT')input.ownerPricing.pricing=withClass2Defaults(input.serviceType,input.ownerPricing.pricing);
  if(id==='v29:priced-roofing-earlier-rules')input.ownerPricing.pricing.deckingLaborPerSheet=2500;
  return input;
};
const line=(q,name)=>q.lineItems.find(l=>l.name===name);
const KEY_LEAK=/n__[0-9a-f]{4,}|n {2}[0-9a-f]{4,}/;
// Every customer channel: web result (what the widget shows), saved public copy
// (written quote and email link), the voice question contract and narration.
async function channels(t,f){
  const w=webQuote(structuredClone(f),[],undefined,{},{emailClock:()=>Date.parse('2026-10-15T12:05:00.000Z')});
  const web=JSON.stringify(w.result);
  let saved=null;
  if(['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(w.result.resultType)){
    w.email.enqueueSavedQuote({ownerId:w.owner,quoteId:w.row.recordId,email:'caller@example.invalid',customerConfirmed:true});
    const delivery=w.rows()[0];saved=JSON.stringify(publicCopy(w.email,delivery).copy)+JSON.parse(delivery.messageJson).text;
  }
  const h=quoteEmailFixture(t);publish(h.c.ownerId,structuredClone(f));
  const match=await h.tool('matchService',{query:f.ownerPricing.service});
  const {confirmedFacts,...stated}=f.customerInputs;
  // The receptionist says a product by the name the question contract gives it.
  const voiceInputs=Object.fromEntries(Object.entries(stated).map(([k,v])=>[k,typeof v==='string'?productNameFromKey(v)??v:v]));
  const args={serviceHandle:match.serviceHandle,customerInputs:voiceInputs,customerConfirmed:true,callerMeasurementsEstimated:true,productConfirmations:Object.fromEntries(Object.keys(confirmedFacts||{}).map(k=>[k,true])),additionalWork:[]};
  let voice=match.status==='matched'?await h.tool('getQuote',args):match;
  // The caller confirms a configured scope the receptionist reads back.
  if(voice.questionContract?.fields?.some(field=>field.confirmationToken)){args.scopeConfirmations=Object.fromEntries(voice.questionContract.fields.filter(field=>field.confirmationToken).map(field=>[field.field,field.confirmationToken]));voice=await h.tool('getQuote',args);}
  return {web,saved,contract:JSON.stringify(match.questionContract||match),voice:JSON.stringify(voice),result:w.result,voiceResult:voice,owner:w.owner};
}
test('v34 version literals agree and the fingerprint is recorded',async()=>{
  assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261124-v47');assert.equal(EXPECTED_QUOTE_ENGINE_VERSION,ENGINE_VERSION);
  const history=JSON.parse(await readFile(new URL('../verification/engine-fingerprint/history.json',import.meta.url),'utf8'));
  assert.equal(history[ENGINE_VERSION],engineFingerprint());
});

// ---------------------------------------------------------------------------
// 1. Siding replacement checks only the selected siding type
// ---------------------------------------------------------------------------
test('1: every siding type pairing: a fully priced type quotes beside a half-priced one; the half-priced type names its missing price',()=>{
  // Written before execution: selected type fully priced at labor $4/sq ft and
  // material $7/sq ft on 1,000 sq ft: labor 1,000*400 = 400,000c. A sibling with
  // only one of its two prices never blocks it. Choosing the sibling goes to
  // review naming exactly the sibling's missing price.
  let pairs=0;
  for(const selected of SIDING_TYPES)for(const other of SIDING_TYPES)if(other!==selected)for(const half of ['laborPerSqft','materialPerSqft']){
    const f=siding(),p=f.ownerPricing.pricing;p.laborPerSqft={[selected]:400};p.materialPerSqft={[selected]:700};p[half][other]=half==='laborPerSqft'?500:800;
    f.customerInputs.sidingType=selected;
    let q=generateQuoteVNext(structuredClone(f));
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',`${selected} beside half-priced ${other}: ${q.reviewReason}`);assert.equal(line(q,'Siding labor').amountCents,400000);
    const missing=(half==='laborPerSqft'?'materialPerSqft.':'laborPerSqft.')+other;
    f.customerInputs.sidingType=other;q=generateQuoteVNext(structuredClone(f));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',other);assert.deepEqual(q.missingOwnerFields,[missing],other);
    const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
    assert.equal(status.status,'QUOTING LIVE',`${selected}/${other}`);
    // Product coverage, as for flooring: the selected type is complete; a sibling
    // listed there (one with a labor price) is marked incomplete.
    const rows=Object.fromEntries(status.productCoverage.map(row=>[row.selection.sidingType,row.configurationComplete]));
    assert.equal(rows[selected],true);if(half==='laborPerSqft')assert.equal(rows[other],false);else assert.ok(!(other in rows)||rows[other]===false);
    pairs++;
  }
  assert.equal(pairs,SIDING_TYPES.length*(SIDING_TYPES.length-1)*2);
  // Both halves missing on the selected type still go to review.
  const f=siding();f.ownerPricing.pricing.laborPerSqft.fiber_cement=500;f.customerInputs.sidingType='fiber_cement';
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

// ---------------------------------------------------------------------------
// 2. Corner gates on fences
// ---------------------------------------------------------------------------
function fence(mode,runs,postsIncluded){
  const f=offeringFixture('FENCING_INSTALL',mode);for(const k of ['linearFeet','lfMethod','gates','cornerCount'])delete f.customerInputs[k];
  if(postsIncluded!==undefined)f.ownerPricing.pricing.offeringDetails.gates.walk.postsAndFootingsIncluded=postsIncluded;
  f.customerInputs.fenceRuns=runs;return f;
}
const posts=q=>line(q,'Separately priced post materials')?.calculation.quantity;
test('2: closed runs: a gate at every position, turning a corner, closes the side there and shares its post',()=>{
  // Written before execution: four 24 ft sides, 4 ft gate, post spacing 8 ft.
  // Line posts: 4*(ceil(24/8)-1) = 8. Without the corner answer, the gate sits
  // inside a 52 ft side of a 100 ft perimeter: 104 >= 100, refused. With
  // "yes" the sides are 24, 24, 24 and 28: valid. Boundaries: three plain
  // corners (one post each) and the gate (two gate posts, one of them the
  // fourth corner, counted once): terminal 3 + 2 = 5, total 13 posts. With gate
  // posts included in the gate price: terminal 3, total 11. Installed: 96 LF
  // * $40 = 384,000c + gate 25,000c = 409,000c.
  for(const mode of ['installed','itemized'])for(const included of mode==='itemized'?[false,true]:[undefined])for(let at=0;at<4;at++)for(const corner of [undefined,false,true]){
    const sections=[0,1,2,3].map(i=>({lengthLF:24,...(i===at?{gateAfter:'walk',...(corner===undefined?{}:{cornerAfterGate:corner})}:{})}));
    const q=generateQuoteVNext(fence(mode,[{closed:true,sections}],included));
    if(corner!==true){assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',`${mode} ${at} ${corner}`);assert.match(q.reviewReason,/A closed fence side must be shorter/);continue;}
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',`${mode} ${included} gate after ${at+1}: ${q.reviewReason}`);
    if(mode==='installed'){assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,409000);continue;}
    assert.equal(posts(q),included?11:13,`gate after ${at+1}, posts included ${included}`);
    assert.equal(line(q,'Fence infill installation labor').calculation.quantity,96);
  }
});
test('2: open runs: gates at every position (start, middle, end) give the same posts with or without a corner after the gate',()=>{
  // Written before execution: sections 20, 30 and 10 ft, spacing 8 ft. Line
  // posts (3-1)+(4-1)+(2-1) = 6. One gate: two run ends and two boundaries, one
  // the gate's two posts, the other a corner: terminal 2+2+1 = 5 (a gate at the
  // end shares the run's end post: 2+2+2-1 = 5). Total 11. With gate posts in
  // the gate price the gate adds none: 2+1 = 3, or at the end 2+2-1 = 3 (the
  // end post is the gate's own); total 9. A gate at the start is entered by
  // listing the run from that end, so it is the end case of the reversed run.
  const runs={after1:[{lengthLF:20,gate:true},{lengthLF:30},{lengthLF:10}],after2:[{lengthLF:20},{lengthLF:30,gate:true},{lengthLF:10}],end:[{lengthLF:20},{lengthLF:30},{lengthLF:10,gate:true}],start:[{lengthLF:10},{lengthLF:30},{lengthLF:20,gate:true}]};
  for(const included of [false,true])for(const [where,shape] of Object.entries(runs)){
    const totals=[];
    for(const corner of [undefined,false,true]){
      const sections=shape.map(s=>({lengthLF:s.lengthLF,...(s.gate?{gateAfter:'walk',...(corner===undefined?{}:{cornerAfterGate:corner})}:{})}));
      const q=generateQuoteVNext(fence('itemized',[{closed:false,sections}],included));
      assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',`${where} ${corner}: ${q.reviewReason}`);
      assert.equal(posts(q),included?9:11,`${where} included ${included} corner ${corner}`);
      totals.push(q.options[0].calculationRecord.scenarios.mid.finalTotalCents);
    }
    assert.equal(new Set(totals).size,1,`${where}: the corner answer never changes an open run's price`);
  }
  // The corner answer belongs to a placed gate only, and must be Yes or No.
  for(const bad of [{lengthLF:20,cornerAfterGate:true},{lengthLF:20,gateAfter:'walk',cornerAfterGate:'yes'}]){
    const q=generateQuoteVNext(fence('itemized',[{closed:false,sections:[bad,{lengthLF:10}]}]));
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,/The corner question applies only to a section with a gate after it, and the answer must be Yes or No\./);
  }
});
test('2: the widget asks the corner question only once a gate is placed; the voice contract and summary carry it',async t=>{
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const root=fileURLToPath(new URL('..',import.meta.url));
  const out=await build({absWorkingDir:root,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    stdin:{resolveDir:root,loader:'jsx',contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {FenceRunsInput} from './client/src/FenceRunsInput.jsx';
      createRoot(document.getElementById('root')).render(<FenceRunsInput field={window.field} runs={window.runs} onChange={()=>{}}/>);`}});
  const f=offeringFixture('FENCING_INSTALL','itemized'),field=customerContractForVNext('FENCING_INSTALL',f.ownerPricing.pricing,f.ownerPricing).fields.fenceRuns;
  assert.equal(field.gateCornerQuestion,FENCE_GATE_CORNER_QUESTION);assert.equal(FENCE_GATE_CORNER_QUESTION,'Does the fence turn a corner right after this gate?');
  for(const [runs,count] of [[[{closed:true,sections:[{lengthLF:24},{lengthLF:24}]}],0],[[{closed:true,sections:[{lengthLF:24},{lengthLF:24,gateAfter:'walk'}]}],1],[[{closed:false,sections:[{lengthLF:24,gateAfter:'walk'},{lengthLF:24,gateAfter:'walk'}]}],2]]){
    const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
    dom.window.eval(`window.field=${JSON.stringify(field)};window.runs=${JSON.stringify(runs)};window.structuredClone=x=>JSON.parse(JSON.stringify(x));`);dom.window.eval(out.outputFiles[0].text);
    for(let i=0;i<200&&!dom.window.document.querySelector('select');i++)await new Promise(r=>setTimeout(r,10));
    const asked=[...dom.window.document.querySelectorAll('select')].filter(s=>s.getAttribute('aria-label').startsWith(FENCE_GATE_CORNER_QUESTION));
    assert.equal(asked.length,count,JSON.stringify(runs));
  }
  // Customer summary (widget review, written quote) names the corner.
  assert.equal(customerSummaryValue(field,[{closed:true,sections:[{lengthLF:24},{lengthLF:24},{lengthLF:24},{lengthLF:24,gateAfter:'walk',cornerAfterGate:true}]}],v=>String(v)),
    'Run 1: sections of 24 ft, 24 ft, 24 ft and 24 ft; connects back; gate '+field.gateChoices[0].label+' between sections 4 and 1, with a corner right after the gate');
  // Voice: the question contract carries the corner question; a corner layout quotes on the phone and in every channel.
  const square=fence('itemized',[{closed:true,sections:[{lengthLF:24},{lengthLF:24},{lengthLF:24},{lengthLF:24,gateAfter:'walk',cornerAfterGate:true}]}]);
  const c=await channels(t,square);
  assert.ok(c.contract.includes(FENCE_GATE_CORNER_QUESTION),'voice question contract');
  assert.equal(c.result.resultType,'INSTANT_ESTIMATE_READY');assert.equal(c.voiceResult.resultType,'INSTANT_ESTIMATE_READY',c.voice);
});

// ---------------------------------------------------------------------------
// 3. Painting trim condition
// ---------------------------------------------------------------------------
test('3: trim condition uses the covered rule in both painting modes, for every priced and every customer condition',()=>{
  // Written before execution: a price for a condition covers that condition and
  // any better one (good better than fair, fair better than poor); a worse trim
  // goes to review. Installed and itemized (with offeringRates.installedTrimPerLF)
  // now agree. Installed total 3,800 dollars; itemized 3,287 dollars.
  const RANK={good:0,fair:1,poor:2};
  for(const mode of ['installed','itemized'])for(const priced of ['good','fair','poor'])for(const condition of ['good','fair','poor']){
    const f=offeringFixture('INTERIOR_PAINTING',mode);f.ownerPricing.pricing.offeringDetails.trimSurfaceCondition=priced;f.customerInputs.trimSurfaceCondition=condition;
    const q=generateQuoteVNext(f),covered=RANK[condition]<=RANK[priced];
    assert.equal(q.resultType,covered?'INSTANT_ESTIMATE_READY':'ESTIMATE_REQUIRES_REVIEW',`${mode} priced ${priced} customer ${condition}`);
    if(covered){assert.equal(q.midEstimate,mode==='installed'?3800:3287);assert.equal(line(q,'Installed trim painting including the defined scope').amountCents,20000);}
    else assert.deepEqual(q.invalidCustomerFields,['trimSurfaceCondition']);
  }
});

// ---------------------------------------------------------------------------
// 4. Mulch
// ---------------------------------------------------------------------------
test('4: customer yards are installed yards on every route; material adds the overage then rounds to the increment, at the boundaries',()=>{
  // Written before execution, overage 1.15 (the frozen catalog value), $50/yd
  // material, $30/yd labor, increment 0.5 yd:
  //   area and depth 270 sq ft * 3 in / 324 = 2.5 yd -> 2.875 -> 3.0 bought.
  //   stated 2.5 yd -> 2.875 -> 3.0; stated 2.6 -> 2.99 -> 3.0;
  //   stated 2.61 -> 3.0015 -> 3.5; stated 3.0/1.15 -> exactly 3.0 -> 3.0.
  //   planting 2 yd -> 2.3 -> 2.5; 2.6 -> 2.99 -> 3.0; 2.61 -> 3.5.
  // Labor stays on the installed yards in every case.
  const mulch=(method,amount,depth)=>{const f=corpus('explanation:catalog-LANDSCAPING_MULCH');Object.assign(f.customerInputs,{inputMethod:method,mulchArea:amount,bedCondition:'clean',edgingNeeded:false});delete f.customerInputs.bedSqft;delete f.customerInputs.edgeLF;if(depth)f.customerInputs.mulchDepth=depth;else delete f.customerInputs.mulchDepth;f.ownerPricing.pricing.mulchOrderIncrementCubicYards={brown:0.5};return f;};
  for(const [f,bought,installed] of [[mulch('sqft',270,3),3,2.5],[mulch('yards',2.5),3,2.5],[mulch('yards',2.6),3,2.6],[mulch('yards',2.61),3.5,2.61],[mulch('yards',2),2.5,2]]){
    const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
    assert.equal(line(q,'Mulch material').calculation.quantity,bought,JSON.stringify(f.customerInputs));assert.equal(line(q,'Mulch material').amountCents,bought*5000);
    assert.ok(Math.abs(line(q,'Mulch installation labor').calculation.quantity-installed)<1e-12);
  }
  const plant=(yards,increment,exact)=>{const f=corpus('explanation:catalog-LANDSCAPING_PLANTING');f.customerInputs.mulchYards=yards;if(increment)f.ownerPricing.pricing.mulchOrderIncrementCubicYards={brown:increment};if(exact)f.ownerPricing.pricing.partialPackagePricing='exact_quantity';return f;};
  for(const [yards,bought] of [[2,2.5],[2.6,3],[2.61,3.5]]){
    const q=generateQuoteVNext(plant(yards,0.5));assert.equal(line(q,'Mulch material').calculation.quantity,bought,String(yards));assert.equal(line(q,'Mulch installation labor').calculation.quantity,yards);
  }
  // Exact quantity: 2 * 1.15 = 2.3 yd bought; 2.3 * $50 = 11,500c.
  let q=generateQuoteVNext(plant(2,undefined,true));assert.equal(line(q,'Mulch material').calculation.quantity,2.3);assert.equal(line(q,'Mulch material').amountCents,11500);
  // Planting with no mulch asked needs no increment.
  const none=plant(2);none.customerInputs.mulchNeeded=false;delete none.customerInputs.mulchYards;delete none.customerInputs.mulchType;delete none.customerInputs.confirmedFacts;
  q=generateQuoteVNext(none);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
});
test('4: planting follows the mulching increment requirement at readiness, shows its overage factor, and the stated-yards question reads "Mulch to install"',()=>{
  const status=f=>vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  const notice='Mulch is priced by the exact cubic yard for: brown. Quotes for these go to you for review until you enter your order increment, or choose Exact quantity under Materials bought in packages.';
  for(const type of ['LANDSCAPING_MULCH','LANDSCAPING_PLANTING']){
    const f=corpus('explanation:catalog-'+type);
    let s=status(f);assert.equal(s.status,'NEEDS PRICING',type);assert.ok(s.statusNotices.includes(notice),type);
    f.ownerPricing.pricing.mulchOrderIncrementCubicYards={brown:0.5};s=status(f);assert.equal(s.status,'QUOTING LIVE',type);assert.ok(!s.statusNotices.includes(notice));
    delete f.ownerPricing.pricing.mulchOrderIncrementCubicYards;f.ownerPricing.pricing.partialPackagePricing='exact_quantity';assert.equal(status(f).status,'QUOTING LIVE',type);
    // A selling-rate material is the owner's own rate: no increment needed.
    const g=corpus('explanation:catalog-'+type);g.ownerPricing.priceBasisByCategory.material='sell_price';assert.equal(status(g).status,'QUOTING LIVE',type);
  }
  const meta=getVNextPriceBookMetadata().find(m=>m.serviceType==='LANDSCAPING_PLANTING');
  assert.ok(meta.class2Fields.some(d=>d.name==='mulchOverageFactor'),'planting overage factor shown');
  const app=bridge.applicationMetadata().services.find(m=>m.serviceType==='LANDSCAPING_PLANTING');
  assert.ok(app.class2Fields.some(d=>(d.name||d.field)==='mulchOverageFactor'));assert.ok(app.fields.some(d=>d.field==='partialPackagePricing'));
  const field=customerContractForVNext('LANDSCAPING_MULCH',{},{}).fields.mulchArea;
  assert.deepEqual(field.presentationVariants.map(v=>v.label),['Measured bed area','Mulch to install']);
  assert.equal(customerContractForVNext('LANDSCAPING_PLANTING',{},{}).fields.mulchYards.label,'Mulch to install');
});

// ---------------------------------------------------------------------------
// 5. Canadian tax by province
// ---------------------------------------------------------------------------
const POSTAL={NL:'A1A 1A1',NS:'B3H 1A1',PE:'C1A 1A1',NB:'E1C 1A1',QC:'H2X 1A1',ON:'M5V 2T6',MB:'R3C 1A1',SK:'S4P 1A1',AB:'T2P 1J9',BC:'V6B 1A1',NT_NU:'X1A 2P7',YT:'Y1A 1A1'};
test('5: every province pairing, tax by job location on and off',()=>{
  // Written before execution: 200 sq ft tile, everything taxable, 178,000c
  // before tax, business rate 9% (distinct from every province rate).
  //  - Off, job in another province: CRA rate (13/14/15/5) or the owner's
  //    QC/BC/MB/SK rate (here QC 14.975, BC 12, MB 12, SK 11), review if blank.
  //  - Off, same province or no saved province: the business rate, 9%.
  //  - On: today's rule, the job's province rate whatever the business province.
  const owner={QC:14.975,BC:12,MB:12,SK:11};
  let checks=0;
  for(const business of [...CANADIAN_PROVINCES,undefined])for(const [job,code] of Object.entries(POSTAL))for(const on of [false,true])for(const rates of [owner,{}]){
    const f=flooring('tile',200);f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,labor:true,material:true};
    Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:9,currency:'CAD',businessCountry:'CA',...(business?{businessProvince:business}:{}),...(on?{taxByJobLocation:true}:{}),...(Object.keys(rates).length?{provinceTaxPercent:rates}:{})});
    f.customerInputs.postalCode=code;
    const home=business===undefined||(business==='NT'||business==='NU'?'NT_NU':business)===job;
    const jobRate=FIXED_PROVINCE_RATES[job]??rates[job];
    const expected=on||!home?jobRate??null:9;
    const q=generateQuoteVNext(f);
    if(expected===null){assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',`${business} ${job} ${on}`);assert.deepEqual(q.missingOwnerFields,['businessDefaults.provinceTaxPercent.'+job]);}
    else{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',`${business} ${job} ${on}: ${q.reviewReason}`);assert.equal(q.options[0].calculationRecord.scenarios.mid.tax.percent,expected,`${business} ${job} ${on}`);}
    checks++;
  }
  assert.equal(checks,14*12*2*2);
  // No sales tax charged, no postal code, or a US job: unchanged.
  assert.equal(otherProvinceJobTax('T2P1J9',{taxMode:'TAX_NONE',businessCountry:'CA',businessProvince:'ON'}),null);
  assert.equal(otherProvinceJobTax(undefined,{taxMode:'TAX_ALL',businessCountry:'CA',businessProvince:'ON'}),null);
  assert.equal(otherProvinceJobTax('10001',{taxMode:'TAX_ALL',businessCountry:'CA',businessProvince:'ON'}),null);
  assert.equal(otherProvinceJobTax('T2P1J9',{taxMode:'TAX_MATERIALS',businessCountry:'CA',businessProvince:'ON'}).percent,5);
  // Materials-only tax: 5% on 112,000c materials = 5,600c for an Ontario business's Alberta job.
  const f=flooring('tile',200);f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,material:true};
  Object.assign(f.businessDefaults,{taxMode:'TAX_MATERIALS',taxPercent:13,currency:'CAD',businessCountry:'CA',businessProvince:'ON'});f.customerInputs.postalCode='T2P 1J9';
  assert.equal(generateQuoteVNext(f).options[0].calculationRecord.scenarios.mid.tax.taxCents,5600);
});
test('5: the saved province reaches quotes from onboarding, and the web, saved copy and phone quote use it',async t=>{
  const database=await import('../server/src/db.js');database.migrate();
  const {saveJurisdictionProfile}=await import('../server/src/onboardingService.js');
  const {registerQuoteDateDatabase,applicationBusinessProvince}=await import('../server/src/quoteDate.js');registerQuoteDateDatabase(database.db);t.after(()=>registerQuoteDateDatabase(undefined)); // later tests use their own databases
  const id='synthetic-v34-'+randomUUID();
  database.db.prepare('INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,id+'@example.invalid','[SYNTHETIC]','[SYNTHETIC]','[SYNTHETIC]','QuoteDone','active','UTC','owner','2026-11-17T00:00:00Z');
  assert.equal(applicationBusinessProvince(id),undefined);
  saveJurisdictionProfile(id,{country:'CA',region:'ON'});assert.equal(applicationBusinessProvince(id),'ON');
  saveJurisdictionProfile(id,{country:'US',region:'NY'});assert.equal(applicationBusinessProvince(id),undefined,'a US business has no province');
  // Web, saved copy and phone for an Ontario business's Alberta job (tax by location off): 5% of 178,000c = 8,900c.
  const f=flooring('tile',200);f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,labor:true,material:true};
  Object.assign(f.businessDefaults,{taxMode:'TAX_ALL',taxPercent:13,businessCountry:'CA',businessProvince:'ON'});f.customerInputs.postalCode='T2P 1J9';
  const q=generateQuoteVNext(structuredClone(f));assert.equal(q.options[0].calculationRecord.scenarios.mid.tax.taxCents,8900);
  assert.equal(q.options[0].calculationRecord.scenarios.mid.tax.location.place,'Alberta');
});

// ---------------------------------------------------------------------------
// 6. Minimum floor under materials-only tax
// ---------------------------------------------------------------------------
test('6: the minimum floor under each tax mode',()=>{
  // Written before execution: $600 of materials, $500 minimum, 10% tax, 20% range.
  //  TAX_MATERIALS: mid 600+60 = 660; low 660*0.8 = 528; floor 500 + 60*0.8 = 548
  //    (was 500+60 = 560); high 792. Range 548 / 660 / 792.
  //  TAX_ALL: floor 500*1.1 = 550; low max(528,550) = 550. Unchanged.
  //  TAX_NONE (0%): mid 600, low 480 -> floor 500. Unchanged.
  //  Held at the minimum ($100 materials): 500 + 10 = 510 single price, as before.
  //  A 0% low end: floor 500 + 60 = 560 = mid... low = max(660, 560) = 660.
  const job=(price,mode,tax,low=20)=>{const f=custom();Object.assign(f.ownerPricing.pricing,{customChargeClassification:'material',price,minimumJob:50000});f.ownerPricing.taxabilityByCategory={...f.ownerPricing.taxabilityByCategory,material:true};Object.assign(f.businessDefaults,{taxMode:mode,taxPercent:tax,rangeBufferPercent:low});return generateQuoteVNext(f);};
  const range=q=>[q.lowEstimate,q.midEstimate,q.highEstimate];
  assert.deepEqual(range(job(60000,'TAX_MATERIALS',10)),[548,660,792]);
  assert.deepEqual(range(job(60000,'TAX_ALL',10)),[550,660,792]);
  assert.deepEqual(range(job(60000,'TAX_NONE',0)),[500,600,720]);
  assert.deepEqual(range(job(10000,'TAX_MATERIALS',10)),[510,510,510]);
  assert.deepEqual(range(job(60000,'TAX_MATERIALS',10,0)),[660,660,660]);
  // 25% low end (the largest range buffer allowed): floor 500 + 60*0.75 = 545; low max(495, 545) = 545.
  assert.deepEqual(range(job(60000,'TAX_MATERIALS',10,25)).slice(0,2),[545,660]);
});

// ---------------------------------------------------------------------------
// 7. Product names that start with a digit
// ---------------------------------------------------------------------------
// A product name also appears inside dotted price paths (labor-share keys).
const segment=(k,old,key)=>k.split('.').map(part=>part===old?key:part).join('.');
// A product class (roofProductClass values) is a fixed engine class, not a name.
const renameAll=(obj,old,key,parent)=>Array.isArray(obj)?obj.map(v=>renameAll(v,old,key)):record(obj)?Object.fromEntries(Object.entries(obj).map(([k,v])=>[segment(k,old,key),renameAll(v,old,key,k)])):typeof obj==='string'&&!/ProductClass$/.test(parent||'')?segment(obj,old,key):obj;
const renameKeys=(obj,old,key)=>Array.isArray(obj)?obj.map(v=>renameKeys(v,old,key)):record(obj)?Object.fromEntries(Object.entries(obj).map(([k,v])=>[segment(k,old,key),renameKeys(v,old,key)])):obj;
// Rename one product everywhere it is named; keep a product class key that is
// not a name (roofing's asphalt_shingle class) when renaming all would change it.
function digitFirst(f,field,name){
  const old=f.customerInputs[field],key=productKeyFromName(name).key;
  let g=renameAll(f,old,key);
  if(generateQuoteVNext(structuredClone(g)).resultType!=='INSTANT_ESTIMATE_READY'){
    g=renameKeys(f,old,key);
    for(const [k,v] of Object.entries(g.customerInputs))if(v===old)g.customerInputs[k]=key;
    for(const fact of Object.values(g.customerInputs.confirmedFacts||{}))if(fact.value===old)fact.value=key;
  }
  return {f:g,key,name};
}
const PRODUCT_CASES=[
  ['v29:priced-roofing-earlier-rules','replacementRoofType','30 year laminate'],
  ['explanation:catalog-ROOFING_REPAIR','roofType','3 tab shingle'],
  ['explanation:catalog-ROOFING_REPAIR','repairType','2 shingle patch'],
  ['geometry:repair-area-0102','repairType','2 shingle patch'],
  ['case:flat-roof-residential-control','replacementMembraneType','60 mil EPDM'],
  ['case:flat-repair-control','membraneType','45 mil EPDM'],
  ['case:flat-repair-control','repairType','2 ply seam patch'],
  ['geometry:repair-area-0114','repairType','2 ply seam patch'],
  ['audit-20261105:laminate-over-sound-slate','existingFloorType','3/4 inch slate'],
  ['case:FENCING_INSTALL-installed-control','fenceType','6 ft cedar'],
  ['case:FENCING_REPLACEMENT-itemized-control','fenceType','6 ft cedar'],
  ['explanation:catalog-SIDING_REPAIR','damageLevel','2 board damage'],
  ['geometry:repair-area-0126','damageLevel','2 board damage'],
  ['geometry:mulch-increment-0072','mulchType','3 inch cedar mulch'],
  ['v34:item4-planting-one-yard-increment','mulchType','3 inch cedar mulch'],
];
test('7: a digit-first name in every product field and as every repair type reads exactly as typed in the quote, web, saved copy, voice contract and narration',async t=>{
  // Written before execution: renaming changes no amount; each channel shows
  // the typed name and no stored key ("n__..." or the old "n  ..." reading).
  for(const [id,field,name] of PRODUCT_CASES){
    const before=corpus(id);
    // A repair service is live only with its largest repair area set.
    if(/REPAIR/.test(before.serviceType)&&before.ownerPricing.pricing.largeRepairMaxSqft===undefined)before.ownerPricing.pricing.largeRepairMaxSqft=1000000;
    const base=generateQuoteVNext(structuredClone(before));assert.equal(base.resultType,'INSTANT_ESTIMATE_READY',id);
    const {f}=digitFirst(before,field,name);
    const q=generateQuoteVNext(structuredClone(f));
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',`${id} ${field}: ${q.reviewReason}`);
    assert.deepEqual(q.lineItems.map(l=>l.amountCents),base.lineItems.map(l=>l.amountCents),id+' amounts unchanged');
    const customer=JSON.stringify(sanitizeForCustomerVNext(q));
    assert.ok(!KEY_LEAK.test(customer),`${id} ${field}: ${customer.match(KEY_LEAK)?.[0]}`);
    if(/repair/i.test(id)&&['repairType','damageLevel'].includes(field))assert.ok(customer.includes(name),`${id}: the repair reads "${name}"`);
    const c=await channels(t,f);
    for(const [channel,text] of [['web',c.web],['saved copy',c.saved],['voice contract',c.contract],['voice',c.voice]]){
      assert.ok(text,`${id} ${channel}`);assert.ok(!KEY_LEAK.test(text),`${id} ${field} ${channel}: ${text.match(KEY_LEAK)?.[0]}`);
    }
    assert.ok(c.contract.includes(name),`${id} ${field}: the receptionist hears "${name}"`);
    // On a call the same quote may be partial (flat-roof details are confirmed on site); it is priced.
    assert.ok(['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY'].includes(c.voiceResult.resultType),`${id} voice: ${c.voice.slice(0,300)}`);
    assert.ok(c.voice.includes(name)||!/repair/i.test(id),`${id}: the narration names "${name}"`);
  }
});
test('7: repair drivers and minimum line names show the typed name',()=>{
  // Written before execution: "small 2 ply seam patch repair" in the drivers,
  // and "2 ply seam patch minimum" (was "n  3220... minimum") as a line name.
  for(const [id,field] of [['geometry:repair-area-0102','repairType'],['geometry:repair-area-0114','repairType'],['geometry:repair-area-0126','damageLevel']]){
    const {f,name}=digitFirst(corpus(id),field,'2 ply seam patch');const q=generateQuoteVNext(f);
    assert.ok(q.lineItems.some(l=>l.name===name+' minimum'),id+': '+q.lineItems.map(l=>l.name));
  }
  const {f}=digitFirst(flatRepair(),'repairType','2 ply seam patch');
  assert.ok(generateQuoteVNext(f).priceDrivers.includes('small 2 ply seam patch repair'));
});
test('7: owner-facing readings: price book labels, answer descriptions, choice labels and the receptionist product check read the typed name',()=>{
  const key=productKeyFromName('3 tab shingle').key;
  assert.equal(keyLabel(key),'3 tab shingle');
  // The receptionist check reads the name, not the stored key.
  const book=name=>({services:[{serviceType:'ROOFING_REPLACEMENT',knownOfferings:{replacementRoofType:{[productKeyFromName(name).key]:randomUUID()}}}]});
  assert.doesNotThrow(()=>validatePricebookReceptionistSettings(book('3 tab shingle')));
  assert.throws(()=>validatePricebookReceptionistSettings(book('3 tab $89 per square')));
  // The same check as a letter-first name: a price in the name is refused.
  assert.throws(()=>validatePricebookReceptionistSettings(book('tab 89 dollars per square')));
  assert.throws(()=>validatePricebookReceptionistSettings(book('3 tab 89 dollars per square')));
  assert.doesNotThrow(()=>validatePricebookReceptionistSettings(book('30 year laminate')));
});
test('7: names that read the same are one product, in every editor and on the server save',async()=>{
  // Written before execution: "3-tab shingle", "3 tab shingle" and "3-Tab
  // Shingle" fold to "3 tab shingle"; the second is refused with "That name is
  // already listed." Letter-first and different names stay separate.
  const variants=['3-tab shingle','3 tab shingle','3-Tab Shingle','3 TAB SHINGLE',' 3  tab   shingle ','3_tab_shingle','3.tab.shingle'];
  const keys=variants.map(n=>productKeyFromName(n).key);
  for(const [i,key] of keys.entries())for(const [j,other] of keys.entries())assert.equal(productNameTaken(key,[other]),true,`${variants[i]} vs ${variants[j]}`);
  assert.equal(productNameTaken(productKeyFromName('30 year shingle').key,keys),false);
  assert.equal(productNameTaken('vinyl_plank',['vinyl_plank']),true);assert.equal(productNameTaken('tile',['vinyl_plank']),false);
  // Server: the tree validator, the interview configuration and the price-book save.
  const definition={field:'materialCostPerSquare',label:'Material',tree:{depth:1},moneyKind:'unit_rate'};
  for(const second of variants.slice(1))assert.throws(()=>validatePriceBookTree({'3-tab shingle':100,[second]:200},definition,{normalizeNames:true}),new RegExp(DUPLICATE_NAME_MESSAGE.replace('.','\\.')),second);
  assert.doesNotThrow(()=>validatePriceBookTree({'3-tab shingle':100,'30 year shingle':200},definition,{normalizeNames:true}));
  assert.throws(()=>validateInterviewConfiguration('FENCING_INSTALL','knownOfferings',{fenceType:{'6 ft cedar':true,'6-FT Cedar':true}}),/That name is already listed\./);
  assert.deepEqual(duplicateTypedProductKeys({a:{[keys[0]]:1},b:{[keys[2]]:2}}),[keys[0],keys[2]]);
  assert.equal(duplicateTypedProductKeys({a:{[keys[0]]:1},b:{[keys[0]]:2},c:keys[0]}),null);
  const f=corpus('v29:priced-roofing-earlier-rules');
  const {f:g,key}=digitFirst(f,'replacementRoofType','3-tab shingle');
  const owner='synthetic-v34-dup-'+randomUUID();
  publish(owner,g);
  const draft=bridge.readApplicationBook(owner),service=draft.services[0];
  const second=productKeyFromName('3 TAB SHINGLE').key,pricing=service.pricing||service;
  pricing.materialCostPerSquare={...pricing.materialCostPerSquare,[second]:pricing.materialCostPerSquare[key]};
  assert.throws(()=>bridge.saveApplicationBook(owner,draft,{timeZone:'UTC',quoteInstant:'2026-11-17T12:00:00.000Z'}),/3 TAB SHINGLE: That name is already listed\./);
  // The customer typing any variant matches the one saved product.
  const q=generateQuoteVNext({...structuredClone(g),customerInputs:{...g.customerInputs}});assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
});
test('7: every editor refuses a second name that reads the same',async t=>{
  // Source check of each editor's add action: each one consults productNameTaken.
  const root=new URL('..',import.meta.url);
  for(const [file,count] of [['client/src/pricebook.jsx',1],['client/src/interviewStructured.jsx',1],['client/src/FenceOfferingEditor.jsx',2],['client/src/quoteDoneControls.jsx',2],['client/src/pricebookEditing.js',1],['client/src/interviewConfiguration.jsx',1]]){
    const text=await readFile(new URL(file,root),'utf8');assert.equal((text.match(/productNameTaken\(/g)||[]).length,count,file);
  }
  // Rendered: the price-book map editor refuses "3 TAB SHINGLE" after "3-tab shingle".
  const {build}=await import('esbuild'),{JSDOM}=await import('jsdom');
  const rootPath=fileURLToPath(root);
  const out=await build({absWorkingDir:rootPath,bundle:true,write:false,platform:'browser',format:'iife',logLevel:'silent',define:{'process.env.NODE_ENV':'"development"'},
    plugins:[{name:'api',setup(b){b.onResolve({filter:/^\.\/api\.js$/},()=>({path:'synthetic-api',namespace:'synthetic'}));b.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:`export * from ${JSON.stringify(rootPath+'client/src/api.js')};export async function api(){return {};}`,loader:'js',resolveDir:rootPath}));}}],
    stdin:{resolveDir:rootPath,loader:'jsx',contents:`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {FenceOfferingEditor} from './client/src/FenceOfferingEditor.jsx';
      function App(){const [service,setService]=useState(window.service);window.current=()=>service;return <FenceOfferingEditor service={service} onChange={setService}/>;}
      createRoot(document.getElementById('root')).render(<App/>);`}});
  const f=offeringFixture('FENCING_INSTALL','installed');
  const dom=new JSDOM('<div id="root"></div>',{url:'http://synthetic.invalid',runScripts:'outside-only',pretendToBeVisual:true});t.after(()=>dom.window.close());
  // Browsers provide TextEncoder/TextDecoder and crypto.randomUUID; jsdom is given Node's.
  dom.window.TextEncoder=TextEncoder;dom.window.TextDecoder=TextDecoder;
  if(typeof dom.window.crypto?.randomUUID!=='function')Object.defineProperty(dom.window,'crypto',{value:{randomUUID}});
  dom.window.eval(`window.service=${JSON.stringify(f.ownerPricing)};window.structuredClone=x=>JSON.parse(JSON.stringify(x));`);
  dom.window.eval(out.outputFiles[0].text);
  const doc=dom.window.document,wait=async test=>{for(let i=0;i<200&&!test();i++)await new Promise(r=>setTimeout(r,10));};
  await wait(()=>doc.querySelector('[aria-label="New fence type name"]'));
  const type=async value=>{const input=doc.querySelector('[aria-label="New fence type name"]');const setter=Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set;setter.call(input,value);input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,20));[...doc.querySelectorAll('button')].find(b=>b.textContent==='Add fence offering').click();await new Promise(r=>setTimeout(r,20));};
  await type('3-tab cedar');
  await wait(()=>doc.body.textContent.includes('3-tab cedar'));
  assert.ok(doc.body.textContent.includes('3-tab cedar'),'first name added: '+doc.body.textContent.slice(-800));
  await type('3 TAB CEDAR');
  await wait(()=>doc.body.textContent.includes(DUPLICATE_NAME_MESSAGE));
  assert.ok(doc.body.textContent.includes(DUPLICATE_NAME_MESSAGE),'second name refused: '+doc.body.textContent.slice(0,600));
  assert.ok(!doc.body.textContent.includes('3 TAB CEDAR'),'not added');
});

// ---------------------------------------------------------------------------
// 8. Roof pitch descriptions
// ---------------------------------------------------------------------------
test('8: answer descriptions accept N:12 pitch ratios as well as N in 12 and N/12',()=>{
  const fields=customerContractForVNext('ROOFING_REPAIR',{},{}).fields;
  const check=text=>answerDefinitionIssuesVNext({answerDefinitions:{pitch:{low:text}}},fields,{});
  for(const text of ['4:12 to 6:12','Pitch 4:12 to 6:12','4 : 12 or steeper','4/12 to 6/12','4 in 12 to 6 in 12','Up to 3.5:12'])assert.deepEqual(check(text),[],text);
  for(const text of ['4:13','10:30 start','4:12 costs $5'])assert.notDeepEqual(check(text),[],text);
});

// ---------------------------------------------------------------------------
// 9. Flat-roof insulation labels
// ---------------------------------------------------------------------------
test('9: insulation and cover board labels are capitalized in the price book, the labor-share warning and line names',()=>{
  // Written before execution: commercial scope inputs priced exactly as before; only the names change.
  // Fix B10 (Lane B, November 19, 2026): itemized insulation and cover board material carry the 7%
  // installation waste: 120,000 x 1.07 = 128,400 and 45,000 x 1.07 = 48,150; labor and installed prices unchanged.
  const installed=generateQuoteVNext(corpus('scope:commercial-installed')),itemized=generateQuoteVNext(corpus('scope:commercial-itemized'));
  assert.equal(line(installed,'Insulation installed price').amountCents,160000);assert.equal(line(installed,'Coverboard installed price').amountCents,60000);
  for(const [name,cents] of [['Insulation labor',40000],['Insulation material',128400],['Coverboard labor',15000],['Coverboard material',48150]])assert.equal(line(itemized,name).amountCents,cents);
  assert.ok(![...installed.lineItems,...itemized.lineItems].some(l=>/^(insulation|coverboard) /.test(l.name)));
});
