import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../public/capture-worklet.js',import.meta.url),'utf8');
function convert(rate,input,block=128){
 let Type;const frames=[],outputs=[];
 class Base{constructor(){this.port={postMessage:b=>frames.push(Buffer.from(b))};}}
 vm.runInNewContext(source,{AudioWorkletProcessor:Base,sampleRate:rate,registerProcessor:(name,T)=>{assert.equal(name,'otc-capture');Type=T;}});
 const p=new Type();for(let i=0;i<input.length;i+=block){const out=new Float32Array(Math.min(block,input.length-i)).fill(1);p.process([[input.slice(i,i+block)]],[[out]]);outputs.push(out);}
 return {bytes:Buffer.concat(frames),outputs};
}
for(const rate of [16000,44100,48000])test(`PCM ${rate} Hz input becomes exactly 16000 little-endian samples per second`,()=>{
 const {bytes,outputs}=convert(rate,new Float32Array(rate).fill(.5));assert.equal(bytes.length,32000);
 for(let i=0;i<bytes.length;i+=2)assert.equal(bytes.readInt16LE(i),16384);
 assert.ok(outputs.every(a=>a.every(v=>v===0)),'microphone must not be played back locally');
});
test('sample phase is preserved across arbitrary render-block boundaries',()=>{
 const x=Float32Array.from({length:44100},(_,i)=>Math.sin(i/17)*.8);
 assert.deepEqual(convert(44100,x,128).bytes,convert(44100,x,173).bytes);
});
test('negative/full-scale and malformed samples are bounded',()=>{
 const x=Float32Array.from({length:16000},(_,i)=>i<4000?-1:i<8000?2:i<12000?-2:NaN),b=convert(16000,x).bytes;
 assert.equal(b.readInt16LE(0),-32768);assert.equal(b.readInt16LE(8000),32767);assert.equal(b.readInt16LE(16000),-32768);assert.equal(b.readInt16LE(24000),0);
});
test('resampling constant silence produces no nonzero audio',()=>{
 const b=convert(48000,new Float32Array(48000)).bytes;assert.ok(b.every(x=>x===0));
});
