import crypto from 'node:crypto';
import {authImmediate} from './authSessionService.js';
export class AuthLimitError extends Error {constructor(){super('Authentication service is temporarily unavailable.');this.name='AuthLimitError';}}
export function installAuthLimitSchema(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS authRateLimits(
    keyHash TEXT PRIMARY KEY CHECK(length(keyHash)=64), windowStartedAt INTEGER NOT NULL,
    windowMs INTEGER NOT NULL CHECK(windowMs>0), count INTEGER NOT NULL CHECK(count>=0)
  ) STRICT;`);
}
export function createAuthRateLimiter(database,{secret=process.env.JWT_SECRET,clock=()=>new Date(),maximumKeys=10000}={}) {
  if(typeof secret!=='string'||!secret||!Number.isSafeInteger(maximumKeys)||maximumKeys<1)throw new AuthLimitError();
  function take(scope,identity,maximum,windowMs=900000) {
    try {
      if(typeof scope!=='string'||typeof identity!=='string'||identity.length>512||!Number.isSafeInteger(maximum)||maximum<1||!Number.isSafeInteger(windowMs)||windowMs<1)throw new AuthLimitError();
      const now=new Date(clock()).getTime();if(!Number.isSafeInteger(now))throw new AuthLimitError();
      const keyHash=crypto.createHmac('sha256',secret).update('auth-limit-v1\0'+scope+'\0'+identity).digest('hex');
      return authImmediate(database,()=>{
        database.prepare('DELETE FROM authRateLimits WHERE windowStartedAt+windowMs<=?').run(now);
        const row=database.prepare('SELECT * FROM authRateLimits WHERE keyHash=?').get(keyHash);
        if(row && row.count>=maximum)return null;
        if(!row && database.prepare('SELECT COUNT(*) AS n FROM authRateLimits').get().n>=maximumKeys)return null;
        database.prepare(`INSERT INTO authRateLimits(keyHash,windowStartedAt,windowMs,count) VALUES(?,?,?,1)
          ON CONFLICT(keyHash) DO UPDATE SET count=count+1`).run(keyHash,now,windowMs);
        return {keyHash,windowStartedAt:row?.windowStartedAt??now};
      });
    } catch{throw new AuthLimitError();}
  }
  function release(receipt) {
    try{database.prepare('UPDATE authRateLimits SET count=count-1 WHERE keyHash=? AND windowStartedAt=? AND count>0').run(receipt.keyHash,receipt.windowStartedAt);}
    catch{throw new AuthLimitError();}
  }
  return Object.freeze({take,release});
}

// Public recovery/acceptance endpoints share one policy and durable limiter.
export const AUTH_RECOVERY_LIMIT=10;
export const AUTH_RATE_WINDOW_MS=15*60*1000;
export function authRecoveryLimited(limits,req,res,purpose,maximum=AUTH_RECOVERY_LIMIT) {
  try {
    if(limits.take(purpose,req.ip||req.socket?.remoteAddress||'unknown',maximum,AUTH_RATE_WINDOW_MS))return false;
    res.status(429).json({error:'Please try again later.'});
  }catch(error){if(!(error instanceof AuthLimitError))throw error;res.status(503).json({error:error.message});}
  return true;
}
