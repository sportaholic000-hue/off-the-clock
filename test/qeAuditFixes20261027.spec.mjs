import test from 'node:test';
import assert from 'node:assert/strict';
import {generateQuoteVNext} from '../server/quote-engine-vnext/engine.js';
import {validateBusinessDefaults,validateServiceRulesDetailed} from '../server/quote-engine-vnext/contracts.js';
import {flooring,flatRoof,defaults} from '../verification/engine-independent/fixtures.mjs';
import {offeringFixture} from './configuredOfferingsFixtures.mjs';

// Expected values written by hand before running.
// Tile, 200 sq ft: labor 200 x 300 x 1.10 = 66,000; material 200 x 1.12 x 500 = 112,000; total 178,000 cents.
const tile=range=>{const f=flooring('tile',200);Object.assign(f.businessDefaults,range);return f;};
const cents=value=>Math.round(value*100);

test('range sides share the 25% bound of the single estimate range buffer',()=>{
  for(const [value,ok] of [[0,true],[25,true],[25.01,false],[100,false]]){
    assert.equal(validateBusinessDefaults({...defaults,rangeLowPercent:value,rangeHighPercent:10}).ok,ok,'low '+value);
    assert.equal(validateBusinessDefaults({...defaults,rangeLowPercent:10,rangeHighPercent:value}).ok,ok,'high '+value);
  }
  assert.equal(validateBusinessDefaults({...defaults,rangeLowPercent:10,rangeHighPercent:500}).ok,false);
  assert.match(validateBusinessDefaults({...defaults,rangeLowPercent:100,rangeHighPercent:10}).errors.join(' '),/Low range buffer must be from 0 to 25%\./);
  assert.match(validateBusinessDefaults({...defaults,rangeLowPercent:10,rangeHighPercent:500}).errors.join(' '),/High range buffer must be from 0 to 25%\./);
  const service=tile({}).ownerPricing;service.rangeHighPercent=26;
  assert.ok(validateServiceRulesDetailed(service,'FLOORING_INSTALL').some(d=>d.path==='rangeHighPercent'));
});

test('25% sides quote 133,500 to 222,500 cents; out-of-bound sides never reach a customer',()=>{
  const ready=generateQuoteVNext(tile({rangeLowPercent:25,rangeHighPercent:25})),option=ready.options[0];
  assert.equal(ready.resultType,'INSTANT_ESTIMATE_READY');
  assert.deepEqual([cents(option.lowEstimate),cents(option.midEstimate),cents(option.highEstimate)],[133500,178000,222500]);
  for(const range of [{rangeLowPercent:100,rangeHighPercent:10},{rangeLowPercent:10,rangeHighPercent:500}]){
    const result=generateQuoteVNext(tile(range));
    assert.notEqual(result.resultType,'INSTANT_ESTIMATE_READY',JSON.stringify(range));
    assert.equal(result.options,undefined,JSON.stringify(range));
  }
});

test('waste-adjusted material quantities are labelled waste-adjusted; amounts are unchanged',()=>{
  // Flat roof 1,000 sq ft EPDM: membrane 1,000 x 1.10 = 1,100 sq ft x 700 = 770,000; labor 1,000 x 500 = 500,000.
  const roof=generateQuoteVNext(flatRoof()).options[0];
  const membrane=roof.lineItems.find(line=>line.name==='Membrane'),labor=roof.lineItems.find(line=>line.name==='Flat roof labor');
  assert.deepEqual([membrane.calculation.quantity,membrane.calculation.unit,membrane.amountCents],[1100,'waste-adjusted square feet',770000]);
  assert.deepEqual([labor.calculation.quantity,labor.calculation.unit,labor.amountCents],[1000,'measured square feet',500000]);
  assert.equal(cents(roof.midEstimate),1470000);
  // Interior itemized: wall finish 500 sq ft x 2 coats = 1,000 x 1.10 = 1,100 sq ft-coats x 30 = 33,000.
  const paint=generateQuoteVNext(offeringFixture('INTERIOR_PAINTING','itemized')).options[0];
  const finish=paint.lineItems.find(line=>line.name==='Wall finish materials');
  assert.deepEqual([finish.calculation.quantity,finish.calculation.unit,finish.amountCents],[1100,'waste-adjusted wall square-foot coats',33000]);
  assert.equal(cents(paint.midEstimate),328700);
  const derivation=paint.calculationRecord.quantityDerivations?.find?.(row=>row.name==='Wall finish materials material quantity');
  if(derivation)assert.equal(derivation.unit,'waste-adjusted wall square-foot coats');
});
