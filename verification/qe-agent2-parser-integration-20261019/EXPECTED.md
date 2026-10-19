# Parser/import integration expectations — before merge and execution

Integration branch: `codex/qe-agent2-integration-checkpoint-20261019`.
First parent: `e50c9f58459a4362537eb5da5dc1cf082fbc3ca8`.
Incoming exact parent: `4a90f73695611bb42bb9fb50d40a16f9e01c3740`.
Common ancestor: `c1817621f6eccb31822979bf994efc4902682d34`.

## Independent acceptance criteria

- Merge both exact histories. Preserve the original recovery merge
  `c58ca997e9cf63739d399939bcdade83e97874d2`, both its ordered parents
  `235eb5c978f847c2d47379ae3cf03b52c1f9104c` and
  `4f6152413a650085a7fe6002dfd077a542f9c0c2`, and recovery
  `9af52ddc13c78beec84e7f090506da8c9b5fd691` as ancestors.
- The incoming and integration histories have no overlapping changed paths.
  All 151 incoming paths must match the incoming tree, and all 428 paths
  specific to the integration must match the first parent. Preserve all
  incoming assertions, failed evidence, source snapshots and historical reports.
- Qualified listed prices must keep their exact saved text and use the
  existing review response without an extended amount. Customer quantity
  confirmation does not establish payment, eligibility, timing or scope facts.
- The five punctuation qualifications from A4's exact fixture must survive
  plain/HTML extraction and actual draft → owner save → voice dispatcher:
  `Available (exclusively) to members`, `Available: to account holders`,
  `Payment (by cash)`, `Payment: by cash`, and
  `Eligible (customers): account holders`.
- Keep structural association, hidden-content exclusion, saved identity,
  unaffected sections and established product-name controls unchanged.
  Ambiguous associations must continue to withhold affected entries.
- Independent unconditional arithmetic controls remain: $10 × 3 = $30.00;
  $0.10 × 3 = $0.30; CAD 0.335 × 3 = CAD 1.01 after rounding 1.005 once;
  Board-on-board, Nail-in and Plug-in at $10 × 3 each remain $30.00.
- No engine arithmetic, prices, taxes, owner approval records or F2 policy
  changes. Both production version literals remain
  `quote-engine-vnext-geometry-20261019-v12`. Genuine frozen receipts and
  dollar assertions remain unchanged; old receipts replay without renewal,
  and current-version approval remains explicit.
- Preserve the existing selectors and 45-minute test timeout exactly.
  The five incoming voice-prefixed regression files are each selected once
  by full and remain excluded from strict. No new selector or test wrapper.

## Required combined verification

Run A4's unchanged 16-file parser/import selection: 874 passing cases,
including 305 original parser, 120 original A4, 36 parenthesized and
116 punctuation cases plus 297 neighbors. Record every passing name.
Run the 525 geometry cases, 94 combined approval/precision/metadata cases,
14 normally selected F16 dependency cases, 41 F18 cases, the original
91-check F18 matrix, five A3/A2 rendered controls, 491 compatibility cases
including historical replay, zero adjustments and separate-line rounding,
and the owner/widget build. These selections overlap.

Before publishing, verify complete required hosted gates on A4 exact head
`4a90f73695611bb42bb9fb50d40a16f9e01c3740`, run `39201472963`.
Then check the remote integration target and publish only that branch with
an expected-head, non-forced update. Verify the fetched merge tree and parents.

The final merge must independently pass cold install, build, dedicated browser,
strict, full, checker, production dependency audit and synthetic Docker startup.
Expected unchanged strict selection: 283 files / 5,882 tests. Expected full
selection: 353 files / 7,513 tests (6,936 base + 577 incoming cases).
These are expectations, not completed gate claims.

Audit each required passing name and its occurrence count in completed logs:
all 874 parser/import names once in full; all 525 geometry and 14 F16 dependency
names once in both; all 41 F18 names once in full and absent from strict;
all four A3 presentation and one A2 editor names once in both. Preserve the
135 zero-adjustment and three separate-line controls. Earlier passing SHAs
cannot qualify a newer head. No main merge, deployment, tag or force push.

PI-00 is paused at inspection and is not part of this integration.
