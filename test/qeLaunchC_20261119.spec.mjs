import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,concrete,mowing} from '../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,validateTierDefinitionsDetailedVNext,customerContractForVNext,vNextServiceStatus} from '../server/quote-engine-vnext/index.js';
import {controlJointLength,readyMixUnitPresentationCopy,FIELD_COPY,winterMonthApplies} from '../server/quote-engine-vnext/concreteLandscapePricing.js';
import {exactToNumber} from '../server/quote-engine-vnext/exactMath.js';
import {applicationMetadata,applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';
import {moneyKindForField,ownerMoneyEntries,dollarAmountToCents} from '../server/priceBookMoney.js';
import {validateInterviewValue} from '../server/src/priceBookAI.js';
import {editReadyMixUnit} from '../client/src/pricebookEditing.js';

// Lane C launch fixes (2026-11-19): concrete and landscaping. Every expected
// value is worked by hand in the comment above its assertion.
const quote=f=>generateQuoteVNext(f);
const ready=f=>{const q=quote(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.invalidOwnerFields,q.missingCustomerFields,q.invalidCustomerFields,q.validationMessages]));return q.options[0];};
const line=(o,name)=>o.calculationRecord.lineItems.find(l=>l.name===name);
const cents=(o,name)=>line(o,name)?.amountCents;
// A 20 x 10 ft, 4 in patio on the shared fixture: chute reaches, no base.
const slab=(pricing={},inputs={})=>{const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',baseNeeded:false},inputs);Object.assign(f.ownerPricing.pricing,pricing);for(const [k,v] of Object.entries(inputs))if(v===undefined)delete f.customerInputs[k];return f;};
const areaPerimeter=(areaSqft,perimeterLF)=>({dimensionMethod:'measured_area_perimeter',areaSqft,perimeterLF,length:undefined,width:undefined});
const JOINTS={controlJointPricing:'excluded',controlJointSpacingFt:10,sawCutPerLF:800};

test('C1 saw cuts: area and perimeter lay joints on the solved rectangle; the square stays only when no rectangle fits',()=>{
  // Defect: 4 x 25 ft as length and width: panels 5 x 1 at 10 ft: (5-1)*4 + (1-1)*25 = 16 LF; 16 * 800 = 12800 cents.
  // As 100 sq ft and 58 LF: length + width = 29, length * width = 100: 25 and 4, the same 16 LF and 12800 cents.
  let o=ready(slab(JOINTS,{length:25,width:4}));assert.equal(line(o,'Saw-cut control joints').calculation.quantity,16);assert.equal(cents(o,'Saw-cut control joints'),12800);
  o=ready(slab(JOINTS,areaPerimeter(100,58)));assert.equal(line(o,'Saw-cut control joints').calculation.quantity,16);assert.equal(cents(o,'Saw-cut control joints'),12800);
  assert.match(o.disclaimer,/16\.00 linear feet\. The control-joint length is an allowance based on a rectangle with the same area and perimeter and will be confirmed on site\./);
  // Irrational sides: 120 sq ft and 50 LF: h = 25, sides (25 +/- sqrt145)/2 = 18.5208 and 6.4792.
  // Panels: ceil(18.52/10) = 2 along the length, 1 across; 2*18.52*1/(3*6.48) = 1.906 -> 2 stays.
  // Joints (2-1)*6.479203 + 0 = 6.479203 -> 6.48 LF (rounded once); 6.48 * 800 = 5184 cents.
  o=ready(slab(JOINTS,areaPerimeter(120,50)));assert.equal(line(o,'Saw-cut control joints').calculation.quantity,6.48);assert.equal(cents(o,'Saw-cut control joints'),5184);
  // Boundary, no rectangle: 400 sq ft and 76 LF: 38^2 = 1444 < 4*400 = 1600. Square side 20: ceil(sqrt(400/100)) - 1 = 1 cut
  // each way: 2 * 1 * 20 = 40 LF; 40 * 800 = 32000 cents; the square note stays.
  o=ready(slab(JOINTS,areaPerimeter(400,76)));assert.equal(line(o,'Saw-cut control joints').calculation.quantity,40);assert.equal(cents(o,'Saw-cut control joints'),32000);assert.match(o.disclaimer,/based on a square of the same area/);
  // Boundary, square slab: 100 sq ft and 40 LF solve to 10 x 10 (discriminant 0): one panel each way, 0 LF, no line.
  o=ready(slab(JOINTS,areaPerimeter(100,40)));assert.equal(line(o,'Saw-cut control joints'),undefined);
  // Every rational rectangle gives the length-and-width layout exactly (30x20 = 70, 12x18 = 30, 13.5x7.25, 41x9).
  for(const [L,W] of [[30,20],[12,18],[13.5,7.25],[41,9],[4,25]]){
    const exact=controlJointLength({dimensionMethod:'exact',length:L,width:W},L*W,10).quantity,solved=controlJointLength({dimensionMethod:'measured_area_perimeter',areaSqft:L*W,perimeterLF:2*(L+W)},L*W,10).quantity;
    assert.equal(exactToNumber(solved),exactToNumber(exact),L+'x'+W);
  }
  assert.match(FIELD_COPY.controlJointSpacingFt.help,/uses the rectangle with that area and perimeter, or a square of the same area when no rectangle has them/);
});

test('C2 thickened edge adds (perimeter*w - 4*w^2)*extra depth before waste and the order increment; blank adds none',()=>{
  const edge={thickenedEdgeExtraDepthInches:4,thickenedEdgeWidthInches:12,concreteWasteFactor:0};
  // Defect check: 20 x 20 ft, 4 in slab, 1 ft edge 4 in deeper, no waste: 400*4/324 = 400/81 plus (80 - 4)*4/324 = 76/81:
  // 476/81 = 5.876543 cu yd; * 18000 = 105777.78 -> 105778 cents.
  let o=ready(slab(edge,{length:20,width:20}));assert.equal(line(o,'Ready-mix concrete').calculation.quantity,476/81);assert.equal(cents(o,'Ready-mix concrete'),105778);
  // Waste applies to the total: 476/81 * 1.10 = 6.464198 cu yd * 18000 = 116355.56 -> 116356 cents.
  o=ready(slab({...edge,concreteWasteFactor:0.1},{length:20,width:20}));assert.equal(cents(o,'Ready-mix concrete'),116356);
  // Order increment applies to the total: 6.464198 rounds up to 6.5 cu yd * 18000 = 117000 cents.
  o=ready(slab({...edge,concreteWasteFactor:0.1,readyMixOrderIncrementCubicYards:0.5},{length:20,width:20}));assert.equal(line(o,'Ready-mix concrete').calculation.quantity,6.5);assert.equal(cents(o,'Ready-mix concrete'),117000);
  // Boundary: a 20 x 2 ft walk with an 18 in edge (wider than half the 2 ft width) thickens the whole 40 sq ft:
  // 40*4/324 + 40*4/324 = 320/324 = 0.987654 cu yd * 18000 = 17777.78 -> 17778 cents (the formula alone would give 57 sq ft).
  o=ready(slab({...edge,thickenedEdgeWidthInches:18},{length:20,width:2}));assert.equal(cents(o,'Ready-mix concrete'),17778);
  // Unchanged: blank adds nothing: 400*4/324 = 4.938272 * 18000 = 88888.89 -> 88889 cents; labor is not changed by the edge.
  o=ready(slab({concreteWasteFactor:0},{length:20,width:20}));assert.equal(cents(o,'Ready-mix concrete'),88889);
  const withEdge=ready(slab(edge,{length:20,width:20}));assert.equal(cents(withEdge,'Concrete labor'),cents(o,'Concrete labor'));
  // Only one of the two set is an owner setting error, never a guess.
  const q=quote(slab({thickenedEdgeExtraDepthInches:4},{length:20,width:20}));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(JSON.stringify(q).includes('thickenedEdgeWidthInches'));
  // The customer is asked nothing new.
  const fields=Object.keys(customerContractForVNext('CONCRETE_PATIO_SLAB',slab(edge).ownerPricing.pricing).fields);assert.ok(!fields.some(name=>/thicken/i.test(name)));
});

test('C3 short-load order-size bands: the smallest band holding the order pays its charge once; larger orders pay none',()=>{
  const bands={readyMixUnit:'cubic_metre',readyMixOrderIncrementCubicYards:0.25,shortLoadBands:{small_loads:{upToQuantity:2,charge:15000},medium_loads:{upToQuantity:4,charge:10000}},partialPackagePricing:undefined};
  // 10 x 10 x 4 in: 100*4/324*1.10 = 1.358025 cu yd * 0.764554857984 = 1.038283 m3 -> 1.25 m3 (0.25 steps) <= 2: 15000 cents.
  let o=ready(slab(bands,{length:10,width:10}));assert.equal(line(o,'Ready-mix concrete').calculation.quantity,1.25);assert.equal(cents(o,'Supplier short-load charge'),15000);
  // Boundary at the limit: 18 x 10: 180*4/324*1.10 = 2.444444 cu yd = 1.868912 m3 -> 2.0 m3, inclusive: 15000 cents.
  o=ready(slab(bands,{length:18,width:10}));assert.equal(line(o,'Ready-mix concrete').calculation.quantity,2);assert.equal(cents(o,'Supplier short-load charge'),15000);
  // Just over: 20 x 10: 2.716049 cu yd = 2.076569 m3 -> 2.25 m3: medium band 10000 cents.
  o=ready(slab(bands,{length:20,width:10}));assert.equal(line(o,'Ready-mix concrete').calculation.quantity,2.25);assert.equal(cents(o,'Supplier short-load charge'),10000);
  // Above every band: 40 x 20: 10.864198 cu yd = 8.306275 m3 -> 8.5 m3: no charge.
  o=ready(slab(bands,{length:40,width:20}));assert.equal(line(o,'Supplier short-load charge'),undefined);
  // Unchanged: the flat fee below a threshold: 220/81 = 2.716049 cu yd < 3: 15000 cents once.
  o=ready(slab({shortLoadThresholdCubicYards:3,shortLoadFlatFee:15000}));assert.equal(cents(o,'Supplier short-load charge'),15000);
  // Unchanged: per yard short: (3 - 220/81) * 5000 = 0.283951 * 5000 = 1419.75 -> 1420 cents.
  o=ready(slab({shortLoadThresholdCubicYards:3,shortLoadPerYard:5000}));assert.equal(cents(o,'Supplier short-load charge'),1420);
  // One short-load charge only: bands with a flat fee is an owner setting error.
  const q=quote(slab({...bands,shortLoadThresholdCubicYards:3,shortLoadFlatFee:15000},{length:10,width:10}));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
  // Each band charge is a whole-cent fixed amount: $150 saved as 15000 cents; its limit is a quantity and is not converted.
  const service={...slab(bands).ownerPricing,pricing:{...slab(bands).ownerPricing.pricing,shortLoadBands:{small_loads:{upToQuantity:2,charge:15000}}}};
  assert.deepEqual(ownerMoneyEntries(service).filter(e=>e.path.startsWith('shortLoadBands')).map(e=>[e.path,e.value,e.kind,e.category]),[['shortLoadBands.small_loads.charge',15000,'fixed_amount','material']]);
  const meta=applicationMetadata().services.find(s=>s.serviceType==='CONCRETE_PATIO_SLAB').fields.find(f=>f.field==='shortLoadBands');
  assert.equal(meta.type,'json');assert.deepEqual(meta.tree.leafMoneyKinds,{charge:'fixed_amount'});
  // The AI interview accepts a band table in dollars and keeps its limits.
  assert.deepEqual(validateInterviewValue('CONCRETE_PATIO_SLAB','shortLoadBands',{'Small loads':{upToQuantity:2,charge:150}}),{small_loads:{upToQuantity:2,charge:150}});
  assert.equal(dollarAmountToCents(150,{kind:'fixed_amount'}),15000);
});

test('C4 the placement flat charge is per job, charged once, unchanged in amount',()=>{
  const meta=applicationMetadata().services.find(s=>s.serviceType==='CONCRETE_PATIO_SLAB').fields;
  assert.equal(meta.find(f=>f.field==='placementFlat').label,'Placement flat charge ($ per job)');
  assert.equal(meta.find(f=>f.field==='shortLoadFlatFee').label,'Short-load flat fee ($ per job)');
  // Pump flat 150000 cents once; 1.0 placement line; by volume 220/81 cu yd * 2000 = 5432.10 -> 5432 cents.
  const o=ready(slab({placementFlat:{pump:150000},placementPerCubicYard:{pump:2000}},{chuteAccess:'no',placementMethod:'pump'}));
  assert.equal(cents(o,'Pump placement flat charge'),150000);assert.equal(cents(o,'Pump placement by volume'),5432);
  assert.equal(o.calculationRecord.lineItems.filter(l=>/placement flat charge/.test(l.name)).length,1);
});

test('C5 cubic metres: exact conversion, rounded only at the line; Canadian businesses default to cubic metres',()=>{
  // 100 x 100 ft, 4 in, 10% waste: 10000*4/324*1.10 = 11000/81 cu yd = 135.802469 cu yd.
  // At $200 per m3: 11000/81 * 0.764554857984 * 20000 = 168202068.75648/81 = 2076568.75 -> 2076569 cents.
  // At the exact per-yard equivalent 15291.09715968 cents: 11000*15291.09715968/81 = 2076568.75 -> 2076569 cents (the same).
  // Rounding the per-yard price first to $152.91 would give 11000*15291/81 = 2076555.56 -> 2076556 cents, which it must not.
  const metric=ready(slab({readyMixUnit:'cubic_metre',concreteCostPerCubicYard:20000},{length:100,width:100}));
  const yards=ready(slab({readyMixUnit:'cubic_yard',concreteCostPerCubicYard:15291.09715968},{length:100,width:100}));
  assert.equal(cents(metric,'Ready-mix concrete'),2076569);assert.equal(cents(yards,'Ready-mix concrete'),2076569);
  assert.equal(line(metric,'Ready-mix concrete').calculation.unit,'waste-adjusted cubic metres');assert.equal(line(yards,'Ready-mix concrete').calculation.unit,'waste-adjusted cubic yards');
  assert.ok(Math.abs(line(metric,'Ready-mix concrete').calculation.quantity-11000/81*0.764554857984)<1e-9);
  assert.ok(metric.calculationRecord.quantityDerivations.some(d=>d.name==='concreteVolumeCubicMetres'&&d.unit==='cubic metres'));
  // Blank unit, Canadian business: 220/81 cu yd = 2.076569 m3 * 18000 = 37378.24 -> 37378 cents; US or unknown: 220/81 * 18000 = 48888.89 -> 48889.
  const ca=slab();ca.businessDefaults.businessCountry='CA';
  assert.deepEqual(quote(ca).missingOwnerFields,['readyMixUnit']);
  ca.ownerPricing.pricing.readyMixUnit='cubic_metre';assert.equal(cents(ready(ca),'Ready-mix concrete'),37378);
  const us=slab();us.businessDefaults.businessCountry='US';assert.equal(cents(ready(us),'Ready-mix concrete'),48889);
  assert.equal(cents(ready(slab()),'Ready-mix concrete'),48889);
  // The increment, threshold and per-unit fee are in m3: 2.076569 -> 2.5 m3 (0.5 steps): 2.5*20000 = 50000; short 3 - 2.5 = 0.5 m3 * 5000 = 2500 cents.
  const o=ready(slab({readyMixUnit:'cubic_metre',concreteCostPerCubicYard:20000,readyMixOrderIncrementCubicYards:0.5,shortLoadThresholdCubicYards:3,shortLoadPerYard:5000,partialPackagePricing:undefined}));
  assert.equal(line(o,'Ready-mix concrete').calculation.quantity,2.5);assert.equal(cents(o,'Ready-mix concrete'),50000);assert.equal(cents(o,'Supplier short-load charge'),2500);
  assert.equal(line(o,'Supplier short-load charge').calculation.unit,'cubic metres short of supplier threshold');
  // Placement stays priced per cubic yard ordered: 2.5 m3 = 2.5/0.764554857984 = 3.269884 cu yd * 1000 = 3269.88 -> 3270 cents.
  const p=ready(slab({readyMixUnit:'cubic_metre',concreteCostPerCubicYard:20000,readyMixOrderIncrementCubicYards:0.5,partialPackagePricing:undefined,placementPerCubicYard:{pump:1000}},{chuteAccess:'no',placementMethod:'pump'}));
  assert.equal(cents(p,'Pump placement by volume'),3270);
  // Owner labels follow the unit: blank for a Canadian business reads per cubic metre.
  const meta=applicationMetadata().services.find(s=>s.serviceType==='CONCRETE_PATIO_SLAB').fields;
  const label=(field,pricing,country)=>readyMixUnitPresentationCopy(meta.find(f=>f.field===field),'CONCRETE_PATIO_SLAB',pricing,country).label;
  assert.equal(label('concreteCostPerCubicYard',{},'CA'),'Ready-mix concrete material price per cubic metre');
  assert.equal(label('concreteCostPerCubicYard',{},'US'),'Ready-mix concrete material price per cubic yard');
  assert.equal(label('shortLoadPerYard',{readyMixUnit:'cubic_metre'},'US'),'Short-load fee ($ per cubic metre short)');
  assert.equal(label('winterConcreteChargePerUnit',{readyMixUnit:'cubic_metre'}),'Winter concrete charge ($ per cubic metre)');
  // The unit is set once for the service, never per price option.
  const tiered={...slab().ownerPricing,tiers:[{name:'Premium',overrides:{readyMixUnit:'cubic_metre'}}]};
  assert.ok(validateTierDefinitionsDetailedVNext(tiered,'CONCRETE_PATIO_SLAB').some(d=>d.path==='tiers.0.overrides.readyMixUnit'));
  // Changing the unit clears values entered in the old unit, base and price options; keeping the effective unit clears nothing.
  const service={serviceType:'CONCRETE_PATIO_SLAB',pricing:{concreteCostPerCubicYard:180,readyMixOrderIncrementCubicYards:0.5,laborPerSqft:6},tiers:[{name:'Premium',overrides:{concreteCostPerCubicYard:200,laborPerSqft:7}}]};
  const changed=editReadyMixUnit(service,'cubic_metre','US');
  assert.deepEqual(changed.pricing,{laborPerSqft:6,readyMixUnit:'cubic_metre'});assert.deepEqual(changed.tiers[0].overrides,{laborPerSqft:7});
  assert.deepEqual(editReadyMixUnit(service,'cubic_metre','CA').pricing,{...service.pricing,readyMixUnit:'cubic_metre'});
});

test('C6 winter concrete charge follows the work month; no month includes it with a note',()=>{
  const winter={winterConcreteChargePerUnit:1500,winterConcreteStart:'11-01',winterConcreteEnd:'04-15'};
  // 220/81 cu yd ordered * 1500 = 4074.07 -> 4074 cents.
  for(const month of ['january','november','april']){const o=ready(slab(winter,{workMonth:month}));assert.equal(cents(o,'Winter concrete charge'),4074,month);assert.match(o.disclaimer,/Includes the winter concrete charge for concrete poured from November 1 to April 15\./);}
  for(const month of ['may','july','october']){const o=ready(slab(winter,{workMonth:month}));assert.equal(line(o,'Winter concrete charge'),undefined,month);assert.doesNotMatch(o.disclaimer,/winter/i);}
  for(const inputs of [{},{workMonth:'not_sure'}]){const o=ready(slab(winter,inputs));assert.equal(cents(o,'Winter concrete charge'),4074);assert.match(o.disclaimer,/Includes the winter concrete charge because no work month was given\. The price is lower if the concrete is poured outside November 1 to April 15\./);}
  // Boundary: a period ending March 31 leaves April out; one starting April 30 brings April in (any day of the month counts).
  assert.equal(line(ready(slab({...winter,winterConcreteEnd:'03-31'},{workMonth:'april'})),'Winter concrete charge'),undefined);
  assert.equal(winterMonthApplies({winterConcreteStart:'04-30',winterConcreteEnd:'05-01'},4),true);assert.equal(winterMonthApplies({winterConcreteStart:'04-30',winterConcreteEnd:'05-01'},6),false);
  // In m3: 2.076569 m3 * 2000 = 4153.14 -> 4153 cents.
  assert.equal(cents(ready(slab({...winter,winterConcreteChargePerUnit:2000,readyMixUnit:'cubic_metre'},{workMonth:'january'})),'Winter concrete charge'),4153);
  // Unchanged: no charge set, no line and no work-month question.
  assert.equal(line(ready(slab({},{workMonth:'january'})),'Winter concrete charge'),undefined);
  const raw=s=>({serviceType:'CONCRETE_PATIO_SLAB',...s});
  assert.equal(applicationServiceDefinition(raw({pricing:slab().ownerPricing.pricing})).customerFields.some(f=>f.name==='workMonth'),false);
  const asked=applicationServiceDefinition(raw({pricing:slab(winter).ownerPricing.pricing})).customerFields.find(f=>f.name==='workMonth');
  assert.deepEqual(asked.details,['The winter concrete charge follows the month the concrete is poured. If you are not sure, it is included.']);
  // A charge in a price option alone also asks the month.
  assert.ok(applicationServiceDefinition(raw({pricing:slab().ownerPricing.pricing,tiers:[{name:'Winter',overrides:winter}]})).customerFields.some(f=>f.name==='workMonth'));
  // The charge needs its dates; a date must be a real month and day.
  assert.equal(quote(slab({winterConcreteChargePerUnit:1500,winterConcreteStart:'11-01'})).resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(quote(slab({...winter,winterConcreteEnd:'02-30'})).resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(validateInterviewValue('CONCRETE_PATIO_SLAB','winterConcreteStart','11-01'),'11-01');
  assert.throws(()=>validateInterviewValue('CONCRETE_PATIO_SLAB','winterConcreteStart','November 1'),/month and day/);
  assert.equal(moneyKindForField('CONCRETE_PATIO_SLAB','winterConcreteChargePerUnit'),'unit_rate');
});

test('C7 circle area and perimeter allow for rounding at the last decimal place',()=>{
  // 10 ft radius: 314.16 sq ft, 62.83 LF. (62.83+0.005)^2 = 3948.237 >= 4*pi*(314.16-0.005) = 3947.788: quotes.
  for(const perimeter of [62.83,62.84])assert.equal(quote(slab({},areaPerimeter(314.16,perimeter))).resultType,'INSTANT_ESTIMATE_READY',String(perimeter));
  // Boundary: 62.82: (62.825)^2 = 3946.981 < 3947.788: still impossible, review.
  const q=quote(slab({},areaPerimeter(314.16,62.82)));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(JSON.stringify(q),/physically impossible/);
  // Unchanged: a rectangle well above the bound quotes as before.
  assert.equal(quote(slab({},areaPerimeter(200,60))).resultType,'INSTANT_ESTIMATE_READY');
});

test('C8 combined base preparation takes slab access on its labor share; without the share an adjusted job goes to the owner',()=>{
  const base=(access,pricing={})=>{const f=concrete();Object.assign(f.customerInputs,{chuteAccess:'yes',accessDifficulty:access});Object.assign(f.ownerPricing.pricing,pricing);return f;};
  // Difficult 1.25, no share: missing owner setting, never a guess.
  const q=quote(base('difficult'));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.missingOwnerFields,['basePrepLaborPercent']);
  // Share 100%: 200 * 175 * (1 + 1.00 * 0.25) = 43750 cents, equal to itemized excavation and grading at 175: 200 * 175 * 1.25 = 43750.
  assert.equal(cents(ready(base('difficult',{basePrepLaborPercent:100})),'Base preparation'),43750);
  const itemized=base('difficult');delete itemized.ownerPricing.pricing.basePrepPerSqft;Object.assign(itemized.ownerPricing.pricing,{baseExcavationGradingPerSqft:175,baseDepthInches:4,baseCompactionAllowance:0.2});
  assert.equal(cents(ready(itemized),'Base excavation and grading'),43750);
  // Share 60%: 35000 * (1 + 0.60 * 0.25) = 35000 * 1.15 = 40250; moderate 1.1: 35000 * 1.06 = 37100.
  assert.equal(cents(ready(base('difficult',{basePrepLaborPercent:60})),'Base preparation'),40250);
  assert.equal(cents(ready(base('moderate',{basePrepLaborPercent:60})),'Base preparation'),37100);
  // Unchanged: easy access (1.0) needs no share: 200 * 175 = 35000.
  assert.equal(cents(ready(base('easy')),'Base preparation'),35000);
  // The price book lists the conditions that need the share and still quotes the rest.
  const coverage=vNextServiceStatus(base('easy').ownerPricing).laborAdjustmentCoverage;
  assert.deepEqual(coverage.map(r=>[r.selection.accessDifficulty,r.missingOwnerFields]),[['moderate',['basePrepLaborPercent']],['difficult',['basePrepLaborPercent']]]);
  assert.match(FIELD_COPY.basePrepLaborPercent.help,/\$1\.75 × \(1 \+ 0\.60 × 0\.25\) = \$2\.0125/);
});

const SOD={sodMaterialPerSqft:45,sodInstallLaborPerSqft:60,minimumServiceCharge:0,sodPalletSizeSqft:450};
const sod=(pricing,inputs)=>fixture('LANDSCAPING_SOD',{...SOD,...pricing},{sodSqft:2000,sqftMethod:'exact',groundPrepNeeded:true,existingLawnToRemove:true,slope:'steep',accessDifficulty:'difficult',...inputs});

test('C9 combined Ground preparation takes slope and access on its labor share',()=>{
  // Steep 1.35 * difficult 1.25 = 1.6875. No share: missing owner setting.
  const q=quote(sod({groundPrepPerSqft:50}));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.missingOwnerFields,['groundPrepLaborPercent']);
  // Share 100%: 2000 * 50 * 1.6875 = 168750 = itemized removal 2000*30*1.6875 = 101250 + grading 2000*20*1.6875 = 67500.
  assert.equal(cents(ready(sod({groundPrepPerSqft:50,groundPrepLaborPercent:100})),'Ground preparation'),168750);
  const split=ready(sod({sodRemovalPerSqft:30,sodGradingPerSqft:20}));assert.equal(cents(split,'Old-lawn removal with disposal')+cents(split,'Sod grading'),168750);
  // Share 60%: 100000 * (1 + 0.60 * 0.6875) = 100000 * 1.4125 = 141250.
  assert.equal(cents(ready(sod({groundPrepPerSqft:50,groundPrepLaborPercent:60})),'Ground preparation'),141250);
  // Unchanged: flat and easy (1.0) need no share: 2000 * 50 = 100000.
  assert.equal(cents(ready(sod({groundPrepPerSqft:50},{slope:'flat',accessDifficulty:'easy'})),'Ground preparation'),100000);
  // Sod installation labor is unchanged: 2000 * 60 * 1.6875 = 202500.
  assert.equal(cents(ready(sod({groundPrepPerSqft:50,groundPrepLaborPercent:60})),'Sod installation labor'),202500);
  const coverage=vNextServiceStatus(sod({groundPrepPerSqft:50}).ownerPricing).laborAdjustmentCoverage;
  assert.equal(coverage.length,8);assert.ok(coverage.every(r=>r.missingOwnerFields[0]==='groundPrepLaborPercent'));
});

test('C10 bare ground is graded only; the combined price is for a lawn to remove',()=>{
  // Bare ground, only the combined price: the separate grading price is an owner missing price.
  let q=quote(sod({groundPrepPerSqft:50,groundPrepLaborPercent:100},{existingLawnToRemove:false}));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.deepEqual(q.missingOwnerFields,['sodGradingPerSqft']);
  // Bare ground with separate prices: grading only, 2000 * 20 * 1.6875 = 67500; no removal line.
  let o=ready(sod({sodRemovalPerSqft:30,sodGradingPerSqft:20},{existingLawnToRemove:false}));assert.equal(cents(o,'Sod grading'),67500);assert.equal(line(o,'Old-lawn removal with disposal'),undefined);
  assert.match(o.disclaimer,/Included ground preparation: grading\./);assert.doesNotMatch(o.disclaimer,/old-lawn removal/);
  // Unchanged with a lawn: removal 101250 + grading 67500.
  o=ready(sod({sodRemovalPerSqft:30,sodGradingPerSqft:20}));assert.equal(cents(o,'Old-lawn removal with disposal'),101250);assert.equal(cents(o,'Sod grading'),67500);
  // The question is asked with ground preparation and is required then.
  q=quote(sod({sodRemovalPerSqft:30,sodGradingPerSqft:20},{existingLawnToRemove:undefined}));assert.deepEqual(q.missingCustomerFields,['existingLawnToRemove']);
  q=quote(sod({sodRemovalPerSqft:30,sodGradingPerSqft:20},{groundPrepNeeded:false}));assert.deepEqual(q.invalidCustomerFields,['existingLawnToRemove']);
  const field=customerContractForVNext('LANDSCAPING_SOD',sod({groundPrepPerSqft:50}).ownerPricing.pricing).fields.existingLawnToRemove;
  assert.equal(field.label,'Is there an existing lawn to remove?');assert.deepEqual(field.visibleWhen,[[['groundPrepNeeded','eq',true]]]);
  // Bare ground still takes the topsoil the customer's depth calls for: 2000*(4-3)/324 = 6.17284 cu yd * 3000 = 18518.52 -> 18519 cents.
  o=ready(sod({sodGradingPerSqft:20,topsoilPerCubicYard:3000,topsoilTargetDepthInches:4,topsoilWasteFactor:0},{existingLawnToRemove:false,usableTopsoilDepthInches:3}));assert.equal(cents(o,'Imported topsoil'),18519);
});

const cleanupPricing={cleanupBaseRatePerSqft:10,minimumServiceCharge:0,disposalPerBag:300,disposalPerLoad:6000,haulAwayFee:2500,slopeMultiplier:{flat:1,moderate:1.1,steep:1.25},debrisPricing:{light:{laborMultiplier:1,disposalFlat:5000},moderate:{laborMultiplier:1.2,disposalFlat:7500},heavy:{laborMultiplier:1.5,disposalFlat:10000}}};
const cleanup=inputs=>fixture('LANDSCAPING_CLEANUP',cleanupPricing,{yardSqft:1000,sqftMethod:'exact',debrisLevel:'light',slope:'flat',haulAway:false,...inputs});

test('C11 an explicit zero in the priced unit with no haul-away has no disposal line',()=>{
  // 0 bags, no haul-away: labor 1000 * 10 = 10000 only.
  let o=ready(cleanup({wasteBags:0}));assert.equal(line(o,'Debris disposal'),undefined);assert.equal(o.calculationRecord.scenarios.mid.finalTotalCents,10000);
  o=ready(cleanup({wasteLoads:0}));assert.equal(line(o,'Debris disposal'),undefined);
  // Both units answered 0: no disposal.
  o=ready(cleanup({wasteBags:0,wasteLoads:0}));assert.equal(line(o,'Debris disposal'),undefined);
  // Boundary: 0 bags with additional haul-away keeps the 5000 minimum plus the 2500 haul-away.
  o=ready(cleanup({wasteBags:0,haulAway:true}));assert.equal(cents(o,'Debris disposal'),5000);assert.equal(cents(o,'Additional haul-away'),2500);
  // Unchanged: 1 bag * 300 = 300 < 5000 minimum -> 5000; 30 bags * 300 = 9000.
  assert.equal(cents(ready(cleanup({wasteBags:1})),'Debris disposal'),5000);assert.equal(cents(ready(cleanup({wasteBags:30})),'Debris disposal'),9000);
  // Unchanged: no count: the minimum with the rest on site.
  assert.equal(cents(ready(cleanup({})),'Debris disposal'),5000);
});

test('C12 a lawn a riding mower cannot reach takes the owner multiplier on mowing labor, including a first visit',()=>{
  // Recurring: 5000 * 2 * 1 (weekly) * 1 (maintained) = 10000; No at 1.5: 15000.
  const mow=(multiplier,inputs={})=>{const f=mowing();if(multiplier!==undefined)f.ownerPricing.pricing.noRidingMowerLaborMultiplier=multiplier;Object.assign(f.customerInputs,inputs);return f;};
  assert.equal(cents(ready(mow(1.5,{ridingMowerReachesLawn:false})),'Mowing labor'),15000);
  assert.equal(cents(ready(mow(1.5,{ridingMowerReachesLawn:true})),'Mowing labor'),10000);
  // First visit on an overgrown lawn: 5000 * 2 * 1.5 (overgrown) * 1.5 = 22500 cents = $225; recurring visits 15000.
  const first=ready(mow(1.5,{ridingMowerReachesLawn:false,grassCondition:'overgrown'}));assert.equal(first.firstVisit.midEstimate,225);assert.equal(cents(first,'Mowing labor'),15000);
  // Boundary: a multiplier of 1 leaves labor at 10000.
  assert.equal(cents(ready(mow(1,{ridingMowerReachesLawn:false})),'Mowing labor'),10000);
  // Asked only when the owner set the multiplier; then it is required.
  assert.equal(customerContractForVNext('LANDSCAPING_MOWING',mow().ownerPricing.pricing).fields.ridingMowerReachesLawn.evidenceOnly,true);
  const shown=customerContractForVNext('LANDSCAPING_MOWING',mow(1.5).ownerPricing.pricing).fields.ridingMowerReachesLawn;assert.equal(shown.evidenceOnly,undefined);assert.equal(shown.label,'Can a riding mower reach the lawn?');
  assert.deepEqual(quote(mow(1.5)).missingCustomerFields,['ridingMowerReachesLawn']);
  // Unchanged: no multiplier, an answer is accepted and unused: 10000.
  assert.equal(cents(ready(mow(undefined,{ridingMowerReachesLawn:false})),'Mowing labor'),10000);
  // A multiplier below 1 is an owner setting error.
  assert.equal(quote(mow(0.5,{ridingMowerReachesLawn:false})).resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.ok(applicationMetadata().services.find(s=>s.serviceType==='LANDSCAPING_MOWING').fields.some(f=>f.field==='noRidingMowerLaborMultiplier'&&f.requiredAtBase===false));
});

test('C13 the mulch depth question asks for new mulch to add; quantities unchanged',()=>{
  assert.equal(customerContractForVNext('LANDSCAPING_MULCH',{}).fields.mulchDepth.label,'Depth of new mulch to add (inches)');
  // 324 sq ft at 1 in of new mulch: 324*1/324 = 1 cu yd installed; at 3 in: 3 cu yd.
  const mulch=depth=>fixture('LANDSCAPING_MULCH',{mulchMaterialPerYard:{brown:5000},mulchInstallLaborPerYard:3000,minimumServiceCharge:0,mulchOverageFactor:1},{inputMethod:'sqft',mulchArea:324,mulchDepth:depth,mulchType:'brown',bedCondition:'clean',edgingNeeded:false,accessDifficulty:'easy'});
  assert.equal(line(ready(mulch(1)),'Mulch installation labor').calculation.quantity,1);assert.equal(line(ready(mulch(3)),'Mulch installation labor').calculation.quantity,3);
});
