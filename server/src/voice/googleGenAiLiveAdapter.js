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
export function createGoogleGenAiLiveSessionOpener({client,model,systemInstruction,instructionRevision,instructionRefreshMs=1000,toolDeclarations,voiceName,connectTimeoutMs=15000,greetOnConnect=false,transparentSessionResumption=false}={}){
  if(typeof client?.live?.connect!=='function')fail('GOOGLE_LIVE_CLIENT_REQUIRED');
  if(!validLiveModelName(model))fail('GOOGLE_LIVE_MODEL_REQUIRED');
  if(!(typeof systemInstruction==='string'&&systemInstruction.trim())&&typeof systemInstruction!=='function')fail('GOOGLE_LIVE_INSTRUCTION_REQUIRED');
  if(!Array.isArray(toolDeclarations)||!toolDeclarations.length)fail('GOOGLE_LIVE_TOOLS_REQUIRED');
  if(!Number.isSafeInteger(connectTimeoutMs)||connectTimeoutMs<100||connectTimeoutMs>60000)fail('GOOGLE_LIVE_TIMEOUT_INVALID');jsonData(toolDeclarations);
  if(instructionRevision!==undefined&&typeof instructionRevision!=='function'||!Number.isSafeInteger(instructionRefreshMs)||instructionRefreshMs<10||instructionRefreshMs>60000)fail('GOOGLE_LIVE_INSTRUCTION_FAILED');
  return async function open({context,session,audio,callbacks}={}){
    if(!plain(callbacks)||['onAudio','onInterruption','onTranscript','onToolCall','onError','onClose'].some(key=>typeof callbacks[key]!=='function'))fail('GOOGLE_LIVE_CALLBACKS_REQUIRED');
    if(audio?.inputMimeType!=='audio/pcm;rate=16000'||audio?.outputMimeType!=='audio/pcm;rate=24000')fail('GOOGLE_LIVE_AUDIO_FORMAT_INVALID');
    function revision(){
      if(!instructionRevision)return undefined;
      const value=instructionRevision({context,session});
      if(typeof value!=='string'||!value||value.length>4096)fail('GOOGLE_LIVE_INSTRUCTION_FAILED');
      return value;
    }
    async function readInstruction(){
      try{
        for(let attempt=0;attempt<8;attempt++){
          const before=revision(),text=typeof systemInstruction==='function'?await systemInstruction({context,session}):systemInstruction;
          if(typeof text!=='string'||!text.trim()||text.length>VOICE_INSTRUCTION_CHARACTER_LIMIT)break;
          if(before===revision())return {text,revision:before};
        }
      }catch{}
      fail('GOOGLE_LIVE_INSTRUCTION_FAILED');
    }
    let currentInstruction=await readInstruction();
    let provider,closed=false,closing=false,failed=false,modelText='',queue=Promise.resolve(),transcriptions=Promise.resolve(),closePromise;
    let generation=0,resumeHandle=null,reconnectPromise=null,latestResumable=true,goAwayTimer=null,goAwayEpoch=null;
    let outbound=Promise.resolve(),clientMessageIndex=0,lastConsumedIndex=-1,bufferedAudioBytes=0;
    let input=Promise.resolve(),refreshPromise=null,refreshTimer=null,factsStale=false,sessionStarted=false,resolveTools,outputCleared=Promise.resolve();
    const pendingTools=new Map(),history=[];
    let historyBytes=0,historyOmitted=false;
    function remember(role,text){
      const turn={role,parts:[{text}]},bytes=Buffer.byteLength(JSON.stringify(turn));
      if(bytes>32768){historyOmitted=true;return;}
      history.push({turn,bytes});historyBytes+=bytes;
      while(history.length>24||historyBytes>32768){historyBytes-=history.shift().bytes;historyOmitted=true;}
    }
    function toolsDrained(){if(!pendingTools.size&&resolveTools){resolveTools();resolveTools=null;}}
    function markStale(){
      if(factsStale)return;factsStale=true;
      transcriptions=transcriptions.then(()=>flush(false)).catch(error);
      // Clear already queued telephony output as soon as a saved edit is seen.
      outputCleared=Promise.resolve(callbacks.onInterruption());outputCleared.catch(error);
    }
    function changed(){return Boolean(instructionRevision)&&revision()!==currentInstruction.revision;}
    function outputCurrent(epoch,receivedWhileCurrent,finalTranscript=false){
      if(closing&&!finalTranscript||closed||failed||!receivedWhileCurrent||epoch!==generation)return false;
      // Receipt and delivery can be separated by slow tool/audio callbacks.
      // Recheck each part at delivery, including parts of the same message.
      try{if(changed()){markStale();void refresh().catch(()=>{});}}catch{error();return false;}
      return !factsStale;
    }
    const audioBuffer=[];
    const removeOldestAudio=()=>{const removed=audioBuffer.shift();if(removed)bufferedAudioBytes-=removed.bytes;};
    const clearGoAway=()=>{if(goAwayTimer)clearTimeout(goAwayTimer);goAwayTimer=null;goAwayEpoch=null;};
    function close(){
      if(closePromise)return closePromise;closing=true;clearGoAway();clearInterval(refreshTimer);
      pendingTools.clear();toolsDrained();
      closePromise=Promise.resolve().then(async()=>{
        if(reconnectPromise)await reconnectPromise.catch(()=>{});
        if(provider)try{await provider.sendRealtimeInput({audioStreamEnd:true});}catch{}
        await transcriptions;await flush(false);await queue;
        if(provider)try{await provider.close();}catch{}
        // A provider may deliver its final transcription as it acknowledges
        // close. Text remains accepted until that acknowledgement is drained.
        await transcriptions;await flush(false);closed=true;
      });return closePromise;
    }
    function error(){
      if(failed||closed)return;failed=true;clearGoAway();clearInterval(refreshTimer);
      pendingTools.clear();toolsDrained();
      // Never await bridge shutdown from its own provider queue: shutdown
      // drains this queue before persisting the final call outcome.
      Promise.resolve(callbacks.onError()).catch(()=>{});void close();
    }
    async function flush(final){if(!modelText)return;const text=modelText;modelText='';await callbacks.onTranscript({text,role:'model',final});remember('model',text);}
    async function message(value,epoch,outputAllowed){
      if(closed)return;jsonData(value);const body=value.serverContent;
      if(body){
        if(!plain(body))fail('INVALID_GOOGLE_LIVE_MESSAGE');
        for(const part of body.modelTurn?.parts||[]){if(!outputCurrent(epoch,outputAllowed))break;if(part.inlineData){if(typeof part.inlineData.data!=='string'||part.inlineData.mimeType!==audio.outputMimeType)fail('INVALID_GOOGLE_LIVE_MESSAGE');await callbacks.onAudio({data:part.inlineData.data,mimeType:part.inlineData.mimeType});}}
        if(body.interrupted&&!closing&&!failed&&outputAllowed&&epoch===generation)await callbacks.onInterruption();
      }
      if(value.toolCall&&!closing&&!failed){
        if(!Array.isArray(value.toolCall.functionCalls)||value.toolCall.functionCalls.length>20)fail('INVALID_GOOGLE_LIVE_MESSAGE');
        for(const call of value.toolCall.functionCalls){if(!plain(call)||typeof call.id!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(call.id)||!toolDeclarations.some(tool=>tool.name===call.name)||!plain(call.args))fail('INVALID_GOOGLE_LIVE_MESSAGE');jsonData(call.args,32768);await callbacks.onToolCall({name:call.name,args:call.args,toolCallId:call.id});}
      }
    }
    const enqueue=work=>{if(closing||closed)return;queue=queue.then(work).catch(error);};
    function acceptMessage(value,epoch){
      if(closed)return;
      try{jsonData(value);}catch{error();return;}
      const body=value.serverContent;
      const outputAllowed=!factsStale;
      // Text receipt has its own queue. A slow email/calendar/tool operation must
      // never prevent already received caller words from reaching persistence.
      const received=transcriptions.then(async()=>{
        if(!body)return;if(!plain(body))fail('INVALID_GOOGLE_LIVE_MESSAGE');
        if(body.inputTranscription?.text){if(typeof body.inputTranscription.text!=='string')fail('INVALID_GOOGLE_LIVE_MESSAGE');await callbacks.onTranscript({text:body.inputTranscription.text,role:'user',final:true});remember('user',body.inputTranscription.text);}
        if(body.outputTranscription?.text&&outputCurrent(epoch,outputAllowed,true)){if(typeof body.outputTranscription.text!=='string')fail('INVALID_GOOGLE_LIVE_MESSAGE');modelText+=body.outputTranscription.text;if(modelText.length>16384)fail('INVALID_GOOGLE_LIVE_MESSAGE');}
        if(body.interrupted)await flush(false);else if(body.turnComplete)await flush(true);
      });
      transcriptions=received.catch(error);
      enqueue(async()=>{await received;await message(value,epoch,outputAllowed);
        if(body?.turnComplete&&goAwayEpoch===epoch&&epoch===generation&&!factsStale)void reconnect(generation);
      });
    }
    // The empty sliding window uses Google's default trigger and target sizes.
    // Audio arriving during a WebSocket switch waits in the bridge's bounded,
    // ordered input queue; it is submitted once to the resumed connection.
    const config={responseModalities:['AUDIO'],inputAudioTranscription:{},outputAudioTranscription:{},tools:[{functionDeclarations:toolDeclarations}],sessionResumption:transparentSessionResumption?{transparent:true}:{},contextWindowCompression:{slidingWindow:{}},...(voiceName?{speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}}:{})};
    async function connect(handle,epoch,instructions){
      instructions??=await readInstruction();
      const options={...config,systemInstruction:instructions.text,sessionResumption:handle?{...config.sessionResumption,handle}:config.sessionResumption};
      let timer;
      const connecting=Promise.resolve(client.live.connect({model,config:options,callbacks:{
        onmessage:value=>{
          // The provider may deliver its last transcript while close awaits
          // acknowledgement; keep accepting that text on the active socket.
          if(epoch!==generation||closed||failed)return;
          try{
            jsonData(value);
            if(changed())markStale();
            const update=value.sessionResumptionUpdate;
            if(update!==undefined){
              if(!plain(update)||update.resumable!==undefined&&typeof update.resumable!=='boolean'||update.newHandle!==undefined&&typeof update.newHandle!=='string'||update.lastConsumedClientMessageIndex!==undefined&&typeof update.lastConsumedClientMessageIndex!=='string')fail('INVALID_GOOGLE_LIVE_MESSAGE');
              // A non-resumable update describes the current turn; the last
              // good handle remains usable if the warning deadline expires.
              if(update.resumable!==undefined)latestResumable=update.resumable;
              if(update.newHandle&&update.newHandle.length<=4096)resumeHandle=update.newHandle;
              if(transparentSessionResumption&&update.lastConsumedClientMessageIndex!==undefined){
                const index=Number(update.lastConsumedClientMessageIndex);
                if(!Number.isSafeInteger(index)||index<0)fail('INVALID_GOOGLE_LIVE_MESSAGE');
                lastConsumedIndex=Math.max(lastConsumedIndex,index);
                while(audioBuffer.length&&audioBuffer[0].index<=lastConsumedIndex)removeOldestAudio();
              }
            }
            if(value.toolCall&&!closing){
              const calls=value.toolCall.functionCalls;
              if(!Array.isArray(calls)||calls.length>20)fail('INVALID_GOOGLE_LIVE_MESSAGE');
              for(const call of calls){
                if(!plain(call)||typeof call.id!=='string'||!/^[A-Za-z0-9_.:-]{1,200}$/.test(call.id)||!toolDeclarations.some(tool=>tool.name===call.name)||!plain(call.args))fail('INVALID_GOOGLE_LIVE_MESSAGE');
                pendingTools.set(call.id,(pendingTools.get(call.id)||0)+1);
              }
            }
          }catch{error();return;}
          acceptMessage(value,epoch);
          if(factsStale){void refresh().catch(()=>{});return;}
          if(value.sessionResumptionUpdate?.resumable===true&&goAwayEpoch===epoch)void reconnect(epoch);
          if(value.goAway!==undefined&&!closing){
            if(!plain(value.goAway)||value.goAway.timeLeft!==undefined&&typeof value.goAway.timeLeft!=='string'){error();return;}
            if(!resumeHandle){error();return;}
            if(latestResumable){void reconnect(epoch);return;}
            clearGoAway();goAwayEpoch=epoch;
            const seconds=/^(\d+(?:\.\d+)?)s$/.exec(value.goAway.timeLeft||'');
            const deadline=seconds?Math.max(0,Number(seconds[1])*1000-2000):0;
            goAwayTimer=setTimeout(()=>{if(goAwayEpoch===epoch)void reconnect(epoch);},Math.min(deadline,2147483647));
          }
        },
        onerror:()=>{if(epoch!==generation||closing||closed||failed)return;if(resumeHandle)void reconnect(epoch);else enqueue(error);},
        onclose:()=>{if(epoch!==generation||closing||closed||failed)return;if(resumeHandle)void reconnect(epoch);else enqueue(async()=>{if(!closed){await flush(false);Promise.resolve(callbacks.onClose()).catch(()=>{});void close();}});}
      }}));
      connecting.then(value=>{if(epoch!==generation||closing||closed||failed)try{value.close();}catch{}}).catch(()=>{});
      try{
        const opened=await Promise.race([connecting,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new GoogleGenAiLiveAdapterError('GEMINI_CONNECT_FAILED')),connectTimeoutMs);})]);
        if(epoch!==generation||closing||closed||failed||['sendRealtimeInput','sendToolResponse','close'].some(key=>typeof opened?.[key]!=='function'))throw Error();
        return {opened,instructions};
      }finally{clearTimeout(timer);}
    }
    function reconnect(epoch,forRefresh=false,instructions){
      if(epoch!==generation||closing||closed||failed||reconnectPromise)return reconnectPromise;
      if(!resumeHandle&&!forRefresh){error();return null;}
      clearGoAway();const old=provider;provider=null;const handle=resumeHandle,next=++generation;
      reconnectPromise=Promise.resolve().then(async()=>{
        // A configuration replacement uses a new setup, never a fake in-place
        // update or a caller-authored text override of the system instruction.
        if(old)try{await old.close();}catch{provider=old;throw new GoogleGenAiLiveAdapterError('GEMINI_CONNECT_FAILED');}
        return connect(handle,next,instructions);
      }).then(async ({opened,instructions:loaded})=>{
        if(transparentSessionResumption&&handle){
          for(const entry of audioBuffer.filter(entry=>entry.index>lastConsumedIndex))await opened.sendRealtimeInput(entry.value);
        }
        if(!handle){audioBuffer.length=0;bufferedAudioBytes=0;clientMessageIndex=0;lastConsumedIndex=-1;}
        provider=opened;currentInstruction=loaded;return opened;
      }).catch(()=>{error();throw new GoogleGenAiLiveAdapterError('GEMINI_CONNECT_FAILED');}).finally(()=>{reconnectPromise=null;});
      // Retire the old socket without ending the resumed session. Old callbacks
      // are ignored by generation; already accepted transcripts/tools drain once.
      reconnectPromise.catch(()=>{});
      return reconnectPromise;
    }
    function refresh(){
      if(closing||closed||failed)return Promise.resolve();
      if(refreshPromise)return refreshPromise;
      try{if(!factsStale&&!changed())return Promise.resolve();markStale();}catch{error();return Promise.reject(new GoogleGenAiLiveAdapterError('GOOGLE_LIVE_INSTRUCTION_FAILED'));}
      refreshPromise=Promise.resolve().then(async()=>{
        // A tool response belongs to the provider that requested it. Drain it
        // before a cold replacement; do not send an orphan functionResponse to
        // a new session or block its completion behind waiting caller audio.
        for(let attempt=0;attempt<8;attempt++){
          if(pendingTools.size)await new Promise(resolve=>{resolveTools=resolve;});
          if(closing||closed||failed)return;
          if(reconnectPromise)await reconnectPromise;
          const next=await readInstruction();
          if(closing||closed||failed)return;
          const replace=next.text!==currentInstruction.text;
          const cold=!resumeHandle;
          if(replace)await reconnect(generation,true,next);else currentInstruction=next;
          await outputCleared;
          await transcriptions;
          if(closing||closed||failed)return;
          if(changed())continue;
          if(replace&&sessionStarted){
            if(typeof provider?.sendClientContent!=='function')fail('GOOGLE_LIVE_INSTRUCTION_FAILED');
            const continuation='[Server connection refresh for this same call. Do not greet again. Current OWNER_FACTS_JSON replaces earlier business facts. Prior tool results are historical context, not new authorizations. Continue the caller\'s request using the current facts and tool contract; reconfirm as required.'+(historyOmitted&&cold?' Older conversation context is omitted; ask for missing details rather than guessing.':'')+']';
            await provider.sendClientContent({turns:[...(cold?history.map(item=>item.turn):[]),{role:'user',parts:[{text:continuation}]}],turnComplete:true});
            if(transparentSessionResumption)clientMessageIndex++;
          }
          if(changed())continue;
          factsStale=false;return;
        }
        fail('GOOGLE_LIVE_INSTRUCTION_FAILED');
      }).catch(errorValue=>{error();throw errorValue;}).finally(()=>{refreshPromise=null;});
      refreshPromise.catch(()=>{});return refreshPromise;
    }
    async function ready(drainTool=false){if(reconnectPromise)await reconnectPromise;if(!provider||closing&&!drainTool||closed||failed)fail('GOOGLE_LIVE_SEND_FAILED');return provider;}
    function sendOrdered(work){const sent=outbound.then(work);outbound=sent.catch(()=>{});return sent;}
    try{
      const initial=await connect(null,generation,currentInstruction);provider=initial.opened;currentInstruction=initial.instructions;
      await refresh();
      if(closing||closed||failed)fail('GEMINI_CONNECT_FAILED');
      if(greetOnConnect&&typeof provider.sendClientContent==='function'){
        provider.sendClientContent({turns:[{role:'user',parts:[{text:'[Call connected. Speak business.greeting from OWNER_FACTS_JSON exactly if configured; otherwise give the brief business and agent greeting. This is a connection event, not a customer request.]'}]}],turnComplete:true});
        if(transparentSessionResumption)clientMessageIndex++;
      }
      sessionStarted=true;
      if(instructionRevision){refreshTimer=setInterval(()=>{void refresh().catch(()=>{});},instructionRefreshMs);refreshTimer.unref?.();}
    }catch{await close();fail('GEMINI_CONNECT_FAILED');}
    return Object.freeze({
      async sendAudio(value){
        if(closed||failed||value?.mimeType!==audio.inputMimeType||!(Buffer.isBuffer(value.data)||value.data instanceof Uint8Array)||!value.data.byteLength||value.data.byteLength%2||value.data.byteLength>32768)fail('INVALID_GOOGLE_LIVE_AUDIO');
        const packet={audio:{data:Buffer.from(value.data).toString('base64'),mimeType:value.mimeType}};
        const sending=input.then(async()=>{await refresh();return sendOrdered(async()=>{
          await (await ready()).sendRealtimeInput(packet);
          if(transparentSessionResumption){
            audioBuffer.push({index:clientMessageIndex++,value:packet,bytes:value.data.byteLength,at:Date.now()});
            bufferedAudioBytes+=value.data.byteLength;
            while(audioBuffer.length&&(Date.now()-audioBuffer[0].at>15000||bufferedAudioBytes>480000))removeOldestAudio();
          }
        });});input=sending.catch(()=>{});
        try{await sending;}catch{error();fail('GOOGLE_LIVE_SEND_FAILED');}
      },
      async sendToolResponse(value){
        if(closed||failed||typeof value?.toolCallId!=='string'||typeof value?.name!=='string'||!toolDeclarations.some(tool=>tool.name===value.name))fail('INVALID_GOOGLE_LIVE_TOOL_RESPONSE');jsonData(value.response);
        try{
          await sendOrdered(async()=>{await (await ready(true)).sendToolResponse({functionResponses:[{id:value.toolCallId,name:value.name,response:value.response}]});if(transparentSessionResumption)clientMessageIndex++;});
          remember('user','[Previously delivered server tool result; historical context only.]\n'+JSON.stringify({name:value.name,response:value.response}));
          const remaining=pendingTools.get(value.toolCallId)||0;
          if(remaining>1)pendingTools.set(value.toolCallId,remaining-1);else pendingTools.delete(value.toolCallId);
          toolsDrained();
          if(!pendingTools.size)await refresh();
        }catch{error();fail('GOOGLE_LIVE_SEND_FAILED');}
      },close,whenIdle:()=>Promise.all([queue,transcriptions,input,outbound,refreshPromise?.catch(()=>{})])
    });
  };
}
