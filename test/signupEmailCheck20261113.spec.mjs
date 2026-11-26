import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {createLaunchPlanFixture,closeLaunchPlanDatabase} from './helpers/launchPlanFixture.mjs';
import {CREATE_TABLE_STATEMENTS,CREATE_TRIGGER_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';
import {createStaffService} from '../server/src/staffService.js';
import {createTransactionalEmailSender} from '../server/src/email.js';

// Owner ruling 2026-11-13: sign-up refuses an address the account-email sender
// would refuse, before any account (or any database row) is written, with one
// plain sentence. A valid address signs up as before, and an address that
// already has an account gets the same reply, in the same time, as a new one.
// Expected values written before running. Synthetic addresses only; no email
// leaves this process.
after(closeLaunchPlanDatabase);
const SENTENCE='Enter a valid email address, like name@example.com.';
const T_ADDRESSES=['owner@nodot','owner@@example.invalid','owner@example','owner@.com','a b@example.invalid','<owner>@example.invalid'];
const signup=email=>({email,password:'synthetic-signup-password',firstName:'Owner',businessName:'Synthetic signup business',plan:'Operator'});
const fresh=()=>'owner-'+crypto.randomUUID()+'@example.invalid';
const changes=db=>db.prepare('SELECT total_changes() AS n').get().n;
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];

test('real sign-up route: each of the six addresses is refused with the sentence, before any database write or email',async t=>{
  const f=await createLaunchPlanFixture();t.after(f.close);
  for(const email of T_ADDRESSES){
    const users=f.db.prepare('SELECT COUNT(*) n FROM users').get().n,writes=changes(f.db),mail=f.mail.length;
    const reply=await f.request('/api/auth/register',{body:signup(email)});
    assert.deepEqual(reply,{status:400,body:{error:SENTENCE}},email);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users').get().n,users,email);
    assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users WHERE email=?').get(email.trim().toLowerCase()).n,0,email);
    assert.equal(changes(f.db),writes,email+': no database write');
    assert.equal(f.mail.length,mail,email);
  }
});

test('real sign-up route: a valid address signs up as before, and an existing account gets the same reply in the same time',async t=>{
  const f=await createLaunchPlanFixture();t.after(f.close);
  const first=fresh(),reply=await f.request('/api/auth/register',{body:signup(first)});
  assert.deepEqual(reply,{status:202,body:{ok:true}});
  const row=f.db.prepare('SELECT plan,planStatus,role,emailVerifiedAt FROM users WHERE email=?').get(first);
  assert.deepEqual({...row},{plan:'Operator',planStatus:'pending_payment',role:'owner',emailVerifiedAt:null});
  for(let n=0;n<50&&!f.mail.some(m=>m.to===first);n++)await new Promise(r=>setTimeout(r,20));
  assert.ok(f.mail.some(m=>m.to===first),'the verification email is sent to the new address');
  const timeNew=[],timeExisting=[];
  for(let round=0;round<5;round++){
    let begun=performance.now();const newReply=await f.request('/api/auth/register',{body:signup(fresh())});timeNew.push(performance.now()-begun);
    begun=performance.now();const known=await f.request('/api/auth/register',{body:signup(first)});timeExisting.push(performance.now()-begun);
    assert.deepEqual(known,newReply);assert.deepEqual(known,{status:202,body:{ok:true}});
  }
  const a=median(timeNew),b=median(timeExisting);
  assert.ok(Math.abs(a-b)<=0.3*Math.max(a,b),`median new ${a.toFixed(1)} ms vs existing ${b.toFixed(1)} ms`);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM users WHERE email=?').get(first).n,1);
});

// One in-memory database for sign-up, staff invitations and the sender.
function fixture(t){
  const database=new Database(':memory:');database.pragma('foreign_keys=ON');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  for(const sql of CREATE_TRIGGER_STATEMENTS.filter(sql=>sql.includes('users_staff_parent')))database.exec(sql);
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  const env={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:'SYNTHETIC_SIGNUP_EMAIL_CHECK_SECRET_20261113',BCRYPT_COST:12};
  const now=()=>new Date('2026-11-13T12:00:00.000Z'),tokenService=createAuthTokenService(database,{clock:now}),sessions=createAuthSessionService(database,{environment:env,clock:now});
  const sent=[],sendEmail=async message=>{sent.push(message);return {accepted:true};},hashPassword=async password=>'hash:'+password;
  const auth=createAuthHandlers({database,tokenService,sessionService:sessions,environment:env,now,sendEmail,hashPassword,comparePassword:async(p,h)=>h==='hash:'+p});
  const staff=createStaffService({database,ownerQuery:sql=>database.prepare(sql),tokenService,sessionService:sessions,now,environment:env,sendEmail,hashPassword});
  database.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES('synthetic-owner',NULL,'synthetic-owner@example.invalid','x','Owner','Synthetic','Scale','active','UTC','owner',?)").run(now().toISOString());
  async function register(email){
    const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await auth.register({method:'POST',headers:{origin:env.CLIENT_URL},ip:'synthetic-ip-'+Math.random(),body:signup(email)},res);
    return {status:res.statusCode,body:res.body};
  }
  return {database,register,staff,sent};
}
// Written before running: good addresses are accepted by sign-up and the sender;
// bad ones are refused by both. Sign-up stores the trimmed lower-case address.
const GOOD=['owner@example.invalid','Owner.Name+tag@Sub.Example.invalid','o@e.co','first_last@xn--bcher-kva.example','  padded@example.invalid  '];
const BAD=[...T_ADDRESSES,'owner','@example.invalid','owner@','owner@example.','owner@exa mple.invalid','owner@example.invalid>','own"er@exa<mple.invalid','owner@example..invalid@x'];

test('sign-up, staff invitation and the sender agree on every address',async t=>{
  const f=fixture(t),staffSide=fixture(t),send=createTransactionalEmailSender({environment:{NODE_ENV:'test',EMAIL_PROVIDER:'console'},logger:{info(){}}});
  for(const email of [...GOOD,...BAD]){
    const stored=email.trim().toLowerCase(),good=GOOD.includes(email);
    const reply=await f.register(email);
    if(good)assert.deepEqual(reply,{status:202,body:{ok:true}},email);
    else assert.deepEqual(reply,{status:400,body:{error:SENTENCE}},email);
    let senderAccepted=true;try{await send({to:stored,subject:'Synthetic',text:'Synthetic'});}catch{senderAccepted=false;}
    assert.equal(senderAccepted,good,'sender: '+email);
    let invited=true;try{await staffSide.staff.invite('synthetic-owner',{name:'Synthetic staff',email});}catch(error){invited=false;assert.equal(error.status,400,email);assert.equal(error.message,'Enter a name and valid email address.');}
    assert.equal(invited,good,'staff invitation: '+email);
  }
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM users WHERE role='owner' AND id!='synthetic-owner'").get().n,GOOD.length);
});
