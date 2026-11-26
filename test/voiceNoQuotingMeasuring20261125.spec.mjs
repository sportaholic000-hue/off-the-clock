import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compileVoiceSystemInstruction} from '../server/src/voice/voicePromptCompiler.js';

// Plans without phone quoting (Starter; Operator) kept instructions to collect
// measurements, including "Offer to wait while they measure first", though no price
// follows on those plans. Real compiler and guide; synthetic business.
// HANDWRITTEN EXPECTATIONS, before execution:
// - phone quoting off, with and without booking: no "measure", no "caller's units", no
//   "UNSURE HANDLING", no step 4; "Never say 'error', 'not configured' or 'system'." is
//   still there exactly once; question-order steps 1 to 3 are still there;
// - phone quoting on: the units line, step 4, the unsure block and MEASUREMENT HELP are
//   all still there.
const GUIDE=readFileSync(new URL('../server/src/voice/receptionistGuide.md',import.meta.url),'utf8');
const compile=capabilities=>compileVoiceSystemInstruction({guideText:GUIDE,business:{businessName:'[SYNTHETIC] Cedar Roofing',agentName:'Nova'},services:[],
  knowledge:{about:'[SYNTHETIC] roofs',hours:'Mon-Fri',services:'Roof repair',policies:'',faqs:'',prices:'',neverSay:[]},capabilities});
for(const capabilities of [{booking:false,transfer:false,phoneQuoting:false},{booking:true,transfer:true,phoneQuoting:false}])
  test('no phone quoting '+JSON.stringify(capabilities)+': no measuring steps',()=>{
    const text=compile(capabilities);
    for(const gone of ["caller's units",'UNSURE HANDLING','4. Measurements LAST','go measure it','Offer to wait while they measure','MEASUREMENT HELP'])assert.ok(!text.includes(gone),gone);
    assert.equal(text.split("Never say 'error', 'not configured' or 'system'.").length,2);
    for(const kept of ['1. Confirm the service','2. Easy descriptive questions','3. Yes/no scope questions'])assert.ok(text.includes(kept),kept);
  });
test('phone quoting on: the measuring steps stay',()=>{
  const text=compile({booking:true,transfer:true,phoneQuoting:true});
  for(const kept of ["- Talk in the caller's units.",'4. Measurements LAST','UNSURE HANDLING (every size/measurement field):','MEASUREMENT HELP:'])assert.ok(text.includes(kept),kept);
});
