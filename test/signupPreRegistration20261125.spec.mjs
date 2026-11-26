import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {CREATE_TABLE_STATEMENTS,CREATE_TRIGGER_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers,FINISH_SIGNUP_SUBJECT} from '../server/src/auth.js';

// Someone signs up with another person's email before that person does. Before this
// change the first sign-up's password stayed on the account, and the real owner's
// click on the verification link made the stranger's password work.
// Real sign-up, verify, reset and sign-in handlers on an in-memory database. Synthetic
// addresses; no email leaves the process.
// HANDWRITTEN EXPECTATIONS, before execution:
// - stranger signs up first, owner signs up second (202 both): the stranger's password
//   no longer signs in, every verification link from before is refused, and the owner
//   receives a password link; setting a password through it verifies the address and
//   that password signs in; the stranger's never does;
// - owner signs up first, stranger second: the same, the owner's password link wins;
// - "resend verification" after the second sign-up sends a password link, not a verify
//   link; neither earlier password signs in;
// - a single sign-up verifies and signs in exactly as before;
// - a sign-up for a verified owner email changes nothing and sends nothing;
// - every sign-up reply is the same 202 {ok:true}.
const STRANGER='stranger-password-1',OWNER='owner-password-22';
function setup(t){
  const database=new Database(':memory:');database.pragma('foreign_keys=ON');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  for(const sql of CREATE_TRIGGER_STATEMENTS.filter(sql=>sql.includes('users_staff_parent')))database.exec(sql);
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  let clock=Date.parse('2026-11-25T12:00:00.000Z');const now=()=>new Date(clock);
  const env={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:'SYNTHETIC_PRE_REGISTRATION_SECRET_20261125',BCRYPT_COST:12};
  const sent=[];
  const auth=createAuthHandlers({database,environment:env,now,tokenService:createAuthTokenService(database,{clock:now}),
    sessionService:createAuthSessionService(database,{environment:env,clock:now}),
    sendEmail:async message=>{sent.push(message);return {accepted:true};},hashPassword:async p=>'hash:'+p,comparePassword:async(p,h)=>h==='hash:'+p});
  let ip=0;
  async function call(handler,body){
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},append(){},cookie(){},set(){return this;},status(c){this.statusCode=c;return this;},json(v){this.body=v;return this;}};
    await auth[handler]({method:'POST',headers:{origin:env.CLIENT_URL},ip:'198.51.100.'+(++ip),body,query:{},cookies:{}},res);
    return {status:res.statusCode,body:res.body};
  }
  const settle=()=>new Promise(r=>setTimeout(r,20));
  // 'reset' here is the password link a second sign-up sends; it explains itself
  // instead of reading as a reset the owner never asked for (2026-11-26).
  const links=(email,kind)=>sent.filter(m=>m.to===email&&m.subject===(kind==='verify'?'Verify your Off The Clock AI email':FINISH_SIGNUP_SUBJECT)).map(m=>m.text.match(/token=([A-Za-z0-9_-]+)/)[1]);
  const signup=(email,password)=>call('register',{email,password,firstName:'Synthetic',businessName:'Synthetic Roofing',plan:'Operator'});
  const login=async(email,password)=>(await call('login',{email,password})).status;
  return {database,call,settle,links,signup,login,sent,advance:ms=>{clock+=ms;}};
}

for(const order of ['stranger first','owner first'])test(`pre-registration (${order}): only the inbox owner's password ever signs in`,async t=>{
  const f=setup(t),email='owner-'+order.split(' ')[0]+'@example.invalid';
  const first=order==='stranger first'?STRANGER:OWNER,second=order==='stranger first'?OWNER:STRANGER;
  assert.deepEqual(await f.signup(email,first),{status:202,body:{ok:true}});await f.settle();
  assert.deepEqual(await f.signup(email,second),{status:202,body:{ok:true}});await f.settle();
  const [oldVerify]=f.links(email,'verify');assert.ok(oldVerify,'first sign-up sent a verification link');
  assert.equal((await f.call('verifyEmail',{token:oldVerify})).status,400,'the earlier verification link is refused');
  assert.equal(f.database.prepare('SELECT emailVerifiedAt FROM users WHERE email=?').get(email).emailVerifiedAt,null);
  for(const password of [STRANGER,OWNER])assert.equal(await f.login(email,password),401,password+' does not sign in yet');
  const [reset]=f.links(email,'reset');assert.ok(reset,'the second sign-up emailed a password link');
  const message=f.sent.find(m=>m.to===email&&m.subject===FINISH_SIGNUP_SUBJECT);
  assert.match(message.text,/^An Off The Clock AI account was started with this email address more than once, so its password has to be set from this inbox before anyone can sign in\.\n\nChoose your password: https:\/\/app\.example\.invalid\/reset-password[?#]token=/);
  assert.match(message.text,/Setting it also confirms this email address\. This link expires in .+\. If you did not sign up, you can ignore this email; nobody can sign in to the account without this link\.$/);
  assert.equal(f.sent.some(m=>m.to===email&&m.subject==='Reset your password'),false,'no unrequested "Reset your password" email');
  assert.equal((await f.call('resetPassword',{token:reset,password:'owner-chosen-password-3'})).status,200);
  assert.ok(f.database.prepare('SELECT emailVerifiedAt FROM users WHERE email=?').get(email).emailVerifiedAt,'setting the password verified the address');
  assert.equal(await f.login(email,'owner-chosen-password-3'),200);
  assert.equal(await f.login(email,STRANGER),401);
  // Once verified, another sign-up changes nothing and sends nothing.
  const mail=f.sent.length;f.advance(120000);
  assert.deepEqual(await f.signup(email,STRANGER),{status:202,body:{ok:true}});await f.settle();
  assert.equal(f.sent.length,mail);assert.equal(await f.login(email,'owner-chosen-password-3'),200);assert.equal(await f.login(email,STRANGER),401);
});

test('pre-registration: "resend verification" after the second sign-up sends a password link, never a verify link',async t=>{
  const f=setup(t),email='owner-resend@example.invalid';
  await f.signup(email,STRANGER);await f.settle();await f.signup(email,OWNER);await f.settle();
  const verifyLinks=f.links(email,'verify').length,resetLinks=f.links(email,'reset').length;
  f.advance(120000);
  assert.deepEqual(await f.call('resendVerificationPublic',{email}),{status:200,body:{ok:true}});await f.settle();
  assert.equal(f.links(email,'verify').length,verifyLinks,'no new verify link');
  assert.equal(f.links(email,'reset').length,resetLinks+1,'a new password link');
  for(const password of [STRANGER,OWNER])assert.equal(await f.login(email,password),401);
  assert.equal((await f.call('resetPassword',{token:f.links(email,'reset').at(-1),password:'owner-chosen-password-4'})).status,200);
  assert.equal(await f.login(email,'owner-chosen-password-4'),200);
  assert.equal(await f.login(email,STRANGER),401);
});

test('a single sign-up verifies and signs in as before',async t=>{
  const f=setup(t),email='single@example.invalid';
  assert.deepEqual(await f.signup(email,OWNER),{status:202,body:{ok:true}});await f.settle();
  assert.equal(f.links(email,'reset').length,0);
  assert.equal(await f.login(email,OWNER),401,'not verified yet');
  assert.equal((await f.call('verifyEmail',{token:f.links(email,'verify')[0]})).status,200);
  assert.equal(await f.login(email,OWNER),200);
});
