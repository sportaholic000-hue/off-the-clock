// Audit f1501ff #5a (November 24, 2026): readiness read the travel fee rule
// from the pricing block, where it never is, so it always assumed travel was
// charged. Expected, written before the fix: a US business with travel zones
// and tax zones that do not overlap, whose service never charges travel, is
// QUOTING LIVE, and a job at ZIP 98201 quotes $100.00 + 8% tax = $108.00.
// The same setup with travel charged stays NEEDS PRICING: no customer can be
// inside both a travel zone and a tax zone.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {vNextServiceStatus,generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

const defaults=base=>({...base,businessCountry:'US',currency:'USD',taxMode:'TAX_ALL',taxPercent:8,taxByJobLocation:true,taxOutsideZones:'review',travelZones:[{name:'[SYNTHETIC] Downtown',codes:['98101'],charge:2500}],taxZones:[{name:'[SYNTHETIC] North',codes:['98201'],percent:8}]});

test('f1501ff #5a: travel not applicable — live, and ZIP 98201 quotes 10800 cents',()=>{
  const f=mowing(),d=defaults(f.businessDefaults);
  assert.equal(f.ownerPricing.feeRules.travel,'not_applicable');
  assert.equal(vNextServiceStatus(f.ownerPricing,d).status,'QUOTING LIVE');
  const q=generateQuoteVNext({...f,businessDefaults:d,customerInputs:{...f.customerInputs,postalCode:'98201'}});
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  // 5,000 sq ft x 2 cents = 10,000; 8% tax = 800; total 10,800.
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,10800);
});

test('f1501ff #5a: travel charged — still NEEDS PRICING (no code is in both zones)',()=>{
  const f=mowing();f.ownerPricing.feeRules={...f.ownerPricing.feeRules,travel:'always'};
  assert.equal(vNextServiceStatus(f.ownerPricing,defaults(f.businessDefaults)).status,'NEEDS PRICING');
});
