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
import Database from 'better-sqlite3';
import {productionEnv} from './helpers/railwayEnv.mjs';
import {mowing} from '../verification/engine-independent/fixtures.mjs';
import {verifyBackup} from '../server/src/backups.js';
import {convertPricebookMoney} from '../server/priceBookMoney.js';

// Handwritten expectations precede execution: verification/backup-restore-20261006/EXPECTED.md.
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const origin = 'https://synthetic-rehearsal.example.invalid';
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
  let output='';for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>output+=chunk);
  const ended=once(child,'exit');
  registry.push(child);
  const ready=await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Startup timed out: '+output)),30000);
    child.once('message',message=>{clearTimeout(timer);resolve(message);});
    child.once('exit',()=>{clearTimeout(timer);reject(Error('Startup failed: '+output));});
  });
  assert.equal(ready.ready,true);
  assert.equal(ready.engineVersion,'quote-engine-vnext-date-context-20261006-v7');
  return {url:'http://127.0.0.1:'+port,async stop(){
    if(process.platform==='win32')child.send('stop');else child.kill('SIGTERM');
    const [code,signal]=await ended;assert.equal(code,0,output);assert.equal(signal,null,output);
    assert.match(output,/requests and workers drained; database closed/);
  }};
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
  for(const corruption of ['invalid JSON','invalid structure','missing'])await t.test('6. '+corruption+' after restore pauses new quotes, explains owner recovery and keeps server/replays alive',async()=>{
    await server.stop();const filename=path.join(root,'pricebooks',ownerId+'.json');
    if(corruption==='missing')fs.unlinkSync(filename);else fs.writeFileSync(filename,corruption==='invalid JSON'?'{broken':JSON.stringify({ownerId,services:[null],defaults:{}}));
    server=await launch(env,processes);
    const response=await fetch(server.url+'/api/pricebook/'+ownerId,{headers:{origin,authorization:'Bearer '+token}}),ownerError=await response.json();
    assert.equal(response.status,corruption==='missing'?409:503);assert.equal(ownerError.code,'PRICEBOOK_UNREADABLE');
    const denied=await fetch(server.url+publicPath,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({...request,requestId:randomUUID()})});
    assert.ok([409,503].includes(denied.status));const denial=await denied.json();assert.equal(denial.midEstimate,undefined);assert.equal(denial.lowEstimate,undefined);
    assert.deepEqual(await requestJson(publicPath,{method:'POST',body:request,auth:false}),receipt);
    await requestJson(publicPath,{method:'POST',body:{...request,serviceId:randomUUID()},auth:false,expected:409});
    assert.equal((await requestJson('/api/health',{auth:false})).ok,true);
    assert.equal(database(root,db=>db.prepare('SELECT count(*) n FROM quoteSubmissions WHERE ownerId=?').get(ownerId).n),2);
    // Restore the file even on a baseline failure so each corruption is independently exercised.
    fs.writeFileSync(filename,bookBytes);
    assert.match(ownerError.error,/quoting is paused/i);assert.match(ownerError.error,/restore.*backup/i);
  });
  await server.stop();
});
