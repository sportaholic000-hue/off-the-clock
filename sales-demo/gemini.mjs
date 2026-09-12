import { systemInstruction } from './policy.mjs';

export const ENDPOINT='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
export function setupMessage(config,agent){
  return {setup:{model:`models/${config.model}`,
    generationConfig:{responseModalities:['AUDIO'],maxOutputTokens:1024,
      speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:config.agents[agent].voice}}}},
    systemInstruction:{parts:[{text:systemInstruction(config.agents[agent].name)}]},
    inputAudioTranscription:{},outputAudioTranscription:{},
    realtimeInputConfig:{automaticActivityDetection:{silenceDurationMs:700,prefixPaddingMs:200},activityHandling:'START_OF_ACTIVITY_INTERRUPTS'},
    contextWindowCompression:{triggerTokens:12000,slidingWindow:{targetTokens:6000}},
    // No customer tools, search tools, external URLs, tenant data or price books.
  }};
}
export class GeminiLive {
  constructor(config,agent,events,{Socket=globalThis.WebSocket}={}){
    this.config=config;this.events=events;this.closed=false;this.ready=false;this.queued=0;this.queue=Promise.resolve();
    const u=new URL(ENDPOINT);u.searchParams.set('key',config.key);
    this.ws=new Socket(u.toString());
    this.ws.addEventListener('open',()=>{if(!this.closed)this.ws.send(JSON.stringify(setupMessage(config,agent)));});
    this.ws.addEventListener('message',event=>{
      const size=event.data?.size??event.data?.byteLength??Buffer.byteLength(String(event.data));
      this.queued+=size;
      if(size>1_048_576||this.queued>2_097_152)return this.fail('provider');
      this.queue=this.queue.then(async()=>{
        if(this.closed)return;
        const text=typeof event.data==='string'?event.data:typeof event.data.text==='function'?await event.data.text():Buffer.from(event.data).toString('utf8');
        const message=JSON.parse(text);
        this.receive(message);
      }).catch(()=>this.fail('provider')).finally(()=>{this.queued-=size;});
    });
    this.ws.addEventListener('error',()=>this.fail('provider'));
    this.ws.addEventListener('close',()=>{if(!this.closed){this.closed=true;events.close('provider');}});
  }
  receive(m){
    if(!m||typeof m!=='object'||Array.isArray(m))return this.fail('provider');
    if(m.error||m.toolCall||m.goAway)return this.fail('provider');
    if(m.usageMetadata)this.events.usage(m.usageMetadata);
    if(this.closed)return;
    if(m.setupComplete){if(this.ready)return this.fail('provider');this.ready=true;this.events.ready();}
    const s=m.serverContent;if(!s)return;
    if(!this.ready)return this.fail('provider');
    if(s.interrupted)this.events.interrupt();
    if(s.inputTranscription?.text)this.events.transcript('user',String(s.inputTranscription.text));
    if(s.outputTranscription?.text)this.events.transcript('agent',String(s.outputTranscription.text));
    for(const part of s.modelTurn?.parts||[]){
      if(part.thought)continue; // Never expose thinking/internal text.
      if(part.inlineData){
        const {data,mimeType}=part.inlineData;
        if(typeof data!=='string'||data.length>350_000||!/^audio\/pcm(?:;rate=24000)?$/.test(mimeType||'')||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data))return this.fail('provider');
        const audio=Buffer.from(data,'base64');if(!audio.length||audio.length%2)return this.fail('provider');
        this.events.audio(audio);
      }
    }
    if(s.turnComplete)this.events.turnComplete();
    if(s.waitingForInput)this.events.waiting();
  }
  send(payload){
    if(this.closed||!this.ready)throw new Error('Provider not ready.');
    if(this.ws.bufferedAmount>512_000){this.fail('provider');throw new Error('Provider backpressure.');}
    this.ws.send(JSON.stringify(payload));
  }
  text(text){this.send({clientContent:{turns:[{role:'user',parts:[{text}]}],turnComplete:true}});}
  audio(bytes){this.send({realtimeInput:{audio:{data:bytes.toString('base64'),mimeType:'audio/pcm;rate=16000'}}});}
  audioEnd(){if(this.ready&&!this.closed)this.send({realtimeInput:{audioStreamEnd:true}});}
  fail(code){if(this.closed)return;this.close();this.events.close(code);}
  close(){if(this.closed)return;this.closed=true;this.ready=false;try{this.ws.close(1000,'Demo ended');}catch{}}
}
