import assert from 'node:assert/strict';
import {createGoogleGenAiLiveSessionOpener} from '../server/src/voice/googleGenAiLiveAdapter.js';

export const INPUT='audio/pcm;rate=16000',OUTPUT='audio/pcm;rate=24000';
export const tools=[{name:'calculateListedPrice',description:'Synthetic listed price calculation',parameters:{type:'OBJECT',properties:{},required:[]}}];
export const priceInstruction=prices=>'[SYNTHETIC H2 BUSINESS FACTS]\n<OWNER_FACTS_JSON>\n'+JSON.stringify({knowledge:{prices}})+'\n</OWNER_FACTS_JSON>';
export const pricesFrom=instruction=>JSON.parse(instruction.match(/<OWNER_FACTS_JSON>\n([\s\S]*?)\n<\/OWNER_FACTS_JSON>/)[1]).knowledge.prices;
const clone=value=>JSON.parse(JSON.stringify(value));
export function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});promise.catch(()=>{});return {promise,resolve,reject};}
export async function until(predicate,message='Synthetic H2 condition did not complete'){
  for(let attempt=0;attempt<400;attempt++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}
  assert.fail(message);
}
export async function adapter(t,options={}){
  let version=0,prices=options.prices??'Widget $10 each',revisionFailure=false,compileFailure=false,session;
  const rows=[],events=[],wire=[],gates=[],handles=new Map();
  const context=Object.freeze({ownerId:options.ownerId??'synthetic-h2-owner',callSid:options.callSid??'CA'+'a'.repeat(32)});
  const logical=()=>({pending:new Set()});
  const client={live:{connect:async input=>{
    const resumed=handles.get(input.config.sessionResumption?.handle);
    const row={index:rows.length,config:clone(input.config),callbacks:input.callbacks,logical:resumed??logical(),closed:0,realtime:[],responses:[],content:[]};
    rows.push(row);wire.push(['connect',row.index,pricesFrom(row.config.systemInstruction)]);
    await options.onConnect?.(row);row.established=true;
    return {
      sendRealtimeInput:async value=>{assert.equal(row.closed,0,'No writes to a retired provider');row.realtime.push(clone(value));wire.push(['audio',row.index,clone(value)]);},
      sendToolResponse:async value=>{
        assert.equal(row.closed,0,'No tool reply to a retired provider');
        for(const result of value.functionResponses){assert.ok(row.logical.pending.has(result.id),'No orphan response may enter a fresh provider session');row.logical.pending.delete(result.id);}
        row.responses.push(clone(value));wire.push(['response',row.index,clone(value)]);
        await options.onResponse?.(row,value);
      },
      ...(!options.withoutClientContent?{sendClientContent:async value=>{assert.equal(row.closed,0);row.content.push(clone(value));wire.push(['content',row.index,clone(value)]);await options.onContent?.(row,value);}}:{}),
      close:async()=>{row.closed++;wire.push(['close',row.index]);await options.onClose?.(row);}
    };
  }}};
  const open=createGoogleGenAiLiveSessionOpener({client,model:'synthetic-live-model',toolDeclarations:tools,
    instructionRevision:()=>{if(revisionFailure)throw Error('[SYNTHETIC PRIVATE REVISION ERROR]');return String(version);},
    systemInstruction:async()=>{const text=priceInstruction(prices);if(compileFailure)throw Error('[SYNTHETIC PRIVATE COMPILER ERROR]');await options.onCompile?.(text);return text;},
    instructionRefreshMs:options.interval??60000,connectTimeoutMs:options.connectTimeoutMs??2000,
    greetOnConnect:options.greet??true,transparentSessionResumption:options.transparent??false});
  const callbacks={
    onAudio:async value=>{events.push(['audio',clone(value)]);await options.onAudio?.(value);},
    onInterruption:async()=>{events.push(['interrupt']);await options.onInterruption?.();},
    onTranscript:async value=>{events.push(['transcript',clone(value)]);await options.onTranscript?.(value);},
    onToolCall:async value=>{events.push(['tool',clone(value)]);if(options.tool){const response=await options.tool(value);await session.sendToolResponse({toolCallId:value.toolCallId,name:value.name,response});}},
    onError:async()=>events.push(['error']),onClose:async()=>events.push(['close'])
  };
  t.after(async()=>{for(const gate of gates)gate.resolve();await session?.close();});
  session=await open({context,session:{callRecordId:context.callSid},audio:{inputMimeType:INPUT,outputMimeType:OUTPUT},callbacks});
  return {rows,events,wire,session,context,
    save:next=>{prices=next;version++;},
    failRevision:()=>{revisionFailure=true;},failCompile:()=>{compileFailure=true;},
    gate:()=>{const value=deferred();gates.push(value);return value;},
    sendAudio:byte=>session.sendAudio({data:Buffer.from([byte??1,0]),mimeType:INPUT}),
    emit(value,index=rows.length-1){const row=rows[index];for(const call of value.toolCall?.functionCalls??[])row.logical.pending.add(call.id);row.callbacks.onmessage(value);},
    resume(token='synthetic-h2-resume',index=rows.length-1){const row=rows[index];handles.set(token,row.logical);row.callbacks.onmessage({sessionResumptionUpdate:{newHandle:token,resumable:true}});}
  };
}
