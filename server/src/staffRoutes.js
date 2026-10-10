import {StaffError} from './staffService.js';
import {createSessionHttp} from './authSessionHttp.js';

export function installStaffRoutes(app,{service,ownerQuery,quoteEmail,requireAuth,requireQuoteDonePlan,asyncHandler,environment=process.env}) {
  const owner=requireAuth(['owner']),team=requireAuth(['owner','staff']);
  const http=createSessionHttp(environment);
  const handle=fn=>asyncHandler(async(req,res)=>{
    try {return res.json(await fn(req));}
    catch(error){if(error instanceof StaffError)return res.status(error.status).json({error:error.message});throw error;}
  });
  app.get('/api/team/staff',owner,handle(req=>service.list(req.tenantOwnerId)));
  app.post('/api/team/staff/invite',owner,asyncHandler(async(req,res)=>{
    try {return res.status(201).json(await service.invite(req.tenantOwnerId,req.body));}
    catch(error){if(error instanceof StaffError)return res.status(error.status).json({error:error.message});throw error;}
  }));
  app.post('/api/team/staff/:id/resend',owner,handle(req=>service.resend(req.tenantOwnerId,req.params.id)));
  app.delete('/api/team/staff/:id/invite',owner,handle(req=>service.remove(req.tenantOwnerId,req.params.id,{pendingOnly:true})));
  app.delete('/api/team/staff/:id',owner,handle(req=>service.remove(req.tenantOwnerId,req.params.id)));
  app.post('/api/auth/staff-invite/accept',(req,res,next)=>{
    if(!http.originAllowed(req))return res.status(403).json({error:'This request origin is not allowed.'});
    res.setHeader('Cache-Control','no-store');next();
  },handle(req=>service.accept(req.body)));
  app.get('/api/customers',team,(req,res)=>res.json({customers:ownerQuery(
    'SELECT id,name,phoneE164,address,createdAt FROM customers WHERE ownerId=? ORDER BY createdAt DESC LIMIT 200'
  ).all(req.tenantOwnerId)}));
  if(quoteEmail)app.post('/api/quotes/:id/email',team,requireQuoteDonePlan,asyncHandler((req,res)=>{
    try{return res.json(quoteEmail.enqueueSavedQuote({ownerId:req.tenantOwnerId,quoteId:req.params.id,
      email:req.body?.email,customerConfirmed:req.body?.customerConfirmed}));}
    catch(error){if(error?.statusCode)return res.status(error.statusCode).json({error:error.message,code:error.code});throw error;}
  }));
}
