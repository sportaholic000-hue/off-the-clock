import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from './db.js';
import { sendTransactionalEmail } from './email.js';
import { attachTenantContext, deriveTenantOwnerId } from './tenant.js';

const resetTokens = new Map();
const verifyTokens = new Map();
const loginAttempts = new Map();

export function signToken(user) {
  const tenantOwnerId = deriveTenantOwnerId(user);
  return jwt.sign(
    { sub: user.id, ownerId: tenantOwnerId, tenantOwnerId, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

export function requireAuth(allowedRoles = []) {
  return (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing token' });

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (allowedRoles.length && !allowedRoles.includes(payload.role)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const user = { ...payload, id: payload.sub };
      if (payload.role === 'staff') {
        const row = db.prepare('SELECT ownerId FROM users WHERE id = ?').get(payload.sub);
        user.ownerId = row?.ownerId || payload.tenantOwnerId || payload.ownerId;
      }
      const tenantOwnerId = attachTenantContext(req, user);
      if (payload.role !== 'admin' && !tenantOwnerId) {
        return res.status(401).json({ error: 'Invalid tenant context' });
      }
      return next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

function limited(ip) {
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (Date.now() - record.firstAt > WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now - record.firstAt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAt: now });
    return;
  }
  record.count += 1;
}

export async function register(req, res) {
  const { email, password, firstName, businessName } = req.body || {};
  if (!email || !password || !firstName || !businessName) {
    return res.status(400).json({ error: 'email, password, firstName, and businessName are required' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(String(email).toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const cost = Number(process.env.BCRYPT_COST || 12);
  const passwordHash = await bcrypt.hash(password, cost);

  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`INSERT INTO users (id, ownerId, email, passwordHash, firstName, businessName, plan, planStatus, trialEndsAt, timezone, role, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, null, email.toLowerCase(), passwordHash, firstName, businessName, 'Operator', 'trialing', trialEndsAt, 'UTC', 'owner', now
    );

  const verifyToken = crypto.randomBytes(24).toString('hex');
  verifyTokens.set(verifyToken, { userId: id, expiresAt: Date.now() + 30 * 60 * 1000 });
  await sendTransactionalEmail({
    to: email,
    subject: 'Verify your Off The Clock AI email',
    text: `Verify your email: /api/auth/verify-email?token=${verifyToken}`
  });

  return res.status(201).json({ token: signToken({ id, email, role: 'owner' }) });
}

export async function login(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many login attempts' });

  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.json({ token: signToken(user) });
}

export async function adminLogin(req, res) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (limited(ip)) return res.status(429).json({ error: 'Too many login attempts' });

  const { email, password } = req.body || {};
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH) {
    return res.status(503).json({ error: 'Admin auth is not configured' });
  }
  const ok = email === process.env.ADMIN_EMAIL && await bcrypt.compare(password || '', process.env.ADMIN_PASSWORD_HASH);
  if (!ok) {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  return res.json({ token: signToken({ id: 'admin', email, role: 'admin' }) });
}

export async function forgotPassword(req, res) {
  const { email } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').toLowerCase());
  if (user) {
    const token = crypto.randomBytes(24).toString('hex');
    resetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 30 * 60 * 1000 });
    await sendTransactionalEmail({ to: user.email, subject: 'Reset your password', text: `Reset token: ${token}` });
  }
  return res.json({ ok: true });
}

export async function resetPassword(req, res) {
  const { token, password } = req.body || {};
  const record = resetTokens.get(token);
  if (!record || record.expiresAt < Date.now()) return res.status(400).json({ error: 'Invalid or expired token' });
  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_COST || 12));
  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(passwordHash, record.userId);
  resetTokens.delete(token);
  return res.json({ ok: true });
}

export function verifyEmail(req, res) {
  const record = verifyTokens.get(req.query.token);
  if (!record || record.expiresAt < Date.now()) return res.status(400).json({ error: 'Invalid or expired token' });
  verifyTokens.delete(req.query.token);
  return res.json({ ok: true });
}
