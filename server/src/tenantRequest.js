// Identity comes from authenticated credentials, never a request selector.
// Reject contradictory selectors uniformly before reading or changing data.
export function guardTenantRequest(req,res,ownerId) {
  const fields=['ownerId','tenantOwnerId','businessId'];
  for(const container of [req.params,req.query,req.body]) {
    if(!container||typeof container!=='object')continue;
    for(const field of fields)if(Object.hasOwn(container,field)&&container[field]!==undefined&&container[field]!==null&&container[field]!==ownerId) {
      res.status(403).json({error:'Forbidden'});return false;
    }
  }
  for(const header of ['x-owner-id','x-tenant-id','x-business-id'])if(req.headers?.[header]!==undefined&&req.headers[header]!==ownerId) {
    res.status(403).json({error:'Forbidden'});return false;
  }
  return true;
}
