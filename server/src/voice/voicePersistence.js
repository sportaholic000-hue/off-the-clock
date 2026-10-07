import {isVoiceCaller} from './callerIdentity.js';
import crypto from 'node:crypto';
import {isFinalVoiceCall,preserveVoiceRequest} from './voiceRecovery.js';

const HASH = /^[0-9a-f]{64}$/;
const CALL_SID = /^CA[0-9a-f]{32}$/i;
const ACCOUNT_SID = /^AC[0-9a-f]{32}$/i;
const E164 = /^\+[1-9]\d{7,14}$/;
const REASON = /^[A-Z][A-Z0-9_]{2,63}$/;

function isoFromEpoch(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be epoch milliseconds.`);
  return new Date(value).toISOString();
}

function epochFromIso(value) {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) {
    throw new Error('Stored voice timestamp is invalid.');
  }
  return epoch;
}

function sameBinding(row, binding) {
  return row.ownerId === binding.ownerId && row.callSid === binding.callSid &&
    row.fromNumber === binding.from && row.toNumber === binding.to &&
    row.accountSid === binding.accountSid;
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

function validContext(context) {
  return context && typeof context === 'object' && !Array.isArray(context) &&
    typeof context.ownerId === 'string' && context.ownerId.length > 0 &&
    CALL_SID.test(String(context.callSid || '')) &&
    ACCOUNT_SID.test(String(context.accountSid || '')) &&
    isVoiceCaller(String(context.from || '')) && E164.test(String(context.to || ''));
}

function callBindingMismatch() {
  return Object.assign(new Error('The voice call could not be routed safely.'),{
    code:'VOICE_CALL_BINDING_MISMATCH',statusCode:403
  });
}

export function createVoiceNonceRepository({ database, randomUUID = crypto.randomUUID } = {}) {
  if (!database || typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
    throw new TypeError('Voice nonce persistence requires a synchronous SQLite database.');
  }
  return Object.freeze({
    insert(record) {
      if (!record || !HASH.test(String(record.nonceHash || '')) || !validContext({
        ownerId: record.ownerId,
        callSid: record.callSid,
        accountSid: record.accountSid,
        from: record.from,
        to: record.to
      })) throw new TypeError('Voice nonce record is invalid.');
      return immediate(database, () => {
        if (database.prepare('SELECT 1 FROM voiceSessionNonces WHERE nonceHash = ?').get(record.nonceHash)) {
          return false;
        }
        database.prepare(`INSERT INTO voiceSessionNonces (
          id, nonceHash, ownerId, accountSid, callSid, fromNumber, toNumber,
          expiresAtUtc, consumedAtUtc, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`).run(
          randomUUID(), record.nonceHash, record.ownerId, record.accountSid,
          record.callSid, record.from, record.to, isoFromEpoch(record.expiresAt, 'Nonce expiry'),
          isoFromEpoch(record.issuedAt, 'Nonce issue time')
        );
        return true;
      });
    },

    consume({ nonceHash, binding, now }) {
      if (!HASH.test(String(nonceHash || '')) || !validContext(binding)) {
        return { status: 'mismatch' };
      }
      const consumedAtUtc = isoFromEpoch(now, 'Nonce consumption time');
      return immediate(database, () => {
        const row = database.prepare('SELECT * FROM voiceSessionNonces WHERE nonceHash = ?').get(nonceHash);
        if (!row) return { status: 'not_found' };
        if (!sameBinding(row, binding)) return { status: 'mismatch' };
        const expiresAt = epochFromIso(row.expiresAtUtc);
        if (expiresAt <= now) return { status: 'expired' };
        if (row.consumedAtUtc) return { status: 'replayed' };
        const updated = database.prepare(`UPDATE voiceSessionNonces SET consumedAtUtc = ?
          WHERE nonceHash = ? AND consumedAtUtc IS NULL`).run(consumedAtUtc, nonceHash);
        if (updated.changes !== 1) return { status: 'replayed' };
        return {
          status: 'consumed',
          record: {
            nonceHash: row.nonceHash,
            ownerId: row.ownerId,
            accountSid: row.accountSid,
            callSid: row.callSid,
            from: row.fromNumber,
            to: row.toNumber,
            expiresAt
          }
        };
      });
    }
  });
}

export function createVoiceSessionStore({
  database,
  clock = () => new Date(),
  maxConcurrentCalls = 5,
  randomUUID = crypto.randomUUID
} = {}) {
  if (!database || typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
    throw new TypeError('Voice session persistence requires a synchronous SQLite database.');
  }
  function nowIso() {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new TypeError('Voice clock returned an invalid instant.');
    return date.toISOString();
  }

  function nonceRow(sessionKey) {
    if (!HASH.test(String(sessionKey || ''))) throw new TypeError('Voice session key is invalid.');
    return database.prepare('SELECT * FROM voiceSessionNonces WHERE nonceHash = ?').get(sessionKey);
  }

  if(!Number.isSafeInteger(maxConcurrentCalls)||maxConcurrentCalls<1)throw new TypeError('Invalid concurrent call ceiling.');
  function boundCall(context){
    const call=database.prepare('SELECT * FROM calls WHERE ownerId=? AND callSid=?').get(context.ownerId,context.callSid);
    if(call&&(call.accountSid!==context.accountSid||call.callerNumber!==context.from||call.destinationNumber!==context.to))throw Error('Call binding mismatch.');
    return call;
  }
  function preserve(context,call,reason,at=nowIso()){
    return preserveVoiceRequest({database,context,call,reason,at});
  }

  return Object.freeze({
    validateIncomingCall({call}) {
      if(!call||!CALL_SID.test(String(call.callSid||''))||!ACCOUNT_SID.test(String(call.accountSid||''))||!isVoiceCaller(String(call.from||''))||!E164.test(String(call.to||'')))return false;
      const existing=database.prepare('SELECT accountSid,callerNumber,destinationNumber FROM calls WHERE callSid=?').get(call.callSid);
      return !existing||(existing.accountSid===call.accountSid&&existing.callerNumber===call.from&&existing.destinationNumber===call.to);
    },
    validateCallBinding({context}) {
      if(!validContext(context))return false;
      const existing=database.prepare('SELECT ownerId,accountSid,callerNumber,destinationNumber FROM calls WHERE callSid=?').get(context.callSid);
      return !existing||(existing.ownerId===context.ownerId&&existing.accountSid===context.accountSid&&existing.callerNumber===context.from&&existing.destinationNumber===context.to);
    },
    createSession({ sessionKey, context, expiresAt }) {
      if (!validContext(context)) throw new TypeError('Voice call context is invalid.');
      const expectedExpiry = isoFromEpoch(expiresAt, 'Voice session expiry');
      return immediate(database, () => {
        const nonce = nonceRow(sessionKey);
        if (!nonce || !sameBinding(nonce, context) || nonce.expiresAtUtc !== expectedExpiry || nonce.consumedAtUtc) {
          throw new Error('Voice session nonce is unavailable or mismatched.');
        }
        const existing = database.prepare('SELECT * FROM calls WHERE callSid = ?').get(context.callSid);
        if (existing) {
          if (existing.ownerId !== context.ownerId || existing.accountSid !== context.accountSid ||
              existing.callerNumber !== context.from || existing.destinationNumber !== context.to) {
            throw callBindingMismatch();
          }
          if(existing.status!=='CONNECTING')return {status:'duplicate',callRecordId:existing.id};
          // Only the original nonce can refer to this call. A second inbound
          // delivery must replay its durable TwiML, never mint another session.
          const first=database.prepare('SELECT nonceHash FROM voiceSessionNonces WHERE ownerId=? AND callSid=? ORDER BY rowid LIMIT 1').get(context.ownerId,context.callSid);
          return {status:first?.nonceHash===sessionKey?'created':'duplicate',callRecordId:existing.id};
        }
        // An unused connection reservation stops consuming capacity when its
        // nonce expires. Keep the call row available for late fallback capture
        // and restart recovery; connected calls remain active regardless of age.
        const active=database.prepare(`SELECT COUNT(*) n FROM calls c WHERE c.ownerId=? AND (
          c.status IN ('CONNECTED','TRANSFERRING') OR (c.status='CONNECTING' AND EXISTS (
            SELECT 1 FROM voiceSessionNonces n WHERE n.ownerId=c.ownerId AND n.callSid=c.callSid AND n.expiresAtUtc>?
          )))`).get(context.ownerId,nowIso()).n;
        if(active>=maxConcurrentCalls)return {status:'capacity'};
        const id = randomUUID();
        const createdAt = nowIso();
        database.prepare(`INSERT INTO calls (
          id, ownerId, callSid, accountSid, callerNumber, destinationNumber,
          status, outcome, transcriptJson, minutesBilled, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, 'CONNECTING', NULL, '[]', 0, ?, ?)`).run(
          id, context.ownerId, context.callSid, context.accountSid,
          context.from, context.to, createdAt, createdAt
        );
        return { status: 'created', callRecordId: id };
      });
    },

    loadSessionByNonceHash({ sessionKey }) {
      const nonce = nonceRow(sessionKey);
      if (!nonce) return null;
      const call = database.prepare(`SELECT id, ownerId, callSid, accountSid, callerNumber,
        destinationNumber, status FROM calls WHERE callSid = ?`).get(nonce.callSid);
      if (!call || call.ownerId !== nonce.ownerId || call.accountSid !== nonce.accountSid ||
          call.callerNumber !== nonce.fromNumber || call.destinationNumber !== nonce.toNumber) return null;
      return {
        context: {
          ownerId: nonce.ownerId,
          callSid: nonce.callSid,
          accountSid: nonce.accountSid,
          from: nonce.fromNumber,
          to: nonce.toNumber
        },
        session: { callRecordId: call.id, status: call.status }
      };
    },

    recordHumanRouting({context,forwarded}) {
      if(!validContext(context))throw new TypeError('Voice call context is invalid.');
      return immediate(database,()=>{
        const existing=boundCall(context);if(existing){if(isFinalVoiceCall(existing.status))return {terminal:true};return {callRecordId:existing.id};}
        const at=nowIso(),id=randomUUID(),message=forwarded?'Operator was off. Routing was issued to the business phone; a human answer has not been confirmed.':'Operator was off. Human routing could not be confirmed because forwarding setup is incomplete. No AI answering or message capture was started.';
        database.prepare("INSERT INTO calls(id,ownerId,callSid,accountSid,callerNumber,destinationNumber,status,outcome,summaryText,transcriptJson,minutesBilled,createdAt,updatedAt) VALUES(?,?,?,?,?,?,'HUMAN_ROUTING','OPERATOR_OFF',?,'[]',0,?,?)").run(id,context.ownerId,context.callSid,context.accountSid,context.from,context.to,message,at,at);
        return {callRecordId:id};
      });
    },
    recordFallback({ context, reason }) {
      if (!validContext(context)) throw new TypeError('Voice fallback context is invalid.');
      const safeReason = REASON.test(String(reason || '')) ? reason : 'VOICE_FALLBACK';
      return immediate(database, () => {
        const existing = database.prepare('SELECT * FROM calls WHERE callSid = ?').get(context.callSid);
        const at = nowIso();
        if (existing) {
          if (existing.ownerId !== context.ownerId || existing.accountSid !== context.accountSid ||
              existing.callerNumber !== context.from || existing.destinationNumber !== context.to) {
            throw callBindingMismatch();
          }
          if(isFinalVoiceCall(existing.status))return {callRecordId:existing.id,terminal:true};
          preserve(context,existing,safeReason,at);
          database.prepare(`UPDATE calls SET status = 'FALLBACK', minutesBilled = 0, outcome = ?, failureCode = ?,
            completedAt = NULL, updatedAt = ? WHERE id = ? AND ownerId = ?`).run(
            safeReason, safeReason, at, existing.id, context.ownerId
          );
          return { callRecordId: existing.id };
        }
        const id = randomUUID();
        database.prepare(`INSERT INTO calls (
          id, ownerId, callSid, accountSid, callerNumber, destinationNumber,
          status, outcome, transcriptJson, minutesBilled, failureCode,
          completedAt, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, 'FALLBACK', ?, '[]', 0, ?, NULL, ?, ?)`).run(
          id, context.ownerId, context.callSid, context.accountSid, context.from,
          context.to, safeReason, safeReason, at, at
        );
        preserve(context,boundCall(context),safeReason,at);
        return { callRecordId: id };
      });
    },

    appendFallbackText({context,text}){
      if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text)>16384)throw Error('Invalid fallback text.');
      return immediate(database,()=>{
        const call=boundCall(context);if(!call)throw Error('Call unavailable.');
        if(isFinalVoiceCall(call.status))return {terminal:true};
        const transcript=JSON.parse(call.transcriptJson||'[]'),key=crypto.createHash('sha256').update(text).digest('hex');
        if(!transcript.some(t=>t.fallbackKey===key))transcript.push({role:'user',text,final:true,fallbackKey:key});
        const at=nowIso();database.prepare('UPDATE calls SET transcriptJson=?,updatedAt=? WHERE id=? AND ownerId=?').run(JSON.stringify(transcript),at,call.id,context.ownerId);
        preserve(context,{...call,transcriptJson:JSON.stringify(transcript)},'VOICE_FALLBACK',at);
        return {saved:true};
      });
    },

    finishCall({context,status,reason,streamSid=null,duration=0,finalizeMetadata}){
      return immediate(database,()=>{
        const call=boundCall(context);if(!call)throw Error('Call unavailable.');
        if(isFinalVoiceCall(call.status)||call.status==='TRANSFERRING'){finalizeMetadata?.();return;}
        const at=nowIso();
        // Even without an explicit captureLead tool call, preserve the caller's
        // received request. Never mark final if this transaction cannot commit.
        if(status!=='COMPLETED'||JSON.parse(call.transcriptJson||'[]').some(t=>['user','caller'].includes(t.role)))preserve(context,call,reason,at);
        database.prepare('UPDATE calls SET status=?,outcome=?,failureCode=?,streamSid=COALESCE(?,streamSid),duration=?,completedAt=?,updatedAt=? WHERE id=? AND ownerId=?').run(status,call.status==='FALLBACK'||call.outcome==='AI_FALLBACK'?'AI_FALLBACK':reason,status==='FAILED'?reason:null,streamSid,duration,at,at,call.id,context.ownerId);
        finalizeMetadata?.();
      });
    },

    recoverActiveCalls(){
      // Startup is an explicitly cross-owner platform operation. Each recovery
      // mutation is still bound to its persisted owner and immutable call ID.
      return immediate(database,()=>{
        const rows=database.prepare("SELECT * FROM calls WHERE status IN ('CONNECTING','CONNECTED','TRANSFERRING','FAILED') OR (status='FALLBACK' AND completedAt IS NULL)").all();
        for(const call of rows){
          // Legacy active rows may predate signed provider metadata. They are
          // still persisted owner requests, never candidates for a new call.
          const context={ownerId:call.ownerId,callSid:call.callSid||'legacy:'+call.id,accountSid:call.accountSid,from:call.callerNumber||'unknown',to:call.destinationNumber};
          const at=nowIso();preserve(context,call,'VOICE_RESTART_RECOVERY',at);
          database.prepare("UPDATE calls SET status='RECOVERED',outcome=CASE WHEN status='FALLBACK' THEN 'AI_FALLBACK' ELSE outcome END,failureCode='VOICE_RESTART_RECOVERY',completedAt=?,updatedAt=? WHERE id=? AND ownerId=?").run(at,at,call.id,call.ownerId);
        }
        return rows.length;
      });
    }
  });
}

export function findVoiceTenantsByNumber(database, twilioNumber) {
  if (!E164.test(String(twilioNumber || ''))) return [];
  return database.prepare(`SELECT ownerId, twilioNumber FROM businessProfiles
    WHERE twilioNumber = ?`).all(twilioNumber);
}

export function loadVoiceAccountContext(database, ownerId) {
  const account = database.prepare(`SELECT id, plan, planStatus, trialEndsAt, paymentFailedAt, annualPaidThroughAt, paidThroughAt, serviceEndsAt
    FROM users WHERE id = ? AND role = 'owner'`).get(ownerId);
  const profile = database.prepare(`SELECT ownerId, operatorEnabled, existingPhoneNumber,
    phoneProvisioningStatus, carrierSetupStatus, twilioNumber, twilioNumberSid, knowledgeBaseJson
    FROM businessProfiles WHERE ownerId = ?`).get(ownerId);
  const usage = database.prepare(`SELECT COALESCE(SUM(minutesBilled), 0) AS minutesUsed
    FROM calls WHERE ownerId = ?`).get(ownerId);
  return { account: account || null, profile: profile || null, minutesUsed: usage?.minutesUsed };
}

const RECEIPT_SCOPE = /^[0-9a-f]{64}$/;
const RECEIPT_KEY = /^[A-Za-z0-9_.:-]{1,200}$/;
const HANDLE_VALUE = /^[A-Za-z0-9_-]{43}$/;
const HANDLE_TYPE = /^[a-z][a-z0-9_]{1,31}$/;
const inflightByDatabase = new WeakMap();

export class VoicePersistenceError extends Error {
  constructor(code, message = 'Voice persistence is unavailable.') {
    super(message);
    this.name = 'VoicePersistenceError';
    this.code = code;
  }
}

function persistenceError(code, message) {
  return new VoicePersistenceError(code, message);
}

function dateFromClock(clock, label = 'Voice persistence clock') {
  const value = clock();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} returned an invalid instant.`);
  return date;
}

function strictJson(value, label) {
  let serialized;
  try { serialized = JSON.stringify(value); }
  catch { throw new TypeError(`${label} must be JSON serializable.`); }
  if (typeof serialized !== 'string') throw new TypeError(`${label} must be JSON serializable.`);
  let parsed;
  try { parsed = JSON.parse(serialized); }
  catch { throw new TypeError(`${label} must be JSON serializable.`); }
  return { json: serialized, parsed };
}

function parseReceipt(value) {
  try { return JSON.parse(value); }
  catch { throw persistenceError('INVALID_STORED_RECEIPT'); }
}

function sameHandleBinding(row, context) {
  return row.ownerId === context.ownerId && row.callSid === context.callSid &&
    row.accountSid === context.accountSid && row.callerNumber === context.from &&
    row.destinationNumber === context.to;
}

function requirePersistenceDatabase(database, label) {
  if (!database || typeof database.prepare !== 'function' || typeof database.exec !== 'function') {
    throw new TypeError(`${label} requires a synchronous SQLite database.`);
  }
}

/**
 * Durable implementation of toolDispatcher's idempotency contract. A running
 * claim is committed before execution, completed responses are persisted, and
 * failed executions remove only their uncompleted claim. Runtime mutations
 * also carry deterministic/application-level idempotency because provider and
 * booking work cannot share a SQLite transaction with this generic boundary.
 */
export function createVoiceToolIdempotencyStore({
  database,
  clock = () => new Date(),
  leaseMs = 30_000
} = {}) {
  requirePersistenceDatabase(database, 'Voice tool idempotency');
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 300_000) {
    throw new TypeError('Voice tool idempotency lease must be between 1 and 300 seconds.');
  }
  let inflight = inflightByDatabase.get(database);
  if (!inflight) {
    inflight = new Map();
    inflightByDatabase.set(database, inflight);
  }

  function validateRequest(scope, key, digest, execute) {
    if (!RECEIPT_SCOPE.test(String(scope || '')) ||
        !RECEIPT_KEY.test(String(key || '')) ||
        !RECEIPT_SCOPE.test(String(digest || '')) || typeof execute !== 'function') {
      throw new TypeError('Voice tool idempotency request is invalid.');
    }
  }

  return Object.freeze({
    async run({ scope, key, digest, execute } = {}) {
      validateRequest(scope, key, digest, execute);
      const inflightKey = `${scope}\0${key}`;
      const local = inflight.get(inflightKey);
      if (local) {
        if (local.digest !== digest) return { status: 'conflict' };
        const value = await local.promise;
        return { status: 'replayed', value };
      }

      const now = dateFromClock(clock);
      const nowIso = now.toISOString();
      const leaseExpiresAtUtc = new Date(now.getTime() + leaseMs).toISOString();
      const decision = immediate(database, () => {
        const row = database.prepare(`SELECT requestDigest, status, responseJson, leaseExpiresAtUtc
          FROM voiceToolIdempotencyReceipts
          WHERE scopeHash = ? AND idempotencyKey = ?`).get(scope, key);
        if (row) {
          if (row.requestDigest !== digest) return { status: 'conflict' };
          if (row.status === 'COMPLETED') {
            return { status: 'replayed', value: parseReceipt(row.responseJson) };
          }
          const lease = Date.parse(row.leaseExpiresAtUtc);
          if (!Number.isFinite(lease)) throw persistenceError('INVALID_STORED_RECEIPT');
          if (lease > now.getTime()) return { status: 'busy' };
          const updated = database.prepare(`UPDATE voiceToolIdempotencyReceipts
            SET leaseExpiresAtUtc = ?, updatedAt = ?
            WHERE scopeHash = ? AND idempotencyKey = ? AND requestDigest = ?
              AND status = 'RUNNING' AND leaseExpiresAtUtc <= ?`).run(
            leaseExpiresAtUtc, nowIso, scope, key, digest, nowIso
          );
          return updated.changes === 1 ? { status: 'claimed' } : { status: 'busy' };
        }
        database.prepare(`INSERT INTO voiceToolIdempotencyReceipts (
          scopeHash, idempotencyKey, requestDigest, status, responseJson,
          leaseExpiresAtUtc, createdAt, updatedAt
        ) VALUES (?, ?, ?, 'RUNNING', NULL, ?, ?, ?)`).run(
          scope, key, digest, leaseExpiresAtUtc, nowIso, nowIso
        );
        return { status: 'claimed' };
      });

      if (decision.status === 'conflict') return decision;
      if (decision.status === 'replayed') return decision;
      if (decision.status !== 'claimed') throw persistenceError('IDEMPOTENCY_IN_PROGRESS');

      const promise = Promise.resolve().then(execute).then(value => {
        const serialized = strictJson(value, 'Voice tool response');
        const completedAt = dateFromClock(clock).toISOString();
        immediate(database, () => {
          const updated = database.prepare(`UPDATE voiceToolIdempotencyReceipts
            SET status = 'COMPLETED', responseJson = ?, updatedAt = ?, leaseExpiresAtUtc = ?
            WHERE scopeHash = ? AND idempotencyKey = ? AND requestDigest = ? AND status = 'RUNNING'`).run(
            serialized.json, completedAt, completedAt, scope, key, digest
          );
          if (updated.changes !== 1) throw persistenceError('IDEMPOTENCY_COMMIT_LOST');
        });
        return serialized.parsed;
      }).catch(error => {
        try {
          immediate(database, () => {
            database.prepare(`DELETE FROM voiceToolIdempotencyReceipts
              WHERE scopeHash = ? AND idempotencyKey = ? AND requestDigest = ? AND status = 'RUNNING'`)
              .run(scope, key, digest);
          });
        } catch { /* retain the original execution error */ }
        throw error;
      });
      inflight.set(inflightKey, { digest, promise });
      try {
        return { status: 'executed', value: await promise };
      } finally {
        if (inflight.get(inflightKey)?.promise === promise) inflight.delete(inflightKey);
      }
    }
  });
}

/**
 * Issues deterministic HMAC handles while storing only their SHA-256 digest.
 * The call/tenant binding is part of both the MAC and the persisted row, so a
 * handle cannot move between callers, calls, tenants, destinations, or types.
 */
export function createVoiceHandleStore({
  database,
  secret,
  clock = () => new Date()
} = {}) {
  requirePersistenceDatabase(database, 'Voice handle persistence');
  const key = Buffer.isBuffer(secret) ? Buffer.from(secret) :
    typeof secret === 'string' ? Buffer.from(secret, 'utf8') : null;
  if (!key || key.length < 32) throw new TypeError('Voice handles require a secret of at least 32 bytes.');

  function assertContext(context) {
    if (!validContext(context)) throw new TypeError('Voice handle call context is invalid.');
  }

  return Object.freeze({
    issue({ context, type, resourceKey, reference, expiresAt } = {}) {
      assertContext(context);
      if (!HANDLE_TYPE.test(String(type || '')) || typeof resourceKey !== 'string' ||
          resourceKey.length < 1 || resourceKey.length > 500) {
        throw new TypeError('Voice handle identity is invalid.');
      }
      const expiry = expiresAt instanceof Date ? new Date(expiresAt.getTime()) : new Date(expiresAt);
      const now = dateFromClock(clock);
      if (!Number.isFinite(expiry.getTime()) || expiry <= now) {
        throw new TypeError('Voice handle expiry must be in the future.');
      }
      const stored = strictJson(reference, 'Voice handle reference');
      if (!stored.parsed || typeof stored.parsed !== 'object' || Array.isArray(stored.parsed)) {
        throw new TypeError('Voice handle reference must be an object.');
      }
      const resourceKeyDigest = crypto.createHash('sha256').update(resourceKey, 'utf8').digest('hex');
      const binding = JSON.stringify({
        version: 1,
        ownerId: context.ownerId,
        callSid: context.callSid,
        accountSid: context.accountSid,
        from: context.from,
        to: context.to,
        type,
        resourceKeyDigest
      });
      const handle = crypto.createHmac('sha256', key).update(binding, 'utf8').digest('base64url');
      const handleHash = crypto.createHash('sha256').update(handle, 'utf8').digest('hex');
      const expiryIso = expiry.toISOString();
      const nowIso = now.toISOString();
      const existing = database.prepare('SELECT * FROM voiceOpaqueHandles WHERE handleHash = ?').get(handleHash);
      if (existing) {
        if (!sameHandleBinding(existing, context) || existing.handleType !== type ||
            existing.resourceKeyDigest !== resourceKeyDigest) {
          throw persistenceError('HANDLE_COLLISION');
        }
        database.prepare(`UPDATE voiceOpaqueHandles
          SET referenceJson = ?, expiresAtUtc = ?, updatedAt = ?
          WHERE handleHash = ?`).run(stored.json, expiryIso, nowIso, handleHash);
        return handle;
      }
      database.prepare(`INSERT INTO voiceOpaqueHandles (
        handleHash, resourceKeyDigest, ownerId, callSid, accountSid,
        callerNumber, destinationNumber, handleType, referenceJson,
        expiresAtUtc, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        handleHash, resourceKeyDigest, context.ownerId, context.callSid, context.accountSid,
        context.from, context.to, type, stored.json, expiryIso, nowIso, nowIso
      );
      return handle;
    },

    resolve({ context, handle, expectedType } = {}) {
      assertContext(context);
      if (!HANDLE_VALUE.test(String(handle || ''))) throw persistenceError('INVALID_OPAQUE_HANDLE');
      const allowed = Array.isArray(expectedType) ? expectedType : [expectedType];
      if (!allowed.length || allowed.some(type => !HANDLE_TYPE.test(String(type || '')))) {
        throw new TypeError('Expected voice handle type is invalid.');
      }
      const handleHash = crypto.createHash('sha256').update(handle, 'utf8').digest('hex');
      const row = database.prepare('SELECT * FROM voiceOpaqueHandles WHERE handleHash = ?').get(handleHash);
      const expiresAt = Date.parse(row?.expiresAtUtc);
      if (!row || !sameHandleBinding(row, context) || !allowed.includes(row.handleType) ||
          !Number.isFinite(expiresAt) || expiresAt <= dateFromClock(clock).getTime()) {
        throw persistenceError('INVALID_OPAQUE_HANDLE');
      }
      let reference;
      try { reference = JSON.parse(row.referenceJson); }
      catch { throw persistenceError('INVALID_STORED_HANDLE'); }
      if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
        throw persistenceError('INVALID_STORED_HANDLE');
      }
      return Object.freeze({
        type: row.handleType,
        handleHash,
        resourceKeyDigest: row.resourceKeyDigest,
        expiresAtUtc: row.expiresAtUtc,
        reference
      });
    }
  });
}
