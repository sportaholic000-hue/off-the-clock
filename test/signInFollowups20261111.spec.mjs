import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService} from '../server/src/authSessionService.js';
import * as rateLimit from '../server/src/authRateLimitService.js';
const {installAuthLimitSchema,createAuthRateLimiter,AuthLimitError,KNOWN_ADDRESSES_PER_ACCOUNT,KNOWN_ADDRESSES_TOTAL=50000}=rateLimit;
import {createAuthHandlers} from '../server/src/auth.js';

// Sign-in follow-ups: pending staff invitations refuse in the same time,
// remembered addresses never fill the limit table, and a completed password
// reset ends the account's failed sign-in lock. Synthetic accounts and addresses only.
const SECRET='SYNTHETIC_SIGNIN_FOLLOWUP_SECRET_ONLY';
const ENV={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:SECRET,BCRYPT_COST:12,OWNER_SIGNUP_ENABLED:'true'};
const OWNER='owner@example.invalid',STAFF='invited@example.invalid',MINUTE=60*1000,DAY=24*60*MINUTE;

async function fixture(t,{real=false,limiter}={}){
  const database=new Database(':memory:');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  let instant=Date.parse('2026-11-11T12:00:00.000Z');const now=()=>new Date(instant);
  const compared=[],mail=[];
  const hashPassword=real?async(p,c)=>bcrypt.hash(p,c):async p=>'hash:'+p;
  const comparePassword=real?async(p,h)=>{compared.push(h);return bcrypt.compare(p,h);}:async(p,h)=>{compared.push(h);return h==='hash:'+p;};
  const ownerHash=real?await bcrypt.hash('right-password',12):'hash:right-password';
  const add=(id,email,{passwordHash=ownerHash,role='owner',ownerId=null,verified=true,deleted=false}={})=>database.prepare(`INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,emailVerifiedAt,dataDeletedAt)
    VALUES(?,?,?,?,'Synthetic','[SYNTHETIC] Business','Operator','active','UTC',?,?,?,?)`).run(id,ownerId,email,passwordHash,role,now().toISOString(),verified?now().toISOString():null,deleted?now().toISOString():null);
  add('owner-1',OWNER);
  const sessions=createAuthSessionService(database,{environment:ENV,clock:now});
  const limits=limiter?limiter(database,now):undefined;
  const auth=createAuthHandlers({database,tokenService:createAuthTokenService(database,{clock:now}),sessionService:sessions,environment:ENV,now,
    hashPassword,comparePassword,sendEmail:async message=>{mail.push(message);return {accepted:true};},...(limits?{rateLimiter:limits}:{})});
  async function call(handler,body,address){
    const res={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;},
      cookie(){return this;},clearCookie(){return this;}};
    const started=performance.now();
    await auth[handler]({method:'POST',headers:{origin:ENV.CLIENT_URL},cookies:{},ip:address,body,query:{}},res);
    return {status:res.statusCode,body:res.body,ms:performance.now()-started};
  }
  let next=0;const fresh=()=>'198.51.100.'+(++next);
  const count=table=>database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  return {database,add,compared,mail,call,fresh,count,sessions,now,
    login:(email,password,address=fresh())=>call('login',{email,password},address),advance:ms=>{instant+=ms;}};
}
const outcome=reply=>({status:reply.status,body:reply.body});
const refused={status:401,body:{error:'Invalid credentials'}},limited={status:429,body:{error:'Too many login attempts'}};

// 1. Pending staff invitation
test('a pending staff invitation is refused after one comparison against the decoy, not its placeholder',async t=>{
  const f=await fixture(t);
  f.add('staff-1',STAFF,{role:'staff',ownerId:'owner-1',passwordHash:'invite:'+'a'.repeat(64),verified:false});
  f.add('erased-1','erased-1@deleted.invalid',{passwordHash:'!',deleted:true});
  for(const [email,password] of [[STAFF,'any-password'],[STAFF,''],['erased-1@deleted.invalid','!']]){
    const before=f.compared.length;
    assert.deepEqual(outcome(await f.login(email,password)),refused,email);
    const used=f.compared.slice(before);
    assert.equal(used.length,1,email+': one comparison');
    assert.ok(!used[0].startsWith('invite:')&&used[0]!=='!',email+': compared against the decoy');
    assert.match(used[0],/^hash:.{20,}/,email+': the decoy is a real hash');
  }
});

test('real bcrypt: a pending staff invitation is refused in the same time as a wrong password',{timeout:120000},async t=>{
  const f=await fixture(t,{real:true});
  f.add('staff-1',STAFF,{role:'staff',ownerId:'owner-1',passwordHash:'invite:'+'b'.repeat(64),verified:false});
  await f.login('nobody@example.invalid','warm-up');
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const invited=[],wrong=[];
  for(let n=0;n<5;n++){invited.push((await f.login(STAFF,'any-password')).ms);wrong.push((await f.login(OWNER,'wrong-password')).ms);}
  const ratio=median(invited)/median(wrong);
  console.log(`invited median ${median(invited).toFixed(1)} ms, wrong password median ${median(wrong).toFixed(1)} ms`);
  assert.ok(ratio>0.75&&ratio<1.33,`invited ${median(invited).toFixed(1)} ms vs wrong password ${median(wrong).toFixed(1)} ms`);
});

test('a staff member who accepted still signs in',async t=>{
  const f=await fixture(t);
  f.add('staff-2','accepted@example.invalid',{role:'staff',ownerId:'owner-1',passwordHash:'hash:staff-password'});
  assert.equal((await f.login('accepted@example.invalid','staff-password')).status,200);
});

// 2. Remembered addresses
const smallLimiter=(maximumKeys)=>(database,now)=>createAuthRateLimiter(database,{secret:SECRET,clock:now,maximumKeys});

test('remembered addresses never fill the limit table: sign-in, sign-up, forgot password and refresh still answer',async t=>{
  const f=await fixture(t,{limiter:smallLimiter(8)});
  for(let n=0;n<12;n++){f.advance(16*MINUTE);assert.equal((await f.login(OWNER,'right-password')).status,200,'sign-in '+(n+1));}
  f.advance(16*MINUTE);
  assert.ok(f.count('authKnownAddresses')>=12,'the addresses are remembered');
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM authRateLimits WHERE windowStartedAt+windowMs>?').get(f.now().getTime()).n,0,'no current limit rows are left');
  assert.equal((await f.login(OWNER,'right-password')).status,200,'sign-in from a new address');
  assert.notEqual((await f.call('register',{email:'new-owner@example.invalid',password:'new-owner-pass',firstName:'New',businessName:'[SYNTHETIC] New',plan:'Operator'},f.fresh())).status,429,'sign-up');
  assert.notEqual((await f.call('forgotPassword',{email:OWNER},f.fresh())).status,429,'forgot password');
  assert.notEqual((await f.call('refresh',{},f.fresh())).status,429,'session refresh');
});

test('remembered addresses never count toward the limit table cap',async t=>{
  const f=await fixture(t,{limiter:smallLimiter(3)});
  for(let n=0;n<6;n++){f.advance(16*MINUTE);assert.equal((await f.login(OWNER,'right-password')).status,200,'sign-in '+(n+1));}
  assert.ok(f.count('authRateLimits')<=3);
});

test('memory is bounded per account: the newest 20 addresses are kept',async t=>{
  const f=await fixture(t);const limiter=createAuthRateLimiter(f.database,{secret:SECRET,clock:f.now});
  assert.equal(KNOWN_ADDRESSES_PER_ACCOUNT,20);
  for(let n=1;n<=25;n++){f.advance(MINUTE);limiter.remember('login-known',OWNER,'203.0.113.'+n,30*DAY);}
  limiter.remember('login-known','other@example.invalid','203.0.113.200',30*DAY);
  assert.equal(f.count('authKnownAddresses'),21);
  for(let n=1;n<=5;n++)assert.equal(limiter.remembered('login-known',OWNER,'203.0.113.'+n),false,'oldest dropped: '+n);
  for(let n=6;n<=25;n++)assert.equal(limiter.remembered('login-known',OWNER,'203.0.113.'+n),true,'kept: '+n);
  assert.equal(limiter.remembered('login-known','other@example.invalid','203.0.113.200'),true,'other accounts untouched');
});

test('memory is bounded in total: never more than 50,000 addresses, oldest dropped first',async t=>{
  const f=await fixture(t);const limiter=createAuthRateLimiter(f.database,{secret:SECRET,clock:f.now});
  assert.equal(KNOWN_ADDRESSES_TOTAL,50000);
  const start=f.now().getTime(),insert=f.database.prepare('INSERT INTO authKnownAddresses(keyHash,accountHash,rememberedAt,expiresAt) VALUES(?,?,?,?)');
  f.database.transaction(()=>{for(let n=0;n<KNOWN_ADDRESSES_TOTAL;n++){const h=n.toString(16).padStart(64,'0');insert.run(h,h,start-KNOWN_ADDRESSES_TOTAL+n,start+DAY);}})();
  limiter.remember('login-known',OWNER,'203.0.113.9',30*DAY);
  assert.equal(f.count('authKnownAddresses'),KNOWN_ADDRESSES_TOTAL);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM authKnownAddresses WHERE keyHash=?').get('0'.repeat(64)).n,0,'the oldest is dropped');
  assert.equal(limiter.remembered('login-known',OWNER,'203.0.113.9'),true);
});

test('remembered addresses expire after 30 days and are cleared on the next remember',async t=>{
  const f=await fixture(t);const limiter=createAuthRateLimiter(f.database,{secret:SECRET,clock:f.now});
  limiter.remember('login-known',OWNER,'203.0.113.1',30*DAY);
  f.advance(30*DAY);
  assert.equal(limiter.remembered('login-known',OWNER,'203.0.113.1'),false);
  limiter.remember('login-known',OWNER,'203.0.113.2',30*DAY);
  assert.equal(f.count('authKnownAddresses'),1);
});

test('remembered rows store nothing readable',async t=>{
  const f=await fixture(t);
  assert.equal((await f.login(OWNER,'right-password','203.0.113.77')).status,200);
  const rows=JSON.stringify(f.database.prepare('SELECT * FROM authKnownAddresses').all());
  assert.equal(f.count('authKnownAddresses'),1);
  for(const text of [OWNER,'owner@','203.0.113'])assert.ok(!rows.includes(text),text);
});

test('remembered rows left in the limit table by the earlier version are removed on start',async t=>{
  const database=new Database(':memory:');t.after(()=>database.close());
  database.exec(`CREATE TABLE authRateLimits(keyHash TEXT PRIMARY KEY CHECK(length(keyHash)=64), windowStartedAt INTEGER NOT NULL,
    windowMs INTEGER NOT NULL CHECK(windowMs>0), count INTEGER NOT NULL CHECK(count>=0)) STRICT;`);
  const insert=database.prepare('INSERT INTO authRateLimits VALUES(?,?,?,?)');
  insert.run('a'.repeat(64),1,30*DAY,0);insert.run('b'.repeat(64),1,15*MINUTE,0);insert.run('c'.repeat(64),1,15*MINUTE,3);
  installAuthLimitSchema(database);
  assert.deepEqual(database.prepare('SELECT keyHash FROM authRateLimits ORDER BY keyHash').all().map(r=>r.keyHash[0]),['b','c']);
});

test('a failure to remember or look up an address never refuses a sign-in',async t=>{
  const broken=(database,now)=>{const real=createAuthRateLimiter(database,{secret:SECRET,clock:now});
    return {...real,remember(){throw new AuthLimitError();},remembered(){throw new AuthLimitError();}};};
  const f=await fixture(t,{limiter:broken});
  assert.equal((await f.login(OWNER,'right-password')).status,200,'remember failed: sign-in still succeeds');
  assert.deepEqual(outcome(await f.login(OWNER,'wrong-password')),refused,'lookup failed: an ordinary refusal');
});

// 3. Password reset ends the lock
async function lock(f,email=OWNER){for(let n=0;n<10;n++)await f.login(email,'guess-'+n);assert.deepEqual(outcome(await f.login(email,'right-password')),limited,'locked');}
const linkToken=message=>new URL(message.text.match(/https:\/\/\S+/)[0]).hash.slice('#token='.length);

test('a completed password reset ends the lock: the owner signs in straight away from a new address',async t=>{
  const f=await fixture(t);
  f.sessions.create(f.database.prepare('SELECT * FROM users WHERE id=?').get('owner-1'));
  const active=()=>f.database.prepare('SELECT COUNT(*) AS n FROM authSessions WHERE userId=? AND revokedAt IS NULL').get('owner-1').n;
  assert.equal(active(),1);
  await lock(f);
  assert.deepEqual(outcome(await f.call('forgotPassword',{email:OWNER},f.fresh())),{status:200,body:{ok:true}});
  const token=linkToken(f.mail.at(-1));
  assert.deepEqual(outcome(await f.call('resetPassword',{token,password:'new-password-1'},f.fresh())),{status:200,body:{ok:true}});
  assert.equal(active(),0,'earlier sessions are ended');
  assert.equal((await f.login(OWNER,'new-password-1')).status,200,'signed in from a new address');
  assert.deepEqual(outcome(await f.login(OWNER,'right-password')),refused,'the old password no longer works');
});

test('a reset with a bad link changes nothing and the lock stays',async t=>{
  const f=await fixture(t);
  await lock(f);
  assert.deepEqual(outcome(await f.call('resetPassword',{token:'A'.repeat(43),password:'new-password-1'},f.fresh())),{status:400,body:{error:'This link is invalid or has expired.'}});
  assert.deepEqual(outcome(await f.login(OWNER,'right-password')),limited);
});

test('a reset ends only that account\'s lock',async t=>{
  const f=await fixture(t);
  f.add('owner-2','second@example.invalid');
  await lock(f);await lock(f,'second@example.invalid');
  await f.call('forgotPassword',{email:OWNER},f.fresh());
  await f.call('resetPassword',{token:linkToken(f.mail.at(-1)),password:'new-password-1'},f.fresh());
  assert.equal((await f.login(OWNER,'new-password-1')).status,200);
  assert.deepEqual(outcome(await f.login('second@example.invalid','right-password')),limited);
});

test('limits that must not change: 10 per account, 5 per address, 15 minutes',async t=>{
  const f=await fixture(t);
  for(let n=0;n<10;n++)assert.deepEqual(outcome(await f.login(OWNER,'guess-'+n)),refused);
  assert.deepEqual(outcome(await f.login(OWNER,'guess-11')),limited);
  f.advance(15*MINUTE);
  assert.equal((await f.login(OWNER,'right-password')).status,200);
  const address='192.0.2.50';
  for(let n=0;n<5;n++)assert.deepEqual(outcome(await f.login('user'+n+'@example.invalid','guess',address)),refused);
  assert.deepEqual(outcome(await f.login(OWNER,'right-password',address)),limited);
});
