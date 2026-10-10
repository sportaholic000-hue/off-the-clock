import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import {staffLimit} from './staffSeats.js';

export const AUTH_SESSION_POLICY = Object.freeze({accessMs:15*60*1000, absoluteMs:8*60*60*1000});
export class AuthSessionError extends Error {
  constructor(code='SESSION_INVALID') {super(code==='SESSION_STORE_UNAVAILABLE'?'Authentication service is temporarily unavailable.':'Please sign in again.');this.name='AuthSessionError';this.code=code;}
}
export function installAuthSessionSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS authSessions (
      id TEXT PRIMARY KEY CHECK(length(id)=43),
      userId TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','staff','admin')),
      credentialFingerprint TEXT NOT NULL CHECK(length(credentialFingerprint)=64),
      createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, revokedAt INTEGER,
      CHECK(expiresAt>createdAt), CHECK(revokedAt IS NULL OR revokedAt>=createdAt)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS authSessions_user_active ON authSessions(userId,role) WHERE revokedAt IS NULL;
    CREATE TABLE IF NOT EXISTS authRefreshTokens (
      tokenHash TEXT PRIMARY KEY CHECK(length(tokenHash)=64),
      sessionId TEXT NOT NULL REFERENCES authSessions(id) ON DELETE CASCADE,
      createdAt INTEGER NOT NULL, consumedAt INTEGER,
      CHECK(consumedAt IS NULL OR consumedAt>=createdAt)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS authRefreshTokens_session ON authRefreshTokens(sessionId);
    CREATE TABLE IF NOT EXISTS staffInvitations (
      staffId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      ownerId TEXT NOT NULL REFERENCES users(id),
      email TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','active')),
      createdAt TEXT NOT NULL,
      acceptedAt TEXT
    ) STRICT;
    CREATE INDEX IF NOT EXISTS staffInvitations_owner ON staffInvitations(ownerId);
  `);
}
export function authImmediate(database, work) {
  if(typeof database.transaction==='function'){const tx=database.transaction(work);return typeof tx.immediate==='function'?tx.immediate():tx();}
  database.exec('BEGIN IMMEDIATE');
  try {const result=work();database.exec('COMMIT');return result;} catch(error){try{database.exec('ROLLBACK');}catch{}throw error;}
}
export function isSessionSecret(value) {
  return typeof value==='string' && /^[A-Za-z0-9_-]{43}$/.test(value) && Buffer.from(value,'base64url').toString('base64url')===value;
}
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
export function createAuthSessionService(database,{environment=process.env,clock=()=>new Date(),randomBytes=crypto.randomBytes,signAccess}={}) {
  const timestamp=()=>{const value=new Date(clock()).getTime();if(!Number.isSafeInteger(value))throw new AuthSessionError('SESSION_STORE_UNAVAILABLE');return value;};
  const fingerprint=user=>crypto.createHmac('sha256',environment.JWT_SECRET||'').update(JSON.stringify([user.id,user.ownerId||null,user.role,user.email,user.passwordHash])).digest('hex');
  function principal(userId,role) {
    if(role==='admin'){
      if(userId!=='admin'||!environment.ADMIN_EMAIL||!environment.ADMIN_PASSWORD_HASH)throw new AuthSessionError();
      return {id:'admin',role:'admin',email:environment.ADMIN_EMAIL,passwordHash:environment.ADMIN_PASSWORD_HASH};
    }
    const user=database.prepare(`SELECT account.*,parent.role AS ownerRole,
      parent.plan AS ownerPlan,
      invitation.status AS inviteStatus,invitation.ownerId AS inviteOwnerId,invitation.email AS inviteEmail,
      (SELECT COUNT(*) FROM users seat WHERE seat.ownerId=account.ownerId AND seat.role='staff'
        AND (seat.createdAt<account.createdAt OR (seat.createdAt=account.createdAt AND seat.id<account.id))) AS seatIndex
      FROM users account LEFT JOIN users parent ON parent.id=account.ownerId
      LEFT JOIN staffInvitations invitation ON invitation.staffId=account.id WHERE account.id=?`).get(userId);
    if(!user || user.dataDeletedAt || !['owner','staff'].includes(role) || user.role!==role || (role==='staff'&&(!user.ownerId||user.ownerRole!=='owner')))throw new AuthSessionError();
    if(role==='staff' && (user.inviteStatus==='pending' ||
      (user.inviteStatus && (user.inviteOwnerId!==user.ownerId||user.inviteEmail!==user.email)) ||
      user.seatIndex>=staffLimit(user.ownerPlan)))throw new AuthSessionError();
    return user;
  }
  function secret() {const bytes=randomBytes(32);if(!bytes||bytes.length!==32)throw new AuthSessionError('SESSION_STORE_UNAVAILABLE');return Buffer.from(bytes).toString('base64url');}
  function access(row,user,at) {
    const payload={sub:user.id,role:user.role,email:user.email,sid:row.id,iat:Math.floor(at/1000),exp:Math.floor(Math.min(row.expiresAt,at+AUTH_SESSION_POLICY.accessMs)/1000),
      ...(user.role==='admin'?{authSource:'environment-admin'}:{})};
    const token=signAccess?signAccess(payload,user):jwt.sign(payload,environment.JWT_SECRET,{algorithm:'HS256'});
    if(typeof token!=='string'||!token)throw new AuthSessionError('SESSION_STORE_UNAVAILABLE');
    return {sessionId:row.id,token,accessExpiresAt:new Date(payload.exp*1000).toISOString(),sessionExpiresAt:new Date(row.expiresAt).toISOString()};
  }
  function current(row,at) {
    if(!row || row.revokedAt!==null || row.expiresAt<=at)throw new AuthSessionError();
    const user=principal(row.userId,row.role);
    if(fingerprint(user)!==row.credentialFingerprint)throw new AuthSessionError();
    return user;
  }
  function safe(work) {try{return work();}catch(e){if(e instanceof AuthSessionError)throw e;throw new AuthSessionError('SESSION_STORE_UNAVAILABLE');}}
  function create(user) {
    return safe(()=>authImmediate(database,()=>{
      const at=timestamp(),live=principal(user.id,user.role);
      // Password comparison may have yielded while another request reset credentials.
      if(user.passwordHash!==live.passwordHash || user.email!==live.email)throw new AuthSessionError();
      database.prepare('DELETE FROM authSessions WHERE expiresAt < ?').run(at-86400000);
      const row={id:secret(),userId:live.id,role:live.role,credentialFingerprint:fingerprint(live),createdAt:at,expiresAt:at+AUTH_SESSION_POLICY.absoluteMs,revokedAt:null};
      database.prepare('INSERT INTO authSessions(id,userId,role,credentialFingerprint,createdAt,expiresAt) VALUES(?,?,?,?,?,?)').run(row.id,row.userId,row.role,row.credentialFingerprint,at,row.expiresAt);
      const refreshToken=secret();
      database.prepare('INSERT INTO authRefreshTokens(tokenHash,sessionId,createdAt) VALUES(?,?,?)').run(hash(refreshToken),row.id,at);
      return {...access(row,live,at),refreshToken};
    }));
  }
  function validateAccess(payload) {
    return safe(()=>{
      if(!payload || !isSessionSecret(payload.sid) || typeof payload.sub!=='string')throw new AuthSessionError();
      const at=timestamp(),row=database.prepare('SELECT * FROM authSessions WHERE id=? AND userId=? AND role=?').get(payload.sid,payload.sub,payload.role);
      const user=current(row,at);
      if(payload.email!==user.email || !Number.isSafeInteger(payload.exp) || payload.exp*1000<=at ||
        !Number.isSafeInteger(payload.iat) || payload.iat*1000>at+1000 ||
        (user.role==='admin'&&payload.authSource!=='environment-admin'))throw new AuthSessionError();
      return user;
    });
  }
  function refresh(token,expectedClaims) {
    return safe(()=>authImmediate(database,()=>{
      if(!isSessionSecret(token))throw new AuthSessionError();
      const at=timestamp(),receipt=database.prepare('SELECT * FROM authRefreshTokens WHERE tokenHash=?').get(hash(token));
      if(!receipt)throw new AuthSessionError();
      const row=database.prepare('SELECT * FROM authSessions WHERE id=?').get(receipt.sessionId),user=current(row,at);
      if(expectedClaims && (expectedClaims.sid!==row.id||expectedClaims.sub!==row.userId||expectedClaims.role!==row.role))throw new AuthSessionError();
      if(receipt.consumedAt!==null)throw new AuthSessionError('SESSION_REFRESH_CONFLICT');
      const claimed=database.prepare('UPDATE authRefreshTokens SET consumedAt=? WHERE tokenHash=? AND consumedAt IS NULL').run(at,hash(token));
      if(Number(claimed.changes)!==1)throw new AuthSessionError('SESSION_REFRESH_CONFLICT');
      const refreshToken=secret();
      database.prepare('INSERT INTO authRefreshTokens(tokenHash,sessionId,createdAt) VALUES(?,?,?)').run(hash(refreshToken),row.id,at);
      return {...access(row,user,at),refreshToken};
    }));
  }
  function revokeAll(userId) {return safe(()=>database.prepare('UPDATE authSessions SET revokedAt=? WHERE userId=? AND revokedAt IS NULL').run(timestamp(),userId).changes);}
  function cookieMatches(token,payload) {
    return safe(()=>{if(!isSessionSecret(token)||!payload)return false;
      const row=database.prepare('SELECT sessionId FROM authRefreshTokens WHERE tokenHash=?').get(hash(token));
      return row?.sessionId===payload.sid;});
  }
  function revoke(token,payload) {
    return safe(()=>authImmediate(database,()=>{
      const ids=new Set();
      if(isSessionSecret(token)){const row=database.prepare('SELECT sessionId FROM authRefreshTokens WHERE tokenHash=?').get(hash(token));if(row)ids.add(row.sessionId);}
      if(payload && isSessionSecret(payload.sid) && typeof payload.sub==='string'){
        const row=database.prepare('SELECT id FROM authSessions WHERE id=? AND userId=? AND role=?').get(payload.sid,payload.sub,payload.role);if(row)ids.add(row.id);
      }
      const at=timestamp();for(const id of ids)database.prepare('UPDATE authSessions SET revokedAt=? WHERE id=? AND revokedAt IS NULL').run(at,id);
      return ids.size;
    }));
  }
  return Object.freeze({create,refresh,validateAccess,revoke,revokeAll,cookieMatches});
}
