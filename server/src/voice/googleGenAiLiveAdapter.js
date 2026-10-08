// SDK boundary: injected clients let tests execute without a live provider.
import {VOICE_RESULT_BYTES} from './voiceQuotePresentation.js';
import {validLiveModelName} from './liveModelName.js';
import {VOICE_INSTRUCTION_CHARACTER_LIMIT} from './voiceProviderLimits.js';
export class GoogleGenAiLiveAdapterError extends Error{constructor(code){super('The live voice provider is unavailable.');this.name='GoogleGenAiLiveAdapterError';this.code=code;}}
const fail=code=>{throw new GoogleGenAiLiveAdapterError(code);};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
function jsonData(value,maxBytes=VOICE_RESULT_BYTES){
  let nodes=0;
  function visit(item,depth){
    if(++nodes>20000||depth>12)fail('INVALID_GOOGLE_LIVE_MESSAGE');
    if(item===null||typeof item==='string'||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return;
    if(Array.isArray(item)){for(const child of item)visit(child,depth+1);return;}
    if(!plain(item))fail('INVALID_GOOGLE_LIVE_MESSAGE');
    for(const key of Reflect.ownKeys(item)){if(typeof key!=='string'||['__proto__','constructor','prototype'].includes(key))fail('INVALID_GOOGLE_LIVE_MESSAGE');const descriptor=Object.getOwnPropertyDescriptor(item,key);if(!descriptor||!('value' in descriptor))fail('INVALID_GOOGLE_LIVE_MESSAGE');visit(descriptor.value,depth+1);}
  }
  visit(value,0);if(Buffer.byteLength(JSON.stringify(value),'utf8')>maxBytes)fail('INVALID_GOOGLE_LIVE_MESSAGE');
}
export function createGoogleGenAiLiveSessionOpener({client,model,systemInstruction,toolDeclarations,voiceName,connectTimeoutMs=15000,greetOnConnect=false}={}){
  if(typeof client?.live?.connect!=='function')fail('GOOGLE_LIVE_CLIENT_REQUIRED');
  if(!validLiveModelName(model))fail('GOOGLE_LIVE_MODEL_REQUIRED');
  if(!(typeof systemInstruction==='string'&&systemInstruction.trim())&&typeof systemInstruction!=='function')fail('GOOGLE_LIVE_INSTRUCTION_REQUIRED');
  if(!Array.isArray(toolDeclarations)||!toolDeclarations.length)fail('GOOGLE_LIVE_TOOLS_REQUIRED');
  if(!Number.isSafeInteger(connectTimeoutMs)||connectTimeoutMs<100||connectTimeoutMs>60000)fail('GOOGLE_LIVE_TIMEOUT_INVALID');jsonData(toolDeclarations);
  return async function open({context,session,audio,callbacks}={}){
    if(!plain(callbacks)||['onAudio','onInterruption','onTranscript','onToolCall','onError','onClose'].some(key=>typeof callbacks[key]!=='function'))fail('GOOGLE_LIVE_CALLBACKS_REQUIRED');
    if(audio?.inputMimeType!=='audio/pcm;rate=16000'||audio?.outputMimeType!=='audio/pcm;rate=24000')fail('GOOGLE_LIVE_AUDIO_FORMAT_INVALID');
    let instruction;try{instruction=typeof systemInstruction==='function'?await systemInstruction({context,session}):systemInstruction;}catch{fail('GOOGLE_LIVE_INSTRUCTION_FAILED');}
    if(typeof instruction!=='string'||!instruction.trim()||instruction.length>VOICE_INSTRUCTION_CHARACTER_LIMIT)fail('GOOGLE_LIVE_INSTRUCTION_FAILED');
    let provider,closed=false,closing=false,failed=false,modelText='',queue=Promise.resolve(),transcriptions=Promise.resolve(),closePromise;
    function close(){
      if(closePromise)return closePromise;closing=true;
      closePromise=Promise.resolve().then(async()=>{
        if(provider)try{await provider.sendRealtimeInput({audioStreamEnd:true});}catch{}
        await transcriptions;await flush(false);await queue;
        if(provider)try{await provider.close();}catch{}
        // A provider may deliver its final transcription as it acknowledges
        // close. Text remains accepted until that acknowledgement is drained.
        await transcriptions;await flush(false);closed=true;
      });return closePromise;
    }
    function error(){
      if(failed||closed)return;failed=true;
      // Never await bridge shutdown from its own provider queue: shutdown
      // drains this queue before persisting the final call outcome.
      Promise.resolve(callbacks.onError()).catch(()=>{});void close();
    }
    async function flush(final){if(!modelText)return;const text=modelText;modelText='';await callbacks.onTranscript({text,role:'model',final});}
    async function message(value){
      if(closed)return;jsonData(value);const body=value.serverContent;
      if(body){
        if(!plain(body))fail('INVALID_GOOGLE_LIVE_MESSAGE');
        for(const part of (closing||failed?[]:body.modelTurn?.parts||[]))if(part.inlineData){if(typeof part.inlineData.data!=='string'||part.inlineData.mimeType!==audio.outputMimeType)fail('INVALID_GOOGLE_LIVE_MESSAGE');await callbacks.onAudio({data:part.inlineData.data,mimeType:part.inlineData.mimeType});}
        if(body.interrupted&&!closing&&!failed)await callbacks.onInterruption();
      }
      if(value.toolCall&&!closing&&!failed){
        if(!Array.isArray(value.toolCall.functionCalls)||value.toolCall.functionCalls.length>20)fail('INVALID_GOOGLE_LIVE_MESSAGE');
        for(const call of value.toolCall.functionCalls){if(!plain(call)||typeof call.id!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(call.id)||!toolDeclarations.some(tool=>tool.name===call.name)||!plain(call.args))fail('INVALID_GOOGLE_LIVE_MESSAGE');jsonData(call.args,32768);await callbacks.onToolCall({name:call.name,args:call.args,toolCallId:call.id});}
      }
    }
    const enqueue=work=>{if(closing||closed)return;queue=queue.then(work).catch(error);};
    function acceptMessage(value){
      if(closed)return;
      try{jsonData(value);}catch{error();return;}
      // Text receipt has its own queue. A slow email/calendar/tool operation must
      // never prevent already received caller words from reaching persistence.
      const received=transcriptions.then(async()=>{
        const body=value.serverContent;if(!body)return;if(!plain(body))fail('INVALID_GOOGLE_LIVE_MESSAGE');
        if(body.inputTranscription?.text){if(typeof body.inputTranscription.text!=='string')fail('INVALID_GOOGLE_LIVE_MESSAGE');await callbacks.onTranscript({text:body.inputTranscription.text,role:'user',final:true});}
        if(body.outputTranscription?.text){if(typeof body.outputTranscription.text!=='string')fail('INVALID_GOOGLE_LIVE_MESSAGE');modelText+=body.outputTranscription.text;if(modelText.length>16384)fail('INVALID_GOOGLE_LIVE_MESSAGE');}
        if(body.interrupted)await flush(false);else if(body.turnComplete)await flush(true);
      });
      transcriptions=received.catch(error);
      enqueue(async()=>{await received;await message(value);});
    }
    const config={responseModalities:['AUDIO'],inputAudioTranscription:{},outputAudioTranscription:{},systemInstruction:instruction,tools:[{functionDeclarations:toolDeclarations}],...(voiceName?{speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}}:{})};
    let timer;
    try{
      const connecting=Promise.resolve(client.live.connect({model,config,callbacks:{onmessage:acceptMessage,onerror:()=>enqueue(error),onclose:()=>enqueue(async()=>{if(!closed){await flush(false);Promise.resolve(callbacks.onClose()).catch(()=>{});void close();}})}}));
      connecting.then(value=>{if(closed){try{value.close();}catch{}}}).catch(()=>{});
      provider=await Promise.race([connecting,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new GoogleGenAiLiveAdapterError('GEMINI_CONNECT_FAILED')),connectTimeoutMs);})]);
      if(closed||failed||['sendRealtimeInput','sendToolResponse','close'].some(key=>typeof provider?.[key]!=='function'))throw Error();
      if(greetOnConnect&&typeof provider.sendClientContent==='function')provider.sendClientContent({turns:[{role:'user',parts:[{text:'[Call connected. Speak business.greeting from OWNER_FACTS_JSON exactly if configured; otherwise give the brief business and agent greeting. This is a connection event, not a customer request.]'}]}],turnComplete:true});
    }catch{await close();fail('GEMINI_CONNECT_FAILED');}finally{clearTimeout(timer);}
    return Object.freeze({
      async sendAudio(value){
        if(closed||failed||value?.mimeType!==audio.inputMimeType||!(Buffer.isBuffer(value.data)||value.data instanceof Uint8Array)||!value.data.byteLength||value.data.byteLength%2||value.data.byteLength>32768)fail('INVALID_GOOGLE_LIVE_AUDIO');
        try{await provider.sendRealtimeInput({audio:{data:Buffer.from(value.data).toString('base64'),mimeType:value.mimeType}});}catch{await error();fail('GOOGLE_LIVE_SEND_FAILED');}
      },
      async sendToolResponse(value){
        if(closed||failed||typeof value?.toolCallId!=='string'||typeof value?.name!=='string'||!toolDeclarations.some(tool=>tool.name===value.name))fail('INVALID_GOOGLE_LIVE_TOOL_RESPONSE');jsonData(value.response);
        try{await provider.sendToolResponse({functionResponses:[{id:value.toolCallId,name:value.name,response:value.response}]});}catch{await error();fail('GOOGLE_LIVE_SEND_FAILED');}
      },close,whenIdle:()=>Promise.all([queue,transcriptions])
    });
  };
}
