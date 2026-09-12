import { randomBytes } from 'node:crypto';
import { CLOSINGS } from './policy.mjs';
import { DemoError } from './quota.mjs';
import { GeminiLive } from './gemini.mjs';

export function conservativeUsageMicros(u,rate){
  // Summing reports (rather than subtracting guessed cumulative counters) may
  // overcount. This is a conservative admission estimate, NOT an invoice.
  const fields=['totalTokenCount','promptTokenCount','responseTokenCount','thoughtsTokenCount','toolUsePromptTokenCount'];
  let tokens=0n,seen=false;
  for(const k of fields)if(u[k]!==undefined){
    if(!Number.isSafeInteger(u[k])||u[k]<0)throw new DemoError('provider',502);
    tokens+=BigInt(u[k]);seen=true;
  }
  if(!seen)throw new DemoError('provider',502);
  // Count detail arrays too: includes modality/transcription reports without
  // relying on undocumented overlap or cheaper cached-token treatment.
  for(const key of ['promptTokensDetails','responseTokensDetails','toolUsePromptTokensDetails']){
    if(u[key]!==undefined&&!Array.isArray(u[key]))throw new DemoError('provider',502);
    for(const item of u[key]||[]){if(!Number.isSafeInteger(item.tokenCount)||item.tokenCount<0)throw new DemoError('provider',502);tokens+=BigInt(item.tokenCount);}
  }
  const micros=(tokens*BigInt(rate)+999_999n)/1_000_000n;
  if(micros>BigInt(Number.MAX_SAFE_INTEGER))throw new DemoError('provider',502);
  return Number(micros);
}
export class DemoSession {
  constructor({config,agent,mode,quotas,lease,emit,onEnd,now=Date.now,providerFactory=(...args)=>new GeminiLive(...args)}){
    this.c=config;this.agent=agent;this.mode=mode;this.q=quotas;this.lease=lease;this.emit=emit;this.onEnd=onEnd;this.now=now;this.factory=providerFactory;
    this.token=randomBytes(32).toString('hex');this.state='pending';this.created=now();this.started=0;this.activity=now();
    this.outputUntil=0;this.lastProvider=now();this.pendingReply=false;this.bytes=0;this.outputBytes=0;this.turns=0;this.textChars=0;this.metered=0;this.reports=0;
  }
  attach(emit){
    if(this.state!=='pending')throw new DemoError('invalid',409);
    this.emit=emit;this.state='connecting';this.connected=this.now();
    try{this.provider=this.factory(this.c,this.agent,{
      ready:()=>this.ready(),audio:b=>this.audioOut(b),transcript:(who,text)=>this.transcript(who,text),
      interrupt:()=>{this.outputUntil=this.now();this.pendingReply=true;this.lastProvider=this.now();this.send('interrupted',{});},
      waiting:()=>{this.pendingReply=false;this.lastProvider=this.now();},
      turnComplete:()=>{this.pendingReply=false;this.lastProvider=this.now();this.activity=Math.max(this.activity,this.outputUntil,this.now());this.send('turn_complete',{});},
      usage:u=>this.usage(u),close:reason=>this.end(reason),
    });}catch{this.end('provider');}
  }
  ready(){
    if(this.state!=='connecting')return;
    this.started=this.now();this.activity=this.started;this.lastProvider=this.started;this.state='active';this.pendingReply=true;
    this.send('ready',{agent:this.c.agents[this.agent].name,mode:this.mode,expiresAt:this.started+this.c.limits.sessionMs});
    // Defer until the factory has returned; test transports must mirror async setup.
    queueMicrotask(()=>{if(this.state==='active')this.command(()=>this.provider.text('Begin the Off The Clock website demo with your assigned greeting and one question about my business.'));});
  }
  send(type,data){if(this.state==='ended')return;try{if(this.emit(type,data)===false)this.end('provider');}catch{this.end('provider');}}
  command(f){try{f();}catch{this.end('provider');}}
  accept(){if(this.state!=='active')throw new DemoError('invalid',409);this.tick();if(this.state!=='active')throw new DemoError('invalid',409);}
  text(text){
    this.accept();if(this.mode!=='text')throw new DemoError('invalid');
    if(typeof text!=='string'||!text.trim()||text.length>this.c.limits.maxInputChars)throw new DemoError('invalid');
    if(this.pendingReply)throw new DemoError('busy',409);
    if(++this.turns>this.c.limits.maxTurns||this.textChars+text.length>20000){this.beginClosing('time');return;}
    this.textChars+=text.length;this.activity=this.now();this.lastProvider=this.now();this.pendingReply=true;
    this.send('transcript',{who:'user',text,typed:true});this.command(()=>this.provider.text(text));
  }
  audio(bytes){
    this.accept();if(this.mode!=='voice'||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length%2||bytes.length>this.c.limits.maxFrameBytes)throw new DemoError('invalid');
    const elapsed=Math.max(0,this.now()-this.started);
    if(this.bytes+bytes.length>this.c.limits.maxAudioBytes||this.bytes+bytes.length>32000*(elapsed/1000+2)){this.end('invalid');throw new DemoError('invalid',429);}
    this.bytes+=bytes.length;
    let power=0;for(let i=0;i<bytes.length;i+=2){const v=bytes.readInt16LE(i)/32768;power+=v*v;}
    if(Math.sqrt(power/(bytes.length/2))>0.012)this.activity=this.now();
    this.command(()=>this.provider.audio(bytes));
  }
  audioOut(bytes){
    if(!['active','closing'].includes(this.state))return;
    this.outputBytes+=bytes.length;
    if(this.outputBytes>48000*240)return this.end('provider');
    this.lastProvider=this.now();this.pendingReply=true;
    this.outputUntil=Math.max(this.outputUntil,this.now())+(this.mode==='voice'?bytes.length/48:0);
    if(this.outputUntil>this.now()+30000)return this.end('provider');
    if(this.mode==='voice')this.send('audio',{data:bytes.toString('base64'),sampleRate:24000});
  }
  transcript(who,text){
    if(!['active','closing'].includes(this.state))return;
    if(text.length>12000)return this.end('provider');
    this.lastProvider=this.now();if(who==='user')this.activity=this.now();
    this.send('transcript',{who,text});
  }
  usage(u){
    if(this.state==='ended')return;
    try{const n=conservativeUsageMicros(u,this.c.maxRateMicros);this.reports++;
      if(n>Number.MAX_SAFE_INTEGER-this.metered)throw new Error();this.metered+=n;
      if(this.metered>=this.lease.reserved){this.q.trip(this.lease);this.end('budget');}
    }catch{this.q.trip(this.lease);this.end('provider');}
  }
  tick(){
    const n=this.now(),l=this.c.limits;
    if(this.state==='ended')return;
    if(this.state==='pending'&&n-this.created>=l.handshakeMs)return this.end('timeout');
    if(this.state==='connecting'&&n-this.connected>=l.handshakeMs)return this.end('timeout');
    if(!['active','closing'].includes(this.state))return;
    if(n>=this.started+l.sessionMs)return this.end('time');
    if(this.state==='closing'){if(n>=this.closeAt)return this.end(this.reason);return;}
    if(n>=this.started+l.sessionMs-l.graceMs)return this.beginClosing('time');
    if(this.pendingReply&&n-Math.max(this.lastProvider,this.activity)>l.responseMs)return this.end('timeout');
    // Silence is measured after the audible response, never from model-generation start.
    if(!this.pendingReply&&n-Math.max(this.activity,this.outputUntil)>=l.silenceMs)this.beginClosing('silence');
  }
  beginClosing(reason){
    if(this.state!=='active')return;
    this.state='closing';this.reason=reason;this.closeAt=Math.min(this.now()+this.c.limits.graceMs,this.started+this.c.limits.sessionMs);
    this.send('closing',{reason,message:CLOSINGS[reason],closesAt:this.closeAt});
    this.command(()=>{this.provider.audioEnd();this.provider.text(`The server is ending this demo now. Say only this brief sign-off, then stop: ${CLOSINGS[reason]}`);});
  }
  end(reason='user'){
    if(this.state==='ended')return;
    const opened=this.state!=='pending';this.state='ended';
    try{this.provider?.close();}catch{}
    // No metering report after a provider connection is uncertain usage. Fail
    // closed for further admissions; do not silently assume zero spend.
    try{if(opened&&this.reports===0)this.q.trip(this.lease);this.q.release(this.lease);}catch{reason='provider';}
    try{this.emit('ended',{reason,signupUrl:this.c.signupUrl});}catch{}
    this.onEnd(this.token);
  }
}
