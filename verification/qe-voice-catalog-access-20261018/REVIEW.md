# Voice catalog discovery repair

Base: `1857b7779b83b70f7753b41b72c3677270cd4ffc`.
Branch: `codex/qe-voice-catalog-access-20261018`.

The new read-only `lookupQuoteCatalog` tool searches and pages public choice
identities from the current saved, approved service definition. It defaults to
16 choices, accepts 1–32, and limits choice payloads to 16,384 UTF-8 bytes. The
projected response must fit 20,000 bytes, below the existing overall voice result
limit. Complete labels are never split. Initial question choices share a 32,768
byte budget and advertise the lookup whenever choices remain. Supported book and
engine limits are unchanged, including the existing 32-custom-plant-size maximum.

Continuation is HMAC-signed and bound to the owner/call context, existing service
handle, service ID, saved-book revision, field, canonical customer input context,
normalized literal search, page size and handle expiry. Lookup rechecks saved
publication and applicability on every request. It inserts no handles, quotes,
leads or other records. Old/foreign/altered continuations fail. Results contain
only public choice keys/labels and continuation metadata, not rates or allocations.
Product recap, scope confirmation, quote calculations and eligibility are unchanged.

## Evidence

- `baseline.tap`: unchanged production, 15 tests; 2 passed and 13 failed. A known
  33rd gate already quoted at 455,000 cents while its initial choices omitted it.
- `neighbors.tap`: 238/238, zero failures/skips/cancellations/TODOs. Includes all
  20 new regressions plus voice declarations, runtime persistence/security,
  plan gating, fence/landscape delivery, historical gate-only choice caps and the
  unchanged tenant-query inventory.
- `build.log`: owner and widget builds passed (1,669 and 1,624 modules).
- `local-chromium-blocked.log`: the downloaded Chromium executable exits with
  SIGTRAP before launching in this workspace. This is not browser pass evidence.
- Full local strict/full suites and hosted Chromium/CI are required before final
  handoff. Their exact commit, results and any remaining limitations are reported
  directly in the final chat; this file makes no advance CI-success claim.

New cases cover 31/32/33/65 saved gates, multi-page traversal, later-choice searches,
no matches, duplicate descriptions with distinct widths/keys, long Unicode labels,
32 saved plant sizes across two pages, query-only SQLite, runtime restart, changed
books, expiry, cross-owner/call/service authority, changed input/search/page size,
tampering, fence-type applicability, schema/privacy bounds and compiled guidance.
Two fake-provider production call sessions discover, confirm and save actual quotes
for gate 33 (455,000 cents) and plant 32 (15,000 cents), with zero provider writes.

## Investigated intermediate failures

- A fixture exceeding the existing saved-book presentation limit was corrected
  before baseline; the production guard was not changed.
- Neighbor checks caught line movement in the tenant-query source inventory.
  New code was placed after existing query sites, preserving reviewed locations;
  no inventory or guard change was made.
- A too-small initial per-field byte budget changed the established three-long-
  gate response. The shared initial question budget now preserves that response;
  bounded lookup pages still carry complete labels.
- Existing voice tool-inventory assertions were extended for the new read-only
  tool and its valid arguments. No security or monetary assertion was removed.
- The new cross-service test initially copied server-owned receipts, then used
  ambiguous fencing names. Its saved synthetic services now have fresh server
  approvals and distinct names; existing creation and matching rules are intact.

Only necessary voice production files, the owned new test/evidence directory and
two existing voice-specific tool-list expectations changed. No specs, guide,
calculators, price books, engine versions, dependencies or workflows changed.
No subagents, live calls/messages, merges, tags or deployment were used.

## Full-gate follow-up

The first complete-suite attempt exposed four failures in the unchanged gate-only
choice-cap controls: the repair had broadened long-label handling for non-gate
count fields. That unintended change is restored to the existing gate-only
exception. A new saved-book regression proves the maximum supported 160-character
Unicode plant name remains complete and quotes at 15,000 cents.

Two existing suite-policy tests reject any selected filename containing `voice`.
The original requested `qeVoiceCatalogAccess20261018.spec.mjs` name was selected
transitively and failed those guards. An initially authorized filename exception
was superseded by the owner's explicit direction to use
`test/voiceCatalogAccess20261018.spec.mjs`, preserve every regression, and leave
selectors and gate assertions unchanged. The exception is reverted; both gate
assertions are byte-identical to the base. The new filename uses the existing
selector policy: included in the full suite, excluded from the strict quote suite.
The rename preserves all 20 regressions byte-for-byte. Archived evidence keeps
its original filenames. Hosted full-suite execution is required; exact results
and commit are reported in chat, not assumed here.

The initial local strict run was interrupted after identifying the label regression;
it is diagnostic evidence only, not a completed gate. Hosted strict verification
and a complete local full-suite run use the final corrected commit.
