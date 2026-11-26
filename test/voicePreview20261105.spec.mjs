import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import Database from 'better-sqlite3';
import {CREATE_TABLE_STATEMENTS,CREATE_INDEX_STATEMENTS} from '../server/src/schema.js';
import {VOICE_NAMES} from '../server/src/voice/voiceSettings.js';
import {installVoicePreviewRoutes,speakGreeting,wavFromPcm,VOICE_PREVIEW_UNAVAILABLE,VOICE_PREVIEW_LIMIT_MESSAGE,VOICE_PREVIEW_HOURLY_LIMIT} from '../server/src/voicePreviewRoutes.js';

// Greeting preview spoken by the phone's live model and voice. Synthetic owners,
// synthetic provider; no real provider or key is used.
const ENV={GEMINI_API_KEY:'synthetic-live-key',GEMINI_MODEL:'synthetic-native-audio-live-model'};
const PCM=Buffer.from([1,0,2,0,3,0,4,0]);

function fakeProvider({mode='speak'}={}){
  const connects=[],sent=[];
  return {connects,sent,client:{live:{connect:async({model,config,callbacks})=>{
    connects.push({model,config});
    const session={sendClientContent:value=>{sent.push(value);
      setImmediate(()=>{
        if(mode==='speak'){
          callbacks.onmessage({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:PCM.subarray(0,4).toString('base64')}}]}}});
          callbacks.onmessage({serverContent:{modelTurn:{parts:[{inlineData:{mimeType:'audio/pcm;rate=24000',data:PCM.subarray(4).toString('base64')}}]},turnComplete:true}});
        }else if(mode==='error')callbacks.onerror(Error('[SYNTHETIC] provider down'));
        else if(mode==='silent')callbacks.onmessage({serverContent:{turnComplete:true}});
        // 'hang' never answers.
      });
    },close(){}};
    return session;
  }}}};
}

async function server(t,{env=ENV,provider=fakeProvider(),providerAvailable=()=>true,accountAllowed=()=>true,clock=()=>Date.parse('2026-11-05T12:00:00Z'),speak}={}){
  const db=new Database(':memory:');for(const sql of CREATE_TABLE_STATEMENTS)db.exec(sql);for(const sql of CREATE_INDEX_STATEMENTS)db.exec(sql);
  const ownerQuery=sql=>{assert.match(sql,/\bownerId\b/,'owner-bound query');return db.prepare(sql);};
  const app=express();app.use(express.json());const roles=[];
  const requireAuth=allowed=>{roles.push(allowed);return (req,res,next)=>{
    const [role,owner]=String(req.get('x-synthetic-session')||'').split(':');
    if(!role)return res.status(401).json({error:'Please sign in.'});
    if(!allowed.includes(role))return res.status(403).json({error:'Owner only.'});
    req.tenantOwnerId=owner;req.role=role;next();
  };};
  const asyncHandler=handler=>(req,res,next)=>Promise.resolve(handler(req,res,next)).catch(next);
  installVoicePreviewRoutes(app,{requireAuth,asyncHandler,ownerQuery,env,client:provider?.client||null,providerAvailable,accountAllowed,clock,...(speak?{speak}:{}),onError:()=>{}});
  app.use((err,_req,res,_next)=>res.status(err.statusCode||500).json({error:err.statusCode<500?err.message:'Internal server error'}));
  const http=app.listen(0,'127.0.0.1');await once(http,'listening');
  t.after(()=>{http.close();db.close();});
  const base='http://127.0.0.1:'+http.address().port;
  async function preview(body,session='owner:synthetic-a'){
    const response=await fetch(base+'/api/onboarding/voice/preview',{method:'POST',headers:{'content-type':'application/json',...(session?{'x-synthetic-session':session}:{})},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),text:''};
  }
  return {db,preview,roles,provider};
}
const GREETING='Thanks for calling [SYNTHETIC] Cedar Co, how can I help?';

test('preview: the phone model and voice speak the greeting and the browser gets WAV audio',async t=>{
  const f=await server(t);
  const reply=await f.preview({voiceId:'male',greeting:'  '+GREETING+'  '});
  assert.equal(reply.status,200);assert.equal(reply.body.mimeType,'audio/wav');assert.equal(reply.body.cached,false);
  const wav=Buffer.from(reply.body.audio,'base64');
  assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.toString('ascii',8,12),'WAVE');
  assert.equal(wav.readUInt32LE(24),24000);assert.equal(wav.readUInt16LE(34),16);assert.deepEqual(wav.subarray(44),PCM);
  assert.equal(f.provider.connects.length,1);
  const {model,config}=f.provider.connects[0];
  assert.equal(model,ENV.GEMINI_MODEL,'same model as the phone');
  assert.equal(config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,VOICE_NAMES.male,'same voice as the phone');
  assert.deepEqual(config.responseModalities,['AUDIO']);
  assert.deepEqual(f.provider.sent,[{turns:[{role:'user',parts:[{text:GREETING}]}],turnComplete:true}],'the saved-greeting form of the text is spoken');
  assert.ok(!JSON.stringify(reply.body).includes(ENV.GEMINI_API_KEY),'the key never reaches the browser');
  assert.deepEqual(f.roles,[['owner']],'owner sign-in only');
});

test('preview: the same voice and greeting replay from the kept clip without the provider',async t=>{
  const f=await server(t);
  const first=await f.preview({voiceId:'female',greeting:GREETING});
  const again=await f.preview({voiceId:'female',greeting:GREETING});
  assert.equal(again.status,200);assert.equal(again.body.cached,true);assert.equal(again.body.audio,first.body.audio);
  assert.equal(f.provider.connects.length,1,'replay costs nothing');
  await f.preview({voiceId:'male',greeting:GREETING});await f.preview({voiceId:'female',greeting:GREETING+' Thanks!'});
  assert.equal(f.provider.connects.length,3,'a different voice or greeting is a new clip');
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM voicePreviewClips WHERE ownerId='synthetic-a'").get().n,3);
  // Another owner never receives this owner's clip.
  const other=await f.preview({voiceId:'female',greeting:GREETING},'owner:synthetic-b');
  assert.equal(other.body.cached,false);assert.equal(f.provider.connects.length,4);
});

test('preview: sign-in and owner role are required',async t=>{
  const f=await server(t);
  assert.equal((await f.preview({voiceId:'female',greeting:GREETING},null)).status,401);
  assert.equal((await f.preview({voiceId:'female',greeting:GREETING},'staff:synthetic-a')).status,403);
  assert.equal(f.provider.connects.length,0);
});

test('preview: the greeting goes through the saved-greeting validation',async t=>{
  const f=await server(t);
  for(const body of [{voiceId:'female',greeting:''},{voiceId:'female',greeting:'   '},{voiceId:'robot',greeting:GREETING},{greeting:GREETING},
    {voiceId:'female',greeting:'x'.repeat(1001)},{voiceId:'female',greeting:'hi\u0001'},{voiceId:'female',greeting:7}]){
    const reply=await f.preview(body);
    assert.equal(reply.status,400,JSON.stringify(body));assert.match(reply.body.error,/Choose a voice and enter a greeting/);
  }
  assert.equal(f.provider.connects.length,0);
});

test('preview: unconfigured voice provider answers with the unavailable message',async t=>{
  for(const options of [{env:{GEMINI_MODEL:ENV.GEMINI_MODEL},provider:null},{env:{GEMINI_API_KEY:ENV.GEMINI_API_KEY},provider:null},
    {env:{...ENV,GEMINI_MODEL:'gemini-2.5-flash'}},{providerAvailable:()=>false}]){
    const f=await server(t,options);
    const reply=await f.preview({voiceId:'female',greeting:GREETING});
    assert.equal(reply.status,503,JSON.stringify(options.env||'provider writes off'));
    assert.equal(reply.body.error,VOICE_PREVIEW_UNAVAILABLE);assert.equal(reply.body.error,"Voice preview isn't available right now.");
    assert.equal(f.provider?.connects.length||0,0);
  }
});

test('preview: provider failure or no audio answers unavailable and keeps nothing',async t=>{
  for(const mode of ['error','silent']){
    const f=await server(t,{provider:fakeProvider({mode})});
    const reply=await f.preview({voiceId:'female',greeting:GREETING});
    assert.equal(reply.status,503,mode);assert.equal(reply.body.error,VOICE_PREVIEW_UNAVAILABLE);
    assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM voicePreviewClips').get().n,0);
  }
  // A failed preview does not use up the hourly allowance.
  let calls=0;
  const f=await server(t,{speak:async()=>{calls++;if(calls<=VOICE_PREVIEW_HOURLY_LIMIT)throw Error('[SYNTHETIC] down');return wavFromPcm(PCM);}});
  for(let n=0;n<VOICE_PREVIEW_HOURLY_LIMIT;n++)assert.equal((await f.preview({voiceId:'female',greeting:GREETING+' '+n})).status,503);
  assert.equal((await f.preview({voiceId:'female',greeting:GREETING})).status,200);
});

test('preview: at most 20 new previews per owner per hour; replays and the next hour still work',async t=>{
  let now=Date.parse('2026-11-05T12:00:00Z');
  const f=await server(t,{clock:()=>now});
  for(let n=0;n<VOICE_PREVIEW_HOURLY_LIMIT;n++){
    const reply=await f.preview({voiceId:'female',greeting:GREETING+' #'+n});assert.equal(reply.status,200,'preview '+(n+1));now+=60000;
  }
  const blocked=await f.preview({voiceId:'female',greeting:GREETING+' #new'});
  assert.equal(blocked.status,429);assert.equal(blocked.body.error,VOICE_PREVIEW_LIMIT_MESSAGE);
  assert.equal(f.provider.connects.length,VOICE_PREVIEW_HOURLY_LIMIT,'the 21st new preview never reaches the provider');
  assert.equal((await f.preview({voiceId:'female',greeting:GREETING+' #3'})).body.cached,true,'kept clips still replay at the limit');
  assert.equal((await f.preview({voiceId:'female',greeting:GREETING},'owner:synthetic-b')).status,200,'the limit is per owner');
  now=Date.parse('2026-11-05T13:00:00Z')+1;
  assert.equal((await f.preview({voiceId:'female',greeting:GREETING+' #new'})).status,200,'the oldest preview has left the hour');
});

test('speakGreeting: a provider that never answers times out',async()=>{
  const provider=fakeProvider({mode:'hang'}),started=Date.now();
  await assert.rejects(speakGreeting({client:provider.client,model:ENV.GEMINI_MODEL,voiceName:VOICE_NAMES.female,greeting:GREETING,timeoutMs:50}),/timeout/);
  assert.ok(Date.now()-started<2000);
});

test('wavFromPcm: 16-bit mono WAV header matches the audio length',()=>{
  const wav=wavFromPcm(Buffer.alloc(480),24000);
  assert.equal(wav.length,524);assert.equal(wav.readUInt32LE(4),516);assert.equal(wav.readUInt32LE(40),480);
  assert.equal(wav.readUInt16LE(22),1);assert.equal(wav.readUInt32LE(28),48000);assert.equal(wav.readUInt16LE(32),2);
});
