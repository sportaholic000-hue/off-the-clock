// The website demo's receptionist-settings fact matches Settings: a name is
// required (a blank name is refused) and a greeting is always saved.
// Expected wording written before execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {demoInstructions} from '../server/src/demo/demoInstructions.js';
import {validateVoiceSettings,AGENT_NAME_REQUIRED_MESSAGE} from '../server/src/voice/voiceSettings.js';

const fact='- The owner sets up how the receptionist sounds, in Settings, any time: a male or a female voice, a name for the receptionist, and their own greeting, which is spoken exactly as they write it. Until they change it, the greeting gives the business name and the receptionist\'s name.';

for(const name of ['Miles','Nova'])test(`demo receptionist settings fact matches Settings: ${name}`,()=>{
  const text=demoInstructions(name);
  assert.equal(text.split(fact).length,2,'the corrected fact appears exactly once');
  assert.doesNotMatch(text,/no name at all/);
  assert.doesNotMatch(text,/With no name/);
  assert.doesNotMatch(text,/no custom greeting/);
});
test('Settings still refuse a blank name and a blank greeting, which the demo fact relies on',()=>{
  assert.throws(()=>validateVoiceSettings({voiceId:'female',agentName:'',greeting:'[SYNTHETIC] Hello'}),e=>e.message===AGENT_NAME_REQUIRED_MESSAGE);
  assert.throws(()=>validateVoiceSettings({voiceId:'female',agentName:'Sam',greeting:''}),/enter a greeting/);
});
