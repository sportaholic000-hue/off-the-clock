export function installNotificationHistorySchema(db){
  db.exec(`CREATE TABLE IF NOT EXISTS voiceSmsDeliveries(
    id TEXT PRIMARY KEY,ownerId TEXT NOT NULL,callSid TEXT NOT NULL,recordType TEXT NOT NULL,recordId TEXT,
    requestJson TEXT,callbackToken TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDING',
    attemptCount INTEGER NOT NULL DEFAULT 0,nextAttemptAt INTEGER NOT NULL DEFAULT 0,receiptChecks INTEGER NOT NULL DEFAULT 0,
    leaseId TEXT,leaseExpiresAt INTEGER,providerId TEXT,lastErrorCode TEXT,
    createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL,
    FOREIGN KEY(ownerId) REFERENCES users(id),FOREIGN KEY(id) REFERENCES outboxEvents(id));
    CREATE TABLE IF NOT EXISTS voiceSmsAttempts(
    id TEXT PRIMARY KEY,ownerId TEXT NOT NULL,deliveryId TEXT NOT NULL,attemptNumber INTEGER NOT NULL,
    status TEXT NOT NULL,providerId TEXT,errorCode TEXT,startedAt TEXT NOT NULL,completedAt TEXT,
    UNIQUE(ownerId,deliveryId,attemptNumber),FOREIGN KEY(ownerId) REFERENCES users(id),
    FOREIGN KEY(deliveryId) REFERENCES voiceSmsDeliveries(id));
    CREATE INDEX IF NOT EXISTS voice_sms_due ON voiceSmsDeliveries(ownerId,status,nextAttemptAt);
    CREATE INDEX IF NOT EXISTS voice_sms_record ON voiceSmsDeliveries(ownerId,recordType,recordId);
    CREATE TRIGGER IF NOT EXISTS voice_sms_state AFTER UPDATE OF status ON voiceSmsDeliveries
    BEGIN UPDATE outboxEvents SET status=NEW.status,updatedAt=NEW.updatedAt WHERE ownerId=NEW.ownerId AND id=NEW.id AND eventType='voice.sms_requested'; END;
    CREATE TRIGGER IF NOT EXISTS owner_alert_outbox_state AFTER UPDATE OF status ON ownerAlerts
    BEGIN UPDATE outboxEvents SET status=NEW.status,updatedAt=NEW.updatedAt WHERE ownerId=NEW.ownerId AND
      ((NEW.eventType='voice.urgent_flagged' AND id=NEW.aggregateId AND eventType=NEW.eventType) OR
       (NEW.eventType='booking.preference_requested' AND aggregateId=NEW.aggregateId AND eventType=NEW.eventType) OR
       (NEW.eventType='quote.requested' AND aggregateId=NEW.aggregateId AND eventType='voice.quote_request_logged')); END;
    CREATE TRIGGER IF NOT EXISTS owner_alert_outbox_insert AFTER INSERT ON outboxEvents
    WHEN NEW.eventType IN ('voice.urgent_flagged','booking.preference_requested','voice.quote_request_logged')
    BEGIN UPDATE outboxEvents SET status=COALESCE((SELECT a.status FROM ownerAlerts a WHERE a.ownerId=NEW.ownerId AND
      ((a.eventType='voice.urgent_flagged' AND a.aggregateId=NEW.id AND NEW.eventType=a.eventType) OR
       (a.eventType='booking.preference_requested' AND a.aggregateId=NEW.aggregateId AND NEW.eventType=a.eventType) OR
       (a.eventType='quote.requested' AND a.aggregateId=NEW.aggregateId AND NEW.eventType='voice.quote_request_logged'))),NEW.status)
      WHERE ownerId=NEW.ownerId AND id=NEW.id; END;`);
  // Historical tables are inert: the product no longer has a sender for this channel.
  db.exec("UPDATE voiceSmsDeliveries SET status='CANCELLED',lastErrorCode='CHANNEL_REMOVED',leaseId=NULL,leaseExpiresAt=NULL WHERE status NOT IN ('SENT','DELIVERED','CANCELLED');");
  // Migration-only repair of historical notification state. Never resend email
  // merely because its old outbox still says PENDING.
  db.exec(`UPDATE outboxEvents AS o SET status=(SELECT a.status FROM ownerAlerts a WHERE a.ownerId=o.ownerId AND
    ((a.eventType='voice.urgent_flagged' AND a.aggregateId=o.id AND o.eventType=a.eventType) OR
     (a.eventType='booking.preference_requested' AND a.aggregateId=o.aggregateId AND o.eventType=a.eventType) OR
     (a.eventType='quote.requested' AND a.aggregateId=o.aggregateId AND o.eventType='voice.quote_request_logged')))
    WHERE o.eventType IN ('voice.urgent_flagged','booking.preference_requested','voice.quote_request_logged') AND EXISTS(
    SELECT 1 FROM ownerAlerts a WHERE a.ownerId=o.ownerId AND
    ((a.eventType='voice.urgent_flagged' AND a.aggregateId=o.id AND o.eventType=a.eventType) OR
     (a.eventType='booking.preference_requested' AND a.aggregateId=o.aggregateId AND o.eventType=a.eventType) OR
     (a.eventType='quote.requested' AND a.aggregateId=o.aggregateId AND o.eventType='voice.quote_request_logged')));
    INSERT OR IGNORE INTO voiceSmsDeliveries(id,ownerId,callSid,recordType,callbackToken,status,lastErrorCode,createdAt,updatedAt)
    SELECT id,ownerId,COALESCE(json_extract(payloadJson,'$.callSid'),''),COALESCE(json_extract(payloadJson,'$.recordType'),''),lower(hex(randomblob(24))),
    CASE WHEN status IN ('SENT','DELIVERED') THEN status ELSE 'CANCELLED' END,
    CASE WHEN status IN ('SENT','DELIVERED') THEN NULL ELSE 'CHANNEL_REMOVED' END,createdAt,updatedAt
    FROM outboxEvents WHERE eventType='voice.sms_requested' AND json_valid(payloadJson);
    UPDATE outboxEvents AS o SET status=(SELECT s.status FROM voiceSmsDeliveries s WHERE s.ownerId=o.ownerId AND s.id=o.id)
    WHERE o.eventType='voice.sms_requested' AND EXISTS(SELECT 1 FROM voiceSmsDeliveries s WHERE s.ownerId=o.ownerId AND s.id=o.id);`);
}
