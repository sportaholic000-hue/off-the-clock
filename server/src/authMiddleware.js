import jwt from 'jsonwebtoken';
import {attachTenantContext} from './tenant.js';
import {guardTenantRequest} from './tenantRequest.js';
import {AuthSessionError,createAuthSessionService} from './authSessionService.js';

export function requireAuth(allowedRoles=[],{database,verifyToken=jwt.verify,sessionService}={}) {
  if(!database)throw new Error('requireAuth needs a database');
  const sessions=sessionService??createAuthSessionService(database);
  return (req,res,next)=>{
    const header=req.headers.authorization||'',token=header.startsWith('Bearer ')?header.slice(7):null;
    if(!token)return res.status(401).json({error:'Missing token',code:'SESSION_INVALID'});
    try {
      const payload=verifyToken(token,process.env.JWT_SECRET,{algorithms:['HS256']});
      const user=sessions.validateAccess(payload);
      if(allowedRoles.length&&!allowedRoles.includes(user.role))return res.status(403).json({error:'Forbidden'});
      req.authSessionId=payload.sid;
      if(user.role==='admin'){
        req.user={id:'admin',email:user.email,role:'admin'};req.userId='admin';req.role='admin';
        delete req.tenantOwnerId;delete req.ownerId;return next();
      }
      if(!attachTenantContext(req,{id:user.id,ownerId:user.ownerId,email:user.email,role:user.role,ownerRole:user.ownerRole}))return res.status(401).json({error:'Invalid tenant context',code:'SESSION_INVALID'});
      if(!guardTenantRequest(req,res,req.tenantOwnerId))return;
      return next();
    }catch(error){
      if(error instanceof AuthSessionError&&error.code==='SESSION_STORE_UNAVAILABLE')return res.status(503).json({error:error.message,code:error.code});
      return res.status(401).json({error:'Please sign in again.',code:error.name==='TokenExpiredError'?'SESSION_ACCESS_EXPIRED':'SESSION_INVALID'});
    }
  };
}
