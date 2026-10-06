# Caller history and follow-up repairs

Base verified: eaadeca0856f1bd7fcade8685711a19aefd786d0.
Branch: fix/caller-history-followup-20261006. No subagents, merge, deployment or live data.

All five assigned defects reproduced in source and execution before changes.
Prewritten expected behavior and stored dollar amounts: EXPECTED.md.
Baseline core tests: 0/4; signed-call summary: null; corrected web baseline: no customer.
The first web fixture included a prohibited pricing-time name; that fixture error
is retained in baseline-web-live.tap and corrected in baseline-web.tap before repair.

- D14: customerHistoryService filters caller identity inside tenant-bound SQL before
  LIMIT 5. Legacy duplicate customer IDs retain booking visibility; contradictory
  or foreign customer links are excluded. No unrelated tenant-wide LIMIT remains.
- D15: runtime and dispatcher agree on greetingName/address and bounded, allowlisted
  open leads, saved quote ranges/status and quote request descriptions. Values come
  from stored receipts; no recalculation, internal rates or tenant identifiers.
- D16: shared customerIdentityService resolves exact normalized international phone
  within the producer's IMMEDIATE transaction. Handles no longer define customers.
  Web/voice submissions link the durable customer; secret rotation, concurrent
  processes and retries reuse it. Names/emails never deduplicate. Public web contact
  does not authenticate anyone or overwrite an established customer's information.
  Numbers with no explicit country prefix remain separate, rather than guessing.
  Legacy duplicates/receipt IDs remain intact; lookup supports their phone binding.
- D21: REQUESTED preferences remain in the calendar request list regardless of date;
  resolved historical requests still follow the selected date range. No request is
  auto-booked, resolved or deleted because its preferred date passed.
- D24: production call completion atomically stores an extractive summary, semantic
  outcome from saved records, and separate transportOutcome. Summary uses attributed
  verbatim transcript excerpts, skips unfinished/system/tool turns, and makes no
  payment, booking or callback promises. Empty transcripts produce no invented text.
  Existing owner Calls/feed displays this saved text. No generative/provider call.

Migration: one additive nullable calls.transportOutcome column, installed on fresh
and existing stores by the normal migration path. Repeated migration preserves
transcripts. No production migration/backfill performed; lost historical transcript
content is not reconstructed. Customer identity is resolved lazily without deleting
legacy rows or rewriting old quote receipts. Atomic failures roll back; retry recovers.

Verification checkpoint: 60/60 focused checks, zero failures/skips. Includes 23 new
regressions, real signed HTTP/WebSocket call, actual authenticated owner/staff routes,
owner rendering, separate-process concurrency/restart, foreign links and rollback.
Earlier focused failure exposed Node SQLite isTransaction vs better-sqlite3
inTransaction and was fixed in source; the original regression expectation remains.
A repeated test fixture CallSid collision was corrected without changing product expectations.

Cold installation/build/full/strict and hosted exact-revision results are pending
at this checkpoint. This report will be updated after completion. No broader launch
readiness or unrelated lifecycle/billing/delivery repair is claimed.
