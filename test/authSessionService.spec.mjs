import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import jwt from 'jsonwebtoken';
import {createAuthSessionService,installAuthSessionSchema,AuthSessionError,AUTH_SESSION_POLICY} from '../server/src/authSessionService.js';
import {createAuthRateLimiter,installAuthLimitSchema} from '../server/src/authRateLimitService.js';
function cleanup(t,dir){t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(dir,{recursive:true,force:true});});}
const env={JWT_SECRET:'SYNTHETIC-session-secret-'.repeat(3),ADMIN_EMAIL:'admin@example.invalid',ADMIN_PASSWORD_HASH:'SYNTHETIC-admin-hash'};
function setup(t,{file=':memory:',create=true}={}) {
 const db=new Database(file);db.pragma('foreign_keys=ON');db.pragma('busy_timeout=5000');t.after(()=>db.close());
 if(create){db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,ownerId TEXT,role TEXT,email TEXT,passwordHash TEXT)');installAuthSessionSchema(db);installAuthLimitSchema(db);}
 let time=Date.parse('2026-09-30T00:00:00Z');const clock=()=>new Date(time);
 const sessions=createAuthSessionService(db,{environment:env,clock}), limiter=createAuthRateLimiter(db,{secret:env.JWT_SECRET,clock});
 const user=(id='owner-a',role='owner',ownerId=null)=>{const value={id,role,ownerId,email:id+'@example.invalid',passwordHash:'SYNTHETIC-hash-'+id};db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,ownerId,role,value.email,value.passwordHash);return value;};
 const claims=token=>jwt.verify(token,env.JWT_SECRET,{algorithms:['HS256'],clockTimestamp:Math.floor(time/1000)});
 return {db,user,sessions,limiter,claims,advance:ms=>{time+=ms;},clock};
}
const invalid=fn=>assert.throws(fn,e=>e instanceof AuthSessionError&&e.code==='SESSION_INVALID');
test('session creates short access token, eight-hour absolute expiry and hashed refresh storage',t=>{
 const f=setup(t),u=f.user(),s=f.sessions.create(u),p=f.claims(s.token);
 assert.equal(p.exp-p.iat,900);assert.equal(Date.parse(s.sessionExpiresAt)-p.iat*1000,AUTH_SESSION_POLICY.absoluteMs);
 assert.equal(f.sessions.validateAccess(p).id,u.id);
 const saved=f.db.prepare('SELECT * FROM authRefreshTokens').get();assert.equal(saved.tokenHash.length,64);
 assert.equal(JSON.stringify(saved).includes(s.refreshToken),false);assert.equal(Object.hasOwn(p,'passwordHash'),false);
});
test('access and refresh expire at exact boundaries; refresh never extends absolute lifetime',t=>{
 const f=setup(t),u=f.user(),s=f.sessions.create(u),p=f.claims(s.token);
 f.advance(AUTH_SESSION_POLICY.accessMs);invalid(()=>f.sessions.validateAccess(p));
 const r=f.sessions.refresh(s.refreshToken);assert.equal(r.sessionExpiresAt,s.sessionExpiresAt);
 f.advance(AUTH_SESSION_POLICY.absoluteMs-AUTH_SESSION_POLICY.accessMs);invalid(()=>f.sessions.refresh(r.refreshToken));
});
test('refresh rotates one-use secret; replay conflict does not revoke a successful concurrent refresh',t=>{
 const f=setup(t),s=f.sessions.create(f.user()),r=f.sessions.refresh(s.refreshToken);
 assert.notEqual(r.refreshToken,s.refreshToken);
 assert.throws(()=>f.sessions.refresh(s.refreshToken),e=>e.code==='SESSION_REFRESH_CONFLICT');
 assert.equal(f.sessions.validateAccess(f.claims(r.token)).id,'owner-a');
 assert.ok(f.sessions.refresh(r.refreshToken).token);
});
test('logout revokes only the selected session; password reset revokes all user sessions',t=>{
 const f=setup(t),u=f.user(),a=f.sessions.create(u),b=f.sessions.create(u);
 f.sessions.revoke(a.refreshToken,f.claims(a.token));invalid(()=>f.sessions.validateAccess(f.claims(a.token)));
 assert.equal(f.sessions.validateAccess(f.claims(b.token)).id,u.id);
 f.sessions.revokeAll(u.id);invalid(()=>f.sessions.validateAccess(f.claims(b.token)));invalid(()=>f.sessions.refresh(b.refreshToken));
});
test('credential changes invalidate all old access/refresh tokens and reject stale login snapshots',t=>{
 const f=setup(t),u=f.user(),s=f.sessions.create(u),p=f.claims(s.token);
 f.db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run('SYNTHETIC-new-hash',u.id);
 invalid(()=>f.sessions.validateAccess(p));invalid(()=>f.sessions.refresh(s.refreshToken));invalid(()=>f.sessions.create(u));
 const next=f.sessions.create({...u,passwordHash:'SYNTHETIC-new-hash'});assert.equal(f.sessions.validateAccess(f.claims(next.token)).id,u.id);
});
test('password mutation and session revocation roll back together on transaction failure',t=>{
 const f=setup(t),u=f.user(),s=f.sessions.create(u);
 assert.throws(f.db.transaction(()=>{f.db.prepare('UPDATE users SET passwordHash=? WHERE id=?').run('bad',u.id);f.sessions.revokeAll(u.id);throw Error('SYNTHETIC rollback');}));
 assert.equal(f.sessions.validateAccess(f.claims(s.token)).id,u.id);
});
for(const mutation of ['delete','role','email'])test(mutation+' change cannot retain an owner session',t=>{
 const f=setup(t),u=f.user(),s=f.sessions.create(u),p=f.claims(s.token);
 if(mutation==='delete')f.db.prepare('DELETE FROM users WHERE id=?').run(u.id);
 else if(mutation==='role')f.db.prepare("UPDATE users SET role='admin' WHERE id=?").run(u.id);
 else f.db.prepare("UPDATE users SET email='changed@example.invalid' WHERE id=?").run(u.id);
 invalid(()=>f.sessions.validateAccess(p));invalid(()=>f.sessions.refresh(s.refreshToken));
});
test('staff reparenting or missing owner cannot carry a session to another tenant',t=>{
 const f=setup(t);f.user('one');f.user('two');const u=f.user('staff','staff','one'),s=f.sessions.create(u);
 f.db.prepare("UPDATE users SET ownerId='two' WHERE id='staff'").run();invalid(()=>f.sessions.validateAccess(f.claims(s.token)));
 f.db.prepare("UPDATE users SET role='staff' WHERE id='two'").run();invalid(()=>f.sessions.create({...u,ownerId:'two'}));
});
test('admin sessions bind to current environment credentials and explicit admin provenance',t=>{
 const f=setup(t),admin={id:'admin',role:'admin',email:env.ADMIN_EMAIL,passwordHash:env.ADMIN_PASSWORD_HASH},s=f.sessions.create(admin),p=f.claims(s.token);
 assert.equal(f.sessions.validateAccess(p).role,'admin');invalid(()=>f.sessions.validateAccess({...p,authSource:undefined}));
 const changed=createAuthSessionService(f.db,{environment:{...env,ADMIN_PASSWORD_HASH:'SYNTHETIC-changed'},clock:f.clock});invalid(()=>changed.validateAccess(p));
});
test('stateless, malformed or transplanted JWT claims never authorize a session',t=>{
 const f=setup(t),a=f.user(),b=f.user('owner-b'),s=f.sessions.create(a),p=f.claims(s.token);
 for(const claims of [{...p,sid:undefined},{...p,sub:b.id},{...p,role:'admin'},{...p,email:b.email},{...p,sid:'bad'},{...p,iat:p.iat+100000}])invalid(()=>f.sessions.validateAccess(claims));
});
test('session and refresh receipts survive service restart and share a single winner across SQLite connections',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-auth-session-'));
 const file=path.join(dir,'sessions.sqlite'),a=setup(t,{file}),b=setup(t,{file,create:false}),s=a.sessions.create(a.user());cleanup(t,dir);
 const r=b.sessions.refresh(s.refreshToken);assert.throws(()=>a.sessions.refresh(s.refreshToken),e=>e.code==='SESSION_REFRESH_CONFLICT');
 assert.equal(a.sessions.validateAccess(a.claims(r.token)).id,'owner-a');
 a.sessions.revokeAll('owner-a');invalid(()=>b.sessions.refresh(r.refreshToken));
});
test('signing failure rolls back both the session and refresh receipt',t=>{
 const f=setup(t),u=f.user(),sessions=createAuthSessionService(f.db,{environment:env,clock:f.clock,signAccess:()=>{throw Error('SYNTHETIC signing unavailable');}});
 assert.throws(()=>sessions.create(u),e=>e.code==='SESSION_STORE_UNAVAILABLE');
 assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM authSessions').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM authRefreshTokens').get().n,0);
});
test('limiter persists reservations across services; successful login release does not consume failure allowance',t=>{
 const f=setup(t),other=createAuthRateLimiter(f.db,{secret:env.JWT_SECRET,clock:f.clock});
 const first=f.limiter.take('login','SYNTHETIC-IP',5);assert.ok(first);other.release(first);
 for(let i=0;i<5;i++)assert.ok((i%2?other:f.limiter).take('login','SYNTHETIC-IP',5));
 assert.equal(other.take('login','SYNTHETIC-IP',5),null);
 const row=f.db.prepare('SELECT * FROM authRateLimits').get();assert.equal(JSON.stringify(row).includes('SYNTHETIC-IP'),false);
 f.advance(900000);assert.ok(other.take('login','SYNTHETIC-IP',5));
});
test('old-window completion cannot release a new-window reservation',t=>{
 const f=setup(t),old=f.limiter.take('login','IP',1);f.advance(900000);
 assert.ok(f.limiter.take('login','IP',1));f.limiter.release(old);assert.equal(f.limiter.take('login','IP',1),null);
});
test('limiter capacity is bounded and expired records are reclaimed',t=>{
 const f=setup(t),limiter=createAuthRateLimiter(f.db,{secret:env.JWT_SECRET,clock:f.clock,maximumKeys:2});
 assert.ok(limiter.take('reset','IP-one',1));assert.ok(limiter.take('reset','IP-two',1));assert.equal(limiter.take('reset','IP-three',1),null);
 f.advance(900000);assert.ok(limiter.take('reset','IP-three',1));assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM authRateLimits').get().n,1);
});
test('limiter shares counters across actual database connections',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-auth-limit-'));
 const file=path.join(dir,'limits.sqlite'),a=setup(t,{file}),b=setup(t,{file,create:false});cleanup(t,dir);
 assert.ok(a.limiter.take('recover','IP',1));assert.equal(b.limiter.take('recover','IP',1),null);
});
