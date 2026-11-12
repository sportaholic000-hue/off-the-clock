import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import {CREATE_TABLE_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';

// Expected before execution: the admin sign-in compares a password of any
// length, and bcrypt reads only its first 72 bytes, so a 73-byte password that
// starts with the 72-byte admin password signs in (200) today. After the change
// it is refused exactly like a wrong password (401, "Invalid credentials") and
// counts against the same failure limits; the real password of 72 bytes or
// fewer still signs in. Synthetic credentials only.
const SECRET='SYNTHETIC_ADMIN_PASSWORD_LIMIT_SECRET_20261112';
const ADMIN='admin@example.invalid';
const P72='a'.repeat(72),P73=P72+'b';
const ACCENTED_72='é'.repeat(36),ACCENTED_73=ACCENTED_72+'b';
const T0=Date.parse('2026-11-12T12:00:00.000Z');
const bytes=value=>Buffer.byteLength(value,'utf8');

async function fixture(t,password=P72){
  const environment={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:SECRET,BCRYPT_COST:12,
    ADMIN_EMAIL:ADMIN,ADMIN_PASSWORD_HASH:await bcrypt.hash(password,4)};
  const database=new Database(':memory:');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  const now=()=>new Date(T0);
  const auth=createAuthHandlers({database,tokenService:createAuthTokenService(database,{clock:now}),
    sessionService:createAuthSessionService(database,{environment,clock:now}),environment,now,
    hashPassword:(value,cost)=>bcrypt.hash(value,cost),comparePassword:(value,hash)=>bcrypt.compare(value,hash),
    sendEmail:async()=>({accepted:true})});
  async function admin(body,address){
    const res={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await auth.adminLogin({method:'POST',headers:{origin:environment.CLIENT_URL},ip:address,body},res);
    return {status:res.statusCode,body:res.body};
  }
  let next=0;const fresh=()=>'198.51.100.'+(++next);
  return {database,environment,admin,fresh};
}

test('fixtures: byte lengths, and bcrypt alone accepts the 73-byte passwords',async()=>{
  assert.deepEqual([P72,P73,ACCENTED_72,ACCENTED_73].map(bytes),[72,73,72,73]);
  assert.equal(await bcrypt.compare(P73,await bcrypt.hash(P72,4)),true);
  assert.equal(await bcrypt.compare(ACCENTED_73,await bcrypt.hash(ACCENTED_72,4)),true);
});

test('a 73-byte admin password is refused exactly like a wrong one',async t=>{
  for(const [real,long] of [[P72,P73],[ACCENTED_72,ACCENTED_73]]){
    const f=await fixture(t,real);
    const wrong=await f.admin({email:ADMIN,password:'wrong-password'},f.fresh());
    assert.deepEqual(wrong,{status:401,body:{error:'Invalid credentials'}});
    assert.deepEqual(await f.admin({email:ADMIN,password:long},f.fresh()),wrong,`${bytes(long)}-byte password`);
    assert.deepEqual(await f.admin({email:ADMIN,password:'b'.repeat(1024)},f.fresh()),wrong,'1,024-character password');
  }
});

test('73-byte admin attempts count against the same failure limits as wrong passwords',async t=>{
  const outcomes=[],limitRows=[];
  for(const password of ['wrong-password',P73]){
    const f=await fixture(t);
    const replies=[];
    // Ten failures from one address and from fresh addresses, then the real password.
    for(let n=0;n<5;n++)replies.push(await f.admin({email:ADMIN,password},'203.0.113.7'));
    for(let n=0;n<5;n++)replies.push(await f.admin({email:ADMIN,password},f.fresh()));
    replies.push(await f.admin({email:ADMIN,password:P72},f.fresh()));
    outcomes.push(replies);
    limitRows.push(f.database.prepare('SELECT * FROM authRateLimits ORDER BY 1,2,3').all());
  }
  assert.deepEqual(outcomes[1],outcomes[0]);
  assert.deepEqual(outcomes[0].slice(0,10),Array(10).fill({status:401,body:{error:'Invalid credentials'}}));
  assert.deepEqual(outcomes[0][10],{status:429,body:{error:'Too many login attempts'}},'the account is limited after ten failures');
  assert.deepEqual(limitRows[1],limitRows[0],'the stored failure counts are identical');
});

test('the real admin password of 72 bytes or fewer still signs in',async t=>{
  for(const password of [P72,ACCENTED_72,'short-admin-password']){
    const f=await fixture(t,password);
    const reply=await f.admin({email:ADMIN,password},f.fresh());
    assert.equal(reply.status,200,`${bytes(password)}-byte password`);
  }
});
