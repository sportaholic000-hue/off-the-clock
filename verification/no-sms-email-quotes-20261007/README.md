# Owner ruling implementation — 2026-10-07

Branch: `feat/no-sms-email-quotes`. Parent: `4db13a2945193762bbc4b85f9ab616a00e1dd067` on `codex/audit-small-repairs-20261007`.

The owner's October 7 ruling overrides historical communications instructions in `specs/`. Those files are unchanged. No deployment or main merge is part of this work. All exercised providers are synthetic.

## Behavior

- No receptionist SMS tool, SMS sender, status callback route, templates, delivery worker, or SMS UI remains. Historical database records are retained for retention/export compatibility; pending historical work is cancelled during migration and has no sender.
- Bookings are confirmed verbally on the call. Owner appointments remain in the dashboard and produce durable owner email alerts. Calendar inserts and changes suppress updates, caller attendees, and default/explicit reminders.
- A caller may request a written quote. `prepareQuoteEmail` returns a literal and spelled email read-back plus a tenant/call/caller-bound confirmation handle. A correction invalidates the older handle. `sendQuoteEmail` requires affirmative confirmation of that current address.
- `getQuote` freezes one complete customer-safe narration, with amounts, scope, conditions, exclusions, and disclosures. The prompt requires reading that script exactly. The queued email uses those same saved bytes, not a recalculation. Sender display name is the business name; reply-to is the owner's email.
- The quote page uses a random 256-bit capability, a tenant-bound hash lookup, a 30-day expiry, escaped content, no-store/no-referrer headers, and restrictive CSP. It exposes only the business name and frozen quote narration.
- A transactional outbox, unique tenant/request key, send lease, frozen provider payload and stable Resend idempotency key protect retries. Ambiguous sends replay only within 23 hours of the first attempt (inside Resend's documented 24-hour window), at most eight attempts. Beyond that window they require review and do not resend. Accepted emails use bounded receipt reads; only bound delivery receipts mark DELIVERED. Calls, leads and quotes show delivery status and the confirmed recipient.
- Retention removes the new email recipient, narration and delivery data for the correct tenant.

## Verification contract

The focused tests exercise removal of all four former SMS templates, disabled legacy outbox work, all 20 prompt flows, wrong-address correction, required confirmation, exact narration/email equality, partial quotes and long disclosures, real voice dispatch, concurrent claims, acceptance with a lost response, restart/SQLite reopen, retry limits, expired replay windows, permanent rejection, receipt binding, delivery visibility in real HTTP/rendered/browser views, public-link isolation/escaping/expiry, owner-only booking emails, calendar notification suppression and retention isolation.

Required final gates: cold `npm ci`, `npm run build`, `npm test`, and `npm run test:quote`, with zero failures/skips on hosted CI. The branch is explicitly included in the existing test-only CI workflow. No checks are skipped or weakened; retired SMS success tests are replaced by removal and quote-email coverage.

Provider contract references:
- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://resend.com/docs/api-reference/emails/send-email
- https://resend.com/docs/api-reference/emails/retrieve-email
