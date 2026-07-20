import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { migrate, ownerQuery } from './db.js';
import { adminLogin, forgotPassword, login, register, resetPassword, verifyEmail, requireAuth } from './auth.js';
import { CREATE_TABLE_STATEMENTS } from './schema.js';
import { generateQuote, sanitizeForCustomer } from '../quoteEngine.js';
import {
  centsToDollars,
  dollarsToCents,
  loadPricebook,
  pricebookStatuses,
  savePricebook,
  saveValidatedPricebook
} from '../priceBookService.js';
import { getServiceMetadata } from '../priceBookMetadata.js';
import { resolveJurisdiction } from '../taxJurisdiction.js';
import { insertQuoteLog } from '../quoteLog.js';
import {
  createInterviewDraft,
  draftReviewPayload,
  getBusinessProfile,
  getInterviewDraft,
  listInterviewDrafts,
  onboardingState,
  saveBusinessTypes,
  saveCalendar,
  saveGoogleCalendarTokens,
  saveInterviewDraft,
  saveJurisdictionProfile,
  saveKnowledgeBase,
  savePhoneProvisioning,
  saveVoice,
  setOperatorEnabled,
  updateBusinessProfile,
  updateOnboardingAccount
} from './onboardingService.js';
import {
  draftKnowledgeBase,
  exchangeGoogleCalendarCode,
  googleCalendarAuthorizationUrl,
  placeTwilioTestCall,
  provisionTwilioNumber,
  requestCarrierConnection,
  setCarrierCoverage,
  suggestStarterBook
} from './platformIntegrations.js';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

const app = express();
const port = Number(process.env.PORT || 3000);
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const taxModes = new Set(['TAX_NONE','TAX_MATERIALS','TAX_ALL']);

function requireQuoteDonePlan(req, res, next) {
  const account = ownerQuery(`SELECT plan, planStatus FROM users
    WHERE id = ? AND (ownerId = ? OR id = ?)`).get(
      req.tenantOwnerId, req.tenantOwnerId, req.tenantOwnerId
    );
  if (!account || (!['QuoteDone','Scale'].includes(account.plan) && account.planStatus !== 'trialing')) {
    return res.status(403).json({ error:'QuoteDone or Scale is required' });
  }
  return next();
}

migrate();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

if (process.env.NODE_ENV !== 'production') {
  app.get('/api/schema', (_req, res) => res.json({ createTableStatements: CREATE_TABLE_STATEMENTS }));
}

app.post('/api/auth/register', asyncHandler(register));
app.post('/api/auth/login', asyncHandler(login));
app.post('/api/auth/forgot-password', asyncHandler(forgotPassword));
app.post('/api/auth/reset-password', asyncHandler(resetPassword));
app.get('/api/auth/verify-email', verifyEmail);
app.post('/api/admin/login', asyncHandler(adminLogin));

app.get('/api/onboarding/state', requireAuth(['owner']), (req, res) => {
  res.json(onboardingState(req.tenantOwnerId));
});

app.post('/api/onboarding/account', requireAuth(['owner']), asyncHandler(async (req, res) => {
  res.json({ account: updateOnboardingAccount(req.tenantOwnerId, req.body || {}) });
}));

app.post('/api/onboarding/business-types', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const profile = saveBusinessTypes(req.tenantOwnerId, req.body?.businessTypes);
  res.json({ profile });
}));

app.post('/api/business/jurisdiction', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  const ownerId = req.tenantOwnerId;
  const country = String(req.body?.country || '').toUpperCase();
  const region = String(req.body?.region || '').toUpperCase();
  let resolved = resolveJurisdiction(country, region);

  if (resolved.needsOwnerConfirmation) {
    const taxMode = req.body?.taxMode;
    const taxPercent = Number(req.body?.taxPercent);
    if (!taxModes.has(taxMode)) {
      const error = new Error('Choose how you handle sales tax on customer invoices');
      error.statusCode = 400;
      throw error;
    }
    if (taxMode !== 'TAX_NONE' && (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100)) {
      const error = new Error('Enter a valid sales tax rate');
      error.statusCode = 400;
      throw error;
    }
    resolved = { ...resolved, taxMode, taxPercent: taxMode === 'TAX_NONE' ? 0 : taxPercent, needsOwnerConfirmation: false };
  }

  const book = loadPricebook(ownerId);
  savePricebook(ownerId, {
    ...book,
    defaults: {
      ...(book.defaults || {}),
      taxMode: resolved.taxMode,
      taxPercent: resolved.taxPercent
    }
  });
  saveJurisdictionProfile(ownerId, { country, region });
  return res.json(resolved);
}));

app.post('/api/onboarding/phone/provision', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const ownerId = req.tenantOwnerId;
  const profile = getBusinessProfile(ownerId);
  if (profile.twilioNumberSid && profile.phoneProvisioningStatus === 'provisioned') {
    return res.json({ profile, reused: true });
  }

  const provisioned = await provisionTwilioNumber({
    country: profile.country,
    existingNumber: req.body?.existingNumber
  });
  let carrierSetupStatus = 'queued';
  let carrierReference = null;
  try {
    const carrier = await requestCarrierConnection({ ownerId, ...provisioned });
    carrierSetupStatus = carrier.status;
    carrierReference = carrier.reference || null;
  } catch {
    carrierSetupStatus = 'failed';
  }
  const next = savePhoneProvisioning(ownerId, { ...provisioned, carrierSetupStatus });
  return res.status(201).json({ profile: next, carrierReference });
}));

app.post('/api/onboarding/phone/test', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const state = onboardingState(req.tenantOwnerId);
  const profile = state.profile;
  if (!profile.twilioNumber || !profile.existingPhoneNumber) {
    const error = new Error('Connect your business number before testing it');
    error.statusCode = 409;
    throw error;
  }
  const call = await placeTwilioTestCall({
    to: profile.existingPhoneNumber,
    from: profile.twilioNumber,
    businessName: state.account.businessName,
    agentName: profile.agentName
  });
  return res.json({ callSid: call.sid, status: call.status || 'queued' });
}));

app.post('/api/onboarding/knowledge-base/draft', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const state = onboardingState(req.tenantOwnerId);
  const knowledgeBase = await draftKnowledgeBase({
    businessName: state.account.businessName,
    businessTypes: state.profile.businessTypes,
    websiteUrl: req.body?.websiteUrl
  });
  const profile = saveKnowledgeBase(req.tenantOwnerId, knowledgeBase);
  return res.json({ knowledgeBase: profile.knowledgeBase, status: 'DRAFT' });
}));

app.post('/api/onboarding/knowledge-base', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const profile = saveKnowledgeBase(req.tenantOwnerId, { ...(req.body || {}), draft: false });
  return res.json({ profile });
}));

app.post('/api/operator/toggle', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const enabled = req.body?.enabled === true;
  const current = getBusinessProfile(req.tenantOwnerId);
  const profile = setOperatorEnabled(req.tenantOwnerId, enabled);
  let carrierStatus = current.carrierSetupStatus;
  try {
    const carrier = await setCarrierCoverage({
      ownerId: req.tenantOwnerId,
      enabled,
      existingNumber: profile.existingPhoneNumber,
      twilioNumber: profile.twilioNumber
    });
    carrierStatus = carrier.status || carrierStatus;
    updateBusinessProfile(req.tenantOwnerId, { carrierSetupStatus: carrierStatus });
  } catch (error) {
    setOperatorEnabled(req.tenantOwnerId, !enabled);
    error.statusCode = 502;
    throw error;
  }
  return res.json({ operator: onboardingState(req.tenantOwnerId).operator, carrierStatus });
}));

app.post('/api/onboarding/calendar', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const profile = saveCalendar(req.tenantOwnerId, req.body || {});
  return res.json({ profile });
}));

app.get('/api/onboarding/calendar/google/start', requireAuth(['owner']), (req, res) => {
  const state = jwt.sign(
    { sub: req.tenantOwnerId, purpose: 'google-calendar' },
    process.env.JWT_SECRET,
    { expiresIn: '10m' }
  );
  res.json({ authorizationUrl: googleCalendarAuthorizationUrl(state) });
});

app.get('/api/onboarding/calendar/google/callback', asyncHandler(async (req, res) => {
  const state = jwt.verify(String(req.query.state || ''), process.env.JWT_SECRET);
  if (!state || typeof state === 'string' || state.purpose !== 'google-calendar') {
    return res.status(401).json({ error: 'Invalid calendar state' });
  }
  const tokens = await exchangeGoogleCalendarCode(String(req.query.code || ''));
  saveGoogleCalendarTokens(state.sub, tokens);
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return res.redirect(`${clientUrl}/onboarding?step=8&calendar=connected`);
}));

app.post('/api/onboarding/voice', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const profile = saveVoice(req.tenantOwnerId, req.body || {});
  return res.json({ profile });
}));

app.post('/api/pricebook/interview', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  const draft = createInterviewDraft(req.tenantOwnerId, req.body || {});
  return res.status(201).json({ draft });
}));

app.get('/api/pricebook/interview', requireAuth(['owner']), requireQuoteDonePlan, (req, res) => {
  res.json({ drafts: listInterviewDrafts(req.tenantOwnerId) });
});

app.get('/api/pricebook/interview/:draftId', requireAuth(['owner']), requireQuoteDonePlan, (req, res) => {
  const draft = getInterviewDraft(req.tenantOwnerId, req.params.draftId);
  if (!draft) return res.status(404).json({ error: 'Draft not found' });
  return res.json({ draft });
});

app.put('/api/pricebook/interview/:draftId', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  const draft = saveInterviewDraft(req.tenantOwnerId, req.params.draftId, req.body || {});
  return res.json({ draft });
}));

app.get('/api/pricebook/interview/:draftId/review', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  return res.json(draftReviewPayload(req.tenantOwnerId, req.params.draftId));
}));

app.get('/api/pricebook/meta', requireAuth(['owner']), (_req, res) => {
  res.json({ services: getServiceMetadata() });
});

app.post('/api/pricebook/suggest', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  const suggestions = await suggestStarterBook(req.body?.industry);
  return res.json({
    suggestions: suggestions.map(service => ({ ...service, source: 'AI_SUGGESTED', ownerConfirmed: false })),
    warning: 'These are AI-suggested placeholder ranges — replace them with YOUR prices before going live.'
  });
}));

app.post('/api/pricebook/preview', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  const converted = dollarsToCents({
    service: req.body?.service || {},
    defaults: req.body?.defaults || {}
  });
  const service = converted.service;
  const result = generateQuote({
    serviceType: service.serviceType,
    customerInputs: req.body?.customerInputs || {},
    ownerPricing: service,
    businessDefaults: converted.defaults,
    callerType: 'owner'
  });
  return res.json(result);
}));

app.post('/api/pricebook/save', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  const { statuses } = saveValidatedPricebook(req.tenantOwnerId, req.body || {});
  return res.json({ success: true, statuses });
}));

app.get('/api/pricebook/:ownerId', requireAuth(['owner']), requireQuoteDonePlan, (req, res) => {
  if (req.params.ownerId !== req.tenantOwnerId) return res.status(403).json({ error: 'Forbidden' });
  return res.json(centsToDollars(loadPricebook(req.tenantOwnerId)));
});

app.post('/api/quote/calculate', requireAuth(['owner', 'staff']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  const tenantOwnerId = req.tenantOwnerId;
  const { serviceType, customerInputs = {}, callerType = 'owner' } = req.body || {};
  const pricebook = loadPricebook(tenantOwnerId);
  const service = (pricebook.services || []).find(entry => entry.serviceType === serviceType || entry.service === serviceType);
  if (!service) return res.status(404).json({ error: 'Service not found in price book' });
  const result = generateQuote({
    serviceType: service.serviceType,
    customerInputs,
    ownerPricing: service,
    businessDefaults: pricebook.defaults || {},
    callerType
  });
  insertQuoteLog(
    tenantOwnerId,
    result.quoteId,
    service.serviceType,
    customerInputs,
    result,
    callerType,
    result.urgencyFlags?.join('; ') || null
  );
  return res.json(callerType === 'customer' ? sanitizeForCustomer(result) : result);
}));

app.post('/api/quote/test', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
  const result = generateQuote(req.body || {});
  console.log('[quote-test-breakdown]', JSON.stringify(result, null, 2));
  return res.json(result);
}));

app.get('/api/dashboard', requireAuth(['owner', 'staff']), (req, res) => {
  const profileState = onboardingState(req.tenantOwnerId);
  const book = loadPricebook(req.tenantOwnerId);
  const quoteRequestCount = ownerQuery('SELECT COUNT(*) AS count FROM quoteRequests WHERE ownerId = ?').get(req.tenantOwnerId)?.count || 0;
  res.json({
    ownerId: req.tenantOwnerId,
    role: req.role,
    operator: profileState.operator,
    onboardingStep: profileState.profile.onboardingStep,
    quoteRequestCount,
    pricebookStatuses: pricebookStatuses(book),
    sections: ['Home', 'Calls', 'Leads', 'Quotes', 'Customers', 'Price Book', 'Calendar', 'Settings']
  });
});

app.get('/api/admin', requireAuth(['admin']), (_req, res) => {
  res.json({ shell: 'admin', sections: ['Accounts list', 'Provisioning failures', 'A2P status', 'Platform metrics', 'Global kill switches', 'Support impersonation placeholder'] });
});

app.post('/api/twilio/voice/incoming', (_req, res) => {
  res.type('text/xml').send('<Response><Say>Your Off The Clock operator connection is ready.</Say></Response>');
});

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return;
  const status = Number(err.statusCode) || 500;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(err.details ? { details: err.details } : {})
  });
});

app.listen(port, () => {
  console.log(`Off The Clock AI server listening on ${port}`);
});

export default app;
