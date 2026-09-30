# Shared quote and booking API contract

Contract version: `2026-09-29.1`

This contract is shared by the embeddable widget, authenticated application,
and phone operator. Server services are authoritative; channel adapters do not
calculate prices, construct datetimes, infer tenant identity, or claim a
booking before the server confirms it.

## Common rules

- Tenant identity comes from an authenticated user, resolved public key, or
  resolved Twilio destination number. A request body never supplies `ownerId`.
- Every mutation uses a UUID request ID or `Idempotency-Key`. An exact retry
  returns the original response. Reusing a key with different content returns
  `409 IDEMPOTENCY_CONFLICT`.
- Customer-visible quote responses are sanitized and contain no owner rates,
  calculation lines, markup, margin, cost, or private price-book rules.
- UTC is stored. The owner's configured IANA timezone is used to generate and
  display slots. Clients never submit a raw datetime to confirm a booking.
- A response is not considered successful when persistence or provider state
  is uncertain. Uncertain calendar writes return `PENDING_CONFIRMATION`, never
  `CONFIRMED`.

## Quote intake boundary

`GET /api/public/quote/:publicKey` returns a versioned catalog. A client that
does not recognize the contract marker must stop safely instead of silently
mixing the legacy and pricing-only envelopes.

```json
{
  "contractVersion": "2026-09-29.1",
  "capabilities": {
    "quoteEnvelope": "pricing-only-v2",
    "booking": "booking-v1",
    "postQuoteIdentity": true,
    "serverPricingOnly": true
  },
  "branding": {
    "businessName": "Example Contracting",
    "accentColor": "#16A34A",
    "launcherLabel": "Get an estimate",
    "clickToCallNumber": "+19025550123"
  },
  "services": []
}
```

Branding values are server-validated owner settings. `accentColor` is exactly a
six-digit hex color; `clickToCallNumber` is either a normalized E.164 number or
null. Each service retains its existing ID, type, name, customer fields,
recognized offerings, and customer-selectable fees, plus:

```json
{
  "quoteCapability": "LIVE_OR_REVIEW",
  "bookingCapability": "DIRECT"
}
```

`quoteCapability` is `LIVE_OR_REVIEW` or `REVIEW_ONLY`.
`bookingCapability` is `DIRECT`, `EXTERNAL_HANDOFF`,
`PREFERRED_TIME_ONLY`, or `NONE`. These are capabilities, not promises that a
particular request will quote or that a particular slot remains available.

The pre-quote request contains pricing facts only:

```json
{
  "requestId": "uuid",
  "serviceId": "uuid",
  "serviceRequest": "exact selected offering name",
  "customerInputs": {},
  "customerFeeSelections": {},
  "additionalWork": [],
  "context": "",
  "explicitUnknowns": "",
  "urgency": "flexible",
  "contact": {
    "email": "customer@example.com",
    "phone": "+19025550123"
  }
}
```

The verified job-details protocol remains part of this envelope. Initial
prepare requests carry `intakeFlow: "job-details-v1"`. Follow-up prepare and
calculate requests retain the existing server-issued `intakeConfirmation`,
`intakeClarification`, and signed `previousIntake` provenance, plus the
customer's explicit `reviewRequested` choice. These fields are receipts and
decisions about the exact pricing facts above; they are not replaced or
silently dropped by the post-quote identity move. An exact historical
`requestId` retry replays its stored response before current-shape validation.

At least one syntactically valid callback email or phone is required. Customer
name and project address are not accepted in the pricing envelope. They are
collected after the quote/review outcome for follow-up and booking. This makes
their role explicit: they are scheduling/contact data and cannot silently add,
contradict, or replace a measurement used to release a price.

Free-form work details remain subject to the existing clarification and
separate-work rules. Missing or uncertain selected-work measurements produce a
review result with no amount.

`POST /api/public/quote/:publicKey/prepare` and authenticated
`POST /api/quote/prepare` return either:

```json
{
  "status": "ready",
  "summary": {},
  "confirmation": {},
  "followUps": []
}
```

or `status: "needs_details"` without a confirmation. The signed confirmation
binds tenant, book revision, selected service, exact customer inputs, fee
choices, separate work, and callback channel.

`POST /api/public/quote/:publicKey` and authenticated
`POST /api/quote/calculate` persist the exact request and return either
`INSTANT_ESTIMATE_READY`, `PARTIAL_ESTIMATE_READY`, or
`ESTIMATE_REQUIRES_REVIEW`. Every persisted outcome also returns an opaque
256-bit `bookingToken` whenever its resolved `bookingCapability` is `DIRECT`,
`EXTERNAL_HANDOFF`, or `PREFERRED_TIME_ONLY`. Only `NONE` omits the token.
Missing direct-booking configuration therefore still receives a token for the
preferred-time fallback; it does not strand the customer. The token is bound
server-side to the owner, persisted quote/lead record, service, booking mode,
duration when known, callback channel, allowed quote tiers, and expiry.

## Booking settings and fail-closed behavior

Direct booking is enabled only when the owner has configured all required
settings: IANA timezone, structured weekly availability, booking horizon,
minimum notice, slot increment, buffers, destination calendar, service booking
mode, and duration. `site_visit_first` uses the specified 45-minute default.
`book_job` requires an explicit service duration.

Missing settings return `PREFERRED_TIME_ONLY`; the product captures preferred
times for owner follow-up and does not present invented availability. A saved
Calendly URL returns `EXTERNAL_HANDOFF` unless a supported Calendly API
connection is configured. It is never represented as a confirmed internal
booking.

## Public booking routes

### Availability

`POST /api/public/bookings/:bookingToken/availability`

Request:

```json
{
  "fromDate": "2026-10-01",
  "days": 7,
  "timeOfDay": ["morning", "afternoon"],
  "tierName": "Better",
  "scopeConfirmation": "UNCHANGED",
  "customer": { "name": "Alex Smith" },
  "location": {
    "addressLine1": "123 Example Street",
    "addressLine2": "",
    "city": "Example City",
    "region": "NS",
    "postalCode": "B3H 0A1",
    "country": "CA"
  }
}
```

`scopeConfirmation` is required. If work or measurements changed, the client
must return to the quote flow; `CHANGED` returns `409 REQUOTE_REQUIRED` and no
slots. Customer name and location are bound as scheduling data, not interpreted
as proof that their prose contains no changed scope. The UI must always offer a
visible "Change job details" path.

The server validates the token, loads current tenant settings, subtracts
provider busy periods, local appointments, active holds, buffers, blackouts,
notice, and service-area restrictions, then returns:

```json
{
  "status": "AVAILABLE",
  "reason": null,
  "timezone": "America/Halifax",
  "bookingMode": "site_visit_first",
  "durationMinutes": 45,
  "validUntilUtc": "2026-09-29T15:02:00.000Z",
  "externalUrl": null,
  "slots": [
    {
      "slotId": "opaque-signed-slot",
      "startUtc": "2026-10-01T13:00:00.000Z",
      "endUtc": "2026-10-01T13:45:00.000Z",
      "startLocal": "2026-10-01T10:00:00-03:00",
      "endLocal": "2026-10-01T10:45:00-03:00",
      "label": "Thursday, October 1 at 10:00 AM"
    }
  ]
}
```

`status` is one of `AVAILABLE`, `EXTERNAL_HANDOFF`,
`PREFERRED_TIME_ONLY`, or `UNAVAILABLE`. The response includes the IANA
timezone, booking mode, duration, and safe slot labels. It may include a safe
`reason` and, only for external handoff, `externalUrl`.

### Hold

`POST /api/public/bookings/:bookingToken/holds`

Header: `Idempotency-Key: <uuid>`

Body: `{ "slotId": "opaque-signed-slot" }`

Success is `201` with exactly the following customer-safe shape:

```json
{
  "status": "HELD",
  "holdId": "uuid",
  "expiresAtUtc": "2026-09-29T15:07:00.000Z",
  "slot": {
    "slotId": "opaque-signed-slot",
    "startUtc": "2026-10-01T13:00:00.000Z",
    "endUtc": "2026-10-01T13:45:00.000Z",
    "startLocal": "2026-10-01T10:00:00-03:00",
    "endLocal": "2026-10-01T10:45:00-03:00",
    "label": "Thursday, October 1 at 10:00 AM"
  }
}
```

Holds expire after five minutes. Acquisition uses an immediate database
transaction and rejects overlap with active holds and confirmed or
provider-pending appointments for the owner/calendar.

To choose another time without accumulating an abandoned active hold, release
the current hold explicitly:

`DELETE /api/public/bookings/:bookingToken/holds/:holdId`

Header: `Idempotency-Key: <uuid>`

An exact retry is safe. Success is `200` with exactly:

```json
{ "status": "RELEASED", "holdId": "uuid" }
```

Only an active hold bound to the same booking token can be released. A hold
already being confirmed or already confirmed returns a safe `409`; it is never
silently cancelled. After a successful release, the client fetches current
availability and creates a new hold.

### Confirm

`POST /api/public/bookings/:bookingToken/confirm`

Header: `Idempotency-Key: <uuid>`

The body contains only the server-issued `holdId`, the matching
`confirmedSlotId`, explicit confirmation, an optional valid quote tier, and
scheduling/contact data:

```json
{
  "holdId": "uuid",
  "confirmedSlotId": "opaque-signed-slot",
  "explicitConfirmation": true,
  "tierName": "Better",
  "customer": {
    "name": "Alex Smith",
    "email": "customer@example.com",
    "phone": "+19025550123"
  },
  "location": {
    "addressLine1": "123 Example Street",
    "addressLine2": "",
    "city": "Example City",
    "region": "NS",
    "postalCode": "B3H 0A1",
    "country": "CA"
  },
  "addressConfirmation": true
}
```

Name and location are contact/scheduling data. The UI and voice read-back must
state that they do not change the quoted scope or amount; changed work or
measurements starts a new quote/review request.

Success is `201` with:

```json
{
  "status": "CONFIRMED",
  "appointmentId": "uuid",
  "bookingMode": "site_visit_first",
  "startUtc": "2026-10-01T13:00:00.000Z",
  "endUtc": "2026-10-01T13:45:00.000Z",
  "startLocal": "2026-10-01T10:00:00-03:00",
  "endLocal": "2026-10-01T10:45:00-03:00",
  "timezone": "America/Halifax",
  "provider": "google",
  "calendarEventStatus": "CONFIRMED"
}
```

`409 SLOT_UNAVAILABLE` includes fresh slots. An expired hold returns `410`.
Provider failure returns `503`; an ambiguous provider write returns `202` with:

```json
{
  "status": "PENDING_CONFIRMATION",
  "confirmationId": "opaque-confirmation-handle",
  "appointmentId": "uuid",
  "retryAfterSeconds": 3
}
```

It must be reconciled before any channel says the appointment is booked. The
exact same confirm request and idempotency key is safe to retry, but clients
normally poll the dedicated status resource:

`GET /api/public/bookings/:bookingToken/confirmations/:confirmationId`

The response is one of `PENDING_CONFIRMATION`, `CONFIRMED`, or `FAILED`. A
confirmed response uses the same appointment shape as the successful confirm
response. A failed response contains a safe error code and recovery action;
it never reports a booking that was not reconciled with the provider.

### Preferred-time fallback

`POST /api/public/bookings/:bookingToken/preference`

Request:

```json
{
  "scopeConfirmation": "UNCHANGED",
  "preferredWindows": [
    { "date": "2026-10-01", "timeOfDay": "morning" }
  ],
  "customer": { "name": "Alex Smith" },
  "location": {
    "addressLine1": "123 Example Street",
    "city": "Example City",
    "region": "NS",
    "postalCode": "B3H 0A1",
    "country": "CA"
  },
  "note": "Call before arriving"
}
```

Dates use `YYYY-MM-DD`; `timeOfDay` is `morning`, `afternoon`, or `evening`.
The array contains one to three windows. The optional note is scheduling-only,
plain text, and at most 500 characters. Changed job facts use the re-quote path.

Success is:

```json
{
  "status": "REQUESTED",
  "preferenceRequestId": "uuid",
  "message": "The business will contact you to confirm a time."
}
```

This is explicitly not booked.

## Authenticated and voice adapters

Authenticated endpoints mirror availability, hold, confirm, and preference at
`/api/bookings/:bookingIntentId/...`. They derive the tenant from the session
and bind the intent to a persisted quote or lead. They do not accept owner,
price, duration, mode, timezone, provider, or arbitrary datetime fields.

The phone runtime calls the same application quote preparation, signed
confirmation, calculation, and BookingService methods as the widget. Caller
E.164 comes from the validated Twilio session, not from model arguments. The
voice model receives customer-safe quote responses and opaque draft/slot
handles only; booking tokens and server receipts stay server-side.

For a multi-tier `book_job`, the server validates `tierName` against the
immutable stored sanitized quote. A review outcome can book only a
`site_visit_first` visit. Direct job booking requires an unexpired released
estimate.

## Concurrency and provider recovery

Hold acquisition runs in `BEGIN IMMEDIATE`, expires stale holds, and checks
interval overlap across active holds plus confirmed/provider-pending
appointments. Confirmation moves the hold to `CONFIRMING`, reloads the bound
policy revision, rechecks Google free/busy, and creates the event with a
deterministic provider event ID. The final transaction records the appointment
and a durable `appointment.booked` outbox event.

Timeout after a provider request triggers deterministic event lookup. If the
result remains uncertain, the appointment stays pending and the customer is
told confirmation is pending. SMS and reminders dispatch asynchronously from
the durable outbox after confirmation.

## Error contract

- `400 INVALID_REQUEST`: malformed fields or unsupported values.
- `401/403`: invalid identity, token, origin, plan, or role.
- `409 IDEMPOTENCY_CONFLICT`: a key was reused with changed content.
- `409 SLOT_UNAVAILABLE`: the interval was claimed or became busy.
- `409 SCHEDULE_CHANGED`: bound policy changed; fetch fresh slots.
- `409 REQUOTE_REQUIRED`: work or measurements changed; start a new quote/review.
- `410 HOLD_EXPIRED`: hold is no longer claimable.
- `410 BOOKING_CONTEXT_EXPIRED`: quote/lead token expired.
- `422 QUOTE_NEEDS_DETAILS`: selected work cannot release an amount.
- `503 PROVIDER_UNAVAILABLE`: no provider write was confirmed.
- `202 PENDING_CONFIRMATION`: provider result is ambiguous; never say booked.

All errors are safe for customers and omit secrets, provider tokens, private
rules, stack traces, and internal calculation data.
