import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {installAuthSessionSchema} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';
import {createAuthTokenService, installAuthTokenSchema, AUTH_TOKEN_PURPOSES as P, hashAuthToken} from '../server/src/authTokenService.js';
import {accountEmailOrigin, accountEmailLink} from '../server/src/authLinks.js';
import {createTransactionalEmailSender, EmailDeliveryError} from '../server/src/email.js';

function fixture(t, overrides={}) {
  const database = new Database(':memory:'); database.pragma('foreign_keys=ON'); t.after(()=>database.close());
  database.exec('CREATE TABLE users(id TEXT PRIMARY KEY, ownerId TEXT, email TEXT UNIQUE, passwordHash TEXT, firstName TEXT, businessName TEXT, plan TEXT, planStatus TEXT, trialEndsAt TEXT, timezone TEXT, role TEXT, createdAt TEXT, emailVerifiedAt TEXT)');
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  let instant = Date.parse('2026-09-29T12:00:00Z');
  const now=()=>new Date(instant), mail=[], state={fail:false};
  const tokenService=createAuthTokenService(database,{clock:now});
  const handlers=createAuthHandlers({database, tokenService, now, environment:{NODE_ENV:'test', CLIENT_URL:'https://app.example.invalid', JWT_SECRET:'SYNTHETIC_ACCOUNT_TEST_SECRET_ONLY', BCRYPT_COST:12, ...overrides.environment},
    hashPassword:async (p,c)=>{assert.equal(c,12);return 'hash:'+p;}, comparePassword:async(p,h)=>h==='hash:'+p, issueSessionToken:u=>'session:'+u.id,
    sendEmail:async m=>{mail.push(m);if(state.fail)throw Error('SYNTHETIC provider failure');return {accepted:true};}, ...overrides, environment:{NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:'SYNTHETIC_ACCOUNT_TEST_SECRET_ONLY',BCRYPT_COST:12,...overrides.environment}});
  return {database,handlers,tokenService,mail,state,advance:ms=>{instant+=ms;},
    user:(id='owner-a')=>{database.prepare("INSERT INTO users(id,email,passwordHash,role) VALUES(?,?,'hash:original-pass','owner')").run(id,id+'@example.invalid');return id;}};
}
async function call(handler, body={}, extra={}) {
  const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(payload){this.body=payload;return this;}};
  await handler({method:'POST',ip:'synthetic-ip',body,query:{},...extra},res);
  return {status:res.statusCode,body:res.body};
}
const signup={email:'owner@example.invalid',password:'original-pass',firstName:'Owner',businessName:'Synthetic business',plan:'QuoteDone'};
const mailToken=m=>new URL(m.text.match(/https?:\/\/\S+/)[0]).hash.slice('#token='.length);

test('email origins are trusted, absolute and production HTTPS only',()=>{
  assert.equal(accountEmailOrigin({NODE_ENV:'test'}),'http://localhost:5173');
  for(const value of ['', 'http://app.example.invalid','https://u:p@app.example.invalid','https://app.example.invalid/subpath','https://app.example.invalid?redirect=bad','javascript:bad'])
    assert.throws(()=>accountEmailOrigin({NODE_ENV:'production',CLIENT_URL:value}));
  assert.throws(()=>accountEmailOrigin({NODE_ENV:'test',CLIENT_URL:'http://remote.example.invalid'}));
  const token=Buffer.alloc(32,1).toString('base64url');
  assert.equal(accountEmailLink({NODE_ENV:'production',CLIENT_URL:'https://app.example.invalid/'},P.RESET_PASSWORD,token),'https://app.example.invalid/reset-password#token='+token);
});

test('unsafe production link configuration rejects before account creation',async t=>{
  const f=fixture(t,{environment:{NODE_ENV:'production',CLIENT_URL:'http://untrusted.invalid'}});
  assert.equal((await call(f.handlers.register,signup)).status,503);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM users').get().n,0);
});

test('failed signup delivery stays generic and recovers only after email verification',async t=>{
  const f=fixture(t);f.state.fail=true;
  const r=await call(f.handlers.register,signup);assert.deepEqual(r,{status:202,body:{ok:true}});
  const account=f.database.prepare('SELECT * FROM users WHERE email=?').get(signup.email);
  assert.equal(account.plan,'QuoteDone');assert.equal(account.planStatus,'pending_payment');
  assert.equal((await call(f.handlers.login,{email:signup.email,password:signup.password})).status,401);
  assert.deepEqual(await call(f.handlers.register,signup),r);
  assert.equal(f.database.prepare('SELECT COUNT(*) n FROM authSessions').get().n,0);
  const failed=mailToken(f.mail[0]);assert.equal((await call(f.handlers.verifyEmail,{token:failed})).status,400);
  f.state.fail=false;
  assert.equal((await call(f.handlers.resendVerificationPublic,{email:signup.email})).status,200);
  assert.equal((await call(f.handlers.verifyEmail,{token:mailToken(f.mail[1])})).status,200);
  assert.equal((await call(f.handlers.login,{email:signup.email,password:signup.password})).status,200);
  assert.equal(f.database.prepare('SELECT planStatus FROM users').get().planStatus,'pending_payment');
});

test('signup cannot enumerate known emails, obtain a session or replace another account password',async t=>{
  const f=fixture(t),id=f.user('owner-b');
  const before=f.database.prepare('SELECT * FROM users WHERE id=?').get(id);
  const known=await call(f.handlers.register,{...signup,email:before.email});
  const fresh=await call(f.handlers.register,signup);
  assert.deepEqual(known,{status:202,body:{ok:true}});assert.deepEqual(fresh,known);
  assert.deepEqual(f.database.prepare('SELECT * FROM users WHERE id=?').get(id),before);
  assert.equal(f.database.prepare('SELECT COUNT(*) n FROM authSessions').get().n,0);
  const unknownLogin=await call(f.handlers.login,{email:'unknown@example.invalid',password:signup.password});
  assert.deepEqual(await call(f.handlers.login,{email:signup.email,password:signup.password}),unknownLogin);
  assert.equal(unknownLogin.status,401);
  assert.equal((await call(f.handlers.verifyEmail,{token:mailToken(f.mail[0])})).status,200);
  assert.equal((await call(f.handlers.login,{email:signup.email,password:signup.password})).status,200);
});

test('account status and authenticated resend derive identity from authenticated user',async t=>{
  const f=fixture(t),a=f.user(),b=f.user('owner-b');
  const r=await call(f.handlers.accountStatus,{userId:b},{userId:a});assert.equal(r.body.email,'owner-a@example.invalid');assert.equal(r.body.emailVerifiedAt,null);
  assert.equal((await call(f.handlers.accountStatus,{}, {userId:'absent'})).status,401);
  await call(f.handlers.resendVerification,{userId:b},{userId:a});
  assert.equal(f.mail[0].to,'owner-a@example.invalid');
  assert.equal(f.database.prepare('SELECT userId FROM authTokens').get().userId,a);
});

test('successful resend uses cooldown and hashed idempotency key without returning a raw token',async t=>{
  const f=fixture(t),id=f.user();
  const r=await call(f.handlers.resendVerification,{}, {userId:id});assert.deepEqual(r,{status:200,body:{verificationDelivery:{status:'accepted'}}});
  const token=mailToken(f.mail[0]);assert.equal(f.mail[0].idempotencyKey,'auth/verify_email/'+hashAuthToken(token));
  assert.equal(JSON.stringify(r).includes(token),false);
  assert.equal((await call(f.handlers.resendVerification,{}, {userId:id})).status,429);
  f.advance(61000);assert.equal((await call(f.handlers.resendVerification,{}, {userId:id})).status,200);
});

test('failed resend revokes only its link and preserves an earlier delivered link',async t=>{
  const f=fixture(t),id=f.user();await call(f.handlers.resendVerification,{}, {userId:id});
  f.advance(61000);f.state.fail=true;assert.equal((await call(f.handlers.resendVerification,{}, {userId:id})).status,503);
  assert.equal((await call(f.handlers.verifyEmail,{token:mailToken(f.mail[1])})).status,400);
  assert.equal((await call(f.handlers.verifyEmail,{token:mailToken(f.mail[0])})).status,200);
});

test('an older delivery failure cannot revoke a newer concurrent send',async t=>{
  let rejectFirst;let releaseStarted;const started=new Promise(r=>{releaseStarted=r;});let calls=0;const mail=[];
  const f=fixture(t,{sendEmail:async m=>{mail.push(m);calls++;if(calls===1){releaseStarted();return new Promise((_,reject)=>{rejectFirst=reject;});}return {accepted:true};}});
  const id=f.user(),first=call(f.handlers.resendVerification,{}, {userId:id});await started;
  f.advance(61000);assert.equal((await call(f.handlers.resendVerification,{}, {userId:id})).status,200);
  rejectFirst(Error('SYNTHETIC older send failed'));assert.equal((await first).status,503);
  assert.equal((await call(f.handlers.verifyEmail,{token:mailToken(mail[1])})).status,200);
});

test('verification is single use, purpose scoped and invalidates other verification links',async t=>{
  const f=fixture(t),id=f.user(),one=f.tokenService.issue({userId:id,purpose:P.VERIFY_EMAIL,replaceOutstanding:false}),
    two=f.tokenService.issue({userId:id,purpose:P.VERIFY_EMAIL,replaceOutstanding:false}),reset=f.tokenService.issue({userId:id,purpose:P.RESET_PASSWORD});
  assert.equal((await call(f.handlers.verifyEmail,{token:reset.token})).status,400);
  assert.equal((await call(f.handlers.verifyEmail,{token:one.token})).status,200);
  assert.ok(f.database.prepare('SELECT emailVerifiedAt FROM users WHERE id=?').get(id).emailVerifiedAt);
  for(const token of [one.token,two.token])assert.equal((await call(f.handlers.verifyEmail,{token})).status,400);
  assert.equal((await call(f.handlers.resendVerification,{}, {userId:id})).body.verificationDelivery.status,'already_verified');
  assert.equal((await call(f.handlers.resetPassword,{token:reset.token,password:'new-password'})).status,200);
});

test('verification accepts legacy GET while rejecting expired or malformed links',async t=>{
  const f=fixture(t),id=f.user(),issued=f.tokenService.issue({userId:id,purpose:P.VERIFY_EMAIL,ttlMs:300000});f.advance(300000);
  assert.equal((await call(f.handlers.verifyEmail,{}, {method:'GET',query:{token:issued.token}})).status,400);
  for(const token of [undefined,[],{},'short'])assert.equal((await call(f.handlers.verifyEmail,{token})).status,400);
  const good=f.tokenService.issue({userId:id,purpose:P.VERIFY_EMAIL});
  assert.equal((await call(f.handlers.verifyEmail,{}, {method:'GET',query:{token:good.token}})).status,200);
});

test('reset changes the password, consumes all reset links and does not grant paid access',async t=>{
  const f=fixture(t);await call(f.handlers.register,signup);
  const id=f.database.prepare('SELECT id FROM users WHERE email=?').get(signup.email).id;
  assert.equal((await call(f.handlers.verifyEmail,{token:mailToken(f.mail[0])})).status,200);
  const a=f.tokenService.issue({userId:id,purpose:P.RESET_PASSWORD,replaceOutstanding:false}),b=f.tokenService.issue({userId:id,purpose:P.RESET_PASSWORD,replaceOutstanding:false});
  assert.equal((await call(f.handlers.resetPassword,{token:a.token,password:'new-password'})).status,200);
  for(const token of [a.token,b.token])assert.equal((await call(f.handlers.resetPassword,{token,password:'another-password'})).status,400);
  assert.equal((await call(f.handlers.login,{email:signup.email,password:signup.password})).status,401);
  assert.equal((await call(f.handlers.login,{email:signup.email,password:'new-password'})).status,200);
  assert.equal(f.database.prepare('SELECT planStatus FROM users WHERE id=?').get(id).planStatus,'pending_payment');
});

test('invalid reset input cannot consume a valid token or change a password',async t=>{
  const f=fixture(t),id=f.user(),issued=f.tokenService.issue({userId:id,purpose:P.RESET_PASSWORD});
  assert.equal((await call(f.handlers.resetPassword,{token:issued.token,password:'short'})).status,400);
  assert.equal((await call(f.handlers.resetPassword,{token:'bad',password:'new-password'})).status,400);
  assert.equal(f.database.prepare('SELECT passwordHash FROM users WHERE id=?').get(id).passwordHash,'hash:original-pass');
  assert.equal((await call(f.handlers.resetPassword,{token:issued.token,password:'new-password'})).status,200);
});

test('expired reset links cannot change passwords',async t=>{
  const f=fixture(t),id=f.user(),issued=f.tokenService.issue({userId:id,purpose:P.RESET_PASSWORD});f.advance(1800000);
  assert.equal((await call(f.handlers.resetPassword,{token:issued.token,password:'new-password'})).status,400);
  assert.equal(f.database.prepare('SELECT passwordHash FROM users WHERE id=?').get(id).passwordHash,'hash:original-pass');
});

for(const name of ['forgotPassword','resendVerificationPublic'])test(name+' keeps unknown, known and delivery failures indistinguishable',async t=>{
  const f=fixture(t);f.user();
  const unknown=await call(f.handlers[name],{email:'absent@example.invalid'}),known=await call(f.handlers[name],{email:'owner-a@example.invalid'});
  assert.deepEqual(unknown,{status:200,body:{ok:true}});assert.deepEqual(known,unknown);assert.equal(f.mail.length,1);
  f.advance(61000);f.state.fail=true;assert.deepEqual(await call(f.handlers[name],{email:'owner-a@example.invalid'}),unknown);
  assert.deepEqual(await call(f.handlers[name],{email:['invalid']}),unknown);
});

test('public recovery is bounded per IP without requiring a known account',async t=>{
  const f=fixture(t);
  for(let i=0;i<10;i++)assert.equal((await call(f.handlers.forgotPassword,{email:'absent@example.invalid'})).status,200);
  assert.equal((await call(f.handlers.forgotPassword,{email:'absent@example.invalid'})).status,429);
  assert.equal((await call(f.handlers.forgotPassword,{email:'absent@example.invalid'},{ip:'other-ip'})).status,200);
  f.advance(900000);assert.equal((await call(f.handlers.forgotPassword,{email:'absent@example.invalid'})).status,200);
});

const providerEnv={NODE_ENV:'production',EMAIL_PROVIDER:'resend',EMAIL_DELIVERY_ENABLED:'true',RESEND_API_KEY:'re_SYNTHETIC',EMAIL_FROM:'account@example.invalid'};
const message={to:'owner@example.invalid',subject:'Synthetic account email',text:'SYNTHETIC private link body',idempotencyKey:'auth/verify_email/synthetic'};
test('production refuses console or missing configuration without making network requests or logging secrets',async()=>{
  let calls=0,logs=[];
  for(const environment of [{NODE_ENV:'production',EMAIL_PROVIDER:'console'}, {...providerEnv,EMAIL_DELIVERY_ENABLED:'false'}, {...providerEnv,RESEND_API_KEY:''}]) {
    const send=createTransactionalEmailSender({environment,fetchClient:async()=>{calls++;},logger:{info:(...args)=>logs.push(args)}});
    await assert.rejects(send(message),e=>e instanceof EmailDeliveryError&&e.code==='EMAIL_NOT_CONFIGURED');
  }
  assert.equal(calls,0);assert.deepEqual(logs,[]);
});
test('development console logs metadata only and identifies simulation',async()=>{
  const logs=[];const send=createTransactionalEmailSender({environment:{NODE_ENV:'test'},logger:{info:(...args)=>logs.push(args)}});
  assert.deepEqual(await send(message),{provider:'console',accepted:true,simulated:true});
  assert.equal(JSON.stringify(logs).includes(message.text),false);assert.equal(JSON.stringify(logs).includes(message.to),false);
});
test('provider retry preserves body and idempotency key for ambiguous outcomes',async()=>{
  const calls=[],waits=[];
  const send=createTransactionalEmailSender({environment:providerEnv,wait:async ms=>waits.push(ms),fetchClient:async(url,options)=>{
    calls.push({url,body:options.body,key:options.headers['Idempotency-Key']});
    if(calls.length===1)throw Error('SYNTHETIC secret network failure');
    if(calls.length===2)return new Response('',{status:429});
    return Response.json({id:'synthetic-message-id'});
  }});
  assert.deepEqual(await send(message),{provider:'resend',accepted:true,id:'synthetic-message-id'});
  assert.deepEqual(waits,[250,750]);assert.equal(calls.length,3);for(const call of calls)assert.deepEqual(call,calls[0]);
  assert.deepEqual(JSON.parse(calls[0].body),{from:providerEnv.EMAIL_FROM,to:[message.to],subject:message.subject,text:message.text});
});
test('permanent provider rejection does not retry or expose its response',async()=>{
  let calls=0;
  const send=createTransactionalEmailSender({environment:providerEnv,fetchClient:async()=>{calls++;return Response.json({error:'SYNTHETIC secret response'},{status:401});}});
  await assert.rejects(send(message),e=>e instanceof EmailDeliveryError&&!String(e).includes('secret'));assert.equal(calls,1);
});
test('persistent transport failure has exactly three attempts and a safe error',async()=>{
  let calls=0;const send=createTransactionalEmailSender({environment:providerEnv,wait:async()=>{},fetchClient:async()=>{calls++;throw Error(providerEnv.RESEND_API_KEY);}});
  await assert.rejects(send(message),e=>e instanceof EmailDeliveryError&&!String(e).includes(providerEnv.RESEND_API_KEY));assert.equal(calls,3);
});
test('an HTTP success without a provider receipt is not reported accepted',async()=>{
  const send=createTransactionalEmailSender({environment:providerEnv,fetchClient:async()=>Response.json({})});
  await assert.rejects(send(message),EmailDeliveryError);
});
test('invalid recipients, header injection and invalid keys are rejected before transport',async()=>{
  let calls=0;const send=createTransactionalEmailSender({environment:providerEnv,fetchClient:async()=>{calls++;}});
  for(const overrides of [{to:'bad'}, {subject:'bad\r\ninjected'}, {idempotencyKey:'bad value'}, {text:''}])
    await assert.rejects(send({...message,...overrides}),e=>e.code==='EMAIL_REQUEST_INVALID');
  assert.equal(calls,0);
});


test('configured bcrypt costs below the required twelve rounds fail before account creation',async t=>{
  for(const BCRYPT_COST of [4,11,'not-a-number',32]){
    const f=fixture(t,{environment:{BCRYPT_COST}});
    assert.equal((await call(f.handlers.register,signup)).status,503);
    assert.equal(f.database.prepare('SELECT COUNT(*) n FROM users').get().n,0);
  }
});

test('invalid bcrypt configuration cannot consume a reset link or replace a password',async t=>{
  const f=fixture(t,{environment:{BCRYPT_COST:11}}),id=f.user();
  const issued=f.tokenService.issue({userId:id,purpose:P.RESET_PASSWORD});
  assert.equal((await call(f.handlers.resetPassword,{token:issued.token,password:'replacement-pass'})).status,503);
  assert.equal(f.database.prepare('SELECT passwordHash FROM users WHERE id=?').get(id).passwordHash,'hash:original-pass');
  assert.equal(f.database.prepare('SELECT consumedAt FROM authTokens WHERE tokenHash=?').get(hashAuthToken(issued.token)).consumedAt,null);
});
