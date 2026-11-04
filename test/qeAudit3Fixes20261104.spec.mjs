import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/engine.js';
import {BUILDING_AGE_FIELD} from '../server/quote-engine-vnext/buildingAgeRules.js';
import {concrete,flatRoof,flooring} from '../verification/engine-independent/fixtures.mjs';
import {confirmedFixtureInputs} from './quoteEngineVNextFixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';
import {discloseQuoteScope} from '../server/src/quoteScopeDisclosure.js';

// November 4, 2026 fixes. Every expected value was worked out by hand before
// the run.
const line=(q,name)=>(q.options?.[0]?.lineItems||[]).find(l=>l.name===name);
const ready=f=>{const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([q.reviewReason,q.missingOwnerFields,q.invalidCustomerFields]));return q;};
const shown=f=>discloseQuoteScope(sanitizeForCustomerVNext(ready(f)),f.ownerPricing,{},{customerInputs:f.customerInputs},'synthetic');

test('control joints excluded from slab labor with no saw-cut price make the quote partial',()=>{
  // 20 x 10 x 4 in slab: labor 200 x 6.00 = 1,200.00; base prep 200 x 1.75 =
  // 350.00; ready-mix 200 x 4/12 / 27 = 2.4691 cu yd x 1.10 waste = 2.7160 x
  // 180.00 = 488.89; forms 60 LF x 25.00 = 1,500.00. Total 3,538.89.
  const f=concrete();f.ownerPricing.pricing.controlJointPricing='excluded';delete f.ownerPricing.pricing.sawCutPerLF;
  const r=shown(f);
  assert.equal(r.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(r.pricedEstimate.midEstimate,3538.89);
  assert.deepEqual(r.additionalWork.map(item=>item.description),['Saw-cut control joints']);
  // Joints included in slab labor: the same price is the whole job.
  const g=concrete();g.ownerPricing.pricing.controlJointPricing='included';
  const s=shown(g);assert.equal(s.resultType,'INSTANT_ESTIMATE_READY');assert.equal(s.midEstimate,3538.89);
});

test('a flat-roof detail with no price of its own never sends the quote to review',()=>{
  // 1,000 sq ft EPDM: labor 1,000 x 5.00 = 5,000.00; membrane 1,000 x 1.10 x
  // 7.00 = 7,700.00; tear-off 1,000 x 2.00 = 2,000.00. Total 14,700.00.
  const included=flatRoof();included.ownerPricing.pricing.flatRoofItemBasis.flatRoofEdgeMetalPerLF='included_in_base';included.customerInputs.edgeMetalLF=50;
  const q=ready(included);assert.equal(q.midEstimate,14700);
  assert.equal(line(q,'Perimeter edge metal or coping'),undefined);
  assert.match(q.disclaimer,/Included in the roof price: perimeter edge metal or coping\./);
  // Confirmed on site: the same priced part, with the detail left for the site visit.
  const onSite=flatRoof();onSite.customerInputs.edgeMetalLF=50;
  const r=shown(onSite);assert.equal(r.resultType,'PARTIAL_ESTIMATE_READY');assert.equal(r.pricedEstimate.midEstimate,14700);
  assert.ok(r.additionalWork.some(item=>item.description==='Perimeter edge metal or coping'));
});

test('a home built in 1990 is screened like other homes from Health Canada\'s 1960 to 1990 range',()=>{
  assert.deepEqual(BUILDING_AGE_FIELD.optionLabels,{before_1978:'Before 1978','1978_to_1990':'1978 to 1990','1991_or_later':'1991 or later',not_sure:'Not sure'});
  const painting=(age,currency)=>{const f=offeringFixture('INTERIOR_PAINTING','installed');delete f.ownerPricing.pricing.leadSafePainting;f.businessDefaults.currency=currency;f.customerInputs.buildingAge=age;return f;};
  // Canadian business, blank policy: 1978 to 1990 is reviewed; 1991 or later is quoted.
  let q=generateQuoteVNext(painting('1978_to_1990','CAD'));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,/lead/);
  ready(painting('1991_or_later','CAD'));
  // US business, blank policy: EPA's line is 1978, so 1978 to 1990 is quoted.
  ready(painting('1978_to_1990','USD'));
  // The old answer is no longer a valid answer.
  q=generateQuoteVNext(painting('1990_or_later','CAD'));assert.notEqual(q.resultType,'INSTANT_ESTIMATE_READY');assert.ok(q.invalidCustomerFields.includes('buildingAge'),JSON.stringify(q.invalidCustomerFields));
  // Removal: 250 sq ft of old vinyl at 1.00 = 250.00 when quoted.
  const removal=age=>{const f=flooring('tile',200);f.ownerPricing.pricing.removalPerSqft={vinyl:100};delete f.ownerPricing.pricing.olderMaterialRemoval;
    f.customerInputs=confirmedFixtureInputs({...f.customerInputs,existingFloorType:'vinyl',removalNeeded:true,removalAreaSqft:250,buildingAge:age});return f;};
  q=generateQuoteVNext(removal('1978_to_1990'));assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.match(q.reviewReason,/built in 1990 or earlier can contain asbestos/);
  assert.equal(line(ready(removal('1991_or_later')),'Existing flooring removal').amountCents,25000);
});
