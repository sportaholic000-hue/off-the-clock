export function installUsageRoutes(app,{service,requireAuth}) {
  const ownerOnly=requireAuth(['owner']);
  app.get('/api/usage',ownerOnly,(req,res)=>{
    res.set('Cache-Control','no-store').json(service.getUsageSnapshot(req.tenantOwnerId));
  });
  app.get('/api/usage/calls',ownerOnly,(req,res)=>{
    res.set('Cache-Control','no-store').json({calls:service.getUsageHistory(req.tenantOwnerId)});
  });
}

