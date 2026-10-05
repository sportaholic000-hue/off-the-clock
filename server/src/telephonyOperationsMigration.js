// Additive, idempotent migration. Installed after the core schema and before
// either telephony route is registered. Existing profiles are adopted lazily.
export function installTelephonyOperationsSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS phoneProvisioningOperations (
      ownerId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      operationId TEXT NOT NULL UNIQUE,
      existingNumber TEXT NOT NULL,
      country TEXT NOT NULL CHECK (country IN ('US', 'CA')),
      purchaseState TEXT NOT NULL CHECK (purchaseState IN
        ('ready', 'selecting', 'purchasing', 'unknown', 'purchased')),
      candidateNumber TEXT,
      twilioNumber TEXT,
      twilioNumberSid TEXT UNIQUE,
      carrierSetupStatus TEXT NOT NULL DEFAULT 'pending',
      carrierReference TEXT,
      carrierComplete INTEGER NOT NULL DEFAULT 0 CHECK (carrierComplete IN (0, 1)),
      workerToken TEXT,
      leaseUntil INTEGER,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      CHECK ((twilioNumber IS NULL) = (twilioNumberSid IS NULL)),
      CHECK (purchaseState <> 'purchased' OR twilioNumberSid IS NOT NULL),
      CHECK ((workerToken IS NULL) = (leaseUntil IS NULL))
    );
    CREATE TABLE IF NOT EXISTS operatorCoverageOperations (
      ownerId TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      desiredEnabled INTEGER NOT NULL CHECK (desiredEnabled IN (0, 1)),
      desiredRevision INTEGER NOT NULL DEFAULT 0 CHECK (desiredRevision >= 0),
      confirmedEnabled INTEGER NOT NULL CHECK (confirmedEnabled IN (0, 1)),
      confirmedRevision INTEGER NOT NULL DEFAULT 0 CHECK (confirmedRevision >= 0),
      activeOperationId TEXT UNIQUE,
      activeEnabled INTEGER CHECK (activeEnabled IN (0, 1)),
      activeRevision INTEGER,
      activeExistingNumber TEXT,
      activeTwilioNumber TEXT,
      phase TEXT NOT NULL DEFAULT 'idle' CHECK (phase IN ('idle', 'applying', 'unknown')),
      workerToken TEXT,
      leaseUntil INTEGER,
      failedRevision INTEGER,
      carrierStatus TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      CHECK ((workerToken IS NULL) = (leaseUntil IS NULL)),
      CHECK ((phase = 'idle' AND activeOperationId IS NULL AND activeEnabled IS NULL
        AND activeRevision IS NULL AND activeExistingNumber IS NULL AND activeTwilioNumber IS NULL)
        OR (phase <> 'idle' AND activeOperationId IS NOT NULL AND activeEnabled IS NOT NULL
        AND activeRevision IS NOT NULL AND activeExistingNumber IS NOT NULL AND activeTwilioNumber IS NOT NULL))
    );
  `);
}
