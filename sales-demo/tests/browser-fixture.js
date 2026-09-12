/* UI TEST DOUBLE. This file is not served by the demo server.
   Verifies lifecycle and protocol handling, not real Gemini or physical audio. */
(()=>{
 const stats=window.fixtureStats={requests:[],micRequests:0,stops:0,contextsClosed:0,audioStopped:0,starts:0,ends:0};
 let sink=null,pendingMedia=null;const tracks=new Set();
 class Track{constructor(){tracks.add(this);}stop(){if(!this.stopped){this.stopped=true;stats.stops++;}}}
 const media=()=>{const t=new Track();return {getTracks:()=>[t]};};
 window.resolveFixtureMedia=()=>pendingMedia?.(media());
 Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>{stats.micRequests++;if(window.fixtureMode==='denied')return Promise.reject(new DOMException('denied','NotAllowedError'));if(window.fixtureMode==='pending')return new Promise(r=>pendingMedia=r);return Promise.resolve(media());}},configurable:true});
 class Node{connect(){}disconnect(){}stop(){stats.audioStopped++;}start(){}set buffer(b){this._buffer=b;}get buffer(){return this._buffer;}}
 class Audio {constructor(){this.state='running';this.currentTime=0;this.destination={};this.audioWorklet={addModule:async()=>{}};}resume(){return Promise.resolve();}close(){if(this.state!=='closed'){this.state='closed';stats.contextsClosed++;}return Promise.resolve();}createMediaStreamSource(){return new Node();}createBuffer(c,n,r){return {getChannelData:()=>new Float32Array(n),duration:n/r};}createBufferSource(){return new Node();}}
 window.AudioContext=Audio;window.AudioWorkletNode=class extends Node{constructor(){super();this.port={onmessage:null};window.fixtureCapture=this;}};
 const enc=new TextEncoder();window.fixtureEmit=e=>{try{sink?.enqueue(enc.encode(JSON.stringify(e)+'\n'));}catch{}};
 const sendTurn=text=>{fixtureEmit({type:'transcript',who:'agent',text});fixtureEmit({type:'turn_complete'});};
 const result=(code,data)=>new Response(JSON.stringify(data),{status:code,headers:{'content-type':'application/json'}});
 window.fetch=async(input,options={})=>{
  const path=String(input);stats.requests.push({path,method:options.method||'GET'});
  if(path.endsWith('/status'))return result(200,{enabled:window.fixtureMode!=='disabled',agents:{miles:{name:'Miles'},nova:{name:'Nova'}},notice:'The live demo is not connected in this review build.',signupUrl:null});
  if(path.endsWith('/session')){
   stats.starts++;if(window.fixtureMode==='budget')return result(429,{error:'budget',message:'High demand today — start your free trial to talk to your own agent.'});
   if(window.fixtureMode==='hourly')return result(429,{error:'hourly',message:'You have used the two demo sessions available per hour.'});
   return result(201,{token:'f'.repeat(64),agent:'Miles',mode:JSON.parse(options.body).mode});
  }
  if(path.endsWith('/events')){
   const body=new ReadableStream({start(c){sink=c;options.signal?.addEventListener('abort',()=>{try{c.close();}catch{}});
    if(window.fixtureMode==='connection-failure'){setTimeout(()=>c.error(Error('Test connection failure')),20);return;}
    setTimeout(()=>{fixtureEmit({type:'ready',agent:'Miles',mode:'text',expiresAt:Date.now()+180000});sendTurn('[TEST TRANSPORT — NOT LIVE AI] Ask a product question.');},10);
   }});return new Response(body,{status:200});
  }
  if(path.endsWith('/text')){const t=JSON.parse(options.body).text;fixtureEmit({type:'transcript',who:'user',text:t,typed:true});setTimeout(()=>sendTurn('[TEST TRANSPORT] '+t),10);return result(200,{accepted:true});}
  if(path.endsWith('/audio'))return result(200,{accepted:true});
  if(path.endsWith('/end')){stats.ends++;return result(200,{ended:true});}
  throw Error('Unexpected fixture request');
 };
})();
