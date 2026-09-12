import http from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { configuration, ROOT } from './config.mjs';
import { Quotas, DemoError, clientIP } from './quota.mjs';
import { DemoSession } from './session.mjs';
import { PUBLIC_ERRORS } from './policy.mjs';

const ASSETS=new Map([['/sales-demo/',['index.html','text/html; charset=utf-8']],['/sales-demo/index.html',['index.html','text/html; charset=utf-8']],
  ['/sales-demo/styles.css',['styles.css','text/css; charset=utf-8']],['/sales-demo/app.js',['app.js','text/javascript; charset=utf-8']],
  ['/sales-demo/capture-worklet.js',['capture-worklet.js','text/javascript; charset=utf-8']]]);
async function body(req,max,json=true){
  const chunks=[];let n=0;
  for await(const b of req){n+=b.length;if(n>max)throw new DemoError('invalid',413);chunks.push(b);}
  const b=Buffer.concat(chunks);if(!json)return b;
  try{const data=JSON.parse(b.toString('utf8'));if(!data||typeof data!=='object'||Array.isArray(data))throw Error();return data;}
  catch{throw new DemoError('invalid');}
}
function json(res,status,data){res.writeHead(status,{'content-type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
function safeHeaders(res){
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','no-referrer');
  res.setHeader('x-frame-options','SAMEORIGIN');res.setHeader('x-robots-tag','noindex, nofollow');
  res.setHeader('permissions-policy','microphone=(self), camera=(), geolocation=()');
  res.setHeader('content-security-policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'none'; media-src blob:; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");
}
export function createDemoServer(config,{providerFactory,now=Date.now,quotas:givenQuotas,autoTick=true}={}){
  const quotas=givenQuotas||new Quotas({database:config.database,dailyMicros:config.dailyMicros,reserveMicros:config.reserveMicros,maxConcurrent:config.maxConcurrent,hourlySessions:config.limits.hourlySessions,now});
  const sessions=new Map();const sockets=new Set();let stopping=false;
  const server=http.createServer(async(req,res)=>{
    safeHeaders(res);
    try{
      const expected=new URL(config.origin);
      if(req.headers.host!==expected.host)throw new DemoError('invalid',403);
      if(req.headers.origin&&req.headers.origin!==config.origin)throw new DemoError('invalid',403);
      if(req.headers['sec-fetch-site']==='cross-site')throw new DemoError('invalid',403);
      if(req.method==='POST'&&req.headers.origin!==config.origin)throw new DemoError('invalid',403);
      const path=new URL(req.url,config.origin).pathname;
      if(req.method==='GET'&&ASSETS.has(path)){
        const [file,type]=ASSETS.get(path);res.writeHead(200,{'content-type':type});return res.end(readFileSync(join(ROOT,'public',file)));
      }
      if(path==='/sales-demo'&&req.method==='GET'){res.writeHead(308,{location:'/sales-demo/'});return res.end();}
      if(req.method==='GET'&&path==='/sales-demo/api/status')return json(res,200,{enabled:config.enabled&&!stopping,agents:Object.fromEntries(Object.entries(config.agents).map(([k,a])=>[k,{name:a.name}])),sessionSeconds:180,signupUrl:config.signupUrl,notice:config.enabled?null:PUBLIC_ERRORS.disabled});
      if(path==='/sales-demo/api/session'&&req.method==='POST'){
        if(!config.enabled||stopping)throw new DemoError('disabled',503);
        if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||''))throw new DemoError('invalid',415);
        const b=await body(req,4096);
        if(Object.keys(b).some(k=>!['agent','mode'].includes(k))||!Object.hasOwn(config.agents,b.agent)||!['voice','text'].includes(b.mode))throw new DemoError('invalid');
        const ip=clientIP(req,config.trustedProxyIPs);
        const lease=quotas.admit(ip,config.limits.sessionMs+2*config.limits.handshakeMs+1000);
        let s;
        try{s=new DemoSession({config,agent:b.agent,mode:b.mode,quotas,lease,now,providerFactory,emit:()=>{},onEnd:token=>sessions.delete(token)});}
        catch(e){quotas.release(lease);throw e;}
        sessions.set(s.token,s);return json(res,201,{token:s.token,mode:b.mode,agent:config.agents[b.agent].name});
      }
      if(path.startsWith('/sales-demo/api/')){
        const token=req.headers['x-demo-session'];
        if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new DemoError('invalid',401);
        const s=sessions.get(token);if(!s)throw new DemoError('invalid',401);
        if(path==='/sales-demo/api/events'&&req.method==='GET'){
          if(s.state!=='pending')throw new DemoError('invalid',409);
          res.writeHead(200,{'content-type':'application/x-ndjson','x-accel-buffering':'no'});res.flushHeaders();
          const emit=(type,data)=>{
            if(res.destroyed)return false;
            if(res.writableLength>config.limits.maxQueuedBytes){res.destroy();return false;}
            res.write(JSON.stringify({type,...data})+'\n');
            if(type==='ended')res.end();return true;
          };
          res.once('close',()=>s.end('disconnected'));
          s.attach(emit);return;
        }
        if(path==='/sales-demo/api/end'&&req.method==='POST'){await body(req,32,false);s.end('user');return json(res,200,{ended:true});}
        if(path==='/sales-demo/api/text'&&req.method==='POST'){
          const b=await body(req,10000);
          if(Object.keys(b).some(k=>k!=='text'))throw new DemoError('invalid');
          s.text(b.text);return json(res,200,{accepted:true});
        }
        if(path==='/sales-demo/api/audio'&&req.method==='POST'){
          if(req.headers['content-type']!=='application/octet-stream')throw new DemoError('invalid',415);
          const b=await body(req,config.limits.maxFrameBytes,false);s.audio(b);return json(res,200,{accepted:true});
        }
      }
      throw new DemoError('invalid',404);
    }catch(e){
      // Never forward raw upstream errors, request bodies, credentials or URLs.
      const err=e instanceof DemoError?e:new DemoError('provider',503);
      if(res.headersSent){res.end();return;}
      if(err.retryAfter)res.setHeader('retry-after',String(err.retryAfter));
      json(res,err.status,{error:err.code,message:PUBLIC_ERRORS[err.code]||PUBLIC_ERRORS.invalid,retryAfter:err.retryAfter||undefined});
    }
  });
  server.requestTimeout=10000;server.headersTimeout=10000;server.keepAliveTimeout=5000;server.maxHeadersCount=30;
  server.on('connection',s=>{sockets.add(s);s.once('close',()=>sockets.delete(s));});
  const tick=()=>{for(const s of [...sessions.values()])s.tick();};
  const timer=autoTick?setInterval(tick,100):null;timer?.unref();
  async function close(){stopping=true;if(timer)clearInterval(timer);for(const s of [...sessions.values()])s.end('shutdown');
    for(const socket of sockets)socket.destroy();await new Promise(r=>server.close(r));if(!givenQuotas)quotas.close();}
  return {server,quotas,sessions,tick,close};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  let app;
  try{
    const config=configuration();app=createDemoServer(config);
    app.server.listen(config.port,config.host,()=>console.log(`Off The Clock sales demo: ${config.origin}/sales-demo/ (${config.enabled?'provider enabled':'review mode; provider disabled'})`));
    app.server.on('error',()=>{console.error('Demo server could not listen. Check the approved bind address and port.');process.exitCode=1;app.close();});
    for(const sig of ['SIGINT','SIGTERM'])process.once(sig,()=>app.close());
  }catch(e){console.error('Demo startup rejected:',e.message);process.exitCode=1;}
}
