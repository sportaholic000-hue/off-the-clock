import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import path from 'node:path';
import express from 'express';
import {fixture,address,at} from './leadCaptureRepair20261006Fixture.mjs';
import {createAuthSessionService} from '../server/src/authSessionService.js';
import {installOwnerAssets} from '../server/src/productionAssets.js';

export async function httpFixture(t){
  const root=path.resolve(new URL('..',import.meta.url).pathname),directory=mkdtempSync(path.join(tmpdir(),'SYNTHETIC-capture-http-'));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));
  const filename=path.join(directory,'synthetic.sqlite'),f=fixture(t,filename),secret='SYNTHETIC_CAPTURE_HTTP_SESSION_ONLY'.padEnd(64,'x');
  const sessions=createAuthSessionService(f.db,{environment:{JWT_SECRET:secret}}),tokens={};
  for(const id of ['synthetic-a','synthetic-b','synthetic-staff'])tokens[id]=sessions.create(f.db.prepare('SELECT * FROM users WHERE id=?').get(id)).token;
  const probe=createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
  const child=spawn(process.execPath,['server/src/server.js'],{cwd:root,env:{...process.env,NODE_ENV:'test',PORT:String(port),DATABASE_PATH:filename,PRICEBOOK_PATH:path.join(directory,'pricebooks'),APP_DATA_DIR:directory,JWT_SECRET:secret,LOCAL_PREVIEW_MODE:'false',ALLOW_PROVIDER_WRITES:'false',VOICE_RUNTIME_ENABLED:'false',STRIPE_BILLING_ENABLED:'false',TWILIO_AUTH_TOKEN:'',TWILIO_ACCOUNT_SID:'',TWILIO_API_KEY_SID:'',TWILIO_API_KEY_SECRET:'',GEMINI_API_KEY:'',STRIPE_SECRET_KEY:''},stdio:['ignore','pipe','pipe']});
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk);
  t.after(async()=>{if(child.exitCode===null){child.kill('SIGTERM');let timer;try{await Promise.race([once(child,'exit'),new Promise(resolve=>{timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},5000);})]);}finally{clearTimeout(timer);}}});
  const deadline=Date.now()+20000;while(!output.includes('Off The Clock AI server listening')){assertReady();await new Promise(resolve=>setTimeout(resolve,25));}
  function assertReady(){if(child.exitCode!==null||Date.now()>deadline)throw Error('Synthetic server failed to start: '+output);}
  const apiBase='http://127.0.0.1:'+port;
  const request=async(route,owner='synthetic-a',options={})=>{const response=await fetch(apiBase+route,{...options,headers:{...(owner?{authorization:'Bearer '+tokens[owner]}:{}),...(options.body?{'content-type':'application/json'}:{}),...options.headers},body:options.body?JSON.stringify(options.body):undefined});return {status:response.status,body:await response.json()};};
  // Production static handler, real API and real compiled app. The proxy is
  // loopback-only; it neither fabricates data nor changes route authorization.
  const app=express();const feedRequests=[];let feedHook=null;
  app.use('/api',express.raw({type:()=>true}),async(req,res,next)=>{try{
    if(req.originalUrl==='/api/leads/activity'){feedRequests.push({at:Date.now(),authorization:req.headers.authorization});if(feedHook&&await feedHook(req,res))return;}
    const response=await fetch(apiBase+req.originalUrl,{method:req.method,headers:{...(req.headers.authorization?{authorization:req.headers.authorization}:{}),...(req.headers['content-type']?{'content-type':req.headers['content-type']}:{})},body:['GET','HEAD'].includes(req.method)?undefined:req.body});
    res.status(response.status);for(const name of ['content-type','cache-control'])if(response.headers.has(name))res.set(name,response.headers.get(name));res.send(Buffer.from(await response.arrayBuffer()));
  }catch(error){next(error);}});
  installOwnerAssets(app,path.join(root,'client/dist'));const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return {...f,tokens,request,base:'http://127.0.0.1:'+server.address().port,feedRequests,setFeedHook:hook=>{feedHook=hook;}};
}

export async function seedViews(f){
  const c=f.context(),v=f.voice(c),notes='[SYNTHETIC] Preserve this gate request; call after five.';
  await v.tool('captureLead',{email:'original@example.invalid',address,notes,description:'[SYNTHETIC] Gate follow-up'});
  await v.tool('flagUrgent',{reason:'safety',summary:'[SYNTHETIC] Gate can fall.'});const row=f.lead(c)[0];
  f.db.prepare("UPDATE calls SET summaryText='[SYNTHETIC] Initial captured gate',outcome='CALL_ENDED' WHERE ownerId=? AND id=?").run(c.ownerId,c.callSid);
  f.db.prepare("INSERT INTO bookingIntents(id,ownerId,tokenHash,sourceType,sourceId,serviceId,resultType,status,expiresAtUtc,createdAt) VALUES('synthetic-followup-intent',?,'SYNTHETIC_HTTP','lead',?,'synthetic-service','ESTIMATE_REQUIRES_REVIEW','OPEN','2026-10-10T00:00:00Z',?)").run(c.ownerId,row.id,at);
  const preference=JSON.stringify({name:'[SYNTHETIC] Preferred Alex',phone:'+19025550199',email:'preferred@example.invalid',cost:'SECRET_COST'});
  f.db.prepare("INSERT INTO bookingPreferences(id,ownerId,intentId,preferredWindowsJson,customerJson,locationJson,status,createdAt,updatedAt) VALUES('synthetic-followup-preference',?,'synthetic-followup-intent','[]',?,?,'REQUESTED',?,?)").run(c.ownerId,preference,JSON.stringify({addressLine1:'[SYNTHETIC] Preferred site',city:'Synthetic City',privateRate:'SECRET_RATE'}),at,at);
  const receipt=JSON.stringify({customerResult:{resultType:'INSTANT_ESTIMATE_READY',service:'[SYNTHETIC] Saved quote',lowEstimate:221.23,highEstimate:221.23},privateCost:'SECRET_COST'});
  const submission=JSON.stringify({contact:{email:'instant@example.invalid',phone:'+19025550188',cost:'SECRET_COST'},location:{addressLine1:'[SYNTHETIC] Instant site'},context:'[SYNTHETIC] After 6'});
  f.db.prepare("INSERT INTO quotes(id,ownerId,callId,serviceType,resultJson,status,createdAt) VALUES('synthetic-http-quote',?,?,'FENCING_INSTALL',?,'INSTANT',?)").run(c.ownerId,c.callSid,receipt,at);
  f.db.prepare("INSERT INTO quoteSubmissions(ownerId,requestId,contentDigest,recordId,resultType,bookRevision,originalSubmissionJson,internalOutcomeJson,customerResponseJson,createdAt) VALUES(?,'synthetic-http-submission','SYNTHETIC','synthetic-http-quote','INSTANT_ESTIMATE_READY','SYNTHETIC',?,'{}','{}',?)").run(c.ownerId,submission,at);
  const foreign=f.context('synthetic-b');await f.voice(foreign).tool('captureLead',{description:'[SYNTHETIC] OTHER TENANT ONLY',email:'foreign@example.invalid'});
  return {c,row,notes,receipt,submission,preference,foreign};
}
