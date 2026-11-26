import test from 'node:test';
import assert from 'node:assert/strict';
import {validateVoiceSettings,validateVoiceAndGreeting,AGENT_NAME_REQUIRED_MESSAGE} from '../server/src/voice/voiceSettings.js';

// The agent name is required again; every other voice-settings check is unchanged.
const base={voiceId:'female',agentName:'Sam',greeting:'[SYNTHETIC] Thanks for calling, how can I help?'};

test('a blank or spaces-only agent name is refused with "Enter a name for your receptionist."',()=>{
  assert.equal(AGENT_NAME_REQUIRED_MESSAGE,'Enter a name for your receptionist.');
  for(const agentName of ['','   ','\t \n',undefined,null])
    assert.throws(()=>validateVoiceSettings({...base,agentName}),error=>error.message==='Enter a name for your receptionist.'&&error.statusCode===400&&error.code==='INVALID_VOICE_SETTINGS',JSON.stringify(agentName));
});
test('a non-blank agent name keeps its checks',()=>{
  assert.equal(validateVoiceSettings({...base,agentName:'  Sam  '}).agentName,'Sam');
  for(const agentName of [7,'x'.repeat(501),'Sam\u0007'])
    assert.throws(()=>validateVoiceSettings({...base,agentName}),/Agent name/,JSON.stringify(agentName));
});
test('voice, greeting, unknown fields, transfer and transcription checks are unchanged',()=>{
  for(const patch of [{voiceId:'robot'},{voiceId:undefined},{greeting:''},{greeting:'   '},{greeting:'x'.repeat(1001)},{greeting:'hi\u0001'}])
    assert.throws(()=>validateVoiceSettings({...base,...patch}),/Choose a voice and enter a greeting/,JSON.stringify(patch));
  assert.throws(()=>validateVoiceSettings({...base,extra:true}),/unsupported fields/);
  assert.throws(()=>validateVoiceSettings({...base,transferNumber:'5065550100'}),/country code/);
  assert.throws(()=>validateVoiceSettings({...base,transcriptionNotice:'yes'}),/transcribed/);
  assert.deepEqual(validateVoiceSettings({...base,transferNumber:'',transcriptionNotice:true}),{voiceId:'female',agentName:'Sam',greeting:base.greeting,transferNumber:'',transcriptionNotice:true});
});
test('the preview check validates only the voice and the greeting',()=>{
  assert.deepEqual(validateVoiceAndGreeting({voiceId:'male',greeting:'  [SYNTHETIC] Hello  '}),{voiceId:'male',greeting:'[SYNTHETIC] Hello'});
  for(const patch of [{voiceId:'robot'},{greeting:''},{greeting:'   '},{greeting:'x'.repeat(1001)},{greeting:'hi\u0001'}])
    assert.throws(()=>validateVoiceAndGreeting({voiceId:'female',greeting:'[SYNTHETIC] Hello',...patch}),/Choose a voice and enter a greeting/,JSON.stringify(patch));
});
