export function installOwnerAlertRoutes(app,{service,requireAuth,asyncHandler}){
  const team=requireAuth(['owner','staff']),owner=requireAuth(['owner']);
  app.get('/api/owner-alerts',team,asyncHandler((req,res)=>{
    if(Object.keys(req.query).some(key=>!['status','offset'].includes(key)))return res.status(400).json({error:'Unsupported owner alert filter.'});
    res.json(service.list({ownerId:req.tenantOwnerId,...req.query}));
  }));
  app.post('/api/owner-alerts/:id/retry',owner,asyncHandler((req,res)=>res.json(service.retry(req.tenantOwnerId,req.params.id))));
  app.post('/api/owner-alerts/:id/seen',owner,asyncHandler((req,res)=>res.json(service.seen(req.tenantOwnerId,req.params.id))));
}
