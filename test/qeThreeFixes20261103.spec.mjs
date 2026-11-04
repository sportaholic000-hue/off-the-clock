import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {flooring,custom,concrete,fixture} from '../verification/engine-independent/fixtures.mjs';
import {sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {discloseQuoteScope} from '../server/src/quoteScopeDisclosure.js';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {validatePricebookNumericDraft,convertPricebookMoney} from '../server/priceBookMoney.js';

// November 3, 2026 fixes. Every expected value was worked out by hand before
// the run. Tile 200 sq ft fixture: labor 200 x 3.00 x 1.10 = 660.00; materials
// 224 x 5.00 = 1,120.00; subtotal 1,780.00.
const cents=q=>q.options[0].calculationRecord.scenarios.mid.finalTotalCents;
const line=(q,name)=>(q.options?.[0]?.lineItems||[]).find(l=>l.name===name);
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.ownerDecisionRequired]));return q;};
const taxed=(f,cats,percent=15)=>{f.businessDefaults.taxMode='TAX_MATERIALS';f.businessDefaults.taxPercent=percent;for(const c of cats)f.ownerPricing.taxabilityByCategory[c]=true;return f;};

function carpet(rooms){
  const f=flooring('carpet',1);
  Object.assign(f.ownerPricing.pricing,{carpetRollWidthFt:12,scopeDetails:{floor_underlayment_carpet:{description:'[SYNTHETIC] pad included',mode:'included_in_floor_price'}}});
  for(const k of ['sqft','sqftMethod','roomCount'])delete f.customerInputs[k];
  Object.assign(f.customerInputs,{underlaymentScopeConfirmed:true,carpetMeasurementMethod:'rooms',carpetRooms:rooms});
  return f;
}
test('carpet keeps 3 in of trim at every wall in both directions (CRI 105 5.3)',()=>{
  // 12 ft roll, no crossgrain fills. Coverage is room + 0.5 ft each way.
  // 12 x 12: 12.5 across needs 2 widths cut 12.5 long: 2 x 12 x 12.5 = 300.
  assert.equal(line(ready(carpet([{lengthFt:12,widthFt:12}])),'Flooring materials').calculation.quantity,300);
  // 11.75 x 11.75: 12.25 across needs 2 widths cut 12.25: 294.
  assert.equal(line(ready(carpet([{lengthFt:11.75,widthFt:11.75}])),'Flooring materials').calculation.quantity,294);
  // 20 long x 12 wide: run the 20 ft side across, 20.5 needs 2 widths cut 12.5: 300 (the other way 492).
  assert.equal(line(ready(carpet([{lengthFt:20,widthFt:12}])),'Flooring materials').calculation.quantity,300);
  // 24 x 13: 24.5 across needs 3 widths cut 13.5 = 486 (the other way 2 widths cut 24.5 = 588).
  assert.equal(line(ready(carpet([{lengthFt:24,widthFt:13}])),'Flooring materials').calculation.quantity,486);
  // 15 x 15: 2 widths cut 15.5 = 372.
  assert.equal(line(ready(carpet([{lengthFt:15,widthFt:15}])),'Flooring materials').calculation.quantity,372);
});

test('the minimum top-up is taxed exactly like labor under materials-only tax',()=>{
  // $10,000 minimum. Labor and materials taxed at 15%: the whole $10,000 is taxed: $1,500.
  let f=taxed(flooring('tile',200),['material','labor']);f.ownerPricing.pricing.minimumJob=1000000;
  assert.equal(cents(ready(f)),1150000);
  // Materials only: 1,120.00 x 15% = 168.00; the 8,220.00 top-up is untaxed.
  f=taxed(flooring('tile',200),['material']);f.ownerPricing.pricing.minimumJob=1000000;
  assert.equal(cents(ready(f)),1016800);
});

test('the busy-season charge is taxed exactly like the labor it comes from',()=>{
  const peak=f=>{f.ownerPricing.peakMonths=[7];f.ownerPricing.peakSurchargePercent=20;f.customerInputs.workMonth='july';return f;};
  // 20% of 660.00 labor = 132.00. Labor and materials taxed at 10%:
  // (660 + 1,120 + 132) x 10% = 191.20; total 2,103.20.
  assert.equal(cents(ready(peak(taxed(flooring('tile',200),['material','labor'],10)))),210320);
  // Materials only: 1,120 x 10% = 112.00; labor and its busy-season charge untaxed: 2,024.00.
  assert.equal(cents(ready(peak(taxed(flooring('tile',200),['material'],10)))),202400);
});

test('a custom labor/materials split never changes the tax on a fully taxed price',()=>{
  // $100.05 custom price, 10% materials-only tax mode.
  const job=(share,cats)=>{const f=custom();f.ownerPricing.pricing.price=10005;if(share!==undefined)f.ownerPricing.pricing.installedMaterialsPercent={price:share};return taxed(f,cats,10);};
  // Labor and materials both taxed: 10% x 100.05 = 10.005 -> 10.01; 110.06 with or without the split.
  assert.equal(cents(ready(job(undefined,['labor','material']))),11006);
  assert.equal(cents(ready(job(50,['labor','material']))),11006);
  // Materials only, 50% split: materials bill 50.03 (50.025 rounded), labor 50.02. 10% x 50.03 = 5.003 -> 5.00: 105.05.
  assert.equal(cents(ready(job(50,['material']))),10505);
});

test('an unsupported lead-paint policy is rejected for configured painting offerings',()=>{
  const f=offeringFixture('INTERIOR_PAINTING','installed');f.businessDefaults.currency='CAD';f.customerInputs.buildingAge='1978_to_1990';
  f.ownerPricing.pricing.leadSafePainting='not_a_supported_policy';
  const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(q.invalidOwnerFields.includes('leadSafePainting'));
});
test('the exterior soffit unit saves; other painting settings stay numeric',()=>{
  const save=settings=>{const f=offeringFixture('EXTERIOR_PAINTING','itemized');f.ownerPricing.pricing.paintingSettings=settings;
    return ()=>validatePricebookNumericDraft(convertPricebookMoney({services:[f.ownerPricing],defaults:f.businessDefaults},'toDollars'));};
  for(const unit of ['square_feet','linear_feet'])assert.doesNotThrow(save({soffitUnit:unit,wallAdditionalCoatRatio:0.8}));
  assert.throws(save({soffitUnit:'square_feet',wallAdditionalCoatRatio:'abc'}),/numeric/);
});

test('requested concrete-base or sod preparation that is not priced makes the quote partial',()=>{
  const partial=f=>{const q=ready(f);return discloseQuoteScope(sanitizeForCustomerVNext(q),f.ownerPricing,{},{customerInputs:f.customerInputs},'synthetic');};
  // Concrete: labor 1,200.00 + ready-mix 488.89 + forms 1,500.00 + base gravel
  // 1,000 sq ft x 4 in / 324 x 1.2 = 2.963 cu yd x 100.00 = 296.30 -> 3,485.19.
  // Excavation and grading has no price, so it is left for the on-site estimate.
  let f=concrete();Object.assign(f.ownerPricing.pricing,{baseGravelPerCubicYard:10000,baseDepthInches:4,baseCompactionAllowance:0.2});
  let r=partial(f);assert.equal(r.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(r.pricedEstimate.midEstimate,3485.19);
  assert.deepEqual(r.additionalWork.map(item=>item.description),['Base excavation and grading labor']);
  // Sod 1,000 sq ft: material 1,050 x 1.00 + labor 1,000 x 1.00 + grading 1,000 x 0.50 = 2,550.00.
  // Old-lawn removal and imported topsoil have no price.
  f=fixture('LANDSCAPING_SOD',{sodMaterialPerSqft:100,sodInstallLaborPerSqft:100,groundPrepPerSqft:200,sodGradingPerSqft:50,minimumServiceCharge:0},{sodSqft:1000,sqftMethod:'exact',groundPrepNeeded:true,slope:'flat',accessDifficulty:'easy'});
  r=partial(f);assert.equal(r.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(r.pricedEstimate.midEstimate,2550);
  assert.deepEqual(r.additionalWork.map(item=>item.description),['Old-lawn removal and disposal','Imported topsoil']);
});
