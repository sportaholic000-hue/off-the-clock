import './pricebookTestEnv.mjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import Database from 'better-sqlite3';

process.env.JWT_SECRET ||= 'test-jwt-secret-key-for-travel-zones-20261020';

import { generateQuoteVNext, vNextServiceStatus } from '../server/quote-engine-vnext/index.js';
import { convertPricebookMoney, validatePricebookNumericDraft } from '../server/priceBookMoney.js';
import { loadPricebook } from '../server/priceBookService.js';
import {
  applicationServiceDefinition,
  approveApplicationService,
  calculateApplicationQuote,
  prepareApplicationIntake,
  readApplicationBook,
  saveApplicationBook
} from '../server/src/quoteDoneBridge.js';
import { JOB_DETAILS_FLOW } from '../server/src/quoteIntake.js';
import { migrateDatabase } from '../server/src/migrations.js';
import { createOwnerCallService } from '../server/src/ownerCallService.js';
import { storedLeadView } from '../server/src/ownerRecordViews.js';
import { createVoiceToolRuntime } from '../server/src/voice/voiceToolRuntime.js';
import { checkQuoteBookingPostalCode, extractQuotedPostalCode } from '../server/travelZones.js';
import { isServiceAreaConfigured, serviceAreaDecision } from '../server/src/serviceArea.js';
import { resolveBookingCapability } from '../server/src/bookingCapabilities.js';
import { createBookingService } from '../server/src/bookingService.js';
import { createBookingPreferenceService } from '../server/src/bookingPreferenceService.js';

const MOWING_SERVICE_ID = '11111111-2222-4333-8444-555555555555';

function buildMowingServiceCents(ownerId = 'owner-zones-test') {
  return {
    id: MOWING_SERVICE_ID,
    serviceType: 'LANDSCAPING_MOWING',
    service: 'Lawn Mowing',
    source: 'MANUAL',
    active: true,
    origin: {
      serviceId: MOWING_SERVICE_ID,
      serviceType: 'LANDSCAPING_MOWING',
      source: 'MANUAL',
      ownerId,
      operationId: '22222222-2222-4222-8222-222222222222',
      createdAt: '2026-10-20T00:00:00.000Z'
    },
    pricing: {
      mowingBaseRatePerSqft: 2,
      minimumServiceCharge: 0,
      frequencyMultipliers: {
        weekly: 1,
        biweekly: 1.1,
        monthly: 1.2,
        one_time: 1.25
      },
      overgrowthMultipliers: {
        maintained: 1,
        overgrown: 1.5,
        severe: 2
      },
      baggingSurchargePercent: 10,
      edgingPerLinearFoot: 10
    },
    zeroPricePolicy: {
      serviceId: MOWING_SERVICE_ID,
      ownerId,
      operationId: '33333333-3333-4333-8333-333333333333',
      approvedAt: '2026-10-20T00:00:00.000Z',
      freeCompleteService: false,
      freeTiers: [],
      includedPrices: {}
    },
    feeRules: {
      travel: 'always',
      disposal: 'not_applicable',
      permit: 'not_applicable',
      overhead: 'not_applicable'
    },
    priceBasisByCategory: {
      labor: 'sell_price',
      material: 'sell_price',
      removal: 'sell_price',
      prep: 'sell_price',
      addon: 'sell_price',
      equipment: 'sell_price',
      travel: 'sell_price',
      disposal: 'sell_price',
      permit: 'sell_price',
      overhead: 'sell_price',
      surcharge: 'sell_price'
    },
    taxabilityByCategory: {
      labor: false,
      material: false,
      removal: false,
      prep: false,
      addon: false,
      equipment: false,
      travel: false,
      disposal: false,
      permit: false,
      overhead: false,
      surcharge: false
    },
    tiers: []
  };
}

function buildDefaultsCents(overrides = {}) {
  return {
    currency: 'CAD',
    quoteTimeZone: 'America/Moncton',
    markupMode: 'markup',
    markupPercent: 0,
    markupApplies: {
      labor: false,
      material: false,
      removal: false,
      prep: false,
      addon: false,
      equipment: false,
      travel: false,
      disposal: false,
      permit: false,
      overhead: false,
      surcharge: false
    },
    overheadFixed: 0,
    minimumJobPrice: 0,
    travelFee: 2500,
    disposalFee: 0,
    permitFee: 0,
    taxMode: 'TAX_NONE',
    taxPercent: 0,
    rangeBufferPercent: 0,
    peakMonths: [],
    peakSurchargePercent: 0,
    ...overrides
  };
}

const REQUIRED_ZONES_CENTS = [
  { name: 'Core', codes: ['E2L', 'E2M'], charge: 0 },
  { name: 'Outer', codes: ['E2H', 'E2J'], charge: 3500 },
  { name: 'Maine', codes: ['041'], charge: 4500 }
];

// Pre-calculated base labor for BASE_MOWING_INPUTS:
// - Mowing labor: 3,000 sqft * 2 cents/sqft * 1.25 (one_time) * 1 (maintained) = 7,500 cents
// - Lawn edging: 300 LF * 10 cents/LF = 3,000 cents
// - Pre-travel labor total = 10,500 cents ($105.00)
const BASE_MOWING_INPUTS = {
  yardSqft: 3000,
  sqftMethod: 'exact',
  serviceFrequency: 'one_time',
  grassCondition: 'maintained',
  bagClippings: false,
  edgingIncluded: true,
  edgingLengthLF: 300
};

function travelCentsOf(optionOrQuote) {
  const line = (optionOrQuote.lineItems || []).find((item) => item.category === 'travel');
  return line ? line.amountCents : 0;
}

function totalCentsOf(optionOrQuote) {
  const rec = optionOrQuote.calculationRecord?.options
    ? optionOrQuote.calculationRecord.options[0]
    : optionOrQuote.calculationRecord;
  return rec.range.exactMidScenarioTotalCents;
}

test('Travel zones: Core ($0), Outer ($35.00), Maine ($45.00), out-of-zone review, invalid asked again, and most-specific match', () => {
  const service = buildMowingServiceCents();
  const defaults = buildDefaultsCents({ travelZones: REQUIRED_ZONES_CENTS });

  // Readiness check passes with zones configured.
  const readiness = vNextServiceStatus(service, defaults);
  assert.equal(readiness.status, 'QUOTING LIVE');

  // 1) "e2l 4l1" -> Core, 0 cents travel, 10,500 cents total ($105.00)
  const coreQuote = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: defaults,
    currentMonth: 6,
    customerInputs: { ...BASE_MOWING_INPUTS, postalCode: 'e2l 4l1' },
    callerType: 'owner'
  });
  assert.equal(coreQuote.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(travelCentsOf(coreQuote), 0);
  assert.equal(totalCentsOf(coreQuote), 10500);
  assert.equal(coreQuote.lowEstimate, 105);
  assert.equal(coreQuote.highEstimate, 105);
  assert.equal(coreQuote.options[0].calculationRecord.normalizedCustomerInputs.postalCode, 'E2L4L1');

  // 2) "E2J2A1" -> Outer, 3,500 cents travel (replaces 2,500 business-wide travelFee, not 6,000), 14,000 cents total ($140.00)
  const outerQuote = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: defaults,
    currentMonth: 6,
    customerInputs: { ...BASE_MOWING_INPUTS, postalCode: 'E2J2A1' },
    callerType: 'owner'
  });
  assert.equal(outerQuote.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(travelCentsOf(outerQuote), 3500);
  assert.notEqual(travelCentsOf(outerQuote), 6000);
  assert.equal(totalCentsOf(outerQuote), 14000);
  assert.equal(outerQuote.lowEstimate, 140);
  assert.equal(outerQuote.highEstimate, 140);
  assert.equal(outerQuote.submittedCustomerInputs.postalCode, 'E2J2A1');

  // 3) "04101" -> Maine (prefix 041), 4,500 cents travel, 15,000 cents total ($150.00)
  const maineQuote = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: defaults,
    currentMonth: 6,
    customerInputs: { ...BASE_MOWING_INPUTS, postalCode: '04101' },
    callerType: 'owner'
  });
  assert.equal(maineQuote.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(travelCentsOf(maineQuote), 4500);
  assert.equal(totalCentsOf(maineQuote), 15000);
  assert.equal(maineQuote.lowEstimate, 150);
  assert.equal(maineQuote.highEstimate, 150);
  assert.equal(maineQuote.submittedCustomerInputs.postalCode, '04101');

  // 4) "E3B 5A3" -> outside every zone -> review with owner-facing reason
  const outsideQuote = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: defaults,
    currentMonth: 6,
    customerInputs: { ...BASE_MOWING_INPUTS, postalCode: 'E3B 5A3' },
    callerType: 'owner'
  });
  assert.equal(outsideQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(outsideQuote.reviewReason, 'Postal or ZIP code E3B5A3 is outside configured travel zones.');
  assert.deepEqual(outsideQuote.invalidCustomerFields, []);
  assert.deepEqual(outsideQuote.missingCustomerFields, []);

  // 5) "12" -> invalid code -> invalidCustomerFields: ['postalCode'] (asked again in widget/voice)
  const invalidQuote = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: defaults,
    currentMonth: 6,
    customerInputs: { ...BASE_MOWING_INPUTS, postalCode: '12' },
    callerType: 'owner'
  });
  assert.equal(invalidQuote.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.deepEqual(invalidQuote.invalidCustomerFields, ['postalCode']);

  // Most-specific entry match: 5-digit ZIP 04101 ($15.00 = 1,500 cents) beats 3-digit prefix 041 ($45.00 = 4,500 cents)
  const specificityDefaults = buildDefaultsCents({
    travelZones: [
      ...REQUIRED_ZONES_CENTS,
      { name: 'Portland Downtown', codes: ['04101'], charge: 1500 }
    ]
  });
  const downtownQuote = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: specificityDefaults,
    currentMonth: 6,
    customerInputs: { ...BASE_MOWING_INPUTS, postalCode: '04101' },
    callerType: 'owner'
  });
  assert.equal(downtownQuote.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(travelCentsOf(downtownQuote), 1500);
  assert.equal(totalCentsOf(downtownQuote), 12000);
});

test('Recurring weekly mowing quote in Outer applies the 3,500-cent zone charge per visit exactly where travelFee applies per visit', () => {
  const service = buildMowingServiceCents();
  const zonedDefaults = buildDefaultsCents({ travelFee: 2500, travelZones: REQUIRED_ZONES_CENTS });
  const equivalentFlatDefaults = buildDefaultsCents({ travelFee: 3500 });

  // Weekly mowing with overgrown grass:
  // - Recurring weekly visit (maintained 1x): 3,000 * 2 * 1 * 1 = 6,000 mowing + 3,000 edging = 9,000 labor + 3,500 Outer travel = 12,500 cents ($125.00)
  // - First visit (overgrown 1.5x): 3,000 * 2 * 1 * 1.5 = 9,000 mowing + 3,000 edging = 12,000 labor + 3,500 Outer travel = 15,500 cents ($155.00)
  const weeklyInputs = {
    yardSqft: 3000,
    sqftMethod: 'exact',
    serviceFrequency: 'weekly',
    grassCondition: 'overgrown',
    bagClippings: false,
    edgingIncluded: true,
    edgingLengthLF: 300
  };

  const zonedWeekly = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: zonedDefaults,
    currentMonth: 6,
    customerInputs: { ...weeklyInputs, postalCode: 'E2J2A1' },
    callerType: 'owner'
  });

  const flatWeekly = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: equivalentFlatDefaults,
    currentMonth: 6,
    customerInputs: weeklyInputs,
    callerType: 'owner'
  });

  assert.equal(zonedWeekly.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(zonedWeekly.priceUnit, 'per visit');
  assert.equal(travelCentsOf(zonedWeekly), 3500);
  assert.equal(totalCentsOf(zonedWeekly), 12500);
  assert.equal(zonedWeekly.lowEstimate, 125);
  assert.equal(zonedWeekly.highEstimate, 125);

  assert.equal(travelCentsOf(zonedWeekly.firstVisit), 3500);
  assert.equal(totalCentsOf(zonedWeekly.firstVisit), 15500);
  assert.equal(zonedWeekly.firstVisit.lowEstimate, 155);
  assert.equal(zonedWeekly.firstVisit.highEstimate, 155);

  // Exact match with today's per-visit travelFee application
  assert.equal(travelCentsOf(zonedWeekly), travelCentsOf(flatWeekly));
  assert.equal(totalCentsOf(zonedWeekly), totalCentsOf(flatWeekly));
  assert.equal(zonedWeekly.lowEstimate, flatWeekly.lowEstimate);
  assert.equal(zonedWeekly.highEstimate, flatWeekly.highEstimate);
  assert.equal(travelCentsOf(zonedWeekly.firstVisit), travelCentsOf(flatWeekly.firstVisit));
  assert.equal(totalCentsOf(zonedWeekly.firstVisit), totalCentsOf(flatWeekly.firstVisit));
  assert.equal(zonedWeekly.firstVisit.lowEstimate, flatWeekly.firstVisit.lowEstimate);
  assert.equal(zonedWeekly.firstVisit.highEstimate, flatWeekly.firstVisit.highEstimate);
});

test('No zones defined: no postal question in widget or voice, and every quote gives the same cents as 98d4e0f', async () => {
  const service = buildMowingServiceCents();
  const defaultsNoZones = buildDefaultsCents({ travelFee: 2500 });

  const defNoZones = applicationServiceDefinition(service, { defaults: defaultsNoZones });
  assert.equal(defNoZones.customerFields.some((f) => f.name === 'postalCode'), false);

  const defWithZones = applicationServiceDefinition(service, {
    defaults: buildDefaultsCents({ travelZones: REQUIRED_ZONES_CENTS })
  });
  assert.equal(defWithZones.customerFields.some((f) => f.name === 'postalCode'), true);
  assert.equal(
    defWithZones.customerFields.some((f) => /address|street|city/i.test(f.name)),
    false
  );

  // Without zones: 10,500 labor + 2,500 business-wide travelFee = 13,000 cents ($130.00)
  const unzonedQuote = generateQuoteVNext({
    serviceType: 'LANDSCAPING_MOWING',
    ownerPricing: service,
    businessDefaults: defaultsNoZones,
    currentMonth: 6,
    customerInputs: BASE_MOWING_INPUTS,
    callerType: 'owner'
  });
  assert.equal(unzonedQuote.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(travelCentsOf(unzonedQuote), 2500);
  assert.equal(totalCentsOf(unzonedQuote), 13000);
  assert.equal(unzonedQuote.lowEstimate, 130);
  assert.equal(unzonedQuote.highEstimate, 130);
});

test('Widget and Phone (voice tool runtime): asks only postal/ZIP code before quote, re-asks "12", sends "E3B 5A3" to review, prices "E2J" at 3,500 cents travel without street address, and stores postalCode for owner', async () => {
  const ownerId = `owner-zones-${crypto.randomUUID()}`;
  const db = new Database(':memory:');
  migrateDatabase(db);

  const nowIso = '2026-10-20T15:00:00.000Z';
  db.prepare(`INSERT INTO users (id, email, passwordHash, firstName, businessName, role, createdAt) VALUES (?, ?, 'hash', 'Alex', 'Off The Clock Lawn', 'owner', ?)`).run(
    ownerId,
    `${ownerId}@example.com`,
    nowIso
  );

  // Save and approve mowing service with travelZones via application bridge (dollars at draft boundary -> cents in storage)
  const initialBook = readApplicationBook(ownerId);
  const fullServiceDollars = convertPricebookMoney({ services: [buildMowingServiceCents(ownerId)] }, 'toDollars').services[0];
  const { origin: _origin, zeroPricePolicy: _zeroPricePolicy, ...serviceDollars } = fullServiceDollars;
  const defaultsDollars = {
    ...convertPricebookMoney({ defaults: buildDefaultsCents({ travelFee: 2500 }) }, 'toDollars').defaults,
    travelZones: [
      { name: 'Core', codes: ['E2L', 'E2M'], charge: 0 },
      { name: 'Outer', codes: ['E2H', 'E2J'], charge: 35 },
      { name: 'Maine', codes: ['041'], charge: 45 }
    ]
  };
  assert.equal(validatePricebookNumericDraft({ services: [serviceDollars], defaults: defaultsDollars }), true);

  const saved = saveApplicationBook(ownerId, {
    revision: initialBook.revision,
    services: [serviceDollars],
    defaults: defaultsDollars
  });
  approveApplicationService(ownerId, MOWING_SERVICE_ID, {
    revision: saved.revision,
    confirmConfiguration: true,
    source: 'MANUAL',
    zeroClassification: {
      freeCompleteService: false,
      freeTiers: [],
      includedPrices: {}
    }
  });

  // Widget prepare: invalid code "12" is asked again (status: 'needs_details')
  const widgetInvalidPrep = prepareApplicationIntake(ownerId, {
    requestId: crypto.randomUUID(),
    serviceId: MOWING_SERVICE_ID,
    serviceRequest: 'Lawn Mowing',
    customerInputs: { ...BASE_MOWING_INPUTS, postalCode: '12' },
    contact: { email: 'customer@example.com' },
    urgency: 'flexible',
    intakeFlow: JOB_DETAILS_FLOW
  });
  assert.equal(widgetInvalidPrep.status, 'needs_details');
  assert.ok(widgetInvalidPrep.followUps.includes('Check Postal or ZIP code.'));

  // Widget prepare & calculate: valid code "e2l 4l1" -> ready -> 10,500 cents ($105.00, 0 travel)
  const coreReqId = crypto.randomUUID();
  const corePayload = {
    requestId: coreReqId,
    serviceId: MOWING_SERVICE_ID,
    serviceRequest: 'Lawn Mowing',
    customerInputs: { ...BASE_MOWING_INPUTS, postalCode: 'e2l 4l1' },
    contact: { email: 'customer@example.com' },
    urgency: 'flexible',
    intakeFlow: JOB_DETAILS_FLOW
  };
  const widgetCorePrep = prepareApplicationIntake(ownerId, corePayload);
  assert.equal(widgetCorePrep.status, 'ready');

  const rawCentsBook = loadPricebook(ownerId);
  const calcCore = calculateApplicationQuote(
    rawCentsBook,
    rawCentsBook.services[0],
    { ...corePayload, intakeConfirmation: widgetCorePrep.confirmation },
    { ownerId }
  );
  assert.equal(calcCore.customerResult.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(calcCore.customerResult.lowEstimate, 105);
  assert.equal(travelCentsOf(calcCore.internalResult), 0);
  assert.equal(totalCentsOf(calcCore.internalResult), 10500);

  // Voice Receptionist flow: caller in E2J gives postal code, gets quote with 3,500-cent travel charge, never asked for street address
  const callId = crypto.randomUUID();
  const callSid = 'CA' + '2'.repeat(32);
  const accountSid = 'AC' + '1'.repeat(32);
  const callerPhone = '+15065550199';
  const destPhone = '+15065550100';

  db.prepare(`INSERT INTO calls (
    id, ownerId, callSid, accountSid, callerNumber, destinationNumber, status, duration, spamFiltered, createdAt
  ) VALUES (?, ?, ?, ?, ?, ?, 'in-progress', 0, 0, ?)`).run(
    callId,
    ownerId,
    callSid,
    accountSid,
    callerPhone,
    destPhone,
    nowIso
  );

  const callContext = {
    ownerId,
    callSid,
    accountSid,
    from: callerPhone,
    to: destPhone
  };

  const runtime = createVoiceToolRuntime({
    database: db,
    callContext,
    handleSecret: 'voice-zones-test-secret-key-32bytes',
    clock: () => new Date(nowIso)
  });

  const matched = await runtime.handlers.matchService({
    context: callContext,
    args: { query: 'Lawn Mowing' }
  });
  assert.equal(matched.status, 'matched');
  const questionFieldNames = matched.questionContract.fields.map((f) => f.field);
  assert.ok(questionFieldNames.includes('postalCode'));
  assert.equal(questionFieldNames.some((name) => /address|street|city/i.test(name)), false);

  // Phone invalid code "12" -> asked again
  const phoneInvalid = await runtime.handlers.getQuote({
    context: callContext,
    args: {
      serviceHandle: matched.serviceHandle,
      customerConfirmed: true,
      customerInputs: { ...BASE_MOWING_INPUTS, postalCode: '12' }
    }
  });
  assert.equal(phoneInvalid.status, 'needs_details');
  assert.ok(
    phoneInvalid.followUps.some((msg) => /valid Canadian postal code or 5-digit US ZIP code/i.test(msg))
  );

  // Phone caller in E2J gives postal code "E2J" -> quoted with 3,500-cent travel charge (total 14,000 cents = $140.00), no street address asked
  const phoneQuoted = await runtime.handlers.getQuote({
    context: callContext,
    args: {
      serviceHandle: matched.serviceHandle,
      customerConfirmed: true,
      customerInputs: { ...BASE_MOWING_INPUTS, postalCode: 'E2J' }
    }
  });
  assert.equal(phoneQuoted.status, 'quoted');
  assert.equal(phoneQuoted.resultType, 'INSTANT_ESTIMATE_READY');
  assert.equal(phoneQuoted.options[0].lowEstimate, 140);
  assert.equal(phoneQuoted.options[0].highEstimate, 140);

  // Verify postalCode is stored in quoteRequests and shown in owner views
  const ownerQuery = (sql) => db.prepare(sql);
  const callService = createOwnerCallService({ ownerQuery });
  const callDetail = callService.detail({ ownerId, id: callId, role: 'owner' });
  assert.equal(callDetail.quoteRequests.length, 1);
  assert.equal(callDetail.quoteRequests[0].postalCode, 'E2J');
  assert.equal(callDetail.quotes.length, 1);
  assert.equal(callDetail.quotes[0].postalCode, 'E2J');
  assert.equal(travelCentsOf(callDetail.quotes[0].internal.applicationOutcome.internalResult), 3500);
  assert.equal(totalCentsOf(callDetail.quotes[0].internal.applicationOutcome.internalResult), 14000);

  // Phone caller outside zones "E3B 5A3" -> goes to review with owner-facing reason and stores postalCode
  const phoneOut = await runtime.handlers.getQuote({
    context: callContext,
    args: {
      serviceHandle: matched.serviceHandle,
      customerConfirmed: true,
      customerInputs: { ...BASE_MOWING_INPUTS, postalCode: 'E3B 5A3' }
    }
  });
  assert.equal(phoneOut.resultType, 'ESTIMATE_REQUIRES_REVIEW');
  assert.equal(typeof phoneOut.quoteHandle, 'string');

  const callDetailAfterOut = callService.detail({ ownerId, id: callId, role: 'owner' });
  assert.equal(callDetailAfterOut.leads.length, 1);
  assert.equal(callDetailAfterOut.leads[0].postalCode, 'E3B5A3');
  assert.equal(
    callDetailAfterOut.leads[0].reviewReason,
    'Postal or ZIP code E3B5A3 is outside configured travel zones.'
  );
  assert.equal(callDetailAfterOut.quoteRequests.length, 2);
  assert.deepEqual(
    callDetailAfterOut.quoteRequests.map((r) => r.postalCode).sort(),
    ['E2J', 'E3B5A3']
  );
});

test('Quote-to-booking postal-code and travel-zone consistency across serviceArea, bookingService, bookingPreferenceService, and voice', async () => {
  // 1) Pure postal-code and travel-zone binding checks
  assert.equal(
    checkQuoteBookingPostalCode({
      quotedPostalCode: 'e2l 4l1',
      bookingPostalCode: 'E2L4L1',
      travelZones: REQUIRED_ZONES_CENTS
    }).ok,
    true
  );
  // Voice FSA E2J matches full postal code E2J 2A1 in the same Outer zone
  assert.equal(
    checkQuoteBookingPostalCode({
      quotedPostalCode: 'E2J',
      bookingPostalCode: 'e2j 2a1',
      travelZones: REQUIRED_ZONES_CENTS
    }).ok,
    true
  );
  // Mismatched zone: quoted Core (E2L 4L1, $0) vs booking Outer (E2J 2A1, $35) -> POSTAL_CODE_MISMATCH
  const zoneSwap = checkQuoteBookingPostalCode({
    quotedPostalCode: 'E2L 4L1',
    bookingPostalCode: 'E2J 2A1',
    travelZones: REQUIRED_ZONES_CENTS
  });
  assert.equal(zoneSwap.ok, false);
  assert.equal(zoneSwap.reason, 'POSTAL_CODE_MISMATCH');

  // 2) serviceAreaDecision & isServiceAreaConfigured with travelZones when city serviceArea is unconfigured
  assert.equal(isServiceAreaConfigured(null, { travelZones: REQUIRED_ZONES_CENTS }), true);
  assert.deepEqual(
    serviceAreaDecision(null, { postalCode: 'E2J 2A1' }, { travelZones: REQUIRED_ZONES_CENTS }),
    { eligible: true, reason: 'IN_AREA' }
  );
  assert.deepEqual(
    serviceAreaDecision(null, { postalCode: 'E3B 5A3' }, { travelZones: REQUIRED_ZONES_CENTS }),
    { eligible: false, reason: 'OUT_OF_AREA' }
  );

  // 3) Widget / HTTP Booking & Preference: cannot quote in Core (E2L 4L1, $0) and book or request preference in Outer (E2J 2A1, $35)
  const ownerId = `owner-booking-zones-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date('2026-06-15T13:00:00.000Z');
  const nowIso = now.toISOString();

  const initialBook = readApplicationBook(ownerId);
  const fullServiceDollars = convertPricebookMoney({ services: [buildMowingServiceCents(ownerId)] }, 'toDollars').services[0];
  const { origin: _origin, zeroPricePolicy: _zeroPricePolicy, ...serviceDollars } = fullServiceDollars;
  const defaultsDollars = {
    ...convertPricebookMoney({ defaults: buildDefaultsCents({ travelFee: 2500 }) }, 'toDollars').defaults,
    travelZones: [
      { name: 'Core', codes: ['E2L', 'E2M'], charge: 0 },
      { name: 'Outer', codes: ['E2H', 'E2J'], charge: 35 },
      { name: 'Maine', codes: ['041'], charge: 45 }
    ]
  };
  const savedBook = saveApplicationBook(ownerId, {
    revision: initialBook.revision,
    services: [serviceDollars],
    defaults: defaultsDollars
  });
  approveApplicationService(ownerId, MOWING_SERVICE_ID, {
    revision: savedBook.revision,
    confirmConfiguration: true,
    source: 'MANUAL',
    zeroClassification: {
      freeCompleteService: false,
      freeTiers: [],
      includedPrices: {}
    }
  });

  const db = new Database(':memory:');
  migrateDatabase(db);
  db.prepare(`INSERT INTO users (
    id, email, passwordHash, firstName, businessName, plan, planStatus, timezone, role, createdAt
  ) VALUES (?, ?, 'hash', 'Owner', 'Zone Lawn Care', 'QuoteDone', 'active', 'America/Moncton', 'owner', ?)`).run(
    ownerId,
    `${ownerId}@example.com`,
    nowIso
  );
  db.prepare(`INSERT INTO businessProfiles (ownerId, knowledgeBaseJson, updatedAt) VALUES (?, '{}', ?)`).run(ownerId, nowIso);
  db.prepare(`INSERT INTO bookingSettings (
    ownerId, revision, timezone, provider, calendarId, weeklyAvailabilityJson, blackoutsJson,
    bookingHorizonDays, minimumNoticeMinutes, slotIncrementMinutes, bufferBeforeMinutes, bufferAfterMinutes,
    directBookingEnabled, updatedAt
  ) VALUES (?, 'rev-settings-1', 'America/Moncton', 'google', 'primary', ?, '[]', 14, 60, 60, 0, 0, 1, ?)`).run(
    ownerId,
    JSON.stringify({
      mon: [{ start: '09:00', end: '17:00' }],
      tue: [{ start: '09:00', end: '17:00' }],
      wed: [{ start: '09:00', end: '17:00' }],
      thu: [{ start: '09:00', end: '17:00' }],
      fri: [{ start: '09:00', end: '17:00' }]
    }),
    nowIso
  );
  db.prepare(`INSERT INTO bookingPolicies (
    ownerId, serviceId, revision, bookingMode, durationMinutes, enabled, updatedAt
  ) VALUES (?, ?, 'rev-policy-1', 'book_job', 60, 1, ?)`).run(ownerId, MOWING_SERVICE_ID, nowIso);

  const createdEvents = [];
  const bookingService = createBookingService({
    db,
    clock: () => new Date(nowIso),
    slotTokenSecret: 'booking-zones-slot-secret-32bytes-minimum',
    calendar: {
      listBusy: async () => [],
      createEvent: async (req) => {
        createdEvents.push(req);
        return {
          eventId: req.eventId,
          status: 'CONFIRMED',
          startAtUtc: req.startAtUtc,
          endAtUtc: req.endAtUtc
        };
      }
    }
  });
  const preferenceService = createBookingPreferenceService({
    db,
    clock: () => new Date(nowIso)
  });

  // Create a Core quote (E2L 4L1, $0 travel) and its booking intent
  const quoteId = crypto.randomUUID();
  db.prepare(`INSERT INTO quotes (
    id, ownerId, quoteId, serviceType, customerInputsJson, resultJson, status, callerType, createdAt
  ) VALUES (?, ?, ?, 'LANDSCAPING_MOWING', ?, ?, 'INSTANT', 'customer', ?)`).run(
    quoteId,
    ownerId,
    quoteId,
    JSON.stringify({ ...BASE_MOWING_INPUTS, postalCode: 'E2L4L1' }),
    JSON.stringify({ postalCode: 'E2L4L1', midEstimate: 105 }),
    nowIso
  );
  const intent = bookingService.createIntent({
    ownerId,
    sourceType: 'quote',
    sourceId: quoteId,
    serviceId: MOWING_SERVICE_ID,
    resultType: 'INSTANT_ESTIMATE_READY',
    allowedTierNames: ['Standard'],
    expiresAtUtc: '2026-06-22T13:00:00.000Z'
  });

  const coreLocation = {
    addressLine1: '10 King St',
    addressLine2: '',
    city: 'Saint John',
    region: 'NB',
    postalCode: 'e2l 4l1',
    country: 'CA'
  };
  const outerLocation = {
    ...coreLocation,
    addressLine1: '20 Loch Lomond Rd',
    postalCode: 'E2J 2A1'
  };

  // Availability with mismatched postalCode (E2J 2A1 vs quoted E2L 4L1) throws REQUOTE_REQUIRED (409)
  await assert.rejects(
    () => bookingService.availability({
      ownerId,
      intentId: intent.intentId,
      filters: { fromDate: '2026-06-16', days: 1, location: outerLocation }
    }),
    (err) => err.code === 'REQUOTE_REQUIRED' && err.statusCode === 409
  );

  // Preference request with mismatched postalCode (E2J 2A1 vs quoted E2L 4L1) throws REQUOTE_REQUIRED (409)
  assert.throws(
    () => preferenceService.request({
      ownerId,
      intentId: intent.intentId,
      idempotencyKey: crypto.randomUUID(),
      body: {
        preferredWindows: [{ date: '2026-06-16', timeOfDay: 'morning' }],
        customer: { name: 'Alex', email: 'alex@example.com', phone: '+15065550100' },
        location: outerLocation
      }
    }),
    (err) => err.code === 'REQUOTE_REQUIRED' && err.statusCode === 409
  );

  // Availability with matching postalCode (e2l 4l1) succeeds even with empty knowledgeBaseJson serviceArea
  const availRes = await bookingService.availability({
    ownerId,
    intentId: intent.intentId,
    filters: { fromDate: '2026-06-16', days: 1, location: coreLocation }
  });
  assert.equal(availRes.statusCode, 200);
  assert.equal(availRes.body.status, 'AVAILABLE');
  assert.ok(availRes.body.slots.length > 0);

  const slot = availRes.body.slots[0];
  const held = bookingService.hold({
    ownerId,
    intentId: intent.intentId,
    idempotencyKey: crypto.randomUUID(),
    slotId: slot.slotId
  });
  assert.equal(held.statusCode, 201);

  // Attempting to confirm with Outer postal code (E2J 2A1) after holding a slot is rejected with REQUOTE_REQUIRED (409)
  await assert.rejects(
    () => bookingService.confirm({
      ownerId,
      intentId: intent.intentId,
      idempotencyKey: crypto.randomUUID(),
      body: {
        holdId: held.body.holdId,
        confirmedSlotId: slot.slotId,
        explicitConfirmation: true,
        addressConfirmation: true,
        tierName: 'Standard',
        customer: { name: 'Alex', email: 'alex@example.com', phone: '+15065550100' },
        location: outerLocation
      }
    }),
    (err) => err.code === 'REQUOTE_REQUIRED' && err.statusCode === 409
  );

  // Confirming with matching Core postal code (e2l 4l1) succeeds
  const confirmed = await bookingService.confirm({
    ownerId,
    intentId: intent.intentId,
    idempotencyKey: crypto.randomUUID(),
    body: {
      holdId: held.body.holdId,
      confirmedSlotId: slot.slotId,
      explicitConfirmation: true,
      addressConfirmation: true,
      tierName: 'Standard',
      customer: { name: 'Alex', email: 'alex@example.com', phone: '+15065550100' },
      location: coreLocation
    }
  });
  assert.equal(confirmed.statusCode, 201);
  assert.equal(confirmed.body.status, 'CONFIRMED');

  // 4) Voice runtime: caller quotes in E2J, then tries to checkAvailability in E2L 4L1 (rejected) vs E2J 2A1 (succeeds and books)
  const callId = crypto.randomUUID();
  const callSid = 'CAabababababababababababababababab';
  const accountSid = 'ACcdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd';
  const callerPhone = '+15065550177';
  const destPhone = '+15065550188';
  db.prepare(`INSERT INTO calls (
    id, ownerId, callSid, accountSid, callerNumber, destinationNumber, status, duration, spamFiltered, createdAt
  ) VALUES (?, ?, ?, ?, ?, ?, 'in-progress', 0, 0, ?)`).run(
    callId, ownerId, callSid, accountSid, callerPhone, destPhone, nowIso
  );
  // Single-tier policy for voice direct booking
  db.prepare(`UPDATE bookingPolicies SET bookingMode = 'site_visit_first' WHERE ownerId = ? AND serviceId = ?`).run(
    ownerId, MOWING_SERVICE_ID
  );

  const callContext = { ownerId, callSid, accountSid, from: callerPhone, to: destPhone };
  const runtime = createVoiceToolRuntime({
    database: db,
    callContext,
    handleSecret: 'voice-zones-test-secret-key-32bytes',
    bookingService,
    clock: () => new Date(nowIso)
  });

  const matched = await runtime.handlers.matchService({
    context: callContext,
    args: { query: 'Lawn Mowing' }
  });
  const quotedVoice = await runtime.handlers.getQuote({
    context: callContext,
    args: {
      serviceHandle: matched.serviceHandle,
      customerConfirmed: true,
      customerInputs: { ...BASE_MOWING_INPUTS, postalCode: 'E2J' }
    }
  });
  assert.equal(quotedVoice.status, 'quoted');

  // Capture lead with mismatched postal code E2L 4L1
  const wrongLead = await runtime.handlers.captureLead({
    context: callContext,
    args: {
      name: 'Taylor',
      address: {
        line1: '10 King St',
        city: 'Saint John',
        region: 'NB',
        postalCode: 'E2L 4L1',
        country: 'CA'
      }
    }
  });
  const wrongAvail = await runtime.handlers.checkAvailability({
    context: callContext,
    args: {
      quoteHandle: quotedVoice.quoteHandle,
      leadHandle: wrongLead.leadHandle,
      preference: { fromDate: '2026-06-16', days: 1 }
    }
  });
  assert.equal(wrongAvail.status, 'unavailable');
  assert.equal(wrongAvail.reason, 'REQUOTE_REQUIRED');

  // Update lead with matching full postal code E2J 2A1 in the quoted E2J zone
  const rightLead = await runtime.handlers.captureLead({
    context: callContext,
    args: {
      leadHandle: wrongLead.leadHandle,
      name: 'Taylor',
      address: {
        line1: '20 Loch Lomond Rd',
        city: 'Saint John',
        region: 'NB',
        postalCode: 'E2J 2A1',
        country: 'CA'
      }
    }
  });
  const rightAvail = await runtime.handlers.checkAvailability({
    context: callContext,
    args: {
      quoteHandle: quotedVoice.quoteHandle,
      leadHandle: rightLead.leadHandle,
      preference: { fromDate: '2026-06-16', days: 1 }
    }
  });
  assert.equal(rightAvail.status, 'available');
  assert.ok(rightAvail.slotOptions.length > 0);

  const bookedVoice = await runtime.handlers.bookAppointment({
    context: callContext,
    args: {
      slotHandle: rightAvail.slotOptions[0].slotHandle,
      leadHandle: rightLead.leadHandle,
      customerConfirmed: true
    }
  });
  assert.equal(bookedVoice.status, 'confirmed');
  assert.equal(bookedVoice.serviceAddress.postalCode, 'E2J 2A1');
});
