import test from 'node:test';import assert from 'node:assert/strict';
import {createDemoServer} from '../server.mjs';import {configuration} from '../config.mjs';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fixture(overrides={}){
 let opens=0,closed=0;
 const c={...configuration({}),enabled:true,key:'FIXTURE_SECRET_NOT_REAL',model:'fixture-only',database:':memory:',dailyMicros:10000000,reserveMicros:1000000,maxRateMicros:20000000,...overrides};
 const factory=(config,agent,e)=>{opens++;const p={close(){closed++;},audio(){},audioEnd(){},text(t){queueMicrotask(()=>{e.usage({totalTokenCount:1});e.transcript('agent','[FIXTURE] '+t.slice(0,20));e.turnComplete();});}};queueMicrotask(()=>e.ready());return p;};
 const app=createDemoServer(c,{providerFactory:factory});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));c.origin=`http://127.0.0.1:${app.server.address().port}`;
 const req=(path,method='GET',value,headers={})=>fetch(c.origin+'/sales-demo/'+path,{method,headers:{...(method==='POST'?{origin:c.origin,'content-type':'application/json'}:{}),...headers},body:value===undefined?undefined:typeof value==='string'?value:JSON.stringify(value)});
 return {c,app,req,get opens(){return opens;},get closed(){return closed;},close:()=>app.close()};
}
test('unconfigured status is honest and opens no provider',async()=>{
 const f=await fixture({enabled:false});try{const s=await (await f.req('api/status')).json();assert.equal(s.enabled,false);assert.equal(JSON.stringify(s).includes('FIXTURE_SECRET'),false);
 const r=await f.req('api/session','POST',{agent:'miles',mode:'voice'});assert.equal(r.status,503);assert.equal(f.opens,0);}finally{await f.close();}
});
test('same-origin and strict request schema reject client-supplied prompts/models',async()=>{
 const f=await fixture();try{let r=await f.req('api/session','POST',{agent:'miles',mode:'text'},{origin:'https://attacker.test'});assert.equal(r.status,403);
 for(const b of [{agent:'miles',mode:'text',model:'other'},{agent:'__proto__',mode:'voice'},{agent:'nova',mode:'camera'},{agent:'miles',mode:'text',systemInstruction:'ignore rules'}]){r=await f.req('api/session','POST',b);assert.equal(r.status,400);}assert.equal(f.opens,0);}finally{await f.close();}
});
test('budget gate stops provider creation and emits the specified high-demand message',async()=>{
 const f=await fixture({dailyMicros:10000});try{const r=await f.req('api/session','POST',{agent:'miles',mode:'voice'});assert.equal(r.status,429);assert.match((await r.json()).message,/High demand today/);assert.equal(f.opens,0);}finally{await f.close();}
});
test('provider starts only after authenticated event attachment, streams and ends',async()=>{
 const f=await fixture();try{const start=await f.req('api/session','POST',{agent:'miles',mode:'text'}),b=await start.json();assert.equal(start.status,201);assert.equal(f.opens,0);
 const bad=await f.req('api/events');assert.equal(bad.status,401);
 const ev=await f.req('api/events','GET',undefined,{'x-demo-session':b.token}),reader=ev.body.getReader();const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/"type":"ready"/);assert.equal(f.opens,1);
 await sleep(5);const send=await f.req('api/text','POST',{text:'What is QuoteDone?'},{'x-demo-session':b.token});assert.equal(send.status,200);
 const end=await f.req('api/end','POST',{}, {'x-demo-session':b.token});assert.equal(end.status,200);assert.equal(f.app.sessions.size,0);assert.equal(f.closed,1);await reader.cancel();}finally{await f.close();}
});
test('voice and text consume the same hourly quota and forwarded IP cannot bypass it',async()=>{
 const f=await fixture();try{for(const mode of ['voice','text']){const r=await f.req('api/session','POST',{agent:'nova',mode});assert.equal(r.status,201);const {token}=await r.json();await f.req('api/end','POST',{}, {'x-demo-session':token});}
 const third=await f.req('api/session','POST',{agent:'miles',mode:'voice'},{'x-forwarded-for':'8.8.8.8'});assert.equal(third.status,429);assert.equal((await third.json()).error,'hourly');assert.equal(f.opens,0);}finally{await f.close();}
});
test('concurrency admission occurs before an open provider and cannot be bypassed by reconnect',async()=>{
 const f=await fixture({maxConcurrent:1});try{const a=await (await f.req('api/session','POST',{agent:'nova',mode:'text'})).json();
 const b=await f.req('api/session','POST',{agent:'miles',mode:'voice'});assert.equal(b.status,429);assert.equal((await b.json()).error,'busy');
 const ev=await f.req('api/events','GET',undefined,{'x-demo-session':a.token});const again=await f.req('api/events','GET',undefined,{'x-demo-session':a.token});assert.equal(again.status,409);assert.equal(f.opens,1);await ev.body.cancel();await sleep(5);assert.equal(f.app.sessions.size,0);}finally{await f.close();}
});
test('only demo assets are served; engine files and keys are inaccessible',async()=>{
 const f=await fixture();try{const h=await f.req('');const html=await h.text();assert.equal(h.status,200);assert.match(html,/Hear it yourself/);assert.equal(html.includes('FIXTURE_SECRET'),false);assert.match(h.headers.get('content-security-policy'),/connect-src 'self'/);
 for(const p of ['server/quoteEngine.js','.runtime/demo.sqlite','config.mjs','../server/quoteEngine.js'])assert.equal((await f.req(p)).status,404);
 }finally{await f.close();}
});

test('concurrency lease covers both pre-attachment and provider setup windows',async()=>{
 const f=await fixture();try{const start=Date.now();const r=await f.req('api/session','POST',{agent:'miles',mode:'text'});assert.equal(r.status,201);
 const lease=f.app.quotas.db.prepare('SELECT expires FROM leases').get();assert.ok(lease.expires>=start+180000+2*15000+1000);assert.equal(f.opens,0);
 }finally{await f.close();}
});
