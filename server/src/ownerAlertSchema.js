// Durable first-party owner notifications. Triggers run in the same transaction
// as capture; no provider operation runs inside a database transaction.
export function installOwnerAlertSchema(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS callbackRequests (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, callId TEXT NOT NULL, leadId TEXT NOT NULL,
    requestKey TEXT NOT NULL, source TEXT NOT NULL, reason TEXT, notes TEXT,
    historyJson TEXT NOT NULL DEFAULT '[]', createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
    UNIQUE(ownerId,callId,requestKey), FOREIGN KEY(ownerId) REFERENCES users(id),
    FOREIGN KEY(callId) REFERENCES calls(id), FOREIGN KEY(leadId) REFERENCES leads(id));
    CREATE TABLE IF NOT EXISTS ownerAlerts (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, eventKey TEXT NOT NULL, eventType TEXT NOT NULL,
    aggregateId TEXT NOT NULL, callId TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
    attemptCount INTEGER NOT NULL DEFAULT 0, nextAttemptAt INTEGER NOT NULL DEFAULT 0,
    firstAttemptAt INTEGER, leaseId TEXT, leaseExpiresAt INTEGER, messageJson TEXT,
    providerId TEXT, lastErrorCode TEXT, acceptedAt TEXT, seenAt TEXT,
    createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(ownerId,eventKey),
    FOREIGN KEY(ownerId) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS ownerAlertAttempts (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL, alertId TEXT NOT NULL,
    attemptNumber INTEGER NOT NULL, status TEXT NOT NULL, errorCode TEXT,
    startedAt TEXT NOT NULL, completedAt TEXT, providerId TEXT,
    UNIQUE(ownerId,alertId,attemptNumber), FOREIGN KEY(ownerId) REFERENCES users(id),
    FOREIGN KEY(alertId) REFERENCES ownerAlerts(id));
    CREATE INDEX IF NOT EXISTS owner_alert_due ON ownerAlerts(ownerId,status,nextAttemptAt);
    CREATE INDEX IF NOT EXISTS callback_call ON callbackRequests(ownerId,callId,createdAt);`);
  const trigger=(name,table,type,{operation='INSERT',when='',call='NEW.callId',time='NEW.createdAt'}={})=>db.exec(`
    CREATE TRIGGER IF NOT EXISTS owner_alert_${name} AFTER ${operation} ON ${table} ${when?'WHEN '+when:''}
    BEGIN INSERT INTO ownerAlerts(id,ownerId,eventKey,eventType,aggregateId,callId,createdAt,updatedAt)
    VALUES(lower(hex(randomblob(16))),NEW.ownerId,'${type}:'||NEW.id,'${type}',NEW.id,${call},${time},${time}) ON CONFLICT(ownerId,eventKey) DO NOTHING; END;`);
  trigger('lead','leads','lead.created');
  trigger('quote','quotes','quote.created');
  trigger('quote_request','quoteRequests','quote.requested');
  trigger('callback','callbackRequests','callback.requested');
  db.exec(`CREATE TRIGGER IF NOT EXISTS owner_alert_callback_correction AFTER UPDATE OF notes ON callbackRequests WHEN NEW.notes IS NOT OLD.notes
    BEGIN INSERT INTO ownerAlerts(id,ownerId,eventKey,eventType,aggregateId,callId,createdAt,updatedAt)
    VALUES(lower(hex(randomblob(16))),NEW.ownerId,'callback.updated:'||NEW.id||':'||json_array_length(NEW.historyJson),'callback.updated',NEW.id,NEW.callId,NEW.updatedAt,NEW.updatedAt)
    ON CONFLICT(ownerId,eventKey) DO NOTHING; END;`);
  trigger('preference','bookingPreferences','booking.preference_requested',{call:`(SELECT COALESCE(l.callId,q.callId) FROM bookingIntents i LEFT JOIN leads l ON l.ownerId=i.ownerId AND l.id=i.sourceId AND i.sourceType='lead' LEFT JOIN quotes q ON q.ownerId=i.ownerId AND q.id=i.sourceId AND i.sourceType='quote' WHERE i.ownerId=NEW.ownerId AND i.id=NEW.intentId)`});
  trigger('urgent','outboxEvents','voice.urgent_flagged',{when:"NEW.eventType='voice.urgent_flagged'",call:"CASE WHEN json_valid(NEW.payloadJson) THEN (SELECT id FROM calls WHERE ownerId=NEW.ownerId AND callSid=json_extract(NEW.payloadJson,'$.callSid')) END"});
  trigger('call_finish','calls','call.completed',{operation:'UPDATE OF completedAt',when:'NEW.completedAt IS NOT NULL AND OLD.completedAt IS NULL',call:'NEW.id',time:'NEW.completedAt'});
  trigger('call_fallback','calls','call.completed',{when:'NEW.completedAt IS NOT NULL',call:'NEW.id',time:'NEW.completedAt'});
  // Preserve pending urgency/preference work from earlier releases. Ordinary
  // historical leads/quotes are not mass-emailed on upgrade.
  db.exec(`INSERT OR IGNORE INTO ownerAlerts(id,ownerId,eventKey,eventType,aggregateId,callId,createdAt,updatedAt)
    SELECT lower(hex(randomblob(16))),o.ownerId,o.eventType||':'||CASE WHEN o.eventType='booking.preference_requested' THEN o.aggregateId ELSE o.id END,o.eventType,
    CASE WHEN o.eventType='booking.preference_requested' THEN o.aggregateId ELSE o.id END,
    CASE WHEN json_valid(o.payloadJson) THEN (SELECT c.id FROM calls c WHERE c.ownerId=o.ownerId AND c.callSid=json_extract(o.payloadJson,'$.callSid')) END,
    o.createdAt,o.updatedAt FROM outboxEvents o WHERE o.status='PENDING' AND o.eventType IN ('voice.urgent_flagged','booking.preference_requested');`);
}
