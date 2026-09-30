export function installOwnerCalendarRoutes(app, {service, requireAuth, requireOperatorAccess, requireProviderOperationsEnabled, asyncHandler}) {
  const team = [requireAuth(['owner', 'staff']), requireOperatorAccess];
  app.get('/api/calendar/schedule', ...team, asyncHandler(async (req, res) => {
    const result = service.schedule({ownerId: req.tenantOwnerId, query: req.query});
    res.json({...result, canManage: req.role === 'owner'});
  }));
  app.get('/api/calendar/busy', ...team, requireProviderOperationsEnabled, asyncHandler(async (req, res) => {
    res.json(await service.busy({ownerId: req.tenantOwnerId, query: req.query}));
  }));
}
