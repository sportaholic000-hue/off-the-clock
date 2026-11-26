// Website live demo (server/public/otc-live-demo.js): after a barge-in the player
// discards only the interrupted reply. The next reply plays from its first sample,
// and the interrupted reply still fades out over 12 ms instead of clicking.
// The shipped worklet text runs in node with a fake AudioWorklet scope; the widget
// runs with a fake DOM, fake audio nodes, a fake socket and a fake fetch. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const SOURCE=readFileSync(new URL('../server/public/otc-live-demo.js',import.meta.url),'utf8');
const WORKLET=(()=>{const start=SOURCE.indexOf('const WORKLET = `')+'const WORKLET = `'.length;return SOURCE.slice(start,SOURCE.indexOf('`;',start));})();
const OLD=0.3,NEW=0.7,near=(a,b)=>Math.abs(a-b)<1e-6;

function player(rate){
  const procs={};
  class AudioWorkletProcessor{constructor(){this.port={postMessage(){},onmessage:null};}}
  new Function('AudioWorkletProcessor','registerProcessor','sampleRate',WORKLET)(AudioWorkletProcessor,(name,cls)=>{procs[name]=cls;},rate);
  const p=new procs['otc-player'](),out=[];
  return {p,out,
    send:data=>p.port.onmessage({data}),
    chunk:(n,v)=>p.port.onmessage({data:new Float32Array(n).fill(v)}),
    quanta(k){for(let i=0;i<k;i++){const o=new Float32Array(128);p.process([],[[o]]);out.push(...o);}},
    count:v=>out.filter(x=>near(x,v)).length,
    firstIndex:v=>out.findIndex(x=>near(x,v))};
}
// 400 ms of next-turn audio (24 kHz), fed after each interruption scenario.
const NEXT=9600;
function nextTurn(pl){const from=pl.out.length;pl.chunk(NEXT,NEW);pl.quanta(400);return {played:pl.count(NEW),firstAt:pl.firstIndex(NEW)-from,first:pl.out[pl.firstIndex(NEW)]};}
const SCENARIOS={
  S0:pl=>{pl.chunk(24000,OLD);pl.quanta(20);pl.send('flush');pl.quanta(10);},           // fade finished before the next turn
  S1:pl=>{pl.chunk(24000,OLD);pl.quanta(20);pl.send('flush');pl.quanta(1);},            // next turn queued 2.7 ms into the fade
  S2:pl=>{pl.chunk(3600,OLD);pl.quanta(5);pl.send('flush');pl.quanta(200);},            // interrupted while pre-buffering
  S3:pl=>{pl.chunk(4800,OLD);pl.quanta(80);pl.send('flush');pl.quanta(50);},            // interrupted during an underrun
  S3g:pl=>{pl.chunk(4800,OLD);pl.quanta(80);pl.send('flush');pl.send('go');pl.quanta(50);},
  S4:pl=>{pl.chunk(3600,OLD);pl.quanta(5);pl.send('flush');pl.send('go');pl.quanta(50);},
  S5:pl=>{pl.chunk(4800+120,OLD);while(pl.p.len-pl.p.pos>120)pl.quanta(1);pl.send('flush');pl.quanta(50);}, // 5 ms left
  S5g:pl=>{pl.chunk(4800+120,OLD);while(pl.p.len-pl.p.pos>120)pl.quanta(1);pl.send('flush');pl.send('go');pl.quanta(50);},
  S1go:pl=>{pl.chunk(24000,OLD);pl.quanta(20);pl.send('flush');pl.send('go');pl.quanta(1);}, // interrupted turn's turnComplete lands during the fade
};

for(const rate of [48000,44100]){
  // A turn that was never interrupted: every sample of it except the final 1.5 source samples
  // (the player's end-of-queue interpolation guard) is played at full level.
  const control=(()=>{const pl=player(rate);return nextTurn(pl);})();
  test(`demo player ${rate} Hz: control turn plays at full level from its first sample`,()=>{
    assert.ok(control.played>=NEXT*(rate/24000)-3,JSON.stringify(control));
    assert.equal(control.first,Math.fround(NEW));
  });
  for(const [name,setup] of Object.entries(SCENARIOS))test(`demo player ${rate} Hz ${name}: the next reply loses 0 ms and starts at full level`,()=>{
    const pl=player(rate);setup(pl);const before=pl.out.length;const r=nextTurn(pl);
    assert.equal(r.played,control.played,`${name}: next-turn samples played ${r.played}, control ${control.played} (${Math.round((control.played-r.played)/(rate/1000))} ms lost)`);
    assert.equal(r.first,Math.fround(NEW),`${name}: first next-turn sample must be unfaded`);
    // No interrupted audio is heard after the next reply starts.
    assert.equal(pl.out.slice(before+r.firstAt).filter(x=>near(x,OLD)).length,0);
  });
  test(`demo player ${rate} Hz: a 4.5 s streamed reply after S5g plays every sample the control plays`,()=>{
    const stream=pl=>{const total=108000;let fed=0,q=0;const from=pl.out.length;while(fed<total){pl.chunk(960,NEW);fed+=960;pl.quanta(q%4===3?3:4);q++;}pl.quanta(2000);return pl.out.slice(from).filter(x=>near(x,NEW)).length;};
    const a=stream(player(rate)),pl=player(rate);SCENARIOS.S5g(pl);const b=stream(pl);
    assert.equal(b,a,`after S5g ${b} vs control ${a}: ${Math.round((a-b)/(rate/1000))} ms lost`);
  });
  test(`demo player ${rate} Hz: the interrupted reply fades to silence over 12 ms without a click`,()=>{
    for(const queuedDuringFade of [false,true]){
      const pl=player(rate);pl.chunk(24000,OLD);pl.quanta(20);const at=pl.out.length;
      assert.ok(near(pl.out[at-1],OLD));
      pl.send('flush');if(queuedDuringFade){pl.quanta(1);pl.chunk(NEXT,NEW);}pl.quanta(20);
      const after=pl.out.slice(at),fadeLen=Math.ceil(0.012*rate),ramp=OLD/(0.012*rate);
      const oldPart=after.slice(0,fadeLen+1);
      // The old reply decays monotonically from full level, never steps more than two ramp increments
      // (the last faded sample to silence)...
      let prev=Math.fround(OLD);for(const v of oldPart){if(near(v,NEW))break;assert.ok(v<=prev+1e-9&&prev-v<=2*ramp+1e-6,`step ${prev}->${v}`);prev=v;}
      // ...and is gone after 12 ms.
      assert.ok(after.slice(fadeLen+1).every(v=>v===0||near(v,NEW)),'old audio after 12 ms');
      assert.equal(after.slice(fadeLen+1).filter(v=>v>0&&v<NEW-1e-6).length,0,'no faded next-turn samples');
    }
  });
}

// ---------- widget: an odd byte never carries into the next turn ----------
function widget(){
  let T=1_000_000;const timers=new Map();let tid=0;
  const setT=(fn,ms,every)=>{const id=++tid;timers.set(id,{fn,at:T+(ms||0),every:every?(ms||1):0});return id;},clr=id=>timers.delete(id);
  const flush=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
  class El{
    constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.style={};this.dataset={};this.listeners={};this.hidden=false;this.textContent='';this.className='';this.classList={toggle(){},add(){},remove(){}};this.scrollHeight=0;this.scrollTop=0;this.clientHeight=0;this.childElementCount=1;this.value='';}
    setAttribute(k,v){this.attrs[k]=v;if(k==='hidden')this.hidden=true;if(k.startsWith('data-'))this.dataset[k.slice(5)]=v;}
    hasAttribute(k){return k in this.attrs;}removeAttribute(k){delete this.attrs[k];}
    addEventListener(t,f){(this.listeners[t]||=[]).push(f);}append(...c){this.children.push(...c.filter(x=>typeof x==='object'));}replaceChildren(){this.children=[];}
    querySelector(){return new El('span');}querySelectorAll(){return [];}contains(){return true;}
    getBoundingClientRect(){return {width:800,height:400,top:0,left:0};}focus(){}select(){}disconnect(){}
    get isConnected(){return true;}set innerHTML(v){}
  }
  const label=new El('span');label.textContent='Start Live Demo Call';label.childElementCount=0;label.contains=()=>false;
  const rules=new El('span');rules.textContent='DEMO RULES';rules.childElementCount=0;
  const grid=new El('div');label.parentElement=grid;const section=new El('section');section.querySelectorAll=()=>[label,rules];
  const document={currentScript:{dataset:{ws:'wss://fake.invalid/ws',api:'https://api.fake.invalid',debug:'true'},src:''},readyState:'complete',
    getElementById:id=>id==='demo'?section:null,createElement:t=>new El(t),head:new El('head'),body:new El('body'),
    documentElement:{style:{getPropertyValue:()=>'',setProperty(){}}},addEventListener(){}};
  const nodes=[],sockets=[];
  class AudioWorkletNode{constructor(ctx,name){this.name=name;this.posted=[];this.port={postMessage:m=>this.posted.push(m),onmessage:null};nodes.push(this);}connect(){}disconnect(){}}
  class AudioContext{constructor(){this.state='running';this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};this.destination={};}resume(){return Promise.resolve();}createMediaStreamSource(){return {connect(){},disconnect(){}};}close(){return Promise.resolve();}}
  class WebSocket{constructor(url){this.url=url;this.readyState=0;this.sent=[];this.bufferedAmount=0;sockets.push(this);}send(d){this.sent.push(JSON.parse(d));}close(){this.readyState=3;}}
  const window={isSecureContext:true,AudioContext,addEventListener(){}};
  const navigator={userAgent:'node',mediaDevices:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})},clipboard:{writeText:async()=>{}}};
  const fetch=async()=>({ok:true,status:200,json:async()=>({token:'tok',model:'fake-model',sessionSeconds:180,agent:{key:'miles',name:'Miles'}})});
  const params={document,window,navigator,location:{search:'',origin:'https://site.invalid'},fetch,WebSocket,AudioWorkletNode,
    MutationObserver:class{observe(){}},ResizeObserver:class{observe(){}},requestAnimationFrame:()=>0,
    setTimeout:(f,ms)=>setT(f,ms,false),setInterval:(f,ms)=>setT(f,ms,true),clearTimeout:clr,clearInterval:clr,
    Date:{now:()=>T},URL:{createObjectURL:()=>'blob:x',revokeObjectURL(){}},Blob:class{}};
  new Function(...Object.keys(params),SOURCE)(...Object.values(params));
  const dbg=window.__otcDemoDebug;
  const find=(el,text)=>{if(el.textContent===text&&el.listeners.click)return el;for(const c of el.children){const r=find(c,text);if(r)return r;}return null;};
  return {dbg,find,flush,nodes,sockets};
}
test('demo widget: an odd byte left at turnComplete is dropped, so the next turn starts on a sample boundary',async()=>{
  const w=widget();w.find(w.dbg.root,'Start Live Demo Call').listeners.click[0]();await w.flush();await w.flush();
  const ws=w.sockets[0];ws.readyState=1;ws.onopen();
  const server=async m=>{await ws.onmessage({data:JSON.stringify(m)});await w.flush();};
  await server({setupComplete:{}});
  const pl=w.nodes.find(n=>n.name==='otc-player');
  // Turn 1 ends on an odd byte count (3 bytes: one sample + one stray byte).
  await server({serverContent:{modelTurn:{parts:[{inlineData:{data:Buffer.from([0x00,0x40,0x7f]).toString('base64')}}]}}});
  await server({serverContent:{turnComplete:true}});
  const before=pl.posted.filter(m=>m instanceof Float32Array).length;
  // Turn 2: two samples, 0x2000 (0.25) and 0xE000 (-0.25), little-endian.
  await server({serverContent:{modelTurn:{parts:[{inlineData:{data:Buffer.from([0x00,0x20,0x00,0xe0]).toString('base64')}}]}}});
  const posted=pl.posted.filter(m=>m instanceof Float32Array).slice(before);
  assert.equal(posted.length,1);assert.deepEqual([...posted[0]],[0.25,-0.25]);
});
test('demo widget: a turn split across messages still joins its odd byte within the turn',async()=>{
  const w=widget();w.find(w.dbg.root,'Start Live Demo Call').listeners.click[0]();await w.flush();await w.flush();
  const ws=w.sockets[0];ws.readyState=1;ws.onopen();
  const server=async m=>{await ws.onmessage({data:JSON.stringify(m)});await w.flush();};
  await server({setupComplete:{}});
  const pl=w.nodes.find(n=>n.name==='otc-player');
  await server({serverContent:{modelTurn:{parts:[{inlineData:{data:Buffer.from([0x00,0x20,0x00]).toString('base64')}}]}}});
  await server({serverContent:{modelTurn:{parts:[{inlineData:{data:Buffer.from([0xe0]).toString('base64')}}]}}});
  const posted=pl.posted.filter(m=>m instanceof Float32Array).flatMap(f=>[...f]);
  assert.deepEqual(posted,[0.25,-0.25]);
});
