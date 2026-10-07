import { randomBytes, randomUUID } from 'node:crypto';
import { encryptCredentialPayload, decryptCredentialPayload } from './credentialEncryption.js';
import { hasOperatorAccess } from './planAccess.js';
import { WEBHOOK_EVENTS } from './outboundWebhookSchema.js';
import { resolveWebhookDestination, postWebhook, signWebhook, webhookDispatchEnabled } from './outboundWebhookTransport.js';

export const WEBHOOK_RETRY_DELAYS_MS = Object.freeze([60_000, 300_000, 900_000, 3_600_000, 10_800_000, 43_200_000, 86_400_000]);
const LEASE_MS = 60_000;
const flagFor = type => ({'lead.created':'leadsEnabled','quote.requested':'quotesEnabled','appointment.booked':'bookingsEnabled'})[type];

function transaction(database, work) {
  if (typeof database.transaction === 'function') return database.transaction(work).immediate();
  database.exec('BEGIN IMMEDIATE');
  try { const result = work(); database.exec('COMMIT'); return result; }
  catch (error) { database.exec('ROLLBACK'); throw error; }
}
function problem(message, statusCode = 400) {
  const error = new Error(message); error.statusCode = statusCode; return error;
}
function safePayload(row) {
  const input = JSON.parse(row.payloadJson);
  if (!input || input.id !== row.aggregateId) throw new Error('Webhook payload binding failed');
  const fields = {
    'lead.created': ['id','createdAt','customerName','phone','email','service','type','status'],
    'quote.requested': ['id','createdAt','service','estimatedValueCents','resultType'],
    'appointment.booked': ['id','createdAt','service','status','startAtUtc','endAtUtc','timezone',
      'durationMinutes','bookingMode','confirmedAt']
  }[row.eventType];
  if (!fields) throw new Error('Unknown webhook event');
  const data = {};
  for (const field of fields) {
    const value = input[field];
    if (value === null || typeof value === 'number' && Number.isFinite(value) || typeof value === 'string') data[field] = value;
  }
  if (input.customer && typeof input.customer === 'object') {
    data.customer = Object.fromEntries(['name','phone','email'].map(key =>
      [key, typeof input.customer[key] === 'string' ? input.customer[key] : null]));
  }
  return data;
}

export function createOutboundWebhookService({
  database, ownerQuery = sql => database.prepare(sql), encryptionOptions = {},
  now = Date.now, resolveDestination = resolveWebhookDestination, deliver = postWebhook,
  enabled = webhookDispatchEnabled
}) {
  const query = sql => {
    if (!/\bownerId\b/.test(sql)) throw new Error('Webhook query requires tenant binding');
    return ownerQuery(sql);
  };
  const endpoint = ownerId => query('SELECT * FROM webhookEndpoints WHERE ownerId = ?').get(ownerId);
  const iso = () => new Date(now()).toISOString();
  const configuration = record => record ? {
    url: record.url, events: WEBHOOK_EVENTS.filter(type => record[flagFor(type)] === 1),
    createdAt: record.createdAt, updatedAt: record.updatedAt
  } : null;

  function getConfiguration(ownerId) {
    return {
      webhook: configuration(endpoint(ownerId)),
      dispatchEnabled: Boolean(enabled()),
      deliveries: query(`SELECT id, eventType, aggregateId, status, attemptCount, nextAttemptAt,
        lastHttpStatus, lastErrorCode, deliveredAt, createdAt FROM webhookDeliveries
        WHERE ownerId = ? ORDER BY createdAt DESC, id DESC LIMIT 20`).all(ownerId)
    };
  }
  function listDeliveries(ownerId,{status='unresolved',offset='0'}={}){
    if(!['all','unresolved'].includes(status)||typeof offset!=='string'||!/^\d{1,8}$/.test(offset))throw problem('Unsupported webhook delivery page.');
    const filter=status==='unresolved'?" AND status NOT IN ('DELIVERED','CANCELED')":'';
    const total=query('SELECT COUNT(*) AS n FROM webhookDeliveries WHERE ownerId=?'+filter).get(ownerId).n;
    const deliveries=query(`SELECT id,eventType,aggregateId,status,attemptCount,nextAttemptAt,lastHttpStatus,lastErrorCode,deliveredAt,createdAt
      FROM webhookDeliveries WHERE ownerId=?${filter} ORDER BY createdAt DESC,id DESC LIMIT 50 OFFSET ?`).all(ownerId,Number(offset));
    return {deliveries,total,offset:Number(offset),nextOffset:Number(offset)+deliveries.length<total?Number(offset)+deliveries.length:null};
  }
  function cancelPending(ownerId) {
    query(`UPDATE webhookDeliveries SET status = 'CANCELED', leaseId = NULL, leaseExpiresAt = NULL,
      updatedAt = ? WHERE ownerId = ? AND status IN ('PENDING','DELIVERING','FAILED')`).run(iso(), ownerId);
  }
  function secretFor(record) {
    const payload = decryptCredentialPayload(record, encryptionOptions);
    if (payload.ownerId !== record.ownerId || payload.version !== record.version ||
        typeof payload.secret !== 'string' || !/^[0-9a-f]{64}$/.test(payload.secret)) {
      throw new Error('Webhook signing key binding failed');
    }
    return payload.secret;
  }
  function putEndpoint(ownerId, url, events, previous, rotate) {
    const changed = rotate || !previous || previous.url !== url ||
      WEBHOOK_EVENTS.some(type => Boolean(previous[flagFor(type)]) !== events.includes(type));
    if (!changed) return getConfiguration(ownerId);
    const version = randomUUID();
    const renewSecret = rotate || !previous || previous.url !== url;
    const secret = renewSecret ? randomBytes(32).toString('hex') : secretFor(previous);
    const sealed = encryptCredentialPayload({ownerId,version,secret}, encryptionOptions), timestamp = iso();
    transaction(database, () => {
      cancelPending(ownerId);
      query(`INSERT INTO webhookEndpoints
        (ownerId,version,url,leadsEnabled,quotesEnabled,bookingsEnabled,
          credentialsCiphertext,credentialsIv,credentialsTag,keyVersion,createdAt,updatedAt)
        VALUES (@ownerId,@version,@url,@leads,@quotes,@bookings,@ciphertext,@iv,@tag,@keyVersion,@createdAt,@updatedAt)
        ON CONFLICT(ownerId) DO UPDATE SET version=excluded.version,url=excluded.url,
          leadsEnabled=excluded.leadsEnabled,quotesEnabled=excluded.quotesEnabled,bookingsEnabled=excluded.bookingsEnabled,
          credentialsCiphertext=excluded.credentialsCiphertext,credentialsIv=excluded.credentialsIv,
          credentialsTag=excluded.credentialsTag,keyVersion=excluded.keyVersion,updatedAt=excluded.updatedAt`).run({
        ownerId,version,url,leads:Number(events.includes('lead.created')),quotes:Number(events.includes('quote.requested')),
        bookings:Number(events.includes('appointment.booked')),ciphertext:sealed.credentialsCiphertext,
        iv:sealed.credentialsIv,tag:sealed.credentialsTag,keyVersion:sealed.keyVersion,
        createdAt:previous?.createdAt || timestamp,updatedAt:timestamp
      });
    });
    return {...getConfiguration(ownerId), ...(renewSecret ? {signingSecret:secret} : {})};
  }
  async function save(ownerId, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some(key => !['url','events'].includes(key)) ||
        !Array.isArray(body.events) || body.events.some(type => !WEBHOOK_EVENTS.includes(type)) ||
        new Set(body.events).size !== body.events.length) throw problem('Choose the webhook URL and supported events.');
    const destination = await resolveDestination(body.url);
    // Read again after DNS, so concurrent settings changes cannot use a stale key.
    return putEndpoint(ownerId, destination.url.href, body.events, endpoint(ownerId), false);
  }
  function remove(ownerId) {
    transaction(database, () => {
      cancelPending(ownerId);
      query('DELETE FROM webhookEndpoints WHERE ownerId = ?').run(ownerId);
    });
    return getConfiguration(ownerId);
  }
  function rotate(ownerId) {
    const previous = endpoint(ownerId);
    if (!previous) throw problem('Save a webhook before rotating its signing secret.', 409);
    return putEndpoint(ownerId, previous.url, WEBHOOK_EVENTS.filter(type => previous[flagFor(type)]), previous, true);
  }
  function retry(ownerId, id) {
    const record = endpoint(ownerId);
    if (!record) throw problem('Webhook delivery not found.', 404);
    const result = query(`UPDATE webhookDeliveries SET status='PENDING',attemptCount=0,nextAttemptAt=?,
      leaseId=NULL,leaseExpiresAt=NULL,lastErrorCode=NULL,updatedAt=?
      WHERE ownerId=? AND id=? AND endpointVersion=? AND status='FAILED'`).run(now(),iso(),ownerId,id,record.version);
    if (!result.changes) throw problem('Webhook delivery not found or not eligible to retry.', 404);
    return getConfiguration(ownerId);
  }

  function claim(ownerId) {
    return transaction(database, () => {
      const row = query(`SELECT * FROM webhookDeliveries WHERE ownerId = ? AND
        ((status = 'PENDING' AND nextAttemptAt <= ?) OR (status = 'DELIVERING' AND leaseExpiresAt <= ?))
        ORDER BY nextAttemptAt,createdAt,id LIMIT 1`).get(ownerId,now(),now());
      if (!row) return null;
      const leaseId = randomUUID();
      query(`UPDATE webhookDeliveries SET status='DELIVERING',attemptCount=attemptCount+1,
        leaseId=?,leaseExpiresAt=?,updatedAt=? WHERE ownerId=? AND id=?`).run(leaseId,now()+LEASE_MS,iso(),ownerId,row.id);
      return {...row,leaseId,attemptCount:row.attemptCount+1};
    });
  }
  function complete(row, status, {httpStatus = null, errorCode = null, nextAttemptAt = 0} = {}) {
    query(`UPDATE webhookDeliveries SET status=?,lastHttpStatus=?,lastErrorCode=?,nextAttemptAt=?,
      leaseId=NULL,leaseExpiresAt=NULL,deliveredAt=?,updatedAt=?
      WHERE ownerId=? AND id=? AND leaseId=? AND status='DELIVERING'`).run(
      status,httpStatus,errorCode,nextAttemptAt,status === 'DELIVERED' ? iso() : null,iso(),row.ownerId,row.id,row.leaseId);
  }
  async function deliverOne(ownerId) {
    const row = claim(ownerId);
    if (!row) return;
    let httpStatus = null;
    try {
      let record = endpoint(ownerId);
      if (!record || record.version !== row.endpointVersion || record[flagFor(row.eventType)] !== 1) {
        complete(row,'CANCELED'); return;
      }
      const account = query(`SELECT plan,planStatus,trialEndsAt,paymentFailedAt,annualPaidThroughAt FROM users
        WHERE id = @ownerId AND role = 'owner'`).get({ownerId});
      if (!hasOperatorAccess(account,{now:now()})) {
        // Keep queued data for the owner; billing pauses external dispatch.
        query(`UPDATE webhookDeliveries SET status='PENDING',attemptCount=attemptCount-1,
          nextAttemptAt=?,leaseId=NULL,leaseExpiresAt=NULL,lastErrorCode='ACCOUNT_ACCESS_PAUSED',
          updatedAt=? WHERE ownerId=? AND id=? AND leaseId=?`).run(now()+3_600_000,iso(),ownerId,row.id,row.leaseId);
        return;
      }
      const secret = secretFor(record);
      const body = JSON.stringify({id:row.id,type:row.eventType,schemaVersion:1,createdAt:row.createdAt,data:safePayload(row)});
      const destination = await resolveDestination(record.url);
      // Recheck after the asynchronous DNS boundary. Changed/removed endpoints
      // cancel queued work; historical events never migrate to a new URL/key.
      record = endpoint(ownerId);
      const current = query('SELECT status,leaseId FROM webhookDeliveries WHERE ownerId=? AND id=?').get(ownerId,row.id);
      if (!enabled()) {
        query(`UPDATE webhookDeliveries SET status='PENDING',attemptCount=attemptCount-1,
          nextAttemptAt=?,leaseId=NULL,leaseExpiresAt=NULL,updatedAt=?
          WHERE ownerId=? AND id=? AND leaseId=?`).run(now()+1000,iso(),ownerId,row.id,row.leaseId);
        return;
      }
      if (!record || record.version !== row.endpointVersion ||
          current?.status !== 'DELIVERING' || current.leaseId !== row.leaseId) {
        complete(row,'CANCELED'); return;
      }
      const currentAccount = query(`SELECT plan,planStatus,trialEndsAt,paymentFailedAt,annualPaidThroughAt FROM users
        WHERE id = @ownerId AND role = 'owner'`).get({ownerId});
      if (!hasOperatorAccess(currentAccount,{now:now()})) {
        query(`UPDATE webhookDeliveries SET status='PENDING',attemptCount=attemptCount-1,
          nextAttemptAt=?,leaseId=NULL,leaseExpiresAt=NULL,lastErrorCode='ACCOUNT_ACCESS_PAUSED',
          updatedAt=? WHERE ownerId=? AND id=? AND leaseId=?`).run(now()+3_600_000,iso(),ownerId,row.id,row.leaseId);
        return;
      }
      const timestamp = String(Math.floor(now()/1000));
      httpStatus = await deliver(destination,{body,headers:{
        'X-OTC-Event-ID':row.id,'X-OTC-Event':row.eventType,'X-OTC-Timestamp':timestamp,
        'X-OTC-Signature':signWebhook(secret,timestamp,row.id,body)
      }});
      if (Number.isInteger(httpStatus) && httpStatus >= 200 && httpStatus < 300) {
        complete(row,'DELIVERED',{httpStatus}); return;
      }
      throw Object.assign(new Error('Receiver did not accept the webhook'),{code:'WEBHOOK_HTTP_FAILED'});
    } catch (error) {
      // Never store/log exception messages, destination URLs, response bodies,
      // credentials or customer payloads from an untrusted receiver.
      const allowedCodes = new Set(['WEBHOOK_DESTINATION_BLOCKED','WEBHOOK_DNS_TIMEOUT','WEBHOOK_DNS_FAILED','WEBHOOK_TIMEOUT','WEBHOOK_HTTP_FAILED']);
      const errorCode = allowedCodes.has(error.code) ? error.code : 'WEBHOOK_DELIVERY_FAILED';
      const delay = WEBHOOK_RETRY_DELAYS_MS[row.attemptCount-1];
      complete(row,delay === undefined ? 'FAILED' : 'PENDING',{
        httpStatus:Number.isInteger(httpStatus)?httpStatus:null,errorCode,nextAttemptAt:delay === undefined ? 0 : now()+delay
      });
    }
  }
  let lastOwnerId = '';
  async function dispatchOnce() {
    if (!enabled()) return {processed:0};
    // Platform worker discovery is the sole cross-tenant query. It selects IDs
    // only. Every claim, payload, endpoint, key and write is then tenant-bound.
    // Rotate across owners, so a sustained backlog from an earlier owner
    // cannot starve later tenants. The cursor contains no customer data.
    const due = `((status='PENDING' AND nextAttemptAt<=?) OR (status='DELIVERING' AND leaseExpiresAt<=?))`;
    const owners = database.prepare(`SELECT DISTINCT ownerId FROM webhookDeliveries
      WHERE ownerId > ? AND ${due} ORDER BY ownerId LIMIT 16`).all(lastOwnerId,now(),now());
    if (owners.length < 16 && lastOwnerId) {
      owners.push(...database.prepare(`SELECT DISTINCT ownerId FROM webhookDeliveries
        WHERE ownerId <= ? AND ${due} ORDER BY ownerId LIMIT ?`)
        .all(lastOwnerId,now(),now(),16-owners.length));
    }
    if (owners.length) lastOwnerId = owners.at(-1).ownerId;
    for (let index = 0; index < owners.length; index += 4) {
      const outcomes = await Promise.allSettled(owners.slice(index,index+4).map(({ownerId}) => deliverOne(ownerId)));
      if (outcomes.some(result=>result.status==='rejected')) throw new Error('Webhook worker store unavailable');
    }
    return {processed:owners.length};
  }
  function start({intervalMs = 1000, onError = () => {}} = {}) {
    let stopped = false, timer, active;
    const tick = () => {
      if(stopped) return;
      active = Promise.resolve().then(dispatchOnce).catch(()=>onError('WEBHOOK_WORKER_UNAVAILABLE')).finally(()=>{
        active = null;
        if (!stopped) { timer = setTimeout(tick,intervalMs); timer.unref?.(); }
      });
    };
    timer = setTimeout(tick,intervalMs); timer.unref?.();
    return () => {stopped = true;clearTimeout(timer);return active || Promise.resolve();};
  }
  return {getConfiguration,listDeliveries,save,remove,rotate,retry,dispatchOnce,start};
}
