import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';

// Owner ruling 2026-10-08: keep the standard-option hints for concrete thickness
// and wall height; the caller still chooses and confirms. Expected text written first.
const guide=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const service=type=>({serviceType:type,serviceLabel:type,active:true,status:'QUOTING LIVE',offerings:[]});
const prompt=types=>compileVoiceSystemInstruction({guideText:guide,business:{businessName:'Synthetic Works',agentName:'Nova'},services:types.map(service),knowledge:{}});

test('driveway flow offers the four-inch standard and the heavy-vehicle option',()=>{
  const text=prompt(['CONCRETE_DRIVEWAY']);
  assert.match(text,/Standard is four\s+inches for cars\. If you park heavy trucks, a trailer, or\s+an RV on it, five or six is smarter/);
  assert.match(text,/The caller chooses; read back the chosen thickness and get a yes\./);
  assert.doesNotMatch(text,/Never supply or suggest a thickness/);
});
test('patio flow keeps its four-inch thickness guide',()=>{
  assert.match(prompt(['CONCRETE_PATIO_SLAB']),/Thickness guide: "four\s+inches is standard for a patio\."/);
});
test('interior painting asks standard eight-foot ceilings or higher, confirmed by the caller',()=>{
  const text=prompt(['INTERIOR_PAINTING']);
  assert.match(text,/Standard eight-foot ceilings, or higher —\s+any vaulted spaces\?/);
  assert.match(text,/"standard" answer means eight feet only after the caller confirms it/);
});
test('the no-suggestion rule names the flow hints as its only exception',()=>{
  assert.match(prompt([]),/Never supply, suggest, coach, guess or convert a measurement;[^.]*\. The only exception is a standard-option hint written in an active service flow \(concrete thickness, wall height\)/);
});
