export function installOwnerDashboardRoutes(app,{reports,workflow,jobCosts,requireAuth,requirePriceBookPlan,asyncHandler}) {
  const team=requireAuth(['owner','staff']),owner=requireAuth(['owner']);
  const quotePlan=(req,res,next)=>req.params.kind==='quotes'||req.body?.action==='REVIEW'?requirePriceBookPlan(req,res,next):next();
  if(jobCosts){
    app.get('/api/owner-records/quotes/:id/job-costs',owner,requirePriceBookPlan,asyncHandler((req,res)=>res.json(jobCosts.view({ownerId:req.tenantOwnerId,id:req.params.id,role:req.role}))));
    app.put('/api/owner-records/quotes/:id/job-costs',owner,requirePriceBookPlan,asyncHandler((req,res)=>res.json(jobCosts.save({ownerId:req.tenantOwnerId,id:req.params.id,role:req.role,body:req.body}))));
  }
  app.get('/api/reports',owner,asyncHandler((req,res)=>res.json(reports.report({ownerId:req.tenantOwnerId,query:req.query,role:req.role}))));
  app.put('/api/reports/hours',owner,asyncHandler((req,res)=>res.json(reports.saveHours(req.tenantOwnerId,req.body))));
  app.get('/api/owner-records/:kind/:id',team,quotePlan,asyncHandler((req,res)=>res.json(workflow.view(req.tenantOwnerId,req.params.kind,req.params.id,req.role))));
  app.post('/api/owner-records/:kind/:id/actions',team,quotePlan,asyncHandler((req,res)=>res.json(workflow.act({ownerId:req.tenantOwnerId,actorId:req.userId,role:req.role,kind:req.params.kind,id:req.params.id,body:req.body}))));
}
