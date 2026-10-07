import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Worker} from 'node:worker_threads';
import {pathToFileURL} from 'node:url';
import {createAuthHandlers} from '../server/src/auth.js';
import {createAuthSessionService,installAuthSessionSchema,AuthSessionError} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthTokenService,installAuthTokenSchema,AUTH_TOKEN_PURPOSES as P} from '../server/src/authTokenService.js';
import {requireAuth} from '../server/src/authMiddleware.js';

const environment={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:'SYNTHETIC_SESSION_HTTP_TEST_SECRET_ONLY',BCRYPT_COST:12};
process.env.JWT_SECRET=environment.JWT_SECRET;
function fixture(t,{env=environment,sessionService,comparePassword,filename=':memory:'}={}) {
  const database=new Database(filename);database.pragma('foreign_keys=ON');database.pragma('busy_timeout=10000');
  t.after(()=>database.open&&database.close());
  database.exec('CREATE TABLE users(id TEXT PRIMARY KEY,ownerId TEXT,email TEXT UNIQUE,passwordHash TEXT,firstName TEXT,businessName TEXT,plan TEXT,planStatus TEXT,trialEndsAt TEXT,timezone TEXT,role TEXT,createdAt TEXT,emailVerifiedAt TEXT)');
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  for(const id of ['a','b'])database.prepare("INSERT INTO users(id,email,passwordHash,role,emailVerifiedAt) VALUES(?,?,'hash:original-pass','owner','2026-09-29T12:00:00Z')").run(id,id+'@example.invalid');
  let at=Date.now();
  const now=()=>new Date(at),sessions=sessionService??createAuthSessionService(database,{environment:env,clock:now});
  const tokens=createAuthTokenService(database,{clock:now});
  const dependencies={database,environment:env,now,sessionService:sessions,tokenService:tokens,
    hashPassword:async p=>'hash:'+p,comparePassword:comparePassword??(async(p,h)=>h==='hash:'+p),sendEmail:async()=>({accepted:true})};
  const handlers=createAuthHandlers(dependencies);
  const middleware=requireAuth(['owner','staff'],{database,sessionService:sessions,
    verifyToken:(token,secret,options)=>jwt.verify(token,secret,{...options,clockTimestamp:Math.floor(at/1000)})});
  return {database,sessions,tokens,handlers,middleware,dependencies,advance:ms=>{at+=ms;},now,
    user:id=>database.prepare('SELECT * FROM users WHERE id=?').get(id)};
}
async function call(handler,body={},headers={},extra={}) {
  const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
  await handler({method:'POST',ip:'synthetic-ip',body,headers:{origin:environment.CLIENT_URL,...headers},...extra},res);
  return res;
}
const bearer=token=>({authorization:'Bearer '+token});
const cookie=res=>res.headers['set-cookie']?.split(';')[0];
const secret=res=>cookie(res)?.split('=')[1];
const login=(f,id='a')=>call(f.handlers.login,{email:id+'@example.invalid',password:'original-pass'});
async function authorize(f,token) {
  let allowed=false;
  const res=await call((req,res)=>f.middleware(req,res,()=>{allowed=true;res.json(req.user);}),{},bearer(token),{method:'GET'});
  return {res,allowed};
}

test('production login issues a Secure host cookie; no refresh secret appears in JSON',async t=>{
  const f=fixture(t,{env:{...environment,NODE_ENV:'production'}}),r=await login(f);
  assert.equal(r.statusCode,200);assert.equal(r.body.refreshToken,undefined);assert.equal(r.body.sessionId,undefined);
  assert.equal(cookie(r).split('=')[0],'__Host-otc_refresh_'+jwt.decode(r.body.token).sid);
  assert.match(r.headers['set-cookie'],/^__Host-otc_refresh_[A-Za-z0-9_-]{43}=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Secure; Expires=/);
  assert.doesNotMatch(r.headers['set-cookie'],/Domain=/);
  assert.equal(r.headers['cache-control'],'no-store');
  assert.equal((await authorize(f,r.body.token)).allowed,true);
  assert.equal(Object.hasOwn((await authorize(f,r.body.token)).res.body,'passwordHash'),false);
});

test('refresh rotates its cookie once, binds to the signed access session, and leaves a conflict cookie untouched',async t=>{
  const f=fixture(t),a=await login(f),b=await login(f,'b');
  const mismatch=await call(f.handlers.refresh,{}, {...bearer(a.body.token),cookie:cookie(b)});
  assert.equal(mismatch.statusCode,401);assert.equal(mismatch.headers['set-cookie'],undefined);
  const first=await call(f.handlers.refresh,{}, {...bearer(a.body.token),cookie:cookie(a)});
  assert.equal(first.statusCode,200);assert.notEqual(cookie(first),cookie(a));
  const replay=await call(f.handlers.refresh,{}, {...bearer(a.body.token),cookie:cookie(a)});
  assert.equal(replay.statusCode,409);assert.equal(replay.body.code,'SESSION_REFRESH_CONFLICT');assert.equal(replay.headers['set-cookie'],undefined);
  assert.equal((await authorize(f,first.body.token)).allowed,true);
  assert.equal((await call(f.handlers.refresh,{}, {cookie:cookie(first)})).statusCode,401);
  assert.equal((await call(f.handlers.refresh,{}, {...bearer(first.body.token),cookie:cookie(first)+'; '+cookie(first)})).statusCode,401);
});

test('hostile origins cannot log in, create accounts, refresh, reset passwords or log out',async t=>{
  const f=fixture(t),a=await login(f);
  for(const handler of ['login','register','refresh','resetPassword','logout']){
    const r=await call(f.handlers[handler],{email:'a@example.invalid',password:'original-pass'}, {...bearer(a.body.token),cookie:cookie(a),origin:'https://attacker.invalid'});
    assert.equal(r.statusCode,403,handler);assert.equal(r.headers['set-cookie'],undefined);
  }
  assert.equal((await authorize(f,a.body.token)).allowed,true);
  assert.equal((await call(f.handlers.logout,{}, {...bearer(a.body.token),cookie:cookie(a),origin:'null'})).statusCode,403);
  assert.equal((await call(f.handlers.logout,{}, {...bearer(a.body.token),cookie:cookie(a),origin:undefined,'sec-fetch-site':'cross-site'})).statusCode,403);
});

test('expired access can refresh within eight hours; logout revokes expired signed access too',async t=>{
  const f=fixture(t),a=await login(f);
  f.advance(15*60*1000);
  const expired=await authorize(f,a.body.token);assert.equal(expired.allowed,false);assert.equal(expired.res.body.code,'SESSION_ACCESS_EXPIRED');
  const fresh=await call(f.handlers.refresh,{}, {...bearer(a.body.token),cookie:cookie(a)});
  assert.equal(fresh.statusCode,200);assert.equal(fresh.body.sessionExpiresAt,a.body.sessionExpiresAt);
  assert.equal((await authorize(f,fresh.body.token)).allowed,true);
  const out=await call(f.handlers.logout,{}, {...bearer(a.body.token),cookie:cookie(fresh)});
  assert.equal(out.statusCode,200);assert.match(out.headers['set-cookie'],/Max-Age=0/);
  assert.equal((await authorize(f,fresh.body.token)).allowed,false);
  assert.equal((await call(f.handlers.refresh,{}, {...bearer(fresh.body.token),cookie:cookie(fresh)})).statusCode,401);
});

test('an old tab logout preserves the newer account cookie and session',async t=>{
  const f=fixture(t),a=await login(f),b=await login(f,'b');
  const out=await call(f.handlers.logout,{}, {...bearer(a.body.token),cookie:cookie(b)});
  assert.equal(out.statusCode,200);assert.equal(cookie(out).split('=')[0],cookie(a).split('=')[0]);
  assert.notEqual(cookie(out).split('=')[0],cookie(b).split('=')[0]);
  assert.equal((await authorize(f,a.body.token)).allowed,false);
  assert.equal((await authorize(f,b.body.token)).allowed,true);
});

test('password reset atomically revokes every session for that account while another tenant remains valid',async t=>{
  const f=fixture(t),a=await login(f),a2=await login(f),b=await login(f,'b');
  const reset=f.tokens.issue({userId:'a',purpose:P.RESET_PASSWORD});
  const r=await call(f.handlers.resetPassword,{token:reset.token,password:'new-password'});
  assert.equal(r.statusCode,200);
  for(const old of [a,a2]) {
    assert.equal((await authorize(f,old.body.token)).allowed,false);
    assert.equal((await call(f.handlers.refresh,{}, {...bearer(old.body.token),cookie:cookie(old)})).statusCode,401);
  }
  assert.equal((await authorize(f,b.body.token)).allowed,true);
  assert.equal((await login(f)).statusCode,401);
  assert.equal((await call(f.handlers.login,{email:'a@example.invalid',password:'new-password'})).statusCode,200);
});

test('reset revocation failure rolls back password and link consumption',async t=>{
  const f=fixture(t),a=await login(f),issued=f.tokens.issue({userId:'a',purpose:P.RESET_PASSWORD});
  const handlers=createAuthHandlers({...f.dependencies,sessionService:{...f.sessions,revokeAll(){throw new AuthSessionError('SESSION_STORE_UNAVAILABLE');}}});
  const r=await call(handlers.resetPassword,{token:issued.token,password:'new-password'});
  assert.equal(r.statusCode,503);assert.equal(f.user('a').passwordHash,'hash:original-pass');
  assert.equal((await authorize(f,a.body.token)).allowed,true);
  assert.equal((await call(f.handlers.resetPassword,{token:issued.token,password:'new-password'})).statusCode,200);
});

test('password reset cannot be bypassed by a login whose password comparison was already in flight',async t=>{
  let finish;
  const f=fixture(t,{comparePassword:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=login(f),issued=f.tokens.issue({userId:'a',purpose:P.RESET_PASSWORD});
  assert.equal((await call(f.handlers.resetPassword,{token:issued.token,password:'new-password'})).statusCode,200);
  finish(true);
  assert.equal((await pending).statusCode,401);
  assert.equal(f.database.prepare('SELECT COUNT(*) n FROM authSessions').get().n,0);
});

test('durable login reservations stop a parallel password-guess burst before hashing and survive handler recreation',async t=>{
  const completions=[];
  const f=fixture(t,{comparePassword:()=>new Promise(resolve=>completions.push(resolve))});
  const pending=Array.from({length:5},()=>login(f));
  const sixth=await login(f);assert.equal(sixth.statusCode,429);assert.equal(completions.length,5);
  completions.forEach(resolve=>resolve(false));
  assert.deepEqual((await Promise.all(pending)).map(r=>r.statusCode),[401,401,401,401,401]);
  const restarted=createAuthHandlers(f.dependencies);
  assert.equal((await call(restarted.login,{email:'a@example.invalid',password:'original-pass'})).statusCode,429);
});

test('successful logins release their durable reservation; a broken session store fails closed',async t=>{
  const f=fixture(t);for(let i=0;i<8;i++)assert.equal((await login(f)).statusCode,200);
  const broken=createAuthHandlers({...f.dependencies,sessionService:{...f.sessions,create(){throw new AuthSessionError('SESSION_STORE_UNAVAILABLE');}}});
  const r=await call(broken.login,{email:'a@example.invalid',password:'original-pass'});
  assert.equal(r.statusCode,503);assert.equal(r.headers['set-cookie'],undefined);
});

test('logout store failure does not claim success or clear the cookie; stateless tokens cannot authorize',async t=>{
  const f=fixture(t),a=await login(f);
  const broken=createAuthHandlers({...f.dependencies,sessionService:{...f.sessions,revoke(){throw new AuthSessionError('SESSION_STORE_UNAVAILABLE');}}});
  const r=await call(broken.logout,{}, {...bearer(a.body.token),cookie:cookie(a)});
  assert.equal(r.statusCode,503);assert.equal(r.headers['set-cookie'],undefined);
  const legacy=jwt.sign({sub:'a',role:'owner',email:'a@example.invalid'},environment.JWT_SECRET,{expiresIn:'8h'});
  assert.equal((await authorize(f,legacy)).allowed,false);
});

test('two actual workers contending for the same refresh receipt produce one success and one conflict',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'otc-session-race-'));
  const filename=path.join(directory,'test.sqlite'),f=fixture(t,{filename});
  // Close before removal on Windows; fixture also checks database.open.
  t.after(async()=>{if(f.database.open)f.database.close();assert.ok(path.resolve(directory).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(directory,{recursive:true,force:true});});
  const a=await login(f),gate=new SharedArrayBuffer(4);
  const moduleUrl=pathToFileURL(path.resolve('server/src/authSessionService.js')).href;
  const workerCode=`const {parentPort,workerData}=require('node:worker_threads');(async()=>{
    const {createRequire}=await import('node:module');const requireModule=createRequire(workerData.packageUrl);
    const Database=requireModule('better-sqlite3'),{createAuthSessionService}=await import(workerData.moduleUrl);
    const database=new Database(workerData.filename);database.pragma('busy_timeout=10000');
    const service=createAuthSessionService(database,{environment:workerData.environment});
    parentPort.postMessage({ready:true});Atomics.wait(new Int32Array(workerData.gate),0,0);
    let result;try{service.refresh(workerData.token);result='success';}catch(e){result=e.code;}
    database.close();parentPort.postMessage({result});
  })().catch(e=>{parentPort.postMessage({error:e.message});});`;
  const workers=[0,1].map(()=>new Worker(workerCode,{eval:true,workerData:{gate,filename,moduleUrl,packageUrl:pathToFileURL(path.resolve('package.json')).href,environment,token:secret(a)}}));
  const outcomes=workers.map(worker=>new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.error)reject(Error(m.error));if(m.result)resolve(m.result);});worker.on('error',reject);}));
  await Promise.all(workers.map(worker=>new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.ready)resolve();if(m.error)reject(Error(m.error));});worker.on('error',reject);})));
  Atomics.store(new Int32Array(gate),0,1);Atomics.notify(new Int32Array(gate),0,2);
  assert.deepEqual((await Promise.all(outcomes)).sort(),['SESSION_REFRESH_CONFLICT','success']);
  await Promise.all(workers.map(worker=>worker.terminate()));
});

test('refresh chooses the signed session cookie when multiple session cookies arrive',async t=>{
  const f=fixture(t),a=await login(f),b=await login(f,'b');
  const renewed=await call(f.handlers.refresh,{}, {...bearer(a.body.token),cookie:cookie(b)+'; '+cookie(a)});
  assert.equal(renewed.statusCode,200);
  assert.equal(cookie(renewed).split('=')[0],cookie(a).split('=')[0]);
  assert.notEqual(cookie(renewed).split('=')[0],cookie(b).split('=')[0]);
  assert.equal((await call(f.handlers.refresh,{}, {...bearer(b.body.token),cookie:cookie(renewed)+'; '+cookie(b)})).statusCode,200);
});

test('a foreign receipt under the selected cookie name cannot refresh or revoke the foreign session',async t=>{
  const f=fixture(t),a=await login(f),b=await login(f,'b');
  const forged=cookie(a).split('=')[0]+'='+secret(b);
  const renew=await call(f.handlers.refresh,{}, {...bearer(a.body.token),cookie:forged});
  assert.equal(renew.statusCode,401);assert.equal(renew.headers['set-cookie'],undefined);
  const out=await call(f.handlers.logout,{}, {...bearer(a.body.token),cookie:forged});
  assert.equal(out.statusCode,200);
  assert.equal((await authorize(f,a.body.token)).allowed,false);
  assert.equal((await authorize(f,b.body.token)).allowed,true);
  assert.equal((await call(f.handlers.refresh,{}, {...bearer(b.body.token),cookie:cookie(b)})).statusCode,200);
});

test('anonymous logout does not select, revoke or expire another signed-in session',async t=>{
  const f=fixture(t),a=await login(f),b=await login(f,'b');
  for(const header of [cookie(a),cookie(a)+'; '+cookie(b)]){
    const out=await call(f.handlers.logout,{}, {cookie:header});
    assert.equal(out.statusCode,200);assert.equal(out.headers['set-cookie'],undefined);
  }
  assert.equal((await authorize(f,a.body.token)).allowed,true);
  assert.equal((await authorize(f,b.body.token)).allowed,true);
});

test('legacy shared cookie names and duplicate selected cookies fail closed without changing other cookies',async t=>{
  const f=fixture(t),a=await login(f),b=await login(f,'b');
  for(const header of ['otc_refresh='+secret(a),cookie(a)+'; '+cookie(a)+'; '+cookie(b)]){
    const out=await call(f.handlers.refresh,{}, {...bearer(a.body.token),cookie:header});
    assert.equal(out.statusCode,401);assert.equal(out.headers['set-cookie'],undefined);
  }
  assert.equal((await call(f.handlers.refresh,{}, {...bearer(b.body.token),cookie:cookie(b)})).statusCode,200);
});

test('logout revokes signed intent and expires only its own cookie even when that cookie is missing',async t=>{
  const f=fixture(t),a=await login(f),b=await login(f,'b');
  const out=await call(f.handlers.logout,{}, {...bearer(a.body.token),cookie:cookie(b)});
  assert.equal(out.statusCode,200);
  assert.equal(cookie(out).split('=')[0],cookie(a).split('=')[0]);
  assert.match(out.headers['set-cookie'],/Max-Age=0/);
  assert.equal((await authorize(f,a.body.token)).allowed,false);
  assert.equal((await call(f.handlers.refresh,{}, {...bearer(b.body.token),cookie:cookie(b)})).statusCode,200);
});

test('fresh sign-ins to the same account have isolated cookie names and logout boundaries',async t=>{
  const f=fixture(t),a=await login(f),a2=await login(f);
  assert.notEqual(jwt.decode(a.body.token).sid,jwt.decode(a2.body.token).sid);
  assert.notEqual(cookie(a).split('=')[0],cookie(a2).split('=')[0]);
  const out=await call(f.handlers.logout,{}, {...bearer(a.body.token),cookie:cookie(a2)+'; '+cookie(a)});
  assert.equal(out.statusCode,200);
  assert.notEqual(cookie(out).split('=')[0],cookie(a2).split('=')[0]);
  assert.equal((await authorize(f,a.body.token)).allowed,false);
  assert.equal((await call(f.handlers.refresh,{}, {...bearer(a2.body.token),cookie:cookie(a2)})).statusCode,200);
});
