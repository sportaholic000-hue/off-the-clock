import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {fork,spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import Database from 'better-sqlite3';
import {productionEnv} from './helpers/railwayEnv.mjs';
import {mowing} from '../verification/engine-independent/fixtures.mjs';
import {verifyBackup} from '../server/src/backups.js';
import {convertPricebookMoney} from '../server/priceBookMoney.js';

// Handwritten expectations precede execution: verification/backup-restore-20261006/EXPECTED.md.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://synthetic-rehearsal.example.invalid';
const timestamp = () => new Date().toISOString();
const errorIdentity = error => ({name:error.name,code:error.code||null});
function bookObservation(filename) {
  try {
    const bytes=fs.readFileSync(filename),stat=fs.statSync(filename);
    return {at:timestamp(),path:filename,exists:true,sha256:hash(bytes),bytes:bytes.length,mtimeMs:stat.mtimeMs};
  } catch(error) {return {at:timestamp(),path:filename,exists:error.code==='ENOENT'?false:null,errorCode:error.code||'READ_FAILED'};}
}
function responseDiagnostic(body) {
  // Deliberately omit tokens, contacts, full books/receipts, arbitrary strings
  // and headers. Unknown error text is fingerprinted, never printed verbatim.
  if(!body||typeof body!=='object'||Array.isArray(body))return {shape:typeof body};
  const result={fields:Object.keys(body).slice(0,24)};
  for(const key of ['code','resultType'])if(typeof body[key]==='string'&&/^[A-Z_]{1,64}$/.test(body[key]))result[key]=body[key];
  for(const key of ['ok','retryable'])if(typeof body[key]==='boolean')result[key]=body[key];
  for(const key of ['lowEstimate','midEstimate','highEstimate'])if(Object.hasOwn(body,key))
    result[key]=typeof body[key]==='number'&&Number.isFinite(body[key])?body[key]:{present:true,type:typeof body[key]};
  if(Array.isArray(body.services))result.serviceCount=body.services.length;
  if(typeof body.error==='string') {
    const recovery='The saved price book cannot be used. Quoting is paused until it is restored. Restore the saved price-book file from backup or email support@offtheclockai.com; do not create a replacement book.';
    result.error=body.error===recovery||body.error==='Internal server error'?body.error:{sha256:hash(body.error),
      length:body.error.length,quotingPaused:/quoting is paused/i.test(body.error),restoreBackup:/restore.*backup/i.test(body.error)};
  }
  return result;
}
async function freePort() {
  const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
function cleanEnv(env) {
  const result={...process.env,...env,DATABASE_PATH:'',PRICEBOOK_PATH:'',RAILWAY_ENVIRONMENT_ID:'',
    GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',GOOGLE_CALENDAR_REDIRECT_URI:'',ADMIN_EMAIL:'',ADMIN_PASSWORD_HASH:'',
    LOCAL_PREVIEW_MODE:'false',EMAIL_PROVIDER:'console',DEMO_VOICE_AUDITION:'false'};
  delete result.NODE_TEST_CONTEXT;delete result.DEMO_TRUSTED_PROXY_HOPS;
  return result;
}
async function launch(env,registry) {
  const port=await freePort();
  const child=fork(path.join(project,'test/helpers/backupRestoreProcess.mjs'),[],{
    cwd:project,env:cleanEnv({...env,PORT:String(port)}),execPath:process.execPath,
    execArgv:['--experimental-test-module-mocks'],stdio:['ignore','pipe','pipe','ipc']});
  // Keep only a bounded scan window for the existing drain assertion. Raw child
  // output is never placed in a failure message (it could contain credentials).
  let output='',drained=false;
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
    output=(output+chunk).slice(-4096);drained ||= /requests and workers drained; database closed/.test(output);
  });
  const ended=once(child,'exit');
  registry.push(child);
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Startup timed out: pid='+child.pid+' requestedPort='+port)),30000);
    child.once('message',message=>{clearTimeout(timer);resolve(message);});
    child.once('exit',(code,signal)=>{clearTimeout(timer);reject(Error('Startup failed: '+JSON.stringify({pid:child.pid,requestedPort:port,code,signal})));});
  });
  assert.equal(ready.ready,true);
  assert.equal(ready.engineVersion,'quote-engine-vnext-date-context-20261006-v7');
  assert.equal(ready.identity.pid,child.pid);assert.equal(ready.identity.port,port);
  let observationId=0,stopPromise;
  return {url:'http://127.0.0.1:'+port,identity:ready.identity,
    processState:()=>({pid:child.pid,exitCode:child.exitCode,signalCode:child.signalCode,at:timestamp()}),
    observe(ownerId) {
      const id=++observationId;
      return new Promise((resolve,reject)=>{
        const finish=(error,value)=>{clearTimeout(timer);child.off('message',onMessage);child.off('exit',onExit);error?reject(error):resolve(value);};
        const onMessage=message=>{if(message?.type==='restore-observation'&&message.id===id)finish(null,message.observation);};
        const onExit=()=>finish(Error('Recovery observation child exited'));
        const timer=setTimeout(()=>finish(Error('Recovery observation timed out')),5000);
        child.on('message',onMessage);child.once('exit',onExit);
        if(!child.connected)finish(Error('Recovery observation child disconnected'));
        else child.send({type:'restore-observe',id,ownerId},error=>{if(error)finish(error);});
      });
    },
    stop(){return stopPromise??=(async()=>{
      if(child.exitCode===null&&child.signalCode===null){if(process.platform==='win32')child.send('stop');else child.kill('SIGTERM');}
      let timer,result;
      try {result=await Promise.race([ended,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Shutdown timed out: pid='+child.pid)),10000);})]);}
      finally {clearTimeout(timer);}
      const [code,signal]=result;assert.equal(code,0,'child exit code, pid='+child.pid);assert.equal(signal,null,'child exit signal, pid='+child.pid);
      assert.ok(drained,'requests and workers drained; database closed, pid='+child.pid);
    })();}
  };
}
async function cli(env,script,args=[]) {
  const child=spawn(process.execPath,['server/scripts/'+script+'.js',...args],{cwd:project,env:cleanEnv(env),stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  const [code]=await once(child,'exit');assert.equal(code,0,stdout+stderr);return stdout.trim();
}
function database(root,work) {
  const db=new Database(path.join(root,'off-the-clock.sqlite'),{fileMustExist:true});
  try{return work(db);}finally{db.close();}
}
function fixtureConfiguration(root,ownerId,serviceId) {
  // Only local setup: no payment, OAuth or provider operation is represented as verified.
  database(root,db=>{
    db.pragma('foreign_keys=ON');
    const billingAt=new Date().toISOString();
    db.prepare('INSERT OR IGNORE INTO billingAccounts(ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES(?,?,?,?,?)')
      .run(ownerId,'synthetic-customer-'+ownerId,billingAt,billingAt,billingAt);
    db.prepare("UPDATE users SET planStatus='active',emailVerifiedAt=? WHERE id=?").run(new Date().toISOString(),ownerId);
    if(!serviceId)return;
    const now=new Date().toISOString();
    db.prepare('INSERT INTO businessProfiles(ownerId,knowledgeBaseJson,updatedAt) VALUES(?,?,?) ON CONFLICT(ownerId) DO UPDATE SET knowledgeBaseJson=excluded.knowledgeBaseJson')
      .run(ownerId,JSON.stringify({serviceArea:{mode:'all',cities:[]}}),now);
    const weekly=Object.fromEntries(['sun','mon','tue','wed','thu','fri','sat'].map(day=>[day,[{start:'09:00',end:'17:00'}]]));
    db.prepare(`INSERT INTO bookingSettings(ownerId,revision,timezone,provider,calendarId,weeklyAvailabilityJson,blackoutsJson,
      bookingHorizonDays,minimumNoticeMinutes,slotIncrementMinutes,bufferBeforeMinutes,bufferAfterMinutes,directBookingEnabled,updatedAt)
      VALUES(?,'synthetic-settings','UTC','google','synthetic-calendar',?,'[]',30,0,15,0,0,1,?)`).run(ownerId,JSON.stringify(weekly),now);
    db.prepare(`INSERT INTO bookingPolicies(ownerId,serviceId,revision,bookingMode,durationMinutes,enabled,updatedAt)
      VALUES(?,?,'synthetic-policy','book_job',45,1,?)`).run(ownerId,serviceId,now);
  });
}
function persisted(root,ownerId) {
  return database(root,db=>Object.fromEntries(['users','priceBookCreationRecords','quotes','leads','quoteRequests','quoteSubmissions',
    'bookingIntents','bookingHolds','bookingIdempotency','appointments','bookingSettings','bookingPolicies'].map(table=>[
      table,db.prepare(`SELECT * FROM ${table} WHERE ${table==='users'?'id':'ownerId'}=? ORDER BY rowid`).all(ownerId)
    ])));
}

test('production backup/restore rehearsal uses real approved quotes, leads and confirmed bookings', {timeout:180000},async t=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'otc-synthetic-restore-'));
  const volume=path.join(directory,'volume'),archive=path.join(directory,'independent-archive');
  fs.mkdirSync(volume);fs.mkdirSync(archive);
  const events=path.join(directory,'synthetic-calendar-events.json');fs.writeFileSync(events,'[]');
  const processes=[];
  t.after(async()=>{
    for(const child of processes)if(child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}
    fs.rmSync(directory,{recursive:true,force:true});
  });
  const env=productionEnv(volume,{APP_DATA_DIR:path.join(volume,'app'),PUBLIC_BASE_URL:origin,CLIENT_URL:origin,
    CORS_ALLOWED_ORIGINS:origin,SYNTHETIC_CALENDAR_EVENTS:events,BACKUP_INTERVAL_SECONDS:'86400'});
  let root=env.APP_DATA_DIR,server=await launch(env,processes),token,ownerId,secondOwnerId,book,receipt,leadReceipt,booking,rows;
  let request,reviewRequest,publicPath,confirmationBody,confirmationKey,bookingPath,bookBytes,secondBookBytes,bundle;
  const fromDate=new Date(Date.now()+86400000).toISOString().slice(0,10);
  async function requestJson(url,{method='GET',body,auth=true,expected=200,headers={}}={}) {
    const response=await fetch(server.url+url,{method,headers:{origin,'content-type':'application/json',...(auth&&token?{authorization:'Bearer '+token}:{}),...headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const result=await response.json();
    assert.equal(response.status,expected,method+' '+url+' '+JSON.stringify(result));return result;
  }
  async function registerVerified(body) {
    const accepted=await requestJson('/api/auth/register',{method:'POST',auth:false,expected:202,body});
    assert.deepEqual(accepted,{ok:true});
    await requestJson('/api/auth/login',{method:'POST',auth:false,expected:401,body:{email:body.email,password:body.password}});
    const messages=JSON.parse(fs.readFileSync(events+'.emails.json','utf8'));
    const message=messages.findLast(message=>message.to===body.email);
    const link=new URL(message.text.match(/https:\/\/\S+/)[0]);
    await requestJson('/api/auth/verify-email',{method:'POST',auth:false,body:{token:new URLSearchParams(link.hash.slice(1)).get('token')||link.searchParams.get('token')}});
    const account=await requestJson('/api/auth/login',{method:'POST',auth:false,body:{email:body.email,password:body.password}});
    assert.ok(account.token);const identity=await requestJson('/api/auth/account',{auth:false,headers:{authorization:'Bearer '+account.token}});assert.equal(identity.email,body.email);assert.ok(identity.emailVerifiedAt);return {...account,account:{id:JSON.parse(Buffer.from(account.token.split('.')[1],'base64url')).sub}};
  }
  async function verifyState() {
    assert.deepEqual(await requestJson('/api/pricebook/'+ownerId),book);
    assert.deepEqual(fs.readFileSync(path.join(root,'pricebooks',ownerId+'.json')),bookBytes);
    assert.deepEqual(fs.readFileSync(path.join(root,'pricebooks',secondOwnerId+'.json')),secondBookBytes);
    assert.deepEqual(await requestJson(publicPath,{method:'POST',body:request,auth:false}),receipt);
    await requestJson(publicPath,{method:'POST',body:{...request,serviceId:randomUUID()},auth:false,expected:409});
    assert.deepEqual(await requestJson(publicPath,{method:'POST',body:reviewRequest,auth:false}),leadReceipt);
    assert.deepEqual(await requestJson(bookingPath+'/confirm',{method:'POST',body:confirmationBody,auth:false,expected:201,headers:{'Idempotency-Key':confirmationKey}}),booking);
    // Handwritten inbox expectation: instant widget quote + separate review = 2;
    // booking and replay reuse the quote's lead rather than adding another.
    const leads=await requestJson('/api/leads');assert.equal(leads.leads.length,2);
    const schedule=await requestJson('/api/calendar/schedule?fromDate='+fromDate+'&days=1');
    assert.equal(schedule.appointments.length,1);assert.equal(schedule.appointments[0].status,'CONFIRMED');
    assert.deepEqual(persisted(root,ownerId),rows);
    assert.equal(JSON.parse(fs.readFileSync(events,'utf8')).length,1,'replay never creates a second provider event');
  }
  await t.test('1. production startup passes the release engine guard on a temporary volume',async()=>{
    assert.equal((await requestJson('/api/health',{auth:false})).ok,true);
    assert.ok(fs.existsSync(path.join(root,'off-the-clock.sqlite')));
  });
  await t.test('2. register synthetic owners; save and approve; create $100 quote, review lead and confirmed booking over HTTP',async()=>{
    const registered=await registerVerified({
      email:'synthetic-restore-owner@example.invalid',password:'Synthetic!Restore2026-Only',firstName:'[SYNTHETIC]',businessName:'[SYNTHETIC] Recovery Rehearsal',plan:'QuoteDone'});
    token=registered.token;ownerId=registered.account.id;assert.ok(token);fixtureConfiguration(root,ownerId);
    const f=mowing();delete f.ownerPricing.origin;
    // Fixture cents -> owner editor dollars; the expected $100 is handwritten.
    const draft=convertPricebookMoney({services:[f.ownerPricing],defaults:{...f.businessDefaults,currency:'CAD'}},'toDollars');
    const initial=await requestJson('/api/pricebook/'+ownerId);
    const saved=await requestJson('/api/pricebook/save',{method:'POST',body:{...draft,revision:initial.revision}});
    await requestJson('/api/pricebook/services/'+f.ownerPricing.id+'/approve',{method:'POST',body:{revision:saved.revision,confirmConfiguration:true,confirmLegacySettings:true}});
    book=await requestJson('/api/pricebook/'+ownerId);assert.ok(book.services[0].quoteDoneApproval);
    fixtureConfiguration(root,ownerId,f.ownerPricing.id);
    const access=await requestJson('/api/quotedone/access',{method:'POST',body:{allowedOrigins:[origin]}});
    publicPath='/api/public/quote/'+access.publicKey;
    request={requestId:randomUUID(),serviceId:f.ownerPricing.id,customerInputs:f.customerInputs,contact:{email:'synthetic-customer@example.invalid'}};
    receipt=await requestJson(publicPath,{method:'POST',body:request,auth:false,expected:201});
    assert.equal(receipt.resultType,'INSTANT_ESTIMATE_READY');
    assert.equal(receipt.midEstimate,100);assert.equal(receipt.lowEstimate,100);assert.equal(receipt.highEstimate,100);
    assert.equal(receipt.bookingCapability,'DIRECT');
    reviewRequest={...request,requestId:randomUUID(),reviewRequested:true};
    leadReceipt=await requestJson(publicPath,{method:'POST',body:reviewRequest,auth:false,expected:201});
    assert.equal(leadReceipt.resultType,'ESTIMATE_REQUIRES_REVIEW');assert.equal(leadReceipt.midEstimate,undefined);
    bookingPath='/api/public/bookings/'+receipt.bookingToken;
    const customer={name:'[SYNTHETIC] Restore Customer',email:'synthetic-customer@example.invalid',phone:''};
    const location={addressLine1:'1 Synthetic Rehearsal Lane',addressLine2:'',city:'Synthetic City',region:'NS',postalCode:'B3H 0A1',country:'CA'};
    const availability=await requestJson(bookingPath+'/availability',{method:'POST',auth:false,body:{fromDate,days:1,scopeConfirmation:'UNCHANGED',customer,location}});
    assert.equal(availability.status,'AVAILABLE');assert.ok(availability.slots.length);
    const held=await requestJson(bookingPath+'/holds',{method:'POST',auth:false,expected:201,headers:{'Idempotency-Key':randomUUID()},body:{slotId:availability.slots[0].slotId}});
    confirmationBody={holdId:held.holdId,confirmedSlotId:held.slot.slotId,explicitConfirmation:true,addressConfirmation:true,customer,location};confirmationKey=randomUUID();
    booking=await requestJson(bookingPath+'/confirm',{method:'POST',auth:false,expected:201,headers:{'Idempotency-Key':confirmationKey},body:confirmationBody});
    assert.equal(booking.status,'CONFIRMED');
    const second=await registerVerified({email:'synthetic-second-owner@example.invalid',password:'Synthetic!Second2026-Only',firstName:'[SYNTHETIC]',businessName:'[SYNTHETIC] Second Recovery Owner',plan:'QuoteDone'});
    secondOwnerId=second.account.id;fixtureConfiguration(root,secondOwnerId);
    const secondInitial=await requestJson('/api/pricebook/'+secondOwnerId,{headers:{authorization:'Bearer '+second.token}});
    await requestJson('/api/pricebook/save',{method:'POST',headers:{authorization:'Bearer '+second.token},body:{services:[],defaults:{},revision:secondInitial.revision}});
    bookBytes=fs.readFileSync(path.join(root,'pricebooks',ownerId+'.json'));secondBookBytes=fs.readFileSync(path.join(root,'pricebooks',secondOwnerId+'.json'));
    rows=persisted(root,ownerId);assert.equal(rows.quotes.length,1);assert.equal(rows.leads.length,2);assert.equal(rows.appointments.length,1);assert.equal(rows.quoteSubmissions.length,2);
    t.diagnostic('Synthetic approved book sha256='+hash(bookBytes)+'; quote=$100.00; quotes=1; leads=2; appointments=1; submissions=2.');
  });
  await t.test('3. graceful production restart preserves exact book, approval, rows and replay receipts',async()=>{
    await server.stop();server=await launch(env,processes);await verifyState();
  });
  await t.test('4. real backup CLI includes the SQLite database and every saved price book',async()=>{
    bundle=await cli(env,'backup');const manifest=verifyBackup(bundle);
    assert.deepEqual(manifest.files.map(file=>file.name).sort(),['off-the-clock.sqlite','pricebooks/'+ownerId+'.json','pricebooks/'+secondOwnerId+'.json'].sort());
    assert.equal(hash(fs.readFileSync(path.join(bundle,'pricebooks',ownerId+'.json'))),hash(bookBytes));
    t.diagnostic('Verified bundle: '+manifest.files.length+' files; both owner books and SQLite integrity/foreign keys/checksums pass.');
  });
  await t.test('5. wipe entire fake volume, restore CLI from independent archive, restart, and replay identical receipts without duplicates',async()=>{
    await server.stop();const exported=path.join(archive,path.basename(bundle));fs.cpSync(bundle,exported,{recursive:true});
    fs.rmSync(volume,{recursive:true});assert.equal(fs.existsSync(volume),false);fs.mkdirSync(volume);
    root=path.join(volume,'restores','synthetic-drill');
    const restored=JSON.parse(await cli(env,'restore',['--backup',exported,'--target',root]));assert.equal(restored.destination,root);
    env.APP_DATA_DIR=root;server=await launch(env,processes);await verifyState();
    t.diagnostic('Whole-volume loss simulated; exact book bytes, approval, persisted rows, quote/lead receipts and booking confirmation survived.');
  });
  for(const corruption of ['invalid JSON','invalid structure','missing'])await t.test('6. '+corruption+' after restore pauses new quotes, explains owner recovery and keeps server/replays alive',async caseTest=>{
    const filename=path.join(root,'pricebooks',ownerId+'.json');
    const evidence={corruption,startedAt:timestamp(),expectedBookHash:hash(bookBytes),
      expectedDatabasePath:path.join(root,'off-the-clock.sqlite'),previousChild:server.identity,
      beforeCase:bookObservation(filename),requests:[],states:[]};
    const observationErrors=[];
    let primaryFailure,cleanupFailure;
    async function observe(label) {
      try {const state=await server.observe(ownerId);evidence.states.push({label,...state});return state;}
      catch(error) {observationErrors.push(error);evidence.states.push({label,at:timestamp(),error:errorIdentity(error),process:server.processState()});}
    }
    async function recoveryRequest(label,url,{method='GET',body,auth=false}={}) {
      const entry={label,startedAt:timestamp(),pid:server.identity.pid,instanceId:server.identity.instanceId,port:server.identity.port};
      evidence.requests.push(entry);
      try {
        const response=await fetch(server.url+url,{method,signal:AbortSignal.timeout(5000),
          headers:{origin,'content-type':'application/json',...(auth?{authorization:'Bearer '+token}:{})},
          ...(body===undefined?{}:{body:JSON.stringify(body)})});
        entry.status=response.status;
        const text=await response.text();entry.bytes=Buffer.byteLength(text);entry.bodySha256=hash(text);
        const result=JSON.parse(text);entry.body=responseDiagnostic(result);
        return {status:response.status,body:result};
      } catch(error) {observationErrors.push(error);entry.error=errorIdentity(error);return {};}
      finally {entry.finishedAt=timestamp();await observe('after '+label);}
    }
    try {
      const previous=server.processState();
      if(previous.exitCode===null&&previous.signalCode===null)await observe('before previous child stop');
      await server.stop();evidence.previousChildExit=server.processState();
      // A failed earlier cleanup must never silently become the next fixture.
      assert.ok(fs.readFileSync(filename).equals(bookBytes),'original book restored before next corruption');
      if(corruption==='missing')fs.unlinkSync(filename);else fs.writeFileSync(filename,corruption==='invalid JSON'?'{broken':JSON.stringify({ownerId,services:[null],defaults:{}}));
      evidence.afterCorruption=bookObservation(filename);
      server=await launch(env,processes);evidence.child=server.identity;
      await observe('before recovery requests');
      // Observe every route before asserting, including when an earlier request
      // returned an unexpected status, invalid JSON, or a transport error.
      const ownerRead=await recoveryRequest('owner read','/api/pricebook/'+ownerId,{auth:true});
      const fresh=await recoveryRequest('fresh quote',publicPath,{method:'POST',body:{...request,requestId:randomUUID()}});
      const replay=await recoveryRequest('historical replay',publicPath,{method:'POST',body:request});
      const changed=await recoveryRequest('changed binding',publicPath,{method:'POST',body:{...request,serviceId:randomUUID()}});
      const health=await recoveryRequest('health','/api/health');
      evidence.replayUnchanged=isDeepStrictEqual(replay.body,receipt);
      evidence.afterRequests=bookObservation(filename);
      evidence.submissions=database(root,db=>db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(ownerId).n);
      assert.equal(ownerRead.status,corruption==='missing'?409:503);
      assert.ok(ownerRead.body?.code==='PRICEBOOK_UNREADABLE','owner read returns PRICEBOOK_UNREADABLE');
      assert.ok([409,503].includes(fresh.status),'fresh quote is blocked');
      for(const key of ['lowEstimate','midEstimate','highEstimate'])assert.ok(fresh.body&&fresh.body[key]===undefined,'fresh quote has no '+key);
      assert.equal(replay.status,200);assert.ok(evidence.replayUnchanged,'historical receipt replays unchanged');
      assert.equal(changed.status,409);
      assert.equal(health.status,200);assert.equal(health.body?.ok,true);
      assert.equal(evidence.submissions,2);
      assert.ok(typeof ownerRead.body.error==='string'&&/quoting is paused/i.test(ownerRead.body.error),'owner message says quoting is paused');
      assert.ok(/restore.*backup/i.test(ownerRead.body.error),'owner message explains backup recovery');
      if(observationErrors.length)throw observationErrors[0];
      assert.equal(server.identity.databasePath,evidence.expectedDatabasePath);
      assert.equal(server.identity.pricebookPath,path.dirname(filename));
      for(const state of evidence.states.filter(state=>state.instanceId===server.identity.instanceId)) {
        assert.equal(state.creationRecorded,true,'child connection retains durable creation record');
        assert.equal(state.submissions,2,'child connection has no duplicate submissions');
      }
    } catch(error) {primaryFailure=error;}
    finally {
      // Stop the reader before restoring bytes; a stop failure must not prevent
      // restoration, and a cleanup failure must not replace the original error.
      try {await server.stop();}catch(error){cleanupFailure=error;evidence.stopError=errorIdentity(error);}
      evidence.finalChild=server.processState();
      try {
        fs.writeFileSync(filename,bookBytes);
        assert.ok(fs.readFileSync(filename).equals(bookBytes),'finally restored exact original book bytes');
        evidence.restored=bookObservation(filename);
      } catch(error) {cleanupFailure??=error;evidence.restoreError=errorIdentity(error);}
      evidence.finishedAt=timestamp();
      caseTest.diagnostic('restore-cleanup '+JSON.stringify({corruption,restored:evidence.restored,
        failed:Boolean(primaryFailure),cleanupError:cleanupFailure?errorIdentity(cleanupFailure):null}));
      if(primaryFailure||cleanupFailure) {
        const diagnostic=JSON.stringify(evidence);
        caseTest.diagnostic('restore-recovery '+(diagnostic.length<=32768?diagnostic:diagnostic.slice(0,32700)+' [TRUNCATED]'));
      }
      primaryFailure??=cleanupFailure;
    }
    if(primaryFailure)throw primaryFailure;
  });
  await server.stop();
});
