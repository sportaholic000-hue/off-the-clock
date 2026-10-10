import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import {CREATE_TABLE_STATEMENTS,CREATE_TRIGGER_STATEMENTS} from '../server/src/schema.js';
import {installAuthTokenSchema,createAuthTokenService,AUTH_TOKEN_PURPOSES} from '../server/src/authTokenService.js';
import {installAuthSessionSchema,createAuthSessionService} from '../server/src/authSessionService.js';
import {installAuthLimitSchema} from '../server/src/authRateLimitService.js';
import {createAuthHandlers} from '../server/src/auth.js';
import {createStaffService} from '../server/src/staffService.js';
import {installStaffRoutes} from '../server/src/staffRoutes.js';
import {requireAuth} from '../server/src/authMiddleware.js';
import {installQuoteEmailSchema} from '../server/src/quoteEmailSchema.js';
import {createQuoteEmailService} from '../server/src/quoteEmailService.js';

const SECRET='SYNTHETIC_STAFF_TEST_SECRET_WITH_NO_REAL_ACCOUNTS';
const env={NODE_ENV:'test',CLIENT_URL:'https://app.example.invalid',JWT_SECRET:SECRET,BCRYPT_COST:12};
const mailToken=message=>new URL(message.text.match(/https:\/\/\S+/)[0]).hash.slice('#token='.length);
const row=(db,id)=>db.prepare('SELECT * FROM users WHERE id=?').get(id);

function fixture(t) {
  const database=new Database(':memory:');database.pragma('foreign_keys=ON');t.after(()=>database.close());
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS users')));
  database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS customers')));
  for(const sql of CREATE_TRIGGER_STATEMENTS.filter(sql=>sql.includes('users_staff_parent')))database.exec(sql);
  installAuthTokenSchema(database);installAuthSessionSchema(database);installAuthLimitSchema(database);
  const query=sql=>{assert.match(sql,/\bownerId\b/);return database.prepare(sql);};
  let instant=Date.parse('2026-10-09T12:00:00.000Z');const now=()=>new Date(instant);
  const tokenService=createAuthTokenService(database,{clock:now}),sessions=createAuthSessionService(database,{environment:env});
  const mail=[],delivery={fail:false};
  const staff=createStaffService({database,ownerQuery:query,tokenService,sessionService:sessions,now,environment:env,
    sendEmail:async message=>{mail.push(message);if(delivery.fail)throw Error('SYNTHETIC provider unavailable');return {accepted:true};},
    hashPassword:async password=>'hash:'+password});
  function addOwner(id,plan='Operator') {
    database.prepare(`INSERT INTO users(id,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt,emailVerifiedAt)
      VALUES(?,?,'hash:owner-pass','Owner',?,?,'active','UTC','owner',?,?)`).run(
      id,id+'@example.invalid','Synthetic '+id,plan,now().toISOString(),now().toISOString());
    return row(database,id);
  }
  const auth=createAuthHandlers({database,tokenService,sessionService:sessions,environment:env,now,
    hashPassword:async password=>'hash:'+password,comparePassword:async(password,hash)=>hash==='hash:'+password,
    sendEmail:async message=>{mail.push(message);return {accepted:true};}});
  async function invoke(handler,body) {
    const res={statusCode:200,headers:{},setHeader(name,value){this.headers[name]=value;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await handler({method:'POST',headers:{origin:env.CLIENT_URL},ip:'synthetic-ip',body},res);
    return {status:res.statusCode,body:res.body};
  }
  return {database,staff,sessions,mail,delivery,auth,invoke,addOwner,tokenService,query,advance:ms=>{instant+=ms;}};
}

// Handwritten merged-plan expectations: Starter 0 staff, Operator 1, QuoteDone 1,
// Scale unlimited; the owner always keeps a login. No expectation derives from staffLimit.
for (const [plan,expectedLimit,acceptedSeats] of [['Starter',0,0],['Operator',1,1],['QuoteDone',1,1],['Scale',null,3]]) {
 test(`merged login limits: ${plan} keeps owner login and ${expectedLimit===null?'unlimited':expectedLimit} staff seats`,async t=>{
  const f=fixture(t),owner=f.addOwner('synthetic-owner',plan);
  assert.ok(f.sessions.create(owner).token);
  assert.equal(f.staff.list(owner.id).limit,expectedLimit);
  for(let index=0;index<acceptedSeats;index++){
   await f.staff.invite(owner.id,{name:'Synthetic staff '+index,email:`staff-${index}@example.invalid`});
   await f.staff.accept({token:mailToken(f.mail.at(-1)),password:'synthetic-password'});
  }
  const seats=f.staff.list(owner.id).staff;
  assert.equal(seats.length,acceptedSeats);
  for(const seat of seats)assert.ok(f.sessions.create(row(f.database,seat.id)).token);
  if(expectedLimit!==null)await assert.rejects(f.staff.invite(owner.id,{name:'Extra',email:'extra@example.invalid'}),error=>error.status===(plan==='Starter'?403:409));
  assert.ok(f.sessions.create(owner).token);
 });
}

test('Operator invite is pending, has no owner-selected password, accepts once and binds email and business',async t=>{
  const f=fixture(t),a=f.addOwner('owner-a'),b=f.addOwner('owner-b');
  await assert.rejects(f.staff.invite(a.id,{name:'Bad',email:'bad<@example.invalid'}),e=>e.status===400);
  assert.equal(f.mail.length,0);
  const invited=await f.staff.invite(a.id,{name:'Sally',email:'SALLY@example.invalid'});
  assert.equal(invited.plan,'Operator');assert.equal(invited.limit,1);assert.equal(invited.staff[0].status,'pending');
  assert.equal(Object.hasOwn(invited.staff[0],'password'),false);
  assert.equal(f.mail.length,1);assert.equal(f.mail[0].to,'sally@example.invalid');
  assert.equal(f.mail[0].idempotencyKey.startsWith('auth/staff_invite/'),true);
  const token=mailToken(f.mail[0]);assert.equal(f.mail[0].text.includes('/staff-invite#token='+token),true);
  const id=invited.staff[0].id;
  assert.equal((await f.invoke(f.auth.login,{email:'sally@example.invalid',password:'staff-pass'})).status,401);
  assert.throws(()=>f.sessions.create(row(f.database,id)),/Please sign in again/);
  await assert.rejects(f.staff.accept({token:f.tokenService.issue({userId:id,purpose:AUTH_TOKEN_PURPOSES.RESET_PASSWORD}).token,password:'staff-pass'}),e=>e.status===400);
  assert.deepEqual(await f.staff.accept({token,password:'staff-pass'}),{ok:true});
  assert.equal(f.staff.list(a.id).staff[0].status,'active');
  assert.equal((await f.invoke(f.auth.login,{email:'sally@example.invalid',password:'staff-pass'})).status,200);
  await assert.rejects(f.staff.accept({token,password:'other-pass'}),e=>e.status===400);
  assert.equal(f.staff.list(b.id).staff.length,0);
  assert.equal(row(f.database,id).ownerId,a.id);
});

test('the 24-hour deadline, resend and cancellation do not leave a usable old link',async t=>{
  const f=fixture(t),owner=f.addOwner('owner-a');
  const first=await f.staff.invite(owner.id,{name:'Casey',email:'casey@example.invalid'}),id=first.staff[0].id;
  const old=mailToken(f.mail.at(-1));
  await f.staff.resend(owner.id,id);const fresh=mailToken(f.mail.at(-1));
  assert.notEqual(old,fresh);
  await assert.rejects(f.staff.accept({token:old,password:'new-password'}),e=>e.status===400);
  f.advance(24*60*60*1000);
  await assert.rejects(f.staff.accept({token:fresh,password:'new-password'}),e=>e.status===400);
  assert.equal(f.staff.list(owner.id).staff[0].status,'pending');
  await f.staff.resend(owner.id,id);const cancelToken=mailToken(f.mail.at(-1));
  assert.deepEqual(f.staff.remove(owner.id,id,{pendingOnly:true}).staff,[]);
  await assert.rejects(f.staff.accept({token:cancelToken,password:'new-password'}),e=>e.status===400);
  assert.equal(row(f.database,id),undefined);
});

test('failed fake email delivery leaves a retryable pending invite and invalidates the failed link',async t=>{
  const f=fixture(t),owner=f.addOwner('owner-a');f.delivery.fail=true;
  await assert.rejects(f.staff.invite(owner.id,{name:'Pat',email:'pat@example.invalid'}),e=>e.status===503&&/could not be sent/.test(e.message));
  const pending=f.staff.list(owner.id).staff[0],failed=mailToken(f.mail[0]);
  assert.equal(pending.status,'pending');
  await assert.rejects(f.staff.accept({token:failed,password:'new-password'}),e=>e.status===400);
  f.delivery.fail=false;await f.staff.resend(owner.id,pending.id);
  assert.deepEqual(await f.staff.accept({token:mailToken(f.mail[1]),password:'new-password'}),{ok:true});
  assert.equal(f.staff.list(owner.id).staff[0].status,'active');
});

test('invite accepted just before expiry; changed email or owner binding cannot accept',async t=>{
  const f=fixture(t),a=f.addOwner('owner-a'),b=f.addOwner('owner-b');
  const one=await f.staff.invite(a.id,{name:'Lee',email:'lee@example.invalid'}),token=mailToken(f.mail.at(-1));
  f.advance(24*60*60*1000-1);
  assert.deepEqual(await f.staff.accept({token,password:'new-password'}),{ok:true});
  f.staff.remove(a.id,one.staff[0].id);
  const two=await f.staff.invite(a.id,{name:'Lee',email:'lee@example.invalid'}),changed=mailToken(f.mail.at(-1));
  f.database.prepare("UPDATE users SET email='else@example.invalid' WHERE id=?").run(two.staff[0].id);
  await assert.rejects(f.staff.accept({token:changed,password:'new-password'}),e=>e.status===400);
  assert.equal(f.database.prepare('SELECT status FROM staffInvitations WHERE staffId=?').get(two.staff[0].id).status,'pending');
  f.staff.remove(a.id,two.staff[0].id);
  const three=await f.staff.invite(a.id,{name:'Lee',email:'lee@example.invalid'}),rebound=mailToken(f.mail.at(-1));
  f.database.prepare('UPDATE users SET ownerId=? WHERE id=?').run(b.id,three.staff[0].id);
  await assert.rejects(f.staff.accept({token:rebound,password:'new-password'}),e=>e.status===400);
  assert.equal(f.database.prepare('SELECT status FROM staffInvitations WHERE staffId=?').get(three.staff[0].id).status,'pending');
  assert.throws(()=>f.sessions.create(row(f.database,three.staff[0].id)));
  f.database.prepare('UPDATE users SET ownerId=? WHERE id=?').run(a.id,three.staff[0].id);
  assert.equal(f.staff.list(b.id).staff.length,0);
  assert.throws(()=>f.sessions.create(row(f.database,two.staff[0].id)));
});

test('Scale excess staff is suspended in stable seat order on Operator and restored on Scale',async t=>{
  const f=fixture(t),owner=f.addOwner('owner-a','Scale');
  const first=await f.staff.invite(owner.id,{name:'One',email:'one@example.invalid'});
  await f.staff.accept({token:mailToken(f.mail.at(-1)),password:'new-password'});
  const second=await f.staff.invite(owner.id,{name:'Two',email:'two@example.invalid'});
  await f.staff.accept({token:mailToken(f.mail.at(-1)),password:'new-password'});
  assert.equal(f.staff.list(owner.id).staff.length,2);
  f.database.prepare("UPDATE users SET plan='Operator' WHERE id=?").run(owner.id);
  const seats=f.staff.list(owner.id).staff;
  assert.deepEqual(seats.map(row=>row.status),['active','suspended']);
  assert.equal(f.sessions.create(row(f.database,seats[0].id)).token.length>20,true);
  assert.throws(()=>f.sessions.create(row(f.database,seats[1].id)));
  f.database.prepare("UPDATE users SET plan='Scale' WHERE id=?").run(owner.id);
  assert.deepEqual(f.staff.list(owner.id).staff.map(row=>row.status),['active','active']);
  assert.equal(f.sessions.create(row(f.database,seats[1].id)).token.length>20,true);
});

test('plan limits, downgrade suspension, restoration and immediate removal revoke staff sessions',async t=>{
  const f=fixture(t),owner=f.addOwner('owner-a','QuoteDone');
  const first=await f.staff.invite(owner.id,{name:'Sam',email:'sam@example.invalid'}),id=first.staff[0].id;
  await assert.rejects(f.staff.invite(owner.id,{name:'Extra',email:'extra@example.invalid'}),e=>e.status===409&&/no available staff seats/i.test(e.message));
  assert.equal(f.mail.length,1);
  await f.staff.accept({token:mailToken(f.mail[0]),password:'new-password'});
  await assert.rejects(f.staff.resend(owner.id,id),e=>e.status===409);
  const staffSession=f.sessions.create(row(f.database,id)),ownerSession=f.sessions.create(owner);
  assert.equal(f.sessions.validateAccess(jwt.verify(staffSession.token,SECRET)).id,id);
  f.database.prepare("UPDATE users SET plan='Starter' WHERE id=?").run(owner.id);
  assert.equal(f.staff.list(owner.id).staff[0].status,'suspended');
  assert.match(f.staff.list(owner.id).staff[0].reason,/plan/i);
  assert.throws(()=>f.sessions.validateAccess(jwt.verify(staffSession.token,SECRET)));
  assert.throws(()=>f.sessions.refresh(staffSession.refreshToken));
  await assert.rejects(f.staff.invite(owner.id,{name:'New',email:'new@example.invalid'}),e=>e.status===403&&/Starter includes no staff logins/.test(e.message));
  f.database.prepare("UPDATE users SET plan='QuoteDone' WHERE id=?").run(owner.id);
  assert.equal(f.staff.list(owner.id).staff[0].status,'active');
  assert.equal(f.sessions.validateAccess(jwt.verify(staffSession.token,SECRET)).id,id);
  assert.deepEqual(f.staff.remove(owner.id,id).staff,[]);
  assert.throws(()=>f.sessions.validateAccess(jwt.verify(staffSession.token,SECRET)));
  assert.throws(()=>f.sessions.refresh(staffSession.refreshToken));
  assert.equal(f.sessions.validateAccess(jwt.verify(ownerSession.token,SECRET)).id,owner.id);
});

test('tenant-bound staff routes deny staff management and isolate customers',async t=>{
  const f=fixture(t),a=f.addOwner('owner-a'),b=f.addOwner('owner-b');
  const invited=await f.staff.invite(a.id,{name:'Sally',email:'sally@example.invalid'});
  await f.staff.accept({token:mailToken(f.mail[0]),password:'new-password'});
  const staffId=invited.staff[0].id,staffToken=f.sessions.create(row(f.database,staffId)).token;
  const ownerToken=f.sessions.create(a).token,otherToken=f.sessions.create(b).token;
  f.database.prepare(`INSERT INTO customers(id,ownerId,phoneE164,name,createdAt)
    VALUES('customer-a','owner-a','+15550000001','Alice','2026-10-09'),('customer-b','owner-b','+15550000002','Bob','2026-10-09')`).run();
  const routes=[],app={};for(const method of ['get','post','delete'])app[method]=(path,...handlers)=>routes.push({method:method.toUpperCase(),path,handlers});
  installStaffRoutes(app,{service:f.staff,ownerQuery:f.query,requireAuth:roles=>requireAuth(roles,{database:f.database,
    sessionService:f.sessions,verifyToken:token=>jwt.verify(token,SECRET)}),asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),environment:env});
  async function request(path,token,method='GET',body) {
    const url=new URL(path,'https://app.example.invalid');
    const route=routes.find(entry=>entry.method===method&&new RegExp('^'+entry.path.replace(/:[A-Za-z]+/g,'[^/]+')+'$').test(url.pathname));
    if(!route)return {status:404,body:{error:'Not found'}};
    const names=[...route.path.matchAll(/:([A-Za-z]+)/g)].map(match=>match[1]);
    const values=new RegExp('^'+route.path.replace(/:[A-Za-z]+/g,'([^/]+)')+'$').exec(url.pathname)?.slice(1)||[];
    const req={method,path:url.pathname,route:{path:route.path},params:Object.fromEntries(names.map((key,index)=>[key,values[index]])),
      query:Object.fromEntries(url.searchParams),body,headers:{origin:env.CLIENT_URL,...(token?{authorization:'Bearer '+token}:{})}};
    return new Promise((resolve,reject)=>{
      const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(payload){resolve({status:this.statusCode,body:payload});return this;}};
      let index=0;const next=error=>{if(error)return reject(error);const fn=route.handlers[index++];if(!fn)return reject(Error('No route response'));
        try{Promise.resolve(fn(req,res,next)).catch(reject);}catch(failure){reject(failure);}};next();
    });
  }
  assert.equal((await request('/api/team/staff',staffToken)).status,403);
  assert.equal((await request('/api/team/staff/invite',staffToken,'POST',{name:'Eve',email:'eve@example.invalid'})).status,403);
  assert.equal((await request('/api/team/staff/'+staffId,otherToken,'DELETE')).status,404);
  assert.equal((await request('/api/team/staff',ownerToken)).body.staff[0].email,'sally@example.invalid');
  assert.deepEqual((await request('/api/customers',staffToken)).body.customers.map(row=>row.name),['Alice']);
  assert.deepEqual((await request('/api/customers',otherToken)).body.customers.map(row=>row.name),['Bob']);
  assert.equal((await request('/api/customers?ownerId=owner-b',staffToken)).status,403);
  assert.equal((await request('/api/customers')).status,401);
  assert.equal((await request('/api/auth/staff-invite/accept',null,'POST',{token:'bad',password:'new-password'})).status,400);
  assert.equal((await request('/api/team/staff/'+staffId,ownerToken,'DELETE')).status,200);
  assert.equal((await request('/api/customers',staffToken)).status,401);
  const invite=await request('/api/team/staff/invite',ownerToken,'POST',{name:'New',email:'new@example.invalid'});
  assert.equal(invite.status,201);assert.equal(invite.body.staff[0].status,'pending');
  assert.equal((await request('/api/team/staff/'+invite.body.staff[0].id+'/invite',ownerToken,'DELETE')).status,200);
  f.database.prepare("UPDATE users SET plan='Starter' WHERE id=?").run(a.id);
  const starter=await request('/api/team/staff/invite',ownerToken,'POST',{name:'New',email:'new@example.invalid'});
  assert.equal(starter.status,403);assert.match(starter.body.error,/Starter includes no staff logins/);
});

test('existing durable account tokens survive a purpose CHECK upgrade, and consumed tokens remain spent',t=>{
  const db=new Database(':memory:');t.after(()=>db.close());
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY)');db.exec("INSERT INTO users VALUES('owner-a')");
  db.exec(`CREATE TABLE authTokens(tokenHash TEXT PRIMARY KEY CHECK(length(tokenHash)=64),userId TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','reset_password')),
    expiresAt TEXT NOT NULL,createdAt TEXT NOT NULL,consumedAt TEXT,FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
    CHECK(expiresAt>createdAt),CHECK(consumedAt IS NULL OR consumedAt>=createdAt)) STRICT`);
  db.prepare("INSERT INTO authTokens VALUES(?, 'owner-a', 'verify_email', ?, ?, NULL)").run('a'.repeat(64),'2026-10-11T00:00:00.000Z','2026-10-09T00:00:00.000Z');
  db.prepare("INSERT INTO authTokens VALUES(?, 'owner-a', 'reset_password', ?, ?, ?)").run('b'.repeat(64),'2026-10-11T00:00:00.000Z','2026-10-09T00:00:00.000Z','2026-10-09T01:00:00.000Z');
  installAuthTokenSchema(db);installAuthTokenSchema(db);
  assert.deepEqual(db.prepare('SELECT purpose,consumedAt FROM authTokens ORDER BY tokenHash').all(),[
    {purpose:'verify_email',consumedAt:null},{purpose:'reset_password',consumedAt:'2026-10-09T01:00:00.000Z'}]);
  const token=createAuthTokenService(db,{clock:()=>new Date('2026-10-09T12:00:00.000Z')}).issue({userId:'owner-a',purpose:AUTH_TOKEN_PURPOSES.STAFF_INVITE});
  assert.ok(token.token.length>=43);
  assert.throws(()=>db.prepare("UPDATE authTokens SET consumedAt=NULL WHERE tokenHash=?").run('b'.repeat(64)),/irreversible/);
});

test('staff queues a saved quote once through the fake email provider, with no cross-tenant or recipient substitution',async t=>{
  const f=fixture(t),a=f.addOwner('owner-a','QuoteDone'),b=f.addOwner('owner-b','QuoteDone');
  for(const name of ['calls','quotes','quoteSubmissions','outboxEvents'])f.database.exec(CREATE_TABLE_STATEMENTS.find(sql=>sql.includes('CREATE TABLE IF NOT EXISTS '+name+' ')));
  installQuoteEmailSchema(f.database);
  const result={resultType:'INSTANT_ESTIMATE_READY',currency:'USD',lowEstimate:60,highEstimate:60,
    priceUnit:'per job',disclaimer:'[SYNTHETIC] Measured mowing only.',taxTreatment:'No tax added.'};
  f.database.prepare(`INSERT INTO quotes(id,ownerId,serviceType,resultJson,status,createdAt)
    VALUES('quote-a','owner-a','Lawn mowing',?,'INSTANT','2026-10-09')`).run(JSON.stringify({customerResult:result,
    originalSubmission:{contact:{email:'customer@example.invalid'}},privateRate:'PRIVATE_MUST_NOT_LEAK'}));
  f.database.prepare(`INSERT INTO quotes(id,ownerId,serviceType,resultJson,status,createdAt)
    VALUES('quote-b','owner-b','Lawn mowing',?,'INSTANT','2026-10-09')`).run(JSON.stringify({customerResult:result,
    originalSubmission:{contact:{email:'other@example.invalid'}}}));
  const mail=[];const quoteEmail=createQuoteEmailService({database:f.database,ownerQuery:f.query,
    environment:{PUBLIC_BASE_URL:'https://app.example.invalid',EMAIL_FROM:'quotes@example.invalid'},
    provider:{ready:()=>true,send:async message=>{mail.push(message);return {accepted:true,id:'SYNTHETIC_EMAIL_1'};}},clock:()=>Date.parse('2026-10-09T12:00:00Z')});
  assert.throws(()=>quoteEmail.enqueueSavedQuote({ownerId:a.id,quoteId:'quote-b',email:'other@example.invalid',customerConfirmed:true}),e=>e.statusCode===404);
  assert.throws(()=>quoteEmail.enqueueSavedQuote({ownerId:a.id,quoteId:'quote-a',email:'changed@example.invalid',customerConfirmed:true}),e=>e.code==='QUOTE_EMAIL_RECIPIENT_UNCONFIRMED');
  assert.throws(()=>quoteEmail.enqueueSavedQuote({ownerId:a.id,quoteId:'quote-a',email:'customer@example.invalid',customerConfirmed:false}),e=>e.statusCode===400);
  const invited=await f.staff.invite(a.id,{name:'Staff',email:'staff@example.invalid'});
  await f.staff.accept({token:mailToken(f.mail.at(-1)),password:'new-password'});
  const staffToken=f.sessions.create(row(f.database,invited.staff[0].id)).token,otherToken=f.sessions.create(b).token;
  const routes=[],app={get:(path,...handlers)=>routes.push({method:'GET',path,handlers}),
    post:(path,...handlers)=>routes.push({method:'POST',path,handlers}),
    delete:(path,...handlers)=>routes.push({method:'DELETE',path,handlers})};
  installStaffRoutes(app,{service:f.staff,ownerQuery:f.query,quoteEmail,environment:env,
    requireAuth:roles=>requireAuth(roles,{database:f.database,sessionService:f.sessions,verifyToken:token=>jwt.verify(token,SECRET)}),
    requirePriceBookPlan:(_req,_res,next)=>next(),asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next)});
  async function sendViaRoute(token,quoteId,address) {
    const route=routes.find(row=>row.path==='/api/quotes/:id/email');
    const req={method:'POST',path:'/api/quotes/'+quoteId,route:{path:route.path},params:{id:quoteId},
      body:{email:address,customerConfirmed:true},headers:{authorization:'Bearer '+token,origin:env.CLIENT_URL}};
    return new Promise((resolve,reject)=>{const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},
      json(body){resolve({status:this.statusCode,body});return this;}};let index=0;
      const next=error=>{if(error)return reject(error);const handler=route.handlers[index++];
        if(!handler)return reject(Error('No route response'));try{Promise.resolve(handler(req,res,next)).catch(reject);}catch(e){reject(e);}};next();});
  }
  assert.equal((await sendViaRoute(otherToken,'quote-a','customer@example.invalid')).status,404);
  assert.equal((await sendViaRoute(staffToken,'quote-a','changed@example.invalid')).status,409);
  const sent=await sendViaRoute(staffToken,'quote-a','customer@example.invalid');assert.equal(sent.status,200);
  const queued=sent.body;
  assert.equal(queued.status,'PENDING');
  assert.deepEqual(quoteEmail.enqueueSavedQuote({ownerId:a.id,quoteId:'quote-a',email:'customer@example.invalid',customerConfirmed:true}),queued);
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE ownerId='owner-a'").get().n,1);
  assert.equal(await quoteEmail.processOne(a.id),true);assert.equal(mail.length,1);
  assert.equal(mail[0].to,'customer@example.invalid');assert.match(mail[0].text,/\$60/);
  assert.match(mail[0].text,/Measured mowing only/);assert.doesNotMatch(mail[0].text,/PRIVATE_MUST_NOT_LEAK/);
  assert.equal(f.database.prepare("SELECT COUNT(*) n FROM outboxEvents WHERE ownerId='owner-b'").get().n,0);
  assert.equal(quoteEmail.state(a.id,'saved-quote:quote-a').status,'ACCEPTED');
});
