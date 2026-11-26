// v56 audit, V56-3: an Ottawa business with a Gatineau (Quebec) travel zone and
// a mowing service set to 0% tax quotes Gatineau jobs at 0%, yet the status
// still warned that jobs in Gatineau go to review until a Quebec rate is
// entered. Expected, written before the change (setup of the V51-3 test):
// - service tax 0%, tax by job location off or on: QUOTING LIVE, no Gatineau
//   notice, and a Gatineau job quotes 10000 + $50 travel = 15000 cents;
// - a service on the business rate keeps the notice (V51-3 unchanged), and so
//   does one at 5%, whose Gatineau jobs still go to review.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

const GATINEAU={name:'Gatineau',codes:['J8X'],charge:5000},OTTAWA={name:'Ottawa Core',codes:['K1A','K1P'],charge:0};
function setup(extra={}){const f=mowing();f.ownerPricing.feeRules={...f.ownerPricing.feeRules,travel:'always'};
  f.businessDefaults={...f.businessDefaults,businessCountry:'CA',businessProvince:'ON',currency:'CAD',taxMode:'TAX_ALL',taxPercent:13,travelZones:[GATINEAU,OTTAWA],...extra};return f;}
const notice=s=>s.statusNotices.find(n=>/Gatineau/.test(n)&&/Quebec/.test(n));
for(const byLocation of [false,true])test('a 0% service is not warned about Quebec'+(byLocation?' (tax by job location)':''),()=>{
  const f=setup(byLocation?{taxByJobLocation:true}:{});f.ownerPricing.taxPercent=0;
  const s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(s.status,'QUOTING LIVE',JSON.stringify(s.missingOwnerFields));
  assert.equal(notice(s),undefined,JSON.stringify(s.statusNotices));
  const q=generateQuoteVNext({...f,customerInputs:{...f.customerInputs,postalCode:'J8X 2K1'}});
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY',q.reviewReason);
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,15000);
});
test('the business rate keeps the notice, and so does a nonzero service rate',()=>{
  const f=setup();assert.ok(notice(vNextServiceStatus(f.ownerPricing,f.businessDefaults)));
  const g=setup();g.ownerPricing.taxPercent=5;
  const s=vNextServiceStatus(g.ownerPricing,g.businessDefaults);
  assert.equal(s.status,'QUOTING LIVE');assert.ok(notice(s),JSON.stringify(s.statusNotices));
  const q=generateQuoteVNext({...g,customerInputs:{...g.customerInputs,postalCode:'J8X 2K1'}});
  assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW');
});
