import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseVoiceGuide,IMMUTABLE_VOICE_GUIDE_SHA256} from '../server/src/voice/voicePromptCompiler.js';
import {MEASUREMENT_CONTRACTS} from '../server/quote-engine-vnext/index.js';

test('QE-021 historical flow is clearly retired and points readers to active measured contracts and runtime guide',()=>{
  const doc=readFileSync('specs/voice_quote_flows.md','utf8');
  assert.match(doc.slice(0,600),/retired|superseded/i);
  for(const reference of ['quote_engine_v2.md','QUOTE_AUDIT_DECISIONS_20261004.md','QUOTE_TRADE_DECISIONS_20261003.md','server/src/voice/receptionistGuide.md','server/quote-engine-vnext/contracts.js','server/src/voice/voiceQuoteContract.js'])assert.ok(doc.includes(reference),reference);
  assert.doesNotMatch(doc,/convert silently|pace it out|small, medium, or large|assume one layer/i);
  assert.ok(doc.includes('history/voice_quote_flows_legacy_v2.md'));
});
test('QE-021 runtime loads the separately pinned guide; quote contracts remain measured and unchanged',()=>{
  const guide=readFileSync('server/src/voice/receptionistGuide.md','utf8');assert.equal(createHash('sha256').update(guide).digest('hex'),IMMUTABLE_VOICE_GUIDE_SHA256);assert.ok(parseVoiceGuide(guide).flows.LANDSCAPING_MOWING);
  for(const file of ['server/src/voice/productionVoiceRuntime.js','server/src/onboardingService.js']){
    const source=readFileSync(file,'utf8');assert.ok(source.includes('receptionistGuide.md'));assert.ok(!source.includes('voice_quote_flows.md'));
  }
  assert.ok(MEASUREMENT_CONTRACTS.ROOFING_REPLACEMENT);assert.match(guide,/never convert it yourself/i);
});
