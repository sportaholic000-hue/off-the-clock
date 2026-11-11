import crypto from 'node:crypto';
import {authImmediate} from './authSessionService.js';
export class AuthLimitError extends Error {constructor(){super('Authentication service is temporarily unavailable.');this.name='AuthLimitError';}}
export function installAuthLimitSchema(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS authRateLimits(
    keyHash TEXT PRIMARY KEY CHECK(length(keyHash)=64), windowStartedAt INTEGER NOT NULL,
    windowMs INTEGER NOT NULL CHECK(windowMs>0), count INTEGER NOT NULL CHECK(count>=0)
  ) STRICT;`);
  installKnownAddressSchema(database);
}
// Addresses that signed in successfully, kept apart from the 15-minute limit rows
// so they never count toward the limit table's cap. Only HMACs are stored. Rows
// left in the limit table by an earlier version (count 0, 30-day window) are removed.
const LEGACY_REMEMBERED_WINDOW_MS=30*24*60*60*1000;
function installKnownAddressSchema(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS authKnownAddresses(
    keyHash TEXT PRIMARY KEY CHECK(length(keyHash)=64), accountHash TEXT NOT NULL CHECK(length(accountHash)=64),
    rememberedAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL
  ) STRICT;
  CREATE INDEX IF NOT EXISTS authKnownAddresses_account ON authKnownAddresses(accountHash,rememberedAt);
  CREATE INDEX IF NOT EXISTS authKnownAddresses_remembered ON authKnownAddresses(rememberedAt);
  DELETE FROM authRateLimits WHERE count=0 AND windowMs=${LEGACY_REMEMBERED_WINDOW_MS};`);
}
// Bounds on remembered addresses: the newest per account and the newest overall.
export const KNOWN_ADDRESSES_PER_ACCOUNT=20;
export const KNOWN_ADDRESSES_TOTAL=50000;
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
  // Ends the current window for one key, as if it had expired.
  function clear(scope,identity) {
    try {
      if(typeof scope!=='string'||typeof identity!=='string'||identity.length>512)throw new AuthLimitError();
      const keyHash=crypto.createHmac('sha256',secret).update('auth-limit-v1\0'+scope+'\0'+identity).digest('hex');
      database.prepare('DELETE FROM authRateLimits WHERE keyHash=?').run(keyHash);
    } catch{throw new AuthLimitError();}
  }
  function knownKeys(scope,account,address) {
    if(typeof scope!=='string'||typeof account!=='string'||typeof address!=='string'||account.length>512||address.length>512)throw new AuthLimitError();
    const mac=text=>crypto.createHmac('sha256',secret).update(text).digest('hex');
    return {keyHash:mac('auth-known-v1\0'+scope+'\0'+account+'\0'+address),accountHash:mac('auth-known-account-v1\0'+scope+'\0'+account)};
  }
  // Remembers an address for an account for windowMs from now. Keeps at most
  // KNOWN_ADDRESSES_PER_ACCOUNT per account and KNOWN_ADDRESSES_TOTAL in all,
  // dropping the oldest. Never touches the limit table.
  function remember(scope,account,address,windowMs) {
    try {
      if(!Number.isSafeInteger(windowMs)||windowMs<1)throw new AuthLimitError();
      const {keyHash,accountHash}=knownKeys(scope,account,address),now=new Date(clock()).getTime();if(!Number.isSafeInteger(now))throw new AuthLimitError();
      authImmediate(database,()=>{
        database.prepare('DELETE FROM authKnownAddresses WHERE expiresAt<=?').run(now);
        database.prepare(`INSERT INTO authKnownAddresses(keyHash,accountHash,rememberedAt,expiresAt) VALUES(?,?,?,?)
          ON CONFLICT(keyHash) DO UPDATE SET rememberedAt=excluded.rememberedAt,expiresAt=excluded.expiresAt`).run(keyHash,accountHash,now,now+windowMs);
        database.prepare(`DELETE FROM authKnownAddresses WHERE accountHash=? AND keyHash NOT IN
          (SELECT keyHash FROM authKnownAddresses WHERE accountHash=? ORDER BY rememberedAt DESC,keyHash LIMIT ?)`).run(accountHash,accountHash,KNOWN_ADDRESSES_PER_ACCOUNT);
        const total=database.prepare('SELECT COUNT(*) AS n FROM authKnownAddresses').get().n;
        if(total>KNOWN_ADDRESSES_TOTAL)database.prepare(`DELETE FROM authKnownAddresses WHERE keyHash IN
          (SELECT keyHash FROM authKnownAddresses ORDER BY rememberedAt,keyHash LIMIT ?)`).run(total-KNOWN_ADDRESSES_TOTAL);
      });
    } catch{throw new AuthLimitError();}
  }
  function remembered(scope,account,address) {
    try {
      const {keyHash}=knownKeys(scope,account,address),now=new Date(clock()).getTime();if(!Number.isSafeInteger(now))throw new AuthLimitError();
      return Boolean(database.prepare('SELECT 1 FROM authKnownAddresses WHERE keyHash=? AND expiresAt>?').get(keyHash,now));
    } catch{throw new AuthLimitError();}
  }
  return Object.freeze({take,release,clear,remember,remembered});
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
