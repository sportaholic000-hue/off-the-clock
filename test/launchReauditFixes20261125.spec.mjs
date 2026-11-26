import './pricebookTestEnv.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {harness,TO} from './voiceLifecycle20261006Fixture.mjs';
import {createGoogleGenAiLiveSessionOpener} from '../server/src/voice/googleGenAiLiveAdapter.js';
import {speakGreeting} from '../server/src/voicePreviewRoutes.js';
import {VOICE_NAMES,TWILIO_BACKUP_VOICES} from '../server/src/voice/voiceSettings.js';

// Re-audit of claude/launch @ dfc8652f (2026-11-25), findings outside the quote engine.
// HANDWRITTEN EXPECTATIONS, before execution:
// - knowledge drafting: a reply that starts with a thought part still parses; a reply
//   without one parses exactly as before;
// - phone calls and the greeting preview never play a part marked thought: true; every
//   other audio part plays as before;
// - the transfer announcement to the owner ("... Press 1 to accept.") is spoken in the
//   business's backup voice (Chirp3-HD Kore for the female voice, Charon for the male);
//   with no saved voice it has no voice attribute, as before;
// - pressing Cancel on Google's consent screen: test/googleCalendarCancel20261125.spec.mjs;
// - the live demo no longer ends the audio stream mid-call: audioStreamEnd is sent only
//   when the microphone is released;
// - the site README no longer sends readers to an old branch for the signup switch.

const ROOT=new URL('..',import.meta.url);
const settle=()=>new Promise(resolve=>setTimeout(resolve,0)).then(()=>new Promise(resolve=>setTimeout(resolve,0)));

test('knowledge draft: a thought part before the JSON answer is ignored',async()=>{
  const saved={key:process.env.GEMINI_API_KEY,model:process.env.GEMINI_TEXT_MODEL,fetch:globalThis.fetch};
  process.env.GEMINI_API_KEY='SYNTHETIC_GEMINI_KEY';process.env.GEMINI_TEXT_MODEL='synthetic-text-model';
  const {draftKnowledgeBase}=await import('../server/src/platformIntegrations.js');
  const answer='{"about":"[SYNTHETIC] Cedar Co","hours":"Mon-Fri","services":"","policies":"","faqs":[],"neverSay":[]}';
  const sent=[];
  try{
    for(const parts of [[{text:answer}],[{text:'**Drafting** the [SYNTHETIC] knowledge base',thought:true},{text:answer}],[{text:answer,thoughtSignature:'[SYNTHETIC]'}]]){
      globalThis.fetch=async(url,options)=>{sent.push(JSON.parse(options.body));return {ok:true,status:200,json:async()=>({candidates:[{content:{parts}}]})};};
      const draft=await draftKnowledgeBase({businessName:'[SYNTHETIC] Cedar Co',businessTypes:['roofing']});
      assert.equal(draft.about,'[SYNTHETIC] Cedar Co');assert.equal(draft.hours,'Mon-Fri');
    }
    // The request itself is unchanged: no thinking setting is added.
    for(const body of sent)assert.deepEqual(body.generationConfig,{responseMimeType:'application/json',temperature:0.2});
  }finally{
    globalThis.fetch=saved.fetch;
    if(saved.key===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=saved.key;
    if(saved.model===undefined)delete process.env.GEMINI_TEXT_MODEL;else process.env.GEMINI_TEXT_MODEL=saved.model;
  }
});

test('phone call: an audio part marked thought is not played; the others are',async()=>{
  const events=[];let callbacks;
  const open=createGoogleGenAiLiveSessionOpener({client:{live:{async connect(value){callbacks=value.callbacks;return {sendRealtimeInput(){},sendToolResponse(){},close(){}};}}},
    model:'synthetic-live-model',systemInstruction:()=>'[SYNTHETIC]',toolDeclarations:[{name:'getQuote',description:'[SYNTHETIC]',parameters:{type:'OBJECT',properties:{},required:[]}}],voiceName:'Kore'});
  await open({context:{ownerId:'owner-a',callSid:'CA'+'a'.repeat(32)},session:{callRecordId:'call-a'},
    audio:{inputMimeType:'audio/pcm;rate=16000',outputMimeType:'audio/pcm;rate=24000'},
    callbacks:{async onAudio(value){events.push(value.data);},async onInterruption(){},async onTranscript(){},async onToolCall(){},async onToolCallCancellation(){},async onError(){events.push('error');},async onClose(){}}});
  callbacks.onmessage({serverContent:{modelTurn:{parts:[
    {inlineData:{data:'AAEC',mimeType:'audio/pcm;rate=24000'}},
    {inlineData:{data:'BBBB',mimeType:'audio/pcm;rate=24000'},thought:true},
    {inlineData:{data:'CCCC',mimeType:'audio/pcm;rate=24000'},thought:false}]}}});
  await settle();
  assert.deepEqual(events,['AAEC','CCCC']);
});

test('greeting preview: an audio part marked thought is not part of the clip',async()=>{
  const pcm=Buffer.from([1,0,2,0]),other=Buffer.from([9,0,9,0]);
  const client={live:{connect:async({callbacks})=>({sendClientContent(){setImmediate(()=>callbacks.onmessage({serverContent:{turnComplete:true,modelTurn:{parts:[
    {inlineData:{mimeType:'audio/pcm;rate=24000',data:other.toString('base64')},thought:true},
    {inlineData:{mimeType:'audio/pcm;rate=24000',data:pcm.toString('base64')}}]}}}));},close(){}})}};
  const wav=await speakGreeting({client,model:'synthetic-live-model',voiceName:VOICE_NAMES.female,greeting:'[SYNTHETIC] Thanks for calling.',timeoutMs:2000});
  assert.deepEqual(wav.subarray(44),pcm);
});

const allDay=Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'00:00',end:'23:59'}]]));
const DIRECT='+19025550188';
for(const [voiceId,expected] of [['female','Google.en-US-Chirp3-HD-Kore'],['male','Google.en-US-Chirp3-HD-Charon'],[null,null]])
  test(`transfer announcement to the owner: saved voice ${voiceId} -> ${expected||'no voice attribute'}`,async t=>{
    if(voiceId)assert.equal(TWILIO_BACKUP_VOICES[voiceId],expected);
    const h=await harness(t,{beforeInstall:f=>f.db.prepare('UPDATE businessProfiles SET knowledgeBaseJson=?,voiceId=? WHERE ownerId=?')
      .run(JSON.stringify({about:'Synthetic business',hours:'Monday to Friday',transferWindows:allDay,transferNumber:DIRECT}),voiceId,'synthetic-a')});
    const c=await h.connect();
    await h.tool(c.callback,'transferCall',{reason:'caller_requested',customerConfirmed:true,notes:'[SYNTHETIC] The caller asks about the gate.'});
    const twiml=h.writes.find(w=>w[0]==='call')[2].twiml;
    const accept=new URL(twiml.match(/<Number url="([^"]+)"/)[1]).pathname;
    const child={AccountSid:c.params.AccountSid,ParentCallSid:c.params.CallSid,CallSid:'CA'+'d'.repeat(32),From:TO,To:DIRECT,Direction:'outbound-dial'};
    const body=await (await h.post(accept,child)).text();
    assert.match(body,/Press 1 to accept\.<\/Say>/);
    const say=body.match(/<Say([^>]*)>/)[1];
    assert.equal(say,expected?` voice="${expected}"`:'');
  });

test('live demo: the audio stream is ended only when the microphone is released',()=>{
  const source=readFileSync(new URL('server/public/otc-live-demo.js',ROOT),'utf8');
  const ends=[...source.matchAll(/audioStreamEnd: true/g)];
  assert.equal(ends.length,1);
  const release=source.slice(source.indexOf('function releaseMic()'),source.indexOf('function teardown()'));
  assert.ok(release.includes('audioStreamEnd: true'));
});

test('site README: the signup switch is described as it works on this branch',()=>{
  const readme=readFileSync(new URL('site/www/README.md',ROOT),'utf8');
  assert.ok(!readme.includes('claude/launch-hardening-20261029'));
  assert.match(readme,/OWNER_SIGNUP_ENABLED=false/);
  const signup=readFileSync(new URL('server/src/ownerSignup.js',ROOT),'utf8');
  assert.match(signup,/env\.OWNER_SIGNUP_ENABLED !== 'false'/);
});
