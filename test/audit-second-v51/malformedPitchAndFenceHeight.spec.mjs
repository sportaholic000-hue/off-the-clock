// Second audit of v51 (November 26, 2026), two input-validation items.
// Expected, written before the fix:
// - roofing with pitch or pitchBand '__proto__', 'constructor' or 'toString'
//   returns a review result instead of throwing (BANDS[band] read inherited
//   object properties);
// - a single-height fence priced at 6 ft: 1,000,001 ft, 1e9 ft and 1e13 ft go
//   to review ("No price is set for a fence at N ft."), as 8 ft and
//   1,000,000 ft already do; 6 ft still quotes.
import '../pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {baseServices} from '../invariants/harness.mjs';
import {offeringFixture} from '../configuredOfferingsFixtures.mjs';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';

test('a malformed roof pitch value goes to review, not a crash',()=>{
  // Every roofing base (first version tried one base that never reaches the
  // pitch-band lookup and passed before the fix; corrected).
  for(const base of baseServices().filter(b=>b.f.serviceType==='ROOFING_REPLACEMENT').map(b=>b.f))for(const field of ['pitch','pitchBand'])for(const value of ['__proto__','constructor','toString']){
    const f=structuredClone(base);f.customerInputs[field]=value;
    let q;assert.doesNotThrow(()=>{q=generateQuoteVNext(f);},field+'='+value);
    assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',field+'='+value);
  }
});
test('any fence height without a price goes to review',()=>{
  for(const type of ['FENCING_INSTALL','FENCING_REPLACEMENT'])for(const mode of ['installed','itemized']){
    const ok=offeringFixture(type,mode);assert.equal(generateQuoteVNext(ok).resultType,'INSTANT_ESTIMATE_READY',type+mode);
    for(const height of [8,1_000_001,1e9,1e13]){const f=offeringFixture(type,mode);f.customerInputs.fenceHeight=height;
      const q=generateQuoteVNext(f);assert.equal(q.resultType,'ESTIMATE_REQUIRES_REVIEW',type+' '+mode+' '+height);}
  }
});
