export function installOwnerCallRoutes(app,{service,requireAuth,asyncHandler}) {
  const team=requireAuth(['owner','staff']);
  app.get('/api/calls',team,asyncHandler((req,res)=>res.json(service.list({ownerId:req.tenantOwnerId,query:req.query}))));
  app.get('/api/calls/:id',team,asyncHandler((req,res)=>res.json(service.detail({ownerId:req.tenantOwnerId,id:req.params.id,role:req.role}))));
}
