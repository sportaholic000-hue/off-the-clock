export function installBookingAdminRoutes(app, {
  adminService,
  requireAuth,
  requireOperatorAccess,
  requireQuoteDonePlan,
  asyncHandler
}) {
  if (!app || !adminService || typeof requireAuth !== 'function' ||
      typeof requireOperatorAccess !== 'function' || typeof requireQuoteDonePlan !== 'function' ||
      typeof asyncHandler !== 'function') {
    throw new TypeError('Booking admin routes require service, auth, entitlement, and async dependencies.');
  }
  const owner = [requireAuth(['owner']), requireOperatorAccess];
  const quoteOwner = [requireAuth(['owner']), requireQuoteDonePlan];

  app.get('/api/booking/configuration', ...owner, asyncHandler(async (req, res) =>
    res.json(adminService.getConfiguration({ ownerId: req.tenantOwnerId }))
  ));
  app.get('/api/booking/readiness', ...owner, asyncHandler(async (req, res) =>
    res.json(adminService.getReadiness({ ownerId: req.tenantOwnerId }))
  ));
  app.put('/api/booking/settings', ...owner, asyncHandler(async (req, res) =>
    res.json(adminService.updateSettings({ ownerId: req.tenantOwnerId, body: req.body }))
  ));
  app.put('/api/booking/policies/:serviceId', ...owner, asyncHandler(async (req, res) =>
    res.json(adminService.updatePolicy({
      ownerId: req.tenantOwnerId,
      serviceId: req.params.serviceId,
      body: req.body
    }))
  ));
  app.put('/api/widget/settings', ...quoteOwner, asyncHandler(async (req, res) =>
    res.json(adminService.updateWidget({ ownerId: req.tenantOwnerId, body: req.body }))
  ));
}
