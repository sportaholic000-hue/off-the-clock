import 'dotenv/config';
import {deploymentConfig} from './deploymentEnvironment.js';
import {configureClientAddress} from './clientAddress.js';
import {createLifecycle} from './lifecycle.js';
import {installWidgetAssets,installOwnerAssets} from './productionAssets.js';
import {startBackupScheduler} from './backups.js';
import { createOutboundWebhookService } from './outboundWebhookService.js';
import { installOwnerIntegrationRoutes } from './ownerIntegrationRoutes.js';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';
import { verifyExactJson } from './exactJson.js';
import { parseOwnerNumericInput } from '../priceBookMoney.js';
import { createCalendarOAuthStateService } from './calendarOAuthState.js';
import { db, migrate, ownerQuery } from './db.js';
import { adminLogin, forgotPassword, login, register, resetPassword, verifyEmail, requireAuth } from './auth.js';
import { CREATE_TABLE_STATEMENTS } from './schema.js';
import {installAccountRoutes} from './accountRoutes.js';
import { installQuoteDoneRoutes } from './quoteDoneRoutes.js';
import { createBookingService } from './bookingService.js';
import { createBookingPreferenceService } from './bookingPreferenceService.js';
import { installBookingRoutes } from './bookingRoutes.js';
import { createGoogleCalendarAdapter } from './googleCalendarAdapter.js';
import { createBookingAdminService } from './bookingAdminService.js';
import { installBookingAdminRoutes } from './bookingAdminRoutes.js';
import { createOwnerCalendarService } from './ownerCalendarService.js';
import { installOwnerCalendarRoutes } from './ownerCalendarRoutes.js';
import { bookStatuses, previewApplicationQuote } from './quoteDoneBridge.js';
import {
  centsToDollars,
  dollarsToCents,
  loadPricebook,
  contractorValidationMessage,
  pricebookDraftValidation,
  pricebookStatuses,
  savePricebook,
  saveValidatedPricebook
} from '../priceBookService.js';
import { getServiceMetadata, ownerFieldLabel } from '../priceBookMetadata.js';
import { hasOperatorAccess, hasProviderWriteAccess, hasQuoteDoneAccess } from './planAccess.js';
import { providerWritesEnabled, validateRuntimeConfig } from './runtimeConfig.js';
import { createCorsOptionsDelegate } from './corsPolicy.js';
import { installLiveDemoRoutes } from './demo/liveDemo.js';
import { migrateLegacyGoogleCalendarCredentials } from './calendarCredentials.js';
import { loadBillingConfig } from './billingConfig.js';
import { createBillingStateService } from './billingStateService.js';
import { installBillingRoutes, installBillingWebhookRoute } from './billingRoutes.js';
import { resolveJurisdiction } from '../taxJurisdiction.js';
import { insertQuoteLog } from '../quoteLog.js';
import {
  createInterviewDraft,
  assistInterviewDraft,
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
  decoratePreviewState,
  localPreviewEnabled,
  previewDashboardActivity,
  previewOperatorPatch,
  previewPhonePatch
} from './previewMode.js';
import {
  draftKnowledgeBase,
  exchangeGoogleCalendarCode,
  getTwilioCallStatus,
  googleCalendarAuthorizationUrl,
  placeTwilioTestCall,
  provisionTwilioNumber,
  requestCarrierConnection,
  setCarrierCoverage,
  suggestStarterBook
} from './platformIntegrations.js';

const runtimeConfig = validateRuntimeConfig();

const app = express();
const lifecycle = createLifecycle(app,db);
configureClientAddress(app,{mode:deploymentConfig.mode});
const port = Number(process.env.PORT || 3000);
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const taxModes = new Set(['TAX_NONE','TAX_MATERIALS','TAX_ALL']);
const clientOnboardingState = ownerId => decoratePreviewState(onboardingState(ownerId));

function accessAccount(ownerId) {
  return ownerQuery(`SELECT plan, planStatus, trialEndsAt, paymentFailedAt FROM users
    WHERE id = ? AND (ownerId = ? OR id = ?)`).get(ownerId, ownerId, ownerId);
}

function requireProviderOperationsEnabled(_req, res, next) {
  if (!providerWritesEnabled()) {
    return res.status(503).json({ error: 'Provider operations are not enabled for this environment.' });
  }
  return next();
}

function requireProviderWrites(req, res, next) {
  if (!providerWritesEnabled()) {
    return res.status(503).json({ error: 'Provider operations are not enabled for this environment.' });
  }
  if (req.tenantOwnerId && !hasProviderWriteAccess(accessAccount(req.tenantOwnerId))) {
    return res.status(403).json({ error: 'This account is not eligible for provider operations.' });
  }
  return next();
}

function requireQuoteDonePlan(req, res, next) {
  const account = accessAccount(req.tenantOwnerId);
  if (!hasQuoteDoneAccess(account)) {
    return res.status(403).json({ error:'QuoteDone or Scale is required' });
  }
  return next();
}

function requireOperatorAccess(req, res, next) {
  if (!hasOperatorAccess(accessAccount(req.tenantOwnerId))) {
    return res.status(403).json({ error: 'This account does not currently have Operator access.' });
  }
  return next();
}

migrate();
migrateLegacyGoogleCalendarCredentials();
const outboundWebhooks = createOutboundWebhookService({database:db,ownerQuery});
const calendarOAuthState = createCalendarOAuthStateService({ database: db });

const bookingTokenSecret = String(process.env.BOOKING_SLOT_TOKEN_SECRET || '');
const bookingRuntimeAvailable = Buffer.byteLength(bookingTokenSecret) >= 32;
const bookingCalendar = bookingRuntimeAvailable ? createGoogleCalendarAdapter() : null;
const bookingService = bookingRuntimeAvailable
  ? createBookingService({ db, calendar: bookingCalendar, slotTokenSecret: bookingTokenSecret })
  : null;
const bookingPreferenceService = bookingRuntimeAvailable
  ? createBookingPreferenceService({ db })
  : null;
const bookingAdminService = createBookingAdminService({ db });
const ownerCalendarService = createOwnerCalendarService({ ownerQuery, calendar: bookingCalendar });
const billingConfig = runtimeConfig.stripeBilling ? loadBillingConfig() : null;
const stripeClient = billingConfig
  ? new Stripe(billingConfig.secretKey, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: 'off-the-clock', version: '0.0.0' }
    })
  : null;
const billingStateService = billingConfig
  ? createBillingStateService({ db, pricePlanMap: billingConfig.pricePlanMap })
  : null;

// Website live voice demo has its own origin allowlist, so it is installed before the app-wide CORS policy.
installLiveDemoRoutes(app, { db });
if(deploymentConfig.production) installWidgetAssets(app,deploymentConfig.ownerDist);
app.use(cors(createCorsOptionsDelegate({ configuredOrigins: runtimeConfig.corsOrigins })));
if (billingConfig) {
  installBillingWebhookRoute(app, {
    rawBodyMiddleware: express.raw({ type: 'application/json', limit: '256kb' }),
    constructEvent: (payload, signature, secret) =>
      stripeClient.webhooks.constructEvent(payload, signature, secret),
    webhookSecret: billingConfig.webhookSecret,
    billingStateService,
    stripeClient
  });
}
app.use(express.json({ limit: '1mb', verify: verifyExactJson }));

app.get('/api/health', lifecycle.health);

if (process.env.NODE_ENV !== 'production') {
  app.get('/api/schema', (_req, res) => res.json({ createTableStatements: CREATE_TABLE_STATEMENTS }));
}

app.post('/api/auth/register', asyncHandler(register));
app.post('/api/auth/login', asyncHandler(login));
app.post('/api/auth/forgot-password', asyncHandler(forgotPassword));
app.post('/api/auth/reset-password', asyncHandler(resetPassword));
app.get('/api/auth/verify-email', verifyEmail);
installAccountRoutes(app, {requireAuth, asyncHandler});
installOwnerIntegrationRoutes(app,{service:outboundWebhooks,ownerQuery,requireAuth,requireOperatorAccess,asyncHandler});
app.post('/api/admin/login', asyncHandler(adminLogin));

if (billingConfig) {
  installBillingRoutes(app, {
    stripeClient,
    billingStateService,
    database: db,
    requireAuth,
    // Checkout is how pending/canceled owners obtain entitlement, so this gate
    // checks deployment authority only. Subscription access still changes only
    // after a verified Stripe webhook is applied by billingStateService.
    requireProviderWrites: requireProviderOperationsEnabled,
    asyncHandler,
    providerOperationsEnabled: providerWritesEnabled(),
    priceIds: billingConfig.priceIds,
    successUrl: billingConfig.successUrl,
    cancelUrl: billingConfig.cancelUrl,
    portalReturnUrl: billingConfig.portalReturnUrl,
    integrationIdentifier: billingConfig.integrationIdentifier
  });
}

app.get('/api/onboarding/state', requireAuth(['owner']), (req, res) => {
  res.json(clientOnboardingState(req.tenantOwnerId));
});

if (localPreviewEnabled()) {
  app.post('/api/dev/preview/telephony', requireAuth(['owner']), (req, res) => {
    const profile = getBusinessProfile(req.tenantOwnerId);
    updateBusinessProfile(req.tenantOwnerId, previewPhonePatch(profile, req.body?.existingNumber));
    return res.json(clientOnboardingState(req.tenantOwnerId));
  });

  app.post('/api/dev/preview/operator', requireAuth(['owner']), (req, res) => {
    const profile = getBusinessProfile(req.tenantOwnerId);
    updateBusinessProfile(req.tenantOwnerId, previewOperatorPatch(profile, req.body?.enabled === true));
    return res.json(clientOnboardingState(req.tenantOwnerId));
  });
}

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

  // Jurisdiction lookup supplies a prefill. Explicit owner settings must be
  // validated and saved even when that location already has a preset.
  const explicitTaxSettings = Object.hasOwn(req.body || {}, 'taxMode') || Object.hasOwn(req.body || {}, 'taxPercent');
  if (explicitTaxSettings || resolved.needsOwnerConfirmation) {
    const taxMode = req.body?.taxMode;
    const taxPercent = parseOwnerNumericInput(req.body?.taxPercent,{path:'taxPercent'});
    if (!taxModes.has(taxMode)) {
      const error = new Error('Choose how you handle sales tax on customer invoices');
      error.statusCode = 400;
      throw error;
    }
    if (taxMode !== 'TAX_NONE' && (!Number.isFinite(taxPercent) || taxPercent <= 0 || taxPercent > 100)) {
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

app.post('/api/onboarding/phone/provision', requireAuth(['owner']), requireProviderWrites, asyncHandler(async (req, res) => {
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

app.post('/api/onboarding/phone/test', requireAuth(['owner']), requireProviderWrites, asyncHandler(async (req, res) => {
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

app.get('/api/onboarding/phone/test/:callSid', requireAuth(['owner']), requireProviderWrites, asyncHandler(async (req, res) => {
  const profile = getBusinessProfile(req.tenantOwnerId);
  const call = await getTwilioCallStatus(req.params.callSid);
  if (call.to !== profile.existingPhoneNumber || call.from !== profile.twilioNumber) {
    return res.status(404).json({ error:'Test call not found' });
  }
  return res.json({ status:call.status });
}));

app.post('/api/onboarding/knowledge-base/draft', requireAuth(['owner']), requireProviderWrites, asyncHandler(async (req, res) => {
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

app.post('/api/operator/toggle', requireAuth(['owner']), requireProviderWrites, asyncHandler(async (req, res) => {
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
  return res.json({ operator: clientOnboardingState(req.tenantOwnerId).operator, carrierStatus });
}));

app.post('/api/onboarding/calendar', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const profile = saveCalendar(req.tenantOwnerId, req.body || {});
  return res.json({ profile });
}));

app.get('/api/onboarding/calendar/google/start', requireAuth(['owner']), (req, res) => {
  const { state } = calendarOAuthState.issue(req.tenantOwnerId);
  res.json({ authorizationUrl: googleCalendarAuthorizationUrl(state) });
});

app.get('/api/onboarding/calendar/google/callback', requireProviderWrites, asyncHandler(async (req, res) => {
  if (typeof req.query.code !== 'string' || !req.query.code.trim()) {
    return res.status(400).json({ error: 'Calendar authorization was not completed. Start the connection again.' });
  }
  // Consume the persisted owner-bound state before any provider or account mutation.
  const { ownerId } = calendarOAuthState.consume(req.query.state);
  if (!hasProviderWriteAccess(accessAccount(ownerId))) {
    return res.status(403).json({ error: 'This account is not eligible for provider operations.' });
  }
  const tokens = await exchangeGoogleCalendarCode(req.query.code);
  saveGoogleCalendarTokens(ownerId, tokens);
  const clientUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
  return res.redirect(clientUrl + '/onboarding?step=8&calendar=connected');
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

app.post('/api/pricebook/interview/:draftId/assist', requireAuth(['owner']), requireQuoteDonePlan, requireProviderWrites, asyncHandler(async (req, res) => {
  res.json(await assistInterviewDraft(req.tenantOwnerId, req.params.draftId, req.body || {}));
}));

app.get('/api/pricebook/interview/:draftId/review', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  return res.json(draftReviewPayload(req.tenantOwnerId, req.params.draftId));
}));

installQuoteDoneRoutes(app, {
  asyncHandler,
  requireQuoteDonePlan,
  bookingService,
  bookingTokenSecret
});
if (bookingService) {
  installBookingRoutes(app, {
    bookingService,
    preferenceService: bookingPreferenceService,
    asyncHandler,
    requireAuth,
    database: db
  });
}
installOwnerCalendarRoutes(app, {
  service: ownerCalendarService, requireAuth, requireOperatorAccess,
  requireProviderOperationsEnabled, asyncHandler
});
installBookingAdminRoutes(app, {
  adminService: bookingAdminService,
  requireAuth,
  requireOperatorAccess,
  requireQuoteDonePlan,
  asyncHandler
});

app.post('/api/pricebook/suggest', requireAuth(['owner']), requireQuoteDonePlan, requireProviderWrites, asyncHandler(async (req, res) => {
  const suggestions = await suggestStarterBook({ industry: req.body?.industry, serviceTypes: req.body?.serviceTypes });
  return res.json({
    suggestions: suggestions.map(service => ({ ...service, source: 'AI_SUGGESTED', status:'DRAFT', active:false, confirmedFields: {} })),
    warning: 'These are AI-suggested placeholder prices. Review and confirm each value before going live.'
  });
}));

app.post('/api/quote/test', requireAuth(['owner']), requireQuoteDonePlan, asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
  const result = previewApplicationQuote(req.tenantOwnerId, req.body || {});
  console.log('[quote-test-breakdown]', JSON.stringify(result, null, 2));
  return res.json(result);
}));

app.get('/api/dashboard', requireAuth(['owner', 'staff']), (req, res) => {
  const profileState = clientOnboardingState(req.tenantOwnerId);
  const book = loadPricebook(req.tenantOwnerId);
  const quoteRequestCount = ownerQuery('SELECT COUNT(*) AS count FROM quoteRequests WHERE ownerId = ?').get(req.tenantOwnerId)?.count || 0;
  res.json({
    ownerId: req.tenantOwnerId,
    role: req.role,
    operator: profileState.operator,
    onboardingStep: profileState.profile.onboardingStep,
    quoteRequestCount,
    pricebookStatuses: req.role === 'owner' ? bookStatuses(book) : [],
    // Null outside local preview. Never fabricated for the real product.
    previewActivity: previewDashboardActivity(),
    sections: ['Home', 'Calls', 'Leads', 'Quotes', 'Customers', 'Price Book', 'Calendar', 'Settings']
  });
});

app.get('/api/admin', requireAuth(['admin']), (_req, res) => {
  res.json({ shell: 'admin', sections: ['Accounts list', 'Provisioning failures', 'A2P status', 'Platform metrics', 'Global kill switches', 'Support impersonation placeholder'] });
});

app.post('/api/twilio/voice/incoming', (_req, res) => {
  res.type('text/xml').send('<Response><Say>Your Off The Clock operator connection is ready.</Say></Response>');
});

if(deploymentConfig.production) installOwnerAssets(app,deploymentConfig.ownerDist);

app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return;
  const status = Number(err.statusCode) || 500;
  const code = typeof err.code === 'string' && /^[A-Z][A-Z0-9_]{2,63}$/.test(err.code)
    ? err.code
    : undefined;
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : err.message,
    ...(code ? { code } : {}),
    ...(typeof err.retryable === 'boolean' ? { retryable: err.retryable } : {}),
    ...(err.details ? { details: err.details } : {})
  });
});

const httpServer = app.listen(port, () => {
  console.log(`Off The Clock AI server listening on ${port}`);
});

const stopWebhookWorker = outboundWebhooks.start({onError:code=>console.error(`[webhook-worker] ${code}`)});
const backupWorker = deploymentConfig.production ? startBackupScheduler(db,deploymentConfig) : null;
lifecycle.attach(httpServer,{stopWorkers:[stopWebhookWorker,...(backupWorker?[backupWorker.stop]:[])],timeoutMs:deploymentConfig.shutdownMs || 110000});
httpServer.on('close',()=>{void stopWebhookWorker();void backupWorker?.stop();});

export {httpServer,lifecycle};

export default app;
