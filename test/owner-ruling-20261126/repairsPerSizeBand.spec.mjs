// Owner ruling (November 26, 2026): quote as many jobs as possible by industry
// practice. Repair services go live per size band (also the reading of
// specs/QUOTE_TRADE_DECISIONS_20261003.md "Large repairs are bounded":
// the owner's largest affected area priced as a repair "is required before
// large repairs quote; larger requests go to review". Found by the harness
// (9 known BLOCKED_QUOTES findings, November 25, 2026, overnight): with it
// blank, the whole repair service was NEEDS PRICING, so small and medium
// repairs could not quote either. Expected, written before the fix, for
// pitched-roof, flat-roof and siding repairs with the largest area blank:
// - the service is QUOTING LIVE;
// - the owner coverage lists "Large repairs" with largeRepairMaxSqft missing;
// - a small repair quotes, at the same price as with a largest area set;
// - a large repair goes to review naming largeRepairMaxSqft (unchanged);
// - a $0 medium or large material allowance (no free/included classification)
//   holds only that band: small repairs quote, the coverage lists the band
//   ("Medium repairs" / "Large repairs") with the allowance missing;
// - nothing priced in any band: still NEEDS PRICING.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,flatRepair} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

const services={
  ROOFING_REPAIR:()=>fixture('ROOFING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1000,repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:6}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:5000,medium:8000,large:12000}}},pitchMultiplier:{low:1,medium:1,steep:1,very_steep:1},storyMultiplier:{1:1,2:1,3:1}},{repairType:'shingle_patch',roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false,affectedArea:20}),
  FLAT_ROOF_REPAIR:flatRepair,
  SIDING_REPAIR:()=>fixture('SIDING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1000,repairHours:{vinyl:{minor:{small:2,medium:4,large:8}}},materialAllowance:{vinyl:{minor:{small:5000,medium:10000,large:20000}}}},{sidingType:'vinyl',damageLevel:'minor',affectedArea:10,stories:1})
};
const cents=q=>{assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason+' '+JSON.stringify(q.missingOwnerFields));return q.options[0].calculationRecord.scenarios.mid.finalTotalCents;};
for(const [type,make] of Object.entries(services))test(type+': blank largest repair area holds only large repairs',()=>{
  const set=make(),blank=make();delete blank.ownerPricing.pricing.largeRepairMaxSqft;
  assert.equal(vNextServiceStatus(set.ownerPricing,set.businessDefaults).status,'QUOTING LIVE');
  const s=vNextServiceStatus(blank.ownerPricing,blank.businessDefaults);
  assert.equal(s.status,'QUOTING LIVE',JSON.stringify([s.missingOwnerFields,s.validationErrors]));
  const row=s.scopeCoverage.find(r=>r.key==='large_repairs');
  assert.ok(row,'no Large repairs coverage row');assert.equal(row.configurationComplete,false);
  assert.ok(row.variants.every(v=>v.missingFields.includes('largeRepairMaxSqft')));
  assert.equal(cents(generateQuoteVNext(blank)),cents(generateQuoteVNext(set)));
  const large=structuredClone(blank);large.customerInputs.affectedArea=500;
  const q=generateQuoteVNext(large);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(q.missingOwnerFields.includes('largeRepairMaxSqft'),JSON.stringify(q.missingOwnerFields));
});

const allowanceField={ROOFING_REPAIR:'repairMaterialAllowance',FLAT_ROOF_REPAIR:'patchMaterialAllowance',SIDING_REPAIR:'materialAllowance'};
const setLeaf=(o,band,value)=>{for(const v of Object.values(o))for(const w of Object.values(v))if(w&&typeof w==='object'&&band in w)w[band]=value;};
for(const [type,make] of Object.entries(services))for(const band of ['medium','large'])test(type+': a $0 '+band+' allowance holds only '+band+' repairs',()=>{
  const set=make(),zero=make();setLeaf(zero.ownerPricing.pricing[allowanceField[type]],band,0);
  const s=vNextServiceStatus(zero.ownerPricing,zero.businessDefaults);
  assert.equal(s.status,'QUOTING LIVE',JSON.stringify([s.missingOwnerFields,s.validationErrors]));
  const row=s.scopeCoverage.find(r=>r.key===band+'_repairs');assert.ok(row,'no '+band+' coverage row');
  assert.ok(row.variants.some(v=>v.missingFields.some(f=>f.startsWith(allowanceField[type]))),JSON.stringify(row));
  assert.equal(cents(generateQuoteVNext(zero)),cents(generateQuoteVNext(set)));
});
test('nothing priced in any band: still NEEDS PRICING',()=>{
  const f=flatRepair();setLeaf(f.ownerPricing.pricing.patchMaterialAllowance,'small',0);setLeaf(f.ownerPricing.pricing.patchMaterialAllowance,'medium',0);setLeaf(f.ownerPricing.pricing.patchMaterialAllowance,'large',0);
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,'NEEDS PRICING');
});
