import { Readable } from 'node:stream';

const exports = Object.freeze({
  leads: {
    columns: ['id', 'createdAt', 'customerName', 'phone', 'email', 'service', 'type', 'status'],
    sql: `SELECT l.id, l.createdAt, l.customerName, l.callerNumber AS phone,
      CASE WHEN json_valid(l.collectedInputsJson)
        AND json_type(l.collectedInputsJson, '$.originalSubmission.contact.email') = 'text'
        THEN json_extract(l.collectedInputsJson, '$.originalSubmission.contact.email') END AS email,
      l.describedService AS service, l.type, l.status
      FROM leads l WHERE l.ownerId = @ownerId`
  },
  'quote-requests': {
    columns: ['id', 'createdAt', 'service', 'estimatedValueCents', 'customerName', 'phone', 'email', 'resultType'],
    sql: `SELECT q.id, q.createdAt, q.describedService AS service,
      q.estimatedValue AS estimatedValueCents,
      CASE WHEN json_valid(s.originalSubmissionJson) AND json_type(s.originalSubmissionJson, '$.contact.name') = 'text'
        THEN json_extract(s.originalSubmissionJson, '$.contact.name') END AS customerName,
      CASE WHEN json_valid(s.originalSubmissionJson) AND json_type(s.originalSubmissionJson, '$.contact.phone') = 'text'
        THEN json_extract(s.originalSubmissionJson, '$.contact.phone') END AS phone,
      CASE WHEN json_valid(s.originalSubmissionJson) AND json_type(s.originalSubmissionJson, '$.contact.email') = 'text'
        THEN json_extract(s.originalSubmissionJson, '$.contact.email') END AS email,
      s.resultType
      FROM quoteRequests q LEFT JOIN quoteSubmissions s ON s.ownerId = q.ownerId AND s.recordId = q.id
      WHERE q.ownerId = @ownerId`
  },
  bookings: {
    columns: ['id', 'createdAt', 'service', 'status', 'startAtUtc', 'endAtUtc', 'timezone', 'durationMinutes',
      'bookingMode', 'customerName', 'phone', 'email', 'confirmedAt'],
    sql: `SELECT a.id, a.createdAt, a.serviceType AS service, a.status,
      COALESCE(a.startAtUtc, a.datetime) AS startAtUtc, a.endAtUtc, a.timezone,
      a.durationMinutes, a.bookingMode,
      CASE WHEN json_valid(a.customerJson) AND json_type(a.customerJson, '$.name') = 'text'
        THEN json_extract(a.customerJson, '$.name') END AS customerName,
      CASE WHEN json_valid(a.customerJson) AND json_type(a.customerJson, '$.phone') = 'text'
        THEN json_extract(a.customerJson, '$.phone') END AS phone,
      CASE WHEN json_valid(a.customerJson) AND json_type(a.customerJson, '$.email') = 'text'
        THEN json_extract(a.customerJson, '$.email') END AS email,
      a.confirmedAt FROM appointments a WHERE a.ownerId = @ownerId`
  }
});

// Quote every cell and protect formulas after whitespace/control characters too.
// Protection affects the downloaded copy only; stored customer data is unchanged.
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (/^[\s\u0000-\u001f\u007f-\u009f\ufeff]*[=+\-@＝＋－＠]/u.test(text) ||
      /^[\u0000-\u001f\u007f-\u009f]/u.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function exportDefinition(kind) {
  return Object.hasOwn(exports, kind) ? exports[kind] : null;
}

export function* csvRows(ownerQuery, ownerId, kind) {
  const definition = exportDefinition(kind);
  if (!definition || !ownerId) throw new Error('Invalid owner export');
  yield '\ufeff' + definition.columns.map(csvCell).join(',') + '\r\n';
  const alias = kind === 'leads' ? 'l' : kind === 'bookings' ? 'a' : 'q';
  const statement = ownerQuery(definition.sql + `
    AND (@afterDate IS NULL OR ${alias}.createdAt > @afterDate
      OR (${alias}.createdAt = @afterDate AND ${alias}.id > @afterId))
    ORDER BY ${alias}.createdAt, ${alias}.id LIMIT 500`);
  let afterDate = null, afterId = '';
  for (;;) {
    const rows = statement.all({ ownerId, afterDate, afterId });
    for (const row of rows) yield definition.columns.map(column => csvCell(row[column])).join(',') + '\r\n';
    if (rows.length < 500) break;
    afterDate = rows.at(-1).createdAt; afterId = rows.at(-1).id;
  }
}

export function sendOwnerCsv(req, res, { ownerQuery }) {
  const kind = req.params.kind;
  if (!exportDefinition(kind)) return res.status(404).json({ error: 'Export not found' });
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="off-the-clock-${kind}.csv"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  const stream = Readable.from(csvRows(ownerQuery, req.tenantOwnerId, kind), { objectMode: false });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
