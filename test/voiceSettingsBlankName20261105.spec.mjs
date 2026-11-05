import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVoiceSettings} from '../server/src/voice/voiceSettings.js';

// The agent name is optional; every other voice-settings check is unchanged.
const base={voiceId:'female',agentName:'Sam',greeting:'[SYNTHETIC] Thanks for calling, how can I help?'};

test('a blank or spaces-only agent name is accepted and saved as empty',()=>{
  assert.deepEqual(validateVoiceSettings({...base,agentName:''}),{voiceId:'female',agentName:'',greeting:base.greeting});
  assert.equal(validateVoiceSettings({...base,agentName:'   '}).agentName,'');
});
test('a non-blank agent name keeps its checks',()=>{
  assert.equal(validateVoiceSettings({...base,agentName:'  Sam  '}).agentName,'Sam');
  for(const agentName of [undefined,null,7,'x'.repeat(501),'Sam\u0007'])
    assert.throws(()=>validateVoiceSettings({...base,agentName}),/Agent name/,JSON.stringify(agentName));
});
test('voice, greeting, unknown fields, transfer and transcription checks are unchanged',()=>{
  for(const patch of [{voiceId:'robot'},{voiceId:undefined},{greeting:''},{greeting:'   '},{greeting:'x'.repeat(1001)},{greeting:'hi\u0001'}])
    assert.throws(()=>validateVoiceSettings({...base,agentName:'',...patch}),/Choose a voice and enter a greeting/,JSON.stringify(patch));
  assert.throws(()=>validateVoiceSettings({...base,extra:true}),/unsupported fields/);
  assert.throws(()=>validateVoiceSettings({...base,transferNumber:'5065550100'}),/country code/);
  assert.throws(()=>validateVoiceSettings({...base,transcriptionNotice:'yes'}),/transcribed/);
  assert.deepEqual(validateVoiceSettings({...base,agentName:'',transferNumber:'',transcriptionNotice:true}),{voiceId:'female',agentName:'',greeting:base.greeting,transferNumber:'',transcriptionNotice:true});
});
