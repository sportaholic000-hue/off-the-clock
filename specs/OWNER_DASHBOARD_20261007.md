# Owner dashboard repair, 2026-10-07

Scope authorized by the owner: booking alerts, stored call billing/transport,
call search and transcripts, review/follow-up/quote progression, period and
service-funnel reporting. Base: `4db13a2945193762bbc4b85f9ab616a00e1dd067`.

The owner's current ruling supersedes older caller-message requirements in
platform §5.7 and reminder/invitation examples: **no caller texts, email
confirmations, invitations or reminders**. No quiet-hours feature is needed
for disabled caller reminders. The production SMS worker has a disabled sender;
the production voice session omits the SMS declaration and rejects an attempted
SMS invocation. Retained historical SMS receipts remain readable. Existing
Google booking writes retain `sendUpdates=none` and no attendees. Booking may be
confirmed verbally after the tool confirms it. Owner email alerts remain active.

## Booking alerts

An inserted CONFIRMED appointment, or its first transition into CONFIRMED,
atomically enqueues one owner alert per appointment. Pending/failed events do
not. The event snapshots the confirmed slot, customer and location; subsequent
rescheduling cannot silently replace the email's original facts. The existing
durable email queue provides retries, leases, provider idempotency and safe
unknown-delivery handling. It addresses only the owning account's email.
Dashboard and call views expose alert status and a calendar link. Existing
historical bookings are not mass-emailed by migration.

## Calls

Display stored `minutesBilled`, `transportOutcome`, `callSid`, `streamSid` and
destination alongside duration and semantic outcome. Never derive billed minutes
from duration. Search caller number, provider call ID, saved summary and saved
transcript (including streamed transcript turns). Exact status/outcome/service,
spam and owner-local date filters compose before count/pagination. Spam is hidden
initially and accessible explicitly. Detail/deep-link/reload preserves the text
transcript; export as text or use browser print-to-PDF. No audio is recorded.

## Owner actions

Each action binds the authenticated owner, actor and record; optimistic versions
and idempotency keys prevent stale writes and repeated effects. Transactional
history records the action, author, reason, time and status change. An action
never dispatches a caller message. Existing lead dismissal uses the same rules.

- Call back / Book: save an open follow-up with an optional deadline, interpreted
  in the business timezone. Completion and dismissal are explicit; the dashboard
  reports open/overdue work. Call back exposes a user-operated phone link. Book
  opens the existing authenticated booking flow when a saved booking context
  exists; otherwise the saved follow-up directs the owner to Calendar. A task is
  never counted as a confirmed booking.
- Owner review: preserve the captured request and original receipt. The owner
  confirms scope, qualifications, a CAD/USD cent-precision range, price basis
  and tax treatment. Save a separate INSTANT receipt, link it to the review,
  and mark the source lead REVIEWED or source quote SUPERSEDED. Original material
  qualifications remain present. No current price-book repricing is implied.
- Quote progression: INSTANT → SENT → VIEWED → ACCEPTED → INVOICED; ACCEPTED
  may follow SENT directly. Each event requires a note and an explicit assertion
  that it happened outside the app. SENT does not send anything. Acceptance
  requires the exact selected tier where applicable. Final invoice entry is
  owner-only, uses explicit integer cents and the saved quote currency, and
  represents an invoice, not paid revenue. Staff may follow up and record
  sharing/viewing/acceptance, but cannot review prices or record invoices.

## Reports

Today, Monday–Sunday week, calendar month, all-time or inclusive custom dates
(up to 366 days) use the owner's IANA timezone. UTC interval is half-open,
including DST transitions correctly. Ambiguous/nonexistent midnight boundaries
are rejected. Invalid timezone or unsupported/malformed filters fail explicitly.

Activity metrics count call starts, quote creation, booking confirmation, and
recorded invoice events in the selected period. Answered means positive stored
duration and non-spam. Billed minutes are stored billing facts. Time-off is the
sum of non-spam call durations, labelled estimated. Spam counts remain explicit.

After-hours compares call start to **current saved reporting business hours**,
in owner time, with start inclusive/end exclusive. The UI states that basis for
historical calls. Booking availability is a separate concept. Seven explicit
weekday definitions, up to four ordered non-overlapping windows each, prevent
partial schedules from silently declaring closed hours. Unconfigured or corrupt
hours produce **unknown**, not an invented zero. Overnight windows are split
across days; 24:00 is accepted as the end of a day. Hours saves are versioned.

Money is accumulated as integer cents with BigInt and serialized as exact
decimal strings. Currencies, price units and tax treatment are separate groups.
Unselected alternatives form a min/max envelope, never a sum; a selected tier
uses only that tier. Partial scope, unit-only prices, missing currency, malformed
receipts and incompatible alternatives are excluded with counted reasons.
Confirmed job value uses a linked same-tenant quote once per report. A site
visit has no inferred job value; a preferred-time request is not a booking.
Reports never recalculate historical prices from today's price book.

The service funnel is a call cohort: distinct non-spam calls begun in the
period, grouped by recorded service. Saved complete quote → confirmed job →
invoice are cumulative subsequent stages, requiring the preceding stage;
conversion percentages use the preceding stage as denominator (no denominator
means unavailable). Unclassified calls remain visible. Website-only activity
appears in activity/value totals and does not pretend to be a phone call.
Value-by-service uses the same receipt rules for the cohort. This is explained
next to the report. Every join, read and mutation is tenant-bound, including
foreign-link defense; read-only views omit private pricing internals.

Oversized reports fail explicitly above 100,000 records in any required tenant
collection, rather than silently truncating totals. Open follow-ups show the
first 20 sorted by deadline, with the complete count and a link to the records.

## Verification contract

Use synthetic data and fake calendar/email providers only. Source plus service,
actual HTTP and component reproductions precede fixes. Regression coverage must
include tenant/role boundaries, repeated actions, transactional failure, bad
prices, preserved receipts, DST, partial scope, split currencies and browser
flows. The existing explicit tenant route inventory covers every new route.
Cold install/build/strict quote/full-suite and final exact-head hosted CI are
required; no merging or deployment is part of this branch.
