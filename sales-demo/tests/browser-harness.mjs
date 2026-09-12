// Test transport only. Never imported by server.mjs or shipped to a browser.
import {createDemoServer} from '../server.mjs';import {configuration} from '../config.mjs';
const mode=process.argv[2]||'enabled';
const config={...configuration({}),enabled:mode!=='disabled',key:'TEST_TRANSPORT_NO_NETWORK',model:'fixture-only',database:':memory:',dailyMicros:mode==='budget'?10000:10000000,reserveMicros:1000000,maxRateMicros:20000000};
if(mode==='timeout')config.limits={...config.limits,handshakeMs:300};
if(mode==='duration')config.limits={...config.limits,sessionMs:1800,graceMs:300};
const app=createDemoServer(config,{providerFactory:(c,a,e)=>{
 let closed=false,audioBytes=0;
 if(mode!=='timeout')queueMicrotask(()=>e.ready());
 return {text(t){if(closed)return;queueMicrotask(()=>{if(closed)return;e.usage({totalTokenCount:5});e.transcript('agent',t.startsWith('Begin')?'[TEST TRANSPORT — NOT LIVE AI] Ready for a product question.':'[TEST TRANSPORT] '+t);e.turnComplete();});},
 audio(b){audioBytes+=b.length;if(audioBytes===3200){e.audio(Buffer.alloc(4800));}if(audioBytes===6400){e.interrupt();}},audioEnd(){},close(){if(closed)return;closed=true;console.log(JSON.stringify({event:'closed',audioBytes}));}};
}});
app.server.listen(0,'127.0.0.1',()=>{config.origin=`http://127.0.0.1:${app.server.address().port}`;console.log(JSON.stringify({origin:config.origin}));});
for(const s of ['SIGTERM','SIGINT'])process.once(s,()=>app.close());
