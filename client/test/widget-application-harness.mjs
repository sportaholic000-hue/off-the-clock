import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import {openBookingTokenReceipt} from '../../server/src/bookingTokens.js';
import { setTimeout as delay } from 'node:timers/promises';

// Same real application fixture as verification/quotedone/application-harness.mjs.
// This frontend copy allows 15 minutes for cold local startup and saves failed-start logs.
// Quote, persistence, authentication and expected values are unchanged.
export async function startApplication(root, evidence, { port=4392, reuse=false, calendarFixture=false, browserOrigins=[] }={}) {
  root=path.resolve(root);evidence=path.resolve(evidence);
  assert.equal(process.version,'v22.23.2');assert.equal(process.versions.modules,'127');
  if(!reuse)assert.equal(fs.existsSync(evidence),false,'Use a fresh synthetic store');
  fs.mkdirSync(evidence,{recursive:true});
  const files={};
  function bind(dir,prefix){if(!fs.existsSync(dir))return;for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.git','dist','data'].includes(entry.name))continue;const full=path.join(dir,entry.name),relative=prefix+'/'+entry.name;if(entry.isDirectory())bind(full,relative);else if(/\.(?:[cm]?js|jsx|json|md)$/.test(entry.name))files[relative]=crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');}}
  bind(path.join(root,'server'),'server');bind(path.join(root,'client/src'),'client/src');bind(path.dirname(fileURLToPath(import.meta.url)),'client/test');
  for(const name of ['package.json','package-lock.json','server/package.json','client/package.json'])if(fs.existsSync(path.join(root,name)))files[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex');
  fs.writeFileSync(path.join(evidence,'source-binding.json'),JSON.stringify({runtime:process.execPath,version:process.version,platform:process.platform,arch:process.arch,abi:process.versions.modules,files},null,2));
  const executable=path.join(root,'.portable-runtime/node-v22.23.2-win-x64/node.exe');
  assert.equal(fs.realpathSync(process.execPath).toLowerCase(),fs.realpathSync(executable).toLowerCase());
  const env={...process.env};const inherited=Object.entries(env).find(([k])=>k.toLowerCase()==='path')?.[1]||'';
  for(const key of Object.keys(env))if(key.toLowerCase()==='path')delete env[key];
  Object.assign(env,{Path:path.dirname(executable)+path.delimiter+inherited,npm_node_execpath:executable,npm_execpath:path.join(path.dirname(executable),'node_modules/npm/bin/npm-cli.js'),DATABASE_PATH:path.join(evidence,'application.sqlite'),PRICEBOOK_PATH:path.join(evidence,'pricebooks'),PORT:String(port),NODE_ENV:'test',EMAIL_PROVIDER:'console',LOCAL_PREVIEW:'false',DOTENV_CONFIG_PATH:path.join(evidence,'absent.env'),JWT_SECRET:crypto.randomBytes(32).toString('hex'),BOOKING_SLOT_TOKEN_SECRET:crypto.randomBytes(32).toString('hex')});
  assert.ok(browserOrigins.every(origin=>{const url=new URL(origin);return url.origin===origin&&url.protocol==='http:'&&url.hostname==='127.0.0.1';}));
  env.CORS_ALLOWED_ORIGINS=browserOrigins.join(',');
  if(calendarFixture){
    const fixtureFile=path.join(evidence,'synthetic-calendar-provider.json');
    if(!reuse)fs.writeFileSync(fixtureFile,JSON.stringify({syntheticOnly:true,calls:[],events:{},mode:'normal'}));
    Object.assign(env,{QUOTEDONE_CALENDAR_FIXTURE:fixtureFile,ALLOW_PROVIDER_WRITES:'true',GOOGLE_CLIENT_ID:'SYNTHETIC-NO-LIVE-CLIENT',GOOGLE_CLIENT_SECRET:'SYNTHETIC-NO-LIVE-SECRET',GOOGLE_CALENDAR_REDIRECT_URI:'http://127.0.0.1:'+port+'/api/onboarding/calendar/google/callback',CREDENTIAL_ENCRYPTION_KEY:crypto.randomBytes(32).toString('base64'),TWILIO_ACCOUNT_SID:'AC'+'0'.repeat(32),TWILIO_API_KEY_SID:'SK'+'0'.repeat(32),TWILIO_API_KEY_SECRET:'SYNTHETIC-NO-LIVE-SECRET'});
  }
  const requests=[],base='http://127.0.0.1:'+port;let logs='',child;
  const safe=value=>JSON.parse(JSON.stringify(value,(key,value)=>['token','password','passwordHash'].includes(key)?'[SECRET OMITTED]':value));
  async function boot(){child=spawn(executable,[...(calendarFixture?['--import',pathToFileURL(path.join(root,'verification/quotedone/calendar-provider-fixture.mjs')).href]:[]),'server/src/server.js'],{cwd:root,env,windowsHide:true,stdio:['ignore','pipe','pipe']});fs.writeFileSync(path.join(evidence,'server-process.json'),JSON.stringify({pid:child.pid,executable,cwd:root,port,store:env.DATABASE_PATH}));child.stdout.on('data',b=>{logs+=b;});child.stderr.on('data',b=>{logs+=b;});const deadline=Date.now()+900000;while(Date.now()<deadline){if(child.exitCode!==null)throw Error('Server exited '+child.exitCode+'\n'+logs);try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(5000)});if(r.ok){assert.deepEqual(await r.json(),{ok:true});return;}}catch{}await delay(100);}fs.writeFileSync(path.join(evidence,'server-startup-failure.log'),logs);throw Error('Startup timeout\n'+logs);}
  async function stop(){if(child&&child.exitCode===null){const closed=new Promise(resolve=>child.once('close',resolve));child.kill();await closed;}fs.writeFileSync(path.join(evidence,'server.log'),logs.replace(/token=[A-Za-z0-9_-]+/g,'token=[SECRET OMITTED]'));fs.writeFileSync(path.join(evidence,'http.json'),JSON.stringify(requests,null,2));}
  async function request(method,url,body,token,headers={}) {const response=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});const text=await response.text();let result;try{result=JSON.parse(text);}catch{result={nonJsonBody:text};}requests.push({method,path:url,body:safe(body??null),authenticated:!!token,headers,status:response.status,result:safe(result)});return {status:response.status,result};}
  async function owner(label){const password=crypto.randomBytes(20).toString('hex');const account={email:'synthetic-'+label+'@example.invalid',password,firstName:'Synthetic',businessName:'Synthetic '+label,plan:'QuoteDone'};const registered=await request('POST','/api/auth/register',account);assert.equal(registered.status,201,JSON.stringify(registered.result));// Explicit fixture billing evidence; production registration remains pending_payment.
assert.equal(env.NODE_ENV,'test');assert.equal(env.DATABASE_PATH,path.join(evidence,'application.sqlite'));
assert.ok(account.email.startsWith('synthetic-')&&account.email.endsWith('@example.invalid'));
const fixtureDb=new Database(env.DATABASE_PATH);
try {
 const id=registered.result.account.id,at=new Date().toISOString();
 assert.equal(fixtureDb.prepare('SELECT planStatus FROM users WHERE id=?').get(id).planStatus,'pending_payment');
 fixtureDb.transaction(()=>{
  fixtureDb.prepare('INSERT INTO billingAccounts (ownerId,stripeCustomerId,paymentMethodVerifiedAt,createdAt,updatedAt) VALUES (?,?,?,?,?)').run(id,'cus_synthetic_'+id,at,at,at);
  fixtureDb.prepare("UPDATE users SET plan='QuoteDone',planStatus='active' WHERE id=? AND role='owner'").run(id);
 })();
 fs.appendFileSync(path.join(evidence,'synthetic-account-setup.ndjson'),JSON.stringify({ownerId:id,email:account.email,fixture:'verified QuoteDone entitlement seeded only in isolated test DB'})+'\n');
} finally {fixtureDb.close();}
const login=await request('POST','/api/auth/login',{email:account.email,password});assert.equal(login.status,200);return {id:registered.result.account.id,token:login.result.token,email:account.email,password};}
  process.once('exit',()=>{if(child&&child.exitCode===null)child.kill();});
  try{await boot();}catch(error){await stop();throw error;}return {root,evidence,env,base,requests,request,owner,stop,restart:async()=>{await stop();await boot();}};
}

export function quoteReceiptResponse(app,receipt) {
  const response=JSON.parse(receipt.customerResponseJson);
  if(receipt.bookingTokenReceipt){
    const booking=openBookingTokenReceipt(receipt.bookingTokenReceipt,app.env.BOOKING_SLOT_TOKEN_SECRET);
    assert.equal(booking.ownerId,receipt.ownerId);assert.equal(booking.intentId,receipt.bookingIntentId);
    assert.equal(booking.expiresAtUtc,response.bookingTokenExpiresAt);
    assert.equal(receipt.customerResponseJson.includes(booking.bookingToken),false);
    response.bookingToken=booking.bookingToken;
  }
  return response;
}
