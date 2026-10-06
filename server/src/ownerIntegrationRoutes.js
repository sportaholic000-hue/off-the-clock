import { sendOwnerCsv } from './integrationData.js';

export function installOwnerIntegrationRoutes(app, {service,ownerQuery,requireAuth,requireOperatorAccess,asyncHandler}) {
  const owner = requireAuth(['owner']);
  // Exporting existing records and disabling dispatch remain available after
  // cancellation. Configuring or retrying external delivery needs Operator access.
  app.get('/api/exports/:kind',owner,(req,res)=>sendOwnerCsv(req,res,{ownerQuery}));
  const privateResponse = (_req,res,next) => {res.set('Cache-Control','no-store');next();};
  app.get('/api/integrations/webhook',owner,privateResponse,(req,res)=>res.json(service.getConfiguration(req.tenantOwnerId)));
  app.get('/api/integrations/webhook/deliveries',owner,privateResponse,(req,res)=>{
    if(Object.keys(req.query).some(key=>!['status','offset'].includes(key)))return res.status(400).json({error:'Unsupported webhook delivery page.'});
    res.json(service.listDeliveries(req.tenantOwnerId,req.query));
  });
  app.put('/api/integrations/webhook',owner,requireOperatorAccess,privateResponse,asyncHandler(async(req,res)=>
    res.json(await service.save(req.tenantOwnerId,req.body))));
  app.delete('/api/integrations/webhook',owner,privateResponse,(req,res)=>res.json(service.remove(req.tenantOwnerId)));
  app.post('/api/integrations/webhook/rotate-secret',owner,requireOperatorAccess,privateResponse,(req,res)=>res.json(service.rotate(req.tenantOwnerId)));
  app.post('/api/integrations/webhook/deliveries/:id/retry',owner,requireOperatorAccess,privateResponse,(req,res)=>
    res.json(service.retry(req.tenantOwnerId,req.params.id)));
}
