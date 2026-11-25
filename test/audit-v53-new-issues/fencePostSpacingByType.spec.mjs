// New-issues audit of v53, fence post spacing: 0.1 ft was accepted (a 100 ft
// fence quoted $33,850), chain link was allowed up to 12 ft although ASTM F567
// sets chain-link line posts at most 10 ft apart, and the owner was not told
// the limit. Decision by industry practice, quoting as many jobs as possible:
// - every fence type: at least 3 ft;
// - chain link (a fence type whose name contains "chain"): at most 10 ft
//   (ASTM F567 / F1043);
// - other types: at most 12 ft. The auditor proposed 8 ft, but split-rail
//   installation instructions space posts about 10 ft 3-4 in apart for 10.5 ft
//   rails (Culpeper Wood), so 8 ft would refuse ordinary split-rail jobs.
// - the owner message states the limit in plain words.
// Expected, written before the change: 0.1 and 2.99 ft refused; 3, 8, 12 ft
// quote on wood; 10 ft quotes and 10.5 ft is refused on chain link; height rows
// follow the same limits; the owner summary states "from 3 to 12 feet".
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext,vNextServiceStatus} from '../../server/quote-engine-vnext/index.js';
import {ownerValidationMessages} from '../../client/src/pricebookDiagnostics.js';

// The synthetic fixture knows a wood fence only; register a chain-link offering the same way.
const CHAIN_ID='5f0c9a43-2b7d-4e1a-8c3f-6a2d9e4b7c10';
function chainLink(f){
  const p=f.ownerPricing.pricing;p.offeringDetails={...p.offeringDetails,fenceType:'chain_link'};f.customerInputs.fenceType='chain_link';
  f.ownerPricing.knownOfferings={...f.ownerPricing.knownOfferings,fenceType:{chain_link:CHAIN_ID}};
  f.customerInputs.confirmedFacts.fenceType={...f.customerInputs.confirmedFacts.fenceType,value:'chain_link',offeringId:CHAIN_ID};
  return f;
}
const check=(f,ok,label)=>{
  assert.equal(vNextServiceStatus(f.ownerPricing,f.businessDefaults).status,ok?'QUOTING LIVE':'NEEDS PRICING',label);
  assert.equal(generateQuoteVNext(f).resultType,ok?'INSTANT_ESTIMATE_READY':'ESTIMATE_REQUIRES_REVIEW',label);
};
test('post spacing is at least 3 ft and at most 12 ft for wood',()=>{
  for(const [s,ok] of [[0.1,false],[2.99,false],[3,true],[8,true],[12,true],[12.01,false]]){
    const f=offeringFixture('FENCING_INSTALL','itemized');f.ownerPricing.pricing.postSpacingLF=s;check(f,ok,'wood '+s);
  }
});
test('chain-link post spacing is at most 10 ft',()=>{
  const base=chainLink(offeringFixture('FENCING_INSTALL','itemized'));
  assert.equal(generateQuoteVNext(base).resultType,'INSTANT_ESTIMATE_READY',generateQuoteVNext(base).reviewReason);
  for(const [s,ok] of [[3,true],[10,true],[10.5,false],[12,false]]){
    const f=chainLink(offeringFixture('FENCING_INSTALL','itemized'));f.ownerPricing.pricing.postSpacingLF=s;check(f,ok,'chain link '+s);
  }
});
test('the owner is told the post-spacing limit',()=>{
  const f=offeringFixture('FENCING_INSTALL','itemized');f.ownerPricing.pricing.postSpacingLF=15;
  const status=vNextServiceStatus(f.ownerPricing,f.businessDefaults);
  const text=ownerValidationMessages({statuses:[status]},{services:[{...f.ownerPricing,service:'Fence'}]},[]).join(' ');
  assert.match(text,/from 3 to 12 feet/,text);
});
