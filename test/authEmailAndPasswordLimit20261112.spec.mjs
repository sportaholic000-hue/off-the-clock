import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import {CREATE_TABLE_STATEMENTS,CREATE_TRIGGER_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';
import {createStaffService,StaffError} from '../server/src/staffService.js';

// Owner rulings 2026-11-12. Expected values written before execution.
// 2. Sign-up, password recovery and public verification resend never wait on
//    the email provider: with a sender that takes 250 ms, every handler returns
//    well under 250 ms for a known and an unknown email, and the eligible email
//    is still sent. Before this change the eligible branches awaited the send.
// 3. Passwords are capped at bcrypt's 72 UTF-8 bytes wherever one is set, with
//    "Use a password of 8 to 72 characters. Accented letters and emoji count as
//    more than one."; a longer password at sign-in is refused like a wrong one.
//    Before this change up to 1,024 characters were accepted and two passwords
//    sharing their first 72 bytes both signed in.
const MESSAGE='Use a password of 8 to 72 characters. Accented letters and emoji count as more than one.';
const SECRET='SYNTHETIC_AUTH_EMAIL_PASSWORD_SECRET_20261112';
const env={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:SECRET,BCRYPT_COST:12};
const SEND_MS=250,FAST_MS=100;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const mailToken=message=>new URL(message.text.match(/https?:\/\/\S+/)[0]).hash.slice('#token='.length);
const bytes=value=>Buffer.byteLength(value,'utf8');

function fixture(t,{realBcrypt=false,sendFails=false}={}) {
  const database=new Database(':memory:');database.pragma('foreign_keys=ON');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  for(const sql of CREATE_TRIGGER_STATEMENTS.filter(sql=>sql.includes('users_staff_parent')))database.exec(sql);
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  let instant=Date.parse('2026-11-12T12:00:00.000Z');const now=()=>new Date(instant);
  const tokenService=createAuthTokenService(database,{clock:now}),sessions=createAuthSessionService(database,{environment:env,clock:now});
  const sent=[],started=[];
  // A provider that takes 250 ms to accept each message.
  const sendEmail=async message=>{started.push(message);await pause(SEND_MS);if(sendFails)throw Error('SYNTHETIC provider failure');sent.push(message);return {accepted:true};};
  const hashing=realBcrypt
    ?{hashPassword:password=>bcrypt.hash(password,4),comparePassword:(password,hash)=>bcrypt.compare(password,hash)}
    :{hashPassword:async password=>'hash:'+password,comparePassword:async(password,hash)=>hash==='hash:'+password};
  const auth=createAuthHandlers({database,tokenService,sessionService:sessions,environment:env,now,sendEmail,...hashing});
  const staff=createStaffService({database,ownerQuery:sql=>database.prepare(sql),tokenService,sessionService:sessions,now,environment:env,
    sendEmail:async message=>{sent.push(message);return {accepted:true};},hashPassword:hashing.hashPassword});
  async function invoke(handler,body) {
    const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    const begun=performance.now();
    await handler({method:'POST',headers:{origin:env.CLIENT_URL},ip:'synthetic-ip-'+Math.random(),body},res);
    return {status:res.statusCode,body:res.body,ms:performance.now()-begun};
  }
  function addOwner(id,{verified=true}={}) {
    database.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,emailVerifiedAt)
      VALUES(?,?,'hash:owner-pass','Owner',?,'Scale','active','UTC','owner',?,?)`).run(id,id+'@example.invalid','Synthetic '+id,now().toISOString(),verified?now().toISOString():null);
    return id+'@example.invalid';
  }
  return {database,auth,staff,sent,started,invoke,addOwner,advance:ms=>{instant+=ms;}};
}
const signup=(email,password='synthetic-pass')=>({email,password,firstName:'Owner',businessName:'Synthetic business',plan:'Operator'});

// 2. Email off the request path
test('sign-up returns without waiting on the email provider for a new and an existing email; the new one is still emailed',async t=>{
  const f=fixture(t),existing=f.addOwner('known-owner');
  const fresh=await f.invoke(f.auth.register,signup('new-owner@example.invalid'));
  const known=await f.invoke(f.auth.register,signup(existing));
  assert.deepEqual({status:fresh.status,body:fresh.body},{status:202,body:{ok:true}});
  assert.deepEqual({status:known.status,body:known.body},{status:202,body:{ok:true}});
  assert.ok(fresh.ms<FAST_MS,`new email took ${fresh.ms} ms`);
  assert.ok(known.ms<FAST_MS,`existing email took ${known.ms} ms`);
  assert.deepEqual(f.started.map(m=>m.to),['new-owner@example.invalid'],'the send started for the new account only');
  assert.equal(f.sent.length,0,'not yet accepted when the handler returned');
  await pause(SEND_MS+100);
  assert.deepEqual(f.sent.map(m=>m.to),['new-owner@example.invalid']);
  assert.match(f.sent[0].subject,/Verify your Off The Clock AI email/);
});

test('password recovery returns without waiting on the email provider for a known and an unknown email; the known one is still emailed',async t=>{
  const f=fixture(t),existing=f.addOwner('known-owner');
  const known=await f.invoke(f.auth.forgotPassword,{email:existing});
  const unknown=await f.invoke(f.auth.forgotPassword,{email:'nobody@example.invalid'});
  assert.deepEqual([known.status,known.body,unknown.status,unknown.body],[200,{ok:true},200,{ok:true}]);
  assert.ok(known.ms<FAST_MS,`known email took ${known.ms} ms`);
  assert.ok(unknown.ms<FAST_MS,`unknown email took ${unknown.ms} ms`);
  await pause(SEND_MS+100);
  assert.deepEqual(f.sent.map(m=>[m.to,m.subject]),[[existing,'Reset your password']]);
});

test('public verification resend returns without waiting on the email provider for a known and an unknown email; the unverified one is still emailed',async t=>{
  const f=fixture(t),existing=f.addOwner('unverified-owner',{verified:false});
  const known=await f.invoke(f.auth.resendVerificationPublic,{email:existing});
  const unknown=await f.invoke(f.auth.resendVerificationPublic,{email:'nobody@example.invalid'});
  assert.deepEqual([known.status,known.body,unknown.status,unknown.body],[200,{ok:true},200,{ok:true}]);
  assert.ok(known.ms<FAST_MS,`known email took ${known.ms} ms`);
  assert.ok(unknown.ms<FAST_MS,`unknown email took ${unknown.ms} ms`);
  await pause(SEND_MS+100);
  assert.deepEqual(f.sent.map(m=>[m.to,m.subject]),[[existing,'Verify your Off The Clock AI email']]);
});

test('a failed background send is logged without the address, never reported, and its link is revoked',async t=>{
  const f=fixture(t,{sendFails:true}),existing=f.addOwner('known-owner');
  const logged=[];const original=console.error;console.error=(...args)=>logged.push(args);
  t.after(()=>{console.error=original;});
  const reply=await f.invoke(f.auth.forgotPassword,{email:existing});
  assert.deepEqual([reply.status,reply.body],[200,{ok:true}]);
  assert.ok(reply.ms<FAST_MS);
  await pause(SEND_MS+100);
  console.error=original;
  assert.equal(logged.length,1);
  assert.equal(logged[0][0],'[auth] account email could not be sent');
  assert.doesNotMatch(JSON.stringify(logged),/example\.invalid/);
  const failedToken=mailToken(f.started[0]);
  assert.equal((await f.invoke(f.auth.resetPassword,{token:failedToken,password:'another-pass'})).status,400,'the unsent link no longer works');
});

// 3. 72-byte password limit
const P72='p'.repeat(72),P73='p'.repeat(73);
const ACCENTED_73_BYTES='é'.repeat(36)+'a';  // 37 characters, 73 bytes
test('fixtures: byte lengths',()=>{assert.equal(bytes(P72),72);assert.equal(bytes(P73),73);assert.equal(bytes(ACCENTED_73_BYTES),73);assert.equal(ACCENTED_73_BYTES.length,37);});

test('a 73-byte password is refused at sign-up, reset and staff invite with the length message',async t=>{
  const f=fixture(t);
  for(const password of [P73,ACCENTED_73_BYTES,'p'.repeat(1024)]){
    const result=await f.invoke(f.auth.register,signup('long-'+bytes(password)+'-'+password.length+'@example.invalid',password));
    assert.deepEqual({status:result.status,body:result.body},{status:400,body:{error:MESSAGE}});
  }
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM users').get().n,0,'no account was created');
  assert.equal(f.started.length,0);

  const ownerEmail=f.addOwner('reset-owner');
  await f.invoke(f.auth.forgotPassword,{email:ownerEmail});
  const resetToken=mailToken(f.started.at(-1));
  for(const password of [P73,ACCENTED_73_BYTES]){
    const result=await f.invoke(f.auth.resetPassword,{token:resetToken,password});
    assert.deepEqual({status:result.status,body:result.body},{status:400,body:{error:MESSAGE}});
  }
  assert.equal(f.database.prepare('SELECT passwordHash FROM users WHERE email=?').get(ownerEmail).passwordHash,'hash:owner-pass','password unchanged');

  await f.staff.invite('reset-owner',{name:'Synthetic staff',email:'staff@example.invalid'});
  const inviteToken=mailToken(f.sent.at(-1));
  for(const password of [P73,ACCENTED_73_BYTES]){
    await assert.rejects(()=>f.staff.accept({token:inviteToken,password}),error=>error instanceof StaffError&&error.status===400&&error.message===MESSAGE);
  }
  assert.equal((await f.staff.accept({token:inviteToken,password:'short'}).catch(error=>error)).message,MESSAGE,'too short gets the same message');
  assert.match(f.database.prepare("SELECT passwordHash FROM users WHERE email='staff@example.invalid'").get().passwordHash,/^invite:/,'invite still pending');
});

test('a 72-byte password works end to end with real bcrypt: sign-up, sign-in, reset and staff invite',async t=>{
  const f=fixture(t,{realBcrypt:true});
  const email='seventy-two@example.invalid';
  assert.equal((await f.invoke(f.auth.register,signup(email,P72))).status,202);
  await pause(SEND_MS+50);
  assert.equal((await f.invoke(f.auth.verifyEmail,{token:mailToken(f.sent.at(-1))})).status,200);
  assert.equal((await f.invoke(f.auth.login,{email,password:P72})).status,200);

  const NEW72='é'.repeat(36);  // 36 characters, 72 bytes
  assert.equal(bytes(NEW72),72);
  await f.invoke(f.auth.forgotPassword,{email});
  await pause(SEND_MS+50);
  assert.equal((await f.invoke(f.auth.resetPassword,{token:mailToken(f.sent.at(-1)),password:NEW72})).status,200);
  assert.equal((await f.invoke(f.auth.login,{email,password:NEW72})).status,200);

  const ownerId=f.database.prepare('SELECT id FROM users WHERE email=?').get(email).id;
  f.database.prepare("UPDATE users SET plan='Scale',planStatus='active' WHERE id=?").run(ownerId);
  await f.staff.invite(ownerId,{name:'Synthetic staff',email:'staff72@example.invalid'});
  await f.staff.accept({token:mailToken(f.sent.at(-1)),password:P72});
  assert.equal((await f.invoke(f.auth.login,{email:'staff72@example.invalid',password:P72})).status,200);
});

test('two passwords that share 72 bytes but differ after can no longer both be set or both sign in',async t=>{
  const f=fixture(t,{realBcrypt:true});
  const shared='s'.repeat(72),first=shared+'-first',second=shared+'-second';
  // bcrypt itself cannot tell them apart: this is why the limit exists.
  assert.equal(await bcrypt.compare(second,await bcrypt.hash(first,4)),true);
  const email='shared-prefix@example.invalid';
  assert.equal((await f.invoke(f.auth.register,signup(email,first))).status,400,'the longer password cannot be set');
  assert.equal((await f.invoke(f.auth.register,signup(email,shared))).status,202);
  await pause(SEND_MS+50);
  assert.equal((await f.invoke(f.auth.verifyEmail,{token:mailToken(f.sent.at(-1))})).status,200);
  assert.equal((await f.invoke(f.auth.login,{email,password:shared})).status,200);
  // An account whose stored hash came from a longer password (set before this
  // change) can only be signed in to with a password of 72 bytes or fewer.
  f.database.prepare('UPDATE users SET passwordHash=? WHERE email=?').run(await bcrypt.hash(first,4),email);
  const wrong=await f.invoke(f.auth.login,{email,password:'not-the-password'});
  for(const password of [first,second]){
    const refused=await f.invoke(f.auth.login,{email,password});
    assert.deepEqual({status:refused.status,body:refused.body},{status:wrong.status,body:wrong.body},'refused the same way as a wrong password');
  }
  assert.deepEqual(wrong,{...wrong,status:401,body:{error:'Invalid credentials'}});
});
