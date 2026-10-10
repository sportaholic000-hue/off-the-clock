import {identityLabel} from './voice/receptionistSettings.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import { db } from './db.js';
import {createAuthSessionService, AuthSessionError} from './authSessionService.js';
import {createAuthRateLimiter, AuthLimitError} from './authRateLimitService.js';
import {createSessionHttp} from './authSessionHttp.js';
import { sendTransactionalEmail } from './email.js';
import { accountEmailOrigin, accountEmailLink } from './authLinks.js';
import { passwordHashCost } from './passwordHashConfig.js';
import { requireAuth as databaseRequireAuth } from './authMiddleware.js';
import {
  AUTH_TOKEN_PURPOSES,
  AuthTokenError,
  createAuthTokenService,
  hashAuthToken,
  isAuthToken
} from './authTokenService.js';

const ALLOWED_REQUESTED_PLANS = new Set(['Starter', 'Operator', 'QuoteDone']);
const SAFE_TOKEN_ERROR = 'This link is invalid or has expired.';
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

export function signToken(user) {
  if(user.role==='admin')throw new Error('Use the environment admin login.');
  return createAuthSessionService(db).create(user).token;
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
  issueSessionToken,
  issueAdminToken,
  sessionService,
  rateLimiter,
  environment = process.env
} = {}) {
  if (!database || typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
    throw new TypeError('Auth handlers require a synchronous SQLite database.');
  }
  if (typeof hashPassword !== 'function' || typeof comparePassword !== 'function' ||
      typeof sendEmail !== 'function' || typeof randomUUID !== 'function' ||
      typeof now !== 'function' || (issueSessionToken!==undefined && typeof issueSessionToken !== 'function') ||
      (issueAdminToken!==undefined && typeof issueAdminToken !== 'function')) {
    throw new TypeError('Auth handler dependencies are invalid.');
  }
  const durableTokens = tokenService ?? createAuthTokenService(database, { clock: now });
  if (!durableTokens || typeof durableTokens.issue !== 'function' ||
      typeof durableTokens.consume !== 'function' ||
      typeof durableTokens.invalidateOutstanding !== 'function') {
    throw new TypeError('Auth handlers require a durable token service.');
  }

  const sessions=sessionService??createAuthSessionService(database,{environment,clock:now,
    ...(issueSessionToken||issueAdminToken?{signAccess:(claims,user)=>user.role==='admin'&&issueAdminToken?issueAdminToken(user.email):issueSessionToken?issueSessionToken(user):jwt.sign(claims,environment.JWT_SECRET,{algorithm:'HS256'})}:{})});
  const limits=rateLimiter??createAuthRateLimiter(database,{secret:environment.JWT_SECRET,clock:now});
  const http=createSessionHttp(environment);
  function recoveryLimited(req,res,purpose,maximum=10) {
    try {
      if(limits.take(purpose,req.ip||req.socket?.remoteAddress||'unknown',maximum,WINDOW_MS))return false;
      res.status(429).json({error:'Please try again later.'});
    }catch(error){if(!(error instanceof AuthLimitError))throw error;res.status(503).json({error:error.message});}
    return true;
  }
  function reserveLogin(req,res) {
    try {
      const receipt=limits.take('login',req.ip||req.socket?.remoteAddress||'unknown',MAX_FAILED_ATTEMPTS,WINDOW_MS);
      if(receipt)return receipt;
      res.status(429).json({error:'Too many login attempts'});
    }catch(error){if(!(error instanceof AuthLimitError))throw error;res.status(503).json({error:error.message});}
    return null;
  }
  function guarded(handler) {
    return (req,res,...args)=>{
      if(req.method!=='GET'&&!http.originAllowed(req))return res.status(403).json({error:'This request origin is not allowed.'});
      res.setHeader('Cache-Control','no-store');
      return handler(req,res,...args);
    };
  }

  function hashingReady(res) {
    try { passwordHashCost(environment); return true; } catch {}
    res.status(503).json({error:'Authentication service is temporarily unavailable.'});return false;
  }

  function emailReady(res) {
    try {accountEmailOrigin(environment);return true;}
    catch {res.status(503).json({error: 'Account email is temporarily unavailable.'});return false;}
  }

  function recentlyIssued(userId, purpose) {
    const row = database.prepare('SELECT MAX(createdAt) AS createdAt FROM authTokens WHERE userId = ? AND purpose = ? AND consumedAt IS NULL')
      .get(userId, purpose);
    return row?.createdAt && now().getTime() - Date.parse(row.createdAt) < 60000;
  }

  async function sendAccountLink(user, issued) {
    try {
      const link = accountEmailLink(environment, issued.purpose, issued.token);
      const verification = issued.purpose === AUTH_TOKEN_PURPOSES.VERIFY_EMAIL;
      const result = await sendEmail({
        to: user.email, subject: verification ? 'Verify your Off The Clock AI email' : 'Reset your password',
        text: (verification ? 'Verify your email: ' : 'Reset your password: ') + link +
          '\n\nThis link expires at ' + issued.expiresAt + '. If you did not request this email, you can ignore it.',
        idempotencyKey: 'auth/' + issued.purpose + '/' + hashAuthToken(issued.token)
      });
      if (result?.accepted !== true) throw Error('Email not accepted.');
      return {status: result.simulated === true ? 'simulated' : 'accepted'};
    } catch {
      // Revoke only this failed message; never revoke a newer concurrent send.
      try {durableTokens.consume({token: issued.token, purpose: issued.purpose});} catch {}
      return {status: 'retry_needed'};
    }
  }

  function accountStatusHandler(req, res) {
    const user = database.prepare("SELECT email, emailVerifiedAt FROM users WHERE id = ? AND role != 'admin'").get(req.userId);
    if (!user) return res.status(401).json({error: 'Invalid token'});
    return res.json({email: user.email, emailVerifiedAt: user.emailVerifiedAt});
  }

  async function resendVerificationHandler(req, res) {
    if (recoveryLimited(req, res, 'resend-account') || !emailReady(res)) return;
    const user = database.prepare("SELECT id, email, emailVerifiedAt FROM users WHERE id = ? AND role != 'admin'").get(req.userId);
    if (!user) return res.status(401).json({error: 'Invalid token'});
    if (user.emailVerifiedAt) return res.json({verificationDelivery: {status: 'already_verified'}});
    if (recentlyIssued(user.id, AUTH_TOKEN_PURPOSES.VERIFY_EMAIL)) {
      return res.status(429).json({error: 'Wait a minute before requesting another verification email.'});
    }
    const issued = durableTokens.issue({userId: user.id, purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL, replaceOutstanding: false});
    const verificationDelivery = await sendAccountLink(user, issued);
    if (verificationDelivery.status === 'retry_needed') return res.status(503).json({error: 'The verification email could not be sent. Please try again.'});
    return res.json({verificationDelivery});
  }

  async function resendVerificationPublicHandler(req, res) {
    if (recoveryLimited(req, res, 'resend-public') || !emailReady(res)) return;
    try {
      const email = normalizedEmail(req.body?.email);
      const user = email ? database.prepare("SELECT id, email, emailVerifiedAt FROM users WHERE email = ? AND role != 'admin'").get(email) : null;
      if (user && !user.emailVerifiedAt && !recentlyIssued(user.id, AUTH_TOKEN_PURPOSES.VERIFY_EMAIL)) {
        const issued = durableTokens.issue({userId: user.id, purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL, replaceOutstanding: false});
        await sendAccountLink(user, issued);
      }
    } catch {}
    return res.json({ok: true});
  }

  async function registerHandler(req, res) {
    if (recoveryLimited(req, res, 'register', 20) || !emailReady(res) || !hashingReady(res)) return;
    const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const email = normalizedEmail(body.email);
    const password = body.password;
    const firstName = requiredText(body.firstName, 120);
    let businessName;try{businessName=identityLabel(body.businessName,'Business name').trim();}catch(error){return res.status(400).json({error:error.message});}
    const requestedPlan = body.plan === undefined ? 'Operator' : body.plan;
    if (!email || !validPassword(password) || !firstName || !businessName ||
        typeof requestedPlan !== 'string' || !ALLOWED_REQUESTED_PLANS.has(requestedPlan)) {
      return res.status(400).json({
        error: 'A valid email, password, first name, business name, and requested plan are required.'
      });
    }

    const createdAt = now().toISOString();
    const id = randomUUID();
    const cost = passwordHashCost(environment);
    const passwordHash = await hashPassword(password, cost);
    // A public signup response must not disclose whether this email exists.
    // Hash every valid request; only email possession can unlock a new owner.
    const accepted = () => res.status(202).json({ok: true});
    if (database.prepare('SELECT id FROM users WHERE email = ?').get(email)) return accepted();
    let verification;
    try {
      verification = immediate(database, () => {
        database.prepare(`INSERT INTO users (
          id, ownerId, email, passwordHash, firstName, businessName,
          plan, planStatus, trialEndsAt, timezone, role, createdAt
        ) VALUES (?, NULL, ?, ?, ?, ?, ?, 'pending_payment', NULL, 'UTC', 'owner', ?)`).run(
          id, email, passwordHash, firstName, businessName, requestedPlan, createdAt
        );
        return durableTokens.issue({ userId: id, purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL });
      });
    } catch (error) {
      if (error instanceof AuthTokenError) {
        return res.status(503).json({ error: 'Authentication service is temporarily unavailable.' });
      }
      if ((error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.errcode === 2067)) return accepted();
      throw error;
    }

    await sendAccountLink({id, email}, verification);
    return accepted();
  }

  async function loginHandler(req,res) {
    const receipt=reserveLogin(req,res);if(!receipt)return;
    const email=normalizedEmail(req.body?.email);
    const password=typeof req.body?.password==='string'?req.body.password:'';
    const user=email?database.prepare('SELECT * FROM users WHERE email=?').get(email):null;
    if(!user||user.role==='admin'||(user.role==='owner'&&!user.emailVerifiedAt)||!(await comparePassword(password,user.passwordHash)))return res.status(401).json({error:'Invalid credentials'});
    try {const result=sessions.create(user);limits.release(receipt);return http.sessionReply(res,result);}
    catch(error){if(error instanceof AuthSessionError)return http.failure(res,error);if(error instanceof AuthLimitError)return res.status(503).json({error:error.message});throw error;}
  }

  async function adminLoginHandler(req,res) {
    const receipt=reserveLogin(req,res);if(!receipt)return;
    const email=req.body?.email,password=typeof req.body?.password==='string'?req.body.password:'';
    if(!environment.ADMIN_EMAIL||!environment.ADMIN_PASSWORD_HASH)return res.status(503).json({error:'Admin auth is not configured'});
    const passwordHash=environment.ADMIN_PASSWORD_HASH;
    if(email!==environment.ADMIN_EMAIL||!(await comparePassword(password,passwordHash)))return res.status(401).json({error:'Invalid credentials'});
    try {const result=sessions.create({id:'admin',role:'admin',email,passwordHash});limits.release(receipt);return http.sessionReply(res,result);}
    catch(error){if(error instanceof AuthSessionError)return http.failure(res,error);if(error instanceof AuthLimitError)return res.status(503).json({error:error.message});throw error;}
  }

  function refreshHandler(req,res) {
    if(recoveryLimited(req,res,'refresh',120))return;
    try {
      const claims=http.accessClaims(req,{required:true});
      return http.sessionReply(res,sessions.refresh(http.cookie(req,claims),claims));
    }
    catch(error){if(error instanceof AuthSessionError)return http.failure(res,error);throw error;}
  }
  function logoutHandler(req,res) {
    try {
      const claims=http.accessClaims(req);
      // Without signed session intent, do not select among browser cookies.
      if(!claims)return res.json({ok:true});
      const token=http.cookie(req,claims);
      sessions.revoke(sessions.cookieMatches(token,claims)?token:null,claims);
      // Expire only this session, even if another tab has signed in since.
      http.writeCookie(res,null,undefined,claims.sid);
      return res.json({ok:true});
    }catch(error){if(error instanceof AuthSessionError)return http.failure(res,error);throw error;}
  }

  async function forgotPasswordHandler(req, res) {
    if (recoveryLimited(req, res, 'forgot') || !emailReady(res)) return;
    try {
      const email = normalizedEmail(req.body?.email);
      const user = email ? database.prepare("SELECT id, email FROM users WHERE email = ? AND role != 'admin'").get(email) : null;
      if (user && !recentlyIssued(user.id, AUTH_TOKEN_PURPOSES.RESET_PASSWORD)) {
        const issued = durableTokens.issue({userId: user.id, purpose: AUTH_TOKEN_PURPOSES.RESET_PASSWORD, replaceOutstanding: false});
        await sendAccountLink(user, issued);
      }
    } catch {}
    return res.json({ok: true});
  }

  async function resetPasswordHandler(req, res) {
    if (recoveryLimited(req, res, 'reset') || !hashingReady(res)) return;
    if (!isAuthToken(req.body?.token)) return res.status(400).json({error: SAFE_TOKEN_ERROR});
    if (!validPassword(req.body?.password)) {
      return res.status(400).json({ error: 'A password of at least 8 characters is required.' });
    }
    const passwordHash = await hashPassword(
      req.body.password,
      passwordHashCost(environment)
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
        sessions.revokeAll(receipt.userId);
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
    if (recoveryLimited(req, res, 'verify')) return;
    try {
      durableTokens.consume({
        token: req.method === 'POST' ? req.body?.token : req.query?.token,
        purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL
      }, receipt => {
        const result = database.prepare(
          'UPDATE users SET emailVerifiedAt = COALESCE(emailVerifiedAt, ?) WHERE id = ?'
        ).run(receipt.consumedAt, receipt.userId);
        if (Number(result.changes) !== 1) throw new Error('Verification account no longer exists.');
        durableTokens.invalidateOutstanding({userId: receipt.userId, purpose: AUTH_TOKEN_PURPOSES.VERIFY_EMAIL});
      });
    } catch (error) {
      return tokenFailure(res, error);
    }
    return res.json({ ok: true });
  }

  return Object.freeze({
    register: guarded(registerHandler),
    login: guarded(loginHandler),
    adminLogin: guarded(adminLoginHandler),
    forgotPassword: guarded(forgotPasswordHandler),
    resetPassword: guarded(resetPasswordHandler),
    verifyEmail: guarded(verifyEmailHandler),
    accountStatus: guarded(accountStatusHandler),
    resendVerification: guarded(resendVerificationHandler),
    resendVerificationPublic: guarded(resendVerificationPublicHandler),
    refresh: guarded(refreshHandler),
    logout: guarded(logoutHandler)
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

export function accountStatus(req, res) {return defaults().accountStatus(req, res);}
export function resendVerification(req, res) {return defaults().resendVerification(req, res);}
export function resendVerificationPublic(req, res) {return defaults().resendVerificationPublic(req, res);}

export function refreshSession(req,res){return defaults().refresh(req,res);}
export function logoutSession(req,res){return defaults().logout(req,res);}
