// Neon audit of v51, V51-3 (November 26, 2026): an Ottawa (Ontario) business
// with a Gatineau (Quebec) travel zone and no Quebec tax rate was blocked
// (NEEDS PRICING) when Gatineau was listed first, and live with nothing said
// when Ottawa was listed first: the zone order decided. Expected, written
// before the fix (mowing, travel charged, 13% HST, Gatineau $50, Ottawa $0):
// - either order, with tax by job location off or on: QUOTING LIVE;
// - the owner is told: a status notice that jobs in Gatineau (Quebec) go to
//   review until the Quebec tax rate is entered;
// - an Ottawa job quotes (10000 + 13% = 11300 cents); a Gatineau job goes to
//   review naming businessDefaults.provinceTaxPercent.QC;
// - with a Quebec rate entered there is no notice.
// Kept: a missing rate for the business's OWN province still blocks (v46 #1,
// test/qeV46_20261123.spec.mjs); my first version skipped that zone too and
// that test failed.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mowing} from '../../verification/engine-independent/fixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';

const GATINEAU={name:'Gatineau',codes:['J8X'],charge:5000},OTTAWA={name:'Ottawa Core',codes:['K1A','K1P'],charge:0};
function setup(zones,extra={}){const f=mowing();f.ownerPricing.feeRules={...f.ownerPricing.feeRules,travel:'always'};
  f.businessDefaults={...f.businessDefaults,businessCountry:'CA',businessProvince:'ON',currency:'CAD',taxMode:'TAX_ALL',taxPercent:13,travelZones:zones,...extra};return f;}
const notice=s=>s.statusNotices.find(n=>/Gatineau/.test(n)&&/Quebec/.test(n));
for(const zones of [[GATINEAU,OTTAWA],[OTTAWA,GATINEAU]])for(const byLocation of [false,true])test('V51-3: '+zones.map(z=>z.name).join(' then ')+(byLocation?', tax by job location':''),()=>{
  const f=setup(zones,byLocation?{taxByJobLocation:true}:{}),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(s.status,'QUOTING LIVE',JSON.stringify(s.missingOwnerFields));
  assert.ok(notice(s),JSON.stringify(s.statusNotices));
  const ottawa=generateQuoteVNext({...f,customerInputs:{...f.customerInputs,postalCode:'K1A 0B1'}});
  assert.equal(ottawa.resultType,'INSTANT_ESTIMATE_READY',ottawa.reviewReason);assert.equal(ottawa.options[0].calculationRecord.scenarios.mid.finalTotalCents,11300);
  const gatineau=generateQuoteVNext({...f,customerInputs:{...f.customerInputs,postalCode:'J8X 2K1'}});
  assert.equal(gatineau.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.ok(gatineau.missingOwnerFields.includes('businessDefaults.provinceTaxPercent.QC'));
});
test('V51-3: with a Quebec rate there is no notice',()=>{
  const f=setup([GATINEAU,OTTAWA],{provinceTaxPercent:{QC:14.975}}),s=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  assert.equal(s.status,'QUOTING LIVE');assert.equal(notice(s),undefined);
});
