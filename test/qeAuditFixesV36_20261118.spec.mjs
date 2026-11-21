// Engine audit at a9761cc1, findings confirmed and fixed: engine v36.
// Expected values are worked by hand in the comments before each run.
import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {generateQuoteVNext,ENGINE_VERSION} from '../server/quote-engine-vnext/engine.js';
import {EXPECTED_QUOTE_ENGINE_VERSION} from '../server/src/runtimeConfig.js';
import {vNextServiceStatus} from '../server/quote-engine-vnext/priceBook.js';
import {corpusInputs,engineFingerprint} from '../verification/engine-fingerprint/fingerprint.mjs';
import {scopeDefinitions} from '../server/scopeConfiguration.js';
import {offeringRateDefinitions} from '../server/quote-engine-vnext/configuredOfferings.js';
import {installedLaborFactorPath} from '../server/installedPriceConfiguration.js';
import * as bridge from '../server/src/quoteDoneBridge.js';
import {keyLabel} from '../server/productNames.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {laborPortionReviewRows} from '../client/src/surchargeLaborNotice.js';
import {priceEntryTitle} from '../client/src/pricebookReview.js';
import {withLaneDAnswers} from '../verification/engine-independent/fixtures.mjs';

// Fix B10 (Lane B, November 19, 2026): frozen flat-roof inputs predate the
// "Insulation and cover board waste" quantity assumption. The price book fills
// its starting value when a service loads (materializeVNextService), so these
// tests quote a frozen input as the application does: with that value filled.
import {withClass2Defaults} from '../server/quote-engine-vnext/contracts.js';
const filled=input=>{if(input?.serviceType==='FLAT_ROOF_REPLACEMENT')input.ownerPricing.pricing=withClass2Defaults(input.serviceType,input.ownerPricing.pricing);return input;};
// Lane D fixes D1 and D3 (November 19, 2026): frozen inputs recorded before tile asked what the floor is built on and carpet asked for room sizes get those answers (withLaneDAnswers); their hand-worked values are unchanged.
const corpus=id=>filled(withLaneDAnswers(corpusInputs().find(r=>r.id===id).input));
const line=(q,name)=>q.lineItems?.find(l=>l.name===name);
const mid=q=>q.options?.[0]?.calculationRecord?.scenarios?.mid;

test('v36 version literals agree and the fingerprint is recorded',async()=>{
  assert.equal(ENGINE_VERSION,'quote-engine-vnext-accuracy-20261121-v41');assert.equal(EXPECTED_QUOTE_ENGINE_VERSION,ENGINE_VERSION);
  const history=JSON.parse(await readFile(new URL('../verification/engine-fingerprint/history.json',import.meta.url),'utf8'));
  assert.equal(history[ENGINE_VERSION],engineFingerprint());
});

// ---------------------------------------------------------------------------
// Finding 1: installed decking and flat-roof details take the labor adjustment
// ---------------------------------------------------------------------------
// The v29 roof (earlier roof rules), stories 1 / 2 / 3 = 1 / 1.1 / 1.2. labor:null leaves the labor portion blank.
function deckedRoof(stories,{labor=50,basis='installed'}={}){
  const f=corpus('v29:priced-roofing-earlier-rules'),p=f.ownerPricing.pricing;
  Object.assign(p,{deckingPriceBasis:basis,deckingPerSheet:6000});
  if(basis==='installed'&&labor!==null)Object.assign(p,{installedLaborPercent:{...(p.installedLaborPercent||{}),deckingPerSheet:labor},installedMaterialsPercent:{...(p.installedMaterialsPercent||{}),deckingPerSheet:100-labor}});
  Object.assign(f.customerInputs,{deckingSheets:5,stories});
  return f;
}
test('1: installed roof decking takes the stories adjustment on its labor portion',()=>{
  assert.deepEqual(corpus('v29:priced-roofing-earlier-rules').ownerPricing.pricing.storyMultiplier,{1:1,2:1.1,3:1.2});
  // Written before execution: 5 sheets x 60.00 = 300.00.
  //   1 story: 300.00. 2 stories: 300 x (0.5 + 0.5 x 1.1) = 315.00. 3 stories: 300 x (0.5 + 0.5 x 1.2) = 330.00.
  for(const [stories,cents] of [[1,30000],[2,31500],[3,33000]])assert.equal(line(generateQuoteVNext(deckedRoof(stories)),'Decking replacement').amountCents,cents,String(stories));
  // A 100% labor portion at 3 stories: 300 x 1.2 = 360.00; 0%: 300.00.
  assert.equal(line(generateQuoteVNext(deckedRoof(3,{labor:100})),'Decking replacement').amountCents,36000);
  assert.equal(line(generateQuoteVNext(deckedRoof(3,{labor:0})),'Decking replacement').amountCents,30000);
  // Material-only decking is not an installed price: 300.00 at any height.
  // Fix B2 (Lane B, November 19, 2026): its installation labor is priced per sheet
  // and takes the same stories adjustment: 5 sheets x 25.00 x 1.2 = 150.00.
  const materialOnly=deckedRoof(3,{basis:'material_only'});materialOnly.ownerPricing.pricing.deckingLaborPerSheet=2500;
  assert.equal(line(generateQuoteVNext(materialOnly),'Decking replacement').amountCents,30000);
  assert.equal(line(generateQuoteVNext(materialOnly),'Decking installation labor').amountCents,15000);
  assert.deepEqual(generateQuoteVNext(deckedRoof(3,{basis:'material_only'})).missingOwnerFields,['deckingLaborPerSheet']);
  // No labor portion: one story quotes; two stories go to review for it.
  assert.equal(line(generateQuoteVNext(deckedRoof(1,{labor:null})),'Decking replacement').amountCents,30000);
  const held=generateQuoteVNext(deckedRoof(2,{labor:null}));
  assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(held.missingOwnerFields,['installedLaborPercent.deckingPerSheet']);
  assert.equal(installedLaborFactorPath('ROOFING_REPLACEMENT',{stories:3},'deckingPerSheet'),'storyMultiplier.3');
  // The other roofing installed prices keep their rules (no change requested).
  assert.equal(installedLaborFactorPath('ROOFING_REPLACEMENT',{stories:3},'valleyPerLF'),null);
});
// The v29 flat roof: access easy / moderate / difficult = 1 / 1.25 / 1.5.
const DETAILS={flatRoofDeckPerSheet:[9500,60,'deckSheets',4,'Deck replacement'],flatRoofEdgeMetalPerLF:[1000,40,'edgeMetalLF',20,'Perimeter edge metal or coping'],flatRoofWallFlashingPerLF:[1500,50,'wallFlashingLF',10,'Wall and parapet base flashing'],
  flatRoofPenetrationEach:[5000,70,'penetrationCount',2,'Pipe flashings and other penetrations'],flatRoofCurbEach:[20000,50,'curbCount',1,'Curbs'],flatRoofDrainEach:[30000,50,'drainCount',1,'Drains']};
function detailedFlatRoof(access,{omitShare}={}){
  const f=corpus('v29:flat-roof-installed-insulation-difficult-access'),p=f.ownerPricing.pricing;
  p.flatRoofDeckPriceBasis='installed';p.installedLaborPercent={...p.installedLaborPercent};p.installedMaterialsPercent={...(p.installedMaterialsPercent||{})};
  for(const [rate,[price,labor,field,quantity]] of Object.entries(DETAILS)){p[rate]=price;if(rate!==omitShare){p.installedLaborPercent[rate]=labor;if(rate!=='flatRoofDeckPerSheet')p.installedMaterialsPercent[rate]=100-labor;}f.customerInputs[field]=quantity;}
  f.customerInputs.accessDifficulty=access;
  return f;
}
test('1: flat-roof deck replacement and every flat-roof detail take site access on their labor portion',()=>{
  assert.deepEqual(corpus('v29:flat-roof-installed-insulation-difficult-access').ownerPricing.pricing.accessMultiplier,{easy:1,moderate:1.25,difficult:1.5});
  // Written before execution (amount x (1 - labor + labor x factor)):
  //   deck 4 x 95.00 = 380.00, labor 60%: easy 380.00; moderate 380 x 1.15 = 437.00; difficult 380 x 1.30 = 494.00.
  //   edge metal 20 x 10.00 = 200.00, labor 40%: moderate 200 x 1.10 = 220.00; difficult 200 x 1.20 = 240.00.
  //   wall flashing 10 x 15.00 = 150.00, labor 50%: moderate 150 x 1.125 = 168.75; difficult 150 x 1.25 = 187.50.
  //   penetrations 2 x 50.00 = 100.00, labor 70%: moderate 100 x 1.175 = 117.50; difficult 100 x 1.35 = 135.00.
  //   curb 200.00, labor 50%: moderate 225.00; difficult 250.00. Drain 300.00, labor 50%: moderate 337.50; difficult 375.00.
  const expected={easy:[38000,20000,15000,10000,20000,30000],moderate:[43700,22000,16875,11750,22500,33750],difficult:[49400,24000,18750,13500,25000,37500]};
  for(const [access,amounts] of Object.entries(expected)){
    const q=generateQuoteVNext(detailedFlatRoof(access));assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',access);
    assert.deepEqual(Object.values(DETAILS).map(([, , , ,name])=>line(q,name).amountCents),amounts,access);
  }
  // A detail with no labor portion: easy access quotes, other access goes to review for it.
  assert.equal(generateQuoteVNext(detailedFlatRoof('easy',{omitShare:'flatRoofDrainEach'})).resultType,'INSTANT_ESTIMATE_READY');
  const held=generateQuoteVNext(detailedFlatRoof('moderate',{omitShare:'flatRoofDrainEach'}));
  assert.equal(held.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(held.missingOwnerFields,['installedLaborPercent.flatRoofDrainEach']);
  // A material-only deck is not an installed price and is not adjusted: 380.00 at difficult access.
  // Fix B2 (Lane B, November 19, 2026): its installation labor is priced per sheet with
  // the same access adjustment: 4 sheets x 20.00 x 1.5 = 120.00.
  const g=detailedFlatRoof('difficult');g.ownerPricing.pricing.flatRoofDeckPriceBasis='material_only';delete g.ownerPricing.pricing.installedLaborPercent.flatRoofDeckPerSheet;
  g.ownerPricing.pricing.flatRoofDeckLaborPerSheet=2000;
  assert.equal(line(generateQuoteVNext(g),'Deck replacement').amountCents,38000);
  assert.equal(line(generateQuoteVNext(g),'Decking installation labor').amountCents,12000);
});
test('1: readiness lists installed decking and flat-roof details that still need a labor portion; the service stays live',()=>{
  const roof=deckedRoof(1,{labor:null}),flat=detailedFlatRoof('easy',{omitShare:'flatRoofDrainEach'});
  for(const [f,expectedSelections,field] of [[roof,[{stories:2},{stories:3}],'installedLaborPercent.deckingPerSheet'],[flat,[{accessDifficulty:'moderate'},{accessDifficulty:'difficult'}],'installedLaborPercent.flatRoofDrainEach']]){
    const status=vNextServiceStatus({...f.ownerPricing,active:true},f.businessDefaults);
    const rows=status.laborAdjustmentCoverage.filter(row=>row.missingOwnerFields.includes(field));
    assert.deepEqual(rows.map(row=>row.selection),expectedSelections,field);
  }
  // The owner's price-book warning lists them too.
  const meta={customerFields:[]};
  assert.match(laborPortionReviewRows(roof.ownerPricing,meta).join(' | '),/Installed decking replacement: Stories 2, 3/);
  assert.match(laborPortionReviewRows(flat.ownerPricing,meta).join(' | '),/Drains: Access difficulty Moderate, Difficult/);
});

// ---------------------------------------------------------------------------
// Findings 2 and 3: labels that start a sentence or name a quote line start with a capital
// ---------------------------------------------------------------------------
test('2: flooring and roof underlayment scope labels start with a capital',()=>{
  const floor=scopeDefinitions('FLOORING_INSTALL',{});
  assert.deepEqual(['hardwood','laminate','carpet','vinyl_plank','tile'].map(f=>floor['floor_underlayment_'+f].label),
    ['Hardwood underlayment','Laminate underlayment','Carpet underlayment','Vinyl plank underlayment','Tile backer board or uncoupling membrane']);
  assert.equal(scopeDefinitions('ROOFING_REPLACEMENT',{underlaymentPriceBasis:{asphalt_shingle:'cost'}}).roof_underlayment_asphalt_shingle.label,'Asphalt shingle roof underlayment');
  // The customer's terms: "... Carpet underlayment: [SYNTHETIC] Pad." (frozen input v30).
  const q=generateQuoteVNext(corpus('v30:r01-yard-option-inherits-foot-carpet-prices'));
  assert.match(q.disclaimer,/Carpet underlayment: \[SYNTHETIC\] Pad\./);assert.doesNotMatch(q.disclaimer,/carpet underlayment:/);
});
test('3: painting preparation lines by surface condition start with a capital, on the quote and in the editor',()=>{
  const f=offeringFixture('INTERIOR_PAINTING','itemized'),p=f.ownerPricing.pricing;
  const labels=offeringRateDefinitions('INTERIOR_PAINTING',p);
  for(const condition of ['good','fair','poor']){
    const word=condition[0].toUpperCase()+condition.slice(1);
    assert.equal(labels['prepLaborPerSqft_'+condition].label,word+' surface preparation labor');
    assert.equal(labels['prepMaterialPerSqft_'+condition].label,word+' surface preparation materials');
  }
  // A poor-condition job on an offering defined for fair condition uses the poor prices.
  Object.assign(p.offeringRates,{prepLaborPerSqft_poor:50,prepMaterialPerSqft_poor:20});f.customerInputs.surfaceCondition='poor';
  const q=generateQuoteVNext(f);
  assert.ok(line(q,'Poor surface preparation labor'),JSON.stringify(q.lineItems?.map(l=>l.name)||q.reviewReason));
  assert.ok(line(q,'Poor surface preparation materials'));
});

// ---------------------------------------------------------------------------
// Finding 7: the tax sentence follows the tax charged
// ---------------------------------------------------------------------------
test('7: a job that charges no tax says "No tax added."; one that charges tax says "Includes applicable tax."',()=>{
  // Materials-only tax, an Ontario business, a Quebec labor-only job (nothing taxable): tax 0.
  const none=generateQuoteVNext(corpus('v35:item4-quebec-job-nothing-taxed-no-rate'));
  assert.equal(mid(none).tax.taxCents,0);assert.equal(none.taxTreatment,'No tax added.');assert.match(none.disclaimer,/No tax added\./);assert.doesNotMatch(none.disclaimer,/Includes applicable tax/);
  // Materials-only tax at 13%, materials taxable, a 200 sq ft tile job in Ontario: 1,120.00 x 0.13 = 145.60.
  const taxed=corpus('v35:item4-quebec-job-materials-taxed-no-rate');taxed.customerInputs.postalCode='M5V 2T6';
  const q=generateQuoteVNext(taxed);assert.equal(mid(q).tax.taxCents,14560);assert.equal(q.taxTreatment,'Includes applicable tax.');
  // No tax mode: unchanged.
  const flat=corpus('v35:item4-quebec-job-nothing-taxed-no-rate');flat.businessDefaults.taxMode='TAX_NONE';flat.businessDefaults.taxPercent=0;
  assert.equal(generateQuoteVNext(flat).taxTreatment,'No tax added.');
  // All 15 frozen inputs the audit listed now say "No tax added."; none still claims tax with $0 charged.
  let wrong=0;
  for(const r of corpusInputs()){let o;try{o=generateQuoteVNext(withLaneDAnswers(r.input));}catch{continue;}
    for(const option of o.options||[]){const taxes=Object.values(option.calculationRecord?.scenarios||{}).map(s=>s?.tax?.taxCents??0);
      if(option.taxTreatment==='Includes applicable tax.'&&taxes.every(t=>t===0))wrong++;
      if(option.taxTreatment==='No tax added.'&&taxes.some(t=>t>0))wrong++;}}
  assert.equal(wrong,0);
});

// ---------------------------------------------------------------------------
// Findings 4, 5 and 6: the price book shows words, not stored values
// ---------------------------------------------------------------------------
test('4: price-book choices show words for every option',()=>{
  const meta=bridge.applicationMetadata();
  const field=(type,name)=>meta.services.find(s=>s.serviceType===type).fields.find(f=>f.field===name);
  const expected={
    accessoryPricingMode:['ROOFING_REPLACEMENT',{per_square_allin:'Accessories included in the all-in material price',itemized:'Price starter, drip edge, and ridge cap separately'}],
    materialAccessoryBasis:['ROOFING_REPLACEMENT',{excludes_itemized_accessories:'Excludes starter, drip edge and ridge cap',excludes_itemized_accessories_flashing_vents:'Excludes starter, drip edge, ridge cap, flashing and vents'}],
    deckingPriceBasis:['ROOFING_REPLACEMENT',{material_only:'Material only',installed:'Installed price'}],
    iceWaterBarrierUnit:['ROOFING_REPLACEMENT',{square_feet:'Square feet',linear_feet:'Linear feet'}],
    // Fix B9 (Lane B, November 19, 2026): band labels name where each band starts and ends.
    unknownPitchBand:['ROOFING_REPLACEMENT',{under_four:'Under 4/12 — low slope, nearly flat',up_to_six:'4/12 up to 6/12 — walkable roof',seven_to_nine:'Over 6/12 up to 9/12 — steep roof',ten_to_twelve:'Over 9/12 up to 12/12 — very steep roof',over_twelve:'Over 12/12 — special steep work'}],
    vinylPlankUnderlaymentRule:['FLOORING_INSTALL',{always_included:'Always included',never_included:'Never included',subfloor_condition:'Depends on the subfloor condition',customer_selectable_addon:'Customer can select this extra',owner_review:'Owner review'}]
  };
  for(const [name,[type,labels]] of Object.entries(expected)){
    const f=field(type,name);assert.deepEqual(f.optionLabels,labels,name);
    for(const option of f.options)assert.notEqual(f.optionLabels[option],keyLabel(option),name+' '+option);
  }
  assert.deepEqual(field('FLOORING_REPLACEMENT','vinylPlankUnderlaymentRule').optionLabels,expected.vinylPlankUnderlaymentRule[1]);
  // The unknown-pitch choices are the customer's pitch answers word for word.
  const roof=corpus('v29:priced-roofing-earlier-rules');
  const customer=bridge.applicationServiceDefinition({...roof.ownerPricing,id:'synthetic'}).customerFields?.find?.(f=>f.name==='pitchBand');
  if(customer?.optionLabels)for(const [key,label] of Object.entries(expected.unknownPitchBand[1]))assert.equal(customer.optionLabels[key],label,key);
});
test('5: price-book help text has no stored keys',()=>{
  const text=JSON.stringify(bridge.applicationMetadata());
  for(const raw of ['per_square_allin mode','itemized mode','excludes_itemized_accessories only','materialAccessoryBasis confirmation'])assert.ok(!text.includes(raw),raw);
  const meta=bridge.applicationMetadata().services.find(s=>s.serviceType==='ROOFING_REPLACEMENT');
  assert.match(meta.fields.find(f=>f.field==='materialAccessoryBasis').help,/^Choose "Excludes starter, drip edge and ridge cap" only after checking/);
});
test('6: "Price dates and sources" names each price by its field and product, not its stored path',async()=>{
  const meta=bridge.applicationMetadata(),m=type=>meta.services.find(s=>s.serviceType===type);
  // Written before execution: the field label (closing period dropped), then each key's name.
  assert.equal(priceEntryTitle('laborPerSqft.vinyl',{serviceType:'FLOORING_INSTALL',pricing:{}},m('FLOORING_INSTALL')),'Labor price per square foot by flooring type · Vinyl');
  assert.equal(priceEntryTitle('mulchMaterialPerYard.brown',{serviceType:'LANDSCAPING_PLANTING',pricing:{}},m('LANDSCAPING_PLANTING')),'Mulch material price per cubic yard by mulch type · Brown');
  assert.equal(priceEntryTitle('repairMaterialAllowance.asphalt_shingle.shingle_patch.small',{serviceType:'ROOFING_REPAIR',pricing:{}},m('ROOFING_REPAIR')),'Roof repair material allowance by repair type and project size · Asphalt shingle · Shingle patch · Small');
  assert.equal(priceEntryTitle('materialPerSqft.n__332d746162',{serviceType:'FLOORING_INSTALL',pricing:{}},m('FLOORING_INSTALL')),'Material price per square foot by flooring type · 3-tab');
  for(const title of [priceEntryTitle('debrisPricing.moderate.disposal_flat',{serviceType:'LANDSCAPING_CLEANUP',pricing:{}},m('LANDSCAPING_CLEANUP'))])assert.ok(!/\.[a-z]/i.test(title)&&!title.includes('_'),title);
  const source=await readFile(new URL('../client/src/pricebook.jsx',import.meta.url),'utf8');
  assert.ok(!source.includes('humanPricingKey(entry.path)'));
  assert.match(source,/<span className="owner-field-title">\{entry\.tierName\?entry\.tierName\+' · ':''\}\{priceEntryTitle\(entry\.path,selected,selectedMeta\)\}<\/span>/);
});

// ---------------------------------------------------------------------------
// Finding 8: the new frozen inputs, hand-checked where the audit worked them
// ---------------------------------------------------------------------------
import {readFileSync} from 'node:fs';
const ADDITIONS=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261118b.json',import.meta.url),'utf8'));
const added=id=>filled(withLaneDAnswers(ADDITIONS.find(r=>r.id===id).input));
const byRate=(q,path)=>q.lineItems.filter(l=>l.calculation?.ratePath===path).reduce((sum,l)=>sum+l.amountCents,0);
test('8: the fully configured concrete patio matches hand math',()=>{
  // Written before execution. 20 x 10 ft, 4 in: 200 x (4/12) / 27 = 2.4691 yd; with 10% waste 2.7160 yd.
  //   Ready mix ordered in 0.5 yd steps: 3.0 yd x 180.00 = 540.00.
  //   Short load under 5 yd, on the ordered quantity ("after the ready-mix order increment",
  //   the threshold's definition): (5 - 3.0) x 50.00 = 100.00. (First written as (5 - 2.7160) x 50.00
  //   = 114.20, from the audit's wording; the field's definition decides.)
  //   Saw cuts at 10 ft spacing on 20 x 10: one 10 ft joint x 1.50 = 15.00.
  //   Gravel base: 200 x 4/12 / 27 x 1.2 = 2.9630 yd x 45.00 = 133.33. Excavation and grading: 200 x 1.20 = 240.00.
  //   Forming on open edges only: 60 - 20 adjoining = 40 ft x 2.00 = 80.00. Isolation joint: 20 ft x 3.00 = 60.00.
  //   Rebar on area plus 10%: 220 x 2.00 = 440.00. Pump: 500.00 flat + 3.0 yd ordered x 20.00 = 60.00
  //   ("ready-mix quantity after waste and the order increment"; first written as 2.7160 yd = 54.32).
  const q=generateQuoteVNext(added('v36:concrete-patio-full-rebar-pump'));
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  const expected={concreteCostPerCubicYard:54000,shortLoadPerYard:10000,sawCutPerLF:1500,baseGravelPerCubicYard:13333,baseExcavationGradingPerSqft:24000,formingLaborPerLF:8000,isolationJointPerLF:6000,rebarReinforcementPerSqft:44000,'placementFlat.pump':50000,'placementPerCubicYard.pump':6000};
  const actual=Object.fromEntries(Object.keys(expected).map(path=>[path,byRate(q,path)]));
  assert.deepEqual(actual,expected,JSON.stringify(q.lineItems.map(l=>[l.name,l.calculation?.ratePath,l.amountCents])));
});
test('8: the new frozen inputs quote (or go to review where intended)',()=>{
  const review=new Set(['v36:flat-roof-drain-no-labor-portion-moderate','v36:roof-installed-decking-no-labor-portion-stories-2']);
  // Fix B2 (Lane B, November 19, 2026): material-only decking (chosen or blank basis)
  // needs its installation labor price, which these frozen inputs do not have.
  const deckingLabor=new Set(['v36:roof-material-only-decking-stories-3','v36:roof-bundles-per-square']);
  assert.ok(ADDITIONS.length>=30);
  for(const r of ADDITIONS){
    const q=generateQuoteVNext(filled(withLaneDAnswers(r.input)));
    assert.equal(q.resultType,review.has(r.id)||deckingLabor.has(r.id)?'ESTIMATE_REQUIRES_REVIEW':'INSTANT_ESTIMATE_READY',r.id);
    if(deckingLabor.has(r.id))assert.deepEqual(q.missingOwnerFields,['deckingLaborPerSheet'],r.id);
  }
});
test('8: a second existing flat-roof layer adds its tear-off at the additional-layer factor',()=>{
  // Written before execution: 1,000 sq ft, tear-off 2.00 per sq ft, factor 0.5: the second layer adds
  // 1,000 x 2.00 x 0.5 = 1,000.00 over the one-layer roof (18,230.00 -> 19,230.00 at easy access).
  const one=generateQuoteVNext(added('v36:flat-roof-every-detail-installed-deck-easy')),two=generateQuoteVNext(added('v36:flat-roof-two-layers-additional-layer-factor'));
  assert.equal(two.options[0].calculationRecord.scenarios.mid.finalTotalCents-one.options[0].calculationRecord.scenarios.mid.finalTotalCents,100000);
  assert.equal(one.midEstimate,18230);
});
