import { BookingServiceError } from './bookingService.js';
import {guardTenantRequest} from './tenantRequest.js';
import {accountAccessDecision} from './planAccess.js';
import {usageOwnerQuery} from './billingUsagePolicy.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCATION_FIELDS = ['addressLine1', 'addressLine2', 'city', 'region', 'postalCode', 'country'];
const budgets = new Map();

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function problem(code, statusCode, message, details) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details) error.details = details;
  return error;
}

function exactKeys(value, allowed, label) {
  if (!record(value)) throw problem('INVALID_REQUEST', 400, `${label} must be an object.`);
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) {
    throw problem('INVALID_REQUEST', 400, `${label} contains unsupported fields.`, { fields: extras });
  }
}

function requireUnchangedScope(body) {
  if (body?.scopeConfirmation === 'CHANGED') {
    throw problem('REQUOTE_REQUIRED', 409, 'Return to the quote flow when work or measurements change.', {
      recoveryAction: 'CHANGE_JOB_DETAILS'
    });
  }
  if (body?.scopeConfirmation !== 'UNCHANGED') {
    throw problem('INVALID_REQUEST', 400, 'Confirm that the quoted job details are unchanged.');
  }
}

function validateCustomer(value, { callback = false } = {}) {
  exactKeys(value, ['name', 'email', 'phone'], 'Customer');
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const email = typeof value.email === 'string' ? value.email.trim() : '';
  const phone = typeof value.phone === 'string' ? value.phone.trim() : '';
  if (!name) throw problem('INVALID_REQUEST', 400, 'Customer name is required.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw problem('INVALID_REQUEST', 400, 'Enter a valid customer email address.');
  }
  if (phone && !/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw problem('INVALID_REQUEST', 400, 'Enter the customer phone number in international format.');
  }
  if (callback && !email && !phone) {
    throw problem('INVALID_REQUEST', 400, 'A callback email or phone number is required.');
  }
}

function validateLocation(value) {
  exactKeys(value, LOCATION_FIELDS, 'Location');
  for (const key of LOCATION_FIELDS) {
    if (key === 'addressLine2') continue;
    if (typeof value[key] !== 'string' || !value[key].trim()) {
      throw problem('INVALID_REQUEST', 400, 'Confirm the complete project address before booking.', {
        fields: [key]
      });
    }
  }
}

function validateAvailabilityBody(body) {
  exactKeys(body, [
    'fromDate', 'days', 'timeOfDay', 'tierName', 'scopeConfirmation',
    'customer', 'location'
  ], 'Availability request');
  requireUnchangedScope(body);
  validateCustomer(body.customer);
  validateLocation(body.location);
  if (body.tierName !== undefined && typeof body.tierName !== 'string') {
    throw problem('INVALID_REQUEST', 400, 'Quote option must be text.');
  }
}

function validateHoldBody(body) {
  exactKeys(body, ['slotId'], 'Hold request');
  if (typeof body.slotId !== 'string' || !body.slotId) {
    throw problem('INVALID_REQUEST', 400, 'Choose a current available time.');
  }
}

function validateConfirmBody(body) {
  exactKeys(body, [
    'holdId', 'confirmedSlotId', 'explicitConfirmation', 'tierName',
    'customer', 'location', 'addressConfirmation'
  ], 'Confirmation request');
  if (!UUID.test(String(body.holdId || '')) || typeof body.confirmedSlotId !== 'string') {
    throw problem('INVALID_REQUEST', 400, 'A valid held time is required.');
  }
  if (body.explicitConfirmation !== true || body.addressConfirmation !== true) {
    throw problem('INVALID_REQUEST', 400, 'Explicit date, time, and address confirmation is required.');
  }
  if (body.tierName !== undefined && typeof body.tierName !== 'string') {
    throw problem('INVALID_REQUEST', 400, 'Quote option must be text.');
  }
  validateCustomer(body.customer, { callback: true });
  validateLocation(body.location);
}

function requestOrigin(req) {
  let origin = req.get('Origin');
  if (!origin && req.method === 'GET' && req.get('Sec-Fetch-Site') === 'same-origin') {
    try { origin = new URL(req.get('Referer')).origin; } catch { /* denied below */ }
  }
  return origin;
}

function parseAllowedOrigins(value) {
  try {
    const origins = JSON.parse(value);
    return Array.isArray(origins) && origins.every(origin => typeof origin === 'string')
      ? origins
      : [];
  } catch {
    return [];
  }
}

function publicRateLimit(req, res, next) {
  const key = `${req.bookingContext.ownerId}:${req.ip}`;
  const now = Date.now();
  const prior = budgets.get(key);
  const budget = prior && now - prior.startedAt < 60000 ? prior : { startedAt: now, count: 0 };
  budget.count += 1;
  budgets.set(key, budget);
  if (budgets.size > 10000) {
    for (const [id, value] of budgets) if (now - value.startedAt > 60000) budgets.delete(id);
  }
  if (budget.count > 60) {
    return res.status(429).json({ error: 'Please wait before trying again.', code: 'RATE_LIMITED' });
  }
  return next();
}

function idempotencyKey(req) {
  return req.get('Idempotency-Key');
}

export function installBookingRoutes(app, {
  bookingService,
  preferenceService,
  asyncHandler,
  requireAuth,
  database,
  ownerQuery=usageOwnerQuery(database)
}) {
  if (!bookingService || !asyncHandler || !requireAuth || !database) {
    throw new TypeError('Booking routes require booking, auth, async, and database dependencies.');
  }

  const accessStatement = ownerQuery(
    'SELECT allowedOriginsJson FROM quoteAccessKeys WHERE ownerId = ?'
  );

  function publicBookingContext(req, res, next) {
    let resolved;
    try {
      resolved = bookingService.resolveBookingToken(req.params.bookingToken);
    } catch (error) {
      if (error instanceof BookingServiceError && error.code === 'BOOKING_CONTEXT_EXPIRED') {
        return res.status(410).json({ error: error.message, code: error.code });
      }
      return res.status(404).json({ error: 'Booking link not found.', code: 'BOOKING_CONTEXT_NOT_FOUND' });
    }
    const access = accessStatement.get(resolved.ownerId);
    const origin = requestOrigin(req);
    if (!origin || !access || !parseAllowedOrigins(access.allowedOriginsJson).includes(origin)) {
      return res.status(403).json({ error: 'This website is not authorized for this booking link.', code: 'ORIGIN_NOT_ALLOWED' });
    }
    req.tenantOwnerId = resolved.ownerId;
    if(!guardTenantRequest(req,res,req.tenantOwnerId))return;
    req.bookingContext = resolved;
    return next();
  }

  function authenticatedBookingContext(req, _res, next) {
    req.bookingContext = {
      ownerId: req.tenantOwnerId,
      intentId: req.params.bookingIntentId
    };
    return next();
  }

  function requireBookingAccess(req, res, next) {
    const owner=ownerQuery("SELECT plan,planStatus,trialEndsAt,paymentFailedAt,paidThroughAt,annualPaidThroughAt,serviceEndsAt FROM users WHERE id=@ownerId AND role='owner'").get({ownerId:req.bookingContext.ownerId});
    if(!accountAccessDecision(owner).allowed)return res.status(403).json({error:'This business is currently unavailable.',code:'BOOKING_UNAVAILABLE'});
    return next();
  }

  const publicPrefix = '/api/public/bookings/:bookingToken';
  app.post(`${publicPrefix}/availability`, publicBookingContext, requireBookingAccess, publicRateLimit, asyncHandler(async (req, res) => {
    validateAvailabilityBody(req.body);
    const result = await bookingService.availability({
      ...req.bookingContext,
      filters: req.body
    });
    return res.status(result.statusCode).json(result.body);
  }));
  app.post(`${publicPrefix}/holds`, publicBookingContext, requireBookingAccess, publicRateLimit, asyncHandler(async (req, res) => {
    validateHoldBody(req.body);
    const result = bookingService.hold({
      ...req.bookingContext,
      idempotencyKey: idempotencyKey(req),
      slotId: req.body.slotId
    });
    return res.status(result.statusCode).json(result.body);
  }));
  app.delete(`${publicPrefix}/holds/:holdId`, publicBookingContext, publicRateLimit, asyncHandler(async (req, res) => {
    exactKeys(req.body || {}, [], 'Release request');
    const result = bookingService.releaseHold({
      ...req.bookingContext,
      idempotencyKey: idempotencyKey(req),
      holdId: req.params.holdId
    });
    return res.status(result.statusCode).json(result.body);
  }));
  app.post(`${publicPrefix}/confirm`, publicBookingContext, requireBookingAccess, publicRateLimit, asyncHandler(async (req, res) => {
    validateConfirmBody(req.body);
    const result = await bookingService.confirm({
      ...req.bookingContext,
      idempotencyKey: idempotencyKey(req),
      body: req.body
    });
    return res.status(result.statusCode).json(result.body);
  }));
  app.get(`${publicPrefix}/confirmations/:confirmationId`, publicBookingContext, publicRateLimit, asyncHandler(async (req, res) => {
    const result = await bookingService.getConfirmationStatus({
      bookingToken: req.params.bookingToken,
      confirmationId: req.params.confirmationId
    });
    return res.status(result.statusCode).json(result.body);
  }));
  if (preferenceService) {
    app.post(`${publicPrefix}/preference`, publicBookingContext, requireBookingAccess, publicRateLimit, asyncHandler(async (req, res) => {
      exactKeys(req.body, ['scopeConfirmation', 'preferredWindows', 'customer', 'location', 'note'], 'Preference request');
      requireUnchangedScope(req.body);
      const result = preferenceService.request({
        ...req.bookingContext,
        idempotencyKey: idempotencyKey(req),
        body: {
          preferredWindows: req.body.preferredWindows,
          customer: req.body.customer,
          location: req.body.location,
          note: req.body.note
        }
      });
      return res.status(result.statusCode).json(result.body);
    }));
  }

  const team = [requireAuth(['owner', 'staff']), authenticatedBookingContext];
  app.post('/api/bookings/:bookingIntentId/availability', ...team, asyncHandler(async (req, res) => {
    validateAvailabilityBody(req.body);
    const result = await bookingService.availability({ ...req.bookingContext, filters: req.body });
    return res.status(result.statusCode).json(result.body);
  }));
  app.post('/api/bookings/:bookingIntentId/holds', ...team, asyncHandler(async (req, res) => {
    validateHoldBody(req.body);
    const result = bookingService.hold({
      ...req.bookingContext,
      idempotencyKey: idempotencyKey(req),
      slotId: req.body.slotId
    });
    return res.status(result.statusCode).json(result.body);
  }));
  app.delete('/api/bookings/:bookingIntentId/holds/:holdId', ...team, asyncHandler(async (req, res) => {
    exactKeys(req.body || {}, [], 'Release request');
    const result = bookingService.releaseHold({
      ...req.bookingContext,
      idempotencyKey: idempotencyKey(req),
      holdId: req.params.holdId
    });
    return res.status(result.statusCode).json(result.body);
  }));
  app.post('/api/bookings/:bookingIntentId/confirm', ...team, asyncHandler(async (req, res) => {
    validateConfirmBody(req.body);
    const result = await bookingService.confirm({
      ...req.bookingContext,
      idempotencyKey: idempotencyKey(req),
      body: req.body
    });
    return res.status(result.statusCode).json(result.body);
  }));
  if (preferenceService) {
    app.post('/api/bookings/:bookingIntentId/preference', ...team, asyncHandler(async (req, res) => {
      exactKeys(req.body, ['scopeConfirmation', 'preferredWindows', 'customer', 'location', 'note'], 'Preference request');
      requireUnchangedScope(req.body);
      const result = preferenceService.request({
        ...req.bookingContext,
        idempotencyKey: idempotencyKey(req),
        body: {
          preferredWindows: req.body.preferredWindows,
          customer: req.body.customer,
          location: req.body.location,
          note: req.body.note
        }
      });
      return res.status(result.statusCode).json(result.body);
    }));
  }
}
