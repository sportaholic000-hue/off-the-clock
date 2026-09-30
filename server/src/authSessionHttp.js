import jwt from 'jsonwebtoken';
import {accountEmailOrigin} from './authLinks.js';
import {allowedCorsOrigins} from './runtimeConfig.js';
import {AuthSessionError, isSessionSecret} from './authSessionService.js';

export function createSessionHttp(environment=process.env) {
  const secure=environment.NODE_ENV==='production';
  const cookiePrefix=secure?'__Host-otc_refresh':'otc_refresh';
  function cookieName(sessionId) {
    if(!isSessionSecret(sessionId))throw new AuthSessionError();
    return cookiePrefix+'_'+sessionId;
  }
  function originAllowed(req) {
    const origin=req.headers?.origin ?? req.get?.('Origin');
    if(origin===undefined) return req.headers?.['sec-fetch-site']!=='cross-site';
    if(typeof origin!=='string'||origin==='null')return false;
    // Configuration errors fail closed, including malformed exact origins.
    try{return new Set([accountEmailOrigin(environment),...allowedCorsOrigins(environment)]).has(origin);}catch{return false;}
  }
  function cookie(req,claims) {
    if(!isSessionSecret(claims?.sid))return null;
    const name=cookieName(claims.sid);
    const raw=req.headers?.cookie;
    if(typeof raw!=='string'||raw.length>16384)return null;
    const values=raw.split(';').map(part=>part.trim()).filter(part=>part.startsWith(name+'='));
    if(values.length!==1)return null;
    const value=values[0].slice(name.length+1);
    return isSessionSecret(value)?value:null;
  }
  function writeCookie(res,token,expiresAt,sessionId) {
    const name=cookieName(sessionId);
    // Expires is authoritative even when a test uses an injected clock.
    res.setHeader('Set-Cookie',name+'='+(token||'')+'; Path=/; HttpOnly; SameSite=Lax'+
      (secure?'; Secure':'')+'; Expires='+(token?new Date(expiresAt).toUTCString():'Thu, 01 Jan 1970 00:00:00 GMT')+
      (token?'':'; Max-Age=0'));
  }
  function accessClaims(req,{required=false}={}) {
    const header=req.headers?.authorization;
    if(typeof header!=='string'||!header.startsWith('Bearer ')){if(required)throw new AuthSessionError();return null;}
    try {
      const claims=jwt.verify(header.slice(7),environment.JWT_SECRET,{algorithms:['HS256'],ignoreExpiration:true});
      if(typeof claims!=='object'||!isSessionSecret(claims.sid)||typeof claims.sub!=='string'||!['owner','staff','admin'].includes(claims.role))throw new AuthSessionError();
      return claims;
    }catch{throw new AuthSessionError();}
  }
  function sessionReply(res,result) {
    res.setHeader('Cache-Control','no-store');
    // Distinct session names isolate late browser-applied response headers.
    writeCookie(res,result.refreshToken,result.sessionExpiresAt,result.sessionId);
    const {refreshToken,sessionId,...body}=result;
    return res.json(body);
  }
  function failure(res,error) {
    const unavailable=error.code==='SESSION_STORE_UNAVAILABLE';
    const conflict=error.code==='SESSION_REFRESH_CONFLICT';
    return res.status(unavailable?503:conflict?409:401).json({error:error.message,code:error.code});
  }
  return Object.freeze({originAllowed,cookie,writeCookie,accessClaims,sessionReply,failure});
}
