import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';

// Sign-in: a refusal takes the same time whether or not the email has an account,
// and failed sign-ins are limited per account as well as per address.
// Synthetic accounts and addresses only.
const SECRET='SYNTHETIC_SIGNIN_HARDENING_SECRET_ONLY';
const ENV={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:SECRET,BCRYPT_COST:12};
const OWNER='owner@example.invalid',UNKNOWN='nobody@example.invalid';
const T0=Date.parse('2026-11-11T12:00:00.000Z'),MINUTE=60*1000;

async function fixture(t,{real=false,environment=ENV}={}){
  const database=new Database(':memory:');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  let instant=T0;const now=()=>new Date(instant);
  const compared=[],hashed=[];
  const hashPassword=real?async(p,c)=>{hashed.push(c);return bcrypt.hash(p,c);}:async(p,c)=>{hashed.push(c);return 'hash:'+p;};
  const comparePassword=real?async(p,h)=>{compared.push(h);return bcrypt.compare(p,h);}:async(p,h)=>{compared.push(h);return h==='hash:'+p;};
  const ownerHash=real?await bcrypt.hash('right-password',12):'hash:right-password';
  const add=(id,email,extra={})=>database.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,emailVerifiedAt,dataDeletedAt)
    VALUES(?,?,?,'Synthetic','[SYNTHETIC] Business','Operator','active','UTC',?,?,?,?)`).run(id,email,extra.passwordHash??ownerHash,extra.role??'owner',now().toISOString(),
      extra.unverified?null:now().toISOString(),extra.deleted?now().toISOString():null);
  add('owner-1',OWNER);
  const auth=createAuthHandlers({database,tokenService:createAuthTokenService(database,{clock:now}),
    sessionService:createAuthSessionService(database,{environment,clock:now}),environment,now,hashPassword,comparePassword,
    sendEmail:async()=>({accepted:true})});
  async function call(handler,body,address){
    const res={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    const started=performance.now();
    await auth[handler]({method:'POST',headers:{origin:ENV.CLIENT_URL},ip:address,body},res);
    return {status:res.statusCode,body:res.body,ms:performance.now()-started};
  }
  let next=0;const fresh=()=>'198.51.100.'+(++next);
  return {database,add,compared,hashed,call,fresh,login:(email,password,address=fresh())=>call('login',{email,password},address),
    advance:ms=>{instant+=ms;}};
}
const refused={status:401,body:{error:'Invalid credentials'}};
const limited={status:429,body:{error:'Too many login attempts'}};
const outcome=reply=>({status:reply.status,body:reply.body});

// 1. Same time whether or not the email has an account
test('every refused sign-in runs exactly one password comparison at the configured cost',async t=>{
  const f=await fixture(t);
  f.add('deleted-1','deleted@example.invalid',{deleted:true});
  f.add('unverified-1','unverified@example.invalid',{unverified:true});
  f.add('admin-row','admin-row@example.invalid',{role:'admin'});
  f.add('nohash-1','nohash@example.invalid',{passwordHash:''});
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.hashed,[12],'one decoy hash is made at the configured cost when sign-in starts');
  const decoy='hash:';
  const cases=[
    ['unknown email',{email:UNKNOWN,password:'wrong-password'},decoy],
    ['wrong password',{email:OWNER,password:'wrong-password'},'hash:right-password'],
    ['deleted account',{email:'deleted@example.invalid',password:'right-password'},'hash:right-password'],
    ['unverified owner',{email:'unverified@example.invalid',password:'right-password'},'hash:right-password'],
    ['admin row in users',{email:'admin-row@example.invalid',password:'right-password'},'hash:right-password'],
    ['account with no password hash',{email:'nohash@example.invalid',password:''},decoy],
    ['malformed email',{email:'not-an-email',password:'wrong-password'},decoy],
    ['missing email',{password:'wrong-password'},decoy],
    ['non-text password',{email:UNKNOWN,password:{}},decoy]
  ];
  for(const [label,body,hashStart] of cases){
    const before=f.compared.length;
    assert.deepEqual(outcome(await f.call('login',body,f.fresh())),refused,label);
    const used=f.compared.slice(before);
    assert.equal(used.length,1,label+': one comparison');
    assert.ok(used[0].startsWith(hashStart),label+': compared against '+(hashStart===decoy?'the decoy':'the account hash'));
    if(hashStart===decoy)assert.notEqual(used[0],'hash:','the decoy is a real hash of a random secret');
  }
  assert.equal(f.hashed.length,1,'the decoy is made once and reused');
});

test('admin sign-in compares the password even when the admin email is wrong',async t=>{
  const f=await fixture(t,{environment:{...ENV,ADMIN_EMAIL:'admin@example.invalid',ADMIN_PASSWORD_HASH:'hash:admin-password'}});
  for(const email of ['someone@example.invalid',undefined,'admin@example.invalid']){
    const before=f.compared.length;
    assert.deepEqual(outcome(await f.call('adminLogin',{email,password:'wrong-password'},f.fresh())),refused,String(email));
    assert.deepEqual(f.compared.slice(before),['hash:admin-password'],String(email));
  }
  assert.equal((await f.call('adminLogin',{email:'admin@example.invalid',password:'admin-password'},f.fresh())).status,200);
});

test('real bcrypt: an unknown email is refused in the same time as a wrong password',{timeout:120000},async t=>{
  const f=await fixture(t,{real:true});
  f.add('unverified-1','unverified@example.invalid',{unverified:true});
  await f.login(UNKNOWN,'warm-up-password');
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const times={unknown:[],wrong:[],unverified:[]};
  for(let round=0;round<5;round++){
    times.unknown.push((await f.login(UNKNOWN,'wrong-password')).ms);
    times.wrong.push((await f.login(OWNER,'wrong-password')).ms);
    times.unverified.push((await f.login('unverified@example.invalid','right-password')).ms);
  }
  const wrong=median(times.wrong);
  for(const kind of ['unknown','unverified']){
    const ratio=median(times[kind])/wrong;
    assert.ok(ratio>0.75&&ratio<1.33,`${kind} median ${median(times[kind]).toFixed(1)} ms vs wrong password ${wrong.toFixed(1)} ms`);
  }
});

// 2. Per-account limit
test('guessing one account from many addresses is refused after 10 failures, even with the right password',async t=>{
  const f=await fixture(t);
  for(let n=0;n<10;n++)assert.deepEqual(outcome(await f.login(OWNER,'guess-'+n)),refused,'guess '+(n+1));
  assert.deepEqual(outcome(await f.login(OWNER,'guess-11')),limited);
  const before=f.compared.length;
  assert.deepEqual(outcome(await f.login(OWNER,'right-password')),limited,'a new address cannot sign in during the lock');
  assert.equal(f.compared.length,before,'a locked attempt never reaches the password check');
});

test('the account limit treats an email with no account exactly the same',async t=>{
  const f=await fixture(t);
  const known=[],unknown=[];
  for(let n=0;n<12;n++){known.push(outcome(await f.login(OWNER,'guess-'+n)));unknown.push(outcome(await f.login(UNKNOWN,'guess-'+n)));}
  assert.deepEqual(unknown,known);
  assert.deepEqual(known.map(r=>r.status),[401,401,401,401,401,401,401,401,401,401,429,429]);
});

test('the real owner still signs in during a lock from an address they signed in from before',async t=>{
  const f=await fixture(t);const home='203.0.113.7';
  assert.equal((await f.login(OWNER,'right-password',home)).status,200);
  f.advance(20*24*60*MINUTE);
  for(let n=0;n<12;n++)await f.login(OWNER,'guess-'+n);
  assert.deepEqual(outcome(await f.login(OWNER,'right-password')),limited,'unknown addresses are locked');
  assert.equal((await f.login(OWNER,'right-password',home)).status,200,'the owner\'s own address is not');
  assert.deepEqual(outcome(await f.login(OWNER,'typo',home)),refused,'a typo at home is an ordinary refusal');
});

test('an address is remembered for 30 days after its last successful sign-in',async t=>{
  const f=await fixture(t);const home='203.0.113.8';
  assert.equal((await f.login(OWNER,'right-password',home)).status,200);
  f.advance(30*24*60*MINUTE);
  for(let n=0;n<10;n++)await f.login(OWNER,'guess-'+n);
  assert.deepEqual(outcome(await f.login(OWNER,'right-password',home)),limited,'after 30 days the address is new again');
});

test('the lock ends 15 minutes after the first failure, and the owner signs in from a new address',async t=>{
  const f=await fixture(t);
  for(let n=0;n<10;n++)await f.login(OWNER,'guess-'+n);
  f.advance(14*MINUTE);
  assert.deepEqual(outcome(await f.login(OWNER,'right-password')),limited);
  f.advance(MINUTE);
  assert.equal((await f.login(OWNER,'right-password')).status,200);
});

test('the per-address limit is unchanged: five failures from one address in 15 minutes',async t=>{
  const f=await fixture(t);const address='192.0.2.10';
  for(let n=0;n<5;n++)assert.deepEqual(outcome(await f.login('user'+n+'@example.invalid','guess',address)),refused);
  assert.deepEqual(outcome(await f.login(OWNER,'right-password',address)),limited);
  assert.equal((await f.login(OWNER,'right-password')).status,200,'another address is not affected');
});

test('a successful sign-in gives back its own failure slots',async t=>{
  const f=await fixture(t);
  for(let n=0;n<9;n++)await f.login(OWNER,'guess-'+n);
  for(let n=0;n<3;n++)assert.equal((await f.login(OWNER,'right-password')).status,200,'success '+(n+1));
  assert.deepEqual(outcome(await f.login(OWNER,'guess-10')),refused,'the 10th failure is still allowed');
  assert.deepEqual(outcome(await f.login(OWNER,'guess-11',f.fresh())),limited);
});

test('admin sign-in is limited per account the same way',async t=>{
  const f=await fixture(t,{environment:{...ENV,ADMIN_EMAIL:'admin@example.invalid',ADMIN_PASSWORD_HASH:'hash:admin-password'}});
  for(let n=0;n<10;n++)assert.deepEqual(outcome(await f.call('adminLogin',{email:'admin@example.invalid',password:'guess-'+n},f.fresh())),refused);
  assert.deepEqual(outcome(await f.call('adminLogin',{email:'admin@example.invalid',password:'admin-password'},f.fresh())),limited);
  assert.deepEqual(outcome(await f.login(OWNER,'right-password')).status,200,'owner sign-in is a separate account');
});

test('limit rows store no email or address in readable form',async t=>{
  const f=await fixture(t);
  await f.login(OWNER,'right-password','203.0.113.9');for(let n=0;n<3;n++)await f.login(OWNER,'guess-'+n);
  const rows=JSON.stringify(f.database.prepare('SELECT * FROM authRateLimits').all());
  for(const text of [OWNER,'owner@','203.0.113','198.51.100'])assert.ok(!rows.includes(text),text);
});
