import './pricebookTestEnv.mjs';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {generateQuoteVNext,sanitizeForCustomerVNext} from '../server/quote-engine-vnext/index.js';
import {coatRateHelp} from '../server/quote-engine-vnext/surfacePricing.js';
import {editReadyMixUnit} from '../client/src/pricebookEditing.js';
import {applicationMetadata,applicationServiceDefinition} from '../server/src/quoteDoneBridge.js';

function ready(input) {
  const result=generateQuoteVNext(input);
  assert.equal(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify([result.reviewReason,result.missingOwnerFields,result.invalidOwnerFields,result.invalidCustomerFields,result.missingCustomerFields,result.validationMessages]));
  assert.equal(sanitizeForCustomerVNext(result).resultType,result.resultType);
  return result.options[0];
}
const amount=(q,name)=>q.lineItems.find(line=>line.name===name)?.amountCents;
const rows=JSON.parse(readFileSync(new URL('../verification/engine-fingerprint/corpus-additions-20261121.json',import.meta.url)));
const input=id=>structuredClone(rows.find(row=>row.id==='audit-20261121:'+id).input);

test('the coat price field displays the first-coat labor price on a two-coat basis',()=>{
  const p={paintingSettings:{trimAdditionalCoatRatio:0.33,wallAdditionalCoatRatio:0.8,ceilingAdditionalCoatRatio:0.8}};
  // $1.50 * 2 / 1.33 = $2.2556391 per LF; 100 LF rounds to $225.56.
  assert.match(coatRateHelp(p,'trimLaborPerLF',1.50),/two-coat job.*One coat costs \$2\.2556391 per linear foot/);
  assert.match(coatRateHelp(p,'laborPerWallSqftPerCoat',0.75),/One coat costs \$0\.83333333 per square foot/);
  assert.match(coatRateHelp(p,'ceilingLaborPerSqftPerCoat',0.6),/One coat costs \$0\.66666667 per square foot/);
  const q=ready(input('one-coat'));
  assert.equal(amount(q,'Wall labor — first coat'),32000);
  assert.equal(amount(q,'Ceiling labor — first coat'),9600);
  assert.equal(amount(q,'Trim labor — first coat'),22556);
});

test('a grading-only price serves bare ground and preserves the existing-lawn package',()=>{
  // $0.85 material * 1,050 + $0.45 labor * 1,000 = $1,342.50, plus $1,500 combined or $600 grading.
  const lawn=ready(input('sod-lawn')), bare=ready(input('sod-bare'));
  assert.equal(lawn.midEstimate,2842.50);assert.equal(bare.midEstimate,1942.50);
  assert.equal(amount(lawn,'Ground preparation'),150000);assert.equal(amount(lawn,'Sod grading'),undefined);
  assert.doesNotMatch(lawn.disclaimer,/Excluded ground preparation/);
  assert.equal(amount(bare,'Sod grading'),60000);assert.equal(amount(bare,'Ground preparation'),undefined);
});

test('the work minimum, fee markup, tax and customer range use the selected fee rule',()=>{
  // $100 work, $150 travel, $200 permit. Whole-job minimum $600; work minimum plus fees $950.
  const f=input('minimum-on-top');
  assert.equal(ready(f).midEstimate,950);
  assert.equal(amount(ready(f),'Minimum price adjustment'),50000);
  // Since v42 a book with no saved choice charges the fees on top; counting them toward the minimum is the owner's choice.
  for(const [mode,total] of [[undefined,950],['fees_in_minimum',600]]){
    const old=structuredClone(f);
    if(mode)old.businessDefaults.minimumFeeTreatment=mode;else delete old.businessDefaults.minimumFeeTreatment;
    assert.equal(ready(old).midEstimate,total);
  }
  // 50% markup everywhere: $150 work + $450 top-up + $525 fee selling price. 10% tax = $1,237.50 flat.
  Object.assign(f.businessDefaults,{markupPercent:50,taxMode:'TAX_ALL',taxPercent:10,rangeBufferPercent:10});
  const q=ready(f);assert.equal(amount(q,'Minimum price adjustment'),45000);
  assert.deepEqual([q.lowEstimate,q.midEstimate,q.highEstimate],[1237.5,1237.5,1237.5]);
  f.businessDefaults.minimumFeeTreatment='unrecognized';
  assert.equal(generateQuoteVNext(f).resultType,'ESTIMATE_REQUIRES_REVIEW');
});

test('accent paint uses measured areas after openings and rounds each color to whole cans',()=>{
  // 330 net sq ft, 2 coats, 10% waste. 300*2*1.1/400 needs 2 cans; 30*2*1.1/400 needs 1.
  // At $50/can, $150 for paint plus $800 wall labor. An even 165/165 split would buy 2 cans total.
  const f=input('accent-wall'), q=ready(f);
  const fields=applicationServiceDefinition(f.ownerPricing).customerFields.map(field=>field.name);
  assert.ok(fields.includes('wallColorCount'));assert.equal(fields.indexOf('wallColorAreas'),fields.indexOf('wallColorCount')+1);
  assert.equal(amount(q,'Purchased materials: paint — wall color 1'),10000);
  assert.equal(amount(q,'Purchased materials: paint — wall color 2'),5000);
  assert.equal(q.midEstimate,950);
  delete f.customerInputs.wallColorAreas;
  assert.ok(generateQuoteVNext(f).missingCustomerFields.includes('wallColorAreas'));
  for(const bad of [[300,31],[330],[330,0],[300,25,5]]){
    f.customerInputs.wallColorAreas=bad.map(areaSqft=>({areaSqft}));
    assert.ok(generateQuoteVNext(f).invalidCustomerFields.includes('wallColorAreas'));
  }
});

test('Canadian ready-mix with an unstated unit asks before reusing saved rates',()=>{
  const f=input('ready-mix-unstated');
  assert.ok(generateQuoteVNext(f).missingOwnerFields.includes('readyMixUnit'));
  // 400 * 4 / 324 * 1.10 = 5.4321 yd3, 5.5 yd3 by quarters, or 4.25 m3. $180 per chosen unit.
  f.ownerPricing.pricing.readyMixUnit='cubic_yard';assert.equal(amount(ready(f),'Ready-mix concrete'),99000);
  f.ownerPricing.pricing.readyMixUnit='cubic_metre';assert.equal(amount(ready(f),'Ready-mix concrete'),76500);
  const old={serviceType:'CONCRETE_PATIO_SLAB',pricing:{concreteCostPerCubicYard:180},tiers:[{name:'Premium',overrides:{concreteCostPerCubicYard:200}}]};
  const tierOnly=editReadyMixUnit({...old,pricing:{}},'cubic_yard','CA');
  assert.equal(tierOnly.tiers[0].overrides.concreteCostPerCubicYard,200);
  const confirmed=editReadyMixUnit(old,'cubic_yard','CA');
  assert.equal(confirmed.pricing.concreteCostPerCubicYard,180);assert.equal(confirmed.tiers[0].overrides.concreteCostPerCubicYard,200);
  assert.equal(editReadyMixUnit(confirmed,'cubic_metre','CA').tiers[0].overrides.concreteCostPerCubicYard,undefined);
});

test('zero stated waste can use haul-away alone or include a disposal minimum',()=>{
  // $300 cleanup + $100 additional haul-away, with an optional $50 disposal minimum.
  const f=input('cleanup-haul-only');assert.equal(ready(f).midEstimate,400);
  for(const unit of ['wasteBags','wasteLoads']){
    delete f.customerInputs.wasteBags;delete f.customerInputs.wasteLoads;f.customerInputs[unit]=0;
    for(const [policy,expected] of [['charge_both',450],['haul_away_only',400]]){
      f.ownerPricing.pricing.zeroWasteHaulAway=policy;assert.equal(ready(f).midEstimate,expected);
    }
    f.customerInputs[unit]=1;assert.ok(ready(f).midEstimate>=450);
  }
  const field=applicationMetadata().services.find(s=>s.serviceType==='LANDSCAPING_CLEANUP').fields.find(f=>f.field==='zeroWasteHaulAway');
  assert.equal(field.type,'select');assert.equal(field.requiredAtBase,false);
});
