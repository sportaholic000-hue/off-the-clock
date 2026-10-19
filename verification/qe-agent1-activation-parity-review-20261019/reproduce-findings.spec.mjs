// Intentionally failing audit tests. Kept outside normal test discovery.
import '../../test/pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {bookQuoteStatuses} from '../../server/src/quoteDoneBridge.js';
import {generateQuoteVNext} from '../../server/quote-engine-vnext/index.js';
for(const id of ['AP01','AP02']){
 const e=JSON.parse(gunzipSync(fs.readFileSync(new URL('./findings/'+id+'.json.gz',import.meta.url))));
 test(id+' exact saved small-pitch selection is calculable at391000 cents',()=>{
  // Diagnostic engine request only: active=true tests the selected contract.
  // This does NOT change the durable book or forge a customer-accessible quote.
  const request=structuredClone(e.applicationCalculation.request);request.ownerPricing.active=true;
  const before=structuredClone(e.book),q=generateQuoteVNext(request);
  assert.equal(q.resultType,'INSTANT_ESTIMATE_READY');
  assert.equal(q.options[0].calculationRecord.scenarios.mid.finalTotalCents,391000);
  assert.deepEqual(e.book,before);
  assert.equal(e.ownerValidation.approvalCurrent,true);
  assert.equal(e.catalog.services.length,0);
  assert.equal(e.widget.body.resultType,'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(e.match.status,'needs_clarification');
 });
 test(id+' approved service must remain available for its valid known-pitch scope',()=>{
  const before=structuredClone(e.book),s=bookQuoteStatuses(e.book,{timeZone:'UTC',quoteInstant:'2026-10-06T12:00:00.000Z'})[0];
  assert.deepEqual(e.book,before);assert.equal(s.approvalCurrent,true);
  assert.equal(s.status,'QUOTING LIVE',JSON.stringify({missing:s.missingOwnerFields,invalid:s.invalidOwnerFields}));
 });
}
