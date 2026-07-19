import jwt from 'jsonwebtoken';
import { attachTenantContext } from './tenant.js';

function validEnvironmentAdmin(payload) {
  return Boolean(
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_PASSWORD_HASH &&
    payload.sub === 'admin' &&
    payload.role === 'admin' &&
    payload.email === process.env.ADMIN_EMAIL &&
    payload.authSource === 'environment-admin'
  );
}

function loadTenantUser(database, userId) {
  return database.prepare(`
    SELECT account.id, account.ownerId, account.email, account.role,
      parent.role AS ownerRole
    FROM users AS account
    LEFT JOIN users AS parent ON parent.id = account.ownerId
    WHERE account.id = ?
  `).get(userId);
}

export function requireAuth(allowedRoles = [], { database, verifyToken = jwt.verify } = {}) {
  if (!database) throw new Error('requireAuth needs a database');

  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    try {
      const payload = verifyToken(token, process.env.JWT_SECRET);
      if (!payload || typeof payload === 'string') {
        return res.status(401).json({ error: 'Invalid token' });
      }

      if (payload.role === 'admin') {
        if (!validEnvironmentAdmin(payload)) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        if (allowedRoles.length && !allowedRoles.includes('admin')) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        req.user = { id: 'admin', email: payload.email, role: 'admin' };
        req.userId = 'admin';
        req.role = 'admin';
        delete req.tenantOwnerId;
        delete req.ownerId;
        return next();
      }

      if (!['owner', 'staff'].includes(payload.role)) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      const user = loadTenantUser(database, payload.sub);
      if (!user || user.role !== payload.role) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      if (user.role === 'staff' && (!user.ownerId || user.ownerRole !== 'owner')) {
        return res.status(401).json({ error: 'Invalid tenant context' });
      }
      if (allowedRoles.length && !allowedRoles.includes(user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const tenantOwnerId = attachTenantContext(req, user);
      if (!tenantOwnerId) {
        return res.status(401).json({ error: 'Invalid tenant context' });
      }
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}
