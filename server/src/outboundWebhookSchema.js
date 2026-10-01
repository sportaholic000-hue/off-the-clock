export const WEBHOOK_EVENTS = Object.freeze(['lead.created', 'quote.requested', 'appointment.booked']);

function jsonText(column, path, length) {
  return `CASE WHEN json_valid(${column}) THEN CASE WHEN json_type(${column}, '${path}') = 'text'
    THEN substr(json_extract(${column}, '${path}'), 1, ${length}) END END`;
}
const customer = (column, prefix = '$') => `json_object(
  'name', ${jsonText(column, prefix + '.name', 200)},
  'phone', ${jsonText(column, prefix + '.phone', 64)},
  'email', ${jsonText(column, prefix + '.email', 320)})`;

function capture(table, eventType, payload, { suffix = 'insert', when = '', operation = 'INSERT', time = 'NEW.createdAt' } = {}) {
  const flag = eventType === 'lead.created' ? 'leadsEnabled' : eventType === 'quote.requested' ? 'quotesEnabled' : 'bookingsEnabled';
  return `CREATE TRIGGER IF NOT EXISTS webhook_${table}_${suffix}
    AFTER ${operation} ON ${table} ${when ? 'WHEN ' + when : ''}
    BEGIN
      INSERT OR IGNORE INTO webhookDeliveries
        (id, ownerId, endpointVersion, eventType, aggregateId, payloadJson,
          status, attemptCount, nextAttemptAt, createdAt, updatedAt)
      SELECT lower(hex(randomblob(16))), NEW.ownerId, e.version, '${eventType}',
        NEW.id, ${payload}, 'PENDING', 0, 0, ${time}, ${time}
      FROM webhookEndpoints e
      WHERE e.ownerId = NEW.ownerId AND e.${flag} = 1;
    END`;
}

const leadPayload = `json_object('id', NEW.id, 'createdAt', NEW.createdAt,
  'customerName', substr(NEW.customerName,1,200), 'phone', substr(NEW.callerNumber,1,64),
  'email', ${jsonText('NEW.collectedInputsJson', '$.originalSubmission.contact.email', 320)},
  'service', substr(NEW.describedService,1,4000), 'type', NEW.type, 'status', NEW.status)`;
const requestPayload = `json_object('id', NEW.id, 'createdAt', NEW.createdAt,
  'service', substr(NEW.describedService,1,4000), 'estimatedValueCents', NEW.estimatedValue)`;
const bookingPayload = `json_object('id', NEW.id, 'createdAt', NEW.createdAt,
  'service', NEW.serviceType, 'status', NEW.status,
  'startAtUtc', COALESCE(NEW.startAtUtc,NEW.datetime), 'endAtUtc', NEW.endAtUtc,
  'timezone', NEW.timezone, 'durationMinutes', NEW.durationMinutes,
  'bookingMode', NEW.bookingMode, 'confirmedAt', NEW.confirmedAt,
  'customer', ${customer('NEW.customerJson')})`;

// Only local, bounded SQL runs in the producer transaction. Network delivery is
// performed by the independent worker after commit. Rollback also removes events.
export function installOutboundWebhookSchema(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS webhookEndpoints (
    ownerId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    url TEXT NOT NULL,
    leadsEnabled INTEGER NOT NULL CHECK (leadsEnabled IN (0,1)),
    quotesEnabled INTEGER NOT NULL CHECK (quotesEnabled IN (0,1)),
    bookingsEnabled INTEGER NOT NULL CHECK (bookingsEnabled IN (0,1)),
    credentialsCiphertext TEXT NOT NULL,
    credentialsIv TEXT NOT NULL,
    credentialsTag TEXT NOT NULL,
    keyVersion TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  )`);
  database.exec(`CREATE TABLE IF NOT EXISTS webhookDeliveries (
    id TEXT PRIMARY KEY,
    ownerId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpointVersion TEXT NOT NULL,
    eventType TEXT NOT NULL CHECK (eventType IN ('lead.created','quote.requested','appointment.booked')),
    aggregateId TEXT NOT NULL,
    payloadJson TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','DELIVERING','DELIVERED','FAILED','CANCELED')),
    attemptCount INTEGER NOT NULL DEFAULT 0,
    nextAttemptAt INTEGER NOT NULL,
    leaseId TEXT,
    leaseExpiresAt INTEGER,
    lastHttpStatus INTEGER,
    lastErrorCode TEXT,
    deliveredAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE(ownerId, endpointVersion, eventType, aggregateId)
  )`);
  database.exec('CREATE INDEX IF NOT EXISTS webhook_delivery_due ON webhookDeliveries(status,nextAttemptAt,leaseExpiresAt,ownerId)');
  database.exec('CREATE INDEX IF NOT EXISTS export_leads_owner ON leads(ownerId,createdAt,id)');
  database.exec('CREATE INDEX IF NOT EXISTS export_requests_owner ON quoteRequests(ownerId,createdAt,id)');
  database.exec('CREATE INDEX IF NOT EXISTS export_bookings_owner ON appointments(ownerId,createdAt,id)');
  database.exec('CREATE INDEX IF NOT EXISTS export_submissions_record ON quoteSubmissions(ownerId,recordId)');
  database.exec('CREATE INDEX IF NOT EXISTS webhook_delivery_owner ON webhookDeliveries(ownerId,createdAt DESC,id)');
  database.exec(capture('leads', 'lead.created', leadPayload));
  database.exec(capture('quoteRequests', 'quote.requested', requestPayload));
  database.exec(capture('appointments', 'appointment.booked', bookingPayload, {
    when: "NEW.status = 'CONFIRMED'", time: 'COALESCE(NEW.confirmedAt,NEW.createdAt)'
  }));
  database.exec(capture('appointments', 'appointment.booked', bookingPayload, {
    suffix: 'confirmed', operation: 'UPDATE OF status',
    when: "NEW.status = 'CONFIRMED' AND OLD.status IS NOT 'CONFIRMED'",
    time: 'COALESCE(NEW.confirmedAt,NEW.createdAt)'
  }));
  // Quote requests are written before their submission receipt. Enrich the
  // allowlisted customer fields within that same transaction, never raw JSON.
  database.exec(`CREATE TRIGGER IF NOT EXISTS webhook_quote_contact_insert
    AFTER INSERT ON quoteSubmissions BEGIN
      UPDATE webhookDeliveries SET payloadJson = json_set(payloadJson,
        '$.customer', ${customer('NEW.originalSubmissionJson', '$.contact')},
        '$.resultType', NEW.resultType)
      WHERE ownerId = NEW.ownerId AND aggregateId = NEW.recordId
        AND eventType = 'quote.requested' AND status = 'PENDING';
    END`);
}
