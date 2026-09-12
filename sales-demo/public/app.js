(()=>{'use strict';
const $=id=>document.getElementById(id),api='/sales-demo/api/';
let config=null,phase='idle',mode='voice',generation=0,token=null,stream=null,context=null,source=null,capture=null,controller=null;
let playback=[],nextPlay=0,upload=Promise.resolve(),queued=0,expires=0,timer=null,lastLine=null;
const byAgent=()=>document.querySelector('input[name=agent]:checked').value;
function notice(text){$('notice').textContent=text||'';$('notice').hidden=!text;}
function status(text,live=false){$('status').textContent=text;$('status').classList.toggle('live',live);}
function chooseLock(locked){$('agents').disabled=locked;$('start-voice').disabled=locked||!config?.enabled;$('start-text').disabled=locked||!config?.enabled;}
function transcript(who,text,typed=false){
  const box=$('transcript'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<60;
  if(!lastLine||lastLine.who!==who||typed){const row=document.createElement('p'),label=document.createElement('b'),body=document.createElement('span');
    row.className='line '+who;label.textContent=who==='user'?'YOU':(config?.agents[byAgent()]?.name||'AGENT').toUpperCase();row.append(label,body);box.append(row);lastLine={who,body};}
  lastLine.body.textContent+=text;if(nearBottom)box.scrollTop=box.scrollHeight;
}
function clearPlayback(){for(const p of playback){try{p.stop();p.disconnect();}catch{}}playback=[];nextPlay=0;}
function releaseMedia(){
  if(capture){capture.port.onmessage=null;try{capture.disconnect();}catch{}capture=null;}
  try{source?.disconnect();}catch{}source=null;
  if(stream){for(const track of stream.getTracks()){track.onended=null;track.stop();}stream=null;}
  clearPlayback();const c=context;context=null;if(c&&c.state!=='closed')c.close().catch(()=>{});
  $('level').style.width='0%';$('mic-state').textContent='MIC OFF';
}
function resetIdle(){phase='idle';$('idle').hidden=false;$('conversation').hidden=true;$('ended').hidden=true;$('guarantee-idle').hidden=false;chooseLock(false);status(config?.enabled?'READY TO TALK':'NOT CONNECTED');}
async function request(path,body,signal,session=token){
  const headers={'content-type':'application/json'};if(session)headers['x-demo-session']=session;
  const res=await fetch(api+path,{method:'POST',headers,body:JSON.stringify(body),signal,cache:'no-store'});
  const data=await res.json();if(!res.ok){const e=Error(data.message||'The demo could not connect.');e.code=data.error;throw e;}return data;
}
function closeLocal(message,reason='user'){
  generation++;const old=token;token=null;phase='ended';controller?.abort();controller=null;clearInterval(timer);timer=null;releaseMedia();
  $('idle').hidden=true;$('conversation').hidden=true;$('ended').hidden=false;$('guarantee-idle').hidden=true;
  $('end-detail').textContent=message||'Your session has ended and your microphone is off.';
  status('SESSION ENDED');chooseLock(false);$('again').disabled=!config?.enabled;
  if(old&&reason!=='server')request('end',{},undefined,old).catch(()=>{});
  return old;
}
function play(data){
  if(!context||mode!=='voice'||!['active','closing'].includes(phase))return;
  if(data.sampleRate!==24000||typeof data.data!=='string')throw Error('Unexpected audio format.');
  const raw=atob(data.data);if(!raw.length||raw.length%2)throw Error('Invalid audio frame.');
  const b=context.createBuffer(1,raw.length/2,24000),v=b.getChannelData(0);
  for(let i=0;i<v.length;i++){let n=raw.charCodeAt(i*2)|(raw.charCodeAt(i*2+1)<<8);if(n>32767)n-=65536;v[i]=n/32768;}
  const p=context.createBufferSource();p.buffer=b;p.connect(context.destination);const at=Math.max(context.currentTime,nextPlay);
  if(at-context.currentTime>20)throw Error('Audio connection is falling behind.');
  nextPlay=at+b.duration;playback.push(p);p.onended=()=>{playback=playback.filter(x=>x!==p);p.disconnect();};p.start(at);
}
async function processEvents(myGeneration){
  const res=await fetch(api+'events',{headers:{'x-demo-session':token},signal:controller.signal,cache:'no-store'});
  if(!res.ok||!res.body)throw Error('The demo connection could not start.');
  const reader=res.body.getReader(),decoder=new TextDecoder();let pending='';
  while(myGeneration===generation){
    const {value,done}=await reader.read();if(done){if(myGeneration===generation&&phase!=='ended')throw Error('The demo connection ended.');break;}
    pending+=decoder.decode(value,{stream:true});if(pending.length>1_048_576)throw Error('The demo connection could not continue.');
    let i;while((i=pending.indexOf('\n'))>=0){const raw=pending.slice(0,i);pending=pending.slice(i+1);if(!raw)continue;const e=JSON.parse(raw);
      if(myGeneration!==generation)return;
      if(e.type==='ready'){
        phase='active';expires=e.expiresAt;status(mode==='voice'?'LIVE CONVERSATION':'LIVE TEXT CHAT',true);notice('');
        $('activity').textContent=`${e.agent} is joining the conversation…`;$('mic-state').textContent=mode==='voice'?'MIC LIVE':'TEXT CHAT · MIC OFF';
        $('text-form').hidden=mode!=='text';$('send').disabled=true;
        if(mode==='voice')startCapture(myGeneration);
        timer=setInterval(()=>{const seconds=Math.max(0,Math.min(180,180-Math.ceil((expires-Date.now())/1000)));$('timer').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} / 3:00`;if(Date.now()>=expires)closeLocal('Demo time reached. Your microphone is off.');},200);
      }else if(e.type==='transcript'){
        transcript(e.who,e.text,Boolean(e.typed));$('activity').textContent=e.who==='agent'?'Responding…':'Listening…';
      }else if(e.type==='audio')play(e);
      else if(e.type==='interrupted'){clearPlayback();lastLine=null;$('activity').textContent='Listening…';}
      else if(e.type==='turn_complete'){lastLine=null;$('activity').textContent=mode==='voice'?'Your turn. Speak naturally.':'Your turn.';$('send').disabled=false;}
      else if(e.type==='closing'){phase='closing';stopCapture();$('send').disabled=true;$('activity').textContent=e.message;status('WRAPPING UP');}
      else if(e.type==='ended'){
        const messages={silence:'The demo ended after a pause. Your microphone is off.',time:'That’s the three-minute demo. Your microphone is off.',budget:'High demand today — start your free trial to talk to your own agent.',timeout:'The connection did not respond in time. Your microphone is off.',provider:'The connection ended. Your microphone is off; no appointment or quote was created.'};
        closeLocal(messages[e.reason]||'Your session has ended and your microphone is off.','server');return;
      }
    }
  }
}
function stopCapture(){
  if(capture){capture.port.onmessage=null;try{capture.disconnect();}catch{}capture=null;}
  try{source?.disconnect();}catch{}source=null;
  if(stream){for(const t of stream.getTracks()){t.onended=null;t.stop();}stream=null;}
  $('mic-state').textContent='MIC OFF';$('level').style.width='0%';
}
function startCapture(myGeneration){
  if(!context||!stream)return;
  source=context.createMediaStreamSource(stream);capture=new AudioWorkletNode(context,'otc-capture');source.connect(capture);capture.connect(context.destination);
  capture.port.onmessage=e=>{
    if(myGeneration!==generation||phase!=='active')return;
    const b=e.data;if(!(b instanceof ArrayBuffer))return;queued+=b.byteLength;
    const samples=new DataView(b);let peak=0;for(let i=0;i<b.byteLength;i+=2)peak=Math.max(peak,Math.abs(samples.getInt16(i,true))/32768);$('level').style.width=Math.min(100,peak*220)+'%';
    if(queued>32000){closeLocal('The connection is too slow to continue. Your microphone is off.');return;}
    const session=token,signal=controller.signal;
    upload=upload.then(async()=>{if(myGeneration!==generation||phase!=='active')return;
      const r=await fetch(api+'audio',{method:'POST',headers:{'content-type':'application/octet-stream','x-demo-session':session},body:b,signal});if(!r.ok)throw Error('Audio connection ended.');
    }).catch(()=>{if(myGeneration===generation)closeLocal('The audio connection ended. Your microphone is off.');}).finally(()=>{if(myGeneration===generation)queued-=b.byteLength;});
  };
}
async function start(which){
  if(!config?.enabled||['starting','connecting','active','closing'].includes(phase))return;
  const g=++generation;mode=which;phase='starting';notice('');chooseLock(true);$('idle').hidden=true;$('ended').hidden=true;$('conversation').hidden=false;
  $('text-form').hidden=true;$('transcript').replaceChildren();lastLine=null;$('timer').textContent='0:00 / 3:00';$('end').disabled=false;
  controller=new AbortController();queued=0;upload=Promise.resolve();status(which==='voice'?'ALLOW MICROPHONE':'CONNECTING');
  $('activity').textContent=which==='voice'?'Allow your microphone to begin.':'Connecting text chat…';
  try{
    if(which==='voice'){
      if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia)throw Error('Voice needs a secure browser connection. Use text chat instead.');
      const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('This browser does not support live audio. Use text chat instead.');
      context=new Audio({sampleRate:16000});await context.resume();if(g!==generation)return;
      const media=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      if(g!==generation){media.getTracks().forEach(t=>t.stop());return;}stream=media;
      for(const t of media.getTracks())t.onended=()=>{if(g===generation)closeLocal('The microphone was disconnected. Your session has ended.');};
      await context.audioWorklet.addModule('capture-worklet.js');if(g!==generation)return;
    }
    const data=await request('session',{agent:byAgent(),mode:which},controller.signal,null);
    if(g!==generation){request('end',{},undefined,data.token).catch(()=>{});return;}
    token=data.token;phase='connecting';status('CONNECTING');$('activity').textContent='Connecting to '+data.agent+'…';
    await processEvents(g);
  }catch(e){
    if(g!==generation)return;
    const message=e.name==='NotAllowedError'?'Microphone access was not granted. You can use text chat instead.':e.name==='NotFoundError'?'No microphone was found. You can use text chat instead.':e.message||'The demo could not connect.';
    closeLocal(message);notice(message);
  }
}
$('start-voice').addEventListener('click',()=>start('voice'));$('start-text').addEventListener('click',()=>start('text'));
$('end').addEventListener('click',()=>closeLocal());$('again').addEventListener('click',()=>{notice('');resetIdle();$('start-voice').focus();});
$('text-form').addEventListener('submit',async e=>{e.preventDefault();if(phase!=='active'||mode!=='text'||$('send').disabled)return;
  const text=$('message').value.trim();if(!text)return;$('send').disabled=true;
  try{await request('text',{text},controller.signal);$('message').value='';notice('');}catch(e){notice(e.message);$('send').disabled=false;}
});
$('message').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('text-form').requestSubmit();}});
window.addEventListener('pagehide',()=>{const t=token;token=null;generation++;releaseMedia();controller?.abort();clearInterval(timer);if(t)fetch(api+'end',{method:'POST',headers:{'content-type':'application/json','x-demo-session':t},body:'{}',keepalive:true}).catch(()=>{});});
async function init(){try{const r=await fetch(api+'status',{cache:'no-store'});if(!r.ok)throw Error();config=await r.json();
  for(const key of ['miles','nova'])$('name-'+key).textContent=config.agents[key].name;
  if(config.signupUrl){$('signup').href=config.signupUrl;$('signup').hidden=false;}
  resetIdle();if(!config.enabled)notice(config.notice);
}catch{config={enabled:false};resetIdle();notice('This preview is not connected to the demo server. No microphone or provider session has started.');}}
init();
})();
