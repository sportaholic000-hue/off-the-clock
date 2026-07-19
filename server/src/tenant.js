export function deriveTenantOwnerId(user) {
  if (!user) return null;
  if (user.role === 'admin') return null;
  if (user.role === 'staff') return user.ownerId || user.tenantOwnerId || null;
  return user.id || user.sub || null;
}

export function attachTenantContext(req, user) {
  const tenantOwnerId = deriveTenantOwnerId(user);
  req.user = { ...user, tenantOwnerId };
  req.userId = user.id || user.sub || null;
  req.role = user.role;
  req.tenantOwnerId = tenantOwnerId;
  req.ownerId = tenantOwnerId;
  return tenantOwnerId;
}
