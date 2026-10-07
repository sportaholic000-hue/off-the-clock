# Pre-execution repair expectations

Starting commit: b749dd6f76a6625314f87e4e8bf11fc3b3a0dbb3.
Audit evidence read at exact commit 1de55bebfd6f916404df7493a8b3d7dbd3ba38f2 without merge. Application source equality checked before execution.

| Finding | Baseline experiment | Required repaired outcome |
|---|---|---|
| D01 | E01, E20 | Persist supplied notes and description; recover in owner/staff routes and rendered cards. |
| D03 | E05 | Reason/summary persist on call and relevant inquiry and render; no notification-delivered claim. |
| D09 | E36 | Known callback phone can save nameless inquiry; supplied invalid fields still fail. |
| D10 | E06 | Every schema-valid reason works without summary; reason is preserved immediately. |
| D11 | E04 | Contact corrections target the same inquiry; explicit distinct inquiries remain separate. |
| D12 | E03 | Exact and new-event retries after dismissal/restart preserve owner disposition. |
| D13 | E03 | Omitted email/address does not clear known customer/inquiry data; corrections retain provenance. |
| D17 | E12 | Voice email remains in lead CSV and a newly produced lead webhook; upgrade replaces old producer trigger. |
| D18 | E07, E12 | Standalone quote review atomically creates/binds actionable lead/contact; exports and webhook contain contact. |
| D22 | E28 | Calls/Leads show corrected preferred-time customer/location with source; historical submission stays unchanged. |
| D23 | E29 | Owner and same-owner staff see allowlisted stored instant contact/location; no private evidence to staff. |
| D29 | E40 | Built /calls and /calls?record routes return owner SPA; actual navigation/refresh succeeds. |
| D30 | E41 | Open dashboard receives new saved calls within bounded cadence, with one request/timer, cleanup, failure/stale indication and session isolation. |

Additional regression expectations, written before their runs:
- Exact duplicate capture and changed-payload reuse of the same dispatcher ID respectively replay and conflict. Parallel handlers do not create duplicate inquiry identities.
- Database write failure leaves no partial inquiry/urgency/logged request and no successful acknowledgement; retry after fault/restart recovers once.
- Wrong tenant/call/type/expired/deleted handles and wrong-tenant owner/staff route requests never expose or mutate the other tenant.
- Explicitly different service inquiries on one call and different calls stay distinct. Updating one lead by opaque handle never modifies siblings. Contact-only correction does not change status or price receipts.
- Correction history is append-only on a logical change; exact/new-event identical retries do not append duplicate changes. Historical quote/submission/booking receipts remain byte-identical.
- Urgency recorded before capture creates actionable callback information, survives later capture and restart, and complaint classification remains visible. A flag acknowledges saved state only.
- Contact projections/CSV/webhooks allow only contact and bounded request facts, never raw rates/costs/private outcome/credentials. Current and upgraded SQLite producer installs use the repaired mapping.
- Browser tests use actual routes/components and synthetic stored data for contact, navigation and new feed arrival; stale results are dropped on tenant/session change and unmount.
- Cold npm ci/build/test:quote/npm test are run unmodified; environment/browser failures are distinguished and hosted results verified at the uploaded source tree. Existing quote outcomes and amounts stay unchanged.
# Additional correction/replay expectations

Before execution: a review logged after capture with exactly the same request description must bind that inquiry. A new provider event retry of an old review must retain subsequent corrected description and dismissed disposition, without rewriting the historical quote-request description or an already-attempted webhook snapshot. Different descriptions without an explicit inquiry handle must remain separate requests.

Before execution: a preferred-time address replaces the current follow-up location as a complete address; incompatible address aliases from the original request must not appear alongside it. A later voice correction must take precedence for the contact fields it explicitly corrects, with both the preferred request and capture history retained as provenance.

After-fix historical experiment rerun: only the twelve assigned capture/contact/navigation experiments are selected. E05 also requires unimplemented notification delivery, and E28 also requires notification delivery and an older-request inbox: those combined original expectations must remain mismatches, with the assigned urgency/contact clauses verified separately. Mounted E41 waits 6.5 seconds for the documented five-second feed cadence; the baseline remains unchanged at its original one-second observation.

Projection compatibility expectation, before execution: existing web timing strings (for example `contact_requested`) remain visible. Adding a safe projection for structured voice urgency must not erase legacy/web timing. Structured urgency must expose only reason, summary, timestamp and source, never injected private fields.
