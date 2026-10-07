export function installOwnerCallRoutes(app,{service,requireAuth,asyncHandler}) {
  const team=requireAuth(['owner','staff']);
  app.get('/api/calls',team,asyncHandler((req,res)=>res.json(service.list({ownerId:req.tenantOwnerId,query:req.query}))));
  app.get('/api/calls/:id',team,asyncHandler((req,res)=>res.json(service.detail({ownerId:req.tenantOwnerId,id:req.params.id,role:req.role}))));
  const owner=requireAuth(['owner']);
  const body=(req,keys)=>{
    if(!req.body||typeof req.body!=='object'||Array.isArray(req.body)||Object.keys(req.body).some(k=>!keys.includes(k)))throw Object.assign(Error('Unsupported request.'),{statusCode:400});
  };
  app.post('/api/calls/:id/spam',owner,asyncHandler((req,res)=>{body(req,[]);res.json(service.markSpam({ownerId:req.tenantOwnerId,id:req.params.id}));}));
  app.get('/api/call-blocklist',owner,asyncHandler((req,res)=>res.json(service.blocklist({ownerId:req.tenantOwnerId,query:req.query}))));
  app.post('/api/call-blocklist',owner,asyncHandler((req,res)=>{body(req,['phoneNumber']);res.json(service.block({ownerId:req.tenantOwnerId,phoneNumber:req.body.phoneNumber}));}));
  app.delete('/api/call-blocklist',owner,asyncHandler((req,res)=>{body(req,['phoneNumber']);res.json(service.unblock({ownerId:req.tenantOwnerId,phoneNumber:req.body.phoneNumber}));}));
}
