import {createVoiceSmsService} from '../voiceSmsService.js';
import {isVoiceCaller,callerIdentity,isPhoneNumber} from './callerIdentity.js';
import {customerPhone,resolveCustomer} from '../customerIdentityService.js';
import {customerHistory} from '../customerHistoryService.js';
import {saveCallbackRequest} from '../callbackRequestService.js';
import {saveVoiceInquiry} from '../leadCaptureRepair20261006.js';
import {quoteDateContext} from '../quoteDate.js';
import {voiceQuestionContract,bindVoiceQuoteInputs} from './voiceQuoteContract.js';
import {projectVoiceQuote} from './voiceQuotePresentation.js';
import crypto from 'node:crypto';

import { loadPricebook } from '../../priceBookService.js';
import {
  applicationServiceMatches,
  applicationServiceName,
  cachedApplicationStatus,
  applicationServiceDefinition,
  bookRevision,
  calculateApplicationQuote,
  prepareApplicationIntake
} from '../quoteDoneBridge.js';
import { loadBookingCapability } from '../bookingCapabilities.js';
import { JOB_DETAILS_FLOW } from '../quoteIntake.js';
import { serviceAreaDecision, serviceAreaFromKnowledgeBase } from '../serviceArea.js';
import {
  createVoiceHandleStore,
  createVoiceToolIdempotencyStore
} from './voicePersistence.js';

const CALL_SID = /^CA[0-9a-f]{32}$/i;
const ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;
const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RELEASED_RESULTS = new Set(['INSTANT_ESTIMATE_READY', 'PARTIAL_ESTIMATE_READY']);
const BOOKABLE_RESULTS = new Set([...RELEASED_RESULTS, 'ESTIMATE_REQUIRES_REVIEW']);
const DEFAULT_HANDLE_TTL_MS = 2 * 60 * 60 * 1000;
const BOOKING_CONTEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export class VoiceToolRuntimeError extends Error {
  constructor(code, message = 'The voice action is unavailable.') {
    super(message);
    this.name = 'VoiceToolRuntimeError';
    this.code = code;
  }
}

function runtimeError(code, message) {
  return new VoiceToolRuntimeError(code, message);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (record(value)) {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

function json(value) {
  return JSON.stringify(canonical(value));
}

function parseJson(value, fallback = null) {
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function sha256(value) {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function secretBuffer(value) {
  const buffer = Buffer.isBuffer(value) ? Buffer.from(value) :
    typeof value === 'string' ? Buffer.from(value, 'utf8') : null;
  if (!buffer || buffer.length < 32) {
    throw new TypeError('Voice tool runtime requires a handle secret of at least 32 bytes.');
  }
  return buffer;
}

function stableUuid(secret, purpose, value) {
  const bytes = crypto.createHmac('sha256', secret)
    .update(`${purpose}\0${value}`, 'utf8').digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nowDate(clock) {
  const value = clock();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Voice tool clock returned an invalid instant.');
  return date;
}

function normalizeContext(value) {
  if (!record(value)) throw new TypeError('Voice call context is required.');
  const context = {
    ownerId: typeof value.ownerId === 'string' ? value.ownerId.trim() : '',
    callSid: typeof value.callSid === 'string' ? value.callSid.trim() : '',
    accountSid: typeof value.accountSid === 'string' ? value.accountSid.trim() : '',
    from: typeof value.from === 'string' ? value.from.trim() : '',
    to: typeof value.to === 'string' ? value.to.trim() : ''
  };
  if (!context.ownerId || !CALL_SID.test(context.callSid) || !ACCOUNT_SID.test(context.accountSid) ||
      !isVoiceCaller(context.from) || !E164.test(context.to)) {
    throw new TypeError('Voice call context is invalid.');
  }
  return Object.freeze(context);
}

function sameContext(left, right) {
  return left.ownerId === right.ownerId && left.callSid === right.callSid &&
    left.accountSid === right.accountSid && left.from === right.from && left.to === right.to;
}

function immediate(database, work) {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* preserve original failure */ }
    throw error;
  }
}

function normalizedWords(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
}

function serviceScore(query, service, name) {
  const queryWords = normalizedWords(query);
  const nameWords = normalizedWords(name);
  const typeWords = normalizedWords(service.serviceType);
  if (!queryWords.length || !nameWords.length) return 0;
  const queryText = queryWords.join(' ');
  if (queryText === nameWords.join(' ')) return 1;
  if (queryText === typeWords.join(' ')) return 0.97;
  const nameSet = new Set([...nameWords, ...typeWords]);
  const overlap = queryWords.filter(word => nameSet.has(word)).length;
  if (!overlap) return 0;
  const queryCoverage = overlap / queryWords.length;
  const nameCoverage = overlap / Math.max(1, nameWords.length);
  return Math.min(0.94, queryCoverage * 0.65 + nameCoverage * 0.35);
}

function allowedTierNames(response) {
  const estimate = response?.resultType === 'PARTIAL_ESTIMATE_READY' ? response.pricedEstimate : response;
  return [...new Set((Array.isArray(estimate?.options) ? estimate.options : [])
    .map(option => typeof option?.tierName === 'string' ? option.tierName.trim() : '')
    .filter(Boolean))];
}

function safeStringList(value, limit = 30) {
  if (!Array.isArray(value)) return [];
  return value.filter(item => typeof item === 'string' && item.trim())
    .slice(0, limit).map(item => item.trim().slice(0, 500));
}

function pricedScopeLines(response) {
  const scope = response?.pricedScope;
  if (!record(scope)) return [];
  const lines = [];
  if (typeof scope.service === 'string' && scope.service.trim()) lines.push(scope.service.trim());
  for (const fact of Array.isArray(scope.facts) ? scope.facts : []) {
    if (record(fact) && typeof fact.label === 'string') {
      lines.push(`${fact.label}: ${String(fact.value ?? 'Not supplied')}`.slice(0, 500));
    }
  }
  return lines.slice(0, 30);
}

function projectQuoteResult(response, quoteHandle, followUps = []) {
  return projectVoiceQuote(response, quoteHandle, followUps);
}

function completeAddress(address) {
  return record(address) && ['line1', 'city', 'region', 'postalCode', 'country']
    .every(key => typeof address[key] === 'string' && address[key].trim());
}

function bookingLocation(address) {
  return {
    addressLine1: address.line1,
    addressLine2: address.line2 || '',
    city: address.city,
    region: address.region,
    postalCode: address.postalCode,
    country: address.country
  };
}

function providerStatus(value) {
  return typeof value?.status === 'string' ? value.status.trim().toUpperCase() : '';
}

function quoteApplicationDefaults(database,clock) {
  const dateContext=ownerId=>quoteDateContext(database,ownerId,nowDate(clock));
  return {
    loadBook: loadPricebook,
    status: (service,book)=>cachedApplicationStatus(service,book,{...dateContext(book.ownerId),quick:true}),
    definition: service=>{try{return applicationServiceDefinition(service);}catch{return {customerFields:[]};}},
    serviceName: applicationServiceName,
    serviceMatches: applicationServiceMatches,
    revision: bookRevision,
    prepare: (ownerId,submission)=>prepareApplicationIntake(ownerId,submission,dateContext(ownerId)),
    calculate: (book,service,submission,options)=>calculateApplicationQuote(book,service,submission,{...options,...dateContext(options.ownerId)})
  };
}

export function createVoiceToolRuntime({
  database,
  callContext,
  handleSecret = process.env.VOICE_HANDLE_SECRET || process.env.BOOKING_SLOT_TOKEN_SECRET,
  bookingService,
  quoteApplication = {},
  bookingCapabilityResolver = loadBookingCapability,
  providers = {},
  clock = () => new Date(),
  handleTtlMs = DEFAULT_HANDLE_TTL_MS,
  idempotencyLeaseMs = 30_000
} = {}) {
  if (!database || typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
    throw new TypeError('Voice tool runtime requires a synchronous SQLite database.');
  }
  if (!Number.isSafeInteger(handleTtlMs) || handleTtlMs < 60_000 || handleTtlMs > BOOKING_CONTEXT_TTL_MS) {
    throw new TypeError('Voice handle lifetime is invalid.');
  }
  const context = normalizeContext(callContext);
  const secret = secretBuffer(handleSecret);
  const quoteApp = Object.freeze({ ...quoteApplicationDefaults(database,clock), ...quoteApplication });
  const handleStore = createVoiceHandleStore({ database, secret, clock });
  const idempotencyStore = createVoiceToolIdempotencyStore({
    database, clock, leaseMs: idempotencyLeaseMs
  });

  function instant() {
    return nowDate(clock);
  }

  function expiresAt(maximum) {
    const desired = new Date(instant().getTime() + handleTtlMs);
    if (!maximum) return desired;
    const max = new Date(maximum);
    return Number.isFinite(max.getTime()) && max < desired ? max : desired;
  }

  function invocation(value) {
    if (!record(value) || !sameContext(normalizeContext(value.context), context) || !record(value.args)) {
      throw runtimeError('INVALID_RUNTIME_INVOCATION');
    }
    callRow();
    return value.args;
  }

  function callRow() {
    const row = database.prepare(`SELECT id, ownerId, callSid, accountSid, callerNumber, destinationNumber
      FROM calls WHERE ownerId = ? AND callSid = ?`).get(context.ownerId, context.callSid);
    if (!row || row.accountSid !== context.accountSid || row.callerNumber !== context.from ||
        row.destinationNumber !== context.to) {
      throw runtimeError('VOICE_CALL_NOT_BOUND');
    }
    return row;
  }

  function publishedServices(book) {
    return (Array.isArray(book?.services) ? book.services : []).filter(service => {
      if (!record(service) || service.active !== true) return false;
      try {
        const status = quoteApp.status(service, book);
        return status?.status === 'QUOTING LIVE' && status?.approvalCurrent !== false;
      } catch { return false; }
    });
  }

  function issue(type, resourceKey, reference, maximumExpiry) {
    return handleStore.issue({
      context,
      type,
      resourceKey,
      reference,
      expiresAt: expiresAt(maximumExpiry)
    });
  }

  function resolve(handle, expectedType) {
    return handleStore.resolve({ context, handle, expectedType });
  }

  function loadLead(resolved) {
    const leadId = resolved.reference.leadId;
    if (typeof leadId !== 'string') throw runtimeError('INVALID_LEAD_HANDLE');
    const call = callRow();
    const row = database.prepare(`SELECT * FROM leads
      WHERE id = ? AND ownerId = ? AND callId = ?`).get(leadId, context.ownerId, call.id);
    const details = parseJson(row?.collectedInputsJson);
    if (!row || !record(details) || details.voiceVersion !== 1 ||
        details.contact?.phone !== context.from ||
        (resolved.reference.customerId && details.customerId !== resolved.reference.customerId)) {
      throw runtimeError('INVALID_LEAD_HANDLE');
    }
    return { row, details };
  }

  function loadQuote(resolved) {
    const reference = resolved.reference;
    if (typeof reference.recordId !== 'string' || typeof reference.requestId !== 'string') {
      throw runtimeError('INVALID_QUOTE_HANDLE');
    }
    const row = database.prepare(`SELECT * FROM quoteSubmissions
      WHERE ownerId = ? AND requestId = ? AND recordId = ?`).get(
      context.ownerId, reference.requestId, reference.recordId
    );
    if (!row || row.bookingIntentId !== (reference.intentId || null) ||
        row.resultType !== reference.resultType) throw runtimeError('INVALID_QUOTE_HANDLE');
    return { row, response: parseJson(row.customerResponseJson, {}) };
  }

  function multiTierDirectBookingBlocked(reference) {
    if (!Array.isArray(reference.allowedTierNames) || !reference.allowedTierNames.length) return false;
    const policy = database.prepare(`SELECT bookingMode FROM bookingPolicies
      WHERE ownerId = ? AND serviceId = ?`).get(context.ownerId, reference.serviceId);
    return policy?.bookingMode === 'book_job';
  }

  function writeOutbox({ id, eventType, aggregateId, payload, status = 'PENDING' }) {
    const at = instant().toISOString();
    database.prepare(`INSERT OR IGNORE INTO outboxEvents (
      id, ownerId, eventType, aggregateId, payloadJson, status, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, context.ownerId, eventType, aggregateId, JSON.stringify(payload), status, at, at
    );
    return id;
  }

  function updateOutbox(id, status) {
    database.prepare(`UPDATE outboxEvents SET status = ?, updatedAt = ?
      WHERE id = ? AND ownerId = ?`).run(status, instant().toISOString(), id, context.ownerId);
  }

  async function matchService(input) {
    const args = invocation(input);
    const book = quoteApp.loadBook(context.ownerId);
    const candidates = publishedServices(book).map(service => ({
      service,
      name: quoteApp.serviceName(service),
      score: serviceScore(args.query, service, quoteApp.serviceName(service))
    })).filter(candidate => candidate.score >= 0.6)
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
    if (!candidates.length || (candidates[1] && candidates[0].score - candidates[1].score < 0.12)) {
      return {
        status: 'needs_clarification',
        clarification: candidates.length
          ? 'Please clarify which listed service you need.'
          : 'That work does not match an active published service. Please describe the main job another way.'
      };
    }
    const selected = candidates[0];
    const revision = quoteApp.revision(book);
    const serviceHandle = issue('service', `service:${selected.service.id}:${revision}`, {
      serviceId: selected.service.id,
      bookRevision: revision,
      serviceName: selected.name
    });
    return {
      status: 'matched',
      serviceHandle,
      serviceName: selected.name,
      questionContract: voiceQuestionContract(selected.service,quoteApp.definition(selected.service)),
      confidence: Number(selected.score.toFixed(3))
    };
  }

  async function getQuote(input) {
    const args = invocation(input);
    if (args.customerConfirmed !== true) throw runtimeError('CUSTOMER_CONFIRMATION_REQUIRED');
    const selected = resolve(args.serviceHandle, 'service');
    const requestFingerprint = json({
      callSid: context.callSid,
      serviceHandleHash: selected.handleHash,
      customerInputs: args.customerInputs,
      productConfirmations: args.productConfirmations || {},
      customerFeeSelections: args.customerFeeSelections || {},
      additionalWork: args.additionalWork || []
    });
    const requestId = stableUuid(secret, 'voice-quote-request', requestFingerprint);
    const prior = database.prepare(`SELECT * FROM quoteSubmissions
      WHERE ownerId = ? AND requestId = ?`).get(context.ownerId, requestId);
    if (prior) {
      const response = parseJson(prior.customerResponseJson, {});
      const internal = parseJson(prior.internalOutcomeJson, {});
      const original = parseJson(prior.originalSubmissionJson, {});
      const reference = {
        requestId,
        recordId: prior.recordId,
        intentId: prior.bookingIntentId || null,
        serviceId: original.serviceId,
        resultType: prior.resultType,
        allowedTierNames: allowedTierNames(response),
        bookingCapability: response.bookingCapability || 'NONE'
      };
      const quoteHandle = issue('quote', `quote:${requestId}`, reference);
      return projectQuoteResult(response, quoteHandle, internal.voiceFollowUps || []);
    }

    const book = quoteApp.loadBook(context.ownerId);
    if (quoteApp.revision(book) !== selected.reference.bookRevision) {
      throw runtimeError('PRICE_BOOK_CHANGED');
    }
    const matches = quoteApp.serviceMatches(book, selected.reference.serviceId);
    if (!Array.isArray(matches) || matches.length !== 1 ||
        !publishedServices(book).some(service => service === matches[0])) {
      throw runtimeError('SERVICE_NOT_PUBLISHED');
    }
    const service = matches[0];
    const definition=quoteApp.definition(service);
    const bound=bindVoiceQuoteInputs(service,definition,args);
    if(bound.followUps.length)return {status:'needs_details',resultType:'ESTIMATE_REQUIRES_REVIEW',followUps:bound.followUps,questionContract:voiceQuestionContract(service,definition)};
    const submission = {
      requestId,
      serviceId: service.id,
      serviceRequest: quoteApp.serviceName(service),
      customerInputs: bound.customerInputs,
      customerFeeSelections: bound.customerFeeSelections,
      additionalWork: args.additionalWork || [],
      context: '',
      explicitUnknowns: '',
      urgency: 'flexible',
      contact: { phone: context.from },
      intakeFlow: JOB_DETAILS_FLOW
    };

    let prepared;
    let calculated;
    try {
      prepared = quoteApp.prepare(context.ownerId, submission);
      if (prepared?.status === 'ready' && record(prepared.confirmation)) {
        calculated = quoteApp.calculate(book, service, {
          ...submission,
          intakeConfirmation: prepared.confirmation
        }, { ownerId: context.ownerId });
      } else {
        calculated = quoteApp.calculate(book, service, submission, {
          ownerId: context.ownerId,
          preparingIntake: true
        });
      }
    } catch {
      throw runtimeError('QUOTE_BOUNDARY_FAILED');
    }
    const response = calculated?.customerResult;
    if (!record(response) || !BOOKABLE_RESULTS.has(response.resultType)) {
      throw runtimeError('INVALID_QUOTE_RESULT');
    }
    const followUps = safeStringList(prepared?.followUps);
    const recordId = stableUuid(secret, 'voice-quote-record', requestFingerprint);
    const createdAt = instant().toISOString();
    const revision = quoteApp.revision(book);
    const capability = bookingCapabilityResolver(database, context.ownerId, service.id);
    const tiers = allowedTierNames(response);
    const call = callRow();
    const storedResponse = { ...response, bookingCapability: capability };

    return immediate(database, () => {
      const existing = database.prepare(`SELECT * FROM quoteSubmissions
        WHERE ownerId = ? AND requestId = ?`).get(context.ownerId, requestId);
      if (existing) {
        const existingResponse = parseJson(existing.customerResponseJson, {});
        const existingInternal = parseJson(existing.internalOutcomeJson, {});
        const existingOriginal = parseJson(existing.originalSubmissionJson, {});
        const existingReference = {
          requestId,
          recordId: existing.recordId,
          intentId: existing.bookingIntentId || null,
          serviceId: existingOriginal.serviceId,
          resultType: existing.resultType,
          allowedTierNames: allowedTierNames(existingResponse),
          bookingCapability: existingResponse.bookingCapability || 'NONE'
        };
        const existingHandle = issue('quote', `quote:${requestId}`, existingReference);
        return projectQuoteResult(existingResponse, existingHandle, existingInternal.voiceFollowUps || []);
      }

      const customer=resolveCustomer(database,{ownerId:context.ownerId,phone:context.from,createdAt});
      const internal = {
        customerId:customer?.id||null,
        voiceVersion: 1,
        voiceFollowUps: followUps,
        applicationOutcome: calculated
      };
      if (RELEASED_RESULTS.has(response.resultType)) {
        database.prepare(`INSERT INTO quotes (
          id, ownerId, callId, quoteId, serviceType, customerInputsJson,
          resultJson, status, callerType, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'customer', ?)`).run(
          recordId, context.ownerId, call.id,
          typeof response.quoteId === 'string' ? response.quoteId : null,
          service.serviceType, JSON.stringify(args.customerInputs), JSON.stringify(internal),
          response.resultType === 'PARTIAL_ESTIMATE_READY' ? 'PARTIAL' : 'INSTANT', createdAt
        );
      }
      if (!RELEASED_RESULTS.has(response.resultType) || response.resultType === 'PARTIAL_ESTIMATE_READY') {
        database.prepare(`INSERT INTO leads (
          id, ownerId, callId, customerName, callerNumber, describedService,
          collectedInputsJson, type, status, createdAt
        ) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 'NEEDS REVIEW', ?)`).run(
          recordId, context.ownerId, call.id, context.from, quoteApp.serviceName(service),
          JSON.stringify(internal),
          response.resultType === 'PARTIAL_ESTIMATE_READY' ? 'additional_work' : 'quote_review',
          createdAt
        );
      }
      database.prepare(`INSERT INTO quoteRequests (
        id, ownerId, callId, describedService, estimatedValue, createdAt
      ) VALUES (?, ?, ?, ?, NULL, ?)`).run(
        recordId, context.ownerId, call.id, quoteApp.serviceName(service), createdAt
      );

      let intentId = null;
      if (capability !== 'NONE' && bookingService?.createIntent) {
        const booking = bookingService.createIntent({
          ownerId: context.ownerId,
          sourceType: RELEASED_RESULTS.has(response.resultType) ? 'quote' : 'lead',
          sourceId: recordId,
          serviceId: service.id,
          resultType: response.resultType,
          allowedTierNames: tiers,
          expiresAtUtc: new Date(instant().getTime() + BOOKING_CONTEXT_TTL_MS).toISOString()
        });
        intentId = booking.intentId;
      }
      database.prepare(`INSERT INTO quoteSubmissions (
        ownerId, requestId, contentDigest, recordId, resultType, bookRevision,
        originalSubmissionJson, internalOutcomeJson, customerResponseJson,
        bookingIntentId, bookingTokenReceipt, createdAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`).run(
        context.ownerId, requestId, sha256(json(submission)), recordId, response.resultType,
        revision, JSON.stringify(submission), JSON.stringify(internal),
        JSON.stringify(storedResponse), intentId, createdAt
      );
      const reference = {
        requestId,
        recordId,
        intentId,
        serviceId: service.id,
        resultType: response.resultType,
        allowedTierNames: tiers,
        bookingCapability: capability
      };
      const quoteHandle = issue('quote', `quote:${requestId}`, reference);
      return projectQuoteResult(storedResponse, quoteHandle, followUps);
    });
  }

  function saveInquiry(args,{leadId,key,type,status,updates={}}={}) {
    const call=callRow();
    if(args.leadHandle)leadId=loadLead(resolve(args.leadHandle,'lead')).row.id;
    const number=args.inquiryNumber??1;
    const fields={...updates};
    for(const field of ['name','email','notes','description'])if(args[field]!==undefined)fields[field]=args[field].trim();
    if(fields.email!==undefined){fields.email=fields.email.toLowerCase();if(!EMAIL.test(fields.email))throw runtimeError('INVALID_EMAIL');}
    if(args.address!==undefined)fields.address=Object.fromEntries(Object.entries(args.address).map(([name,value])=>[name,['region','postalCode','country'].includes(name)?value.trim().toUpperCase():value.trim()]));
    return saveVoiceInquiry({database,context,callId:call.id,key:key||'capture:'+number,leadId,
      customerId:stableUuid(secret,'voice-customer',context.ownerId+'\0'+callerIdentity(context)),
      updates:fields,createdAt:instant().toISOString(),type,status,legacyDefault:!key&&number===1});
  }

  async function captureLead(input) {
    const args=invocation(input);
    const saved=immediate(database,()=>{
      const lead=saveInquiry(args);
      if(args.callbackRequested===true){
        if(typeof args.notes!=='string'||!args.notes.trim())throw runtimeError('CALLBACK_NOTES_REQUIRED');
        saveCallbackRequest({database,ownerId:context.ownerId,callId:lead.row.callId,leadId:lead.row.id,requestKey:'capture-lead:'+lead.row.id,source:'caller_requested',reason:null,notes:args.notes,at:instant().toISOString()});
      }
      return lead;
    });
    const stored=loadLead({reference:{leadId:saved.row.id,customerId:saved.details.customerId}});
    const leadHandle=issue('lead','lead:'+stored.row.id,{leadId:stored.row.id,customerId:stored.details.customerId});
    const hasAddress=completeAddress(stored.details.address);
    return {status:hasAddress?'captured':'captured_address_required',leadHandle,
      message:hasAddress?'Contact and service address saved.':'Contact saved. A complete service address is required before checking availability.'};
  }

  async function checkAvailability(input) {
    const args = invocation(input);
    if(args.appointmentHandle){
      const {row}=callerOwnsAppointment(resolve(args.appointmentHandle,'appointment'));
      if(typeof bookingService?.appointmentAvailability!=='function')return {status:'unavailable',message:'Appointment availability cannot be checked right now.'};
      const result=await bookingService.appointmentAvailability({ownerId:context.ownerId,appointmentId:row.id,callerNumber:context.from,filters:args.preference||{}});
      const body=result.body;
      if(body?.status!=='AVAILABLE')return {status:'unavailable',message:'No replacement times are available for that preference.'};
      return {status:'available',slotOptions:body.slots.slice(0,10).map(slot=>({label:slot.label,slotHandle:issue('slot','appointment-slot:'+row.id+':'+sha256(slot.slotId),{intentId:result.intentId,appointmentId:row.id,customerId:row.customerId,slotId:slot.slotId},body.validUntilUtc)}))};
    }
    const quoteResolved = resolve(args.quoteHandle, 'quote');
    const leadResolved = resolve(args.leadHandle, 'lead');
    const { row: quoteRow } = loadQuote(quoteResolved);
    const { row: leadRow, details } = loadLead(leadResolved);
    const reference = quoteResolved.reference;
    if (!reference.intentId || quoteRow.bookingIntentId !== reference.intentId ||
        !BOOKABLE_RESULTS.has(reference.resultType) || reference.bookingCapability === 'NONE') {
      return {
        status: 'unavailable',
        reason: 'BOOKING_NOT_AVAILABLE',
        message: 'This quote cannot be booked automatically.'
      };
    }
    if (multiTierDirectBookingBlocked(reference)) {
      return {
        status: 'unavailable',
        reason: 'TIER_SELECTION_REQUIRED',
        message: 'A pricing option must be selected before this job can be booked.'
      };
    }
    const address = details.address;
    if (!completeAddress(address)) {
      return {
        status: 'address_required',
        reason: 'ADDRESS_REQUIRED',
        message: 'A complete service address is required before checking availability.'
      };
    }
    const profile = database.prepare('SELECT knowledgeBaseJson FROM businessProfiles WHERE ownerId = ?').get(context.ownerId);
    const area = serviceAreaDecision(
      serviceAreaFromKnowledgeBase(profile?.knowledgeBaseJson),
      { city: address.city, region: address.region, country: address.country }
    );
    if (!area.eligible) {
      return {
        status: 'unavailable',
        reason: area.reason,
        message: area.reason === 'OUT_OF_AREA'
          ? 'The service address is outside the configured service area.'
          : 'Service-area eligibility could not be confirmed.'
      };
    }
    if (!bookingService || typeof bookingService.availability !== 'function') {
      return {
        status: 'unavailable',
        reason: 'BOOKING_PROVIDER_UNAVAILABLE',
        message: 'Availability cannot be checked right now.'
      };
    }
    const result = await bookingService.availability({
      ownerId: context.ownerId,
      intentId: reference.intentId,
      filters: {
        ...args.preference,
        location: bookingLocation(address)
      }
    });
    const body = record(result?.body) ? result.body : {};
    if (body.status === 'EXTERNAL_HANDOFF') {
      return {
        status: 'external_handoff',
        message: 'Scheduling is available through the business booking link.'
      };
    }
    if (body.status === 'PREFERRED_TIME_ONLY') {
      return {
        status: 'preferred_time_only',
        reason: typeof body.reason === 'string' ? body.reason : 'PREFERRED_TIME_ONLY',
        message: 'Your preferred time can be recorded, but it is not a confirmed booking.'
      };
    }
    if (body.status !== 'AVAILABLE' || !Array.isArray(body.slots)) {
      return {
        status: 'unavailable',
        reason: typeof body.reason === 'string' ? body.reason : 'NO_AVAILABILITY',
        message: 'No bookable times are available for that preference.'
      };
    }
    const maximumExpiry = typeof body.validUntilUtc === 'string' ? body.validUntilUtc : undefined;
    const slotOptions = body.slots.slice(0, 10).flatMap(slot => {
      if (!record(slot) || typeof slot.slotId !== 'string' || !slot.slotId || typeof slot.label !== 'string' || !slot.label.trim() || slot.label.length > 200) return [];
      const slotHandle = issue(
        'slot',
        'slot:' + reference.intentId + ':' + sha256(slot.slotId),
        {
          intentId: reference.intentId,
          quoteRequestId: reference.requestId,
          leadId: leadRow.id,
          customerId: details.customerId,
          slotId: slot.slotId,
          slot: {
            label: typeof slot.label === 'string' ? slot.label : null,
            startUtc: typeof slot.startUtc === 'string' ? slot.startUtc : null,
            endUtc: typeof slot.endUtc === 'string' ? slot.endUtc : null,
            startLocal: typeof slot.startLocal === 'string' ? slot.startLocal : null,
            endLocal: typeof slot.endLocal === 'string' ? slot.endLocal : null
          }
        },
        maximumExpiry
      );
      const projected = { slotHandle, label: slot.label };
      return [projected];
    });
    if (!slotOptions.length) {
      return {
        status: 'unavailable',
        reason: 'NO_AVAILABILITY',
        message: 'No bookable times are available for that preference.'
      };
    }
    return { status: 'available', slotOptions };
  }

  async function bookAppointment(input) {
    const args = invocation(input);
    if (args.customerConfirmed !== true) throw runtimeError('CUSTOMER_CONFIRMATION_REQUIRED');
    const slotResolved = resolve(args.slotHandle, 'slot');
    const leadResolved = resolve(args.leadHandle, 'lead');
    const { details } = loadLead(leadResolved);
    const slot = slotResolved.reference;
    if (slot.leadId !== leadResolved.reference.leadId ||
        slot.customerId !== leadResolved.reference.customerId ||
        typeof slot.intentId !== 'string' || typeof slot.slotId !== 'string') {
      throw runtimeError('BOOKING_BINDING_MISMATCH');
    }
    if (!completeAddress(details.address)) throw runtimeError('ADDRESS_REQUIRED');
    if (!details.contact?.name) throw runtimeError('CUSTOMER_NAME_REQUIRED');
    if (!bookingService || typeof bookingService.hold !== 'function' ||
        typeof bookingService.confirm !== 'function') {
      return {
        status: 'unavailable',
        reason: 'BOOKING_PROVIDER_UNAVAILABLE',
        message: 'The appointment could not be booked right now.'
      };
    }
    const operationIdentity = slotResolved.handleHash + '\0' + leadResolved.handleHash;
    const holdKey = stableUuid(secret, 'voice-booking-hold', operationIdentity);
    const confirmKey = stableUuid(secret, 'voice-booking-confirm', operationIdentity);
    const releaseKey = stableUuid(secret, 'voice-booking-release', operationIdentity);
    let held;
    try {
      held = await bookingService.hold({
        ownerId: context.ownerId,
        intentId: slot.intentId,
        idempotencyKey: holdKey,
        slotId: slot.slotId
      });
      if (held?.body?.status !== 'HELD' || typeof held.body.holdId !== 'string') {
        throw runtimeError('BOOKING_HOLD_FAILED');
      }
      const confirmed = await bookingService.confirm({
        ownerId: context.ownerId,
        intentId: slot.intentId,
        idempotencyKey: confirmKey,
        body: {
          holdId: held.body.holdId,
          confirmedSlotId: slot.slotId,
          explicitConfirmation: true,
          addressConfirmation: true,
          customer: {
            name: details.contact.name,
            email: details.contact.email || '',
            phone: context.from
          },
          location: bookingLocation(details.address)
        }
      });
      const body = record(confirmed?.body) ? confirmed.body : {};
      if (!['CONFIRMED', 'PENDING_CONFIRMATION'].includes(body.status) ||
          typeof body.appointmentId !== 'string' || !body.appointmentId) {
        throw runtimeError('BOOKING_CONFIRMATION_FAILED');
      }
      const appointmentHandle = issue('appointment', 'appointment:' + body.appointmentId, {
        appointmentId: body.appointmentId,
        intentId: slot.intentId,
        customerId: details.customerId
      });
      if (body.status === 'PENDING_CONFIRMATION') {
        return {
          status: 'pending_confirmation',
          appointmentHandle,
          retryAfterSeconds: Number.isSafeInteger(body.retryAfterSeconds) ? body.retryAfterSeconds : 3,
          message: 'The appointment is not booked yet. Calendar confirmation is still pending.'
        };
      }
      const output = {
        status: 'confirmed',
        appointmentHandle,
        message: 'The appointment is confirmed.'
      };
      for (const key of ['startUtc', 'endUtc', 'startLocal', 'endLocal', 'timezone', 'bookingMode']) {
        if (typeof body[key] === 'string' && body[key]) output[key] = body[key];
      }
      return output;
    } catch (error) {
      if (held?.body?.holdId && typeof bookingService.releaseHold === 'function') {
        try {
          await bookingService.releaseHold({
            ownerId: context.ownerId,
            intentId: slot.intentId,
            idempotencyKey: releaseKey,
            holdId: held.body.holdId
          });
        } catch { /* preserve the booking failure */ }
      }
      throw error;
    }
  }

  async function logQuoteRequest(input) {
    const args=invocation(input);
    const supplied=args.leadHandle?loadLead(resolve(args.leadHandle,'lead')):null;
    const description=typeof args.description==='string'?args.description.trim():'';
    if(!description)throw runtimeError('QUOTE_REQUEST_DESCRIPTION_REQUIRED');
    const identity=json({callSid:context.callSid,description,leadId:supplied?.row.id||null});
    const requestId=stableUuid(secret,'voice-quote-request-log',identity);
    const eventId=stableUuid(secret,'voice-quote-request-event',identity);
    const call=callRow(),createdAt=instant().toISOString();
    let lead;
    immediate(database,()=>{
      // Separate described requests have separate identities; exact retries
      // recover the same standalone inquiry even after a process restart.
      const priorEvent=database.prepare('SELECT payloadJson FROM outboxEvents WHERE ownerId=? AND id=? AND aggregateId=?').get(context.ownerId,eventId,requestId);
      let priorLeadId;try{priorLeadId=JSON.parse(priorEvent?.payloadJson||'{}').leadId;}catch{}
      const boundId=supplied?.row.id||priorLeadId||requestId;
      let existing=database.prepare(`SELECT * FROM leads WHERE ownerId=? AND callId=? AND id=?
        AND json_valid(collectedInputsJson) AND json_extract(collectedInputsJson,'$.voiceVersion')=1
        AND json_extract(collectedInputsJson,'$.contact.phone')=?`).get(context.ownerId,call.id,boundId,context.from);
      if(!existing&&!priorEvent&&!supplied)existing=database.prepare(`SELECT * FROM leads WHERE ownerId=? AND callId=? AND describedService=?
        AND json_valid(collectedInputsJson) AND json_extract(collectedInputsJson,'$.voiceVersion')=1
        AND json_extract(collectedInputsJson,'$.contact.phone')=? ORDER BY rowid LIMIT 1`).get(context.ownerId,call.id,description,context.from);
      lead=saveInquiry({}, {leadId:existing?.id||supplied?.row.id||requestId,key:'review:'+requestId,type:'quote_review',status:'NEEDS REVIEW',
        updates:{description:existing?.describedService||description}});
      database.prepare('INSERT OR IGNORE INTO quoteRequests(id,ownerId,callId,describedService,estimatedValue,createdAt) VALUES(?,?,?,?,NULL,?)').run(requestId,context.ownerId,call.id,description,createdAt);
      writeOutbox({id:eventId,eventType:'voice.quote_request_logged',aggregateId:requestId,
        payload:{callSid:context.callSid,description,callerNumber:context.from,leadId:lead.row.id,contact:lead.details.contact}});
      // Enrich only an unattempted snapshot inside the producer transaction.
      // Delivered historical events and quote/submission receipts stay intact.
      if(database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='webhookDeliveries'").get())
        database.prepare("UPDATE webhookDeliveries SET payloadJson=json_set(payloadJson,'$.customer',json(?),'$.leadId',?) WHERE ownerId=? AND aggregateId=? AND eventType='quote.requested' AND status='PENDING' AND attemptCount=0").run(
          JSON.stringify(lead.details.contact),lead.row.id,context.ownerId,requestId);
    });
    const requestHandle=issue('quote_request','quote-request:'+requestId,{requestId,leadId:lead.row.id});
    return {status:'logged',requestHandle,message:'The quote request was saved for follow-up.'};
  }

  async function sendSms(input) {
    const args=invocation(input),resolved=resolve(args.recordHandle,['quote','appointment','quote_request','lead']);
    const template=typeof args.template==='string'?args.template.trim():'';
    if(!['quote','booking','callback','reminder'].includes(template))throw runtimeError('SMS_TEMPLATE_REQUIRED');
    let recordId,body;
    if(resolved.type==='lead'&&template==='callback'){
      const lead=loadLead(resolved);recordId=lead.row.id;
      body='Your request has been saved for the business to review. A callback has not been confirmed.';
    }else if(resolved.type==='quote_request'&&template==='callback'){
      recordId=resolved.reference.requestId;
      if(!database.prepare('SELECT id FROM quoteRequests WHERE ownerId=? AND id=? AND callId=?').get(context.ownerId,recordId,callRow().id))throw runtimeError('INVALID_QUOTE_REQUEST_HANDLE');
      body='Your quote-review request has been saved. A price or callback time has not been confirmed.';
    }else if(resolved.type==='quote'&&template==='quote'){
      const quote=loadQuote(resolved);recordId=quote.row.recordId;
      const customer=quote.response?.pricedEstimate||quote.response;
      // Use the frozen customer receipt only. No fresh arithmetic or raw book.
      const options=Array.isArray(customer?.options)?customer.options:[customer];
      const prices=options.filter(o=>Number.isFinite(o?.lowEstimate)&&Number.isFinite(o?.highEstimate)).map(o=>[o.tierName,[o.lowEstimate,o.highEstimate].map(v=>Number(v).toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})).join(' to '),o.currency,o.priceUnit,o.taxTreatment].filter(Boolean).join(' '));
      body=prices.length?'Your saved estimate: '+prices.join('; ')+'. The business will confirm the job details.':'Your pricing request has been saved for review. No price has been confirmed.';
    }else if(resolved.type==='appointment'&&['booking','reminder'].includes(template)){
      recordId=resolved.reference.appointmentId;
      const appointment=database.prepare('SELECT status,startAtUtc,timezone,customerJson FROM appointments WHERE ownerId=? AND id=? AND customerId=?').get(context.ownerId,recordId,resolved.reference.customerId);
      if(!appointment||parseJson(appointment.customerJson,{})?.phone!==context.from)throw runtimeError('INVALID_APPOINTMENT_HANDLE');
      if(appointment.status==='CONFIRMED')body='Your appointment is confirmed for '+appointment.startAtUtc+' ('+appointment.timezone+').';
      else body='Your appointment request is saved with status '+appointment.status+'. It is not a confirmed booking.';
    }else throw runtimeError('SMS_RECORD_TEMPLATE_MISMATCH');
    const owner=database.prepare("SELECT businessName FROM users WHERE id=? AND role='owner'").get(context.ownerId);
    body=String(owner?.businessName||'The business').slice(0,100)+': '+body+' Reply STOP to opt out.';
    if(body.length>1600)throw runtimeError('SMS_MESSAGE_TOO_LONG');
    const eventId=stableUuid(secret,'voice-sms-event',json({callSid:context.callSid,recordHandleHash:resolved.handleHash,template}));
    const provider=typeof providers.sendSms==='function'?{send:providers.sendSms}:providers.sms||{};
    const service=providers.smsDelivery||createVoiceSmsService({database,provider,clock:()=>instant().getTime()});
    service.enqueue({ownerId:context.ownerId,id:eventId,callSid:context.callSid,recordType:resolved.type,recordId,
      request:{accountSid:context.accountSid,from:context.to,to:context.from,template,recordType:resolved.type,record:resolved.reference,body}});
    await service.processOne(context.ownerId,eventId);
    const state=service.state(context.ownerId,eventId);
    if(['SENT','DELIVERED'].includes(state.status))return {status:'sent',message:'The text message was sent.'};
    if(['PENDING','DELIVERING','QUEUED','ACCEPTED'].includes(state.status))return {status:'pending',message:'The text request is saved. It has not been confirmed as sent.'};
    return {status:'unavailable',message:'The text message could not be confirmed as sent. The request remains saved for review.'};
  }

  async function flagUrgent(input) {
    const args = invocation(input);
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    const summary = typeof args.summary === 'string' ? args.summary.trim() : '';
    if (!['active_leak','flooding','safety','complaint'].includes(reason)) throw runtimeError('URGENT_DETAILS_REQUIRED');
    const identity = json({ callSid: context.callSid, reason, summary });
    const urgentId = stableUuid(secret, 'voice-urgent-event', identity);
    const outboxId = stableUuid(secret, 'voice-urgent-outbox', identity);
    const createdAt = instant().toISOString();
    immediate(database, () => {
      const lead=saveInquiry(args.leadHandle?{leadHandle:args.leadHandle}:{}, {updates:{urgency:{reason,summary:summary||null,recordedAt:createdAt,source:'voice'}}});
      database.prepare('UPDATE calls SET urgency=?,updatedAt=? WHERE ownerId=? AND id=? AND callSid=?').run(reason,createdAt,context.ownerId,lead.row.callId,context.callSid);
      database.prepare('INSERT OR IGNORE INTO events (id, ownerId, eventType, payloadJson, createdAt) VALUES (?, ?, \'voice.urgent_flagged\', ?, ?)').run(
        urgentId, context.ownerId,
        JSON.stringify({
          callSid: context.callSid,
          callerNumber: context.from,
          reason,
          summary
        }),
        createdAt
      );
      writeOutbox({
        id: outboxId,
        eventType: 'voice.urgent_flagged',
        aggregateId: urgentId,
        payload: {
          callSid: context.callSid,
          callerNumber: context.from,
          reason,
          summary
        }
      });
    });
    const urgentHandle = issue('urgent', 'urgent:' + urgentId, { eventId: urgentId });
    return {
      status: 'flagged',
      urgentHandle,
      message: 'Urgency saved for the business. Owner notification has not been confirmed.'
    };
  }

  async function transferCall(input) {
    const args = invocation(input);
    if (args.customerConfirmed !== true) throw runtimeError('CUSTOMER_CONFIRMATION_REQUIRED');
    const reason = typeof args.reason === 'string' ? args.reason.trim() : '';
    if (!reason) throw runtimeError('TRANSFER_REASON_REQUIRED');
    if(args.leadHandle)loadLead(resolve(args.leadHandle,'lead'));
    const profile = database.prepare('SELECT existingPhoneNumber FROM businessProfiles WHERE ownerId = ?').get(
      context.ownerId
    );
    const destination = typeof profile?.existingPhoneNumber === 'string'
      ? profile.existingPhoneNumber.trim()
      : '';
    const identity = json({ callSid: context.callSid, reason, destination,...(args.inquiryNumber>1?{inquiryNumber:args.inquiryNumber}:{}) });
    const eventId = stableUuid(secret, 'voice-transfer-event', identity);
    // A failed transfer must never strand the caller. Persist the follow-up
    // before returning a saved acknowledgement, including on replay/restart.
    function unavailable(code,message){
      const callback=immediate(database,()=>{
        const key='transfer:'+reason+':'+(args.inquiryNumber??1);
        const prior=database.prepare('SELECT leadId,notes FROM callbackRequests WHERE ownerId=? AND callId=? AND requestKey=?').get(context.ownerId,callRow().id,key);
        let words=args.notes??prior?.notes;
        if(words===undefined){
          const call=callRow();
          const turns=database.prepare('SELECT role,text FROM transcriptTurns WHERE ownerId=? AND callId=? ORDER BY sequence DESC,id DESC').all(context.ownerId,call.id);
          const raw=database.prepare('SELECT transcriptJson FROM calls WHERE ownerId=? AND id=?').get(context.ownerId,call.id);
          const recent=turns.find(turn=>['caller','user'].includes(turn.role))||[...(parseJson(raw?.transcriptJson,[])||[])].reverse().find(turn=>['caller','user'].includes(turn?.role));
          words=typeof recent?.text==='string'&&recent.text.trim()?recent.text.slice(0,1000):null;
        }
        const lead=saveInquiry(args.leadHandle?{leadHandle:args.leadHandle}:{},{leadId:prior?.leadId,key,type:'CALLBACK',updates:{...(words?{notes:words}:{}),description:'Callback requested after an unsuccessful transfer'}});
        return saveCallbackRequest({database,ownerId:context.ownerId,callId:lead.row.callId,leadId:lead.row.id,requestKey:key,source:'transfer_failed',reason,notes:words??prior?.notes??null,at:instant().toISOString()});
      });
      return {status:'unavailable',reason:code,message:message+' A callback request was saved. Owner notification has not been confirmed.',callbackSaved:true};
    }

    if (!E164.test(destination)) {
      writeOutbox({
        id: eventId,
        eventType: 'voice.transfer_requested',
        aggregateId: context.callSid,
        payload: { callSid: context.callSid, reason },
        status: 'FAILED'
      });
      return unavailable('TRANSFER_DESTINATION_UNAVAILABLE','A live transfer destination is not configured.');
    }
    const prior = database.prepare('SELECT status FROM outboxEvents WHERE id = ? AND ownerId = ?').get(
      eventId, context.ownerId
    );
    if (prior) {
      return prior.status === 'CONNECTED'
        ? { status: 'transferred', message: 'The call was connected.' }
        : unavailable('TRANSFER_PROVIDER_UNAVAILABLE','The live transfer could not be confirmed.');
    }
    writeOutbox({
      id: eventId,
      eventType: 'voice.transfer_requested',
      aggregateId: context.callSid,
      payload: { callSid: context.callSid, reason }
    });
    const transfer = typeof providers.transferCall === 'function'
      ? providers.transferCall
      : typeof providers.telephony?.transfer === 'function'
        ? providers.telephony.transfer.bind(providers.telephony)
        : null;
    if (!transfer) {
      updateOutbox(eventId, 'FAILED');
      return unavailable('TRANSFER_PROVIDER_UNAVAILABLE','Live transfer is not available right now.');
    }
    try {
      const result = await transfer({
        ownerId: context.ownerId,
        accountSid: context.accountSid,
        callSid: context.callSid,
        destination,
        reason,
        notes:args.notes,
        inquiryNumber:args.inquiryNumber,
        idempotencyKey: eventId
      });
      if(providerStatus(result)==='PENDING')return {status:'transferring',message:'Trying to connect your call. The connection has not yet been confirmed.'};
      if (providerStatus(result) !== 'CONNECTED') {
        updateOutbox(eventId, 'FAILED');
        return unavailable('TRANSFER_NOT_CONFIRMED','The live transfer could not be confirmed.');
      }
      updateOutbox(eventId, 'CONNECTED');
      return { status: 'transferred', message: 'The call was connected.' };
    } catch {
      updateOutbox(eventId, 'FAILED');
      return unavailable('TRANSFER_PROVIDER_UNAVAILABLE','The live transfer failed.');
    }
  }

  function callerOwnsAppointment(resolved) {
    const appointmentId = resolved.reference.appointmentId;
    if (typeof appointmentId !== 'string') throw runtimeError('INVALID_APPOINTMENT_HANDLE');
    const row = database.prepare('SELECT * FROM appointments WHERE id = ? AND ownerId = ?').get(
      appointmentId, context.ownerId
    );
    const customer = parseJson(row?.customerJson);
    if (!row || !record(customer) || customerPhone(customer.phone) !== context.from) {
      throw runtimeError('INVALID_APPOINTMENT_HANDLE');
    }
    if (resolved.reference.customerId && row.customerId !== resolved.reference.customerId) {
      throw runtimeError('INVALID_APPOINTMENT_HANDLE');
    }
    return { row, customer };
  }

  async function modifyAppointment(input) {
    const args = invocation(input);
    const preserveChange=()=>immediate(database,()=>saveInquiry({}, {key:'appointment-change:'+args.appointmentHandle,type:'CALLBACK',updates:{description:'Appointment '+args.action+' requested',notes:'The caller requested an appointment '+args.action+'. Provider confirmation was not received.'}}));
    if (args.customerConfirmed !== true) throw runtimeError('CUSTOMER_CONFIRMATION_REQUIRED');
    const appointmentResolved = resolve(args.appointmentHandle, 'appointment');
    const { row } = callerOwnsAppointment(appointmentResolved);
    let slotResolved = null;
    if (args.action === 'reschedule') {
      slotResolved = resolve(args.slotHandle, 'slot');
      if (slotResolved.reference.appointmentId !== row.id || !slotResolved.reference.intentId ||
          (slotResolved.reference.customerId && slotResolved.reference.customerId !== row.customerId)) {
        throw runtimeError('BOOKING_BINDING_MISMATCH');
      }
    } else if (args.action !== 'cancel') {
      throw runtimeError('INVALID_APPOINTMENT_ACTION');
    }
    const identity = json({
      callSid: context.callSid,
      appointmentHandleHash: appointmentResolved.handleHash,
      action: args.action,
      slotHandleHash: slotResolved?.handleHash || null
    });
    const eventId = stableUuid(secret, 'voice-appointment-change', identity);
    const prior = database.prepare('SELECT status FROM outboxEvents WHERE id = ? AND ownerId = ?').get(
      eventId, context.ownerId
    );
    if (prior) {
      if (prior.status !== 'CONFIRMED') {
        preserveChange();return {
          status: 'unavailable',
          reason: 'APPOINTMENT_PROVIDER_UNAVAILABLE',
          message: 'The appointment change could not be confirmed.'
        };
      }
      const appointmentHandle = issue('appointment', 'appointment:' + row.id, {
        appointmentId: row.id,
        intentId: row.bookingIntentId,
        customerId: row.customerId
      });
      return {
        status: args.action === 'cancel' ? 'cancelled' : 'rescheduled',
        appointmentHandle,
        message: 'The appointment change was confirmed.'
      };
    }
    writeOutbox({
      id: eventId,
      eventType: 'voice.appointment_change_requested',
      aggregateId: row.id,
      payload: {
        callSid: context.callSid,
        action: args.action,
        appointmentId: row.id,
        slotDigest: slotResolved?.resourceKeyDigest || null
      }
    });
    const modify = typeof providers.modifyAppointment === 'function'
      ? providers.modifyAppointment
      : typeof providers.appointments?.modify === 'function'
        ? providers.appointments.modify.bind(providers.appointments)
        : null;
    if (!modify) {
      updateOutbox(eventId, 'FAILED');
      preserveChange();return {
        status: 'unavailable',
        reason: 'APPOINTMENT_PROVIDER_UNAVAILABLE',
        message: 'Appointment changes are not available right now.'
      };
    }
    try {
      const result = await modify({
        ownerId: context.ownerId,
        callSid: context.callSid,
        action: args.action,
        appointment: row,
        slotId: slotResolved?.reference?.slotId || null,
        intentId: slotResolved?.reference?.intentId || null,
        idempotencyKey: eventId
      });
      if (providerStatus(result) !== 'CONFIRMED') {
        updateOutbox(eventId, 'FAILED');
        preserveChange();return {
          status: 'unavailable',
          reason: 'APPOINTMENT_CHANGE_NOT_CONFIRMED',
          message: 'The appointment change could not be confirmed.'
        };
      }
      const updatedAt = instant().toISOString();
      if (args.action === 'cancel') {
        database.prepare('UPDATE appointments SET status = \'CANCELLED\', updatedAt = ? WHERE id = ? AND ownerId = ?').run(
          updatedAt, row.id, context.ownerId
        );
      } else {
        database.prepare('UPDATE appointments SET status = \'CONFIRMED\', startAtUtc = COALESCE(?, startAtUtc), endAtUtc = COALESCE(?, endAtUtc), datetime = COALESCE(?, datetime), updatedAt = ? WHERE id = ? AND ownerId = ?').run(
          typeof result.startUtc === 'string' ? result.startUtc : null,
          typeof result.endUtc === 'string' ? result.endUtc : null,
          typeof result.startUtc === 'string' ? result.startUtc : null,
          updatedAt, row.id, context.ownerId
        );
      }
      updateOutbox(eventId, 'CONFIRMED');
      const appointmentHandle = issue('appointment', 'appointment:' + row.id, {
        appointmentId: row.id,
        intentId: row.bookingIntentId,
        customerId: row.customerId
      });
      return {
        status: args.action === 'cancel' ? 'cancelled' : 'rescheduled',
        appointmentHandle,
        message: 'The appointment change was confirmed.'
      };
    } catch {
      updateOutbox(eventId, 'FAILED');
      preserveChange();return {
        status: 'unavailable',
        reason: 'APPOINTMENT_PROVIDER_UNAVAILABLE',
        message: 'The appointment change failed.'
      };
    }
  }

  async function getCustomerContext(input) {
    invocation(input);
    if(!isPhoneNumber(context.from))return {status:'not_found',message:'Caller ID is withheld. Ask for contact details; do not look up anonymous caller history.'};
    const {customer,appointments,openLeads,recentQuotes,quoteRequests}=customerHistory(database,context);
    if (!customer && !appointments.length && !openLeads.length && !recentQuotes.length && !quoteRequests.length) {
      return {status:'not_found',message:'No caller-owned customer history was found.'};
    }
    const output={status:'found',openLeads,recentQuotes,quoteRequests,
      recentAppointments:appointments.map(row=>{
        const handle=issue('appointment','appointment:'+row.id,{appointmentId:row.id,intentId:row.bookingIntentId||null,customerId:row.customerId||null});
        return handle+' — '+String(row.status||'unknown').toLowerCase()+' — '+(row.startAtUtc||row.datetime||'time unavailable');
      })};
    if(customer){
      output.customerHandle=issue('customer','customer:'+customer.id,{customerId:customer.id});
      if(typeof customer.name==='string'&&customer.name.trim())output.greetingName=customer.name.trim().slice(0,120);
      const storedAddress=parseJson(customer.address);
      if(completeAddress(storedAddress))output.address=Object.fromEntries(['line1','line2','city','region','postalCode','country'].map(key=>[key,storedAddress[key]||'']));
    }
    return output;
  }

  const handlers = Object.freeze({
    matchService,
    getQuote,
    checkAvailability,
    bookAppointment,
    captureLead,
    logQuoteRequest,
    sendSms,
    flagUrgent,
    transferCall,
    modifyAppointment,
    getCustomerContext
  });

  return Object.freeze({ handlers, idempotencyStore, handleStore, context });
}
