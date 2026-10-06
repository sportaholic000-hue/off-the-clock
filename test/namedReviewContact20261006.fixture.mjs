import './pricebookTestEnv.mjs';
import express from 'express';
import {once} from 'node:events';
import {db,migrate} from '../server/src/db.js';
import {createAuthSessionService} from '../server/src/authSessionService.js';
import {requireAuth} from '../server/src/authMiddleware.js';
import {getBusinessProfile,saveKnowledgeBase} from '../server/src/onboardingService.js';
import {installKnowledgeDraftRoutes} from '../server/src/knowledgeDraftRoutes.js';

process.env.JWT_SECRET='SYNTHETIC-named-contact-session-secret-20261006';
migrate();
let sequence=0;
export {db,getBusinessProfile,saveKnowledgeBase};
export function seed(role='owner',ownerId=null){
  const id='SYNTHETIC-contact-'+(++sequence);
  db.prepare("INSERT INTO users(id,ownerId,email,passwordHash,firstName,businessName,plan,planStatus,timezone,role,createdAt) VALUES(?,?,?,'SYNTHETIC','Synthetic Casey','Synthetic Review Co','Operator','active','UTC',?,'2026-10-06T12:00:00.000Z')").run(id,ownerId,id+'@example.invalid',role);
  const user=db.prepare('SELECT * FROM users WHERE id=?').get(id);
  const token=createAuthSessionService(db).create(user).token;
  if(role==='owner')saveKnowledgeBase(id,{about:'[SYNTHETIC] Test business',hours:'Weekdays'});
  return {id,token};
}
export async function knowledgeApp(t,{draft={about:'[SYNTHETIC] AI draft',neverSay:[],reviewContact:{name:'Synthetic Impostor',role:'manager'}}}={}){
  const app=express();app.use(express.json());
  installKnowledgeDraftRoutes(app,{
    requireAuth:roles=>requireAuth(roles,{database:db}),
    requireProviderWrites:(_req,_res,next)=>next(),
    asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),
    onboardingState:id=>({account:{businessName:'[SYNTHETIC] Test business'},profile:getBusinessProfile(id)}),
    draftKnowledgeBase:async()=>draft,saveKnowledgeBase
  });
  app.get('/synthetic/state',requireAuth(['owner'],{database:db}),(req,res)=>res.json({account:{firstName:'Synthetic Casey'},profile:getBusinessProfile(req.tenantOwnerId)}));
  app.use((error,_req,res,_next)=>res.status(error.statusCode||500).json({error:error.message,code:error.code}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const origin='http://127.0.0.1:'+server.address().port;
  const request=async(endpoint,body,token)=>{
    const response=await fetch(origin+endpoint,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json()};
  };
  return {app,origin,request};
}
