export function installAppointmentChangeSchema(database) {
  database.exec(`CREATE TABLE IF NOT EXISTS appointmentChanges (
    id TEXT PRIMARY KEY, ownerId TEXT NOT NULL REFERENCES users(id),
    appointmentId TEXT NOT NULL REFERENCES appointments(id), requestJson TEXT NOT NULL,
    action TEXT NOT NULL CHECK(action IN ('cancel','reschedule')),
    status TEXT NOT NULL CHECK(status IN ('PREPARING','PENDING','REJECTED','CONFIRMED')),
    oldSlotJson TEXT NOT NULL, newSlotJson TEXT, lastError TEXT,
    requestedAt TEXT NOT NULL, completedAt TEXT, updatedAt TEXT NOT NULL,
    UNIQUE(ownerId,id));
    CREATE INDEX IF NOT EXISTS appointment_changes_pending ON appointmentChanges(status,ownerId);
    CREATE INDEX IF NOT EXISTS appointment_changes_history ON appointmentChanges(ownerId,appointmentId,requestedAt);`);
}
