# Owner exports and outbound webhooks

Operator and QuoteDone owners can use the dashboard's **Webhooks and CSV support** controls. Existing dashboard components are used; there are no public website or stylesheet changes.

## CSV downloads

Authenticated owner routes:
- `GET /api/exports/leads`
- `GET /api/exports/quote-requests`
- `GET /api/exports/bookings`

The server derives the tenant from the validated, revocable session. Query/body owner IDs never select another account. Exports remain available after account cancellation. They contain customer/business record fields, not internal engine snapshots, rates, credentials, booking tokens or session data. Quote request estimated values are integer cents; an empty value means no value was stored. Booking exports retain the saved status, including pending/failed rows, rather than claiming all rows are confirmed.

Downloads use UTF-8 with a BOM, CRLF rows, double-quoted cells and doubled embedded quotes. Formula prefixes `= + - @`, full-width equivalents, and formulas after whitespace/control characters are prefixed with a literal apostrophe. Leading control characters are protected too. Stored data is unchanged. Spreadsheet/export consumers must preserve that text protection; no CSV format can control what a downstream application does after editing/re-saving. [OWASP CSV guidance](https://owasp.org/www-community/attacks/CSV_Injection).

## Webhook setup

There is one HTTPS endpoint per owner, with independent selections for:
- `lead.created`: a newly persisted lead;
- `quote.requested`: a newly persisted quote request, including its allowlisted contact when the submission receipt is committed;
- `appointment.booked`: a confirmed appointment, including transition from pending to confirmed.

Registration uses `PUT /api/integrations/webhook` with `{url, events}`. Operator account access is required for setup, secret rotation and manual retry. Reading configuration and removing an endpoint remain available after cancellation. The signing secret is returned once on initial registration, URL change or explicit rotation; normal reads never return it. Event-selection edits preserve the signing secret.

Changing URL/event selections, rotating the key, or removing the endpoint cancels old queued/failed deliveries. Historical events never move to the new destination. Previously created records are not replayed when registering an endpoint. A POST already sent before a configuration change can still complete.

Secrets are stored with the existing AES-256-GCM credential encryption facility and bound to the owner and endpoint version. Preserve `CREDENTIAL_ENCRYPTION_KEY` with database backups. Losing/changing that key without migrating encrypted records prevents delivery; key-version labels alone do not implement a key ring.

## Signed POST contract

JSON body:
```json
{"id":"stable-event-id","type":"lead.created","schemaVersion":1,"createdAt":"UTC timestamp","data":{"id":"record-id","createdAt":"UTC timestamp","customerName":"customer name","phone":"customer phone","email":"customer email","service":"requested service","type":"lead type","status":"saved status"}}
```

Headers: `X-OTC-Event-ID`, `X-OTC-Event`, `X-OTC-Timestamp` (Unix seconds), and `X-OTC-Signature`.

Signature is `v1=` followed by lowercase hexadecimal HMAC-SHA256 using the 64-character signing secret as UTF-8 text over:
```text
timestamp + "." + eventId + "." + rawRequestBody
```

Verify against raw bytes before parsing JSON, require the header ID/type to match the body, use a timing-safe comparison and a short timestamp tolerance (e.g. five minutes), and deduplicate by event ID in durable storage. Each retry keeps the event ID/body and gets a fresh timestamp/signature. Return a 2xx only after accepting the event. This is at-least-once delivery; a crash after acceptance but before acknowledging delivery can cause a duplicate.

## Queue and deployment

Local database triggers snapshot only allowlisted scalar fields in the producer transaction. Network calls are made by the background worker after commit, with no network await in widget/booking/call producer paths. Rollback also removes events. Receiver/DNS/TLS/timeouts cannot turn a successful producer write into a failed flow. As with other transactional persistence, a database/disk failure can reject a write; this implementation does not claim disk failures are survivable.

There are eight automatic attempts: initial delivery, then delays of 1 minute, 5 minutes, 15 minutes, 1 hour, 3 hours, 12 hours and 24 hours (40 hours 21 minutes total). Exhausted deliveries appear as FAILED and can be manually retried from the dashboard. Recent delivery status is tenant-scoped and never displays receiver response bodies, payloads or secret keys. A 60-second lease prevents concurrent workers claiming the same event; expired leases recover after a crash.

The worker starts with the Express server and stops scheduling when its listener closes. Keep the server running with its persistent SQLite database; sleeping/serverless instances will defer deliveries. Production dispatch defaults to enabled when `OUTBOUND_WEBHOOKS_ENABLED` is unset; explicit `false` pauses it. The checked-in development environment example sets false. Set true for a production environment copied from that example. Local preview mode always pauses dispatch. No Twilio credential or voice-runtime switch is needed for outbound webhooks.

Each owner is limited to one endpoint. Four deliveries run concurrently within each selected worker batch; one owner gets at most one event per tick. Batches rotate across eligible owners so a sustained backlog cannot indefinitely starve later tenants. Provision queue/disk monitoring and backups for production volume. Delivered/canceled/failed rows retain small customer snapshots until an explicit retention policy is approved; there is no automatic purge in this change.

Registration and every delivery validate HTTPS, reject URL userinfo/private/reserved IPv4/IPv6 addresses, reject DNS answers containing any blocked address, and pin the validated address to the TLS socket. TLS certificate checking stays enabled; redirects are not followed. DNS and POST deadlines bound receiver delays. Use network-level egress controls as an additional deployment boundary. [OWASP SSRF guidance](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [Node HTTPS documentation](https://nodejs.org/api/https.html).

## Scope

No voice, forwarding, incoming-call, quote-engine, price-book or public-site implementation changed. No live customer receiver/provider/account was used for acceptance. The localhost TLS fixture generates a fresh key and certificate in memory for each test run; no private key is saved or committed.

Dashboard labels used in the draft: Webhooks and CSV support; Download leads CSV; Download quote requests CSV; Download bookings CSV; HTTPS webhook URL; New lead; New quote request; Confirmed booking; Save webhook; Rotate signing secret; Remove webhook; Refresh delivery status; Retry delivery; Webhook signing secret. These are functional review labels, not a design or public-launch approval.
