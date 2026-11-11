import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService,AUTH_SESSION_POLICY} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';

// An owner or staff sign-in stays open on its device while it is used at least
// once every 30 days. Everything that ends a sign-in still ends it at once.
// Real sign-in, refresh and sign-out handlers; synthetic accounts only.
const SECRET='SYNTHETIC_SESSION_LIFETIME_SECRET_ONLY';
const ENV={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:SECRET,BCRYPT_COST:12,
  ADMIN_EMAIL:'admin@example.invalid',ADMIN_PASSWORD_HASH:'hash:admin-password'};
const MINUTE=60*1000,HOUR=60*MINUTE,DAY=24*HOUR;

function fixture(t){
  const database=new Database(':memory:');database.pragma('foreign_keys=ON');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  let instant=Date.parse('2026-11-11T12:00:00.000Z');const now=()=>new Date(instant);
  const add=(id,email,{role='owner',ownerId=null}={})=>database.prepare(`INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,emailVerifiedAt)
    VALUES(?,?,?,?,'Synthetic','[SYNTHETIC] Business','Operator','active','UTC',?,?,?)`).run(id,ownerId,email,'hash:'+id+'-password',role,now().toISOString(),now().toISOString());
  add('owner-1','owner@example.invalid');
  add('staff-1','staff@example.invalid',{role:'staff',ownerId:'owner-1'});
  const sessions=createAuthSessionService(database,{environment:ENV,clock:now});
  const auth=createAuthHandlers({database,tokenService:createAuthTokenService(database,{clock:now}),sessionService:sessions,environment:ENV,now,
    hashPassword:async p=>'hash:'+p,comparePassword:async(p,h)=>h==='hash:'+p,sendEmail:async()=>({accepted:true})});
  async function call(handler,{body={},token,cookie,address='198.51.100.1'}={}){
    const res={statusCode:200,headers:{},setHeader(name,value){this.headers[name.toLowerCase()]=value;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await auth[handler]({method:'POST',headers:{origin:ENV.CLIENT_URL,...(token?{authorization:'Bearer '+token}:{}),...(cookie?{cookie}:{})},ip:address,body,query:{}},res);
    return res;
  }
  // A device: holds the sign-in token and the refresh cookie the server last set.
  function device(){
    const state={token:null,cookie:null,cookieExpires:null};
    const keep=res=>{const header=res.headers['set-cookie'];if(header){const [pair]=header.split(';');state.cookie=pair;state.cookieExpires=Date.parse(/Expires=([^;]+)/.exec(header)[1]);}
      if(res.body?.token)state.token=res.body.token;return res;};
    return {state,
      signIn:async(email,password)=>keep(await call('login',{body:{email,password}})),
      refresh:async()=>keep(await call('refresh',{token:state.token,cookie:state.cookie})),
      signOut:async()=>call('logout',{token:state.token,cookie:state.cookie}),
      check:()=>{try{return Boolean(sessions.validateAccess(jwt.verify(state.token,SECRET,{algorithms:['HS256'],clockTimestamp:Math.floor(instant/1000)})));}catch{return false;}}};
  }
  return {database,sessions,auth,call,device,now,advance:ms=>{instant+=ms;},add};
}

// Stays signed in while used
for(const [who,email,password] of [['owner','owner@example.invalid','owner-1-password'],['staff member','staff@example.invalid','staff-1-password']])
  test(`a ${who} who uses the app every 29 days stays signed in for a year on that device`,async t=>{
    const f=fixture(t),phone=f.device();
    assert.equal((await phone.signIn(email,password)).statusCode,200);
    for(let visit=1;visit<=13;visit++){
      f.advance(29*DAY);
      const reply=await phone.refresh();
      assert.equal(reply.statusCode,200,`visit ${visit} after ${visit*29} days`);
      assert.ok(phone.check(),'the new sign-in token works');
    }
  });

test('a sign-in used daily stays open past 8 hours and past 30 days',async t=>{
  const f=fixture(t),phone=f.device();
  await phone.signIn('owner@example.invalid','owner-1-password');
  f.advance(9*HOUR);assert.equal((await phone.refresh()).statusCode,200,'9 hours after sign-in');
  for(let day=1;day<=45;day++){f.advance(DAY);assert.equal((await phone.refresh()).statusCode,200,'day '+day);}
});

test('each use moves the end of the sign-in, and its cookie, to 30 days from that use',async t=>{
  const f=fixture(t),phone=f.device();
  await phone.signIn('owner@example.invalid','owner-1-password');
  assert.equal(phone.state.cookieExpires,f.now().getTime()+30*DAY,'cookie lasts 30 days from sign-in');
  f.advance(10*DAY);const reply=await phone.refresh();
  assert.equal(Date.parse(reply.body.sessionExpiresAt),f.now().getTime()+30*DAY);
  assert.equal(phone.state.cookieExpires,f.now().getTime()+30*DAY,'cookie moves with it');
  assert.match(reply.headers['set-cookie'],/HttpOnly/,'the cookie is still unreadable by scripts');
});

test('30 days without use ends the sign-in; one millisecond less does not',async t=>{
  const f=fixture(t),kept=f.device(),lapsed=f.device();
  await kept.signIn('owner@example.invalid','owner-1-password');await lapsed.signIn('owner@example.invalid','owner-1-password');
  f.advance(30*DAY-1);assert.equal((await kept.refresh()).statusCode,200);
  f.advance(1);assert.equal((await lapsed.refresh()).statusCode,401);
  assert.deepEqual((await lapsed.refresh()).body,{error:'Please sign in again.',code:'SESSION_INVALID'});
});

test('the sign-in token still lasts 15 minutes after any refresh',async t=>{
  const f=fixture(t),phone=f.device();
  await phone.signIn('owner@example.invalid','owner-1-password');f.advance(20*DAY);await phone.refresh();
  const claims=jwt.decode(phone.state.token);assert.equal(claims.exp-claims.iat,15*60);
  f.advance(15*MINUTE);assert.equal(phone.check(),false,'expired after 15 minutes until refreshed');
  assert.equal((await phone.refresh()).statusCode,200);assert.equal(phone.check(),true);
});

test('an admin sign-in still ends 8 hours after it started, however much it is used',async t=>{
  const f=fixture(t);
  const admin=await f.call('adminLogin',{body:{email:'admin@example.invalid',password:'admin-password'}});
  assert.equal(admin.statusCode,200);
  let state={token:admin.body.token,cookie:admin.headers['set-cookie'].split(';')[0]};
  for(let n=0;n<7;n++){f.advance(HOUR);const r=await f.call('refresh',{token:state.token,cookie:state.cookie});assert.equal(r.statusCode,200);state={token:r.body.token,cookie:r.headers['set-cookie'].split(';')[0]};
    assert.equal(Date.parse(r.body.sessionExpiresAt),Date.parse('2026-11-11T12:00:00.000Z')+8*HOUR);}
  f.advance(HOUR);assert.equal((await f.call('refresh',{token:state.token,cookie:state.cookie})).statusCode,401);
});

// Must stay exactly as it is
test('signing out ends that sign-in at once, even a long-lived one, and only that one',async t=>{
  const f=fixture(t),phone=f.device(),tablet=f.device();
  await phone.signIn('owner@example.invalid','owner-1-password');await tablet.signIn('owner@example.invalid','owner-1-password');
  f.advance(20*DAY);await phone.refresh();await tablet.refresh();
  assert.equal((await phone.signOut()).statusCode,200);
  assert.equal(phone.check(),false);assert.equal((await phone.refresh()).statusCode,401);
  assert.equal((await tablet.refresh()).statusCode,200,'the other device stays signed in');
});

test('changing the password, or the email, ends every long-lived sign-in for that login',async t=>{
  for(const change of [db=>db.prepare("UPDATE users SET passwordHash='hash:changed' WHERE id='owner-1'").run(),
    db=>db.prepare("UPDATE users SET email='moved@example.invalid' WHERE id='owner-1'").run()]){
    const f=fixture(t),phone=f.device();
    await phone.signIn('owner@example.invalid','owner-1-password');f.advance(25*DAY);await phone.refresh();
    change(f.database);
    assert.equal(phone.check(),false);assert.equal((await phone.refresh()).statusCode,401);
  }
});

test('a completed password reset ends every long-lived sign-in for that login',async t=>{
  const f=fixture(t),phone=f.device(),mail=[];
  const auth=createAuthHandlers({database:f.database,tokenService:createAuthTokenService(f.database,{clock:f.now}),sessionService:f.sessions,environment:ENV,now:f.now,
    hashPassword:async p=>'hash:'+p,comparePassword:async(p,h)=>h==='hash:'+p,sendEmail:async message=>{mail.push(message);return {accepted:true};}});
  await phone.signIn('owner@example.invalid','owner-1-password');f.advance(25*DAY);await phone.refresh();
  const res=()=>({statusCode:200,headers:{},setHeader(){},status(c){this.statusCode=c;return this;},json(v){this.body=v;return this;}});
  await auth.forgotPassword({method:'POST',headers:{origin:ENV.CLIENT_URL},ip:'198.51.100.9',body:{email:'owner@example.invalid'}},res());
  const token=new URL(mail.at(-1).text.match(/https:\/\/\S+/)[0]).hash.slice('#token='.length),done=res();
  await auth.resetPassword({method:'POST',headers:{origin:ENV.CLIENT_URL},ip:'198.51.100.9',body:{token,password:'brand-new-password'}},done);
  assert.equal(done.statusCode,200);
  assert.equal(phone.check(),false);assert.equal((await phone.refresh()).statusCode,401);
});

test('a removed staff member and a deleted account cannot keep a long-lived sign-in',async t=>{
  const f=fixture(t),staff=f.device(),owner=f.device();
  await staff.signIn('staff@example.invalid','staff-1-password');await owner.signIn('owner@example.invalid','owner-1-password');
  f.advance(25*DAY);await staff.refresh();await owner.refresh();
  f.database.prepare("DELETE FROM users WHERE id='staff-1'").run();
  assert.equal(staff.check(),false);assert.equal((await staff.refresh()).statusCode,401);
  f.database.prepare("UPDATE users SET dataDeletedAt=? WHERE id='owner-1'").run(f.now().toISOString());
  assert.equal(owner.check(),false);assert.equal((await owner.refresh()).statusCode,401);
});

test('an unverified owner still cannot sign in',async t=>{
  const f=fixture(t);
  f.database.prepare("UPDATE users SET emailVerifiedAt=NULL WHERE id='owner-1'").run();
  assert.deepEqual((await f.device().signIn('owner@example.invalid','owner-1-password')).body,{error:'Invalid credentials'});
});

test('a refresh secret is still one use: a racing replay is refused as a conflict, a stale one as invalid',async t=>{
  const f=fixture(t),phone=f.device();
  await phone.signIn('owner@example.invalid','owner-1-password');
  const old={...phone.state};f.advance(MINUTE);await phone.refresh();
  assert.equal((await f.call('refresh',{token:old.token,cookie:old.cookie})).statusCode,409,'a replay within the hour is a conflict');
  f.advance(2*HOUR);await phone.refresh();
  assert.equal((await f.call('refresh',{token:old.token,cookie:old.cookie})).statusCode,401,'a replay after the hour is refused');
  assert.equal((await phone.refresh()).statusCode,200,'the device itself is unaffected');
});

test('used refresh secrets do not pile up over months of use',async t=>{
  const f=fixture(t),phone=f.device();
  await phone.signIn('owner@example.invalid','owner-1-password');
  for(let n=0;n<60*24*4;n++){f.advance(15*MINUTE);assert.equal((await phone.refresh()).statusCode,200);} // 60 days, every 15 minutes
  const rows=f.database.prepare('SELECT COUNT(*) AS n FROM authRefreshTokens').get().n;
  assert.ok(rows<=6,`${rows} refresh rows kept for one device`);
});
