// Backlog (verdicts audit): itemized flat-roof insulation and cover board
// material priced only the area plus 7% waste, though boards are bought whole
// (commonly 4 ft by 8 ft, 32 sq ft). Expected, written before the change
// (fixture commercial-itemized: insulation material 150 c/sq ft, cover board
// 75 c/sq ft, 7% waste, easy access):
// - blank sizes: unchanged (100 sq ft -> 107 sq ft: 16050 and 8025 cents;
//   1850 sq ft: 296925 and 148463 cents);
// - 32 sq ft boards: 100 sq ft -> 4 boards, 128 sq ft: 19200 and 9600 cents;
//   1850 sq ft -> 1979.5 sq ft, 62 boards, 1984 sq ft: 297600 and 148800;
// - labor stays on the measured area (1850 x 50 = 92500 cents);
// - only the layer with a size rounds;
// - 0 or more than 1000 is refused with the field's label.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';
import {measuredScopeCases} from '../measuredScopeFixtures.mjs';

const get=()=>structuredClone(measuredScopeCases().find(r=>r.id==='commercial-itemized').input);
function job(sqft,sizes={}){const f=get();Object.assign(f.customerInputs,{roofSqft:sqft,insulationAreaSqft:sqft,coverboardAreaSqft:sqft,accessDifficulty:'easy'});Object.assign(f.ownerPricing.pricing,sizes);return f;}
function cents(f){const q=generateQuoteVNext(f);assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);const at=path=>q.lineItems.find(l=>l.calculation?.ratePath===path).amountCents;return [at('scopeRates.insulation_material'),at('scopeRates.coverboard_material'),at('scopeRates.insulation_labor')];}
test('blank board sizes keep the exact area after waste',()=>{
  assert.deepEqual(cents(job(100)).slice(0,2),[16050,8025]);
  assert.deepEqual(cents(job(1850)),[296925,148463,92500]);
});
test('32 sq ft boards round each layer up to whole boards; labor is unchanged',()=>{
  const both={insulationBoardSqft:32,coverboardBoardSqft:32};
  assert.deepEqual(cents(job(100,both)).slice(0,2),[19200,9600]);
  assert.deepEqual(cents(job(1850,both)),[297600,148800,92500]);
  assert.deepEqual(cents(job(100,{insulationBoardSqft:32})).slice(0,2),[19200,8025]);
});
test('a board size outside more than 0 to 1000 is refused with its label',()=>{
  for(const bad of [0,1001]){
    const f=job(100,{coverboardBoardSqft:bad}),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
    assert.equal(s.status,'NEEDS PRICING');
    assert.ok(s.validationErrors.includes('Cover board size (sq ft): enter a number of square feet from more than 0 to 1,000.'),JSON.stringify(s.validationErrors));
  }
});
test('the owner editor lists both sizes as optional, non-money fields',async()=>{
  const {applicationMetadata}=await import('../../server/src/quoteDoneBridge.js');
  const fields=applicationMetadata().services.find(row=>row.serviceType==='FLAT_ROOF_REPLACEMENT').fields;
  for(const [name,label] of [['insulationBoardSqft','Insulation board size (sq ft)'],['coverboardBoardSqft','Cover board size (sq ft)']]){
    const field=fields.find(row=>row.field===name);assert.ok(field,name);assert.equal(field.label,label);assert.equal(field.money,false);assert.equal(field.requiredAtBase,false);
  }
});
