import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { migrate } from './db.js';
import { adminLogin, forgotPassword, login, register, resetPassword, verifyEmail, requireAuth } from './auth.js';
import { CREATE_TABLE_STATEMENTS } from './schema.js';
import { generateQuote, sanitizeForCustomer } from '../quoteEngine.js';
import { centsToDollars, dollarsToCents, loadPricebook, savePricebook } from '../priceBookService.js';
import { resolveJurisdiction } from '../taxJurisdiction.js';
import { insertQuoteLog } from '../quoteLog.js';
import { getRequiredOwnerFields } from '../quoteTemplates.js';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

const app = express();
const port = Number(process.env.PORT || 3000);

// Route any async handler error to the global error handler instead of
// crashing the process (Express 4 does not catch async throws).
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

migrate();

app.use(cors());
app.use(express.json());

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

app.post('/api/quote/calculate', requireAuth(['owner', 'staff']), asyncHandler(async (req, res) => {
  const ownerId = req.ownerId;
  const { serviceType, customerInputs = {}, callerType = 'owner' } = req.body || {};
  const pricebook = loadPricebook(ownerId);
  const service = (pricebook.services || []).find(s => s.serviceType === serviceType || s.service === serviceType);
  if (!service) return res.status(404).json({ error: 'Service not found in price book' });
  const result = generateQuote({ serviceType: service.serviceType, customerInputs, ownerPricing: service, businessDefaults: pricebook.defaults || {}, callerType });
  insertQuoteLog(ownerId, result.quoteId, service.serviceType, customerInputs, result, callerType, result.urgencyFlags?.join('; ') || null);
  return res.json(callerType === 'customer' ? sanitizeForCustomer(result) : result);
}));

app.post('/api/quote/test', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') return res.status(404).json({ error: 'Not found' });
  const result = generateQuote(req.body || {});
  console.log('[quote-test-breakdown]', JSON.stringify(result, null, 2));
  return res.json(result);
}));

app.post('/api/business/jurisdiction', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const resolved = resolveJurisdiction(req.body?.country, req.body?.region);
  const book = loadPricebook(req.ownerId);
  const defaults = { ...(book.defaults || {}) };
  if (resolved.taxMode) defaults.taxMode = resolved.taxMode;
  if (resolved.taxPercent !== null && resolved.taxPercent !== undefined) defaults.taxPercent = resolved.taxPercent;
  savePricebook(req.ownerId, { ...book, defaults });
  return res.json(resolved);
}));

app.post('/api/pricebook/suggest', requireAuth(['owner']), (_req, res) => {
  return res.status(503).json({ error: 'Could not generate suggestions. Please build your price book manually.' });
});

app.post('/api/pricebook/save', requireAuth(['owner']), asyncHandler(async (req, res) => {
  const incoming = dollarsToCents(req.body || {});
  const services = incoming.services || [];
  const statuses = services.map(service => {
    const fields = getRequiredOwnerFields(service.serviceType, {});
    const missing = fields.filter(field => field === 'postsIncludedInMaterial' ? service[field] === undefined : service[field] === undefined || service[field] === null || service[field] === 0);
    return { serviceType: service.serviceType, status: missing.length ? 'NEEDS PRICING' : 'QUOTING LIVE', missingOwnerFields: missing };
  });
  savePricebook(req.ownerId, incoming);
  return res.json({ success: true, statuses });
}));

app.get('/api/pricebook/:ownerId', requireAuth(['owner', 'staff']), (req, res) => {
  if (req.params.ownerId !== req.ownerId) return res.status(403).json({ error: 'Forbidden' });
  return res.json(centsToDollars(loadPricebook(req.ownerId)));
});

app.get('/api/dashboard', requireAuth(['owner', 'staff']), (req, res) => {
  res.json({ ownerId: req.ownerId, shell: 'dashboard', sections: ['Home', 'Calls', 'Leads', 'Quotes', 'Customers', 'Price Book', 'Calendar', 'Settings'] });
});

app.get('/api/admin', requireAuth(['admin']), (_req, res) => {
  res.json({ shell: 'admin', sections: ['Accounts list', 'Provisioning failures', 'A2P status', 'Platform metrics', 'Global kill switches', 'Support impersonation placeholder'] });
});

// Global error handler - never let a request error kill the process.
app.use((err, _req, res, _next) => {
  console.error('[error]', err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`Off The Clock AI server listening on ${port}`);
});

export default app;
