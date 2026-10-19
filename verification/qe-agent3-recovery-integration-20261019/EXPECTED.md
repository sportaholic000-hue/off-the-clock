# Recovery integration — expectations recorded before execution

New branch: `codex/qe-agent3-recovery-integration-20261019`.
The combined commit must retain exactly these ordered parents:

1. A4: `03ebb1a9acd0c36381ef166c7c9e78ca2e551ca3`
2. A3: `7c7542a930c6e3d36847dfe3c3143ac45960a465`

No publication until run `39319523284` is completed/success on the exact A4
parent. Do not cancel that run or change its branch. The automatic merge has
no overlapping changed paths. Preserve every inherited blob and mode, including
all original receipts, failed evidence and corrected classifications. Only this
new integration evidence directory may contain additional changes.

Freeze the existing passing-name inventory plus the 11 recovery leaf names and
their parent record before running verification. Expected gates: **6,176 strict
tests in 295 selected files; 8,141 full tests in 369 files; 12 dedicated browser
tests**, with zero failures, skips, cancellations or TODOs. Verify all 92 A1
browser cases (88 main + four independent controls) and 11 recovery cases
individually in each suite, and all 1,208 importer names individually in full.
Preserve duplicate-name occurrence counts and group boundaries. Counts overlap.

Existing independent price/scope expectations remain unchanged in each parent's
EXPECTED.md and fixtures. Recovery midpoints remain $160 original mowing, $270
corrected mowing, $215 revised-rate mowing and $400 cleanup. Internal revised
range 19,350–23,650 cents displays as $193–$237 under the preserved specification.
No price, approval, formula, source, test or policy repair is authorized here.

Preserve selectors, all workflow bytes (including the 45-minute timeout), v12,
dependencies and specifications. Do not incorporate newer A1 widget-entry or A2
voice-refresh work. Work personally; no main merge or deployment.

Local verification: unchanged selectors, exact inherited blobs/modes, build,
1,208 importer names, focused existing quote/recovery checks and Chromium probe.
Local browser availability failure is not a pass; hosted CI must exercise the
real Chromium cases on the exact published combined commit. Final CI evidence
is collected outside the checkout so recording it does not change the tested
merge or its ordered parents. The final handoff links the exact run and SHA.
