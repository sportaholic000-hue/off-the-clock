import test from 'node:test';
import assert from 'node:assert/strict';
import {GeminiLive,setupMessage,ENDPOINT} from '../gemini.mjs';
import {configuration} from '../config.mjs';
const wait=()=>new Promise(r=>setTimeout(r,5));
class FakeSocket extends EventTarget{
 static instances=[];constructor(url){super();this.url=url;this.sent=[];this.bufferedAmount=0;this.didClose=false;FakeSocket.instances.push(this);}
 send(s){this.sent.push(JSON.parse(s));}close(){this.didClose=true;}event(type,data){this.dispatchEvent(Object.assign(new Event(type),data));}
}
function fixture(){
 const c={...configuration({}),key:'FIXTURE_SECRET_NOT_REAL',model:'approved-model'},events=[];
 const handlers=Object.fromEntries(['ready','audio','transcript','interrupt','turnComplete','usage','close','waiting'].map(k=>[k,(...v)=>events.push([k,...v])]));
 const provider=new GeminiLive(c,'nova',handlers,{Socket:FakeSocket}),socket=FakeSocket.instances.at(-1);return {c,provider,socket,events};
}
test('WebSocket setup uses a fixed Google endpoint and server-selected model and voice',()=>{
 const f=fixture();assert.ok(f.socket.url.startsWith(ENDPOINT));f.socket.event('open',{});const s=f.socket.sent[0].setup;
 assert.equal(s.model,'models/approved-model');assert.deepEqual(s.generationConfig.responseModalities,['AUDIO']);
 assert.equal(s.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName,'Kore');assert.equal(s.tools,undefined);assert.ok(s.inputAudioTranscription);assert.ok(s.outputAudioTranscription);f.provider.close();
});
test('no user input is sent before setup acknowledgement',async()=>{
 const f=fixture();assert.throws(()=>f.provider.text('hello'));f.socket.event('message',{data:JSON.stringify({setupComplete:{}})});await wait();
 f.provider.text('hello');f.provider.audio(Buffer.from([0,0,1,0]));assert.equal(f.socket.sent[0].clientContent.turns[0].parts[0].text,'hello');
 assert.equal(f.socket.sent[1].realtimeInput.audio.mimeType,'audio/pcm;rate=16000');f.provider.close();
});
test('text, audio, interruption and usage events are normalized without exposing raw messages',async()=>{
 const f=fixture();f.socket.event('message',{data:JSON.stringify({setupComplete:{}})});await wait();
 f.socket.event('message',{data:JSON.stringify({usageMetadata:{totalTokenCount:3},serverContent:{inputTranscription:{text:'hello'},outputTranscription:{text:'welcome'},modelTurn:{parts:[{thought:true,text:'private thought'},{inlineData:{mimeType:'audio/pcm;rate=24000',data:'AAAAAA=='}}]},turnComplete:true}})});await wait();
 assert.ok(f.events.some(x=>x[0]==='audio'&&x[1].length===4));assert.ok(!JSON.stringify(f.events).includes('private thought'));assert.ok(f.events.some(x=>x[0]==='transcript'&&x[2]==='welcome'));
 f.socket.event('message',{data:JSON.stringify({serverContent:{interrupted:true}})});await wait();assert.ok(f.events.some(x=>x[0]==='interrupt'));f.provider.close();
});
test('unexpected tool calls fail closed and never execute an external action',async()=>{
 const f=fixture();f.socket.event('message',{data:JSON.stringify({toolCall:{functionCalls:[{name:'bookAppointment'}]}})});await wait();assert.equal(f.socket.didClose,true);assert.equal(f.events.at(-1)[0],'close');
});
test('raw provider errors and credentials do not reach the public event stream',async()=>{
 const f=fixture();f.socket.event('message',{data:JSON.stringify({error:{message:'FIXTURE_SECRET_NOT_REAL raw URL'}})});await wait();assert.deepEqual(f.events,[['close','provider']]);
});
test('malformed JSON, excessive messages and output sample-rate mismatches close safely',async()=>{
 for(const payload of ['not JSON','x'.repeat(1048577),JSON.stringify({setupComplete:{}})]){
  const f=fixture();f.socket.event('message',{data:payload});await wait();if(payload.startsWith('{')){f.socket.event('message',{data:JSON.stringify({serverContent:{modelTurn:{parts:[{inlineData:{data:'AAAAAA==',mimeType:'audio/pcm;rate=8000'}}]}}})});await wait();}
  assert.equal(f.socket.didClose,true);
 }
});
test('blob decoding preserves message order despite asynchronous decoding',async()=>{
 const f=fixture();f.socket.event('message',{data:{size:20,text:()=>new Promise(r=>setTimeout(()=>r('{"setupComplete":{}}'),10))}});
 f.socket.event('message',{data:JSON.stringify({serverContent:{outputTranscription:{text:'next'}}})});await new Promise(r=>setTimeout(r,30));assert.equal(f.events[0][0],'ready');assert.equal(f.events[1][0],'transcript');f.provider.close();
});
test('closing during connection, backpressure and repeated close do not leak a socket',async()=>{
 const a=fixture();a.provider.close();a.socket.event('open',{});assert.equal(a.socket.sent.length,0);a.provider.close();
 const b=fixture();b.socket.event('message',{data:'{"setupComplete":{}}'});await wait();b.socket.bufferedAmount=600000;assert.throws(()=>b.provider.text('x'));assert.equal(b.socket.didClose,true);
});
