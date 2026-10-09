// Synthetic authenticated dashboard or public widget traffic through the full server.
// The driver is deliberately in the same process; reported CPU/RSS includes it.
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import os from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const mode=process.argv[2],durationMs=Number(process.argv[3]||600_000),out=process.argv[4];
if(!['owner','widget'].includes(mode)||!Number.isSafeInteger(durationMs)||durationMs<=0||!out)throw Error('Usage: http-load.mjs <owner|widget> [duration-ms] <output.json>');
const temporary=mkdtempSync(join(tmpdir(),'synthetic-load-'));
const books=join(temporary,'pricebooks');mkdirSync(books);
const filename=join(temporary,'database.sqlite');
const secret='SYNTHETIC_LOAD_SESSION_KEY'.padEnd(64,'x');
Object.assign(process.env,{NODE_ENV:'test',DATABASE_PATH:filename,APP_DATA_DIR:temporary,PRICEBOOK_PATH:books,JWT_SECRET:secret,BOOKING_SLOT_TOKEN_SECRET:'SYNTHETIC_LOAD_BOOKING_KEY'.padEnd(64,'x'),ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',LOCAL_PREVIEW_MODE:'false',TWILIO_ACCOUNT_SID:'',TWILIO_AUTH_TOKEN:'',TWILIO_API_KEY_SID:'',TWILIO_API_KEY_SECRET:'',GEMINI_API_KEY:'',STRIPE_SECRET_KEY:''});
const socket=createServer();socket.listen(0,'127.0.0.1');await once(socket,'listening');process.env.PORT=String(socket.address().port);await new Promise(resolve=>socket.close(resolve));
const {fixture,A,B}=await import('../../test/overageMinute20261006Fixture.mjs');
const seed=fixture(null,{filename});
const {monthlyAnniversary}=await import('../../server/src/billingUsagePolicy.js');
const present=new Date(Math.floor(Date.now()/1000)*1000),start=new Date(present.getTime()-2*86400_000).toISOString(),end=monthlyAnniversary(start,1);
const paidTerm={plan:'QuoteDone',start,end,trial_start:Math.floor(Date.parse(start)/1000)-14*86400,trial_end:Math.floor(Date.parse(start)/1000)};
seed.setTime(present);seed.activate(A,paidTerm);
if(mode==='widget')seed.activate(B,paidTerm);
seed.close();
const {httpServer,lifecycle}=await import('../../server/src/server.js');
if(!httpServer.listening)await once(httpServer,'listening');
const {db}=await import('../../server/src/db.js');
const {createAuthSessionService}=await import('../../server/src/authSessionService.js');
db.prepare('INSERT OR IGNORE INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,?,?)').run(A,'{}',new Date().toISOString());
const sessionService=createAuthSessionService(db,{environment:{JWT_SECRET:secret}});
const owner=db.prepare('SELECT * FROM users WHERE id=?').get(A),tokens=[];
for(let i=0;i<(mode==='owner'?250:1);i++)tokens.push(sessionService.create(owner).token);
const base='http://127.0.0.1:'+httpServer.address().port;
const info={cpuModel:os.cpus()[0]?.model,cpuCount:os.cpus().length,node:process.version};
const widgets=[];
if(mode==='widget'){
  const {mowing}=await import('../engine-independent/fixtures.mjs');
  const {savePricebook,loadPricebook}=await import('../../server/priceBookService.js');
  const {approveApplicationService,bookRevision}=await import('../../server/src/quoteDoneBridge.js');
  for(const ownerId of [A,B]){
    const f=mowing(),raw=structuredClone(f.ownerPricing);delete raw.origin;
    db.prepare('INSERT OR IGNORE INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,?,?)').run(ownerId,'{}',new Date().toISOString());
    savePricebook(ownerId,{services:[raw],defaults:{...f.businessDefaults,currency:'CAD',quoteTimeZone:'UTC'}});
    const book=loadPricebook(ownerId);
    approveApplicationService(ownerId,raw.id,{revision:bookRevision(book),confirmConfiguration:true,confirmLegacySettings:true},{timeZone:'UTC'});
    const publicKey=randomUUID();widgets.push({publicKey,serviceId:raw.id,customerInputs:f.customerInputs});
    db.prepare('INSERT INTO quoteAccessKeys(ownerId,publicKey,allowedOriginsJson,createdAt) VALUES(?,?,?,?)').run(ownerId,publicKey,JSON.stringify(['https://synthetic.example']),new Date().toISOString());
  }
}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const snapshot=()=>{const c=process.cpuUsage();return {wall:new Date().toISOString(),rssBytes:process.memoryUsage().rss,cpu:{userMs:c.user/1000,systemMs:c.system/1000,totalMs:(c.user+c.system)/1000}};};
const baseline=snapshot(),stats={requests:0,success:0,statuses:{},errors:[],latenciesMs:[]};let peak=baseline;
const sampler=setInterval(()=>{const s=snapshot();if(s.rssBytes>peak.rssBytes)peak=s;},1000);
async function hit(token,index){
  const startAt=performance.now();try{
    const widget=widgets[index%widgets.length];
    const endpoint=mode==='owner'?'/api/dashboard':'/api/public/quote/'+widget.publicKey;
    const response=await fetch(base+endpoint,mode==='owner'?{headers:{authorization:'Bearer '+token}}:{method:'POST',headers:{origin:'https://synthetic.example','content-type':'application/json'},body:JSON.stringify({requestId:randomUUID(),serviceId:widget.serviceId,customerInputs:widget.customerInputs,contact:{email:'synthetic-'+index+'@example.invalid'}})});
    const value=await response.json();stats.statuses[response.status]=(stats.statuses[response.status]||0)+1;
    if(response.ok&&(mode==='owner'?value.minuteUsage?.status==='PAID':['INSTANT_ESTIMATE_READY','PARTIAL_ESTIMATE_READY','ESTIMATE_REQUIRES_REVIEW'].includes(value.resultType)))stats.success++;
    else if(stats.errors.length<20)stats.errors.push({index,status:response.status,body:mode==='owner'?value.minuteUsage:JSON.stringify(value).slice(0,400)});
  }catch(error){if(stats.errors.length<20)stats.errors.push({index,error:String(error)});}
  stats.latenciesMs.push(Math.round((performance.now()-startAt)*10)/10);stats.requests++;
}
try{
  // For a shorter diagnostic run the frequency stays 30 seconds/600 ms;
  // the required run is the default ten-minute duration.
  const started=performance.now(),jobs=[];
  if(mode==='owner'){
    for(let cycle=0;cycle<Math.ceil(durationMs/30_000);cycle++){
      await sleep(Math.max(0,started+cycle*30_000-performance.now()));
      jobs.push(Promise.all(tokens.map((token,i)=>hit(token,cycle*250+i))));
    }
  }else{
    for(let i=0;i<1000&&i*600<durationMs;i++){
      await sleep(Math.max(0,started+i*600-performance.now()));jobs.push(hit(null,i));
    }
  }
  await Promise.all(jobs);
  await sleep(Math.max(0,started+durationMs-performance.now()));
  const ended=snapshot();const ordered=stats.latenciesMs.sort((a,b)=>a-b);
  const result={scenario:mode==='owner'?'250-authenticated-owner-sessions-dashboard-minute-usage':'1000-public-widget-quote-submissions',durationMs,actualMs:Math.round(performance.now()-started),machine:info,baseline,peak,ended,requests:stats.requests,success:stats.success,statuses:stats.statuses,errors:stats.errors,latencyMs:{median:ordered[Math.floor(ordered.length/2)],p95:ordered[Math.floor(ordered.length*.95)],max:ordered.at(-1)}};
  writeFileSync(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({scenario:result.scenario,requests:result.requests,success:result.success,statuses:result.statuses,peakRssMB:peak.rssBytes/1048576,cpuMs:ended.cpu.totalMs-baseline.cpu.totalMs,errors:stats.errors.slice(0,2)}));
  if(stats.success!==stats.requests)process.exitCode=1;
}finally{
  clearInterval(sampler);
  await lifecycle.shutdown({timeoutMs:10000,exit:()=>{}});
  db.close();rmSync(temporary,{recursive:true,force:true});
}
