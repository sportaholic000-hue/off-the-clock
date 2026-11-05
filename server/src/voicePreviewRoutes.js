import crypto from 'node:crypto';
import {GoogleGenAI} from '@google/genai';
import {VOICE_NAMES,validateVoiceAndGreeting} from './voice/voiceSettings.js';
import {validLiveModelName} from './voice/liveModelName.js';

// Owner greeting preview spoken by the phone's own live model (GEMINI_MODEL)
// and voice (VOICE_NAMES). Clips are kept per owner, model, voice and greeting,
// so a replay never calls the provider. The API key stays on the server.
export const VOICE_PREVIEW_UNAVAILABLE="Voice preview isn't available right now.";
export const VOICE_PREVIEW_LIMIT_MESSAGE="You've made 20 new previews in the last hour. Previews you already played still replay; try a new greeting later.";
export const VOICE_PREVIEW_HOURLY_LIMIT=20;
const HOUR_MS=60*60*1000,KEEP_PER_OWNER=50,MAX_PCM_BYTES=4*1024*1024,PREVIEW_TIMEOUT_MS=30000;
const SPEAK_INSTRUCTION='You read one phone greeting aloud so a business owner can hear how it sounds on a call. '+
  'Say the user\'s text exactly as written, word for word, in a natural, friendly phone voice. '+
  'Do not add, remove or change any words, do not answer it, and say nothing else.';

export function wavFromPcm(pcm,sampleRate=24000){
  const header=Buffer.alloc(44);
  header.write('RIFF',0);header.writeUInt32LE(36+pcm.length,4);header.write('WAVE',8);header.write('fmt ',12);
  header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(sampleRate,24);
  header.writeUInt32LE(sampleRate*2,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
  return Buffer.concat([header,pcm]);
}

// One live session: the greeting goes in as text, 16-bit PCM audio comes back.
export function speakGreeting({client,model,voiceName,greeting,timeoutMs=PREVIEW_TIMEOUT_MS}){
  return new Promise((resolve,reject)=>{
    const chunks=[];let bytes=0,rate=24000,session=null,done=false;
    const finish=error=>{
      if(done)return;done=true;clearTimeout(timer);
      try{session?.close();}catch{}
      if(error||!bytes)reject(error||Error('No preview audio'));else resolve(wavFromPcm(Buffer.concat(chunks),rate));
    };
    const timer=setTimeout(()=>finish(Error('Preview timeout')),timeoutMs);
    Promise.resolve(client.live.connect({model,config:{responseModalities:['AUDIO'],systemInstruction:SPEAK_INSTRUCTION,
      speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}},callbacks:{
      onopen(){},
      onmessage(message){
        if(done)return;
        const content=message?.serverContent;
        for(const part of content?.modelTurn?.parts||[]){
          const data=part?.inlineData;if(!data)continue;
          const format=/^audio\/pcm(?:;rate=(\d+))?$/.exec(String(data.mimeType||''));
          if(!format||typeof data.data!=='string')return finish(Error('Unexpected preview audio'));
          if(format[1])rate=Number(format[1]);
          const chunk=Buffer.from(data.data,'base64');bytes+=chunk.length;
          if(bytes>MAX_PCM_BYTES)return finish(Error('Preview audio too long'));
          chunks.push(chunk);
        }
        if(content?.turnComplete)finish();
      },
      onerror(){finish(Error('Preview provider error'));},
      onclose(){finish(Error('Preview session closed'));}
    }})).then(opened=>{
      session=opened;
      if(done){try{opened.close();}catch{}return;}
      opened.sendClientContent({turns:[{role:'user',parts:[{text:greeting}]}],turnComplete:true});
    }).catch(error=>finish(error));
  });
}

export function installVoicePreviewRoutes(app,{requireAuth,asyncHandler,ownerQuery,env=process.env,client=null,
  providerAvailable=()=>true,accountAllowed=()=>true,clock=Date.now,speak=speakGreeting,onError=code=>console.error('[voice-preview]',code)}){
  const inFlight=new Map();let provider=client;
  const configured=()=>validLiveModelName(env.GEMINI_MODEL)&&(Boolean(client)||Boolean(String(env.GEMINI_API_KEY||'').trim()));
  const unavailable=res=>res.status(503).json({error:VOICE_PREVIEW_UNAVAILABLE,code:'VOICE_PREVIEW_UNAVAILABLE'});
  app.post('/api/onboarding/voice/preview',requireAuth(['owner']),asyncHandler(async(req,res)=>{
    const ownerId=req.tenantOwnerId,body=req.body||{};
    // The same voice and greeting checks as a save; the name plays no part in a preview.
    const {voiceId,greeting}=validateVoiceAndGreeting({voiceId:body.voiceId,greeting:body.greeting});
    if(!configured()||!providerAvailable())return unavailable(res);
    if(!accountAllowed(ownerId))return res.status(403).json({error:'This account is not eligible for provider operations.'});
    const model=env.GEMINI_MODEL,voiceName=VOICE_NAMES[voiceId];
    const clipKey=crypto.createHash('sha256').update(JSON.stringify([model,voiceName,greeting])).digest('hex');
    const saved=ownerQuery('SELECT audioWav FROM voicePreviewClips WHERE ownerId=? AND clipKey=?').get(ownerId,clipKey);
    if(saved)return res.json({audio:Buffer.from(saved.audioWav).toString('base64'),mimeType:'audio/wav',cached:true});
    const now=clock(),recent=ownerQuery('SELECT COUNT(*) AS n FROM voicePreviewClips WHERE ownerId=? AND createdAt>?').get(ownerId,now-HOUR_MS).n;
    if(recent+(inFlight.get(ownerId)||0)>=VOICE_PREVIEW_HOURLY_LIMIT)
      return res.status(429).json({error:VOICE_PREVIEW_LIMIT_MESSAGE,code:'VOICE_PREVIEW_LIMIT'});
    inFlight.set(ownerId,(inFlight.get(ownerId)||0)+1);
    let audio;
    try{
      provider??=new GoogleGenAI({apiKey:String(env.GEMINI_API_KEY)});
      audio=await speak({client:provider,model,voiceName,greeting});
    }catch{onError('VOICE_PREVIEW_PROVIDER_FAILED');return unavailable(res);}
    finally{const left=(inFlight.get(ownerId)||1)-1;if(left)inFlight.set(ownerId,left);else inFlight.delete(ownerId);}
    ownerQuery('INSERT OR IGNORE INTO voicePreviewClips(ownerId,clipKey,voiceId,model,audioWav,createdAt) VALUES(?,?,?,?,?,?)').run(ownerId,clipKey,voiceId,model,audio,now);
    // Older clips beyond the newest ones are dropped, never inside the hour that is counted.
    ownerQuery(`DELETE FROM voicePreviewClips WHERE ownerId=? AND createdAt<=? AND clipKey NOT IN
      (SELECT clipKey FROM voicePreviewClips WHERE ownerId=? ORDER BY createdAt DESC LIMIT ${KEEP_PER_OWNER})`).run(ownerId,now-HOUR_MS,ownerId);
    return res.json({audio:audio.toString('base64'),mimeType:'audio/wav',cached:false});
  }));
}
