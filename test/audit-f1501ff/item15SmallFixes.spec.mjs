// Audit f1501ff #15 (November 24, 2026), the small fixes made. Expected
// outcomes written before each fix:
// (a) Neon #10: floor leveling asked for ("yes") with no area, on an option
//     without a leveling price, is listed as not included (it was dropped
//     without a word; with an area it was already listed). Price unchanged:
//     200 sq ft tile, 178000 cents (hand-checked fixture).
// (b) Neon #14: with the repair "length and width" method, only the missing
//     dimension is listed, never the derived affected area. 10 ft x 6 ft =
//     60 sq ft quotes the same as 60 sq ft entered directly: medium repair,
//     4 h x 10000 + 8000 = 48000 cents.
// (c) Neon #19: a concrete book that sets the base (included or not) or the
//     reinforcement does not tell the owner those requests "arrive as leads":
//     customers are never asked. A default of rebar with no rebar price is
//     still NEEDS PRICING (rebar is on every slab).
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {flooring,concrete,fixture} from '../../verification/engine-independent/fixtures.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

test('f1501ff #15a: unpriced leveling asked for without an area is listed as not included',()=>{
  for(const answers of [{floorLevelingNeeded:true},{floorLevelingNeeded:true,floorLevelingSqft:50}]){
    const f=flooring();Object.assign(f.customerInputs,answers);const q=generateQuoteVNext(f);
    assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,178000);
    assert.deepEqual(q.options[0].skippedAddons,['Floor leveling']);
  }
});
test('f1501ff #15b: repair by length and width never lists the derived area as missing',()=>{
  const repair=answers=>fixture('ROOFING_REPAIR',{laborHourlyRate:10000,repairMinimum:0,largeRepairMaxSqft:1000,repairHours:{asphalt_shingle:{shingle_patch:{small:2,medium:4,large:6}}},repairMaterialAllowance:{asphalt_shingle:{shingle_patch:{small:5000,medium:8000,large:12000}}},pitchMultiplier:{low:1,medium:1,steep:1,very_steep:1},storyMultiplier:{1:1,2:1,3:1}},{repairType:'shingle_patch',roofType:'asphalt_shingle',pitch:'low',stories:1,leakPresent:false,...answers});
  assert.deepEqual(generateQuoteVNext(repair({repairAreaMethod:'dimensions',repairLengthFt:10})).missingCustomerFields,['repairWidthFt']);
  assert.equal(generateQuoteVNext(repair({repairAreaMethod:'dimensions',repairLengthFt:10,repairWidthFt:6})).options[0].calculationRecord.scenarios.mid.finalTotalCents,48000);
  assert.equal(generateQuoteVNext(repair({repairAreaMethod:'area',affectedArea:60})).options[0].calculationRecord.scenarios.mid.finalTotalCents,48000);
  assert.deepEqual(generateQuoteVNext(repair({repairAreaMethod:'area'})).missingCustomerFields,['affectedArea']);
});
test('f1501ff #15c: concrete settings customers are not asked about get no "arrive as leads" notice',()=>{
  const book=p=>{const f=concrete();for(const k of ['basePrepPerSqft','wireReinforcementPerSqft','rebarReinforcementPerSqft'])delete f.ownerPricing.pricing[k];delete f.customerInputs.baseNeeded;f.customerInputs.reinforcement='none';Object.assign(f.ownerPricing.pricing,p);return vNextServiceStatus(f.ownerPricing,f.businessDefaults);};
  const rows=s=>s.scopeCoverage.filter(r=>/^(base|wire|rebar)_prices$/.test(r.key)).map(r=>r.key);
  assert.deepEqual(rows(book({})),['base_prices','wire_prices','rebar_prices']);
  assert.deepEqual(rows(book({newSlabBase:'not_included'})),['wire_prices','rebar_prices']);
  assert.deepEqual(rows(book({defaultReinforcement:'none'})),['base_prices']);
  const rebar=book({defaultReinforcement:'rebar'});
  assert.equal(rebar.status,'NEEDS PRICING');
  assert.deepEqual(rows(rebar),['base_prices']);
});
