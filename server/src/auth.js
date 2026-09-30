import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from './db.js';
import { sendTransactionalEmail } from './email.js';
import { requireAuth as databaseRequireAuth } from './authMiddleware.js';
import {
  AUTH_TOKEN_PURPOSES,
  AuthTokenError,
  createAuthTokenService
} from './authTokenService.js';

const ALLOWED_REQUESTED_PLANS = new Set(['Operator', 'QuoteDone', 'Scale']);
const SAFE_TOKEN_ERROR = 'This link is invalid or has expired.';
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

export function signToken(user) {
  if (user.role === 'admin') {
    throw new Error('Admin tokens must be issued through the environment admin login');
  }
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function signAdminToken(email) {
  return jwt.sign(
    { sub: 'admin', role: 'admin', email, authSource: 'environment-admin' },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
}

export function requireAuth(allowedRoles = [], options = {}) {
  return databaseRequireAuth(allowedRoles, { database: db, ...options });
}

function immediate(database, work) {
  if (typeof database.transaction === 'function') {
    const transaction = database.transaction(work);
    return typeof transaction.immediate === 'function' ? transaction.immediate() : transaction();
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* preserve the original failure */ }
    throw error;
  }
}

function normalizedEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes('@') || /[\u0000-\u001f\u007f]/.test(email)) return null;
  return email;
}

function requiredText(value, maximum) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= maximum ? text : null;
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 8 && value.length <= 1024;
}

function tokenFailure(res, error) {
  if (error instanceof AuthTokenError && error.code === 'AUTH_TOKEN_INVALID') {
    return res.status(400).json({ error: SAFE_TOKEN_ERROR });
  }
  if (error instanceof AuthTokenError) {
    return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
  }
  throw error;
}

export function createAuthHandlers({
  database,
  tokenService,
  hashPassword = (password, cost) => bcrypt.hash(password, cost),
  comparePassword = (password, hash) => bcrypt.compare(password, hash),
  sendEmail = sendTransactionalEmail,
  randomUUID = crypto.randomUUID,
  now = () => new Date(),
  issueSessionToken = signToken,
  issueAdminToken = signAdminToken,
  environment = process.env
} = {}) {
  if (!database || typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
    throw new TypeError('Auth handlers require a synchronous SQLite database.');
  }
  if (typeof hashPassword !== 'function' || typeof comparePassword !== 'function' ||
      typeof sendEmail !== 'function' || typeof randomUUID !== 'function' ||
      typeof now !== 'function' || typeof issueSessionToken !== 'function' ||
      typeof issueAdminToken !== 'function') {
    throw new TypeError('Auth handler dependencies are invalid.');
  }
  const durableTokens = tokenService ?? createAuthTokenService(database, { clock: now });
  if (!durableTokens || typeof durableTokens.issue !== 'function' ||
      typeof durableTokens.consume !== 'function' ||
      typeof durableTokens.invalidateOutstanding !== 'function') {
    throw new TypeError('Auth handlers require a durable token service.');
  }

  const loginAttempts = new Map();

  function limited(ip) {
    const record = loginAttempts.get(ip);
    if (!record) return false;
    if (now().getTime() - record.firstAt > WINDOW_MS) {
      loginAttempts.delete(ip);
      return false;
    }
    return record.count >= MAX_FAILED_ATTEMPTS;
  }

  function recordFailedAttempt(ip) {
    const current = now().getTime();
    const record = loginAttempts.get(ip);
    if (!record || current - record.firstAt > WINDOW_MS) {
      loginAttempts.set(ip, { count: 1, firstAt: current });
      return;
    }
    record.count += 1;
  }

  async function registerHandler(req, res) {
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const email = normalizedEmail(body.email);
    const password = body.password;
    const firstName = requiredText(body.firstName, 120);
    const businessName = requiredText(body.businessName, 200);
    const requestedPlan = body.plan === undefined ? 'Operator' : body.plan;
    if (!email || !validPassword(password) || !firstName || !businessName ||
        typeof requestedPlan !== 'string' || !ALLOWED_REQUESTED_PLANS.has(requestedPlan)) {
      return res.status(400).json({
        error: 'A valid email, password, first name, business name, and requested plan are required.'
      });
    }

    const existing = database.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const createdAt = now().toISOString();
    const id = randomUUID();
    const cost = Number(environment.BCRYPT_COST || 12);
    const passwordHash = await hashPassword(password, cost);
    let verification;
    try {
      verification = immediate(database, () => {
        database.prepare(`INSERT INTO users (
          id, ownerId, email, passwordHash, firstName, businessName,
          plan, planStatus, trialEndsAt, timezone, role, createdAt
        ) VALUES (?, NULL, ?, ?, ?, ?, 'Operator', 'pending_payment', NULL, 'UTC', 'owner', ?)`).run(
          id, email, passwordHash, firstName, businessName, createdAt
        );
        return durableTokens.issue({ userId: id, purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL });
      });
    } catch (error) {
      if (error instanceof AuthTokenError) {
        return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
      }
      throw error;
    }

    await sendEmail({
      to: email,
      subject: 'Verify your Off The Clock AI email',
      text: `Verify your email: /api/auth/verify-email?token=${verification.token}`
    });

    return res.status(201).json({
      token: issueSessionToken({ id, email, role: 'owner' }),
      account: {
        id,
        email,
        firstName,
        businessName,
        plan: 'Operator',
        requestedPlan,
        planStatus: 'pending_payment',
        role: 'owner'
      }
    });
  }

  async function loginHandler(req, res) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(ip)) return res.status(429).json({ error: 'Too many login attempts' });

    const email = normalizedEmail(req.body?.email);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = email ? database.prepare('SELECT * FROM users WHERE email = ?').get(email) : null;
    if (!user || user.role === 'admin' || !(await comparePassword(password, user.passwordHash))) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    return res.json({ token: issueSessionToken(user) });
  }

  async function adminLoginHandler(req, res) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    if (limited(ip)) return res.status(429).json({ error: 'Too many login attempts' });
    const email = req.body?.email;
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!environment.ADMIN_EMAIL || !environment.ADMIN_PASSWORD_HASH) {
      return res.status(503).json({ error: 'Admin auth is not configured' });
    }
    const ok = email === environment.ADMIN_EMAIL &&
      await comparePassword(password, environment.ADMIN_PASSWORD_HASH);
    if (!ok) {
      recordFailedAttempt(ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    return res.json({ token: issueAdminToken(email) });
  }

  async function forgotPasswordHandler(req, res) {
    let issued = null;
    try {
      const email = normalizedEmail(req.body?.email);
      const user = email
        ? database.prepare("SELECT id, email FROM users WHERE email = ? AND role != 'admin'").get(email)
        : null;
      if (user) {
        issued = durableTokens.issue({ userId: user.id, purpose: AUTH_TOKEN_PURPOSES.RESET_PASSWORD });
        await sendEmail({
          to: user.email,
          subject: 'Reset your password',
          text: `Reset token: ${issued.token}`
        });
      }
    } catch {
      if (issued) {
        try {
          const user = normalizedEmail(req.body?.email)
            ? database.prepare("SELECT id FROM users WHERE email = ? AND role != 'admin'").get(normalizedEmail(req.body.email))
            : null;
          if (user) {
            durableTokens.invalidateOutstanding({
              userId: user.id,
              purpose: AUTH_TOKEN_PURPOSES.RESET_PASSWORD
            });
          }
        } catch { /* enumeration-safe response remains identical */ }
      }
    }
    return res.json({ ok: true });
  }

  async function resetPasswordHandler(req, res) {
    if (!validPassword(req.body?.password)) {
      return res.status(400).json({ error: 'A password of at least 8 characters is required.' });
    }
    const passwordHash = await hashPassword(
      req.body.password,
      Number(environment.BCRYPT_COST || 12)
    );
    try {
      durableTokens.consume({
        token: req.body?.token,
        purpose: AUTH_TOKEN_PURPOSES.RESET_PASSWORD
      }, receipt => {
        const result = database.prepare(
          "UPDATE users SET passwordHash = ? WHERE id = ? AND role != 'admin'"
        ).run(passwordHash, receipt.userId);
        if (Number(result.changes) !== 1) throw new Error('Password-reset account no longer exists.');
        durableTokens.invalidateOutstanding({
          userId: receipt.userId,
          purpose: AUTH_TOKEN_PURPOSES.RESET_PASSWORD
        });
      });
    } catch (error) {
      return tokenFailure(res, error);
    }
    return res.json({ ok: true });
  }

  function verifyEmailHandler(req, res) {
    try {
      durableTokens.consume({
        token: req.query?.token,
        purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL
      }, receipt => {
        const result = database.prepare(
          'UPDATE users SET emailVerifiedAt = COALESCE(emailVerifiedAt, ?) WHERE id = ?'
        ).run(receipt.consumedAt, receipt.userId);
        if (Number(result.changes) !== 1) throw new Error('Verification account no longer exists.');
      });
    } catch (error) {
      return tokenFailure(res, error);
    }
    return res.json({ ok: true });
  }

  return Object.freeze({
    register: registerHandler,
    login: loginHandler,
    adminLogin: adminLoginHandler,
    forgotPassword: forgotPasswordHandler,
    resetPassword: resetPasswordHandler,
    verifyEmail: verifyEmailHandler
  });
}

let defaultHandlers;
function defaults() {
  if (!defaultHandlers) defaultHandlers = createAuthHandlers({ database: db });
  return defaultHandlers;
}

export function register(req, res) {
  return defaults().register(req, res);
}

export function login(req, res) {
  return defaults().login(req, res);
}

export function adminLogin(req, res) {
  return defaults().adminLogin(req, res);
}

export function forgotPassword(req, res) {
  return defaults().forgotPassword(req, res);
}

export function resetPassword(req, res) {
  return defaults().resetPassword(req, res);
}

export function verifyEmail(req, res) {
  return defaults().verifyEmail(req, res);
}
