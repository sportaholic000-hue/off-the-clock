export function deriveTenantOwnerId(user) {
  if (!user) return null;
  if (user.role === 'staff') return user.ownerId ?? null;
  if (user.role === 'owner') return user.id ?? null;
  return null;
}

export function attachTenantContext(req, user) {
  const tenantOwnerId = deriveTenantOwnerId(user);
  req.user = { ...user, tenantOwnerId };
  req.userId = user.id ?? null;
  req.role = user.role;
  req.tenantOwnerId = tenantOwnerId;
  req.ownerId = tenantOwnerId;
  return tenantOwnerId;
}

export function validateStaffOwnerParent(database, ownerId) {
  if (!ownerId) return false;
  const parent = database.prepare('SELECT role FROM users WHERE id = ?').get(ownerId);
  return parent?.role === 'owner';
}

export function findInvalidStaffOwnerLinks(database) {
  return database.prepare(`
    SELECT staff.id AS staffId, staff.ownerId, parent.role AS parentRole
    FROM users AS staff
    LEFT JOIN users AS parent ON parent.id = staff.ownerId
    WHERE staff.role = 'staff'
      AND (staff.ownerId IS NULL OR parent.id IS NULL OR parent.role != 'owner')
    ORDER BY staff.id
  `).all();
}
