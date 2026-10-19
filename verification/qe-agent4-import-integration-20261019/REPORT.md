# Importer integration — source and local verification

Exact-final hosted verification is pending publication of this merge. Four
local rendered tests are blocked by an absent Chromium executable; no passing
local Chromium result is claimed. Final qualification requires every hosted
gate and every inherited passing name on this merge, not a parent result.

Requested branch: `codex/qe-agent4-import-integration-20261019`.
Ordered parents:

1. `04df35cd8e9ced136ef611cfc2b25f2de64c21bf`
2. `0e3f1da02cffbc16e97355eb182c238ff91dfba0`

The common ancestor is `4a90f73695611bb42bb9fb50d40a16f9e01c3740`.
The automatic merge had no conflicts. The only path changed on both branches
was `.github/workflows/ci.yml`, and both incoming workflow blobs are identical.
No manual production, assertion or historical-evidence resolution was needed.

The inherited-tree manifest checks every one of 4,058 paths against the
appropriate parent blob and index mode. Relative to the combined parent, only
`server/src/websitePriceImport.js` and `server/src/websitePriceExtraction.js`
change among existing files. The importer contributes 119 new inherited files,
including four regression files and its original evidence. New integration
material is confined to this directory. Both v12 engine identifiers, every
combined test, every changed incoming test, all historical evidence, selectors,
workflows and the 45-minute test timeout are preserved.

## Local results

| Check | Actual result |
| --- | --- |
| Importer selection | 1,208 pass; every expected passing name matches |
| Original five condition-extension reproductions | 5 pass |
| Focused combined quote/widget selection | 268 pass, 4 hook failures |
| Owner/widget build | Pass |
| Required suite selection | Same 292 strict files; full grows 362 → 366 |

All four hook failures belong to `qeAgent3ScopePresentation20261018.spec.mjs`.
Playwright reports its expected Chromium executable is missing under
`/root/.cache/ms-playwright/chromium_headless_shell-1234/`. No source assertion
failed in those four cases: their browser setup did not complete. They remain
selected in both strict and full gates. The two actual widget Chromium files
also remain selected in both gates; their local execution is not claimed.
No browser case was skipped, removed or weakened to obtain a local green run.
Their exact-final hosted execution remains mandatory.

Importer tests exercise the existing actual draft/save routes, saved provider
facts and real dispatcher with synthetic transports. All five original notes
retain their complete wording, both pages are fetched, and quantity 3 with
confirmation requires review without an extended amount. Original expectations
and every incoming assertion are unchanged.

## Verification diagnostics retained

The initial parent selector snapshot omitted JavaScript verification helpers.
Restoring all parent JavaScript sources made the unchanged selection assertions
pass; `selection-initial.log` and `selection-snapshot-correction.txt` retain the
initial result and cause. Neither selector nor assertion was changed.

The initial hosted-name parser missed one passing parent log record because
GitHub placed a U+FEFF marker before that chunk's timestamp. Removing log-format
BOMs before timestamp parsing restores all 7,701 records while keeping the same
exact-count assertion. Raw logs and `name-parser-initial.log` are preserved.

The local build replaces tracked generated client assets. Their missing-file
diagnostic is retained, and every tracked build artifact was restored from the
combined parent before final preservation checking. The final tree includes
the accepted parent artifacts, with no generated build changes.

The full inherited whitespace check reports warnings in incoming failed TAP
evidence. These original blobs remain verbatim. No historical failed output is
reformatted to silence whitespace diagnostics.

## Required exact-final hosted qualification

The combined parent's verified run 39302616280 has 6,070 strict, 7,701 full and
12 dedicated browser passes. Four incoming voice files add 334 tests only to
full selection. Expected merged totals: **6,070 strict / 8,035 full / 12 browser**.
`required-passing-names.json` freezes every individual parent passing name and
all 1,208 importer names. `audit-hosted.py` requires exact passing-name multisets,
the strict 292-file receipt, full 366-file selection, no unsuccessful outcomes,
successful cold install/build/Docker/checker and zero production vulnerabilities.
It also verifies exact job-head and remote-ref bindings. A count or name mismatch
must be investigated; changing assertions or selectors is not authorized.

H1 partial-import policy, F2 and A2's separate H2 refresh work are unchanged.
This is integration and verification only. No subagents, main/A2 branch write, deployment, tag or force push is performed
by this task.
